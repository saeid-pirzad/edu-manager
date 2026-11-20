"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const context = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/domain/reporting/academic-summary.js"),
      "utf8",
    ),
    context,
  );
  return (model) =>
    JSON.parse(JSON.stringify(context.EduReportAcademicSummary.build(model)));
}
function identity(studentId, values = {}) {
  return {
    classId: "class",
    className: "کلاس اول",
    lessonId: "lesson",
    lessonName: "درس اول",
    studentId,
    studentName: "هنرجو " + studentId,
    ...values,
  };
}

test("academic summary separates recorded zero, missing grades and complete general grades with explicit denominators", () => {
  const build = fixture(),
    model = {
      audience: "management",
      annualGrades: [
        identity("zero", { final: 0, complete: true, passed: false }),
        identity("missing", { final: null, complete: false, passed: null }),
        identity("passed", { final: 14, complete: true, passed: true }),
        identity("general", {
          lessonId: "general",
          lessonName: "عمومی",
          general: true,
          final: 0,
          complete: true,
          passed: null,
        }),
      ],
    },
    before = structuredClone(model),
    summary = build(model),
    vocational = summary.rows.find((row) => row.lessonId === "lesson"),
    general = summary.rows.find((row) => row.lessonId === "general");
  assert.equal(vocational.assessments, 3);
  assert.equal(vocational.complete, 2);
  assert.equal(vocational.incomplete, 1);
  assert.equal(vocational.needsCompensation, 1);
  assert.equal(vocational.passed, 1);
  assert.equal(vocational.eligible, 2);
  assert.equal(vocational.passRate, 50);
  assert.equal(vocational.completionRate, (2 / 3) * 100);
  assert.equal(general.complete, 1);
  assert.equal(general.unclassified, 1);
  assert.equal(general.eligible, 0);
  assert.equal(general.passRate, null);
  assert.equal(summary.totals.students, 4);
  assert.equal(summary.totals.courses, 2);
  assert.equal(summary.totals.complete + summary.totals.incomplete, 4);
  assert.equal(summary.followup.length, 2);
  assert.equal(
    summary.followup.filter((row) => row.status === "incomplete").length,
    summary.totals.incomplete,
  );
  assert.equal(
    summary.followup.filter((row) => row.status === "needsCompensation").length,
    summary.totals.needsCompensation,
  );
  assert.deepEqual(model, before);
});

