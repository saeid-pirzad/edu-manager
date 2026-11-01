"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const clone = structuredClone,
  plain = (value) => JSON.parse(JSON.stringify(value)),
  firstTerm = "\u0627\u0648\u0644",
  secondTerm = "\u062f\u0648\u0645",
  year = "1405-1406";
function database() {
  const policy = (method) => ({
    version: 1,
    revision: 7,
    method,
    branch: method === "dual" ? "kardanesh" : "fani",
    year,
    grade: "10",
    field: "original-field",
    code: "old-code",
    authority: "old-authority",
    confirmed: true,
    circularNumber: "circular-7",
    circularDate: "1405/01/01",
    reference: "original-reference",
  });
  const lesson = (id, method) => ({
    id,
    name: "Course " + id,
    teacher: "Original teacher",
    periodsPerWeek: 2,
    gradeMode: method === "dual" ? "kardanesh" : "standard",
    weightMostamar: 40,
    weightPayani: 60,
    gradingPolicy: policy(method),
    // A descriptive correction must not rewrite a graded policy's identity.
    courseInfo: {
      year,
      grade: "11",
      field: "corrected-field",
      code: "corrected-code",
      authority: "corrected-authority",
      branch: method === "dual" ? "kardanesh" : "fani",
    },
    kardaneshScores: {
      student: {
        practical: 0,
        theory: 15,
        midtermPractical: 16,
        midtermTheory: 0,
      },
    },
    poudmans: [
      {
        id: id + "_pod",
        name: "Module",
        podScores: {
          student: { m: 0, c: 2, note: "keep exact annual grade" },
          archived: { m: 3, c: 0 },
          alien: { m: 4, c: 2 },
        },
        units: [
          {
            id: id + "_unit",
            name: "Unit",
            unitScores: { student: { m: 0, p: 18 } },
            applyOptions: {},
          },
        ],
      },
    ],
  });
  return {
    settings: { academicYear: year, academicTerm: firstTerm, password: "" },
    schools: [
      {
        id: "school",
        name: "School",
        classes: [
          {
            id: "classroom",
            name: "Class",
            students: [{ id: "student", name: "Student" }],
            archivedStudents: [{ id: "archived", name: "Archived" }],
            lessons: [lesson("dual", "dual"), lesson("modular", "modular")],
          },
        ],
      },
    ],
    masterSchedule: {
      school: { slot: { classId: "classroom", lessonId: "dual" } },
    },
    sessions: [{ id: "session", classId: "classroom", lessonId: "dual" }],
    migrationWarnings: ["old warning"],
  };
}
function fixture({
  targetYear = year,
  term = secondTerm,
  inactiveSource = false,
} = {}) {
  const source = database(),
    original = clone(source),
    first = {
      id: "first",
      year,
      term: firstTerm,
      termKind: "first",
      closed: true,
      revision: 9,
    },
    effects = { installs: [], switches: [], snapshots: [], normalizes: [] },
    workspace = inactiveSource
      ? { id: "other", year: "1404-1405", term: firstTerm, revision: 4 }
      : clone(first),
    active = inactiveSource ? database() : clone(source);
  if (inactiveSource)
    active.schools[0].classes[0].lessons[0].name = "Unrelated active course";
  const c = vm.createContext({
    structuredClone,
    clone,
    fileMode: false,
    db: active,
    workspace,
    writer: Promise.resolve(),
    document: {
      getElementById(id) {
        return { value: id === "periodYear" ? targetYear : term };
      },
    },
    asciiDigits: (value) => value,
    preserveAsyncTarget: () => () => {},
    flushDrafts: async () => {},
    captureWorkspaceContext: () => ({
      id: workspace.id,
      revision: workspace.revision,
    }),
    assertWorkspaceContext: (context) => {
      assert.equal(context.id, workspace.id);
      assert.equal(context.revision, workspace.revision);
    },
    allFrom: async (store) => {
      assert.equal(store, "catalog");
      return [clone(first)];
    },
    readWorkspaceSnapshot: async (id) => {
      effects.snapshots.push(id);
      return { period: clone(first), data: clone(source) };
    },
    // Capture the creator's transformation at the validation/storage boundary.
    normalizeDB(data) {
      effects.normalizes.push(clone(data));
      return clone(data);
    },
  });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/grade-policy.js",
    "domain/academic-year-courses.js",
    "workspace/periods/install.js",
    "workspace/periods/switch-create.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  c.installWorkspace = async (data, options) => {
    effects.installs.push({ data: clone(data), options: clone(options) });
    return { id: "created" };
  };
  c.switchPeriod = async (id) => effects.switches.push(id);
  return { c, source, original, first, effects };
}
const classOf = (data) => data.schools[0].classes[0];

