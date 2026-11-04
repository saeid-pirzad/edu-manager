"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const plain = (value) => JSON.parse(JSON.stringify(value));
const root = path.resolve(__dirname, "..");
const generatedAt = "2026-11-04T10:00:00.000Z";
function load(context, name, overrides) {
  vm.runInContext(
    overrides?.[name] ?? fs.readFileSync(path.join(root, "src", name), "utf8"),
    context,
    { filename: name },
  );
}
function projectionFixture(overrides = {}) {
  const context = vm.createContext({});
  for (const name of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
  ])
    load(context, name, overrides);
  return context;
}
function databaseFixture(overrides = {}) {
  const context = vm.createContext({
    structuredClone,
    TYPE_LABELS: {
      classGrade: "Grade",
      positive: "Positive",
      activity: "Activity",
    },
    old: {
      defaultDB: () => ({
        schools: [],
        sessions: [],
        settings: {},
        masterSchedule: {},
        activeDays: [0, 1, 2, 3, 4, 5],
        periods: 6,
      }),
    },
  });
  for (const name of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/grade-math.js",
    "domain/data-boundary.js",
    "domain/grade-policy.js",
    "workspace/domain/defaults-numbers.js",
    "legacy/validation/database.js",
    "legacy/students/roster.js",
    "workspace/grading/scope.js",
    "workspace/courses/rules.js",
    "workspace/validation/database.js",
  ])
    load(context, name, overrides);
  context.old.validateDB = context.legacy_validateDB;
  return context;
}
function syntheticData({
  classes = 3,
  pupils = 12,
  sessionsPerClass = 4,
  marksPerPupil = 3,
} = {}) {
  const classrooms = Array.from({ length: classes }, (_, ci) => ({
    id: "class_" + ci,
    name: "Class " + ci,
    students: Array.from({ length: pupils }, (_, si) => ({
      id: "student_" + ci + "_" + si,
      name: "Student " + si,
      code: String(si + 1),
    })),
    archivedStudents: [],
    lessons: [
      {
        id: "lesson_" + ci,
        name: "Lesson " + ci,
        gradeMode: "standard",
        poudmans: [],
      },
    ],
  }));
  return {
    schemaVersion: 26,
    settings: { academicYear: "1405-1406", academicTerm: "first" },
    schools: [{ id: "school", name: "School", classes: classrooms }],
    masterSchedule: {},
    activeDays: [0, 1, 2, 3, 4, 5],
    periods: 6,
    sessions: classrooms.flatMap((cls, ci) =>
      Array.from({ length: sessionsPerClass }, (_, index) => ({
        id: "session_" + ci + "_" + index,
        schoolId: "school",
        classId: cls.id,
        lessonId: cls.lessons[0].id,
        date: "2026-11-" + String(1 + Math.floor(index / 12)).padStart(2, "0"),
        period: index % 12,
        poudmanId: null,
        unitId: null,
        roster: cls.students.map((student) => ({
          ...student,
          name: "Historic " + student.name,
        })),
        attendance: Object.fromEntries(
          cls.students.map((student, si) => [
            student.id,
            ["present", "absent", "leave", "late:0"][si % 4],
          ]),
        ),
        scores: cls.students.flatMap((student) =>
          Array.from({ length: marksPerPupil }, (_, mi) => ({
            studentId: student.id,
            type: "classGrade",
            value: mi,
            note: "Mark " + mi,
          })),
        ),
      })),
    ),
  };
}
function project(context, source, extra = {}) {
  return context.EduReportModel.build(
    source,
    {
      schoolId: "school",
      mode: "daily",
      date: "2026-11-01",
      audience: "management",
      ...extra,
    },
    { generatedAt },
  );
}

