"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({ structuredClone });
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/domain/annual-modules.js"),
    "utf8",
  ),
  context,
);
const annual = context.EduAnnualModules,
  plain = (value) => JSON.parse(JSON.stringify(value));

function classroom(grades = {}, extras = {}) {
  return {
    id: "class",
    name: "یازدهم",
    students: [{ id: "student", name: "هنرجو" }],
    archivedStudents: [{ id: "archived", name: "بایگانی" }],
    lessons: [
      {
        id: "modular",
        name: "تولید محتوا",
        gradingPolicy: {
          method: "modular",
          version: 1,
          mostamarMax: 5,
          competencyFactor: 5,
          competencyMin: 2,
          moduleMin: 12,
          continuousStep: 0.5,
        },
        kardaneshScores: {},
        poudmans: [
          {
            id: "pod",
            name: "پودمان اول",
            units: [{ id: "unit", unitScores: { student: { m: 10 } } }],
            podScores: structuredClone(grades),
          },
        ],
      },
    ],
    ...extras,
  };
}
const lesson = (value) => value.lessons.find((item) => item.id === "modular"),
  scores = (value) => lesson(value).poudmans[0].podScores;

test("annual modular model distinguishes formal modules from dual and legacy courses", () => {
  assert.equal(annual.isFormalModular(lesson(classroom())), true);
  assert.equal(annual.isFormalModular({ gradeMode: "standard" }), false);
  assert.equal(
    annual.isFormalModular({ gradingPolicy: { method: "dual" } }),
    false,
  );
  assert.equal(annual.isFormalModular(null), false);
});

test("annual modular merge fills absent yearly grades and preserves a valid zero", () => {
  const first = classroom({ student: { m: 0, c: 2 } }),
    second = classroom();
  assert.deepEqual(plain(scores(annual.mergeClass([second, first]))), {
    student: { m: 0, c: 2 },
  });
  assert.deepEqual(plain(scores(second)), {});
  assert.deepEqual(plain(scores(first)), { student: { m: 0, c: 2 } });
});

test("annual modular merge preserves independent grades in different modules", () => {
  const first = classroom({ student: { m: 2, c: 2 } }),
    second = classroom();
  for (const value of [first, second])
    lesson(value).poudmans.push({
      id: "pod-two",
      name: "پودمان دوم",
      units: [],
      podScores: {},
    });
  lesson(second).poudmans[1].podScores.student = { m: 5, c: 3 };
  const result = annual.mergeClass([first, second]);
  assert.deepEqual(plain(scores(result)), { student: { m: 2, c: 2 } });
  assert.deepEqual(plain(lesson(result).poudmans[1].podScores), {
    student: { m: 5, c: 3 },
  });
});

test("annual modular merge deduplicates equal grades without interpreting obsolete gates", () => {
  const first = classroom({ student: { m: 2, c: 2, gate: false } }),
    second = classroom({ student: { m: 2, c: 2, gate: true } });
  lesson(second).gradingPolicy.requireGate = true;
  assert.deepEqual(plain(scores(annual.mergeClass([first, second]))), {
    student: { m: 2, c: 2, gate: false },
  });
});

test("annual modular merge rejects conflicting complete raw records", () => {
  assert.throws(
    () =>
      annual.mergeClass([
        classroom({ student: { m: 2, c: 2 } }),
        classroom({ student: { m: 5, c: 3 } }),
      ]),
    /دو نمرهٔ متفاوت/,
  );
});

test("annual modular merge never fabricates a complete score from different partial records", () => {
  assert.throws(
    () =>
      annual.mergeClass([
        classroom({ student: { m: 2 } }),
        classroom({ student: { c: 3 } }),
      ]),
    /دو نمرهٔ متفاوت/,
  );
});

test("annual modular merge ignores descriptive policy differences but rejects effective changes", () => {
  const first = classroom({ student: { m: 2, c: 2 } }),
    second = classroom();
  Object.assign(lesson(second).gradingPolicy, {
    revision: 3,
    code: "corrected",
    confirmed: true,
    requireGate: true,
  });
  lesson(second).name = "عنوان اصلاح‌شده";
  assert.equal(scores(annual.mergeClass([first, second])).student.m, 2);
  for (const field of [
    "version",
    "mostamarMax",
    "competencyFactor",
    "competencyMin",
    "moduleMin",
    "continuousStep",
  ]) {
    const changed = structuredClone(second);
    lesson(changed).gradingPolicy[field] += 1;
    assert.throws(() => annual.mergeClass([first, changed]), /قواعد نمره‌دهی/);
  }
});

