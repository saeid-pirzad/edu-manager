"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const writes = [],
    modals = [];
  const cls = {
    id: "class",
    lessons: [{ id: "lesson" }],
    students: [{ id: "student", name: "Student" }],
  };
  const c = vm.createContext({
    workspace: { id: "first", year: "1405-1406" },
    connection: {},
    state: { schoolId: "school", classId: "class", lessonId: "lesson" },
    currentSessionId: null,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    db: {
      settings: { academicYear: "1405-1406", weekStartDate: "2026-10-24" },
      schools: [{ id: "school", classes: [cls] }],
      sessions: [],
      periods: 12,
      activeDays: [0, 1, 2, 3, 4, 5],
      masterSchedule: {
        "3-0-all": { schoolId: "school", classId: "class", lessonId: "lesson" },
        "3-11-all": {
          schoolId: "school",
          classId: "class",
          lessonId: "lesson",
        },
      },
    },
    assertEntityWritable() {},
    assertSessionEditable: () => {
      c.assertEntityWritable();
      return "isolated-edit-lease";
    },
    isSessionEditable: () => true,
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
    openNewSessionDialogV24: (session) => modals.push(session),
  });
  for (const name of ["calendar.js", "academic-year.js", "session-slots.js"])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/domain", name), "utf8"),
      c,
    );
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
    lessonId: "lesson",
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

for (const archived of [false, true])
  test(`manual session requires active students, even with archived members: ${archived}`, async () => {
    const f = fixture();
    f.cls.archivedStudents = archived ? structuredClone(f.cls.students) : [];
    f.cls.students = [];
    const before = JSON.stringify(f.c.db);
    await assert.rejects(
      f.c.addManualSessionV24(f.event(), "lesson"),
      /ابتدا هنرجویان/,
    );
    assert.equal(JSON.stringify(f.c.db), before);
    assert.equal(f.writes.length, 0);
    assert.equal(f.modals.length, 0);
  });

test("manual creation rechecks active students after pending draft writes", async () => {
  const f = fixture();
  f.c.flushDrafts = async () => {
    f.cls.students = [];
  };
  await assert.rejects(
    f.c.addManualSessionV24(f.event(), "lesson"),
    /ابتدا هنرجویان/,
  );
  assert.equal(f.c.db.sessions.length, 0);
  assert.equal(f.writes.length, 0);
});

test("an existing empty-roster session remains viewable after all students leave", async () => {
  const f = fixture();
  f.cls.students = [];
  const existing = {
    id: "old",
    classId: "class",
    lessonId: "lesson",
    date: "2026-10-27",
    period: 0,
    roster: [],
  };
  f.c.db.sessions.push(existing);
  assert.equal(await f.c.addManualSessionV24(f.event(), "lesson"), false);
  assert.equal(f.modals[0], existing);
  assert.equal(f.writes.length, 0);
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

for (const schoolId of ["school", "other-school"])
  test(
    "manual creation rejects another class in the same slot: " + schoolId,
    async () => {
      const f = fixture();
      const existing = {
        id: "occupied",
        schoolId,
        classId: "other-class",
        lessonId: "lesson",
        date: "2026-10-27",
        period: 0,
        attendance: { student: "leave" },
        scores: [{ value: 18 }],
      };
      f.c.db.sessions.push(existing);
      const before = JSON.stringify(f.c.db.sessions);
      await assert.rejects(
        f.c.addManualSessionV24(f.event(), "lesson"),
        /تداخل جلسه/,
      );
      assert.equal(JSON.stringify(f.c.db.sessions), before);
      assert.equal(f.writes.length, 0);
      assert.equal(f.modals.length, 0);
    },
  );

test("manual session refuses changed date during pending draft flush", async () => {
  const f = fixture(),
    event = f.event();
  f.c.flushDrafts = async () => {
    event.target.date.value = "2026-10-28";
  };
  await assert.rejects(
    f.c.addManualSessionV24(event, "lesson"),
    /هنگام ثبت تغییر/,
  );
  assert.equal(f.c.db.sessions.length, 0);
  assert.equal(f.writes.length, 0);
});
test("manual session rejects an occupied slot belonging to another lesson", async () => {
  const f = fixture();
  f.c.db.sessions.push({
    id: "occupied",
    classId: "class",
    lessonId: "other",
    date: "2026-10-27",
    period: 0,
  });
  await assert.rejects(
    f.c.addManualSessionV24(f.event(), "lesson"),
    /تداخل جلسه/,
  );
  assert.equal(f.c.db.sessions.length, 1);
  assert.equal(f.modals.length, 0);
  assert.equal(f.writes.length, 0);
});

test("continuing an existing session never uses a browser confirmation", async () => {
  const f = fixture();
  f.c.confirm = () => {
    throw Error("Native confirm was called");
  };
  const existing = {
    id: "existing",
    classId: "class",
    date: "2026-10-27",
    period: 0,
    lessonId: "lesson",
  };
  f.c.db.sessions.push(existing);
  await f.c.addManualSessionV24(f.event(), "lesson");
  assert.equal(f.modals[0], existing);
  assert.equal(f.writes.length, 0);
});
