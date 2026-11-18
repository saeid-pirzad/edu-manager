"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const context = vm.createContext({
  TextEncoder,
  structuredClone,
  crypto: require("node:crypto").webcrypto,
});
for (const file of ["domain", "question-import"])
  vm.runInContext(
    fs.readFileSync(`src/features/question-bank/${file}.js`, "utf8"),
    context,
  );
const D = context.EduQuestionBank,
  I = context.EduQuestionBankImport;
function bank() {
  const value = D.empty();
  value.courses = [{ id: "c", title: "درس", structure: "module" }];
  value.units = [
    { id: "u", courseId: "c", title: "پودمان اول" },
    { id: "v", courseId: "c", title: "پودمان دوم" },
  ];
  return value;
}
function rows(values = I.examples) {
  return [
    { number: 1, cells: I.headers },
    ...values.map((cells, i) => ({ number: i + 2, cells: [...cells] })),
  ];
}
test("all four template samples map to official question types, scores and answers", () => {
  const source = bank(),
    report = I.preview(rows(), source, "u"),
    next = I.prepare(report, source);
  assert.equal(report.ready, 4);
  assert.equal(report.errors, 0);
  assert.equal(next.questions[0].answer, 3);
  assert.equal(next.questions[1].answer, true);
  assert.equal(next.questions[1].score, 50);
  assert.equal(next.questions[2].type, "blank");
  assert.equal(next.questions[3].type, "essay");
  assert.equal(source.questions.length, 0);
  assert.equal(new Set(next.questions.map((q) => q.id)).size, 4);
  D.validate(next);
});
test("blank template has no automatically imported sample rows", () => {
  assert.equal(I.templateSheets()[0].rows.length, 2);
  assert.throws(
    () => I.preview(rows([Array(9).fill("")]), bank(), "u"),
    /خالی/,
  );
});
test("template columns, version shape and destination must be valid", () => {
  const invalid = rows();
  invalid[0].cells = [...I.headers].reverse();
  assert.throws(() => I.preview(invalid, bank(), "u"), /ستون/);
  assert.throws(() => I.preview(rows(), bank(), "missing"), /مقصد/);
});
for (const [name, change] of [
  ["missing score", (c) => (c[7] = "")],
  ["zero score", (c) => (c[7] = "0")],
  ["excess score", (c) => (c[7] = "100.01")],
  ["precision", (c) => (c[7] = "1.001")],
  ["invalid type", (c) => (c[0] = "other")],
  ["missing text", (c) => (c[1] = "")],
  ["missing option", (c) => (c[2] = "")],
  [
    "duplicate option",
    (c) => {
      c[2] = "كتاب";
      c[3] = "کتاب";
    },
  ],
  ["wrong answer index", (c) => (c[6] = "0")],
  ["missing answer index", (c) => (c[6] = "")],
  ["long text", (c) => (c[1] = "a".repeat(10001))],
  ["long option", (c) => (c[2] = "a".repeat(2001))],
  ["extra column", (c) => c.push("extra")],
])
  test(`invalid ${name} blocks the entire import`, () => {
    const source = bank(),
      values = [...I.examples[0]];
    change(values);
    const report = I.preview(rows([values, I.examples[3]]), source, "u");
    assert.equal(report.errors, 1);
    assert.equal(report.ready, 1);
    assert.throws(() => I.prepare(report, source));
    assert.equal(source.questions.length, 0);
  });
test("boolean false and Persian or Arabic digits preserve their intended meaning", () => {
  const values = [...I.examples[1]];
  values[6] = "غلط";
  values[7] = "١٫٢٥";
  const report = I.preview(rows([values]), bank(), "u");
  assert.equal(report.results[0].question.answer, false);
  assert.equal(report.results[0].question.score, 125);
});
test("text types need an answer and reject stray MCQ options", () => {
  for (const index of [2, 3])
    for (const change of [(c) => (c[6] = ""), (c) => (c[2] = "extra")]) {
      const values = [...I.examples[index]];
      change(values);
      assert.equal(I.preview(rows([values]), bank(), "u").errors, 1);
    }
});
test("existing and file-local duplicates are skipped only inside the selected unit", () => {
  const source = bank(),
    first = I.prepare(I.preview(rows([I.examples[0]]), source, "u"), source);
  const repeated = I.preview(
    rows([I.examples[0], I.examples[0], I.examples[1]]),
    first,
    "u",
  );
  assert.equal(repeated.duplicates, 2);
  assert.equal(repeated.ready, 1);
  assert.equal(I.preview(rows([I.examples[0]]), first, "v").ready, 1);
});
test("row numbers and formula errors survive blank-row filtering", () => {
  const input = rows([I.examples[0]]);
  input[1] = { number: 40, cells: [], error: "فرمول مجاز نیست" };
  const report = I.preview(input, bank(), "u");
  assert.equal(report.errors, 1);
  assert.equal(report.results[0].number, 40);
});
test("stale revisions and deleted destinations cannot be committed", () => {
  const source = bank(),
    report = I.preview(rows(), source, "u");
  source.revision++;
  assert.throws(() => I.prepare(report, source), /تغییر/);
  source.revision--;
  source.units = [];
  assert.throws(() => I.prepare(report, source), /مقصد/);
});
test("row limits reject oversized imports before creating questions", () => {
  assert.throws(
    () => I.preview(rows(Array(1001).fill(I.examples[0])), bank(), "u"),
    /۱۰۰۰/,
  );
});
