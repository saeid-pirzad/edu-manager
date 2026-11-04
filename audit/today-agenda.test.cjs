"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    handlers = new Map(),
    classroom = {
      id: "class",
      name: "Class",
      students: [{ id: "student", name: "Student" }],
      lessons: [{ id: "lesson", name: "Lesson" }],
    },
    school = { id: "school", name: "School", classes: [classroom] },
    request = {
      date: "2026-10-24",
      day: 0,
      period: 0,
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
    };
  const c = vm.createContext({
    installationToken: "epoch-one",
    workspace: { id: "first", year: "1405-1406", closed: false },
    connection: {},
    state: { view: "schools" },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    db: {
      settings: { academicYear: "1405-1406", weekStartDate: "2026-10-24" },
      schools: [school],
      sessions: [],
      activeDays: [0, 1, 2, 3, 4, 5],
      periods: 6,
      masterSchedule: {
        "0-0-all": { schoolId: "school", classId: "class", lessonId: "lesson" },
      },
    },
    document: {
      getElementById() {
        throw Error("A Today shortcut must not depend on setup controls");
      },
    },
    assertEntityWritable() {
      if (c.workspace.closed) throw Error("closed");
    },
    todayISO: () => "2026-10-24",
    getDayIdxFromDate: (date) =>
      (new Date(date + "T00:00:00Z").getUTCDay() + 1) % 7,
    findClassById: (id) =>
      id === classroom.id ? { school, classObj: classroom } : null,
    writer: Promise.resolve(),
    flushDrafts: async () => {},
    uid: () => "new-session",
    snapshotRoster: (cls) => structuredClone(cls.students),
    saveDBV24: async () => effects.push("save"),
    getSessionById: (id) => c.db.sessions.find((item) => item.id === id),
    openSessionModal: (session) => effects.push(["open", session.id]),
    render: () => effects.push("render"),
    alert: () => effects.push("alert"),
    DAYS: [
      "Saturday",
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ],
    esc: (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;"),
    faDate: (date) => date,
    getPeriodName: (period) => "Bell " + (period + 1),
    headerHtml: () => "<header>Home</header>",
    calcStudentLesson() {
      throw Error("Home shortcut must not calculate grades");
    },
    EduLegacyEvents: {
      register: (name, handler) => handlers.set(name, handler),
    },
    runSessionFormAction: (_control, action) => action(),
  });
  for (const name of [
    "src/core/icons.js",
    "src/domain/calendar.js",
    "src/domain/academic-year.js",
    "src/domain/session-slots.js",
    "src/workspace/sessions/actions.js",
    "src/workspace/schedule/actions.js",
    "src/legacy/ui/dashboard.js",
    "src/legacy/ui/school-class.js",
    "src/legacy/events/ui-dashboard.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", name), "utf8"),
      c,
    );
  c.EduV24 = {
    getReportContext: () => ({ ...c.workspace }),
    startTodaySession: c.startTodaySessionV24,
  };
  c.getMasterEntry = (day, period, date) =>
    c.EduSessionSlots.entry(c.db, day, period, date);
  c.dashboardDirectory = () =>
    '<section class="dashboard-directory"></section>';
  return { c, effects, request, handlers, classroom, school };
}
test("actual home renders a compact Today agenda above its directory without grade-summary panels", () => {
  const { c } = fixture(),
    html = c.renderSchools();
  assert.match(html, /class="card today-agenda no-print"/);
  assert.ok(
    html.indexOf('class="card today-agenda') <
      html.indexOf('class="dashboard-directory"'),
  );
  assert.doesNotMatch(html, /dashboard-work|dashboard-tasks/);
  assert.match(html, /data-legacy-click="today-agenda"/);
  for (const [name, value] of Object.entries({
    school: "school",
    class: "class",
    lesson: "lesson",
    date: "2026-10-24",
    day: "0",
    period: "0",
  }))
    assert.ok(html.includes("data-" + name + '="' + value + '"'), name);
});
test("one home action creates and opens the exact scheduled session without a setup modal or confirmation", async () => {
  const f = fixture(),
    handler = f.handlers.get("today-agenda");
  await handler.call({
    dataset: {
      session: "",
      school: "school",
      class: "class",
      lesson: "lesson",
      date: "2026-10-24",
      day: "0",
      period: "0",
    },
  });
  assert.equal(f.c.db.sessions.length, 1);
  assert.deepEqual(f.effects, ["save", ["open", "new-session"]]);
  const session = f.c.db.sessions[0];
  for (const name of ["schoolId", "classId", "lessonId", "date", "period"])
    assert.equal(session[name], f.request[name]);
  f.classroom.students[0].name = "Changed";
  assert.equal(session.roster[0].name, "Student");
});
test("an existing Today session continues directly without a write", async () => {
  const f = fixture();
  f.c.db.sessions.push({
    ...f.request,
    id: "existing",
    attendance: { student: "present" },
    scores: [],
  });
  await f.handlers
    .get("today-agenda")
    .call({ dataset: { session: "existing" } });
  assert.deepEqual(f.effects, [["open", "existing"]]);
  assert.match(f.c.renderTodayAgenda(), /today-agenda-status/);
});
for (const reason of ["other-class", "other-lesson"])
  test("Today start rejects an occupied bell: " + reason, async () => {
    const f = fixture();
    f.c.db.sessions.push({
      ...f.request,
      id: "occupied",
      classId: reason === "other-class" ? reason : "class",
      lessonId: reason === "other-lesson" ? reason : "lesson",
    });
    await assert.rejects(f.c.startTodaySessionV24(f.request));
    assert.equal(f.c.db.sessions.length, 1);
    assert.deepEqual(f.effects, []);
  });
