"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const c = vm.createContext({
    structuredClone,
    workspace: {
      id: "first",
      year: "1405-1406",
      term: "اول",
      termKind: "first",
    },
    getSortedStudents: (classroom) => classroom.students,
    esc: (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
  });
  for (const file of [
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/reporting/academic-results.js",
    "workspace/domain/defaults-numbers.js",
    "legacy/grading/calculation.js",
    "legacy/grading/kardanesh.js",
    "workspace/grading/results.js",
    "workspace/courses/results.js",
    "workspace/reports/finalize.js",
    "workspace/reports/student.js",
    "validation/frozen-report.js",
    "legacy/students/archive.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
      { filename: file },
    );
  c.old = { calcStudentLesson: c.legacy_calcStudentLesson };
  c.gradeStatus = c.policyStatus;
  const grades = [{ m: 3.5, c: 3 }, { m: 0, c: 2 }, { m: 1.5 }, {}],
    lesson = {
      id: "lesson",
      name: "درس پودمانی",
      gradeMode: "standard",
      gradingPolicy: c.EduPolicy.defaults("modular", "1405-1406"),
      poudmans: grades.map((inputs, index) => ({
        id: "module-" + index,
        name: "پودمان " + index,
        units: [],
        podScores: { student: inputs, other: { m: 5, c: 3 } },
      })),
    },
    classroom = {
      id: "class",
      name: "کلاس",
      students: [{ id: "student", name: "هنرجو" }],
      archivedStudents: [
        { id: "archived", name: "بایگانی" },
        { id: "other", name: "هنرجوی دیگر" },
      ],
      lessons: [lesson],
    };
  c.db = {
    schools: [{ id: "school", name: "مدرسه", classes: [classroom] }],
    sessions: [],
  };
  const report = () => ({
    id: "report",
    workspace: "first",
    year: "1405-1406",
    term: "اول",
    at: "2026-11-02T00:00:00.000Z",
    classes: c.finalReportData().classes,
  });
  return { c, lesson, classroom, report };
}

test("frozen annual modules preserve detached per-student raw inputs, exact zero and partial progress", () => {
  const { c, lesson, report } = fixture(),
    snapshot = report(),
    modules = snapshot.classes[0].students[0].lessons[0].modules;
  assert.equal(c.finalReportData().missing.length, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(modules.map((module) => module.inputs))),
    [
      { m: 3.5, c: 3 },
      { m: 0, c: 2 },
      { m: 1.5, c: null },
      { m: null, c: null },
    ],
  );
  assert.equal(modules[0].final, 18.5);
  assert.equal(modules[1].final, 10);
  assert.equal(modules[2].final, null);
  assert.equal(c.validateFrozenReport(snapshot), true);
  const before = JSON.stringify(snapshot);
  lesson.poudmans[0].podScores.student.m = 5;
  lesson.poudmans[0].name = "نام جدید";
  assert.equal(JSON.stringify(snapshot), before);
});

test("frozen module rows reveal completed, failed, partial and empty modules with their real inputs", () => {
  const { c, report } = fixture(),
    lesson = report().classes[0].students[0].lessons[0],
    before = JSON.stringify(lesson),
    html = c.frozenLessonRows(lesson);
  for (let index = 0; index < 4; index++)
    assert.match(html, new RegExp('data-module-id="module-' + index + '"'));
  for (const fragment of [
    "18.50",
    "10.00",
    "<b>3.5</b>",
    "<b>0</b>",
    "<b>1.5</b>",
  ])
    assert.ok(html.includes(fragment), fragment);
  assert.doesNotMatch(html, /20\.00/);
  assert.equal(JSON.stringify(lesson), before);
});

test("result-only old frozen reports remain valid and show every module without fabricating raw grades", () => {
  const { c, report } = fixture(),
    snapshot = report(),
    lesson = snapshot.classes[0].students[0].lessons[0];
  for (const module of lesson.modules) delete module.inputs;
  const before = JSON.stringify(snapshot);
  assert.equal(c.validateFrozenReport(snapshot), true);
  const html = c.frozenLessonRows(lesson);
  assert.match(html, /18\.50/);
  assert.match(html, /10\.00/);
  assert.equal((html.match(/<b>—<\/b>/g) || []).length, 8);
  assert.equal(JSON.stringify(snapshot), before);
});

test("frozen raw module inputs are validated against policy limits, step, shape and exact result", () => {
  const { c, report } = fixture();
  for (const inputs of [
    null,
    [],
    { m: 3.5 },
    { m: 3.5, c: 3, extra: 1 },
    { m: "3.5", c: 3 },
    { m: NaN, c: 3 },
    { m: Infinity, c: 3 },
    { m: -0.5, c: 3 },
    { m: 5.5, c: 3 },
    { m: 3.25, c: 3 },
    { m: 3.5, c: 0 },
    { m: 3.5, c: 4 },
    { m: 3.5, c: 2.5 },
    { m: 3.5, c: null },
    { m: null, c: null },
    { m: 4, c: 3 },
    { m: undefined, c: 3 },
  ]) {
    const snapshot = report();
    snapshot.classes[0].students[0].lessons[0].modules[0].inputs = inputs;
    assert.throws(
      () => c.validateFrozenReport(snapshot),
      JSON.stringify(inputs),
    );
  }
});

test("frozen raw input validation rejects a forged complete, passed or aggregate grade", () => {
  const { c, report } = fixture();
  for (const change of [
    { final: 19 },
    { complete: false },
    { passed: false },
  ]) {
    const snapshot = report();
    Object.assign(
      snapshot.classes[0].students[0].lessons[0].modules[0],
      change,
    );
    assert.throws(() => c.validateFrozenReport(snapshot));
  }
});

test("archive report delegates to the shared year-wide guarded route instead of the current-term modal", () => {
  const { c, classroom } = fixture();
  let reads = 0,
    renders = 0;
  c.state = { schoolId: "school", classId: classroom.id };
  c.getClassObj = () => classroom;
  c.findClassById = () => ({ school: { id: "school" }, classObj: classroom });
  c.assertWorkspaceReadable = () => reads++;
  c.EduV24 = { openKarnamehStudent: c.openKarnamehStudent };
  c.closeModal = () => {};
  c.render = () => renders++;
  c.showModal = () => assert.fail("Must not render the old term-only modal");
  c.showArchivedKarnameh("archived");
  assert.equal(reads, 1);
  assert.equal(renders, 1);
  assert.equal(c.state.view, "reports");
  assert.equal(c.karnamehFilter.classId, classroom.id);
  assert.equal(c.karnamehFilter.studentId, "archived");
  c.assertWorkspaceReadable = () => {
    throw Error("authentication required");
  };
  assert.throws(() => c.showArchivedKarnameh("archived"), /authentication/);
  assert.equal(renders, 1);
});
