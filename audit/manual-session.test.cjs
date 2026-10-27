"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const writes = [],
    modals = [];
  const cls = { students: [{ id: "student", name: "Student" }] };
  const c = vm.createContext({
    workspace: { id: "first" },
    connection: {},
    state: { schoolId: "school", classId: "class", lessonId: "lesson" },
    currentSessionId: null,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    db: { sessions: [] },
    assertEntityWritable() {},
    asciiDigits: (value) => value,
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    getClassObj: () => cls,
    getLessonObj: () => ({ id: "lesson" }),
    uid: () => "new-session",
    snapshotRoster: (value) => structuredClone(value.students),
    getSessionById: (id) => c.db.sessions.find((session) => session.id === id),
    saveDBV24: async (scope) => writes.push(scope),
    confirm: () => true,
    openSessionModal: (session) => modals.push(session),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/actions.js"),
      "utf8",
    ),
    c,
  );
  const event = (period = "1", date = "2026-10-27") => ({
    preventDefault() {},
    target: { period: { value: period }, date: { value: date } },
  });
  return { c, cls, writes, modals, event };
}
for (const period of ["1.5", "1x", "0", "13", ""]) {
  test(`manual session rejects invalid period before mutation: ${period}`, async () => {
    const f = fixture();
    await assert.rejects(
      f.c.addManualSessionV24(f.event(period), "lesson"),
      /شماره زنگ/,
    );
    assert.equal(f.c.db.sessions.length + f.writes.length, 0);
  });
}
test("manual session rejects an impossible date", async () => {
  const f = fixture();
  await assert.rejects(
    f.c.addManualSessionV24(f.event("1", "2026-02-30"), "lesson"),
    /تاریخ معتبر/,
  );
  assert.equal(f.c.db.sessions.length, 0);
});
test("manual session rejects a missing lesson", async () => {
  const f = fixture();
  f.c.getLessonObj = () => null;
  await assert.rejects(
    f.c.addManualSessionV24(f.event(), "lesson"),
    /دیگر وجود ندارد/,
  );
  assert.equal(f.c.db.sessions.length, 0);
});
test("manual session conflict opens existing record without creating a duplicate", async () => {
  const f = fixture();
  const existing = {
    id: "existing",
    classId: "class",
    date: "2026-10-27",
    period: 0,
    lessonId: "other",
  };
  f.c.db.sessions.push(existing);
  assert.equal(await f.c.addManualSessionV24(f.event(), "lesson"), false);
  assert.equal(f.c.db.sessions.length, 1);
  assert.equal(f.modals[0], existing);
  assert.equal(f.writes.length, 0);
});
test("manual session snapshots the roster and saves its own id", async () => {
  const f = fixture();
  assert.equal(await f.c.addManualSessionV24(f.event("12"), "lesson"), true);
  f.cls.students[0].name = "Changed later";
  assert.equal(f.c.db.sessions[0].roster[0].name, "Student");
  assert.equal(f.c.db.sessions[0].period, 11);
  assert.equal(f.writes[0].sessionId, "new-session");
});
for (const kind of ["connection", "view"]) {
  test(`manual session completion preserves changed ${kind}`, async () => {
    const f = fixture();
    f.c.saveDBV24 = async () => {
      if (kind === "connection") f.c.connection = {};
      else f.c.state.lessonId = "other";
    };
    await f.c.addManualSessionV24(f.event(), "lesson");
    assert.equal(f.modals.length, 0);
  });
}
test("manual session serializes duplicate submissions", async () => {
  const f = fixture();
  let release;
  f.c.flushDrafts = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const first = f.c.addManualSessionV24(f.event(), "lesson");
  assert.equal(await f.c.addManualSessionV24(f.event(), "lesson"), false);
  release();
  await first;
  assert.equal(f.c.db.sessions.length, 1);
});
