"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture({ unitBased = true } = {}) {
  const c = vm.createContext({
    structuredClone,
    clone: structuredClone,
    knownStudents: (classroom) => [
      ...classroom.students,
      ...(classroom.archivedStudents || []),
    ],
  });
  for (const file of [
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/reporting/academic-results.js",
    "domain/annual-modules.js",
    "legacy/grading/calculation.js",
    "legacy/grading/kardanesh.js",
    "services/grading-results.js",
    "workspace/grading/results.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
      { filename: file },
    );
  c.old = { calcStudentLesson: c.legacy_calcStudentLesson };
  const course = {
    id: "course",
    name: "درس آزمایشی",
    gradeMode: "standard",
    gradingPolicy: {
      ...plain(c.EduPolicy.defaults("modular", "1405-1406")),
      ...(unitBased ? { version: 2, modularScope: "unit" } : {}),
    },
    kardaneshScores: {
      student: { practical: 20, theory: 20 },
      private_student: { practical: 19, theory: 18 },
    },
    poudmans: [0, 1].map((position) => ({
      id: "module-" + position,
      name: "پودمان " + position,
      podScores: {
        student: { m: 2, c: 2 },
        private_student: { m: 5, c: 3 },
      },
      units: [0, 1].map((offset) => ({
        id: "unit-" + (position * 2 + offset),
        name: "واحد " + (position * 2 + offset),
        unitScores: {
          student: { m: 20, p: 20 },
          private_student: { m: 19, p: 18 },
        },
        competencyScores: {},
      })),
    })),
  };
  const parts = ["first", "second"].map((kind, index) => ({
    period: {
      id: "period-" + kind,
      year: "1405-1406",
      termKind: kind,
      term: index ? "دوم" : "اول",
    },
    data: {
      schools: [
        {
          id: "school",
          classes: [
            {
              id: "class",
              name: "کلاس",
              students: [{ id: "student", name: "هنرجو", code: "001" }],
              archivedStudents: [{ id: "private_student", name: "خصوصی" }],
              lessons: [structuredClone(course)],
            },
          ],
        },
      ],
      sessions: [
        {
          id: "session-" + kind,
          classId: "class",
          lessonId: "course",
          poudmanId: "module-0",
          unitId: "unit-0",
          date: index ? "2027-03-27" : "2026-10-27",
          period: 0,
          attendance: { student: "present" },
          scores: [
            { studentId: "student", type: "mostamar", value: 20 },
            { studentId: "student", type: "payani", value: 20 },
          ],
        },
      ],
    },
  }));
  const lesson = (index) => parts[index].data.schools[0].classes[0].lessons[0];
  if (unitBased) {
    lesson(0).poudmans[0].units[0].competencyScores = {
      student: { m: 0, c: 2 },
      private_student: { m: 5, c: 3 },
    };
    lesson(1).poudmans[0].units[1].competencyScores.student = { m: 5, c: 3 };
    lesson(0).poudmans[1].units[0].competencyScores.student = { m: 2, c: 3 };
    lesson(1).poudmans[1].units[1].competencyScores.student = { m: 4 };
    // Inactive module and legacy unit scores can differ between historical
    // sources. They must never become official unit inputs or module totals.
    lesson(1).poudmans[0].podScores.student = { m: 5, c: 3 };
    lesson(1).poudmans[0].units[0].unitScores.student = { m: 17, p: 16 };
  } else {
    lesson(0).poudmans[0].units[0].unitScores.student = { m: 0, p: 18 };
    lesson(1).poudmans[0].units[0].unitScores.student = { m: 8, p: 20 };
  }
  return { c, parts, lesson };
}

test("annual official unit DTO uses competency inputs once per unit and leaves all module and course scores empty", () => {
  const { c, parts } = fixture(),
    before = structuredClone(parts),
    [row] = c.annualTechnicalRows(parts, "school", "class", "student");
  assert.equal(row.unitBased, true);
  assert.equal(row.term, "سالانه");
  assert.equal(row.complete, false);
  assert.equal(row.final, null);
  assert.equal(row.passed, null);
  assert.equal(row.provisionalAverage, null);
  assert.deepEqual(plain(row.legacyUnits), []);
  assert.deepEqual(
    plain(
      row.units.map((unit) => [
        unit.moduleId,
        unit.unitId,
        unit.mostamar,
        unit.competency,
        unit.final,
      ]),
    ),
    [
      ["module-0", "unit-0", 0, 2, 10],
      ["module-0", "unit-1", 5, 3, 20],
      ["module-1", "unit-2", 2, 3, 17],
      ["module-1", "unit-3", 4, null, null],
    ],
  );
  for (const module of row.modules) {
    assert.equal(module.continuous, null);
    assert.equal(module.competency, null);
    assert.equal(module.final, null);
    assert.equal(module.passed, null);
    assert.equal(module.threshold, null);
    assert.equal(module.units.length, 2);
  }
  assert.equal(
    c.annualTechnicalRows(parts, "school", "class", "student").length,
    1,
  );
  assert.deepEqual(
    plain(
      c.annualModularUnitRows(parts, "school", "class", "course", "student"),
    ),
    [],
  );
  assert.deepEqual(parts, before);
});

test("selected-student annual lesson exposes only official unit scores and removes inactive grade maps without mutating sources", () => {
  const { c, parts, lesson } = fixture(),
    before = structuredClone(parts),
    merged = c.annualModularLesson(
      parts,
      "school",
      "class",
      lesson(0),
      "student",
    );
  assert.deepEqual(plain(merged.kardaneshScores), {});
  assert.equal(JSON.stringify(merged).includes("private_student"), false);
  for (const pod of merged.poudmans) {
    assert.deepEqual(plain(pod.podScores), {});
    for (const unit of pod.units) {
      assert.deepEqual(plain(unit.unitScores), {});
      assert.deepEqual(Object.keys(unit.competencyScores), ["student"]);
    }
  }
  const [row] = c.annualTechnicalRows(parts, "school", "class", "student");
  row.units[0].inputs.m = 5;
  row.modules[0].units[0].inputs.c = 1;
  merged.poudmans[0].units[0].competencyScores.student.m = 4;
  assert.deepEqual(parts, before);
});

