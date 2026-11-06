"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const c = vm.createContext({});
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
  const source = {
    settings: { academicYear: "1405-1406", weekStartDate: "2026-10-24" },
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    periods: 1,
    schools: [
      {
        id: "school",
        name: "School",
        classes: [
          {
            id: "classroom",
            name: "Class",
            students: [{ id: "active", name: "Active" }],
            archivedStudents: [{ id: "archived", name: "Archived" }],
            lessons: [
              { id: "lesson", name: "Lesson" },
              { id: "alternate", name: "Alternate lesson" },
            ],
          },
        ],
      },
    ],
    masterSchedule: Object.fromEntries(
      Array.from({ length: 7 }, (_, day) => [
        day + "-0-all",
        { schoolId: "school", classId: "classroom", lessonId: "lesson" },
      ]),
    ),
    sessions: [],
    notHeldSessions: [],
  };
  const options = { workspaceId: "active-term", today: "2026-11-06" };
  return {
    c,
    source,
    options,
    build: (extra = {}) =>
      c.EduAttendanceReminders.build(source, { ...options, ...extra }),
  };
}
const marker = (extra = {}) => ({
  id: "dismissal",
  date: "2026-10-31",
  period: 0,
  schoolId: "school",
  classId: "classroom",
  lessonId: "lesson",
  recordedAt: "2026-11-06T12:30:00.000Z",
  ...extra,
});
const session = (extra = {}) => ({
  ...marker(),
  id: "session",
  roster: [{ id: "active", name: "Frozen active" }],
  attendance: {},
  scores: [],
  ...extra,
});
const dateItems = (result, date = "2026-10-31") =>
  result.items.filter((item) => item.date === date);
function peer(data, extra = {}) {
  return {
    period: { id: "peer-term", year: "1405-1406", ...extra },
    data,
  };
}

test("reminders scan from the academic-year start through yesterday, never today or the future", () => {
  const f = fixture(),
    before = JSON.stringify(f.source),
    result = f.build(),
    bounds = f.c.EduAcademicYear.range("1405-1406");
  assert.equal(result.start, bounds.start);
  assert.equal(result.end, "2026-11-05");
  assert.equal(result.items.length, result.scannedDays);
  assert.ok(result.items.every((item) => item.date < f.options.today));
  assert.equal(result.items.at(-1).date, bounds.start);
  assert.ok(result.items.every((item) => item.kind === "missing"));
  assert.equal(JSON.stringify(f.source), before);
});

test("year scan is empty before the year and bounded at 366 days after its end", () => {
  const f = fixture();
  assert.equal(f.build({ today: "2026-01-01" }).scannedDays, 0);
  const result = f.build({ today: "2030-01-01" });
  assert.equal(result.end, f.c.EduAcademicYear.range("1405-1406").end);
  assert.ok(result.scannedDays >= 365 && result.scannedDays <= 366);
  assert.equal(result.items.length, result.scannedDays);
  assert.throws(() => f.build({ today: "2026-02-30" }));
  assert.throws(() => f.build({ workspaceId: "constructor" }));
});

test("planned dates follow active days, bell count and odd/even overriding weekly fallback", () => {
  const f = fixture();
  f.source.activeDays = [0];
  f.source.masterSchedule["0-0-odd"] = {
    schoolId: "school",
    classId: "classroom",
    lessonId: "alternate",
  };
  f.source.masterSchedule["0-1-all"] = {
    ...f.source.masterSchedule["0-0-all"],
  };
  const result = f.build();
  assert.ok(result.items.every((item) => item.day === 0 && item.period === 0));
  assert.equal(dateItems(result, "2026-10-24")[0].lessonId, "alternate");
  assert.equal(dateItems(result)[0].lessonId, "lesson");
  f.source.activeDays = [];
  assert.equal(f.build().items.length, 0);
});

test("cross-term real sessions suppress missing candidates and never create duplicate reminders", () => {
  const f = fixture(),
    other = structuredClone(f.source);
  other.sessions = [session({ attendance: { active: "present" } })];
  assert.equal(dateItems(f.build({ parts: [peer(other)] })).length, 0);
  assert.equal(
    dateItems(f.build({ parts: [peer(other, { year: "1404-1405" })] })).length,
    1,
  );
  f.source.sessions = other.sessions;
  assert.equal(
    dateItems(f.build({ parts: [peer(other, { id: f.options.workspaceId })] }))
      .length,
    0,
  );
});

test("not-held markers dismiss only their exact planned identity, including markers in another term", () => {
  const f = fixture(),
    other = structuredClone(f.source);
  other.notHeldSessions = [marker()];
  assert.equal(dateItems(f.build({ parts: [peer(other)] })).length, 0);
  other.notHeldSessions[0].lessonId = "alternate";
  assert.equal(dateItems(f.build({ parts: [peer(other)] })).length, 1);
  other.notHeldSessions[0].classId = "deleted-historical-class";
  assert.doesNotThrow(() =>
    f.c.EduAttendanceReminders.validateMarkers(other.notHeldSessions),
  );
});