for (const point of ["before", "during"])
  test(
    "Today start rejects a midnight date change " + point + " draft flush",
    async () => {
      const f = fixture();
      if (point === "before") f.c.todayISO = () => "2026-10-25";
      else
        f.c.flushDrafts = async () => {
          f.c.todayISO = () => "2026-10-25";
        };
      await assert.rejects(f.c.startTodaySessionV24(f.request));
      assert.equal(f.c.db.sessions.length, 0);
      assert.deepEqual(f.effects, []);
    },
  );
for (const changed of ["schedule", "database", "epoch", "connection", "view"])
  test(
    "Today action rejects a stale " +
      changed +
      " after waiting for pending work",
    async () => {
      const f = fixture();
      f.c.flushDrafts = async () => {
        if (changed === "schedule")
          f.c.db.masterSchedule["0-0-all"] = {
            ...f.request,
            lessonId: "replacement",
          };
        if (changed === "database") f.c.db = { ...f.c.db };
        if (changed === "epoch") f.c.installationToken = "epoch-two";
        if (changed === "connection") f.c.connection = {};
        if (changed === "view") f.c.state.view = "school";
      };
      await assert.rejects(f.c.startTodaySessionV24(f.request));
      assert.equal(f.c.db.sessions.length, 0);
      assert.deepEqual(f.effects, []);
    },
  );
test("closed terms disable new Today starts while preserving existing-session access", async () => {
  const f = fixture();
  f.c.workspace.closed = true;
  await assert.rejects(f.c.startTodaySessionV24(f.request), /closed/);
  assert.match(f.c.renderTodayAgenda(), /data-mutating="1" disabled/);
  f.c.db.sessions.push({ ...f.request, id: "old", attendance: {}, scores: [] });
  assert.doesNotMatch(f.c.renderTodayAgenda(), /data-mutating="1"| disabled/);
  f.handlers.get("today-agenda").call({ dataset: { session: "old" } });
  assert.deepEqual(f.effects, [["open", "old"]]);
});
test("rapid Today clicks share the existing schedule creation gate", async () => {
  const f = fixture();
  let release;
  f.c.flushDrafts = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const first = f.c.startTodaySessionV24(f.request);
  assert.equal(await f.c.startTodaySessionV24(f.request), false);
  assert.equal(await f.c.startSessionFromMasterV24(0, 0), false);
  release();
  await first;
  assert.equal(f.c.db.sessions.length, 1);
});
test("a caller cannot retarget the captured Today request while drafts are flushing", async () => {
  const f = fixture();
  f.c.flushDrafts = async () => {
    f.request.classId = "other";
  };
  await f.c.startTodaySessionV24(f.request);
  assert.equal(f.c.db.sessions[0].classId, "class");
});
test("Today agenda honors active days, odd/even overrides and the academic year", () => {
  const f = fixture();
  f.c.db.masterSchedule["0-0-odd"] = {
    schoolId: "school",
    classId: "class",
    lessonId: "missing",
  };
  assert.doesNotMatch(
    f.c.renderTodayAgenda(),
    /data-legacy-click="today-agenda"/,
  );
  delete f.c.db.masterSchedule["0-0-odd"];
  f.c.db.activeDays = [];
  assert.doesNotMatch(
    f.c.renderTodayAgenda(),
    /data-legacy-click="today-agenda"/,
  );
  f.c.db.activeDays = [0];
  f.c.todayISO = () => "2028-10-21";
  assert.doesNotMatch(
    f.c.renderTodayAgenda(),
    /data-legacy-click="today-agenda"/,
  );
});
test("the shortcut rejects a fabricated school identity and wrong weekday", async () => {
  for (const patch of [{ schoolId: "other" }, { day: 1 }]) {
    const f = fixture();
    await assert.rejects(f.c.startTodaySessionV24({ ...f.request, ...patch }));
    assert.equal(f.c.db.sessions.length, 0);
  }
});
test("home names and IDs remain escaped data in the Today action", () => {
  const f = fixture();
  f.classroom.name = "<img src=x>";
  f.classroom.lessons[0].name = '"<script>';
  const html = f.c.renderTodayAgenda();
  assert.doesNotMatch(html, /<img|<script>/);
  assert.match(html, /&lt;img/);
});

test("a successful normal catalog replacement still opens the created Today session", async () => {
  const f = fixture(),
    original = f.c.workspace;
  f.c.saveDBV24 = async () => {
    f.effects.push("save");
    f.c.workspace = { ...f.c.workspace, revision: 1 };
  };
  await f.c.startTodaySessionV24(f.request);
  assert.notEqual(f.c.workspace, original);
  assert.deepEqual(f.effects, ["save", ["open", "new-session"]]);
});
