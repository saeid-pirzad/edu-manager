"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  const writes = [];
  const c = vm.createContext({
    structuredClone,
    clone: structuredClone,
    resetBusy: false,
    connectionRetired: false,
    assessmentContext: { flush: async () => {} },
    captureSaveFeedback: () => ({}),
    clearTimeout() {},
    setTimeout: () => 0,
    draftTimer: 0,
    flushing: null,
    drafts: new Map(),
    db: { settings: {} },
    storeDrafts: async () => {},
    setStatus() {},
    refreshGradeResults() {},
    render() {},
    document: { activeElement: null },
  });
  for (const file of [
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/grade-drafts.js",
    "domain/academic-year-courses.js",
    "workspace/courses/rules.js",
    "workspace/drafts/flush.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  const lesson = {
    id: "lesson",
    name: "واحدهای کار",
    gradeMode: "standard",
    gradingPolicy: {
      ...c.EduPolicy.defaults("modular", "1405-1406"),
      version: 2,
      modularScope: "unit",
      unitCount: 2,
    },
    poudmans: [
      {
        id: "pod",
        name: "پودمان اول",
        podScores: {},
        units: ["one", "two"].map((id) => ({
          id,
          name: id,
          unitScores: {},
          competencyScores: {},
        })),
      },
    ],
  };
  const classroom = {
    id: "class",
    students: [{ id: "student", name: "هنرجو" }],
    lessons: [lesson],
  };
  c.findClass = (id) => (id === classroom.id ? classroom : null);
  c.getLessonObj = (value, id) => value?.lessons.find((item) => item.id === id);
  c.saveDBV24 = async () => {
    c.validateCourse(lesson, new Set(["student"]), "1405-1406");
    writes.push(structuredClone(lesson));
  };
  const entry = (uid, field, value, extra) => ({
    kind: "unit",
    classId: "class",
    lid: "lesson",
    pid: "pod",
    uid,
    sid: "student",
    field,
    value,
    ...extra,
  });
  return { c, lesson, classroom, entry, writes };
}

test("formal work-unit drafts save independent components and preserve zero", async () => {
  const { c, lesson, entry, writes } = fixture();
  c.drafts.set("one-m", entry("one", "m", "۰"));
  c.drafts.set("one-c", entry("one", "c", "۳"));
  c.drafts.set("two-m", entry("two", "m", "۴٫۵"));
  c.drafts.set("two-c", entry("two", "c", "۲"));
  await c.flushDrafts({ strict: true });
  assert.equal(writes.length, 1);
  assert.equal(c.drafts.size, 0);
  const [one, two] = lesson.poudmans[0].units;
  assert.equal(one.competencyScores.student.m, 0);
  assert.equal(one.competencyScores.student.c, 3);
  assert.equal(two.competencyScores.student.m, 4.5);
  assert.equal(two.competencyScores.student.c, 2);
  assert.equal(Object.keys(one.unitScores).length, 0);
  assert.equal(Object.keys(lesson.poudmans[0].podScores).length, 0);
  const result = c.EduPolicy.lesson(
    lesson.gradingPolicy,
    lesson.poudmans,
    "student",
  );
  assert.equal(result.complete, true);
  assert.equal(result.final, null);
  assert.equal(result.provisionalAverage, null);
  assert.equal(result.modules[0].final, null);
});

test("clearing one work-unit component preserves its sibling and other unit", async () => {
  const { c, lesson, entry } = fixture();
  const [one, two] = lesson.poudmans[0].units;
  one.competencyScores.student = { m: 0, c: 3 };
  two.competencyScores.student = { m: 4.5, c: 2 };
  c.drafts.set("clear", entry("one", "m", "", { remove: true }));
  await c.flushDrafts({ strict: true });
  assert.equal(Object.hasOwn(one.competencyScores.student, "m"), false);
  assert.equal(one.competencyScores.student.c, 3);
  assert.equal(two.competencyScores.student.m, 4.5);
  assert.equal(two.competencyScores.student.c, 2);
  assert.equal(
    c.EduPolicy.lesson(lesson.gradingPolicy, lesson.poudmans, "student")
      .complete,
    false,
  );
});