test("annual modular merge accepts reordered modules with the same IDs", () => {
  const first = classroom({ student: { m: 2 } });
  lesson(first).poudmans.push({
    id: "two",
    units: [],
    podScores: { student: { c: 3 } },
  });
  const second = structuredClone(first);
  lesson(second).poudmans.reverse();
  assert.equal(
    lesson(annual.mergeClass([first, second])).poudmans[0].id,
    "pod",
  );
});

test("annual modular merge rejects changed module identity and dual/modular collisions", () => {
  const first = classroom(),
    changed = classroom();
  lesson(changed).poudmans[0].id = "other";
  assert.throws(() => annual.mergeClass([first, changed]), /ساختار پودمان/);
  lesson(changed).gradingPolicy.method = "dual";
  assert.throws(() => annual.mergeClass([first, changed]), /قواعد نمره‌دهی/);
});

test("annual modular merge filters unknown students but keeps archived class members", () => {
  const result = annual.mergeClass([
    classroom(),
    classroom({
      archived: { m: 1, c: 2 },
      student: { m: 0 },
      stranger: { m: 5, c: 3 },
    }),
  ]);
  assert.deepEqual(plain(scores(result)), {
    archived: { m: 1, c: 2 },
    student: { m: 0 },
  });
});

test("annual modular merge keeps the active roster, metadata, and nonmodular grades", () => {
  const first = classroom(),
    second = classroom({ student: { m: 2 } });
  first.lessons.push({
    id: "dual",
    gradeMode: "kardanesh",
    gradingPolicy: { method: "dual" },
    kardaneshScores: { student: { practical: 10, theory: 12 } },
  });
  second.lessons.push({
    id: "dual",
    gradeMode: "kardanesh",
    gradingPolicy: { method: "dual" },
    kardaneshScores: { student: { practical: 20, theory: 20 } },
  });
  second.name = "نام دیگر";
  second.students.push({ id: "other", name: "دیگری" });
  const result = annual.mergeClass([first, second]);
  assert.equal(result.name, first.name);
  assert.deepEqual(plain(result.students), first.students);
  assert.deepEqual(plain(result.lessons[1]), first.lessons[1]);
  assert.deepEqual(
    plain(lesson(result).poudmans[0].units),
    lesson(first).poudmans[0].units,
  );
});

test("annual modular merge adds another-term-only formal course without term-specific grades", () => {
  const first = classroom({}, { lessons: [] }),
    second = classroom({ student: { m: 4, c: 3 }, stranger: { m: 5 } });
  lesson(second).kardaneshScores = { student: { practical: 20 } };
  second.lessons.push({ id: "other-dual", gradeMode: "kardanesh" });
  const result = annual.mergeClass([first, second]);
  assert.equal(result.lessons.length, 1);
  assert.deepEqual(plain(scores(result)), { student: { m: 4, c: 3 } });
  assert.deepEqual(plain(lesson(result).kardaneshScores), {});
  assert.deepEqual(plain(lesson(result).poudmans[0].units[0].unitScores), {});
});

test("annual modular consolidation can exclude missing term-scoped course definitions", () => {
  const first = classroom({}, { lessons: [] }),
    second = classroom({ student: { m: 4, c: 3 } });
  const result = annual.mergeClass([first, second], {
    includeMissingLessons: false,
  });
  assert.deepEqual(plain(result), first);
  assert.equal(annual.mergeClass([first, second]).lessons.length, 1);
});

test("annual modular merge rejects differing class identity and duplicate IDs", () => {
  assert.throws(() => annual.mergeClass([]), /کلاس مشخص نشده/);
  assert.throws(
    () => annual.mergeClass([classroom(), classroom({}, { id: "different" })]),
    /کلاس‌های متفاوت/,
  );
  const duplicate = classroom();
  duplicate.lessons.push(structuredClone(lesson(duplicate)));
  assert.throws(() => annual.mergeClass([duplicate]), /شناسهٔ تکراری/);
});

