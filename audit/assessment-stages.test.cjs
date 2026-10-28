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

test("assessment navigation refuses a target term without the same lesson", async () => {
  const { context, calls } = fixture();
  context.readWorkspace = async () => ({ data: { schools: [] } });
  await assert.rejects(
    context.openAssessmentStage({ dataset: { term: "دوم", stage: "midterm" } }),
  );
  assert.deepEqual(calls, ["flush"]);
  assert.equal(context.workspace.id, "first");
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
