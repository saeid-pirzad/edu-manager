"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture({ editable = true } = {}) {
  const session = {
      id: "session",
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
      date: "2026-11-05",
      period: 0,
      poudmanId: null,
      unitId: null,
      attendance: {},
      scores: [],
      roster: [],
    },
    classroom = {
      id: "class",
      name: "Synthetic class",
      students: [
        { id: "first", name: "First student", code: "1" },
        { id: "second", name: "Second student", recovered: true },
      ],
      archivedStudents: [{ id: "archived", name: "Archived student" }],
      lessons: [{ id: "lesson" }],
    },
    writes = [],
    modals = [],
    confirmations = [],
    effects = [],
    dom = { root: null, hidden: true };
  const makeRoot = (id) => {
    const nodes = Object.fromEntries(
      ["title", "description", "label"].map((key) => [
        key,
        { textContent: "" },
      ]),
    );
    const root = {
      isConnected: true,
      dataset: { sessionId: id },
      notice: "",
      contains: (control) =>
        [root.editButton, root.recoveryButton].includes(control),
      querySelector(selector) {
        if (selector === ".session-context")
          return {
            insertAdjacentHTML: (_position, html) => {
              root.notice = html;
            },
          };
        if (selector === "[data-session-edit-control]") return root.editButton;
        if (selector === "[data-session-roster-recovery]")
          return root.recoveryButton;
        return (
          nodes[
            selector.match(/data-session-edit-(title|description|label)/)?.[1]
          ] || null
        );
      },
      querySelectorAll: () => [],
    };
    for (const key of ["editButton", "recoveryButton"])
      root[key] = {
        isConnected: true,
        dataset: { key: id },
        setAttribute() {},
      };
    return root;
  };
  const c = vm.createContext({
    structuredClone,
    workspace: { id: "first", year: "1405-1406", closed: false, revision: 1 },
    connection: {},
    installationToken: "installation",
    currentSessionId: null,
    db: {
      settings: {},
      schools: [{ id: "school", classes: [classroom] }],
      sessions: [session],
    },
    state: {
      view: "lesson",
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
    },
    busy: 0,
    ready: true,
    blocked: false,
    fileMode: false,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    writer: Promise.resolve(),
    writeFailureGeneration: 0,
    captureSaveFeedback: () => null,
    paintStatus() {},
    checkScope() {},
    refreshAcademicYearWarnings() {},
    collectRecords: (value) => value,
    scheduleSingleFile() {},
    setStatus() {},
    render: () => effects.push("render"),
    assertEntityWritable() {
      if (
        c.workspace.closed ||
        c.blocked ||
        c.fileMode ||
        !c.ready ||
        c.periodLoading ||
        c.resetBusy ||
        c.connectionRetired
      )
        throw Error("workspace readonly");
    },
    document: {
      querySelector: () => dom.root,
      getElementById: () => ({ classList: { contains: () => dom.hidden } }),
    },
    old: {
      openSessionModal(selected) {
        c.currentSessionId = selected.id;
        if (dom.root) dom.root.isConnected = false;
        dom.root = makeRoot(selected.id);
        dom.hidden = false;
        return true;
      },
    },
    esc: (value) => String(value).replace(/"/g, "&quot;"),
    EduIcons: { html: () => "<svg></svg>" },
    setControlLock(control, _reason, locked) {
      control.disabled = locked;
    },
    lockControls: () => c.syncSessionEditNotice(),
    syncControlLocks: () => c.syncSessionEditNotice(),
    getSessionById: (id) => c.db.sessions.find((row) => row.id === id),
    getClassObj: (schoolId, classId) =>
      c.db.schools
        .find((school) => school.id === schoolId)
        ?.classes.find((item) => item.id === classId),
    findClass: (classId) =>
      c.db.schools
        .flatMap((school) => school.classes)
        .find((item) => item.id === classId),
    flushDrafts: async () => {},
    confirm(message) {
      confirmations.push(message);
      return true;
    },
    saveDBV24: async (scope) => writes.push(scope),
    openSessionModal(selected) {
      modals.push(selected);
      return c.openSessionModalV24(selected);
    },
  });
  for (const name of [
    "calendar",
    "academic-year",
    "data-boundary",
    "session-slots",
    "attendance-reminders",
  ])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/domain", name + ".js"),
        "utf8",
      ),
      c,
    );
  for (const name of [
    "legacy/students/roster.js",
    "workspace/sessions/edit-access.js",
    "workspace/sessions/actions.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
      c,
    );
  c.openSessionModalV24(session);
  if (editable) c.toggleSessionEditing(dom.root.editButton);
  return {
    c,
    session,
    classroom,
    writes,
    modals,
    confirmations,
    effects,
    dom,
    run: () => c.restoreEmptySessionRosterV24(dom.root.recoveryButton),
  };
}