test("actual incomplete sessions always outrank not-held markers", () => {
  const f = fixture();
  f.source.notHeldSessions = [marker()];
  f.source.sessions = [session()];
  const [item] = dateItems(f.build());
  assert.equal(item.kind, "incomplete");
  assert.equal(item.unknown, 1);
  assert.equal(item.sourcePeriodId, f.options.workspaceId);
  assert.equal(item.sessionId, "session");
  f.source.sessions[0].attendance.active = "present";
  assert.equal(dateItems(f.build()).length, 0);
});

test("frozen historical rosters include archived members, not newly active students", () => {
  const f = fixture();
  f.source.sessions = [
    session({
      roster: [{ id: "archived", name: "Historical archived" }],
      attendance: { active: "present" },
    }),
  ];
  let item = dateItems(f.build())[0];
  assert.equal(item.unknown, 1);
  assert.equal(item.total, 1);
  f.source.sessions[0].attendance.archived = "absent";
  assert.equal(dateItems(f.build()).length, 0);
  f.source.sessions[0].roster = [];
  assert.equal(dateItems(f.build()).length, 0);
});

test("all valid attendance statuses, including lateness with zero minutes, complete their frozen members", () => {
  const f = fixture(),
    statuses = ["present", "absent", "leave", "late", "late:0", "late:999"];
  f.source.sessions = [
    session({
      roster: statuses.map((value, index) => ({ id: "student-" + index })),
      attendance: Object.fromEntries(
        statuses.map((value, index) => ["student-" + index, value]),
      ),
    }),
  ];
  assert.equal(dateItems(f.build()).length, 0);
  f.source.sessions[0].attendance["student-0"] = "late:1000";
  assert.equal(dateItems(f.build())[0].unknown, 1);
});

test("incomplete existing sessions remain visible when the current timetable moves or removes their day", () => {
  const f = fixture(),
    other = structuredClone(f.source);
  f.source.activeDays = [];
  f.source.masterSchedule = {};
  other.sessions = [session({ lessonId: "alternate" })];
  const [item] = dateItems(f.build({ parts: [peer(other)] }));
  assert.equal(item.kind, "incomplete");
  assert.equal(item.sourcePeriodId, "peer-term");
  assert.equal(item.lessonId, "alternate");
});

test("multiple real sessions in one physical bell produce one explicit deterministic conflict, never a missing candidate", () => {
  const f = fixture(),
    other = structuredClone(f.source);
  f.source.sessions = [session()];
  other.sessions = [session({ id: "peer-session", lessonId: "alternate" })];
  const [item] = dateItems(f.build({ parts: [peer(other)] }));
  assert.equal(dateItems(f.build({ parts: [peer(other)] })).length, 1);
  assert.equal(item.kind, "conflict");
  assert.equal(item.sessions.length, 2);
  assert.deepEqual(
    Array.from(item.sessions, (row) => [row.sourcePeriodId, row.sessionId]),
    [
      ["active-term", "session"],
      ["peer-term", "peer-session"],
    ],
  );
});

test("orphan or wrong-school timetable entries never invent actionable sessions", () => {
  const f = fixture();
  for (const value of Object.values(f.source.masterSchedule))
    value.schoolId = "wrong-school";
  assert.equal(f.build().items.length, 0);
  for (const value of Object.values(f.source.masterSchedule))
    value.lessonId = "missing-lesson";
  assert.equal(f.build().items.length, 0);
});

test("marker validation accepts optional legacy absence, valid timestamps and historical orphan identities without mutation", () => {
  const f = fixture(),
    values = [
      marker(),
      marker({
        id: "another",
        lessonId: "retired-lesson",
        recordedAt: "2026-11-06T12:30:00Z",
      }),
    ],
    before = JSON.stringify(values);
  assert.equal(f.c.EduAttendanceReminders.validateMarkers(undefined), true);
  assert.equal(f.c.EduAttendanceReminders.validateMarkers([]), true);
  assert.equal(f.c.EduAttendanceReminders.validateMarkers(values), true);
  assert.equal(JSON.stringify(values), before);
});

test("marker validation rejects malformed, unsafe, excessive and exact-duplicate records", () => {
  const f = fixture(),
    invalid = (error) => error.code === "ATTENDANCE_REMINDER_MARKERS_INVALID";
  for (const value of [
    null,
    {},
    [null],
    [marker({ id: "constructor" })],
    [marker({ classId: "unsafe|class" })],
    [marker({ period: -1 })],
    [marker({ period: 12 })],
    [marker({ period: 0.5 })],
    [marker({ date: "2026-02-30" })],
    [marker({ recordedAt: "2026-02-30T12:30:00.000Z" })],
    [marker({ recordedAt: "not-a-date" })],
    [marker({ arbitrary: "unsupported" })],
    [marker(), marker({ id: "other" })],
    [marker(), marker({ date: "2026-11-01" })],
    new Array(5001),
  ])
    assert.throws(
      () => f.c.EduAttendanceReminders.validateMarkers(value),
      invalid,
    );
});
