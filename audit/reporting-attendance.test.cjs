"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({}),
  filename = path.join(__dirname, "../src/domain/reporting/attendance.js");
vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
const attendance = context.EduReportAttendance,
  plain = (value) => JSON.parse(JSON.stringify(value)),
  observation = (patch = {}) => ({
    schoolId: "school-a",
    studentId: "student-a",
    sessionId: "session-a",
    date: "2026-11-02",
    raw: "present",
    ...patch,
  });

test("report attendance is a standalone frozen API with fresh owned accumulators", () => {
  assert.equal(Object.isFrozen(attendance), true);
  const first = attendance.emptyCounts(),
    second = attendance.emptyCounts();
  assert.notEqual(first, second);
  assert.deepEqual(plain(first), {
    present: 0,
    absent: 0,
    leave: 0,
    late: 0,
    unknown: 0,
    lateMinutes: 0,
    lateMinutesRecorded: 0,
  });
  attendance.tally(first, attendance.normalize("present"));
  assert.equal(first.present, 1);
  assert.equal(second.present, 0);
});

test("report normalization preserves the teacher labels and exact raw-status parsing", () => {
  for (const [raw, expected] of [
    ["present", { status: "present", label: "حاضر", minutes: null }],
    ["absent", { status: "absent", label: "غایب", minutes: null }],
    ["leave", { status: "leave", label: "مرخصی", minutes: null }],
    ["late", { status: "late", label: "با تأخیر", minutes: null }],
    ["late:0", { status: "late", label: "با تأخیر", minutes: 0 }],
    ["late:000", { status: "late", label: "با تأخیر", minutes: 0 }],
    ["late:10", { status: "late", label: "با تأخیر", minutes: 10 }],
  ])
    assert.deepEqual({ ...attendance.normalize(raw) }, expected);
  for (const raw of [
    undefined,
    null,
    false,
    0,
    {},
    [],
    "",
    "unknown",
    " present ",
    "Late",
    "late:",
    "late:-1",
    "late:1.5",
    "late: 10",
    "late:1e3",
    "late:۱۰",
    "late:١٠",
  ])
    assert.deepEqual(
      { ...attendance.normalize(raw) },
      { status: "unknown", label: "تعیین نشده", minutes: null },
    );
});

test("report tally preserves return, explicit zero and safe-minute behavior", () => {
  const counts = attendance.emptyCounts();
  assert.equal(
    attendance.tally(counts, attendance.normalize("late:0")),
    undefined,
  );
  attendance.tally(counts, attendance.normalize("late"));
  attendance.tally(counts, attendance.normalize("late:10"));
  attendance.tally(counts, attendance.normalize("late:9007199254740992"));
  const overflow = attendance.normalize("late:" + "9".repeat(400));
  assert.equal(overflow.minutes, Infinity);
  attendance.tally(counts, overflow);
  assert.equal(counts.late, 5);
  assert.equal(counts.lateMinutes, 10);
  assert.equal(counts.lateMinutesRecorded, 2);
  const largestSafe = attendance.emptyCounts();
  attendance.tally(largestSafe, attendance.normalize("late:9007199254740991"));
  assert.equal(largestSafe.lateMinutes, Number.MAX_SAFE_INTEGER);
  assert.equal(largestSafe.lateMinutesRecorded, 1);
});

test("report attendance rate includes late and excludes leave and unknown without inventing zero", () => {
  for (const [values, expected] of [
    [{}, null],
    [{ leave: 2, unknown: 8 }, null],
    [{ late: 2, leave: 100, unknown: 100 }, 100],
    [{ absent: 2 }, 0],
    [{ present: 1, absent: 2 }, 33.3],
    [{ present: 39, late: 2, absent: 7 }, 85.4],
  ]) {
    const counts = { ...attendance.emptyCounts(), ...values },
      before = { ...counts };
    assert.equal(attendance.attendanceRate(counts), expected);
    assert.deepEqual(counts, before);
  }
});

test("two bells with one absent person remain two observations but one person and student-day", () => {
  const result = attendance.summarizeObservations([
    observation({ raw: "absent" }),
    observation({ sessionId: "session-b", raw: "absent" }),
  ]);
  assert.equal(result.observations, 2);
  assert.equal(result.sessions, 2);
  assert.equal(result.uniqueStudents, 1);
  assert.equal(result.studentDays, 1);
  assert.equal(result.counts.absent, 2);
  assert.equal(result.studentDayCounts.absent, 1);
  assert.equal(result.attendanceRate, 0);
});

test("student-day categories overlap and late remains a subset of daily present", () => {
  const result = attendance.summarizeObservations([
    observation({ raw: "late:0" }),
    observation({ sessionId: "session-b", raw: "absent" }),
    observation({ sessionId: "session-c", date: "2026-11-03", raw: "leave" }),
    observation({ sessionId: "session-d", date: "2026-11-03", raw: undefined }),
  ]);
  assert.deepEqual(plain(result.counts), {
    present: 0,
    absent: 1,
    leave: 1,
    late: 1,
    unknown: 1,
    lateMinutes: 0,
    lateMinutesRecorded: 1,
  });
  assert.deepEqual(plain(result.studentDayCounts), {
    present: 1,
    absent: 1,
    leave: 1,
    late: 1,
    unknown: 1,
  });
  assert.equal(result.studentDays, 2);
  assert.equal(result.uniqueStudents, 1);
  assert.equal(result.attendanceRate, 50);
});