test("empty-roster eligibility identifies only a content-free session with current active students", () => {
  const f = fixture(),
    before = JSON.stringify(f.c.db);
  assert.equal(f.c.emptySessionRosterClass(f.session), f.classroom);
  assert.equal(JSON.stringify(f.c.db), before);
  assert.equal(f.writes.length, 0);
});
for (const [name, change] of [
  [
    "missing frozen roster",
    (f) => {
      delete f.session.roster;
    },
  ],
  [
    "nonempty historical roster",
    (f) => {
      f.session.roster = [{ id: "archived", name: "Historical name" }];
    },
  ],
  [
    "registered attendance",
    (f) => {
      f.session.attendance.first = "present";
    },
  ],
  [
    "unknown attendance key",
    (f) => {
      f.session.attendance.orphan = "";
    },
  ],
  [
    "registered activity",
    (f) => {
      f.session.scores.push({ studentId: "first", type: "positive", value: 0 });
    },
  ],
  [
    "module selection",
    (f) => {
      f.session.poudmanId = "pod";
    },
  ],
  [
    "unit selection",
    (f) => {
      f.session.unitId = "unit";
    },
  ],
  [
    "unknown content field",
    (f) => {
      f.session.note = "";
    },
  ],
  [
    "archived students only",
    (f) => {
      f.classroom.students = [];
    },
  ],
  [
    "missing owning class",
    (f) => {
      f.session.classId = "missing";
    },
  ],
  [
    "wrong owning school",
    (f) => {
      f.session.schoolId = "missing";
    },
  ],
])
  test(`roster recovery never infers membership for ${name}`, async () => {
    const f = fixture();
    change(f);
    const before = JSON.stringify(f.c.db);
    assert.equal(!!f.c.emptySessionRosterClass(f.session), false);
    await assert.rejects(f.run());
    assert.equal(JSON.stringify(f.c.db), before);
    assert.equal(f.writes.length, 0);
  });
test("viewing an empty session does not recover or write its roster and cannot authorize recovery", async () => {
  const f = fixture({ editable: false }),
    before = JSON.stringify(f.c.db);
  assert.equal(f.c.isSessionEditable("session"), false);
  assert.equal(f.session.roster.length, 0);
  await assert.rejects(f.run(), /فقط برای مشاهده/);
  assert.equal(JSON.stringify(f.c.db), before);
  assert.equal(f.confirmations.length, 0);
  assert.equal(f.writes.length, 0);
});
test("cancelled explicit roster recovery changes neither session nor current class", async () => {
  const f = fixture(),
    before = JSON.stringify(f.c.db);
  f.c.confirm = () => false;
  assert.equal(await f.run(), false);
  assert.equal(JSON.stringify(f.c.db), before);
  assert.equal(f.writes.length, 0);
  assert.equal(f.modals.length, 0);
});
test("explicit roster recovery snapshots only current active students and saves only its own session", async () => {
  const f = fixture();
  assert.equal(await f.run(), true);
  assert.equal(f.confirmations.length, 1);
  assert.deepEqual(plain(f.session.roster), [
    { id: "first", name: "First student", code: "1" },
    { id: "second", name: "Second student", code: "", recovered: true },
  ]);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].sessionId, "session");
  assert.equal(f.modals.length, 1);
  assert.equal(f.c.isSessionEditable("session"), true);
  f.classroom.students[0].name = "Later name";
  assert.equal(f.session.roster[0].name, "First student");
  assert.deepEqual(plain(f.session.attendance), {});
  assert.deepEqual(plain(f.session.scores), []);
});
for (const state of [
  "closed",
  "blocked",
  "fileMode",
  "ready",
  "periodLoading",
  "resetBusy",
  "connectionRetired",
])
  test(`roster recovery respects workspace write restrictions: ${state}`, async () => {
    const f = fixture(),
      before = JSON.stringify(f.c.db);
    if (state === "closed") f.c.workspace.closed = true;
    else f.c[state] = state !== "ready";
    await assert.rejects(f.run());
    assert.equal(JSON.stringify(f.c.db), before);
    assert.equal(f.writes.length, 0);
    assert.equal(f.confirmations.length, 0);
  });
