"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const writes = [],
    modals = [];
  const classroom = {
      id: "class",
      students: [{ id: "student", name: "Student" }],
      lessons: [
        { id: "lesson", poudmans: [] },
        { id: "other-lesson", poudmans: [] },
      ],
    },
    otherClass = {
      id: "other-class",
      students: [],
      lessons: [{ id: "lesson", poudmans: [] }],
    };
  const entry = { schoolId: "school", classId: "class", lessonId: "lesson" };
  const controls = {
    sessNewDate: { value: "2026-10-24" },
    sessNewClass: { value: "class" },
    sessNewLesson: { value: "lesson" },
    sessDate: { value: "2026-10-24" },
    sessPeriod: { type: "number", value: "1" },
  };
  let serial = 0;
  const c = vm.createContext({
    workspace: { id: "first", year: "1405-1406" },
    connection: {},
    state: {
      view: "schedule",
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
    },
    currentSessionId: null,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    db: {
      settings: { academicYear: "1405-1406", weekStartDate: "2026-10-24" },
      periods: 6,
      activeDays: [0, 1, 2, 3, 4, 5],
      schools: [{ id: "school", classes: [classroom, otherClass] }],
      sessions: [],
      masterSchedule: { "0-0-all": { ...entry } },
    },
    assertEntityWritable() {},
    asciiDigits: (value) => String(value),
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    getClassObj: (schoolId, classId) =>
      c.db.schools
        .find((s) => s.id === schoolId)
        ?.classes.find((cls) => cls.id === classId),
    getLessonObj: (cls, lessonId) =>
      cls?.lessons.find((l) => l.id === lessonId),
    findClass: (classId) =>
      c.db.schools.flatMap((s) => s.classes).find((cls) => cls.id === classId),
    findClassById: (classId) => {
      for (const school of c.db.schools) {
        const classObj = school.classes.find((cls) => cls.id === classId);
        if (classObj) return { school, classObj };
      }
      return null;
    },
    getSessionById: (id) => c.db.sessions.find((row) => row.id === id),
    document: { getElementById: (id) => controls[id] },
    getDayIdxFromDate: (date) =>
      (new Date(date + "T00:00:00Z").getUTCDay() + 1) % 7,
    DAYS: [
      "شنبه",
      "یکشنبه",
      "دوشنبه",
      "سه‌شنبه",
      "چهارشنبه",
      "پنجشنبه",
      "جمعه",
    ],
    uid: () => "session-" + ++serial,
    snapshotRoster: (cls) => structuredClone(cls.students),
    saveDBV24: async (scope) => writes.push(structuredClone(scope)),
    openSessionModal: (session) => modals.push(session),
  });
  for (const source of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/session-slots.js",
    "workspace/sessions/actions.js",
    "workspace/schedule/actions.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
      c,
    );
  const manual = (date = "2026-10-24", period = "1", lessonId = "lesson") =>
    c.addManualSessionV24(
      {
        preventDefault() {},
        target: { date: { value: date }, period: { value: period } },
      },
      lessonId,
    );
  const scheduled = (day = 0, period = 0) =>
    c.startSessionFromMasterV24(day, period);
  function historical(date = "2026-10-26") {
    const session = {
      id: "historical",
      ...entry,
      date,
      period: 0,
      roster: [{ id: "student", name: "Historical name" }],
      attendance: { student: "absent" },
      scores: [{ studentId: "student", type: "classGrade", value: 18 }],
    };
    c.db.sessions.push(session);
    c.currentSessionId = session.id;
    return session;
  }
  return { c, writes, modals, controls, entry, manual, scheduled, historical };
}
async function rejectedWithoutMutation(f, operation) {
  const before = JSON.stringify(f.c.db.sessions);
  await assert.rejects(
    operation,
    (error) => error.code === "SESSION_OUTSIDE_SCHEDULE",
  );
  assert.equal(JSON.stringify(f.c.db.sessions), before);
  assert.equal(f.writes.length, 0);
  assert.equal(f.modals.length, 0);
}
test("manual creation refuses a weekday where this lesson has no timetable entry", async () => {
  const f = fixture();
  await rejectedWithoutMutation(f, () => f.manual("2026-10-26"));
});
test("manual creation refuses a different bell even though it is a valid bell number", async () => {
  const f = fixture();
  await rejectedWithoutMutation(f, () => f.manual("2026-10-24", "2"));
});
for (const mutation of [
  "missing-entry",
  "different-lesson",
  "different-class",
  "different-school",
  "inactive-day",
  "configured-period-limit",
]) {
  test(
    "scheduled creation rejects " + mutation + " before inserting a session",
    async () => {
      const f = fixture();
      if (mutation === "missing-entry") delete f.c.db.masterSchedule["0-0-all"];
      if (mutation === "different-lesson")
        f.controls.sessNewLesson.value = "other-lesson";
      if (mutation === "different-class")
        f.controls.sessNewClass.value = "other-class";
      if (mutation === "different-school")
        f.c.db.masterSchedule["0-0-all"].schoolId = "other-school";
      if (mutation === "inactive-day") f.c.db.activeDays = [1, 2, 3, 4, 5];
      if (mutation === "configured-period-limit") {
        f.c.db.periods = 1;
        f.c.db.masterSchedule["0-1-all"] = { ...f.entry };
      }
      await rejectedWithoutMutation(f, () =>
        f.scheduled(0, mutation === "configured-period-limit" ? 1 : 0),
      );
    },
  );
}
for (const action of ["manual", "scheduled"]) {
  test(
    action +
      " creation accepts the configured odd week and refuses the other week's lesson",
    async () => {
      const f = fixture();
      delete f.c.db.masterSchedule["0-0-all"];
      f.c.db.masterSchedule["0-0-odd"] = { ...f.entry };
      f.c.db.masterSchedule["0-0-even"] = {
        ...f.entry,
        lessonId: "other-lesson",
      };
      f.controls.sessNewDate.value = "2026-10-31";
      await rejectedWithoutMutation(f, () =>
        action === "manual" ? f.manual("2026-10-31") : f.scheduled(),
      );
      f.controls.sessNewDate.value = "2026-10-24";
      assert.equal(
        await (action === "manual" ? f.manual() : f.scheduled()),
        true,
      );
      assert.equal(f.c.db.sessions[0].date, "2026-10-24");
      assert.equal(f.writes.length, 1);
    },
  );
  test(
    action +
      " creation honors parity overrides before a general weekly fallback",
    async () => {
      const f = fixture();
      f.c.db.masterSchedule["0-0-odd"] = {
        ...f.entry,
        lessonId: "other-lesson",
      };
      await rejectedWithoutMutation(f, () =>
        action === "manual" ? f.manual() : f.scheduled(),
      );
      f.controls.sessNewDate.value = "2026-10-31";
      assert.equal(
        await (action === "manual" ? f.manual("2026-10-31") : f.scheduled()),
        true,
      );
      assert.equal(f.writes.length, 1);
    },
  );
}
for (const action of ["manual", "scheduled"]) {
  for (const change of [
    "entry-removal",
    "class-replacement",
    "inactive-day",
    "period-reduction",
    "week-anchor-change",
  ]) {
    test(
      action +
        " creation rechecks " +
        change +
        " after its pending grade flush",
      async () => {
        const f = fixture();
        if (change === "period-reduction") {
          f.c.db.periods = 2;
          delete f.c.db.masterSchedule["0-0-all"];
          f.c.db.masterSchedule["0-1-all"] = { ...f.entry };
        }
        if (change === "week-anchor-change") {
          delete f.c.db.masterSchedule["0-0-all"];
          f.c.db.masterSchedule["0-0-odd"] = { ...f.entry };
          f.c.db.masterSchedule["0-0-even"] = {
            ...f.entry,
            lessonId: "other-lesson",
          };
        }
        f.c.flushDrafts = async () => {
          if (change === "entry-removal")
            delete f.c.db.masterSchedule["0-0-all"];
          if (change === "class-replacement")
            f.c.db.masterSchedule["0-0-all"] = {
              ...f.entry,
              classId: "other-class",
            };
          if (change === "inactive-day") f.c.db.activeDays = [];
          if (change === "period-reduction") f.c.db.periods = 1;
          if (change === "week-anchor-change")
            f.c.db.settings.weekStartDate = "2026-10-31";
        };
        await rejectedWithoutMutation(f, () =>
          action === "manual"
            ? f.manual("2026-10-24", change === "period-reduction" ? "2" : "1")
            : f.scheduled(0, change === "period-reduction" ? 1 : 0),
        );
      },
    );
  }
}
test("date correction refuses an unprogrammed destination before touching historical attendance or grades", async () => {
  const f = fixture(),
    session = f.historical("2026-10-27");
  f.controls.sessDate.value = "2026-10-26";
  await rejectedWithoutMutation(f, () => f.c.changeSessionDateV24(session.id));
});
test("period correction refuses an unprogrammed bell without replacing the existing session", async () => {
  const f = fixture(),
    session = f.historical("2026-10-24");
  f.controls.sessPeriod.value = "2";
  await rejectedWithoutMutation(f, () => f.c.changeSessionDateV24(session.id));
});
test("a historical session may move onto an actually scheduled date while preserving its data", async () => {
  const f = fixture(),
    session = f.historical("2026-10-27");
  await f.c.changeSessionDateV24(session.id);
  assert.equal(session.date, "2026-10-24");
  assert.equal(session.attendance.student, "absent");
  assert.equal(session.scores[0].value, 18);
  assert.equal(f.writes.length, 1);
});
for (const action of ["manual", "scheduled"]) {
  test(
    action +
      " start can continue an existing historical record after its schedule was removed",
    async () => {
      const f = fixture(),
        session = f.historical(
          action === "manual" ? "2026-10-26" : "2026-10-24",
        );
      f.c.db.masterSchedule = {};
      const before = JSON.stringify(session);
      await (action === "manual" ? f.manual(session.date) : f.scheduled());
      assert.equal(JSON.stringify(session), before);
      assert.equal(f.modals[0], session);
      assert.equal(f.writes.length, 0);
    },
  );
}
test("attendance remains editable on a historical record after days periods and timetable change", async () => {
  const f = fixture(),
    session = f.historical();
  f.c.db.masterSchedule = {};
  f.c.db.activeDays = [];
  f.c.db.periods = 1;
  await f.c.setAllAttendanceV24("leave");
  assert.equal(session.date, "2026-10-26");
  assert.equal(session.attendance.student, "leave");
  assert.equal(session.scores[0].value, 18);
  assert.equal(f.writes[0].sessionId, session.id);
});