test("leave and undetermined observations do not become absences or a zero attendance rate", () => {
  const result = attendance.summarizeObservations([
    observation({ raw: "leave" }),
    observation({ sessionId: "session-b", raw: undefined }),
  ]);
  assert.equal(result.attendanceRate, null);
  assert.equal(result.counts.absent, 0);
  assert.equal(result.counts.present, 0);
  assert.equal(result.counts.leave, 1);
  assert.equal(result.counts.unknown, 1);
  assert.equal(result.studentDayCounts.absent, 0);
  assert.equal(result.studentDayCounts.present, 0);
  assert.equal(result.uniqueStudents, 1);
});

test("canonical school, person and session IDs prevent name and teacher-local-ID joins", () => {
  const rows = [
    observation({
      studentId: "canonical-student-a",
      sessionId: "teacher-a-session",
      sourceId: "teacher-a",
      localStudentId: "student-1",
      name: "نام یکسان",
    }),
    observation({
      studentId: "canonical-student-b",
      sessionId: "teacher-b-session",
      sourceId: "teacher-b",
      localStudentId: "student-1",
      name: "نام یکسان",
    }),
    observation({
      schoolId: "school-b",
      studentId: "canonical-student-a",
      sessionId: "teacher-a-session",
      name: "نام یکسان",
    }),
  ];
  const result = attendance.summarizeObservations(rows);
  assert.equal(result.uniqueStudents, 3);
  assert.equal(result.sessions, 3);
  assert.equal(result.observations, 3);
  assert.equal(result.studentDays, 3);
});

test("the same resolved person in two teachers' sessions counts as one participating person", () => {
  const result = attendance.summarizeObservations([
    observation({ sessionId: "canonical-teacher-a-session" }),
    observation({ sessionId: "canonical-teacher-b-session", raw: "late:5" }),
  ]);
  assert.equal(result.observations, 2);
  assert.equal(result.sessions, 2);
  assert.equal(result.uniqueStudents, 1);
  assert.equal(result.studentDays, 1);
  assert.equal(result.studentDayCounts.present, 1);
  assert.equal(result.studentDayCounts.late, 1);
  assert.equal(result.attendanceRate, 100);
});

test("repeated normalized observations are deduplicated without relying on row order or names", () => {
  const first = observation({ raw: "late:0", name: "نام قدیمی" }),
    rows = [
      first,
      observation({ raw: "late:000", name: "نام جدید" }),
      observation({ studentId: "student-b", raw: "leave" }),
    ];
  const result = attendance.summarizeObservations(rows);
  assert.equal(result.observations, 2);
  assert.equal(result.sessions, 1);
  assert.equal(result.uniqueStudents, 2);
  assert.equal(result.counts.lateMinutesRecorded, 1);
  assert.deepEqual(
    plain(attendance.summarizeObservations([...rows].reverse())),
    plain(result),
  );
});

test("conflicting observations and inconsistent session dates cannot silently choose a winner", () => {
  for (const patch of [
    { raw: "absent" },
    { raw: "late:0" },
    { date: "2026-11-03" },
    { studentId: "student-b", date: "2026-11-03" },
  ])
    assert.throws(() =>
      attendance.summarizeObservations([observation(), observation(patch)]),
    );
  assert.throws(() =>
    attendance.summarizeObservations([
      observation({ raw: "late:0" }),
      observation({ raw: "late" }),
    ]),
  );
});

test("summary requires explicit identities and real ISO dates instead of guessing from names", () => {
  assert.throws(() => attendance.summarizeObservations(null));
  assert.throws(() => attendance.summarizeObservations({}));
  for (const row of [
    null,
    [],
    "student",
    observation({ schoolId: undefined }),
    observation({ schoolId: " " }),
    observation({ studentId: undefined, name: "نام کافی نیست" }),
    observation({ sessionId: 1 }),
    observation({ date: "2026-02-30" }),
    observation({ date: "2026-11-2" }),
    observation({ date: "۱۴۰۵/۰۸/۱۱" }),
  ])
    assert.throws(() => attendance.summarizeObservations([row]));
  assert.equal(
    attendance.summarizeObservations([observation({ date: "2024-02-29" })])
      .observations,
    1,
  );
});

test("summary uses unambiguous tuple keys rather than concatenating IDs with delimiters", () => {
  const result = attendance.summarizeObservations([
    observation({
      schoolId: "school|a",
      studentId: "student",
      sessionId: "one",
    }),
    observation({
      schoolId: "school",
      studentId: "a|student",
      sessionId: "one",
    }),
  ]);
  assert.equal(result.uniqueStudents, 2);
  assert.equal(result.studentDays, 2);
  assert.equal(result.observations, 2);
});

test("pure summary leaves frozen inputs untouched and exposes no accumulator across calls", () => {
  const rows = Object.freeze([
      Object.freeze(observation({ raw: "late:0" })),
      Object.freeze(observation({ sessionId: "session-b", raw: "leave" })),
    ]),
    before = structuredClone(rows),
    result = attendance.summarizeObservations(rows);
  assert.deepEqual(rows, before);
  result.counts.present = 100;
  result.studentDayCounts.present = 100;
  const repeated = attendance.summarizeObservations(rows);
  assert.equal(repeated.counts.present, 0);
  assert.equal(repeated.studentDayCounts.present, 1);
  const empty = attendance.summarizeObservations([]);
  assert.equal(empty.attendanceRate, null);
  assert.equal(empty.uniqueStudents, 0);
  assert.equal(empty.studentDays, 0);
  assert.equal(empty.observations, 0);
});
