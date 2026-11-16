"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../src/features/question-bank/domain.js");
const {
  createDemoBank,
} = require("../scripts/fixtures/question-bank-demo.cjs");
const { answerKey } = require("../scripts/question-bank-demo.cjs");
const D = globalThis.EduQuestionBank;

test("demo has two clearly illustrative courses, four units and all four question types in each unit", () => {
  const bank = createDemoBank(D);
  assert.equal(bank.courses.length, 2);
  assert.deepEqual(
    bank.courses.map((course) => course.structure),
    ["chapter", "module"],
  );
  assert.equal(bank.units.length, 4);
  assert.equal(bank.questions.length, 16);
  for (const course of bank.courses) assert.match(course.title, /نمونه آموزشی/);
  for (const unit of bank.units) {
    const questions = bank.questions.filter((q) => q.unitId === unit.id);
    assert.equal(questions.length, 4);
    assert.deepEqual(
      questions.map((q) => q.type).sort(),
      Object.keys(D.types).sort(),
    );
    assert.equal(
      questions.reduce((sum, q) => sum + q.score, 0),
      1000,
    );
  }
});

test("demo exams are reproducible, snapshotted, valid and exactly twenty points", () => {
  const bank = createDemoBank(D);
  assert.deepEqual(createDemoBank(D), bank);
  assert.deepEqual(D.parse(D.size(bank)), bank);
  assert.equal(bank.exams.length, 2);
  assert.deepEqual(
    bank.exams.map((exam) => exam.duration),
    [45, 50],
  );
  assert.equal(
    new Set(
      [...bank.courses, ...bank.units, ...bank.questions, ...bank.exams].map(
        (item) => item.id,
      ),
    ).size,
    24,
  );
  for (const exam of bank.exams) {
    assert.equal(exam.questions.length, 8);
    assert.equal(
      exam.questions.reduce((sum, q) => sum + q.score, 0),
      2000,
    );
    assert.equal(exam.date, "2026-11-16");
    assert.equal(exam.teacher, "دبیر نمونه");
    assert.equal(exam.school, "مدرسهٔ نمونه");
    for (const type of Object.keys(D.types))
      assert.equal(exam.questions.filter((q) => q.type === type).length, 2);
    for (const question of exam.questions) {
      assert.ok(question.unitTitle);
      const original = bank.questions.find((q) => q.id === question.id);
      assert.notEqual(original, question);
      assert.deepEqual(
        { ...original, unitTitle: question.unitTitle },
        question,
      );
    }
  }
});

test("demo answers are explicit, blanks are marked and every essay has a four-point rubric", () => {
  const bank = createDemoBank(D);
  for (const q of bank.questions) {
    assert.ok(q.explanation.trim());
    if (q.type === "mcq") {
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      assert.ok(q.options[q.answer]);
    } else if (q.type === "boolean") assert.equal(typeof q.answer, "boolean");
    else assert.ok(q.answer.trim());
    if (q.type === "blank") assert.match(q.text, /……|______/);
    if (q.type === "essay") {
      assert.equal(q.score, 400);
      assert.match(q.explanation, /مجموع ۴ نمره/);
      assert.equal((q.explanation.match(/۱ نمره/g) || []).length, 4);
    }
  }
  const answer = (id) => bank.questions.find((q) => q.id === id);
  assert.equal(
    answer("demo-q-proportion-mcq").options[
      answer("demo-q-proportion-mcq").answer
    ],
    "۶۰۰٬۰۰۰ تومان",
  );
  assert.equal(
    answer("demo-q-statistics-mcq").options[
      answer("demo-q-statistics-mcq").answer
    ],
    "۱۵",
  );
  assert.equal(answer("demo-q-proportion-boolean").answer, false);
  assert.equal(answer("demo-q-statistics-boolean").answer, true);
});

test("teacher answer key is separate, complete and HTML-escaped", () => {
  const bank = createDemoBank(D);
  bank.exams[0].questions[0].explanation = "<script>alert(1)</script>";
  const html = answerKey(bank);
  assert.match(html, /پاسخ‌نامهٔ دبیر/);
  assert.match(html, /نمونهٔ آموزشی/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal((html.match(/class="demo-answer"/g) || []).length, 16);
});
