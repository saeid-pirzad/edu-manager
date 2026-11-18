"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  const c = vm.createContext({ structuredClone });
  for (const file of [
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/reporting/academic-results.js",
    "domain/annual-modules.js",
    "services/grading-results.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
      { filename: file },
    );
  for (const name of [
    "db",
    "workspace",
    "state",
    "document",
    "window",
    "localStorage",
  ])
    Object.defineProperty(c, name, {
      get() {
        throw Error("Ambient host access: " + name);
      },
    });
  const ports = {
    getData: () =>
      assert.fail("annual projections must use the supplied snapshot"),
    legacyCalc: () => ({}),
    policy: c.EduPolicy,
    grades: c.EduReportGrades,
    weightedKardanesh: () => assert.fail("unexpected legacy weighting"),
    knownStudents: (cls) => [...cls.students, ...(cls.archivedStudents || [])],
    clone: structuredClone,
    ownScoreRecord: c.ownScoreRecord,
    mergeAnnualClass: (classes) => c.EduAnnualModules.mergeClass(classes),
  };
  return { c, ports };
}

test("grading factories isolate live data and collaborators while preserving explicit source priority", () => {
  const { c, ports } = fixture();
  let dataA = { value: 1 };
  const dataB = { value: 2 },
    explicit = { value: 3 };
  const first = c.EduGradingResults({
    ...ports,
    getData: () => dataA,
    legacyCalc: (_cls, _lesson, _sid, source) => ({ final: source.value }),
  });
  const second = c.EduGradingResults({
    ...ports,
    getData: () => dataB,
    legacyCalc: (_cls, _lesson, _sid, source) => ({ final: source.value * 10 }),
  });
  assert.equal(first.calcV24({}, {}, "student").final, 1);
  assert.equal(second.calcV24({}, {}, "student").final, 20);
  dataA = { value: 4 };
  assert.equal(first.calcV24({}, {}, "student").final, 4);
  assert.equal(second.calcV24({}, {}, "student").final, 20);
  assert.equal(first.calcV24({}, {}, "student", explicit).final, 3);
  assert.equal(Object.isFrozen(first), true);
  assert.notEqual(first.calcV24, second.calcV24);
});

test("annual module and work-unit projections depend only on their scoped snapshots", () => {
  const { c, ports } = fixture();
  for (const unitBased of [false, true]) {
    const policy = {
      ...c.EduPolicy.defaults("modular", "1405-1406"),
      ...(unitBased ? { version: 2, modularScope: "unit" } : {}),
    };
    const lesson = {
      id: "lesson",
      name: "درس",
      gradeMode: "standard",
      gradingPolicy: policy,
      kardaneshScores: {},
      poudmans: [
        {
          id: "module",
          name: "پودمان",
          podScores: { student: { m: 4, c: 2 } },
          units: [
            {
              id: "unit",
              name: "واحد کار",
              unitScores: {},
              competencyScores: { student: { m: 3, c: 3 } },
            },
          ],
        },
      ],
    };
    const parts = [
      {
        period: { id: "first", term: "اول", termKind: "first" },
        data: {
          schools: [
            {
              id: "school",
              classes: [
                {
                  id: "class",
                  name: "کلاس",
                  students: [{ id: "student", name: "هنرجو", code: "001" }],
                  archivedStudents: [],
                  lessons: [lesson],
                },
              ],
            },
          ],
          sessions: [],
        },
      },
    ];
    const before = structuredClone(parts);
    const result = c
      .EduGradingResults(ports)
      .annualTechnicalRows(parts, "school", "class", "student");
    assert.equal(result.length, 1);
    assert.equal(result[0].studentCode, "001");
    assert.equal(result[0].complete, true);
    if (unitBased) {
      assert.equal(result[0].unitBased, true);
      assert.equal(result[0].final, null);
      assert.equal(result[0].units[0].final, 18);
    } else {
      assert.equal(result[0].final, 14);
      assert.equal(result[0].modules[0].continuous, 4);
    }
    assert.deepEqual(parts, before);
    result[0].modules[0].name = "تغییر خروجی";
    assert.equal(lesson.poudmans[0].name, "پودمان");
  }
});
