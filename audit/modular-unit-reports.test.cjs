"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture({ complete = false } = {}) {
  const c = vm.createContext({
    structuredClone,
    Intl,
    workspace: {
      id: "first",
      year: "1405-1406",
      term: "اول",
      termKind: "first",
    },
    esc: (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    getSortedStudents: (classroom) => classroom.students,
    knownStudents: (classroom) => [
      ...classroom.students,
      ...(classroom.archivedStudents || []),
    ],
    modeLabel: () => "سالانه",
    faDate: (value) => value,
  });
  for (const name of [
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/reporting/academic-results.js",
    "domain/annual-modules.js",
    "workspace/domain/defaults-numbers.js",
    "legacy/grading/calculation.js",
    "legacy/grading/kardanesh.js",
    "services/grading-results.js",
    "workspace/grading/results.js",
    "workspace/courses/results.js",
    "workspace/reports/finalize.js",
    "workspace/reports/student.js",
    "workspace/reports/karnameh-grid.js",
    "services/karnameh-excel.js",
    "workspace/reports/karnameh-excel-data.js",
    "validation/frozen-report.js",
    "reports/periodic/text.js",
    "reports/periodic/document.js",
    "reports/periodic/excel.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
      c,
      { filename: name },
    );
  c.old = { calcStudentLesson: c.legacy_calcStudentLesson };
  c.gradeStatus = c.policyStatus;
  c.root = { EduV24: { finalText: c.finalText } };
  const inputs = [
      { m: 0, c: 3 },
      { m: 4.5, c: 3 },
      { m: 1, c: 1 },
      complete ? { m: 2, c: 2 } : { m: 2 },
    ],
    lesson = {
      id: "lesson",
      name: "درس واحدمحور",
      teacher: "دبیر",
      gradeMode: "standard",
      gradingPolicy: {
        ...plain(c.EduPolicy.defaults("modular", "1405-1406")),
        version: 2,
        modularScope: "unit",
      },
      poudmans: [0, 1].map((index) => ({
        id: "pod" + index,
        name: "پودمان " + index,
        podScores: { student: { m: 5, c: 3 } },
        units: [0, 1].map((offset) => ({
          id: "unit" + (index * 2 + offset),
          name: "واحد " + (index * 2 + offset),
          unitScores: { student: { m: 20, p: 20 } },
          competencyScores: {
            student: inputs[index * 2 + offset],
            private: { m: 5, c: 3 },
          },
        })),
      })),
    },
    classroom = {
      id: "class",
      name: "کلاس",
      students: [{ id: "student", name: "هنرجو", code: "001" }],
      archivedStudents: [{ id: "private", name: "PRIVATE" }],
      lessons: [lesson],
    },
    data = {
      schools: [{ id: "school", name: "مدرسه", classes: [classroom] }],
      sessions: [],
    },
    parts = [
      {
        period: { ...c.workspace },
        data,
      },
    ];
  c.db = data;
  const report = () => ({
    id: "report",
    workspace: c.workspace.id,
    year: c.workspace.year,
    term: c.workspace.term,
    at: "2026-11-17T12:00:00.000Z",
    classes: c.finalReportData().classes,
  });
  return { c, lesson, classroom, parts, report };
}

test("unit-based live and frozen reports preserve independent raw grades and never add module or course totals", () => {
  const { c, lesson, report } = fixture(),
    snapshot = report(),
    saved = snapshot.classes[0].students[0].lessons[0],
    before = JSON.stringify(snapshot);
  assert.equal(c.validateFrozenReport(snapshot), true);
  assert.equal(saved.unitBased, true);
  assert.equal(saved.final, null);
  assert.equal(saved.passed, null);
  assert.equal(snapshot.classes[0].students[0].average, null);
  assert.deepEqual(
    plain(saved.modules.flatMap((pod) => pod.units.map((unit) => unit.inputs))),
    [
      { m: 0, c: 3 },
      { m: 4.5, c: 3 },
      { m: 1, c: 1 },
      { m: 2, c: null },
    ],
  );
  for (const html of [
    c.modularOverviewCell(lesson, "student"),
    c.frozenLessonRows(saved),
  ]) {
    assert.equal((html.match(/data-unit-id=/g) || []).length, 4);
    assert.equal((html.match(/class="report-unit-module"/g) || []).length, 2);
    assert.match(html, /15\.00/);
    assert.match(html, /19\.50/);
    assert.match(html, /6\.00/);
    assert.match(html, /<b>0<\/b>/);
    assert.doesNotMatch(html, /نهایی درس|report-modular-final|20\.00|PRIVATE/);
  }
  lesson.poudmans[0].units[0].competencyScores.student.m = 5;
  lesson.poudmans[0].units[0].name = "نام جدید";
  assert.equal(JSON.stringify(snapshot), before);
});

test("unit-based closure permits first-term progress and requires each real unit only at year end", () => {
  const { c, lesson } = fixture();
  assert.deepEqual(plain(c.finalReportData().missing), []);
  c.workspace.termKind = "second";
  c.workspace.term = "دوم";
  const missing = plain(c.finalReportData().missing);
  assert.equal(missing.length, 1);
  assert.match(missing[0], /پودمان 1 \/ واحد 3$/);
  lesson.poudmans[1].units[1].competencyScores.student.c = 2;
  assert.deepEqual(plain(c.finalReportData().missing), []);
  assert.equal(
    c.validateFrozenReport({
      id: "r",
      workspace: "second",
      year: "1405-1406",
      term: "دوم",
      at: "2026-11-17T12:00:00.000Z",
      classes: c.finalReportData().classes,
    }),
    true,
  );
});

test("unit frozen validation rejects forged raw values, results, identities and aggregate grades", () => {
  const { c, report } = fixture();
  const changes = [
    (lesson) => {
      lesson.final = 18;
    },
    (lesson) => {
      lesson.passed = true;
    },
    (lesson) => {
      lesson.complete = true;
    },
    (lesson) => {
      lesson.modules[0].final = 17;
    },
    (lesson) => {
      lesson.modules[0].passed = true;
    },
    (lesson) => {
      lesson.modules[0].inputs = { m: 0, c: 3 };
    },
    (lesson) => {
      lesson.modules[0].units[0].inputs.m = 0.25;
    },
    (lesson) => {
      lesson.modules[0].units[0].inputs.c = 4;
    },
    (lesson) => {
      lesson.modules[0].units[0].inputs.m = "0";
    },
    (lesson) => {
      delete lesson.modules[0].units[0].inputs;
    },
    (lesson) => {
      lesson.modules[0].units[0].final = 20;
    },
    (lesson) => {
      lesson.modules[0].units[0].passed = false;
    },
    (lesson) => {
      lesson.modules[0].units[0].complete = false;
    },
    (lesson) => {
      lesson.modules[0].units[0].threshold = 0;
    },
    (lesson) => {
      lesson.modules[0].units[0].reason = "قبول";
    },
    (lesson) => {
      lesson.modules[1].units[0].id = "unit0";
    },
    (lesson) => {
      lesson.unitBased = false;
    },
    (lesson) => {
      lesson.policy.version = 1;
    },
    (lesson) => {
      lesson.policy.version = 3;
    },
  ];
  for (const change of changes) {
    const snapshot = report();
    change(snapshot.classes[0].students[0].lessons[0]);
    assert.throws(() => c.validateFrozenReport(snapshot), change.toString());
  }
  const fakeAverage = report();
  fakeAverage.classes[0].students[0].average = 18;
  assert.throws(() => c.validateFrozenReport(fakeAverage));
});

test("a unit-based course does not make another course average incomplete or supply an aggregate of its own", () => {
  const { c, classroom, report } = fixture({ complete: true });
  const policy = plain(c.EduPolicy.defaults("modular", "1405-1406"));
  classroom.lessons.push({
    id: "old",
    name: "پودمانی قبلی",
    gradeMode: "standard",
    gradingPolicy: policy,
    poudmans: [
      {
        id: "old_pod",
        name: "پودمان قدیمی",
        units: [],
        podScores: { student: { m: 3, c: 3 } },
      },
    ],
  });
  const snapshot = report();
  assert.equal(snapshot.classes[0].students[0].average, 18);
  assert.equal(c.validateFrozenReport(snapshot), true);
  const results = classroom.lessons.map((lesson) =>
    c.calcV24(classroom, lesson, "student"),
  );
  assert.equal(c.averageLabel(results).missing, 0);
  assert.equal(c.averageLabel(results).average, 18);
  snapshot.classes[0].students[0].average = 19;
  assert.throws(() => c.validateFrozenReport(snapshot));
});

test("unit frozen validation rejects forged provisional averages at both course and module levels", () => {
  const { c, report } = fixture({ complete: true });
  const accepted = [];
  for (const scope of ["course", "module"]) {
    const snapshot = report();
    const lesson = snapshot.classes[0].students[0].lessons[0];
    const target = scope === "course" ? lesson : lesson.modules[0];
    target.provisionalAverage = 18;
    try {
      c.validateFrozenReport(snapshot);
      accepted.push(scope);
    } catch (error) {
      assert.match(error.message, /کارنامه ثابت معتبر نیست/);
    }
  }
  assert.deepEqual(accepted, []);
});

test("individual grade sheet and parent text show every unit with no artificial missing course or average", () => {
  const { c, classroom, parts } = fixture({ complete: true });
  const html = c.individualKarnameh(classroom, {
    parts,
    schoolId: "school",
    student: classroom.students[0],
  });
  const unitCells = [...html.matchAll(/data-karnameh-unit="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(new Set(unitCells).size, 4);
  for (const unitId of new Set(unitCells))
    assert.equal(unitCells.filter((id) => id === unitId).length, 3);
  assert.equal(
    (html.match(/data-karnameh-field="unit-result"/g) || []).length,
    4,
  );
  assert.match(html, /نتیجه واحد/);
  assert.doesNotMatch(html, /نهایی درس|میانگین|20[٫.]00|PRIVATE/);
  const text = c.parentReportV24(classroom.students[0], classroom);
  assert.match(text, /واحد 0: مستمر 0 \| شایستگی 3 \| 15\.00/);
  assert.match(text, /واحد 2: مستمر 1 \| شایستگی 1 \| 6\.00/);
  assert.doesNotMatch(text, /نهایی|میانگین|ناقص|PRIVATE/);
  assert.equal(
    c.averageLabel([c.calcV24(classroom, classroom.lessons[0], "student")])
      .missing,
    0,
  );
});

test("karnameh Excel emits one annual row per unit with raw inputs and numeric independent results", () => {
  const { c, classroom, parts } = fixture({ complete: true });
  const second = structuredClone(parts[0]);
  second.period = { id: "second", term: "دوم", year: "1405-1406" };
  const sheets = plain(
    c.karnamehExcelSheets({
      parts: [...parts, second],
      schoolId: "school",
      classroom,
      studentId: "student",
      year: "1405-1406",
      generatedAt: "2026-11-17T12:00:00.000Z",
    }),
  );
  const units = sheets.find((sheet) => sheet.name === "واحدهای کار پودمانی");
  assert.ok(units);
  assert.equal(units.rows.length, 5);
  assert.deepEqual(units.rows[1].slice(5), [
    "پودمان 0",
    "واحد 0",
    0,
    3,
    15,
    "قبول",
  ]);
  assert.deepEqual(units.rows[3].slice(5), [
    "پودمان 1",
    "واحد 2",
    1,
    1,
    6,
    "نیازمند جبران",
  ]);
  assert.ok(
    !sheets.some((sheet) =>
      ["پودمانی", "جزئیات واحد کار"].includes(sheet.name),
    ),
  );
  assert.doesNotMatch(JSON.stringify(sheets), /PRIVATE/);
});

function periodicModel(f) {
  return {
    mode: "annual",
    audience: "parent",
    detailLevel: "full",
    school: { id: "school", name: "مدرسه" },
    class: { id: "class", name: "کلاس" },
    student: { id: "student", name: "هنرجو", code: "001" },
    academicYear: "1405-1406",
    academicTerm: "اول",
    start: "2026-11-17",
    end: "2026-11-17",
    generatedAt: "2026-11-17T12:00:00.000Z",
    author: "",
    note: "",
    definitions: [],
    warnings: [],
    summary: {
      sessions: 0,
      students: 0,
      present: 0,
      absent: 0,
      late: 0,
      leave: 0,
      unknown: 0,
      attendanceRate: null,
      recordedMarks: 0,
    },
    students: [],
    lessons: [],
    days: [],
    sessions: [],
    currentGrades: [],
    technicalGrades: f.c.annualTechnicalRows(
      f.parts,
      "school",
      "class",
      "student",
    ),
  };
}

test("periodic document, text and Excel keep unit-based annual grades independent without fake aggregates", () => {
  const f = fixture({ complete: true }),
    m = periodicModel(f);
  assert.equal(m.technicalGrades.length, 1);
  const html = f.c.documentHtml(m),
    text = f.c.textReport(m),
    sheets = plain(f.c.excelReportSheets(m));
  for (const output of [html, text]) {
    assert.match(output, /واحد 0/);
    assert.match(output, /واحد 3/);
    assert.match(output, /15[٫.]00/);
    assert.doesNotMatch(output, /نتیجه درس|نمره پودمان|نهایی سالانه|PRIVATE/);
  }
  const units = sheets.find((sheet) => sheet.name === "واحدهای کار پودمانی");
  assert.ok(units);
  assert.equal(units.rows.length, 5);
  assert.deepEqual(units.rows[1].slice(-6), [
    "پودمان 0",
    "واحد 0",
    0,
    3,
    15,
    "قبول",
  ]);
  assert.ok(
    !sheets.some((sheet) =>
      ["نتیجه فنی", "پودمان‌ها", "واحدهای کار"].includes(sheet.name),
    ),
  );
});

test("periodic current-grade views display the unit inputs without a nonexistent module or course result", () => {
  const f = fixture({ complete: true }),
    m = periodicModel(f);
  m.technicalGrades = [];
  m.currentGrades = [
    {
      ...f.c.EduPolicy.lesson(
        f.lesson.gradingPolicy,
        f.lesson.poudmans,
        "student",
      ),
      lessonName: f.lesson.name,
      method: "modular",
      policy: "واحد کار",
    },
  ];
  const html = f.c.documentHtml(m),
    text = f.c.textReport(m);
  for (const output of [html, text]) {
    assert.match(output, /واحد 0/);
    assert.match(output, /واحد 3/);
    assert.doesNotMatch(output, /نهایی فعلی|نمره پودمان|نهایی null|PRIVATE/);
  }
});

module.exports = { fixture, periodicModel };