test("annual lesson projection retains custom metadata and missing-value distinctions without sharing source objects", () => {
  for (const unitBased of [true, false]) {
    const { c, parts, lesson } = fixture({ unitBased }),
      course = lesson(0),
      pod = course.poudmans[0],
      unit = pod.units[0];
    course.custom = { nested: [{ label: "lesson", optional: undefined }] };
    course.optional = undefined;
    pod.custom = { nested: [{ label: "module", value: null }] };
    unit.custom = { nested: [{ label: "unit", enabled: false }] };
    unit.optional = undefined;
    unit.applyOptions = { present: true, extension: { amount: 0 } };
    unit.competencyScores = undefined;
    const before = structuredClone(parts),
      merged = c.annualModularLesson(
        parts,
        "school",
        "class",
        course,
        "student",
      ),
      projectedPod = merged.poudmans[0],
      projectedUnit = projectedPod.units[0];
    assert.deepEqual(structuredClone(merged.custom), course.custom);
    assert.deepEqual(structuredClone(projectedPod.custom), pod.custom);
    assert.deepEqual(structuredClone(projectedUnit.custom), unit.custom);
    assert.equal(Object.hasOwn(merged, "optional"), true);
    assert.equal(merged.optional, undefined);
    assert.equal(Object.hasOwn(projectedUnit, "optional"), true);
    assert.equal(projectedUnit.optional, undefined);
    if (!unitBased) {
      assert.equal(Object.hasOwn(projectedUnit, "competencyScores"), true);
      assert.equal(projectedUnit.competencyScores, undefined);
    }
    merged.custom.nested[0].label = "changed";
    projectedPod.custom.nested[0].value = 1;
    projectedUnit.custom.nested[0].enabled = true;
    projectedUnit.applyOptions.extension.amount = 5;
    assert.deepEqual(parts, before);
  }
});

test("annual unit report keeps zero, blank and archived student grades independent and does not depend on source order", () => {
  const { c, parts, lesson } = fixture();
  const read = (versions, student = "student") =>
    plain(c.annualTechnicalRows(versions, "school", "class", student)[0]);
  assert.deepEqual(read(parts), read([...parts].reverse()));
  const archived = read(parts, "private_student");
  assert.equal(archived.units[0].mostamar, 5);
  assert.equal(archived.units[0].competency, 3);
  assert.equal(archived.units[0].final, 20);
  assert.equal(archived.units[1].final, null);
  assert.equal(archived.complete, false);
  lesson(1).poudmans[1].units[1].competencyScores.student.c = 2;
  const completed = read(parts);
  assert.equal(completed.complete, true);
  assert.equal(completed.final, null);
  assert.equal(completed.passed, null);
  assert.equal(completed.provisionalAverage, null);
  assert.equal(completed.units[0].mostamar, 0);
});

test("annual unit report rejects conflicting official records and incompatible unit policies before returning a DTO", () => {
  for (const mutate of [
    (course) => {
      course.poudmans[0].units[0].competencyScores.student = { m: 5, c: 3 };
    },
    (course) => {
      course.poudmans[0].units[0].id = "other-unit";
    },
    (course) => {
      course.gradingPolicy.moduleMin = 10;
    },
  ]) {
    const { c, parts, lesson } = fixture(),
      before = structuredClone(parts);
    mutate(lesson(1));
    assert.throws(
      () => c.annualTechnicalRows(parts, "school", "class", "student"),
      /تعارض|یکسان نیست|دو نمرهٔ متفاوت/,
    );
    assert.deepEqual(parts[0], before[0]);
  }
});

test("historical module grading retains direct module scores and independent raw work-unit details for both terms", () => {
  const { c, parts, lesson } = fixture({ unitBased: false }),
    before = structuredClone(parts),
    [row] = c.annualTechnicalRows(parts, "school", "class", "student");
  assert.equal(row.unitBased, undefined);
  assert.equal(row.term, "سالانه");
  assert.equal(row.final, 12);
  assert.equal(row.passed, true);
  assert.equal(row.complete, true);
  assert.equal(row.modules[0].continuous, 2);
  assert.equal(row.modules[0].competency, 2);
  assert.equal(row.modules[0].final, 12);
  assert.equal(row.modules[0].threshold, 12);
  assert.deepEqual(
    plain(
      row.units
        .filter((unit) => unit.unitId === "unit-0")
        .map((unit) => [
          unit.term,
          unit.sourcePeriodId,
          unit.mostamar,
          unit.payani,
        ]),
    ),
    [
      ["اول", "period-first", 0, 18],
      ["دوم", "period-second", 8, 20],
    ],
  );
  const merged = c.annualModularLesson(
    parts,
    "school",
    "class",
    lesson(0),
    "student",
  );
  assert.deepEqual(plain(merged.poudmans[0].podScores), {
    student: { m: 2, c: 2 },
  });
  assert.deepEqual(
    plain(merged.poudmans[0].units[0].unitScores),
    lesson(0).poudmans[0].units[0].unitScores,
  );
  lesson(1).gradingPolicy.modularScope = "module";
  assert.deepEqual(
    plain(c.annualTechnicalRows(parts, "school", "class", "student")),
    [plain(row)],
  );
  delete lesson(1).gradingPolicy.modularScope;
  assert.deepEqual(parts, before);
});
