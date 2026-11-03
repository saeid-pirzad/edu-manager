"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

const read = (file) =>
    fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
  plain = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  const context = vm.createContext({ structuredClone });
  // Actual shared policies/math, with no browser, storage or workspace runtime.
  for (const file of [
    "domain/grade-math.js",
    "domain/data-boundary.js",
    "domain/grade-policy.js",
    "domain/reporting/academic-results.js",
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/annual-modules.js",
    "domain/deputy-exchange.js",
    "workspace/domain/defaults-numbers.js",
    "workspace/grading/results.js",
  ])
    vm.runInContext(read(file), context, { filename: file });
  context.knownStudents = (classroom) => [
    ...classroom.students,
    ...(classroom.archivedStudents || []),
  ];
  return context;
}

function lesson(
  context,
  { general = false, modular = false, legacy = false } = {},
) {
  const policy = plain(
    context.EduPolicy.defaults(modular ? "modular" : "dual", "1405-1406"),
  );
  if (general) policy.subjectType = "general";
  return {
    id: "lesson",
    name: "درس آزمایشی",
    teacher: "دبیر آزمایشی",
    gradeMode: modular ? "standard" : "kardanesh",
    ...(legacy ? {} : { gradingPolicy: policy }),
    kardaneshScores: {
      student: {
        midtermPractical: 18,
        midtermTheory: 12,
        practical: 20,
        theory: 0,
      },
    },
    poudmans: modular
      ? [
          {
            id: "pod",
            name: "پودمان اول",
            podScores: { student: { m: 2, c: 2 } },
            units: [
              {
                id: "unit",
                name: "واحد اول",
                unitScores: { student: { m: 0, p: 20 } },
              },
            ],
          },
        ]
      : [],
  };
}

function parts(first, second = structuredClone(first)) {
  return [first, second].map((course, index) => ({
    period: {
      id: index ? "term_second" : "term_first",
      termKind: index ? "second" : "first",
      term: index ? "دوم" : "اول",
      year: "1405-1406",
      revision: 1,
      closed: false,
    },
    data: {
      settings: { academicYear: "1405-1406" },
      schools: [
        {
          id: "school",
          name: "مدرسه آزمایشی",
          classes: [
            {
              id: "classroom",
              name: "کلاس آزمایشی",
              students: [
                { id: "student", name: "هنرجوی آزمایشی", code: "001" },
              ],
              archivedStudents: [{ id: "archived", name: "هنرجوی بایگانی" }],
              lessons: [course],
            },
          ],
        },
      ],
      sessions: [],
    },
  }));
}

function packet(context, versions) {
  return context.EduDeputyExchange.build({
    sender: { code: "teacher-1", name: "دبیر آزمایشی" },
    schoolId: "school",
    schoolCode: "school-1",
    parts: versions,
    packetId: "packet",
    exportedAt: "2026-11-02T10:00:00.000Z",
  });
}

test("academic report core is independent of DOM, storage and teacher state", () => {
  const c = fixture();
  for (const name of [
    "db",
    "workspace",
    "document",
    "localStorage",
    "indexedDB",
  ])
    Object.defineProperty(c, name, {
      get() {
        throw Error("forbidden ambient dependency: " + name);
      },
    });
  assert.equal(Object.isFrozen(c.EduReportGrades), true);
  assert.equal(c.EduReportGrades.assessment(lesson(c), "student").final, 14);
  assert.equal(
    c.EduReportGrades.modular(lesson(c, { modular: true }), "student").final,
    12,
  );
});

test("teacher stage adapters retain complete policy DTOs for dual and general lessons", () => {
  const c = fixture();
  for (const general of [false, true]) {
    const course = lesson(c, { general });
    Object.assign(course.gradingPolicy, {
      dualConfigurable: true,
      practicalWeight: 60,
      practicalMin: 1,
      theoryMin: 2,
      passMin: 12,
    });
    for (const stage of ["midterm", "final"])
      for (const practical of [
        null,
        0,
        1e-100,
        Number.MIN_VALUE,
        19.999999,
        20,
      ])
        for (const theory of [null, 0, 1e-100, 12, 20]) {
          Object.assign(course.kardaneshScores.student, {
            practical,
            theory,
            midtermPractical: practical,
            midtermTheory: theory,
          });
          const rawPractical = general ? null : practical;
          assert.deepEqual(
            plain(c.assessmentResult(course, "student", stage)),
            {
              practical: rawPractical,
              theory,
              ...plain(
                c.EduPolicy.dual(course.gradingPolicy, rawPractical, theory),
              ),
            },
          );
        }
  }
});

