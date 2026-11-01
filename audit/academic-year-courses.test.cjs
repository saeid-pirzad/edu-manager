"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const c = vm.createContext({ structuredClone });
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/domain/academic-year-courses.js"),
    "utf8",
  ),
  c,
);
const courses = c.EduAcademicYearCourses,
  clone = structuredClone,
  plain = (value) => JSON.parse(JSON.stringify(value));
function lesson(id = "lesson", graded = true) {
  return {
    id,
    name: "درس " + id,
    teacher: "دبیر",
    periodsPerWeek: 2,
    gradeMode: "standard",
    weightMostamar: 40,
    weightPayani: 60,
    gradingPolicy: {
      version: 1,
      revision: 1,
      method: "modular",
      year: "1405-1406",
      branch: "fani",
      mostamarMax: 5,
      continuousStep: 0.5,
      competencyFactor: 5,
      competencyMin: 2,
      moduleMin: 12,
      unitCount: 1,
      requireGate: false,
      confirmed: false,
      circularNumber: "",
      circularDate: "",
      reference: "",
      grade: "11",
      field: "شبکه",
      code: "",
      authority: "",
    },
    courseInfo: {
      year: "1405-1406",
      grade: "11",
      field: "شبکه",
      code: "",
      authority: "",
      branch: "fani",
    },
    kardaneshScores: graded
      ? {
          student: {
            practical: 0,
            theory: 16,
            midtermPractical: 17,
            midtermTheory: 0,
          },
        }
      : {},
    poudmans: [
      {
        id: id + "-pod",
        name: "پودمان یک",
        podScores: graded
          ? { student: { m: 0, c: 2, gate: false, note: "preserve" } }
          : {},
        units: [
          {
            id: id + "-unit",
            name: "واحد یک",
            unitScores: graded ? { student: { m: 0, p: 12 } } : {},
            applyOptions: {
              pos: false,
              neg: false,
              hw: false,
              present: false,
              late: false,
            },
          },
        ],
      },
    ],
  };
}
const classroom = (...lessons) => ({
  id: "class",
  name: "کلاس",
  students: [{ id: "student", name: "هنرجو" }],
  archivedStudents: [],
  lessons: lessons.length ? lessons : [lesson()],
});
const conflict = (fn) =>
  assert.throws(fn, (error) => error.code === "ACADEMIC_COURSE_CONFLICT");
const history = (extra = {}) => [
  {
    id: "session",
    lessonId: "lesson",
    classId: "class",
    poudmanId: "lesson-pod",
    unitId: "lesson-unit",
    attendance: { student: "present" },
    scores: [],
    ...extra,
  },
];

