"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function load(context, file) {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
    context,
  );
}
function fixture() {
  const context = vm.createContext({ structuredClone });
  load(context, "src/domain/revision.js");
  load(context, "src/domain/data-boundary.js");
  load(context, "src/domain/grade-math.js");
  load(context, "src/domain/grade-policy.js");
  load(context, "src/domain/reporting/academic-results.js");
  load(context, "src/workspace/grading/results.js");
  return context;
}
function dual(context, overrides = {}) {
  return {
    id: "lesson",
    name: "درس مهارتی",
    gradeMode: "kardanesh",
    gradingPolicy: {
      ...context.EduPolicy.defaults("dual", "1405-1406"),
      dualConfigurable: true,
      ...overrides,
    },
    poudmans: [],
    kardaneshScores: {},
  };
}
function modular(context) {
  return {
    id: "lesson",
    name: "درس پودمانی",
    gradeMode: "standard",
    gradingPolicy: context.EduPolicy.defaults("modular", "1405-1406"),
    poudmans: [
      { id: "pod-one", units: [{ id: "unit-one" }, { id: "unit-two" }] },
      { id: "pod-two", units: [{ id: "unit-three" }] },
    ],
  };
}
function parts(first, second) {
  return [first, second].map((lesson, index) => ({
    period: { id: index ? "second" : "first", term: index ? "دوم" : "اول" },
    data: {
      schools: [
        { id: "school", classes: [{ id: "class", lessons: [lesson] }] },
      ],
    },
  }));
}

test("annual dual course rejects differences in effective weights and every acceptance threshold", () => {
  const c = fixture();
  for (const field of [
    "practicalWeight",
    "passMin",
    "theoryMin",
    "practicalMin",
  ])
    assert.throws(
      () => c.assertCompatibleTermLessons(dual(c), dual(c, { [field]: 1 })),
      /قواعد نمره‌دهی/,
      field,
    );
});

test("nonconfigurable dual policies retain legacy 70/30/14 semantics across terms", () => {
  const c = fixture(),
    first = dual(c, { dualConfigurable: false });
  const legacy = structuredClone(first);
  Object.assign(legacy.gradingPolicy, {
    practicalWeight: 1,
    passMin: 0,
    theoryMin: 20,
    practicalMin: 20,
  });
  assert.doesNotThrow(() => c.assertCompatibleTermLessons(first, legacy));
  assert.doesNotThrow(() =>
    c.assertCompatibleTermLessons(first, {
      id: first.id,
      name: first.name,
      gradeMode: "kardanesh",
      poudmans: [],
    }),
  );
  assert.throws(
    () =>
      c.assertCompatibleTermLessons(legacy, dual(c, { practicalWeight: 60 })),
    /قواعد نمره‌دهی/,
  );
});

test("general lessons ignore unused practical weights and acceptance fields", () => {
  const c = fixture(),
    first = dual(c, { subjectType: "general" });
  const second = dual(c, {
    subjectType: "general",
    practicalWeight: 1,
    passMin: 2,
    theoryMin: 3,
    practicalMin: 4,
  });
  assert.doesNotThrow(() => c.assertCompatibleTermLessons(first, second));
  assert.throws(() => c.assertCompatibleTermLessons(first, dual(c)), /نوع درس/);
});

test("descriptive policy revisions do not change effective dual compatibility", () => {
  const c = fixture(),
    first = dual(c),
    second = dual(c);
  Object.assign(second.gradingPolicy, {
    revision: 9,
    code: "corrected-code",
    reference: "مرجع اصلاح‌شده",
    confirmed: true,
  });
  second.name = "عنوان اصلاح‌شده";
  assert.doesNotThrow(() => c.assertCompatibleTermLessons(first, second));
});

test("annual report rejects incompatible dual rules before reading scores", () => {
  const c = fixture();
  c.knownStudents = () => {
    throw Error("scores must not be accessed");
  };
  assert.throws(
    () =>
      c.annualGradeRows(
        parts(dual(c), dual(c, { passMin: 10 })),
        "school",
        "class",
      ),
    /قواعد نمره‌دهی/,
  );
});

test("annual technical report rejects effective modular policy differences before calculating grades", () => {
  const c = fixture();
  for (const field of [
    "version",
    "mostamarMax",
    "competencyFactor",
    "competencyMin",
    "moduleMin",
    "continuousStep",
  ]) {
    const changed = modular(c);
    changed.gradingPolicy[field] += 1;
    assert.throws(
      () =>
        c.annualTechnicalRows(parts(modular(c), changed), "school", "class"),
      /قواعد نمره‌دهی/,
      field,
    );
  }
});