test("legacy teacher assessments keep exact prior weighted results and their historical DTO", () => {
  const c = fixture(),
    course = lesson(c, { legacy: true });
  for (const practical of [null, 0, Number.MIN_VALUE, 1e-100, 19.999999, 20])
    for (const theory of [null, 0, Number.MIN_VALUE, 1e-100, 14, 20]) {
      Object.assign(course.kardaneshScores.student, { practical, theory });
      assert.deepEqual(plain(c.assessmentResult(course, "student")), {
        practical,
        theory,
        ...plain(c.weightedKardanesh(practical, theory)),
        complete: practical !== null && theory !== null,
        threshold: 14,
      });
    }
  assert.equal("reason" in c.assessmentResult(course, "missing"), false);
  assert.throws(
    () => c.assessmentResult(course, "student", "unknown"),
    /مرحله/,
  );
});

test("effective weights retain legacy defaults and explicitly configured percentages", () => {
  const c = fixture(),
    course = lesson(c);
  course.gradingPolicy.practicalWeight = 90;
  assert.deepEqual(plain(c.assessmentWeights(course)), {
    practical: 70,
    theory: 30,
  });
  course.gradingPolicy.dualConfigurable = true;
  assert.deepEqual(plain(c.assessmentWeights(course)), {
    practical: 90,
    theory: 10,
  });
  assert.deepEqual(plain(c.assessmentWeights(lesson(c, { legacy: true }))), {
    practical: 70,
    theory: 30,
  });
});

test("stage results ignore inherited score records and never mutate raw inputs", () => {
  const c = fixture(),
    course = lesson(c),
    before = structuredClone(course);
  c.EduReportGrades.assessment(course, "student");
  assert.deepEqual(course, before);
  course.kardaneshScores = Object.create({
    student: { practical: 20, theory: 20 },
  });
  assert.equal(c.assessmentResult(course, "student").complete, false);
});

test("annual core uses four raw stage components, not rounded or supplied final values", () => {
  const c = fixture(),
    components = Array.from({ length: 4 }, () => ({
      practical: 18,
      theory: 12,
      practicalWeight: 70,
      final: 999,
      complete: true,
    }));
  assert.deepEqual(plain(c.EduReportGrades.annual(components)), {
    complete: true,
    final: 16.2,
    passed: true,
    threshold: 14,
  });
  assert.throws(
    () => c.EduReportGrades.annual(components.slice(1)),
    /چهار مرحله/,
  );
  components[0].complete = false;
  assert.deepEqual(plain(c.EduReportGrades.annual(components)), {
    complete: false,
    final: null,
    passed: null,
    threshold: 14,
  });
});

test("annual teacher rows preserve order, four stages, exact tiny grades and general semantics", () => {
  const c = fixture();
  for (const general of [false, true])
    for (const grade of [0, Number.MIN_VALUE, 1e-100, 13.999999, 14, 20]) {
      const course = lesson(c, { general });
      Object.assign(course.kardaneshScores.student, {
        practical: grade,
        theory: grade,
        midtermPractical: grade,
        midtermTheory: grade,
      });
      const versions = parts(course),
        before = structuredClone(versions),
        [row] = c.annualGradeRows(
          versions.reverse(),
          "school",
          "classroom",
          "student",
        );
      assert.equal(row.final, grade);
      assert.equal(row.complete, true);
      assert.equal(row.passed, general ? null : grade >= 14);
      assert.equal(row.threshold, general ? null : 14);
      assert.deepEqual(
        plain(row.components.map((item) => [item.term, item.stage])),
        [
          ["اول", "midterm"],
          ["اول", "final"],
          ["دوم", "midterm"],
          ["دوم", "final"],
        ],
      );
      assert.deepEqual(versions, before.reverse());
    }
});