test("annual modular comparisons ignore metadata-only changes and treat missing/null identically", () => {
  const previous = classroom({ student: { m: null, c: null, gate: true } }),
    current = classroom({ student: { gate: false } });
  assert.equal(annual.hasChanges(previous, current), false);
  scores(current).student.m = 0;
  assert.equal(annual.hasChanges(previous, current), true);
});

test("annual modular comparisons leave dual and legacy unit-grade updates term scoped", () => {
  const previous = classroom(),
    current = structuredClone(previous);
  lesson(current).poudmans[0].units[0].unitScores.student.m = 20;
  lesson(current).kardaneshScores.student = { practical: 20 };
  assert.equal(annual.hasChanges(previous, current), false);
});

test("annual modular comparisons support a new class without a stored previous version", () => {
  assert.equal(annual.hasChanges(null, classroom()), false);
  assert.equal(
    annual.hasChanges(undefined, classroom({ student: { m: 0 } })),
    true,
  );
  assert.deepEqual(
    plain(
      scores(
        annual.mirrorClass(null, classroom({ student: { m: 0 } }), classroom()),
      ),
    ),
    { student: { m: 0 } },
  );
});

test("annual modular mirror updates raw scores without mutating source or companion", () => {
  const previous = classroom({ student: { m: 2, c: 2 } }),
    current = classroom({ student: { m: 4, c: 3 } }),
    companion = classroom({ student: { m: 2, c: 2 } }),
    before = JSON.stringify([previous, current, companion]);
  const result = annual.mirrorClass(previous, current, companion);
  assert.deepEqual(plain(scores(result)), { student: { m: 4, c: 3 } });
  assert.equal(JSON.stringify([previous, current, companion]), before);
  scores(result).student.m = 1;
  assert.equal(scores(current).student.m, 4);
});

test("annual modular mirror preserves local record metadata and obsolete gate", () => {
  const previous = classroom({ student: { m: 2, c: 2 } }),
    current = classroom({ student: { m: 4, c: 3, gate: false } }),
    companion = classroom({
      student: { m: 2, c: 2, gate: true, note: "محلی" },
    });
  assert.deepEqual(
    plain(scores(annual.mirrorClass(previous, current, companion))),
    { student: { m: 4, c: 3, gate: true, note: "محلی" } },
  );
});

test("annual modular mirror treats an already-propagated score as an idempotent no-op", () => {
  const previous = classroom({ student: { m: 2 } }),
    current = classroom({ student: { m: 4 } }),
    companion = classroom({ student: { m: 4, gate: true } });
  assert.deepEqual(
    plain(annual.mirrorClass(previous, current, companion)),
    companion,
  );
});

test("annual modular mirror refuses to overwrite a differing companion revision", () => {
  assert.throws(
    () =>
      annual.mirrorClass(
        classroom({ student: { m: 2, c: 2 } }),
        classroom({ student: { m: 4, c: 3 } }),
        classroom({ student: { m: 1, c: 2 } }),
      ),
    /دوباره بارگذاری/,
  );
});

test("annual modular mirror propagates individual field removal without losing the other grade", () => {
  const previous = classroom({ student: { m: 2, c: 2 } }),
    current = classroom({ student: { c: 2 } });
  assert.deepEqual(
    plain(scores(annual.mirrorClass(previous, current, previous))),
    { student: { c: 2 } },
  );
});

test("annual modular mirror propagates deletion of all grades and retains non-grade metadata", () => {
  const previous = classroom({ student: { m: 0, c: 2, gate: false } }),
    current = classroom(),
    result = annual.mirrorClass(previous, current, previous);
  assert.deepEqual(plain(scores(result)), { student: { gate: false } });
  const clean = classroom({ student: { m: 0, c: 2 } });
  assert.deepEqual(
    plain(scores(annual.mirrorClass(clean, current, clean))),
    {},
  );
});

test("annual modular mirror rejects stale data on deletion, including a zero grade", () => {
  assert.throws(
    () =>
      annual.mirrorClass(
        classroom({ student: { m: 1 } }),
        classroom(),
        classroom({ student: { m: 0 } }),
      ),
    /دوباره بارگذاری/,
  );
});