test("work units stay independent even when the course and module have no aggregate result", () => {
  const build = fixture(),
    technicalGrades = ["first", "second"].map((studentId, index) =>
      identity(studentId, {
        method: "modular",
        unitBased: true,
        final: null,
        passed: null,
        complete: index === 0,
        modules: [
          {
            id: "pod",
            name: "پودمان اول",
            final: null,
            passed: null,
            units: [
              {
                id: "unit1",
                name: "واحد کار ۱",
                final: index ? null : 6,
                complete: !index,
                passed: index ? null : false,
              },
              {
                id: "unit2",
                name: "واحد کار ۲",
                final: 15,
                complete: true,
                passed: true,
              },
            ],
          },
        ],
      }),
    ),
    summary = build({ audience: "management", technicalGrades });
  assert.deepEqual(
    summary.rows.map((row) => [
      row.kind,
      row.unitId,
      row.assessments,
      row.complete,
      row.incomplete,
      row.passed,
      row.needsCompensation,
    ]),
    [
      ["unit", "unit1", 2, 1, 1, 0, 1],
      ["unit", "unit2", 2, 2, 0, 2, 0],
    ],
  );
  assert.equal(summary.totals.assessments, 4);
  assert.equal(summary.totals.students, 2);
  assert.equal(summary.totals.courses, 1);
  assert.equal(summary.totals.passRate, (2 / 3) * 100);
  assert.deepEqual(
    summary.followup.map((row) => [
      row.studentId,
      row.moduleName,
      row.unitName,
      row.kind,
      row.status,
    ]),
    [
      ["first", "پودمان اول", "واحد کار ۱", "unit", "needsCompensation"],
      ["second", "پودمان اول", "واحد کار ۱", "unit", "incomplete"],
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(summary),
    /average|"final"|"kind":"module"/,
  );
});

test("parent summaries cannot expose another learner or another class even if the supplied model contains them", () => {
  const build = fixture(),
    model = {
      audience: "parent",
      class: { id: "class" },
      student: { id: "selected" },
      annualGrades: [
        identity("selected", { complete: false, passed: null }),
        identity("private", { complete: false, passed: null }),
        identity("selected", {
          classId: "private-class",
          className: "PRIVATE",
          complete: false,
          passed: null,
        }),
      ],
    },
    summary = build(model);
  assert.equal(summary.rows.length, 1);
  assert.equal(summary.totals.assessments, 1);
  assert.equal(summary.totals.incomplete, 1);
  assert.equal(summary.totals.students, 1);
  assert.deepEqual(
    summary.followup.map((row) => row.studentId),
    ["selected"],
  );
  assert.doesNotMatch(JSON.stringify(summary), /PRIVATE|private/);
  delete model.student;
  assert.deepEqual(build(model).rows, []);
  assert.deepEqual(build(model).followup, []);
});

test("official modules use module results, legacy records stay separate and empty structures are identified", () => {
  const build = fixture(),
    summary = build({
      technicalGrades: [
        identity("student", {
          method: "modular",
          final: null,
          passed: false,
          modules: [
            { id: "one", name: "یک", complete: true, passed: false },
            { id: "two", name: "دو", complete: true, passed: true },
          ],
        }),
        identity("student", { method: "legacy-unit", complete: true }),
        identity("student", {
          lessonId: "empty",
          method: "modular",
          unitBased: true,
          modules: [{ id: "empty-module", units: [] }],
        }),
      ],
    });
  assert.equal(summary.rows.length, 2);
  assert.ok(summary.rows.every((row) => row.kind === "module"));
  assert.equal(summary.totals.assessments, 2);
  assert.equal(summary.totals.needsCompensation, 1);
  assert.equal(summary.totals.passed, 1);
  assert.equal(summary.totals.excludedLegacyRecords, 1);
  assert.equal(summary.totals.unconfiguredRecords, 1);
});

test("shared names do not merge classes or lessons, and repeated source rows cannot inflate counts", () => {
  const build = fixture(),
    first = identity("student", { complete: true, passed: true }),
    model = {
      annualGrades: [
        first,
        structuredClone(first),
        { ...first, classId: "other-class" },
        { ...first, lessonId: "other-lesson" },
      ],
    },
    summary = build(model);
  assert.equal(summary.rows.length, 3);
  assert.equal(summary.totals.assessments, 3);
  assert.equal(summary.totals.students, 2);
  assert.deepEqual(
    build({ annualGrades: [...model.annualGrades].reverse() }),
    summary,
  );
  model.annualGrades.push({ ...first, passed: false });
  assert.throws(() => build(model), /تکراری و متعارض/);
});

test("an empty academic report has null rates instead of fabricated success", () => {
  const summary = fixture()({});
  assert.deepEqual(summary.rows, []);
  assert.equal(summary.totals.assessments, 0);
  assert.equal(summary.totals.completionRate, null);
  assert.equal(summary.totals.passRate, null);
  assert.deepEqual(summary.followup, []);
});

test("follow-up preserves names, literal codes and assessment context without adding successful or unclassified learners", () => {
  const build = fixture(),
    failed = identity("selected", {
      studentName: "نام <هنرجو>",
      studentCode: "۰۰۱-A",
      complete: true,
      passed: false,
    }),
    model = {
      annualGrades: [
        failed,
        structuredClone(failed),
        identity("missing", { complete: false, passed: null }),
        identity("successful", { complete: true, passed: true }),
        identity("general", {
          general: true,
          complete: true,
          passed: null,
        }),
      ],
    },
    before = structuredClone(model),
    summary = build(model);
  assert.deepEqual(
    summary.followup.find((row) => row.studentId === "selected"),
    {
      studentId: "selected",
      studentName: "نام <هنرجو>",
      studentCode: "۰۰۱-A",
      classId: "class",
      className: "کلاس اول",
      lessonId: "lesson",
      lessonName: "درس اول",
      moduleName: "",
      unitName: "",
      kind: "annual",
      status: "needsCompensation",
    },
  );
  assert.equal(summary.followup.length, 2);
  assert.equal(
    summary.followup.find((row) => row.studentId === "missing").studentCode,
    "",
  );
  assert.deepEqual(
    build({ annualGrades: [...model.annualGrades].reverse() }).followup,
    summary.followup,
  );
  assert.deepEqual(model, before);
});

test("missing assessment identities cannot silently merge unrelated pupils, lessons or units", () => {
  const build = fixture();
  for (const field of ["classId", "lessonId", "studentId"])
    for (const value of [undefined, null, "", " "])
      assert.throws(
        () =>
          build({
            annualGrades: [identity("student", { [field]: value })],
          }),
        /شناسهٔ/,
      );
  for (const invalidLevel of ["module", "unit"])
    assert.throws(
      () =>
        build({
          technicalGrades: [
            identity("student", {
              method: "modular",
              unitBased: true,
              modules: [
                {
                  ...(invalidLevel === "module" ? {} : { id: "module" }),
                  units: [
                    {
                      ...(invalidLevel === "unit" ? {} : { id: "unit" }),
                      complete: false,
                    },
                  ],
                },
              ],
            }),
          ],
        }),
      /شناسهٔ/,
    );
});

test("summary consumes real annual grade projections and competency policy results without recalculating their decisions", () => {
  const context = vm.createContext({ structuredClone });
  for (const file of [
    "domain/grade-math.js",
    "domain/data-boundary.js",
    "domain/grade-policy.js",
    "domain/reporting/academic-results.js",
    "domain/reporting/academic-summary.js",
    "domain/annual-modules.js",
    "services/grading-results.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      context,
      { filename: file },
    );
  const plain = (value) => JSON.parse(JSON.stringify(value)),
    course = {
      id: "dual",
      name: "کاردانش",
      gradeMode: "kardanesh",
      gradingPolicy: plain(context.EduPolicy.defaults("dual", "1405-1406")),
      kardaneshScores: {
        student: {
          midtermPractical: 0,
          midtermTheory: 0,
          practical: 0,
          theory: 0,
        },
      },
      poudmans: [],
    },
    unitCourse = {
      id: "unit-course",
      name: "شایستگی مستقل",
      gradeMode: "standard",
      gradingPolicy: {
        ...plain(context.EduPolicy.defaults("modular", "1405-1406")),
        version: 2,
        modularScope: "unit",
        moduleMin: 10,
      },
      poudmans: [
        {
          id: "pod",
          name: "پودمان اول",
          units: [
            {
              id: "one",
              name: "واحد اول",
              competencyScores: { student: { m: 5, c: 1 } },
            },
            {
              id: "two",
              name: "واحد دوم",
              competencyScores: { student: { m: 0, c: 3 } },
            },
          ],
        },
      ],
    },
    classroom = {
      id: "class",
      name: "کلاس",
      students: [{ id: "student", name: "هنرجو" }],
      lessons: [course, unitCourse],
    },
    parts = ["اول", "دوم"].map((term) => ({
      period: { id: term, term },
      data: {
        schools: [{ id: "school", classes: [structuredClone(classroom)] }],
      },
    })),
    service = context.EduGradingResults({
      getData: () => parts[0].data,
      legacyCalc: () => ({}),
      policy: context.EduPolicy,
      grades: context.EduReportGrades,
      knownStudents: (item) => item.students,
      clone: structuredClone,
      ownScoreRecord: context.ownScoreRecord,
      mergeAnnualClass: context.EduAnnualModules.mergeClass,
    }),
    model = {
      audience: "management",
      annualGrades: service.annualGradeRows(parts, "school", "class"),
      technicalGrades: service.annualTechnicalRows(parts, "school", "class"),
    },
    before = plain(model),
    summary = plain(context.EduReportAcademicSummary.build(model));
  assert.equal(summary.totals.assessments, 3);
  assert.equal(summary.totals.complete, 3);
  assert.equal(summary.totals.passed, 1);
  assert.equal(summary.totals.needsCompensation, 2);
  assert.equal(summary.totals.students, 1);
  assert.equal(summary.totals.courses, 2);
  assert.equal(summary.followup.length, 2);
  assert.ok(
    summary.followup.every(
      (row) =>
        row.studentName === "هنرجو" && row.status === "needsCompensation",
    ),
  );
  assert.equal(
    summary.rows.find((row) => row.unitId === "one").needsCompensation,
    1,
  );
  assert.equal(summary.rows.find((row) => row.unitId === "two").passed, 1);
  assert.deepEqual(plain(model), before);
});

test("empty official structures are counted once per pupil and module without inventing assessments", () => {
  const build = fixture(),
    emptyCourse = identity("student", { method: "modular", modules: [] }),
    emptyModule = identity("student", {
      lessonId: "unit-course",
      method: "modular",
      unitBased: true,
      modules: [
        { id: "first", units: [] },
        { id: "second", units: [] },
      ],
    }),
    model = {
      technicalGrades: [emptyCourse, emptyModule, emptyCourse, emptyModule],
    },
    summary = build(model);
  assert.equal(summary.totals.unconfiguredRecords, 3);
  assert.equal(summary.totals.assessments, 0);
  assert.equal(summary.totals.completionRate, null);
  assert.deepEqual(summary.followup, []);
  assert.deepEqual(
    build({ technicalGrades: [emptyModule, emptyCourse] }),
    summary,
  );
});

test("legacy exclusions deduplicate identical records while retaining each source term", () => {
  const build = fixture(),
    first = identity("student", { method: "legacy-unit", term: "اول" }),
    second = { ...first, term: "دوم" },
    summary = build({ technicalGrades: [first, second, first, second] });
  assert.equal(summary.totals.excludedLegacyRecords, 2);
  assert.equal(summary.totals.assessments, 0);
  const sourceA = { ...first, sourcePeriodId: "source-a" },
    sourceB = { ...first, sourcePeriodId: "source-b" };
  assert.equal(
    build({ technicalGrades: [sourceA, sourceB, sourceA] }).totals
      .excludedLegacyRecords,
    2,
  );
});

test("empty or legacy structures cannot bypass the shared identity validation", () => {
  const build = fixture();
  for (const grade of [
    null,
    {},
    identity("", { method: "modular", modules: [] }),
  ])
    assert.throws(() => build({ technicalGrades: [grade] }), /شناسهٔ/);
  for (const grade of [null, {}])
    assert.throws(() => build({ annualGrades: [grade] }), /شناسهٔ/);
  for (const method of ["modular", "legacy-unit"])
    for (const field of ["classId", "lessonId", "studentId"])
      assert.throws(
        () =>
          build({
            technicalGrades: [
              identity("student", { method, modules: [], [field]: "" }),
            ],
          }),
        /شناسهٔ/,
      );
  for (const module of [null, {}, { id: "", units: [] }])
    assert.throws(
      () =>
        build({
          technicalGrades: [
            identity("student", {
              method: "modular",
              unitBased: true,
              modules: [module],
            }),
          ],
        }),
      /شناسهٔ/,
    );
});