test("formal modular compatibility requires identical module and work-unit identities", () => {
  const c = fixture(),
    first = modular(c);
  for (const mutate of [
    (lesson) => {
      lesson.poudmans[0].id = "new-pod";
    },
    (lesson) => {
      lesson.poudmans[0].units[0].id = "new-unit";
    },
    (lesson) => {
      lesson.poudmans[0].units.pop();
    },
    (lesson) => {
      lesson.poudmans.pop();
    },
  ]) {
    const changed = structuredClone(first);
    mutate(changed);
    assert.throws(
      () => c.assertCompatibleTermLessons(first, changed),
      /ساختار پودمان/,
    );
  }
});

test("module and unit reordering or descriptive corrections preserve effective compatibility", () => {
  const c = fixture(),
    first = modular(c),
    second = structuredClone(first);
  second.poudmans.reverse();
  second.poudmans[1].units.reverse();
  second.poudmans[1].name = "نام اصلاح‌شده";
  second.gradingPolicy.revision = 5;
  assert.doesNotThrow(() => c.assertCompatibleTermLessons(first, second));
});

test("duplicate module or unit identities cannot pass annual compatibility", () => {
  const c = fixture(),
    first = modular(c);
  const pod = structuredClone(first),
    unit = structuredClone(first);
  pod.poudmans.push(structuredClone(pod.poudmans[0]));
  unit.poudmans[0].units.push(structuredClone(unit.poudmans[0].units[0]));
  assert.throws(
    () => c.assertCompatibleTermLessons(first, pod),
    /شناسهٔ تکراری/,
  );
  assert.throws(
    () => c.assertCompatibleTermLessons(first, unit),
    /شناسهٔ تکراری/,
  );
});

function editorFixture({
  locked = true,
  history = { hasGrades: true, hasSessions: false },
} = {}) {
  const c = fixture(),
    lesson = dual(c),
    classroom = { id: "class", lessons: [lesson] };
  const state = { classId: "class" },
    context = { id: "first", revision: 2 };
  const values = {
    name: lesson.name,
    teacher: "دبیر",
    periods: "2",
    branch: "kardanesh",
  };
  const calls = [];
  c.editing = {
    context: { ...context },
    classId: "class",
    id: "lesson",
    seed: structuredClone(lesson),
    locked,
  };
  Object.assign(c, {
    saving: false,
    P: c.EduPolicy,
    document: { getElementById: () => ({}), querySelector: () => ({}) },
    beginRecordEditorSave: () => () => {},
    writable() {},
    val: (key) => values[key],
    number: (key) => Number(values[key]),
    normalizedName: (value) => value.trim(),
    recordFieldError: (message) => Error(message),
    api: {
      context: () => context,
      state: () => state,
      flushDrafts: async () => {},
      findClass: () => classroom,
      courseHistory: async () => history,
      year: () => "1405-1406",
      getDB: () => ({ sessions: [] }),
      saveDB: async () => calls.push("saved"),
      render: () => calls.push("rendered"),
    },
  });
  load(c, "src/ui/course/save.js");
  return { c, lesson, classroom, values, calls, context, state };
}

test("editing a course with grades in another term preserves its policy while allowing descriptive corrections", async () => {
  const f = editorFixture();
  const policy = JSON.stringify(f.lesson.gradingPolicy);
  f.values.name = "عنوان جدید";
  f.values.practicalWeight = "1";
  await f.c.save();
  assert.equal(f.classroom.lessons[0].name, "عنوان جدید");
  assert.equal(JSON.stringify(f.classroom.lessons[0].gradingPolicy), policy);
  assert.deepEqual(f.calls, ["saved", "rendered"]);
});

test("new grades in another term invalidate an unlocked open course editor", async () => {
  const f = editorFixture({ locked: false });
  await assert.rejects(f.c.save(), /سوابق این درس تغییر کرده/);
  assert.equal(f.classroom.lessons[0], f.lesson);
  assert.deepEqual(f.calls, []);
});

test("changing active term or class during annual history checks prevents editor writes", async () => {
  for (const mutate of [
    (f) => {
      f.context.id = "second";
    },
    (f) => {
      f.context.revision++;
    },
    (f) => {
      f.state.classId = "other-class";
    },
  ]) {
    const f = editorFixture();
    f.c.api.courseHistory = async () => {
      mutate(f);
      return { hasGrades: true, hasSessions: false };
    };
    await assert.rejects(f.c.save(), /اطلاعات سال تحصیلی.*تغییر کرد/);
    assert.deepEqual(f.calls, []);
  }
});

