"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

// The calendar, academic-year domain and action implementations are real. The
// bounded harness records side effects without pretending to validate a DB.
function fixture() {
  const writes = [],
    modals = [],
    cls = {
      id: "class",
      students: [{ id: "student", name: "Synthetic student" }],
      lessons: [{ id: "lesson" }],
    },
    controls = {
      sessNewDate: { value: "2026-10-24" },
      sessNewClass: { value: "class" },
      sessNewLesson: { value: "lesson" },
      sessDate: { value: "2026-10-24" },
      sessPeriod: { type: "number", value: "1" },
    },
    c = vm.createContext({
      structuredClone,
      workspace: { id: "first", year: "1405-1406" },
      connection: {},
      state: {
        schoolId: "school",
        classId: "class",
        lessonId: "lesson",
        view: "schedule",
      },
      db: {
        settings: { academicYear: "1405-1406", weekStartDate: "2026-09-19" },
        schools: [{ id: "school", classes: [cls] }],
        sessions: [],
        periods: 6,
        activeDays: [0, 1, 2, 3, 4, 5],
        masterSchedule: {
          "0-0-all": {
            schoolId: "school",
            classId: "class",
            lessonId: "lesson",
          },
          "4-0-all": {
            schoolId: "school",
            classId: "class",
            lessonId: "lesson",
          },
        },
      },
      currentSessionId: null,
      periodLoading: false,
      resetBusy: false,
      connectionRetired: false,
      assertEntityWritable() {},
      captureSessionControlFocus: () => () => {},
      refreshSessionAttendanceRows() {},
      assertSessionEditable: () => {
        c.assertEntityWritable();
        return "isolated-edit-lease";
      },
      isSessionEditable: () => true,
      asciiDigits: (value) => value,
      flushDrafts: async () => {},
      writer: Promise.resolve(),
      getClassObj: () => cls,
      getLessonObj: () => cls.lessons[0],
      findClass: () => cls,
      findClassById: () => ({ school: { id: "school" }, classObj: cls }),
      document: { getElementById: (id) => controls[id] },
      getDayIdxFromDate: (date) =>
        (new Date(date + "T00:00:00Z").getUTCDay() + 1) % 7,
      DAYS: ["Saturday"],
      uid: () => "new-session",
      snapshotRoster: (value) => structuredClone(value.students),
      getSessionById: (id) =>
        c.db.sessions.find((session) => session.id === id),
      saveDBV24: async (scope) => writes.push(scope),
      openSessionModal: (session) => modals.push(session),
      openNewSessionDialogV24: (session) => modals.push(session),
    });
  for (const source of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/session-slots.js",
    "workspace/domain/defaults-numbers.js",
    "workspace/sessions/actions.js",
    "workspace/schedule/actions.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
      c,
    );
  const event = (date) => ({
    preventDefault() {},
    target: { date: { value: date }, period: { value: "1" } },
  });
  return { c, writes, modals, controls, event };
}
const outside = (error) => error.code === "ACADEMIC_DATE_OUT_OF_YEAR";
for (const date of ["2026-09-22", "2027-09-23"]) {
  test(
    "manual creation rejects out-of-year date before any write: " + date,
    async () => {
      const f = fixture();
      await assert.rejects(
        f.c.addManualSessionV24(f.event(date), "lesson"),
        outside,
      );
      assert.equal(
        f.c.db.sessions.length + f.writes.length + f.modals.length,
        0,
      );
    },
  );
  test(
    "scheduled creation rejects out-of-year date before any write: " + date,
    async () => {
      const f = fixture();
      f.controls.sessNewDate.value = date;
      await assert.rejects(f.c.startSessionFromMasterV24(0, 0), outside);
      assert.equal(
        f.c.db.sessions.length + f.writes.length + f.modals.length,
        0,
      );
    },
  );
  test(
    "date correction rejects out-of-year destination without mutating the session: " +
      date,
    async () => {
      const f = fixture(),
        session = {
          id: "existing",
          schoolId: "school",
          classId: "class",
          lessonId: "lesson",
          date: "2026-10-24",
          period: 0,
          attendance: { student: "absent" },
          roster: [{ id: "student", name: "Synthetic student" }],
          scores: [],
        };
      f.c.db.sessions.push(session);
      f.c.currentSessionId = session.id;
      f.controls.sessDate.value = date;
      const before = JSON.stringify(session);
      await assert.rejects(f.c.changeSessionDateV24(session.id), outside);
      assert.equal(JSON.stringify(session), before);
      assert.equal(f.writes.length + f.modals.length, 0);
    },
  );
}
for (const date of ["2026-09-23", "2027-09-22"])
  test(
    "manual creation accepts the inclusive academic-year boundary: " + date,
    async () => {
      const f = fixture();
      assert.equal(
        await f.c.addManualSessionV24(f.event(date), "lesson"),
        true,
      );
      assert.equal(f.c.db.sessions[0].date, date);
      assert.equal(f.writes.length, 1);
    },
  );
test("historical out-of-year attendance can be corrected without rewriting its date", async () => {
  const f = fixture(),
    session = {
      id: "historical",
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
      date: "2026-09-22",
      period: 0,
      attendance: { student: "absent" },
      roster: [{ id: "student", name: "Synthetic student" }],
      scores: [],
    };
  f.c.db.sessions.push(session);
  f.c.currentSessionId = session.id;
  await f.c.setAllAttendanceV24("present");
  assert.equal(session.date, "2026-09-22");
  assert.equal(session.attendance.student, "present");
  assert.equal(f.writes.length, 1);
});
test("legacy out-of-year session can move into the valid range with its history intact", async () => {
  const f = fixture(),
    session = {
      id: "historical",
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
      date: "2026-09-22",
      period: 0,
      attendance: { student: "leave" },
      roster: [{ id: "student", name: "Synthetic student" }],
      scores: [{ studentId: "student", type: "classGrade", value: 18 }],
    };
  f.c.db.sessions.push(session);
  f.c.currentSessionId = session.id;
  f.controls.sessDate.value = "2026-09-23";
  await f.c.changeSessionDateV24(session.id);
  assert.equal(session.date, "2026-09-23");
  assert.equal(session.attendance.student, "leave");
  assert.equal(session.scores[0].value, 18);
  assert.equal(f.writes.length, 1);
});
test("the default academic-year label stays stable through Nowruz and changes at Mehr", () => {
  for (const [iso, expected] of [
    ["2027-03-20", "1405-1406"],
    ["2027-03-21", "1405-1406"],
    ["2027-09-22", "1405-1406"],
    ["2027-09-23", "1406-1407"],
  ]) {
    const c = vm.createContext({
      Date: class extends Date {
        constructor(...args) {
          super(...(args.length ? args : [iso + "T12:00:00"]));
        }
      },
    });
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/workspace/domain/defaults-numbers.js"),
        "utf8",
      ),
      c,
    );
    assert.equal(c.currentYearLabel(), expected, iso);
  }
});

for (const date of ["2026-09-23", "2027-09-22"])
  test(
    "scheduled creation accepts a programmed bell at the inclusive academic-year boundary: " +
      date,
    async () => {
      const f = fixture();
      f.controls.sessNewDate.value = date;
      assert.equal(await f.c.startSessionFromMasterV24(4, 0), true);
      assert.equal(f.c.db.sessions[0].date, date);
      assert.equal(f.c.db.sessions[0].period, 0);
      assert.equal(f.writes.length, 1);
    },
  );
