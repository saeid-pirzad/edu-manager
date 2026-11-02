"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const read = (file) =>
  fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
function fixture() {
  const calls = [],
    selections = [],
    context = vm.createContext({
      workspace: { id: "first", year: "1405-1406", term: "اول", revision: 1 },
      state: {
        view: "lesson",
        schoolId: "school",
        classId: "class",
        lessonId: "lesson",
        tab: "grades",
      },
      assertWorkspaceReadable() {},
      academicTermKind: (term) =>
        ({ اول: "first", دوم: "second" })[term] || null,
      flushDrafts: async ({ strict }) => {
        assert.equal(strict, true);
        calls.push("flush");
      },
      render: () => calls.push("render"),
      switchPeriod() {
        throw Error("stage selection must never switch the global workspace");
      },
      assessmentContext: {
        async select(kind, stage, identity) {
          calls.push("select:" + kind + ":" + stage);
          selections.push(
            JSON.parse(JSON.stringify({ kind, stage, identity })),
          );
          if (context.selectionFailure) throw context.selectionFailure;
          return { period: { id: kind }, stage };
        },
        resolve: () => null,
      },
    });
  vm.runInContext(read("workspace/core/async-target.js"), context);
  vm.runInContext(read("workspace/grading/editors.js"), context);
  return { context, calls, selections };
}

test("assessment navigation flushes first, selects the requested stage and preserves the active year workspace", async () => {
  const { context, calls, selections } = fixture(),
    workspace = context.workspace;
  await context.openAssessmentStage({
    dataset: { term: "دوم", stage: "final" },
  });
  assert.deepEqual(calls, ["flush", "select:second:final", "render"]);
  assert.equal(context.workspace, workspace);
  assert.deepEqual(selections[0], {
    kind: "second",
    stage: "final",
    identity: { schoolId: "school", classId: "class", lessonId: "lesson" },
  });
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

test("a protected target-stage authorization failure cannot expose its modal or replace the active authentication", async () => {
  const { context, calls } = fixture(),
    workspace = context.workspace;
  context.isAuthenticated = true;
  context.db = { settings: { password: "source-hash" } };
  context.selectionFailure = Error("login required");
  context.showModal = () => calls.push("must not expose grades");
  await assert.rejects(
    context.openAssessmentStage({
      dataset: { term: "دوم", stage: "final" },
      closest: (selector) => (selector === "#modalBody" ? {} : { dataset: {} }),
    }),
    /login required/,
  );
  assert.deepEqual(calls, ["flush", "select:second:final"]);
  assert.equal(context.workspace, workspace);
  assert.equal(context.isAuthenticated, true);
  assert.equal(context.db.settings.password, "source-hash");
  assert.equal(context.state.lessonId, "lesson");
  assert.equal(context.state.tab, "grades");
  assert.equal(vm.runInContext("assessmentSelectedStage", context), "midterm");
});

test("assessment modal keeps its own lesson identity when opened outside the lesson page", async () => {
  const { context, selections } = fixture();
  context.state.lessonId = null;
  await context.openAssessmentStage({
    dataset: { term: "دوم", stage: "final" },
    closest: (selector) =>
      selector === ".assessment-editor"
        ? { dataset: { assessmentLesson: "lesson" } }
        : null,
  });
  assert.equal(context.state.lessonId, "lesson");
  assert.equal(context.workspace.id, "first");
  assert.equal(selections[0].identity.lessonId, "lesson");
});

test("assessment navigation preserves the source when the target context rejects a missing lesson", async () => {
  const { context, calls } = fixture();
  context.selectionFailure = Error("target lesson missing");
  await assert.rejects(
    context.openAssessmentStage({ dataset: { term: "دوم", stage: "midterm" } }),
    /target lesson missing/,
  );
  assert.deepEqual(calls, ["flush", "select:second:midterm"]);
  assert.equal(context.workspace.id, "first");
});

test("an unstarted second assessment is delegated to the annual context without opening a separate term workflow", async () => {
  const { context, calls, selections } = fixture();
  context.openNewPeriod = context.openPeriods = () => {
    throw Error("must not navigate to a term hub from grade entry");
  };
  await context.openAssessmentStage({
    dataset: { term: "دوم", stage: "final" },
  });
  assert.deepEqual(calls, ["flush", "select:second:final", "render"]);
  assert.equal(selections[0].kind, "second");
  assert.equal(context.workspace.id, "first");
  assert.equal(context.workspace.year, "1405-1406");
});

test("ambiguous legacy destination errors are preserved without guessing a stage or switching the active workspace", async () => {
  const { context, calls } = fixture();
  context.selectionFailure = Error(
    "چند نسخه از نوبت مقصد وجود دارد؛ مدیریت نوبت‌ها را بررسی کنید.",
  );
  await assert.rejects(
    context.openAssessmentStage({ dataset: { term: "دوم", stage: "final" } }),
    /چند نسخه.*مدیریت نوبت/,
  );
  assert.deepEqual(calls, ["flush", "select:second:final"]);
  assert.equal(context.workspace.id, "first");
});

test("assessment routing follows fixed term roles even after a visible legacy title was renamed", async () => {
  const { context, calls, selections } = fixture();
  context.workspace.term = "نیمسال پاییز";
  context.workspace.termKind = "first";
  await context.openAssessmentStage({
    dataset: { term: "اول", stage: "final" },
  });
  await context.openAssessmentStage({
    dataset: { term: "دوم", stage: "midterm" },
  });
  assert.deepEqual(calls, [
    "flush",
    "select:first:final",
    "render",
    "flush",
    "select:second:midterm",
    "render",
  ]);
  assert.deepEqual(
    selections.map((selection) => selection.kind),
    ["first", "second"],
  );
  assert.equal(context.workspace.id, "first");
});

test("gradebook offers exactly four fixed stage labels for a renamed legacy term", () => {
  const { context } = fixture();
  context.workspace.term = "عنوان قدیمی مستقل";
  context.workspace.termKind = "second";
  context.getSortedStudents = () => [];
  context.assessmentWeights = () => ({ practical: 70, theory: 30 });
  context.esc = String;
  const html = context.buildAssessmentEditor({}, { id: "lesson", name: "درس" }),
    navigation = html.match(
      /<nav[^>]*assessment-term-navigation[^>]*>(.*?)<\/nav>/s,
    )[1];
  assert.equal((navigation.match(/<button/g) || []).length, 4);
  assert.equal((html.match(/data-term="اول"/g) || []).length, 2);
  assert.equal((html.match(/data-term="دوم"/g) || []).length, 2);
  assert.match(html, /aria-label="میان‌ترم نوبت دوم"/);
  assert.doesNotMatch(html, /عنوان قدیمی مستقل|periodYear|new-period|دوره/);
});

test("configured practical and theory weights are shared by both grade stages", () => {
  const context = vm.createContext({
    structuredClone,
    ownScoreRecord: (records, id) => records?.[id] || {},
  });
  vm.runInContext(read("domain/grade-math.js"), context);
  vm.runInContext(read("domain/grade-policy.js"), context);
  vm.runInContext(read("domain/reporting/academic-results.js"), context);
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
  });
  vm.runInContext(read("domain/data-boundary.js"), context);
  vm.runInContext(read("domain/grade-math.js"), context);
  vm.runInContext(read("domain/grade-policy.js"), context);
  vm.runInContext(read("domain/reporting/academic-results.js"), context);
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