test("normalization indexes sessions without changing class ownership, source order or recovered history", () => {
  const c = databaseFixture();
  const source = syntheticData({ classes: 2, pupils: 2, sessionsPerClass: 2 });
  source.sessions.reverse();
  const firstClass = source.schools[0].classes[0];
  const historic = source.sessions.find(
    (session) => session.classId === firstClass.id,
  );
  historic.attendance.recovered = "leave";
  delete historic.roster;
  let knownCalls = 0;
  const known = c.knownStudents;
  c.knownStudents = (cls) => {
    knownCalls++;
    return known(cls);
  };
  const before = JSON.stringify(source);
  const normalized = c.normalizeDB(source, { legacy: true });
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(
    plain(normalized.sessions.map((session) => session.id)),
    source.sessions.map((session) => session.id),
  );
  assert.deepEqual(
    plain(
      normalized.schools[0].classes[0].archivedStudents.map(
        (student) => student.id,
      ),
    ),
    ["recovered"],
  );
  assert.equal(normalized.schools[0].classes[1].archivedStudents.length, 0);
  const restored = normalized.sessions.find(
    (session) => session.id === historic.id,
  );
  assert.deepEqual(plain(restored.roster.map((student) => student.id)), [
    ...Object.keys(historic.attendance),
  ]);
  assert.equal(restored.attendance.recovered, "leave");
  assert.equal(
    knownCalls,
    source.schools[0].classes.length * 2,
    "known membership is prepared once per class in normalization and validation",
  );
  const invalid = structuredClone(normalized);
  invalid.sessions[0].roster = [];
  assert.throws(() => c.validateV24(invalid), /\u062e\u0627\u0631\u062c/);
});

test("warning refresh computes one academic range while retaining invalid-date and empty-session behavior", () => {
  const c = databaseFixture();
  const dates = [
    "2026-11-01",
    "2027-02-29",
    "2026-11-31",
    "bad",
    null,
    undefined,
    "2025-11-01",
  ];
  const outside = dates.filter(
    (date) => !c.EduAcademicYear.contains("1405-1406", date),
  ).length;
  const data = {
    settings: { academicYear: "1405-1406" },
    sessions: dates.map((date) => ({ date })),
    migrationWarnings: ["keep", "keep"],
  };
  let conversions = 0;
  const convert = c.jalaliToGregorian;
  c.jalaliToGregorian = (...args) => {
    conversions++;
    return convert(...args);
  };
  c.refreshAcademicYearWarnings(data);
  assert.equal(
    conversions,
    2,
    "one range performs only its two boundary conversions",
  );
  assert.equal(data.migrationWarnings[0], "keep");
  assert.equal(data.migrationWarnings.length, 2);
  assert.ok(
    data.migrationWarnings[1].includes(outside.toLocaleString("fa-IR")),
  );
  assert.deepEqual(
    plain(
      c.refreshAcademicYearWarnings({
        settings: { academicYear: "invalid" },
        sessions: [],
      }),
    ),
    [],
  );
  assert.throws(() =>
    c.refreshAcademicYearWarnings({
      settings: { academicYear: "invalid" },
      sessions: [{ date: "bad" }],
    }),
  );
});

