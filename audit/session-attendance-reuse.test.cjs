"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const roster = ["a", "b", "c", "d", "new"].map((id) => ({ id }));
  const source = {
    id: "source",
    schoolId: "school",
    classId: "class",
    lessonId: "other-lesson",
    date: "2026-11-05",
    period: 0,
    roster: roster.filter((s) => s.id !== "new"),
    attendance: {
      a: "absent",
      b: "late:10",
      c: "leave",
      d: "present",
      new: "absent",
    },
    scores: [{ value: 20 }],
  };
  const target = {
    ...source,
    id: "target",
    lessonId: "lesson",
    period: 2,
    roster,
    attendance: { d: "leave" },
    scores: [],
  };
  const writes = [],
    modals = [],
    refreshes = [];
  const c = vm.createContext({
    db: { sessions: [source, target] },
    workspace: { id: "term" },
    connection: {},
    currentSessionId: "target",
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    assertEntityWritable() {},
    captureSessionControlFocus: () => () => {},
    assertSessionEditable: () => {
      c.assertEntityWritable();
      return "isolated-edit-lease";
    },
    isSessionEditable: () => true,
    findClass: () => ({ students: roster }),
    getSessionById: (id) => c.db.sessions.find((s) => s.id === id),
    saveDBV24: async (scope) => writes.push(scope),
    openSessionModal: (session) => modals.push(session.id),
    refreshSessionAttendanceRows: (session) => refreshes.push(session),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/actions.js"),
      "utf8",
    ),
    c,
  );
  return { c, source, target, writes, modals, refreshes };
}
test("reuse fills only shared unset students, treats earlier lateness as present and never copies scores", async () => {
  const f = fixture(),
    originalSource = JSON.stringify(f.source);
  assert.equal(await f.c.copyPreviousAttendanceV24("target"), true);
  assert.deepEqual(f.target.attendance, {
    a: "absent",
    b: "present",
    c: "leave",
    d: "leave",
  });
  assert.deepEqual(f.target.scores, []);
  assert.equal(JSON.stringify(f.source), originalSource);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].sessionId, "target");
  assert.deepEqual(f.modals, []);
  assert.deepEqual(f.refreshes, [f.target]);
  assert.equal(await f.c.copyPreviousAttendanceV24("target"), false);
  assert.equal(f.writes.length, 1);
  assert.equal(f.refreshes.length, 1);
});
test("reuse selects nearest earlier recorded bell, not later, empty or unrelated sessions", () => {
  const f = fixture();
  for (const change of [
    { schoolId: "other" },
    { classId: "other" },
    { date: "2026-11-04" },
    { period: 3 },
    { attendance: {} },
  ]) {
    const ignored = {
      ...f.source,
      ...change,
      id: "ignored",
      period: change.period ?? 1,
    };
    f.c.db.sessions.push(ignored);
    assert.equal(f.c.previousSessionAttendanceV24(f.target).id, "source");
    f.c.db.sessions.pop();
  }
  const near = {
    ...f.source,
    id: "near",
    period: 1,
    attendance: { a: "present" },
  };
  f.c.db.sessions.push(near);
  assert.equal(f.c.previousSessionAttendanceV24(f.target).id, "near");
});
test("reuse rejects stale targets and missing sources without writing", async () => {
  const f = fixture();
  await assert.rejects(f.c.copyPreviousAttendanceV24("source"), /جلسهٔ قبلی/);
  f.target.period = 0;
  assert.equal(f.c.previousSessionAttendanceV24(f.target), null);
  await assert.rejects(f.c.copyPreviousAttendanceV24("target"), /وجود ندارد/);
  assert.equal(f.writes.length, 0);
});
test("reuse respects write locks and never patches a different session after an async save", async () => {
  const f = fixture();
  f.c.assertEntityWritable = () => {
    throw Error("locked");
  };
  await assert.rejects(f.c.copyPreviousAttendanceV24("target"), /locked/);
  assert.deepEqual(f.target.attendance, { d: "leave" });
  f.c.assertEntityWritable = () => {};
  f.c.saveDBV24 = async () => {
    f.c.currentSessionId = "source";
  };
  await f.c.copyPreviousAttendanceV24("target");
  assert.deepEqual(f.modals, []);
  assert.deepEqual(f.refreshes, []);
});

test("a failed attendance reuse never patches a successful-looking session", async () => {
  const f = fixture();
  f.c.saveDBV24 = async (scope) => {
    f.writes.push(scope);
    throw Error("synthetic quota failure");
  };
  await assert.rejects(
    f.c.copyPreviousAttendanceV24("target"),
    /synthetic quota failure/,
  );
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.modals, []);
  assert.deepEqual(f.refreshes, []);
});

for (const change of ["database", "installation", "connection", "edit-lease"]) {
  test(`late attendance reuse does not patch a replaced ${change} context`, async () => {
    const f = fixture();
    let activeToken = {};
    f.c.installationToken = "original-installation";
    f.c.assertSessionEditable = () => activeToken;
    f.c.isSessionEditable = (_id, token) => token === activeToken;
    f.c.saveDBV24 = async (scope) => {
      f.writes.push(scope);
      if (change === "database") f.c.db = { ...f.c.db };
      if (change === "installation") f.c.installationToken = "replacement";
      if (change === "connection") f.c.connection = {};
      if (change === "edit-lease") activeToken = {};
    };
    assert.equal(await f.c.copyPreviousAttendanceV24("target"), true);
    assert.equal(f.writes.length, 1);
    assert.deepEqual(f.modals, []);
    assert.deepEqual(f.refreshes, []);
  });
}

test("normal catalog revision replacement still permits a local attendance reuse refresh", async () => {
  const f = fixture(),
    originalWorkspace = f.c.workspace;
  f.c.saveDBV24 = async (scope) => {
    f.writes.push(scope);
    f.c.workspace = { ...f.c.workspace, revision: 2 };
  };
  assert.equal(await f.c.copyPreviousAttendanceV24("target"), true);
  assert.notEqual(f.c.workspace, originalWorkspace);
  assert.deepEqual(f.modals, []);
  assert.deepEqual(f.refreshes, [f.target]);
});