test("formal work-unit input rejects wrong scope, cross-module unit, wrong field and invalid steps", () => {
  const { c, lesson, entry } = fixture();
  for (const draft of [
    entry("one", "c", "0"),
    entry("one", "c", "2.5"),
    entry("one", "m", "4.75"),
    entry("one", "m", "5.5"),
    entry("one", "p", "20"),
    entry("missing", "m", "5"),
    entry("one", "m", "5", { pid: "other" }),
    entry("one", "m", "5", { kind: "pod" }),
  ])
    assert.equal(c.parseDraft(draft).ok, false, JSON.stringify(draft));
  lesson.gradingPolicy = c.EduPolicy.defaults("modular", "1405-1406");
  assert.equal(c.parseDraft(entry("one", "m", "5")).ok, false);
  assert.equal(c.parseDraft(entry("one", "m", "5", { kind: "pod" })).ok, true);
});

test("invalid work-unit drafts remain recoverable without committing partial marks", async () => {
  const { c, lesson, entry, writes } = fixture();
  c.drafts.set("valid", entry("one", "m", "5"));
  c.drafts.set("invalid", entry("one", "c", "4"));
  await assert.rejects(c.flushDrafts({ strict: true }), /ورودی نامعتبر/);
  assert.equal(c.drafts.size, 2);
  assert.equal(writes.length, 0);
  assert.equal(
    Object.keys(lesson.poudmans[0].units[0].competencyScores).length,
    0,
  );
});

test("course validation rejects mixed grading levels, unknown students and forged unit totals", () => {
  const { c, lesson } = fixture();
  const validate = (value) =>
    c.validateCourse(value, new Set(["student"]), "1405-1406");
  assert.equal(validate(lesson), undefined);
  for (const mutate of [
    (value) => {
      value.poudmans[0].podScores.student = { m: 5, c: 3 };
    },
    (value) => {
      value.poudmans[0].units[0].competencyScores.other = { m: 5 };
    },
    (value) => {
      value.poudmans[0].units[0].competencyScores.student = {
        m: 5,
        c: 3,
        final: 20,
      };
    },
    (value) => {
      value.poudmans[0].units[0].competencyScores.student = { m: 4.75, c: 3 };
    },
    (value) => {
      value.gradingPolicy = c.EduPolicy.defaults("modular", "1405-1406");
      value.poudmans[0].units[0].competencyScores.student = { m: 5, c: 3 };
    },
  ]) {
    const candidate = structuredClone(lesson);
    mutate(candidate);
    assert.throws(() => validate(candidate));
  }
});

test("work-unit scores do not alter course definitions but prevent destructive scope changes", () => {
  const { c, classroom } = fixture();
  const model = c.EduAcademicYearCourses;
  const graded = structuredClone(classroom);
  graded.lessons[0].poudmans[0].units[0].competencyScores.student = {
    m: 5,
    c: 3,
  };
  assert.equal(model.hasChanges(classroom, graded), false);
  const candidate = structuredClone(graded);
  candidate.lessons[0].gradingPolicy = c.EduPolicy.defaults(
    "modular",
    "1405-1406",
  );
  assert.throws(
    () => model.mirrorClass(graded, candidate, graded),
    /تغییر قواعد یا ساختار/,
  );
});

test("portable backup retains formal unit drafts separately from legacy unit drafts", () => {
  const { c, entry } = fixture();
  const result = c.EduGradeDrafts.portableGradeDrafts(
    [
      {
        key: "Edu24.drafts.year.tab",
        generation: 1,
        updatedAt: "2026-11-17T10:00:00Z",
        entries: [entry("one", "c", "۳")],
      },
    ],
    [{ id: "year" }],
  );
  assert.equal(result[0].entries[0].kind, "unit");
  assert.equal(result[0].entries[0].value, "۳");
});