for (const kind of ["detached", "foreign", "wrong-session"])
  test(`roster recovery rejects a ${kind} action control`, async () => {
    const f = fixture(),
      before = JSON.stringify(f.c.db);
    let control = f.dom.root.recoveryButton;
    if (kind === "detached") control.isConnected = false;
    else if (kind === "foreign")
      control = { isConnected: true, dataset: { key: "session" } };
    else control.dataset.key = "other";
    await assert.rejects(f.c.restoreEmptySessionRosterV24(control));
    assert.equal(JSON.stringify(f.c.db), before);
    assert.equal(f.writes.length, 0);
  });
test("duplicate roster recovery clicks cannot repeat confirmation or enqueue a second write", async () => {
  const f = fixture();
  let release;
  f.c.flushDrafts = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const first = f.run();
  assert.equal(await f.run(), false);
  assert.equal(f.confirmations.length, 1);
  release();
  assert.equal(await first, true);
  assert.equal(f.writes.length, 1);
});
for (const phase of ["confirmation", "flush"])
  for (const kind of [
    "student-name",
    "student-add",
    "student-removal",
    "class-replacement",
    "recorded-content",
  ])
    test(`roster recovery refuses changed ${kind} during ${phase}`, async () => {
      const f = fixture();
      const change = () => {
        if (kind === "student-name")
          f.classroom.students[0].name = "Changed during request";
        else if (kind === "student-add")
          f.classroom.students.push({ id: "late", name: "Later addition" });
        else if (kind === "student-removal") f.classroom.students = [];
        else if (kind === "class-replacement")
          f.c.db.schools[0].classes[0] = structuredClone(f.classroom);
        else f.session.attendance.first = "present";
      };
      if (phase === "confirmation")
        f.c.confirm = () => {
          change();
          return true;
        };
      else
        f.c.flushDrafts = async () => {
          change();
        };
      await assert.rejects(f.run());
      assert.equal(f.session.roster.length, 0);
      assert.equal(f.writes.length, 0);
      assert.equal(f.modals.length, 0);
    });
for (const kind of [
  "connection",
  "installation",
  "workspace",
  "session",
  "session-replacement",
  "data-replacement",
  "relock",
])
  test(`roster recovery refuses stale ${kind} context after pending drafts`, async () => {
    const f = fixture();
    f.c.flushDrafts = async () => {
      if (kind === "connection") f.c.connection = {};
      else if (kind === "installation") f.c.installationToken = "other";
      else if (kind === "workspace")
        f.c.workspace = { ...f.c.workspace, id: "second" };
      else if (kind === "session") f.c.currentSessionId = "other";
      else if (kind === "session-replacement")
        f.c.db.sessions[0] = structuredClone(f.session);
      else if (kind === "data-replacement") f.c.db = structuredClone(f.c.db);
      else {
        f.c.toggleSessionEditing(f.dom.root.editButton);
        f.c.toggleSessionEditing(f.dom.root.editButton);
      }
    };
    await assert.rejects(f.run());
    assert.equal(f.session.roster.length, 0);
    assert.equal(f.writes.length, 0);
    assert.equal(f.modals.length, 0);
  });
test("roster recovery completion never reopens a dialog on a replacement connection", async () => {
  const f = fixture();
  f.c.saveDBV24 = async (scope) => {
    f.writes.push(scope);
    f.c.connection = {};
  };
  assert.equal(await f.run(), true);
  assert.equal(f.writes.length, 1);
  assert.equal(f.session.roster.length, 2);
  assert.equal(f.modals.length, 0);
});
test("failed roster persistence uses real save rollback without retaining a partial repaired roster", async () => {
  const f = fixture(),
    durable = structuredClone(f.c.db);
  f.c.readWorkspaceSnapshot = async () => ({
    period: { ...f.c.workspace },
    data: structuredClone(durable),
    installationToken: f.c.installationToken,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/data/save.js"),
      "utf8",
    ),
    f.c,
  );
  f.c.commitRecords = async () => {
    throw Error("injected quota");
  };
  await assert.rejects(f.run(), /injected quota/);
  assert.deepEqual(plain(f.c.db), plain(durable));
  assert.equal(f.c.getSessionById("session").roster.length, 0);
  assert.equal(f.modals.length, 0);
  assert.equal(f.c.busy, 0);
  assert.equal(f.c.isSessionEditable("session"), true);
  f.c.commitRecords = async () => {
    f.writes.push("retry committed");
  };
  assert.equal(await f.run(), true);
  assert.equal(f.c.getSessionById("session").roster.length, 2);
  assert.deepEqual(f.writes, ["retry committed"]);
  assert.equal(f.c.busy, 0);
});
