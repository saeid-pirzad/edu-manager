"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const c = vm.createContext({ structuredClone });
  for (const file of [
    "domain/grade-math.js",
    "domain/data-boundary.js",
    "domain/grade-policy.js",
    "workspace/domain/defaults-numbers.js",
    "workspace/grading/results.js",
    "workspace/reports/finalize.js",
    "validation/frozen-report.js",
    "workspace/reports/student.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  c.knownStudents = (cls) => [...cls.students, ...(cls.archivedStudents || [])];
  return c;
}
const lesson = (c) => ({
  id: "lesson",
  name: "درس",
  gradeMode: "kardanesh",
  poudmans: [],
  gradingPolicy: {
    ...c.EduPolicy.defaults("dual", "1405-1406"),
    dualConfigurable: true,
    practicalWeight: 60,
    passMin: 12,
  },
  kardaneshScores: {
    student: {
      practical: 20,
      theory: 0,
      midtermPractical: 20,
      midtermTheory: 0,
    },
  },
});
const classroom = (l) => ({
  id: "class",
  name: "کلاس",
  students: [{ id: "student", name: "هنرجو" }],
  lessons: [l],
});
const part = (l, term) => ({
  period: { term },
  data: { schools: [{ id: "school", classes: [classroom(l)] }] },
});
test("assessment and annual report honor custom grading weights and thresholds", () => {
  const c = fixture(),
    l = lesson(c);
  const result = c.assessmentResult(l, "student", "final");
  assert.equal(result.final, 12);
  assert.equal(result.passed, true);
  assert.equal(result.threshold, 12);
  const annual = c.annualGradeRows(
    [part(l, "اول"), part(l, "دوم")],
    "school",
    "class",
  )[0];
  assert.equal(annual.final, 12);
  assert.equal(annual.passed, true);
  assert.equal(annual.threshold, 12);
});
test("annual report uses each term policy and the second term threshold independent of input order", () => {
  const c = fixture(),
    first = lesson(c),
    second = lesson(c);
  second.gradingPolicy.practicalWeight = 80;
  second.gradingPolicy.passMin = 14;
  for (const parts of [
    [part(first, "اول"), part(second, "دوم")],
    [part(second, "دوم"), part(first, "اول")],
  ]) {
    const r = c.annualGradeRows(parts, "school", "class")[0];
    assert.equal(r.final, 14);
    assert.equal(r.passed, true);
    assert.equal(r.threshold, 14);
  }
});
test("annual grading keeps legacy 70/30 results and rejects mixed general/vocational identities", () => {
  const c = fixture(),
    l = lesson(c);
  delete l.gradingPolicy.dualConfigurable;
  assert.equal(c.assessmentResult(l, "student").final, 14);
  const general = structuredClone(l);
  general.gradingPolicy.subjectType = "general";
  assert.throws(() =>
    c.annualGradeRows(
      [part(l, "اول"), part(general, "دوم")],
      "school",
      "class",
    ),
  );
});
test("unconfirmed metadata cannot block a complete report after confirmation control was removed", () => {
  const c = fixture(),
    l = lesson(c);
  c.db = {
    schools: [{ id: "school", name: "مدرسه", classes: [classroom(l)] }],
  };
  c.workspace = { year: "1405-1406" };
  c.getSortedStudents = (cls) => cls.students;
  c.calcV24 = (_cls, item, sid) => ({
    avgM: null,
    avgP: null,
    ...c.assessmentResult(item, sid),
  });
  const report = c.finalReportData();
  assert.equal(report.missing.length, 0);
  const frozen = {
    id: "report",
    workspace: "period",
    year: "1405-1406",
    term: "اول",
    at: new Date().toISOString(),
    classes: report.classes,
  };
  assert.equal(c.validateFrozenReport(frozen), true);
  frozen.classes[0].students[0].lessons[0].assessments.final.final = 14;
  assert.throws(() => c.validateFrozenReport(frozen));
});
test("missing midterm still blocks period finalization even when final grade is complete", () => {
  const c = fixture(),
    l = lesson(c);
  delete l.kardaneshScores.student.midtermTheory;
  c.db = { schools: [{ name: "مدرسه", classes: [classroom(l)] }] };
  c.workspace = { year: "1405-1406" };
  c.getSortedStudents = (cls) => cls.students;
  c.calcV24 = (_cls, item, sid) => c.assessmentResult(item, sid);
  assert.ok(c.finalReportData().missing.some((x) => x.includes("میان‌ترم")));
});