test("annual modular mirror handles new and archived students only when known by companion", () => {
  const previous = classroom(),
    current = classroom({
      student: { m: 0 },
      archived: { m: 5, c: 3 },
      stranger: { m: 2 },
    });
  assert.deepEqual(
    plain(scores(annual.mirrorClass(previous, current, classroom()))),
    { student: { m: 0 }, archived: { m: 5, c: 3 } },
  );
});

test("annual modular mirror cannot recreate a companion course deleted in that term", () => {
  const previous = classroom({ archived: { m: 2, c: 2 } }),
    current = classroom({
      student: { m: 0 },
      archived: { m: 2, c: 2 },
      stranger: { m: 5 },
    }),
    companion = classroom({}, { lessons: [] }),
    result = annual.mirrorClass(previous, current, companion);
  assert.deepEqual(plain(result), companion);
  assert.equal(scores(current).student.m, 0);
});

test("annual modular structure deletion preserves another term's course and yearly grades", () => {
  const previous = classroom({ student: { m: 0, c: 2 } }),
    current = classroom({}, { lessons: [] });
  assert.equal(annual.hasChanges(previous, current), false);
  assert.deepEqual(
    plain(annual.mirrorClass(previous, current, previous)),
    previous,
  );
  const removedPod = structuredClone(previous);
  lesson(removedPod).poudmans = [];
  assert.equal(annual.hasChanges(previous, removedPod), false);
  assert.deepEqual(
    plain(annual.mirrorClass(previous, removedPod, previous)),
    previous,
  );
});

test("annual modular mirror leaves other course scores, unit grades, and roster unchanged", () => {
  const previous = classroom({ student: { m: 2 } }),
    current = classroom({ student: { m: 4 } }),
    companion = classroom({ student: { m: 2 } });
  companion.lessons.push({
    id: "dual",
    gradingPolicy: { method: "dual" },
    kardaneshScores: { student: { theory: 14 } },
  });
  const result = annual.mirrorClass(previous, current, companion);
  assert.deepEqual(plain(result.students), companion.students);
  assert.deepEqual(plain(result.lessons[1]), companion.lessons[1]);
  assert.deepEqual(
    plain(lesson(result).poudmans[0].units),
    lesson(companion).poudmans[0].units,
  );
});

test("annual modular mirror rejects rules or structure mismatches before propagating grades", () => {
  const previous = classroom({ student: { m: 2 } }),
    current = classroom({ student: { m: 4 } }),
    companion = classroom({ student: { m: 2 } });
  lesson(companion).gradingPolicy.moduleMin = 10;
  assert.throws(
    () => annual.mirrorClass(previous, current, companion),
    /قواعد نمره‌دهی/,
  );
  lesson(companion).gradingPolicy.moduleMin = 12;
  lesson(companion).poudmans[0].id = "other";
  assert.throws(
    () => annual.mirrorClass(previous, current, companion),
    /ساختار پودمان/,
  );
});

test("annual modular scores cannot be inherited from the record prototype", () => {
  const first = classroom(),
    second = classroom();
  lesson(second).poudmans[0].podScores = Object.create({
    student: { m: 5, c: 3 },
  });
  assert.deepEqual(plain(scores(annual.mergeClass([first, second]))), {});
  scores(second).student = Object.create({ m: 5, c: 3 });
  assert.equal(annual.hasChanges(first, second), false);
});

test("annual modular model rejects malformed grades without silently losing existing data", () => {
  for (const record of [
    { m: "2" },
    { m: NaN },
    { m: Infinity },
    { m: -1 },
    { c: 0 },
    { c: 4 },
    [],
    true,
  ])
    assert.throws(
      () => annual.mergeClass([classroom({ student: record })]),
      /نمرهٔ پودمانی نامعتبر/,
    );
});

test("annual modular model supports dependency-free cloning fallback", () => {
  const isolated = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/domain/annual-modules.js"),
      "utf8",
    ),
    isolated,
  );
  const result = isolated.EduAnnualModules.mergeClass([
    classroom(),
    classroom({ student: { m: 0 } }),
  ]);
  assert.equal(scores(result).student.m, 0);
});