test("missing second-term assessments remain incomplete rather than zero", () => {
  const c = fixture(),
    [first] = parts(lesson(c)),
    [row] = c.annualGradeRows([first], "school", "classroom", "student");
  assert.equal(row.complete, false);
  assert.equal(row.final, null);
  assert.deepEqual(plain(row.components.slice(2).map((item) => item.theory)), [
    null,
    null,
  ]);
});

test("teacher and deputy policy stages are identical including legacy deputy fallback metadata", () => {
  const c = fixture();
  for (const options of [{}, { general: true }, { legacy: true }]) {
    const course = lesson(c, options),
      versions = parts(course),
      before = structuredClone(versions),
      output = packet(c, versions),
      [row] = c.EduDeputyExchange.gradeRows(output),
      fallbackPolicy = {
        ...plain(c.EduPolicy.defaults("dual", "1405-1406")),
        dualConfigurable: false,
      };
    assert.equal(row.stages.length, 4);
    for (const stage of row.stages) {
      const { termKind, stage: name, ...result } = plain(stage);
      assert.ok(["first", "second"].includes(termKind));
      const expected = options.legacy
        ? c.EduReportGrades.assessment(course, "student", name, {
            fallbackPolicy,
          })
        : c.assessmentResult(course, "student", name);
      assert.deepEqual(result, plain(expected));
    }
    assert.deepEqual(versions, before);
  }
});

test("modular results remain annual, exact and identical between teacher and deputy", () => {
  const c = fixture(),
    course = lesson(c, { modular: true });
  for (const score of [
    {},
    { m: 0 },
    { m: 0, c: 3 },
    { m: 5, c: 1 },
    { m: 2, c: 2 },
  ]) {
    course.poudmans[0].podScores.student = score;
    const before = structuredClone(course),
      shared = c.EduReportGrades.modular(course, "student"),
      expected = c.EduPolicy.lesson(
        course.gradingPolicy,
        course.poudmans,
        "student",
      ),
      [row] = c.EduDeputyExchange.gradeRows(packet(c, parts(course))),
      { modules, ...result } = plain(expected);
    assert.deepEqual(plain(shared), plain(expected));
    assert.equal(row.modules.length, 1);
    assert.deepEqual(plain(row.result), result);
    assert.deepEqual(plain(row.modules[0]), {
      id: "pod",
      name: "پودمان اول",
      m: score.m ?? null,
      c: score.c ?? null,
      ...modules[0],
    });
    assert.deepEqual(course, before);
  }
});

test("annual modular teacher traversal still merges terms once with archived students intact", () => {
  const c = fixture(),
    course = lesson(c, { modular: true });
  // Only host-owned non-grade fields are provided by this adapter. All grade
  // calculation and annual merge use the real shared policy and merge modules.
  c.old = { calcStudentLesson: () => ({ hostMetric: 7 }) };
  const versions = parts(course),
    before = structuredClone(versions),
    rows = c.annualTechnicalRows(versions, "school", "classroom");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].term, "سالانه");
  assert.equal(rows[0].final, 12);
  assert.equal(rows[0].modules[0].continuous, 2);
  assert.equal(rows[0].modules[0].competency, 2);
  assert.equal(rows[0].units[0].mostamar, 0);
  assert.equal(rows[0].units[0].payani, 20);
  assert.equal(rows[1].complete, false);
  assert.equal(rows[1].final, null);
  assert.deepEqual(versions, before);
});

test("legacy unit rows remain raw per-term records without an invented final", () => {
  const c = fixture(),
    course = lesson(c, { modular: true, legacy: true });
  course.kardaneshScores = {};
  course.poudmans[0].podScores = {};
  const [row] = c.EduDeputyExchange.gradeRows(packet(c, parts(course)));
  assert.equal(row.kind, "legacy");
  assert.equal(row.result, null);
  assert.equal(row.stages.length, 0);
  assert.deepEqual(
    plain(row.units.map((unit) => [unit.termKind, unit.m, unit.p])),
    [
      ["first", 0, 20],
      ["second", 0, 20],
    ],
  );
});
