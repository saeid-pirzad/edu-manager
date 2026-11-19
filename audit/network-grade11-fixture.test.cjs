"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../src/features/question-bank/domain.js");
require("../src/features/question-bank/school-word.js");
const {
  createNetworkGrade11Bank,
} = require("../scripts/fixtures/network-grade11.cjs");
const D = globalThis.EduQuestionBank;

test("adding samples preserves existing records and rejects duplicate or partial reimport atomically", () => {
  const original = D.empty();
  original.courses.push({
    id: "existing",
    title: "درس واقعی",
    structure: "chapter",
  });
  const before = JSON.stringify(original);
  const next = globalThis.EduQuestionBankSample.addTo(original);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(next.courses[0], original.courses[0]);
  assert.equal(next.questions.length, 24);
  assert.equal(next.exams.length, 4);
  const saved = JSON.stringify(next);
  assert.throws(() => globalThis.EduQuestionBankSample.addTo(next));
  assert.equal(JSON.stringify(next), saved);
  const partial = D.empty();
  partial.exams.push(next.exams[0]);
  assert.throws(() => globalThis.EduQuestionBankSample.addTo(partial));
  assert.equal(partial.courses.length, 0);
});

test("grade11 sample round-trips with four question types, both course structures and all MCQ answer positions", () => {
  const bank = createNetworkGrade11Bank(D);
  assert.deepEqual(D.parse(JSON.stringify(bank)), bank);
  assert.equal(bank.questions.length, 24);
  assert.equal(bank.exams.length, 4);
  assert.deepEqual(
    new Set(bank.courses.map((c) => c.structure)),
    new Set(["module", "chapter"]),
  );
  assert.deepEqual(
    new Set(
      bank.questions.filter((q) => q.type === "mcq").map((q) => q.answer),
    ),
    new Set([0, 1, 2, 3]),
  );
  assert.deepEqual(
    new Set(
      bank.questions.filter((q) => q.type === "boolean").map((q) => q.answer),
    ),
    new Set([true, false]),
  );
  for (const course of bank.courses) {
    const units = bank.units
      .filter((u) => u.courseId === course.id)
      .map((u) => u.id);
    for (const type of Object.keys(D.types))
      assert.equal(
        bank.questions.filter(
          (q) => units.includes(q.unitId) && q.type === type,
        ).length,
        3,
      );
  }
});

test("grade11 exams preserve scores, unique selections, snapshot isolation and export every question", () => {
  const bank = createNetworkGrade11Bank(D);
  for (const [index, exam] of bank.exams.entries()) {
    assert.equal(
      new Set(exam.questions.map((q) => q.id)).size,
      exam.questions.length,
    );
    assert.equal(new Set(exam.questions.map((q) => q.type)).size, 4);
    if (index % 2 === 0)
      assert.equal(
        exam.questions.reduce((s, q) => s + q.score, 0),
        2000,
      );
    const before = JSON.stringify(bank);
    const xml = globalThis.EduQuestionBankSchoolWord.documentXml(exam);
    assert.equal(
      (xml.match(/<w:tr>/g) || []).length >= exam.questions.length + 2,
      true,
    );
    for (const q of exam.questions) {
      assert.notEqual(
        q,
        bank.questions.find((source) => source.id === q.id),
      );
      assert.ok(!xml.includes(q.explanation));
    }
    assert.equal(JSON.stringify(bank), before);
  }
});