test("full projection excludes only three score maps and preserves every shared definition field", () => {
  const original = classroom(),
    before = clone(original);
  original.lessons[0].extra = { kardaneshScores: "metadata" };
  const projected = courses.projection(original).lessons[0];
  assert.equal(Object.hasOwn(projected, "kardaneshScores"), false);
  assert.equal(Object.hasOwn(projected.poudmans[0], "podScores"), false);
  assert.equal(
    Object.hasOwn(projected.poudmans[0].units[0], "unitScores"),
    false,
  );
  assert.equal(projected.teacher, "دبیر");
  assert.equal(projected.extra.kardaneshScores, "metadata");
  assert.equal(projected.gradingPolicy.confirmed, false);
  assert.equal(projected.courseInfo.field, "شبکه");
  delete original.lessons[0].extra;
  assert.deepEqual(original, before);
});
test("grade-only edits and enrollment/name edits are not course definition changes", () => {
  const old = classroom(),
    next = clone(old);
  next.lessons[0].kardaneshScores.student.theory = 7;
  next.lessons[0].poudmans[0].podScores.student.c = 3;
  next.lessons[0].poudmans[0].units[0].unitScores.student.m = 18;
  next.name = "کلاس تازه";
  next.students[0].name = "نام تازه";
  assert.equal(courses.hasChanges(old, next), false);
});
test("raw and normalized legacy defaults compare equal even with recorded grades", () => {
  const old = classroom(),
    next = clone(old),
    l = old.lessons[0];
  delete l.gradeMode;
  delete l.weightMostamar;
  delete l.weightPayani;
  delete l.poudmans[0].units[0].applyOptions;
  assert.equal(courses.hasChanges(old, next), false);
  assert.equal(courses.assertCompatible(l, next.lessons[0]), true);
  const emptyOptions = clone(next);
  emptyOptions.lessons[0].poudmans[0].units[0].applyOptions = {};
  assert.equal(courses.hasChanges(old, emptyOptions), false);
  assert.deepEqual(
    plain(courses.mirrorClass(old, next, old).lessons),
    old.lessons,
  );
});
test("object property ordering cannot manufacture policy or definition conflicts", () => {
  const old = classroom(),
    next = clone(old);
  next.lessons[0].gradingPolicy = Object.fromEntries(
    Object.entries(next.lessons[0].gradingPolicy).reverse(),
  );
  next.lessons[0].poudmans[0].units[0].applyOptions = Object.fromEntries(
    Object.entries(next.lessons[0].poudmans[0].units[0].applyOptions).reverse(),
  );
  assert.equal(courses.hasChanges(old, next), false);
  assert.equal(courses.assertCompatible(old.lessons[0], next.lessons[0]), true);
});
test("descriptive corrections synchronize with grades without changing any target score payload", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.lessons[0].name = "نام صحیح";
  next.lessons[0].teacher = "دبیر تازه";
  next.lessons[0].periodsPerWeek = 3;
  next.lessons[0].courseInfo.code = "123";
  Object.assign(next.lessons[0].gradingPolicy, {
    revision: 2,
    confirmed: true,
    circularNumber: "ابلاغ",
    circularDate: "1405/08/09",
    reference: "مرجع",
    grade: "12",
    field: "رشته اصلاح‌شده",
    code: "کد",
    authority: "متولی",
  });
  next.lessons[0].poudmans[0].name = "نام پودمان";
  next.lessons[0].poudmans[0].units[0].name = "نام واحد";
  target.lessons[0].kardaneshScores.student.theory = 4;
  target.lessons[0].poudmans[0].podScores.student.c = 3;
  target.lessons[0].poudmans[0].units[0].unitScores.student.p = 20;
  const saved = clone(target),
    result = courses.mirrorClass(old, next, target, { sessions: history() });
  assert.equal(result.lessons[0].teacher, "دبیر تازه");
  assert.equal(result.lessons[0].poudmans[0].name, "نام پودمان");
  assert.deepEqual(
    plain(result.lessons[0].kardaneshScores),
    target.lessons[0].kardaneshScores,
  );
  assert.deepEqual(
    plain(result.lessons[0].poudmans[0].podScores),
    target.lessons[0].poudmans[0].podScores,
  );
  assert.deepEqual(
    plain(result.lessons[0].poudmans[0].units[0].unitScores),
    target.lessons[0].poudmans[0].units[0].unitScores,
  );
  assert.deepEqual(target, saved);
});
test("sensitive policy, weights and unit grading config are blocked after any recorded score", () => {
  for (const edit of [
    (l) => (l.weightMostamar = 50),
    (l) => (l.gradingPolicy.moduleMin = 14),
    (l) => (l.gradingPolicy.competencyMin = 3),
    (l) => (l.gradingPolicy.unitCount = 2),
    (l) => (l.gradingPolicy.unknownFutureRule = true),
    (l) => (l.poudmans[0].units[0].applyOptions.pos = true),
  ]) {
    const old = classroom(),
      next = clone(old);
    edit(next.lessons[0]);
    conflict(() => courses.mirrorClass(old, next, old));
  }
});
test("zero grade and session activities both protect sensitive changes", () => {
  const old = classroom(lesson("lesson", false)),
    next = clone(old);
  next.lessons[0].gradingPolicy.moduleMin = 15;
  old.lessons[0].kardaneshScores.student = { theory: 0 };
  conflict(() => courses.mirrorClass(old, next, old));
  const blank = classroom(lesson("lesson", false)),
    changed = clone(blank);
  changed.lessons[0].gradingPolicy.moduleMin = 15;
  conflict(() =>
    courses.mirrorClass(blank, changed, blank, {
      sessions: history({
        scores: [{ studentId: "student", type: "pos", value: 1 }],
      }),
    }),
  );
});
test("history-free policy edits propagate and leave target empty score containers untouched", () => {
  const old = classroom(lesson("lesson", false)),
    next = clone(old);
  next.lessons[0].gradingPolicy.moduleMin = 14;
  const result = courses.mirrorClass(old, next, old);
  assert.equal(result.lessons[0].gradingPolicy.moduleMin, 14);
  assert.deepEqual(plain(result.lessons[0].poudmans[0].podScores), {});
});
test("source guard protects grades even when the other term has no grades", () => {
  const old = classroom(),
    next = clone(old),
    emptyPeer = classroom(lesson("lesson", false));
  next.lessons[0].gradingPolicy.moduleMin = 14;
  conflict(() => courses.mirrorClass(old, next, old));
  assert.equal(
    courses.mirrorClass(old, next, emptyPeer).lessons[0].gradingPolicy
      .moduleMin,
    14,
  );
});
test("method conversion is blocked by attendance-only sessions", () => {
  const old = classroom(lesson("lesson", false)),
    next = clone(old);
  next.lessons[0].gradeMode = "kardanesh";
  next.lessons[0].gradingPolicy.method = "dual";
  conflict(() =>
    courses.mirrorClass(old, next, old, {
      sessions: history({ poudmanId: undefined, unitId: undefined }),
    }),
  );
});
test("pod or unit removal cannot orphan old session references even without grades", () => {
  for (const edit of [
    (l) => (l.poudmans = []),
    (l) => (l.poudmans[0].units = []),
    (l) => (l.poudmans[0].units[0].id = "replacement-unit"),
  ]) {
    const old = classroom(lesson("lesson", false)),
      next = clone(old);
    edit(next.lessons[0]);
    conflict(() =>
      courses.mirrorClass(old, next, old, { sessions: history() }),
    );
  }
});
test("adding a unit without grades is allowed when old session references stay valid", () => {
  const old = classroom(lesson("lesson", false)),
    next = clone(old),
    sessions = history(),
    before = clone(sessions);
  next.lessons[0].poudmans[0].units.push({
    id: "new-unit",
    name: "واحد تازه",
    unitScores: { student: { m: 20 } },
    applyOptions: {},
  });
  const result = courses.mirrorClass(old, next, old, { sessions });
  assert.equal(result.lessons[0].poudmans[0].units.length, 2);
  assert.deepEqual(
    plain(result.lessons[0].poudmans[0].units[1].unitScores),
    {},
  );
  assert.deepEqual(sessions, before);
});
test("structure additions and reordering are blocked if target already has grades", () => {
  const old = classroom(),
    next = clone(old);
  next.lessons[0].poudmans.push({
    id: "new-pod",
    name: "نو",
    podScores: {},
    units: [],
  });
  conflict(() => courses.mirrorClass(old, next, old));
});
test("new missing lessons inherit definitions and stable ids with every score map cleared", () => {
  const old = classroom(),
    next = clone(old);
  next.lessons.push(lesson("new"));
  const result = courses.mirrorClass(old, next, old),
    added = result.lessons[1];
  assert.equal(added.id, "new");
  assert.equal(added.teacher, "دبیر");
  assert.deepEqual(plain(added.kardaneshScores), {});
  assert.deepEqual(plain(added.poudmans[0].podScores), {});
  assert.deepEqual(plain(added.poudmans[0].units[0].unitScores), {});
  assert.deepEqual(plain(result.lessons[0]), old.lessons[0]);
});
test("missing whole companion class receives all definitions even if source definitions were unchanged", () => {
  const old = classroom(),
    result = courses.mirrorClass(old, clone(old), null);
  assert.equal(result.lessons.length, 1);
  assert.deepEqual(plain(result.lessons[0].kardaneshScores), {});
});
test("lesson deletion rejects any stored grade family or attendance session", () => {
  for (const family of ["dual", "pod", "unit", "session"]) {
    const old = classroom(lesson("lesson", false)),
      next = clone(old);
    next.lessons = [];
    if (family === "dual")
      old.lessons[0].kardaneshScores.student = { practical: 0 };
    if (family === "pod")
      old.lessons[0].poudmans[0].podScores.student = { m: 0 };
    if (family === "unit")
      old.lessons[0].poudmans[0].units[0].unitScores.student = { m: 0 };
    conflict(() =>
      courses.mirrorClass(old, next, old, {
        sessions: family === "session" ? history() : [],
      }),
    );
  }
});
test("history-free deletion succeeds but explicit removal denial always blocks", () => {
  const old = classroom(lesson("lesson", false)),
    next = clone(old);
  next.lessons = [];
  assert.equal(courses.mirrorClass(old, next, old).lessons.length, 0);
  conflict(() =>
    courses.mirrorClass(old, next, old, { allowLessonRemoval: false }),
  );
});
test("same-id unexpected companion changes cannot be overwritten by a source correction", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.lessons[0].name = "نام تازه";
  target.lessons[0].teacher = "تغییر مستقل";
  conflict(() => courses.mirrorClass(old, next, target));
});
test("idempotent correction keeps independent term grade payloads", () => {
  const old = classroom(),
    next = clone(old);
  next.lessons[0].name = "اصلاح";
  const first = courses.mirrorClass(old, next, old),
    second = courses.mirrorClass(old, next, first);
  assert.deepEqual(plain(second), plain(first));
});
test("score-map property absence is preserved exactly for existing target lessons", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.lessons[0].name = "تازه";
  delete target.lessons[0].kardaneshScores;
  delete target.lessons[0].poudmans[0].podScores;
  delete target.lessons[0].poudmans[0].units[0].unitScores;
  const result = courses.mirrorClass(old, next, target).lessons[0];
  assert.equal(Object.hasOwn(result, "kardaneshScores"), false);
  assert.equal(Object.hasOwn(result.poudmans[0], "podScores"), false);
  assert.equal(Object.hasOwn(result.poudmans[0].units[0], "unitScores"), false);
});
test("lesson ordering follows explicit source order and rejects conflicting target reorder", () => {
  const old = classroom(
      lesson("one", false),
      lesson("two", false),
      lesson("three", false),
    ),
    next = clone(old);
  next.lessons.reverse();
  assert.deepEqual(
    plain(courses.mirrorClass(old, next, old).lessons.map((l) => l.id)),
    ["three", "two", "one"],
  );
  const target = clone(old);
  target.lessons = [target.lessons[1], target.lessons[0], target.lessons[2]];
  conflict(() => courses.mirrorClass(old, next, target));
});
test("reconciliation unions stable missing lessons and retains own first-term scores only", () => {
  const first = classroom(lesson("one")),
    second = classroom(lesson("one"), lesson("two"));
  second.lessons[0].kardaneshScores.student.theory = 9;
  const common = courses.reconcileClass([first, second]);
  assert.deepEqual(
    plain(common.lessons[0].kardaneshScores),
    first.lessons[0].kardaneshScores,
  );
  assert.deepEqual(plain(common.lessons[1].kardaneshScores), {});
  const projectedSecond = courses.mirrorClass(second, common, second);
  assert.deepEqual(
    plain(projectedSecond.lessons[0].kardaneshScores),
    second.lessons[0].kardaneshScores,
  );
  assert.deepEqual(
    plain(projectedSecond.lessons[1].kardaneshScores),
    second.lessons[1].kardaneshScores,
  );
});
test("reconciliation compares normalized definitions and accepts different grade values", () => {
  const first = classroom(),
    second = clone(first);
  delete first.lessons[0].gradeMode;
  delete first.lessons[0].weightMostamar;
  delete first.lessons[0].poudmans[0].units[0].applyOptions;
  second.lessons[0].poudmans[0].podScores.student.c = 3;
  assert.equal(courses.reconcileClass([first, second]).lessons.length, 1);
});
test("reconciliation rejects description or policy conflicts without silently choosing one term", () => {
  for (const edit of [
    (l) => (l.teacher = "تفاوت"),
    (l) => (l.gradingPolicy.revision = 2),
    (l) => (l.gradingPolicy.moduleMin = 14),
    (l) => (l.poudmans[0].units[0].name = "تفاوت"),
  ]) {
    const first = classroom(),
      second = clone(first);
    edit(second.lessons[0]);
    conflict(() => courses.reconcileClass([first, second]));
  }
});
test("reconciliation refuses same-name different ids instead of merging identities", () => {
  const first = classroom(lesson("one", false)),
    second = classroom(lesson("two", false));
  second.lessons[0].name = first.lessons[0].name;
  conflict(() => courses.reconcileClass([first, second]));
});
test("reconciliation combines compatible partial registration order but rejects cycles", () => {
  const one = lesson("one", false),
    two = lesson("two", false),
    three = lesson("three", false);
  assert.deepEqual(
    plain(
      courses
        .reconcileClass([classroom(one, three), classroom(one, two, three)])
        .lessons.map((l) => l.id),
    ),
    ["one", "two", "three"],
  );
  conflict(() =>
    courses.reconcileClass([classroom(one, two), classroom(two, one)]),
  );
});
test("annual compatibility tolerates descriptions but rejects sensitive rules or branch changes", () => {
  const first = lesson(),
    second = clone(first);
  second.name = "اصلاح";
  second.teacher = "دبیر جدید";
  second.courseInfo.field = "اصلاح رشته";
  second.gradingPolicy.confirmed = true;
  second.poudmans[0].units[0].name = "اصلاح واحد";
  assert.equal(courses.assertCompatible(first, second), true);
  assert.equal(courses.assertCompatible(null, second), true);
  second.gradingPolicy.moduleMin = 14;
  conflict(() => courses.assertCompatible(first, second));
});
test("duplicate structural ids, unsafe ids and unsafe metadata fail closed", () => {
  const duplicates = classroom();
  duplicates.lessons[0].poudmans[0].units[0].id = "lesson";
  conflict(() => courses.projection(duplicates));
  const unsafe = classroom();
  unsafe.lessons[0].id = "__defineGetter__";
  conflict(() => courses.projection(unsafe));
  const extra = classroom();
  extra.lessons[0].extra = JSON.parse('{"constructor":{"polluted":true}}');
  conflict(() => courses.projection(extra));
  conflict(() => courses.reconcileClass([]));
});

test("empty dual placeholders do not freeze history-free course policy and remain intact", () => {
  for (const placeholder of [
    {},
    { final: null, passed: null },
    {
      practical: null,
      theory: null,
      midtermPractical: null,
      midtermTheory: null,
      final: null,
      passed: null,
    },
  ]) {
    const old = classroom(lesson("lesson", false));
    old.lessons[0].kardaneshScores.student = clone(placeholder);
    const next = clone(old);
    next.lessons[0].gradingPolicy.moduleMin = 14;
    const result = courses.mirrorClass(old, next, old);
    assert.equal(result.lessons[0].gradingPolicy.moduleMin, 14);
    assert.deepEqual(
      plain(result.lessons[0].kardaneshScores.student),
      placeholder,
    );
  }
});
test("each raw dual stage including zero still blocks grading policy changes", () => {
  for (const field of [
    "practical",
    "theory",
    "midtermPractical",
    "midtermTheory",
  ]) {
    const old = classroom(lesson("lesson", false));
    old.lessons[0].kardaneshScores.student = { [field]: 0 };
    const next = clone(old);
    next.lessons[0].gradingPolicy.moduleMin = 14;
    conflict(() => courses.mirrorClass(old, next, old));
  }
});
