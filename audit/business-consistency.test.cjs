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
    "domain/annual-modules.js",
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
test("annual report refuses conflicting annual course weights and thresholds in either term order", () => {
  const c = fixture(),
    first = lesson(c),
    second = lesson(c);
  second.gradingPolicy.practicalWeight = 80;
  second.gradingPolicy.passMin = 14;
  for (const parts of [
    [part(first, "اول"), part(second, "دوم")],
    [part(second, "دوم"), part(first, "اول")],
  ]) {
    assert.throws(
      () => c.annualGradeRows(parts, "school", "class"),
      /قواعد نمره‌دهی.*یکسان نیست/,
    );
  }
});
test("annual student, class and lesson labels consistently use the second term regardless of input order", () => {
  const c = fixture(),
    first = part(lesson(c), "اول"),
    second = part(lesson(c), "دوم");
  const classroom = second.data.schools[0].classes[0];
  classroom.name = "new class label";
  classroom.students[0].name = "new student label";
  classroom.lessons[0].name = "new lesson label";
  const a = c.annualGradeRows([first, second], "school", "class");
  const b = c.annualGradeRows([second, first], "school", "class");
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a[0].studentName, "new student label");
  assert.equal(a[0].className, "new class label");
  assert.equal(a[0].lessonName, "new lesson label");
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
test("annual general grades preserve real zero and never replace a missing stage with zero", () => {
  const c = fixture(),
    general = lesson(c);
  general.gradingPolicy.subjectType = "general";
  general.kardaneshScores.student = { theory: 0, midtermTheory: 0 };
  const first = part(general, "اول"),
    second = part(structuredClone(general), "دوم");
  const complete = c.annualGradeRows([first, second], "school", "class")[0];
  assert.equal(complete.final, 0);
  assert.equal(complete.complete, true);
  assert.equal(complete.passed, null);
  delete second.data.schools[0].classes[0].lessons[0].kardaneshScores.student
    .midtermTheory;
  const incomplete = c.annualGradeRows([first, second], "school", "class")[0];
  assert.equal(incomplete.final, null);
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.components[2].theory, null);
  assert.equal(incomplete.components[0].theory, 0);
});
test("legacy practical fields cannot make general final reports disagree with their direct assessment", () => {
  const c = fixture(),
    general = lesson(c);
  general.gradingPolicy.subjectType = "general";
  general.kardaneshScores.student = {
    practical: 18,
    theory: 12,
    midtermPractical: 18,
    midtermTheory: 12,
  };
  c.old = { calcStudentLesson: () => ({ practical: 18, theory: 12 }) };
  c.db = {};
  const result = c.calcV24(classroom(general), general, "student");
  assert.equal(result.practical, null);
  assert.equal(result.final, c.assessmentResult(general, "student").final);
  assert.equal(result.final, 12);
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

test("annual reports reject a shared lesson identity whose grading mode changed between terms", () => {
  const c = fixture(),
    dual = lesson(c),
    modular = {
      ...lesson(c),
      gradeMode: "standard",
      gradingPolicy: c.EduPolicy.defaults("modular", "1405-1406"),
      kardaneshScores: {},
      poudmans: [
        {
          id: "module",
          name: "پودمان",
          units: [],
          podScores: { student: { m: 5, c: 3 } },
        },
      ],
    };
  c.esc = String;
  for (const parts of [
    [part(dual, "اول"), part(modular, "دوم")],
    [part(modular, "اول"), part(dual, "دوم")],
  ]) {
    assert.throws(
      () => c.annualGradeRows(parts, "school", "class"),
      /شیوهٔ نمره‌دهی.*دو نوبت متفاوت/,
    );
    assert.throws(
      () => c.annualTechnicalRows(parts, "school", "class"),
      /شیوهٔ نمره‌دهی.*دو نوبت متفاوت/,
    );
    assert.throws(
      () => c.assessmentOverviewCell(dual, "student", parts, "class"),
      /شیوهٔ نمره‌دهی.*دو نوبت متفاوت/,
    );
  }
});

test("primary karnameh rejects cross-term mode conflicts before rendering in either active term", async () => {
  const c = fixture(),
    first = part(lesson(c), "اول"),
    second = part(
      {
        ...lesson(c),
        gradeMode: "standard",
        gradingPolicy: c.EduPolicy.defaults("modular", "1405-1406"),
        kardaneshScores: {},
      },
      "دوم",
    );
  first.period.id = "first";
  second.period.id = "second";
  c.state = { view: "reports", reportTab: "karnameh" };
  c.karnamehFilter = { classId: "class", studentId: "" };
  c.esc = String;
  c.overviewV24 = () => {
    throw Error("A conflicting report must not be rendered");
  };
  c.prepareKarnamehSnapshot = async () => ({ parts: [first, second] });
  for (const id of ["first", "second"]) {
    const out = { isConnected: true, innerHTML: "" };
    c.workspace = { id };
    c.captureWorkspaceContext = () => ({ id });
    c.document = { getElementById: () => out };
    await c.renderAcademicKarnameh(out, c.karnamehFilter);
    assert.match(out.innerHTML, /role="alert"/);
    assert.match(out.innerHTML, /شیوهٔ نمره‌دهی.*دو نوبت متفاوت/);
    assert.doesNotMatch(out.innerHTML, /A conflicting report/);
  }
});

test("missing lessons remain missing and equal lesson names never merge distinct identities", () => {
  const c = fixture(),
    dual = lesson(c),
    first = part(dual, "اول"),
    second = part(
      {
        ...lesson(c),
        id: "other-lesson",
        gradeMode: "standard",
        gradingPolicy: c.EduPolicy.defaults("modular", "1405-1406"),
        kardaneshScores: {},
      },
      "دوم",
    );
  c.esc = String;
  const parts = [first, second];
  const row = c.annualGradeRows(parts, "school", "class")[0];
  assert.equal(row.complete, false);
  assert.equal(row.final, null);
  assert.equal(row.components[0].final, 12);
  assert.equal(row.components[2].final, null);
  const html = c.assessmentOverviewCell(dual, "student", parts, "class");
  assert.equal(
    [...html.matchAll(/<strong>([^<]*)<\/strong>/g)]
      .map((match) => match[1])
      .join(","),
    "12.00,12.00,—,—",
  );
  second.data.schools[0].classes[0].lessons = [];
  assert.equal(
    c.annualGradeRows(parts, "school", "class")[0].components[2].final,
    null,
  );
});

test("cross-term lesson compatibility is scoped by school, class and lesson identities", () => {
  const c = fixture(),
    first = part(lesson(c), "اول"),
    second = part(lesson(c), "دوم");
  const separate = classroom({
    ...lesson(c),
    gradeMode: "standard",
    gradingPolicy: c.EduPolicy.defaults("modular", "1405-1406"),
  });
  separate.id = "other-class";
  second.data.schools[0].classes.push(separate);
  assert.equal(
    c.annualGradeRows([first, second], "school", "class")[0].final,
    12,
  );
  assert.doesNotThrow(() =>
    c.assertAnnualLessonCompatibility([first, second], "school"),
  );
  second.data.schools.push({
    id: "other-school",
    classes: [{ ...separate, id: "class" }],
  });
  assert.doesNotThrow(() =>
    c.assertAnnualLessonCompatibility([first, second], "school", "class"),
  );
});

function modularFrozenReport(
  c,
  grades = [
    { m: 5, c: 3 },
    { m: 2.5, c: 2 },
  ],
) {
  const policy = c.EduPolicy.defaults("modular", "1405-1406"),
    pods = grades.map((grade, index) => ({
      id: "module-" + index,
      name: "پودمان " + index,
      podScores: { student: grade },
    })),
    result = c.EduPolicy.lesson(policy, pods, "student");
  return {
    id: "report",
    workspace: "period",
    year: "1405-1406",
    term: "اول",
    at: "2026-11-01T00:00:00Z",
    classes: [
      {
        school: "مدرسه",
        name: "کلاس",
        students: [
          {
            id: "student",
            name: "هنرجو",
            average: result.final,
            lessons: [
              {
                id: "lesson",
                name: "درس",
                mode: "standard",
                policy,
                modules: result.modules,
                final: result.final,
                passed: result.passed,
              },
            ],
          },
        ],
      },
    ],
  };
}

test("canonical modular aggregation preserves complete, failed, incomplete and empty lesson results", () => {
  const c = fixture(),
    policy = c.EduPolicy.defaults("modular", "1405-1406");
  for (const [grades, final, passed, complete] of [
    [
      [
        { m: 5, c: 3 },
        { m: 2.5, c: 2 },
      ],
      16.25,
      true,
      true,
    ],
    [
      [
        { m: 5, c: 3 },
        { m: 5, c: 1 },
      ],
      null,
      false,
      true,
    ],
    [[{ m: 5, c: 3 }, { m: 5 }], null, null, false],
    [[], null, null, false],
  ]) {
    const pods = grades.map((grade, index) => ({
      id: "module-" + index,
      name: "پودمان " + index,
      podScores: { student: grade },
    }));
    const result = c.EduPolicy.lesson(policy, pods, "student"),
      before = JSON.stringify(result.modules),
      aggregate = c.EduPolicy.moduleAggregate(result.modules);
    assert.equal(result.final, final);
    assert.equal(result.passed, passed);
    assert.equal(result.complete, complete);
    for (const key of [
      "final",
      "passed",
      "complete",
      "provisionalAverage",
      "reason",
    ])
      assert.equal(aggregate[key], result[key]);
    assert.equal(JSON.stringify(result.modules), before);
  }
});

test("modern frozen modular reports validate canonical aggregate results without display rounding", () => {
  const c = fixture(),
    report = modularFrozenReport(c);
  assert.equal(c.validateFrozenReport(report), true);
  assert.equal(report.classes[0].students[0].lessons[0].final, 16.25);
  const precise = modularFrozenReport(c, [
    { m: 2.5, c: 2 },
    { m: 3, c: 2 },
  ]);
  assert.equal(c.validateFrozenReport(precise), true);
  const student = precise.classes[0].students[0];
  student.lessons[0].final = 13;
  student.average = 13;
  assert.throws(() => c.validateFrozenReport(precise));
});

test("failed and incomplete modular frozen grades remain null rather than fabricated zero or passing values", () => {
  const c = fixture();
  for (const grades of [
    [
      { m: 5, c: 3 },
      { m: 5, c: 1 },
    ],
    [{ m: 5, c: 3 }, {}],
  ]) {
    const report = modularFrozenReport(c, grades),
      item = report.classes[0].students[0].lessons[0];
    assert.equal(item.final, null);
    assert.equal(c.validateFrozenReport(report), true);
    for (const change of [{ final: 20 }, { final: 0 }, { passed: true }]) {
      const corrupt = structuredClone(report);
      Object.assign(corrupt.classes[0].students[0].lessons[0], change);
      assert.throws(() => c.validateFrozenReport(corrupt));
    }
  }
});

test("modern modular frozen reports reject inconsistent module states and impossible passing thresholds", () => {
  const c = fixture();
  for (const change of [
    { complete: false },
    { final: null },
    { passed: null },
    { final: 5, passed: true },
  ]) {
    const report = modularFrozenReport(c);
    Object.assign(report.classes[0].students[0].lessons[0].modules[0], change);
    assert.throws(() => c.validateFrozenReport(report));
  }
  const report = modularFrozenReport(c);
  report.classes[0].students[0].lessons[0].modules = [];
  assert.throws(() => c.validateFrozenReport(report));
});

test("modern frozen student averages must match lesson results while legacy averages remain untouched", () => {
  const c = fixture(),
    report = modularFrozenReport(c),
    student = report.classes[0].students[0];
  student.average = 20;
  assert.throws(() => c.validateFrozenReport(report));
  delete student.lessons[0].policy;
  const before = JSON.stringify(report);
  assert.equal(c.validateFrozenReport(report), true);
  assert.equal(JSON.stringify(report), before);
});