test("a legacy editor fixture without annual history support retains local behavior", async () => {
  const f = editorFixture({ locked: true });
  f.lesson.kardaneshScores.student = { practical: 10, theory: 14 };
  delete f.c.api.courseHistory;
  await f.c.save();
  assert.equal(f.calls[0], "saved");
});

test("opening a course editor checks other-term grades before determining its policy lock", async () => {
  const f = editorFixture();
  f.c.editing = null;
  f.c.document.getElementById = () => null;
  f.c.currentClass = () => f.classroom;
  f.c.api.showCourseClass = () => {};
  load(f.c, "src/ui/course/form.js");
  let locked;
  f.c.courseFormHtml = (_lesson, _original, selectedLock) => {
    locked = selectedLock;
    throw Error("form lock captured");
  };
  await assert.rejects(f.c.open("lesson"), /form lock captured/);
  assert.equal(locked, true);
});

test("changing revision during annual history lookup prevents opening a stale editor", async () => {
  const f = editorFixture();
  f.c.editing = null;
  f.c.document.getElementById = () => null;
  f.c.currentClass = () => f.classroom;
  f.c.api.courseHistory = async () => {
    f.context.revision++;
    return { hasGrades: true, hasSessions: false };
  };
  load(f.c, "src/ui/course/form.js");
  await assert.rejects(f.c.open("lesson"), /اطلاعات سال تحصیلی.*تغییر کرد/);
  assert.equal(f.c.editing, null);
});

function modularValues(values) {
  Object.assign(values, {
    branch: "fani",
    method: "modular",
    subjectType: "vocational",
    mostamarMax: "5",
    continuousStep: "0.5",
    competencyFactor: "5",
    competencyMin: "2",
    moduleMin: "12",
    unitCount: "1",
    podCount: "1",
    circularNumber: "",
    circularDate: "",
    reference: "",
  });
}

test("a session in another term prevents switching the annual course grading method", async () => {
  const f = editorFixture({
    locked: false,
    history: { hasGrades: false, hasSessions: true },
  });
  modularValues(f.values);
  await assert.rejects(f.c.save(), /درس دارای جلسه است/);
  assert.deepEqual(f.calls, []);
  assert.equal(f.classroom.lessons[0].gradeMode, "kardanesh");
});

test("a session in another term prevents destructive work-unit count changes", async () => {
  const f = editorFixture({
    locked: false,
    history: { hasGrades: false, hasSessions: true },
  });
  Object.assign(f.lesson, modular(f.c));
  f.lesson.kardaneshScores = {};
  f.c.editing.seed = structuredClone(f.lesson);
  modularValues(f.values);
  f.values.podCount = "2";
  f.values["unitCount_pod-one"] = "1";
  await assert.rejects(f.c.save(), /تغییر تعداد واحدهای درس دارای جلسه/);
  assert.deepEqual(f.calls, []);
  assert.equal(f.classroom.lessons[0].poudmans[0].units.length, 2);
});

function modularEditorFixture(options = {}) {
  const f = editorFixture({
    locked: false,
    history: { hasGrades: false, hasSessions: false },
    ...options,
  });
  Object.assign(f.lesson, modular(f.c));
  f.lesson.kardaneshScores = {};
  for (const [pi, pod] of f.lesson.poudmans.entries()) {
    pod.name = "پودمان موجود " + pi;
    pod.podScores = {};
    for (const [ui, unit] of pod.units.entries()) {
      unit.name = "واحد موجود " + ui;
      unit.unitScores = {};
      unit.applyOptions = { mostamar: true };
    }
  }
  f.c.editing.seed = structuredClone(f.lesson);
  modularValues(f.values);
  f.values.podCount = String(f.lesson.poudmans.length);
  let nextId = 0;
  f.c.api.uid = () => "new-" + ++nextId;
  load(f.c, "src/ui/course/structure-names.js");
  const controls = fs.readFileSync(
    path.join(__dirname, "../src/ui/course/state-controls.js"),
    "utf8",
  );
  vm.runInContext(controls.slice(controls.indexOf("function makePods(")), f.c);
  return f;
}

