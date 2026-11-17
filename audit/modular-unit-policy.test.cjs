"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({ structuredClone });
for (const file of ["grade-math.js", "data-boundary.js", "grade-policy.js"])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/domain", file), "utf8"),
    context,
  );
const policy = context.EduPolicy,
  plain = (value) => JSON.parse(JSON.stringify(value)),
  settings = () => ({
    ...policy.defaults("modular", "1405-1406"),
    version: 2,
    modularScope: "unit",
  }),
  pods = () => [
    {
      id: "pod",
      name: "پودمان اول",
      podScores: { student: { m: 5, c: 3 } },
      units: [
        {
          id: "first",
          name: "واحد اول",
          unitScores: { student: { m: 20, p: 20 } },
          competencyScores: { student: { m: 0, c: 2 } },
        },
        { id: "second", name: "واحد دوم", competencyScores: {} },
      ],
    },
  ];

test("modular scope is explicit and missing scope preserves the historical module model", () => {
  const legacy = policy.defaults("modular", "1405-1406");
  assert.equal(legacy.modularScope, undefined);
  assert.equal(policy.unitBased(legacy), false);
  assert.equal(policy.unitBased({ ...legacy, modularScope: "module" }), false);
  assert.equal(policy.unitBased(settings()), true);
  assert.equal(policy.validate(settings()), true);
  assert.throws(
    () => policy.validate({ ...settings(), version: 1 }),
    /نسخه یا روش/,
  );
  assert.throws(
    () => policy.validate({ ...legacy, version: 2 }),
    /نسخه یا روش/,
  );
  assert.throws(
    () => policy.validate({ ...settings(), modularScope: "module" }),
    /نسخه یا روش/,
  );
  for (const modularScope of [null, "units", "", false])
    assert.throws(
      () => policy.validate({ ...legacy, modularScope }),
      /سطح ارزشیابی/,
    );
  assert.throws(
    () =>
      policy.validate({
        ...policy.defaults("dual", "1405-1406"),
        modularScope: "unit",
      }),
    /سطح ارزشیابی/,
  );
  const result = policy.lesson(legacy, pods(), "student");
  assert.equal(result.final, 20);
  assert.equal(result.passed, true);
  assert.equal(result.modules[0].units, undefined);
  assert.deepEqual(
    plain(
      policy.lesson({ ...legacy, modularScope: "module" }, pods(), "student"),
    ),
    plain(result),
  );
});

test("unit competency inputs obey the same range, step and Persian number rules as modules", () => {
  const p = settings();
  for (const [value, field, valid, expected] of [
    ["۰", "m", true, 0],
    ["۴٫۵", "m", true, 4.5],
    ["5.5", "m", false],
    ["4.25", "m", false],
    ["۲", "c", true, 2],
    ["0", "c", false],
    ["2.5", "c", false],
    ["4", "c", false],
    ["", "m", false],
  ]) {
    const result = policy.parse(value, p, field, "unit");
    assert.equal(result.ok, valid, value + "/" + field);
    if (valid) assert.equal(result.value, expected);
    assert.deepEqual(
      plain(result),
      plain(policy.parse(value, p, field, "pod")),
    );
  }
});

test("unit based results retain independent scores and never manufacture a module or course average", () => {
  const source = pods(),
    before = JSON.stringify(source),
    result = policy.lesson(settings(), source, "student"),
    module = result.modules[0];
  assert.equal(result.unitBased, true);
  assert.equal(result.complete, false);
  assert.equal(module.complete, false);
  for (const aggregate of [result, module]) {
    assert.equal(aggregate.final, null);
    assert.equal(aggregate.passed, null);
    assert.equal(aggregate.provisionalAverage, null);
  }
  assert.equal(result.provisionalAverage, null);
  assert.deepEqual(plain(module.units[0].inputs), { m: 0, c: 2 });
  assert.equal(module.units[0].final, 10);
  assert.equal(module.units[0].passed, false);
  assert.equal(module.units[0].complete, true);
  assert.match(module.units[0].reason, /واحد کار/);
  assert.deepEqual(plain(module.units[1].inputs), { m: null, c: null });
  assert.equal(module.units[1].final, null);
  assert.equal(module.units[1].complete, false);
  assert.equal(JSON.stringify(source), before);
});

test("completion of all units does not imply aggregate passing or a numeric final", () => {
  const source = pods();
  source[0].units[1].competencyScores.student = { m: 5, c: 3 };
  const result = policy.lesson(settings(), source, "student");
  assert.equal(result.complete, true);
  assert.equal(result.modules[0].complete, true);
  assert.equal(result.modules[0].units[1].final, 20);
  assert.equal(result.modules[0].units[1].passed, true);
  assert.equal(result.modules[0].units[0].passed, false);
  assert.equal(result.final, null);
  assert.equal(result.passed, null);
  assert.equal(result.provisionalAverage, null);
  assert.equal(result.modules[0].final, null);
  assert.equal(result.modules[0].passed, null);
});

test("missing, null, zero and another student's unit inputs remain distinct", () => {
  const source = pods();
  source[0].units[0].competencyScores.student = { m: null, c: 2 };
  source[0].units[1].competencyScores = Object.create({
    student: { m: 5, c: 3 },
  });
  let result = policy.lesson(settings(), source, "student");
  assert.equal(result.modules[0].units[0].complete, false);
  assert.equal(result.modules[0].units[1].complete, false);
  assert.equal(policy.lesson(settings(), source, "other").complete, false);
  source[0].units[0].competencyScores.student.m = 0;
  result = policy.lesson(settings(), source, "student");
  assert.equal(result.modules[0].units[0].complete, true);
  assert.equal(result.modules[0].units[0].final, 10);
  assert.equal(policy.lesson(settings(), [], "student").complete, false);
  source[0].units = [];
  assert.equal(policy.lesson(settings(), source, "student").complete, false);
});

test("unit competency history locks grading and a fresh year copies no scores", () => {
  const source = {
    id: "lesson",
    gradingPolicy: settings(),
    kardaneshScores: {},
    poudmans: pods(),
  };
  source.poudmans[0].podScores = {};
  source.poudmans[0].units[0].unitScores = {};
  assert.equal(policy.hasGrades(source), true);
  let serial = 0;
  const copied = policy.freshCopy(
    source,
    "new-lesson",
    "1406-1407",
    () => "fresh-" + ++serial,
  );
  assert.equal(copied.gradingPolicy.modularScope, "unit");
  assert.equal(policy.hasGrades(copied), false);
  assert.deepEqual(plain(copied.poudmans[0].units[0].competencyScores), {});
  assert.deepEqual(
    plain(source.poudmans[0].units[0].competencyScores.student),
    { m: 0, c: 2 },
  );
});