test("periodic indexes preserve participant, mark and historic fallback order without caching mutable data", () => {
  const c = projectionFixture();
  const source = syntheticData({ classes: 1, pupils: 2, sessionsPerClass: 1 });
  const cls = source.schools[0].classes[0],
    [a, b] = cls.students;
  cls.archivedStudents.push({ ...a, name: "Archived duplicate", code: "999" });
  source.sessions[0].roster = [
    { ...b, name: "Past B" },
    { id: a.id, name: "Past A", code: "" },
  ];
  source.sessions[0].attendance = {
    [a.id]: "present",
    "attendance-only": "leave",
  };
  source.sessions[0].scores = [
    { studentId: a.id, type: "classGrade", value: 0, note: "A first" },
    { studentId: b.id, type: "activity", note: "B missing" },
    { studentId: a.id, type: "positive", value: 2, note: "A second" },
    { studentId: "score-only", type: "classGrade", value: 12 },
  ];
  const before = JSON.stringify(source),
    report = project(c, source);
  const session = report.sessions[0];
  assert.deepEqual(
    plain(session.participants.map((person) => person.studentId)),
    [b.id, a.id, "attendance-only", "score-only"],
  );
  assert.deepEqual(plain(session.marks.map((mark) => mark.note)), [
    "B missing",
    "A first",
    "A second",
    "",
  ]);
  assert.equal(session.participants[1].name, "Past A");
  assert.equal(
    session.participants[1].code,
    a.code,
    "historic blank code uses the first current identity, not the last map entry",
  );
  assert.deepEqual(
    plain(session.participants[1].scores.map((score) => score.value)),
    [0, 2],
  );
  assert.equal(session.participants[0].scores[0].value, null);
  assert.equal(JSON.stringify(source), before);
  a.code = "changed";
  source.sessions[0].scores.push({
    studentId: a.id,
    type: "classGrade",
    value: 20,
  });
  cls.lessons[0].name = "Renamed lesson";
  const refreshed = project(c, source);
  assert.equal(refreshed.sessions[0].participants[1].code, "changed");
  assert.equal(refreshed.sessions[0].participants[1].scores.length, 3);
  assert.equal(refreshed.sessions[0].lessonName, "Renamed lesson");
});

test("prefiltered sorting and score buckets retain chronological/dedup order and parent privacy", () => {
  const c = projectionFixture();
  const source = syntheticData({ classes: 2, pupils: 2, sessionsPerClass: 2 });
  source.sessions.reverse();
  const first = source.sessions.find(
    (session) => session.classId === "class_0" && session.period === 0,
  );
  source.sessions.push({ ...structuredClone(first), period: 2 });
  let unrelatedDateReads = 0;
  const other = structuredClone(first);
  other.schoolId = "unrelated";
  Object.defineProperty(other, "date", {
    get: () => {
      unrelatedDateReads++;
      return "2026-11-01";
    },
  });
  source.sessions.push(other);
  const report = project(c, source, { classId: "class_0" });
  assert.equal(
    unrelatedDateReads,
    0,
    "unselected sessions are excluded before sorting",
  );
  assert.deepEqual(
    plain(report.sessions.map((session) => session.period)),
    [0, 1],
  );
  assert.equal(report.warnings.length, 1);
  const parent = project(c, source, {
    classId: "class_0",
    studentId: "student_0_1",
    audience: "parent",
  });
  assert.ok(
    parent.sessions.every((session) =>
      session.participants.every(
        (person) => person.studentId === "student_0_1",
      ),
    ),
  );
  assert.ok(
    parent.sessions.every((session) =>
      session.marks.every((mark) => mark.studentId === "student_0_1"),
    ),
  );
});

test("large projections read class identities once and bucket each score without a pupil-by-score rescan", () => {
  const c = projectionFixture();
  const source = syntheticData({
    classes: 1,
    pupils: 20,
    sessionsPerClass: 10,
  });
  let identityReads = 0,
    scoreReads = 0;
  const cls = source.schools[0].classes[0];
  for (const student of cls.students) {
    const id = student.id;
    Object.defineProperty(student, "id", {
      get: () => {
        identityReads++;
        return id;
      },
    });
  }
  for (const session of source.sessions)
    for (const score of session.scores) {
      const id = score.studentId;
      Object.defineProperty(score, "studentId", {
        get: () => {
          scoreReads++;
          return id;
        },
      });
    }
  const report = project(c, source);
  const count = source.sessions.reduce(
    (sum, session) => sum + session.scores.length,
    0,
  );
  assert.equal(report.summary.recordedMarks, count);
  const historicCopies = source.sessions.reduce(
    (sum, session) => sum + session.roster.length,
    0,
  );
  assert.ok(
    identityReads <= cls.students.length * 4 + historicCopies,
    "class identities must not be rescanned for every historic pupil",
  );
  assert.ok(
    scoreReads <= count * 2,
    "scores must not be rescanned once per participant",
  );
});
