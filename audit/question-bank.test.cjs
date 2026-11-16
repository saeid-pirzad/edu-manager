"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
require("node:vm").runInThisContext(
  fs.readFileSync("src/features/question-bank/domain.js", "utf8"),
);
const D = globalThis.EduQuestionBank;
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