test("a course policy can advance to the last safe revision", async () => {
  const f = modularEditorFixture();
  f.lesson.gradingPolicy.revision = Number.MAX_SAFE_INTEGER - 1;
  f.c.editing.seed = structuredClone(f.lesson);
  f.values.reference = "مرجع اصلاح‌شده";
  await f.c.save();
  assert.equal(
    f.classroom.lessons[0].gradingPolicy.revision,
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(
    f.classroom.lessons[0].gradingPolicy.reference,
    "مرجع اصلاح‌شده",
  );
  assert.deepEqual(f.calls, ["saved", "rendered"]);
});

test("an exhausted course policy revision rejects an editor change before mutating or saving", async () => {
  const f = modularEditorFixture();
  f.lesson.gradingPolicy.revision = Number.MAX_SAFE_INTEGER;
  f.c.editing.seed = structuredClone(f.lesson);
  f.values.reference = "مرجع اصلاح‌شده";
  const before = JSON.stringify(f.classroom),
    editing = f.c.editing;
  await assert.rejects(
    f.c.save(),
    (error) => error.code === "REVISION_LIMIT_REACHED",
  );
  assert.equal(JSON.stringify(f.classroom), before);
  assert.equal(f.classroom.lessons[0], f.lesson);
  assert.equal(f.c.editing, editing);
  assert.equal(f.c.saving, false);
  assert.deepEqual(f.calls, []);
});

test("unchanged modular counts preserve stable identities, variable unit counts, names and maps", async () => {
  const f = modularEditorFixture();
  const before = JSON.stringify(f.lesson.poudmans);
  f.values.teacher = "دبیر اصلاح‌شده";
  await f.c.save();
  assert.equal(JSON.stringify(f.classroom.lessons[0].poudmans), before);
  assert.equal(f.classroom.lessons[0].teacher, "دبیر اصلاح‌شده");
});

test("increasing module count appends empty stable-ID modules and preserves retained modules exactly", async () => {
  const f = modularEditorFixture();
  const before = JSON.stringify(f.lesson.poudmans);
  f.values.podCount = "3";
  await f.c.save();
  const pods = f.classroom.lessons[0].poudmans;
  assert.equal(pods.length, 3);
  assert.equal(JSON.stringify(pods.slice(0, 2)), before);
  assert.equal(pods[2].id, "new-1");
  assert.equal(JSON.stringify(pods[2].podScores), "{}");
  assert.equal(pods[2].units.length, 1);
  assert.equal(pods[2].units[0].id, "new-2");
  assert.equal(JSON.stringify(pods[2].units[0].unitScores), "{}");
  assert.equal(f.lesson.poudmans.length, 2);
});

test("changing the global unit count resizes every module while retaining existing unit identities and options", async () => {
  const f = modularEditorFixture();
  f.values.unitCount = "3";
  await f.c.save();
  const pods = f.classroom.lessons[0].poudmans;
  assert.deepEqual(
    Array.from(pods, (pod) => pod.units.length),
    [3, 3],
  );
  assert.equal(pods[0].units[0].id, "unit-one");
  assert.equal(pods[0].units[1].id, "unit-two");
  assert.equal(pods[1].units[0].id, "unit-three");
  assert.equal(pods[0].units[0].applyOptions.mostamar, true);
  const ids = pods.flatMap((pod) => pod.units.map((unit) => unit.id));
  assert.equal(new Set(ids).size, 6);
  assert.equal(f.classroom.lessons[0].gradingPolicy.unitCount, 3);
});

test("module and unit count reductions remove only trailing structures before any history exists", async () => {
  const f = modularEditorFixture();
  f.lesson.gradingPolicy.unitCount = 2;
  f.lesson.poudmans[1].units.push({
    id: "unit-four",
    name: "واحد چهارم",
    unitScores: {},
    applyOptions: {},
  });
  f.c.editing.seed = structuredClone(f.lesson);
  f.values.podCount = "1";
  f.values.unitCount = "1";
  await f.c.save();
  const pods = f.classroom.lessons[0].poudmans;
  assert.equal(pods.length, 1);
  assert.equal(pods[0].id, "pod-one");
  assert.equal(pods[0].units.length, 1);
  assert.equal(pods[0].units[0].id, "unit-one");
  assert.equal(f.lesson.poudmans.length, 2);
  assert.equal(f.lesson.poudmans[0].units.length, 2);
});

test("sessions in any term reject module and global unit count edits without changing the class", async () => {
  for (const change of [
    { podCount: "1" },
    { podCount: "3" },
    { unitCount: "3" },
  ]) {
    const f = modularEditorFixture({
      history: { hasGrades: false, hasSessions: true },
    });
    Object.assign(f.values, change);
    const before = JSON.stringify(f.classroom);
    await assert.rejects(f.c.save(), /درس دارای جلسه/);
    assert.equal(JSON.stringify(f.classroom), before);
    assert.deepEqual(f.calls, []);
  }
});

test("out-of-range or fractional module and unit counts never mutate an existing course", async () => {
  for (const field of ["podCount", "unitCount"])
    for (const value of ["0", field === "podCount" ? "21" : "11", "1.5"]) {
      const f = modularEditorFixture();
      f.values[field] = value;
      const before = JSON.stringify(f.classroom);
      await assert.rejects(f.c.save(), /تعداد (?:پودمان|واحد)/);
      assert.equal(JSON.stringify(f.classroom), before);
      assert.deepEqual(f.calls, []);
    }
});

test("converting an unused dual course creates the requested fresh modular structure", async () => {
  const f = editorFixture({
    locked: false,
    history: { hasGrades: false, hasSessions: false },
  });
  modularValues(f.values);
  f.values.podCount = "3";
  f.values.unitCount = "2";
  let nextId = 0;
  f.c.api.uid = () => "created-" + ++nextId;
  f.c.applyStructureNames = () => {};
  const controls = fs.readFileSync(
    path.join(__dirname, "../src/ui/course/state-controls.js"),
    "utf8",
  );
  vm.runInContext(controls.slice(controls.indexOf("function makePods(")), f.c);
  await f.c.save();
  const lesson = f.classroom.lessons[0];
  assert.equal(lesson.gradeMode, "standard");
  assert.equal(lesson.poudmans.length, 3);
  assert.equal(
    lesson.poudmans.every((pod) => pod.units.length === 2),
    true,
  );
  const ids = lesson.poudmans.flatMap((pod) => [
    pod.id,
    ...pod.units.map((unit) => unit.id),
  ]);
  assert.equal(new Set(ids).size, 9);
});

test("converting an unused modular course to dual removes inactive modular structure", async () => {
  const f = modularEditorFixture();
  Object.assign(f.values, {
    method: "dual",
    branch: "kardanesh",
    practicalWeight: "70",
    passMin: "14",
    practicalMin: "0",
    theoryMin: "0",
  });
  await f.c.save();
  assert.equal(f.classroom.lessons[0].gradeMode, "kardanesh");
  assert.equal(f.classroom.lessons[0].poudmans.length, 0);
});

test("existing modular count controls remain visible while dual controls keep them hidden", () => {
  const c = vm.createContext({
    editing: { seed: { poudmans: [{ id: "existing" }] }, locked: false },
    val: (key) => (key === "method" ? "modular" : "vocational"),
    syncTheoryWeight: () => {},
    setControlDisabled: () => {},
  });
  const nodes = new Map();
  c.document = {
    getElementById: (id) => {
      if (!nodes.has(id))
        nodes.set(id, {
          hidden: false,
          value: "modular",
          closest: () => ({}),
          matches: () => false,
        });
      return nodes.get(id);
    },
  };
  load(c, "src/ui/course/method.js");
  c.syncTheoryWeight = () => {};
  c.toggleMethod();
  assert.equal(nodes.get("courseAdvanced").hidden, false);
  c.val = (key) => (key === "method" ? "dual" : "vocational");
  c.toggleMethod();
  assert.equal(nodes.get("courseAdvanced").hidden, true);
});

test("new module and unit names stay distinct from existing custom titles", async () => {
  const f = modularEditorFixture();
  f.lesson.poudmans[0].name = "پودمان 3";
  f.lesson.poudmans[0].units[0].name = "واحد یادگیری 3";
  f.c.editing.seed = structuredClone(f.lesson);
  f.values.podCount = "3";
  f.values.unitCount = "3";
  await f.c.save();
  const pods = f.classroom.lessons[0].poudmans;
  assert.equal(pods[0].name, "پودمان 3");
  assert.equal(pods[2].name, "پودمان 3 (2)");
  assert.equal(pods[0].units[0].name, "واحد یادگیری 3");
  assert.equal(pods[0].units[2].name, "واحد یادگیری 3 (2)");
  assert.equal(new Set(pods.map((pod) => pod.name)).size, pods.length);
  for (const pod of pods)
    assert.equal(
      new Set(pod.units.map((unit) => unit.name)).size,
      pod.units.length,
    );
});
