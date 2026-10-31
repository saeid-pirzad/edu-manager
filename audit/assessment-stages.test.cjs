"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (file) =>
  fs.readFileSync(path.join(__dirname, "../src", file), "utf8");

function fixture() {
  const calls = [];
  const context = vm.createContext({
    workspace: { id: "first", year: "1405-1406", term: "اول" },
    state: {
      view: "lesson",
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
      tab: "grades",
    },
    assertWorkspaceReadable() {},
    academicTermKind: (term) => ({ اول: "first", دوم: "second" })[term] || null,
    flushDrafts: async () => calls.push("flush"),
    allFrom: async () => [{ id: "second", year: "1405-1406", term: "دوم" }],
    readWorkspace: async () => ({
      data: {
        schools: [
          {
            id: "school",
            classes: [{ id: "class", lessons: [{ id: "lesson" }] }],
          },
        ],
      },
    }),
    switchPeriod: async (id) => {
      calls.push(id);
      context.workspace = { id, year: "1405-1406", term: "دوم" };
      context.state = { view: "schools" };
    },
    render: () => calls.push("render"),
  });
  vm.runInContext(read("workspace/core/async-target.js"), context);
  vm.runInContext(read("workspace/grading/editors.js"), context);
  return { context, calls };
}

test("assessment navigation flushes first, switches the correct term and restores lesson selection", async () => {
  const { context, calls } = fixture();
  await context.openAssessmentStage({
    dataset: { term: "دوم", stage: "final" },
  });
  assert.deepEqual(calls, ["flush", "second", "render"]);
  assert.equal(context.state.lessonId, "lesson");
  assert.equal(context.state.classId, "class");
  assert.equal(context.state.tab, "grades");
  assert.equal(vm.runInContext("assessmentSelectedStage", context), "final");
});

test("assessment navigation cannot retarget another class while waiting for drafts", async () => {
  const { context, calls } = fixture();
  context.flushDrafts = async () => {
    context.state.classId = "other";
  };
  await assert.rejects(
    context.openAssessmentStage({ dataset: { term: "دوم", stage: "final" } }),
  );
  assert.deepEqual(calls, []);
  assert.equal(context.workspace.id, "first");
});

test("assessment modal keeps its own lesson identity when opened outside the lesson page", async () => {
  const { context } = fixture();
  context.state.lessonId = null;
  await context.openAssessmentStage({
    dataset: { term: "دوم", stage: "final" },
    closest: (selector) =>
      selector === ".assessment-editor"
        ? { dataset: { assessmentLesson: "lesson" } }
        : null,
  });
  assert.equal(context.state.lessonId, "lesson");
  assert.equal(context.workspace.id, "second");
});

test("assessment navigation refuses a target term without the same lesson", async () => {
  const { context, calls } = fixture();
  context.readWorkspace = async () => ({ data: { schools: [] } });
  await assert.rejects(
    context.openAssessmentStage({ dataset: { term: "دوم", stage: "midterm" } }),
  );
  assert.deepEqual(calls, ["flush"]);
  assert.equal(context.workspace.id, "first");
});

test("missing or ambiguous destination terms never open academic creation from grade entry", async () => {
  for (const rows of [
    [],
    [
      { id: "a", year: "1405-1406", termKind: "second" },
      { id: "b", year: "1405-1406", termKind: "second" },
    ],
  ]) {
    const { context, calls } = fixture();
    context.allFrom = async () => rows;
    context.openNewPeriod = () => {
      throw Error("must not create a period from grades");
    };
    await assert.rejects(
      context.openAssessmentStage({ dataset: { term: "دوم", stage: "final" } }),
      /مدیریت نوبت/,
    );
    assert.deepEqual(calls, ["flush"]);
  }
});

test("assessment routing follows term identity even after the visible title is renamed", async () => {
  const { context, calls } = fixture();
  context.workspace.term = "نیمسال پاییز";
  context.workspace.termKind = "first";
  context.allFrom = async () => [
    {
      id: "second",
      year: "1405-1406",
      term: "نیمسال بهار",
      termKind: "second",
    },
  ];
  await context.openAssessmentStage({
    dataset: { term: "اول", stage: "final" },
  });
  assert.deepEqual(calls, ["flush", "render"]);
  calls.length = 0;
  await context.openAssessmentStage({
    dataset: { term: "دوم", stage: "midterm" },
  });
  assert.deepEqual(calls, ["flush", "second", "render"]);
});

test("configured practical and theory weights are shared by both grade stages", () => {
  const context = vm.createContext({
    structuredClone,
    ownScoreRecord: (records, id) => records?.[id] || {},
  });
  vm.runInContext(read("domain/grade-math.js"), context);
  vm.runInContext(read("domain/grade-policy.js"), context);
  vm.runInContext(read("workspace/grading/results.js"), context);
  const lesson = {
    gradingPolicy: {
      ...context.EduPolicy.defaults("dual", "1405-1406"),
      dualConfigurable: true,
      practicalWeight: 60,
    },
    kardaneshScores: {
      student: {
        midtermPractical: 10,
        midtermTheory: 20,
        practical: 18,
        theory: 12,
      },
    },
  };
  assert.equal(context.assessmentWeights(lesson).practical, 60);
  assert.equal(context.assessmentWeights(lesson).theory, 40);
  assert.equal(
    context.assessmentResult(lesson, "student", "midterm").final,
    14,
  );
  assert.equal(
    context.assessmentResult(lesson, "student", "final").final,
    15.6,
  );
  lesson.kardaneshScores.student.practical = 0;
  assert.equal(context.assessmentResult(lesson, "student", "final").final, 4.8);
  delete lesson.kardaneshScores.student.theory;
  assert.equal(
    context.assessmentResult(lesson, "student", "final").final,
    null,
  );
});

test("general assessment keeps the two stages separate and missing grades distinct from zero", () => {
  const context = vm.createContext({
    ownScoreRecord: (records, id) => records?.[id] || {},
    EduPolicy: {
      dual: (p, practical, theory) => ({
        final: theory ?? null,
        complete: theory != null,
        passed: null,
      }),
    },
  });
  vm.runInContext(read("workspace/grading/results.js"), context);
  const lesson = {
    gradingPolicy: { subjectType: "general" },
    kardaneshScores: { student: { midtermTheory: 0, theory: 18 } },
  };
  assert.equal(context.assessmentResult(lesson, "student", "midterm").final, 0);
  assert.equal(context.assessmentResult(lesson, "student", "final").final, 18);
  assert.equal(
    context.assessmentResult(lesson, "missing", "final").complete,
    false,
  );
});
