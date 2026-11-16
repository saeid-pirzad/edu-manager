"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
require("node:vm").runInThisContext(
  fs.readFileSync("src/features/question-bank/domain.js", "utf8"),
);
const D = globalThis.EduQuestionBank;
test("Persian search normalizes Arabic letters, digits, marks and spacing without changing data", () => {
  assert.equal(D.searchText(" كِتاب يكم ١۲ "), D.searchText("کتاب یکم 12"));
  assert.equal(D.searchText("جای‌خالی"), D.searchText("جای خالی"));
  assert.equal(D.searchText("Exam ۳"), "exam 3");
});
function fixture() {
  const b = D.empty();
  b.courses = [
    { id: "c", title: "آزمایشی", structure: "chapter" },
    { id: "c2", title: "دوم", structure: "module" },
  ];
  b.units = [
    { id: "u", title: "اول", courseId: "c" },
    { id: "u2", title: "دوم", courseId: "c2" },
  ];
  b.questions = Object.keys(D.types).map((type, i) => ({
    id: "q" + i,
    unitId: "u",
    type,
    text: "متن " + i,
    explanation: "توضیح",
    score: 125,
    answer: type === "mcq" ? 2 : type === "boolean" ? false : "پاسخ",
    ...(type === "mcq" ? { options: ["الف", "ب", "ج", "د"] } : {}),
  }));
  return b;
}
function spec() {
  return {
    courseId: "c",
    unitIds: ["u"],
    counts: { mcq: 1, blank: 1, essay: 1, boolean: 1 },
    title: "آزمون",
    school: "",
    teacher: "",
    date: "2026-11-16",
    duration: "۶۰",
  };
}
test("localized score is exact and rejects invalid precision/ranges", () => {
  for (const s of ["۱٫۲۵", "١٫٢٥", "1.25"]) assert.equal(D.score(s), 125);
  for (const s of ["0", "100.01", "1.001", "-1", "NaN", "1e1"])
    assert.throws(() => D.score(s));
  assert.equal(D.score("۰٫۰۱"), 1);
  assert.equal(D.score("100"), 10000);
});
test("all four question types and JSON/BOM round trip", () => {
  const b = fixture();
  assert.deepEqual(D.parse("\uFEFF" + D.size(b)), b);
});
test("rejects invalid options, answer, references, ids, versions and school files", () => {
  for (const change of [
    (b) => b.questions[0].options.pop(),
    (b) => (b.questions[0].options[1] = "الف"),
    (b) => (b.questions[0].answer = null),
    (b) => (b.questions[3].answer = "false"),
    (b) => (b.questions[1].options = []),
    (b) => (b.questions[1].answer = ""),
    (b) => (b.questions[1].unitId = "no"),
    (b) => (b.questions[1].id = "q0"),
    (b) => (b.units[0].courseId = "bad"),
    (b) => (b.version = 2),
    (b) => (b.courses[1].title = "آزمایشی"),
  ]) {
    const b = fixture();
    change(b);
    assert.throws(() => D.validate(b));
  }
  assert.throws(() => D.parse('{"schools":[]}'));
  assert.throws(() => D.parse("{"));
});
test("random selection uses scoped types without replacement and immutable snapshots", () => {
  const b = fixture(),
    e = D.generate(b, spec(), () => 0.4);
  assert.equal(e.questions.length, 4);
  assert.equal(new Set(e.questions.map((q) => q.id)).size, 4);
  assert.equal(
    e.questions.reduce((s, q) => s + q.score, 0),
    500,
  );
  assert.deepEqual(
    e.questions.find((q) => q.type === "mcq").options,
    b.questions[0].options,
  );
  const frozen = JSON.stringify(e);
  b.questions[0].text = "changed";
  b.questions = [];
  b.units[0].title = "renamed";
  b.courses[0].title = "new";
  assert.equal(JSON.stringify(e), frozen);
  b.exams = [e];
  D.validate(b);
});
test("insufficient pool and invalid counts cannot generate partial exams", () => {
  const b = fixture();
  for (const change of [
    (s) => (s.counts.mcq = 2),
    (s) => (s.counts.mcq = -1),
    (s) => (s.counts.mcq = "1.1"),
    (s) => (s.counts.mcq = 501),
    (s) => (s.counts = { mcq: 0, blank: 0, essay: 0, boolean: 0 }),
    (s) => (s.unitIds = ["u2"]),
    (s) => (s.duration = 601),
    (s) => (s.title = ""),
    (s) => (s.date = "2026-02-31"),
  ]) {
    const s = spec();
    change(s);
    assert.throws(() => D.generate(b, s));
    assert.equal(b.exams.length, 0);
  }
});
test("empty or duplicate exam snapshots rejected", () => {
  const b = fixture(),
    e = D.generate(b, spec());
  b.exams = [e];
  e.questions = [];
  assert.throws(() => D.validate(b));
  e.questions = [b.questions[0], b.questions[0]];
  assert.throws(() => D.validate(b));
});
test("same 20 MiB limit for save export and restore", () => {
  const b = fixture();
  b.questions[0].text = "a".repeat(D.LIMIT);
  assert.throws(() => D.size(b));
  assert.throws(() => D.validate(b));
  assert.throws(() => D.parse(JSON.stringify(b)));
});
test("generation rejects malformed or incomplete specifications with domain errors and no mutations", () => {
  const b = fixture(),
    original = JSON.stringify(b);
  for (const malformed of [undefined, null, "", [], 1, true])
    assert.throws(
      () => D.generate(b, malformed),
      (error) =>
        error instanceof Error &&
        !(error instanceof TypeError) &&
        error.message.includes("مشخصات طرح آزمون"),
    );
  for (const change of [
    (s) => delete s.courseId,
    (s) => (s.courseId = 1),
    (s) => delete s.unitIds,
    (s) => (s.unitIds = "u"),
    (s) => (s.unitIds = {}),
    (s) => (s.unitIds = []),
    (s) => (s.unitIds = ["u", "u"]),
    (s) => (s.unitIds = ["u", null]),
    (s) => delete s.counts,
    (s) => (s.counts = null),
    (s) => (s.counts = []),
    (s) => delete s.counts.mcq,
    (s) => (s.counts.essay = ""),
    (s) => delete s.title,
    (s) => (s.title = 1),
    (s) => delete s.school,
    (s) => (s.school = null),
    (s) => delete s.teacher,
    (s) => (s.teacher = []),
    (s) => delete s.date,
    (s) => (s.date = "2026-02-29"),
    (s) => (s.date = "2026-11-16T00:00:00Z"),
    (s) => delete s.duration,
  ]) {
    const s = spec();
    change(s);
    const before = JSON.stringify(s);
    let randomCalls = 0;
    assert.throws(
      () =>
        D.generate(b, s, () => {
          randomCalls++;
          return 0.5;
        }),
      (error) => error instanceof Error && !(error instanceof TypeError),
    );
    assert.equal(randomCalls, 0);
    assert.equal(JSON.stringify(s), before);
    assert.equal(JSON.stringify(b), original);
  }
});
test("generation enforces the total 500-question limit across otherwise valid type counts", () => {
  const b = fixture();
  b.questions = ["mcq", "blank"].flatMap((type) => {
    const seed = b.questions.find((q) => q.type === type);
    return Array.from({ length: 300 }, (_, i) => ({
      ...structuredClone(seed),
      id: `${type}-${i}`,
    }));
  });
  const s = spec();
  s.counts = { mcq: "۲۵۰", blank: 250, essay: 0, boolean: 0 };
  const before = JSON.stringify(b),
    e = D.generate(b, s, () => 0.5);
  assert.equal(e.questions.length, 500);
  assert.equal(new Set(e.questions.map((q) => q.id)).size, 500);
  assert.equal(e.questions.filter((q) => q.type === "mcq").length, 250);
  assert.equal(
    e.questions.reduce((sum, q) => sum + q.score, 0),
    62500,
  );
  s.counts.mcq = 251;
  let randomCalls = 0;
  assert.throws(
    () =>
      D.generate(b, s, () => {
        randomCalls++;
        return 0.5;
      }),
    /آزمون باید بین ۱ و ۵۰۰ سؤال داشته باشد/,
  );
  assert.equal(randomCalls, 0);
  assert.equal(JSON.stringify(b), before);
});
test("indexed references preserve orphan rejection and exclude questions from another course", () => {
  const b = fixture(),
    foreign = {
      ...structuredClone(b.questions[0]),
      id: "foreign",
      unitId: "u2",
    };
  b.questions.push(foreign);
  const e = D.generate(b, spec(), () => 0.5);
  assert.equal(e.questions.length, 4);
  assert.ok(e.questions.every((q) => q.unitId === "u"));
  const s = spec();
  s.unitIds.push("u2");
  assert.throws(() => D.generate(b, s), /درس و بخش‌های معتبر انتخاب کنید/);
  s.unitIds = ["missing"];
  assert.throws(() => D.generate(b, s), /درس و بخش‌های معتبر انتخاب کنید/);
  const orphanCourse = structuredClone(b);
  orphanCourse.units[0].courseId = "missing";
  assert.throws(() => D.validate(orphanCourse), /ارتباط بخش با درس نامعتبر/);
  const orphanUnit = structuredClone(b);
  orphanUnit.questions[0].unitId = "missing";
  assert.throws(() => D.validate(orphanUnit), /بخش سؤال معتبر نیست/);
});
test("archived questions remain detached after source course and section removal", () => {
  const b = fixture(),
    e = D.generate(b, spec(), () => 0.5),
    frozen = JSON.stringify(e);
  b.exams.push(e);
  b.courses = [];
  b.units = [];
  b.questions = [];
  assert.equal(D.validate(b), b);
  assert.equal(JSON.stringify(e), frozen);
  assert.deepEqual(D.parse(D.size(b)), b);
  const source = fixture(),
    snapshot = D.generate(source, spec(), () => 0.5),
    original = JSON.stringify(source);
  snapshot.questions.find((q) => q.type === "mcq").options[0] = "changed";
  snapshot.questions[0].text = "changed";
  assert.equal(JSON.stringify(source), original);
});
test("validation indexes relationships rather than rescanning course and section identifiers", () => {
  const b = D.empty(),
    reads = { course: 0, unit: 0 };
  const watched = (item, kind) => {
    const id = item.id;
    Object.defineProperty(item, "id", {
      enumerable: true,
      get() {
        reads[kind]++;
        return id;
      },
    });
    return item;
  };
  b.courses = Array.from({ length: 100 }, (_, i) =>
    watched(
      { id: `c-${i}`, title: `Course ${i}`, structure: "chapter" },
      "course",
    ),
  );
  b.units = Array.from({ length: 1000 }, (_, i) =>
    watched({ id: `u-${i}`, courseId: "c-99", title: `Unit ${i}` }, "unit"),
  );
  b.questions = Array.from({ length: 2000 }, (_, i) => ({
    id: `q-${i}`,
    unitId: "u-999",
    type: "blank",
    text: `Question ${i}`,
    answer: "Answer",
    explanation: "",
    score: 100,
  }));
  D.validate(b);
  assert.ok(reads.course <= b.courses.length * 8, JSON.stringify(reads));
  assert.ok(reads.unit <= b.units.length * 8, JSON.stringify(reads));
  reads.course = 0;
  reads.unit = 0;
  const s = spec();
  s.courseId = "c-99";
  s.unitIds = b.units.map((u) => u.id);
  reads.unit = 0;
  s.counts = { mcq: 0, blank: 500, essay: 0, boolean: 0 };
  assert.equal(D.generate(b, s, () => 0.5).questions.length, 500);
  assert.ok(reads.course <= b.courses.length * 10, JSON.stringify(reads));
  assert.ok(reads.unit <= b.units.length * 10, JSON.stringify(reads));
});
test("legacy exact title and option distinctions remain accepted without canonicalization", () => {
  const b = fixture();
  b.courses[0].title = "ریاضی";
  b.courses[1].title = "رياضي";
  b.questions[0].options = ["A", "a", "ی", "ي"];
  assert.equal(D.validate(b), b);
  assert.deepEqual(D.parse(D.size(b)), b);
});
test("new-option comparison normalizes Persian presentation without folding deliberate distinctions", () => {
  assert.equal(D.optionKey(" كِتاب يكم "), D.optionKey("کِتاب یکم"));
  assert.equal(D.optionKey("على"), D.optionKey("علی"));
  assert.equal(D.optionKey("جای‌خالی"), D.optionKey("جای خالی"));
  assert.equal(D.optionKey(" دو\u200d  واژه\t"), D.optionKey("دو واژه"));
  assert.equal(D.optionKey("Ａ"), D.optionKey("A"));
  assert.notEqual(D.optionKey("A"), D.optionKey("a"));
  assert.notEqual(D.optionKey("عَلَم"), D.optionKey("عِلْم"));
  assert.notEqual(D.optionKey("کتاب"), D.optionKey("کِتاب"));
  assert.notEqual(D.optionKey("+"), D.optionKey("−"));
});
