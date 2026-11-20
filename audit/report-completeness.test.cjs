"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const context = vm.createContext({ Intl });
  context.root = context;
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
    "domain/reporting/completeness.js",
    "domain/reporting/academic-summary.js",
    "reports/periodic/text.js",
    "reports/periodic/review.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      context,
    );
  context.esc = (value) =>
    String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return context;
}
const counts = (extra = {}) => ({
  present: 0,
  late: 0,
  absent: 0,
  leave: 0,
  unknown: 0,
  ...extra,
});
test("recording completeness includes leave and absence, with partial/empty registers separate", () => {
  const context = fixture(),
    model = {
      sessions: [
        {
          counts: counts({
            present: 1,
            late: 1,
            absent: 1,
            leave: 1,
            unknown: 1,
          }),
        },
        { counts: counts({ unknown: 2 }) },
        { counts: counts() },
      ],
      students: [],
    },
    result = context.EduReportCompleteness.build(model);
  assert.equal(result.expected, 7);
  assert.equal(result.recorded, 4);
  assert.equal(result.unknown, 3);
  assert.equal(result.completionRate, (4 / 7) * 100);
  assert.equal(result.partialSessions, 1);
  assert.equal(result.unrecordedSessions, 1);
  assert.equal(result.emptyRosterSessions, 1);
});
test("no observations never claims one hundred percent completion", () => {
  const context = fixture();
  for (const sessions of [[], [{ counts: counts() }]]) {
    const result = context.EduReportCompleteness.build({
      sessions,
      students: [],
    });
    assert.equal(result.expected, 0);
    assert.equal(result.completionRate, null);
  }
});
test("follow-up orders missing records before recorded absences without changing source", () => {
  const context = fixture(),
    students = [
      { studentId: "p", name: "present", sessions: 5, present: 5 },
      { studentId: "a", name: "absent", sessions: 5, absent: 3 },
      { studentId: "u", name: "unknown", sessions: 5, unknown: 1 },
      { studentId: "l", name: "late", sessions: 5, late: 2 },
    ],
    before = JSON.stringify(students),
    result = context.EduReportCompleteness.build({ sessions: [], students });
  assert.equal(result.followup.map((row) => row.studentId).join(), "u,a,l");
  assert.equal(JSON.stringify(students), before);
});
test("real parent projection keeps quality and follow-up within the selected historical roster member", () => {
  const context = fixture(),
    a = { id: "a", name: "SELECTED" },
    b = { id: "b", name: "PRIVATE_PERSON" },
    data = {
      settings: { academicYear: "1405-1406" },
      schools: [
        {
          id: "s",
          name: "School",
          classes: [
            {
              id: "c",
              name: "Class",
              students: [b],
              archivedStudents: [a],
              lessons: [{ id: "l", name: "Lesson" }],
            },
          ],
        },
      ],
      sessions: [
        {
          id: "x",
          schoolId: "s",
          classId: "c",
          lessonId: "l",
          period: 0,
          date: "2026-11-01",
          roster: [a, b],
          attendance: { b: "absent" },
          scores: [],
        },
      ],
    },
    model = context.EduReportModel.build(
      data,
      {
        mode: "daily",
        date: "2026-11-01",
        schoolId: "s",
        classId: "c",
        studentId: "a",
        audience: "parent",
      },
      { generatedAt: "2026-11-20T12:00:00Z" },
    ),
    result = context.EduReportCompleteness.build(model),
    html = context.reportReviewHtml(model);
  assert.equal(result.expected, 1);
  assert.equal(result.unknown, 1);
  assert.equal(result.followup[0].name, "SELECTED");
  assert.doesNotMatch(JSON.stringify(result) + html, /PRIVATE_PERSON/);
  assert.match(html, /میزان تکمیل ثبت است؛ نرخ حضور نیست/);
});
test("review reports incomplete assessments and unclassified complete results without fabricated pass rates", () => {
  const context = fixture(),
    model = {
      audience: "management",
      sessions: [],
      students: [],
      annualGrades: [
        {
          classId: "c",
          className: "کلاس",
          lessonId: "l",
          lessonName: "<درس>",
          studentId: "a",
          general: true,
          complete: true,
          passed: null,
        },
      ],
    },
    html = context.reportReviewHtml(model);
  assert.match(html, /&lt;درس&gt;/);
  assert.match(html, /بدون معیار/);
  assert.match(html, /<td>—<\/td>/);
  assert.doesNotMatch(html, /۱۰۰٪/);
});