test("second term preserves every shared definition when descriptive identity differs from graded policy", async () => {
  const f = fixture();
  await f.c.createNewPeriod();
  const installed = f.effects.installs[0].data;
  assert.deepEqual(
    plain(f.c.EduAcademicYearCourses.projection(classOf(installed))),
    plain(f.c.EduAcademicYearCourses.projection(classOf(f.original))),
  );
  assert.deepEqual(
    classOf(installed).lessons.map((lesson) => lesson.gradingPolicy),
    classOf(f.original).lessons.map((lesson) => lesson.gradingPolicy),
  );
  assert.deepEqual(
    classOf(installed).lessons.map((lesson) => lesson.courseInfo),
    classOf(f.original).lessons.map((lesson) => lesson.courseInfo),
  );
  assert.equal(classOf(installed).lessons[0].gradingPolicy.confirmed, true);
  assert.equal(classOf(installed).lessons[0].gradingPolicy.revision, 7);
  assert.deepEqual(f.source, f.original);
  assert.deepEqual(f.effects.installs[0].options, {
    year,
    term: secondTerm,
    requireSequence: true,
    firstRevision: 9,
  });
  assert.deepEqual(f.effects.switches, ["created"]);
});

test("same-year copying does not invent courseInfo or missing descriptive policy fields", async () => {
  const f = fixture();
  for (const lesson of classOf(f.source).lessons) {
    delete lesson.courseInfo;
    delete lesson.gradingPolicy.code;
    delete lesson.gradingPolicy.authority;
  }
  const expected = clone(classOf(f.source));
  await f.c.createNewPeriod();
  const actual = classOf(f.effects.installs[0].data);
  for (const lesson of actual.lessons) {
    assert.equal(Object.hasOwn(lesson, "courseInfo"), false);
    assert.equal(Object.hasOwn(lesson.gradingPolicy, "code"), false);
    assert.equal(Object.hasOwn(lesson.gradingPolicy, "authority"), false);
  }
  assert.deepEqual(
    plain(f.c.EduAcademicYearCourses.projection(actual)),
    plain(f.c.EduAcademicYearCourses.projection(expected)),
  );
});

test("second term clears term grades and sessions but carries exact known-student annual modular grades", async () => {
  const f = fixture();
  await f.c.createNewPeriod();
  const installed = f.effects.installs[0].data,
    classroom = classOf(installed),
    [dual, modular] = classroom.lessons;
  assert.deepEqual(installed.sessions, []);
  assert.deepEqual(installed.migrationWarnings, []);
  assert.equal(installed.settings.academicTerm, secondTerm);
  assert.deepEqual(classroom.students, classOf(f.original).students);
  assert.deepEqual(
    classroom.archivedStudents,
    classOf(f.original).archivedStudents,
  );
  assert.deepEqual(installed.masterSchedule, f.original.masterSchedule);
  for (const lesson of classroom.lessons) {
    assert.deepEqual(lesson.kardaneshScores, {});
    assert.deepEqual(lesson.poudmans[0].units[0].unitScores, {});
  }
  assert.deepEqual(dual.poudmans[0].podScores, {});
  assert.deepEqual(modular.poudmans[0].podScores, {
    student: { m: 0, c: 2, note: "keep exact annual grade" },
    archived: { m: 3, c: 0 },
  });
  assert.deepEqual(classOf(f.source).lessons[0].kardaneshScores.student, {
    practical: 0,
    theory: 15,
    midtermPractical: 16,
    midtermTheory: 0,
  });
});

test("inactive closed first term supplies the second term instead of the active unrelated workspace", async () => {
  const f = fixture({ inactiveSource: true });
  await f.c.createNewPeriod();
  assert.deepEqual(f.effects.snapshots, ["first"]);
  const classroom = classOf(f.effects.installs[0].data);
  assert.equal(classroom.lessons[0].name, "Course dual");
  assert.deepEqual(
    plain(f.c.EduAcademicYearCourses.projection(classroom)),
    plain(f.c.EduAcademicYearCourses.projection(classOf(f.original))),
  );
});

test("new academic year renews identity and policy confirmation while clearing all prior-year grades", async () => {
  const f = fixture({ targetYear: "1406-1407", term: firstTerm });
  await f.c.createNewPeriod();
  const installed = f.effects.installs[0].data,
    classroom = classOf(installed);
  assert.deepEqual(f.effects.snapshots, []);
  assert.deepEqual(classroom.archivedStudents, []);
  assert.equal(installed.settings.academicYear, "1406-1407");
  for (const lesson of classroom.lessons) {
    assert.equal(lesson.courseInfo.year, "1406-1407");
    assert.equal(lesson.gradingPolicy.year, "1406-1407");
    assert.equal(lesson.gradingPolicy.code, "corrected-code");
    assert.equal(lesson.gradingPolicy.confirmed, false);
    assert.equal(lesson.gradingPolicy.revision, 1);
    assert.equal(lesson.gradingPolicy.circularNumber, "");
    assert.equal(lesson.gradingPolicy.circularDate, "");
    assert.equal(lesson.gradingPolicy.reference, "");
    assert.deepEqual(lesson.kardaneshScores, {});
    assert.deepEqual(lesson.poudmans[0].podScores, {});
    assert.deepEqual(lesson.poudmans[0].units[0].unitScores, {});
  }
  assert.deepEqual(f.c.db, f.original);
});

test("a first term changed or reopened during source read prevents any new installation", async () => {
  for (const change of [{ revision: 10 }, { closed: false }]) {
    const f = fixture();
    f.c.readWorkspaceSnapshot = async () => ({
      period: { ...f.first, ...change },
      data: clone(f.source),
    });
    await assert.rejects(f.c.createNewPeriod());
    assert.deepEqual(f.effects.installs, []);
    assert.deepEqual(f.effects.switches, []);
    assert.deepEqual(f.effects.normalizes, []);
  }
});
