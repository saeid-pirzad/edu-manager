"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../src/features/question-bank/domain.js");
const {
  createDemoBank,
} = require("../scripts/fixtures/question-bank-demo.cjs");
const { answerKey } = require("../scripts/question-bank-demo.cjs");
const D = globalThis.EduQuestionBank;
test("delivered JSON contains exactly the two requested courses and their linked editable records", () => {
  const fs = require("node:fs");
  const bank = D.parse(
    fs.readFileSync(
      "docs/examples/question-bank/two-course-samples.json",
      "utf8",
    ),
  );
  assert.equal(bank.courses.length, 2);
  assert.equal(bank.units.length, 5);
  assert.equal(bank.questions.length, 20);
  assert.equal(bank.exams.length, 2);
  for (const course of bank.courses) {
    const units = bank.units.filter((unit) => unit.courseId === course.id);
    assert.equal(units.length, course.structure === "module" ? 3 : 2);
    for (const unit of units) {
      const questions = bank.questions.filter((q) => q.unitId === unit.id);
      assert.equal(questions.length, 4);
      assert.deepEqual(
        questions.map((q) => q.type).sort(),
        Object.keys(D.types).sort(),
      );
    }
    const exam = bank.exams.find((exam) => exam.courseTitle === course.title);
    assert.equal(exam.questions.length, 8);
    assert.equal(
      exam.questions.reduce((sum, q) => sum + q.score, 0),
      2000,
    );
    for (const snapshot of exam.questions) {
      const original = bank.questions.find((q) => q.id === snapshot.id);
      assert.ok(original);
      assert.deepEqual(
        {
          ...original,
          unitTitle: units.find((u) => u.id === original.unitId).title,
        },
        snapshot,
      );
    }
  }
});
test("modular sample registers three modules with four question types each and a twenty-point exam", () => {
  const samples = require("../scripts/fixtures/question-bank-entry-samples.cjs");
  const before = createDemoBank(D),
    original = D.size(before);
  const sample = samples.createBank(before, "module");
  assert.equal(D.size(before), original);
  const course = sample.bank.courses.find((c) => c.id === sample.courseId);
  assert.equal(course.structure, "module");
  const units = sample.bank.units.filter((u) => u.courseId === course.id);
  assert.equal(units.length, 3);
  for (const unit of units) {
    const questions = sample.bank.questions.filter((q) => q.unitId === unit.id);
    assert.equal(questions.length, 4);
    assert.deepEqual(
      questions.map((q) => q.type).sort(),
      Object.keys(D.types).sort(),
    );
  }
  const exam = sample.bank.exams.at(-1);
  assert.equal(exam.duration, 50);
  assert.equal(exam.questions.length, 8);
  assert.equal(
    exam.questions.reduce((sum, q) => sum + q.score, 0),
    2000,
  );
  assert.ok(exam.questions.every((q) => units.some((u) => u.id === q.unitId)));
  assert.deepEqual(D.parse(D.size(sample.bank)), sample.bank);
});
test("JSON sample contains editable course records and detached exam snapshots with fresh identifiers", () => {
  const samples = require("../scripts/fixtures/question-bank-entry-samples.cjs");
  const before = createDemoBank(D),
    original = D.size(before);
  const first = samples.createBank(before);
  assert.equal(D.size(before), original);
  assert.equal(first.bank.courses.length, 3);
  assert.equal(
    first.bank.units.filter((u) => u.courseId === first.courseId).length,
    2,
  );
  const added = first.bank.questions.slice(before.questions.length);
  assert.equal(added.length, 8);
  for (const type of Object.keys(D.types))
    assert.equal(added.filter((q) => q.type === type).length, 2);
  const exam = first.bank.exams.at(-1);
  assert.equal(
    exam.questions.reduce((sum, q) => sum + q.score, 0),
    2000,
  );
  assert.equal(exam.duration, 45);
  const frozen = JSON.stringify(exam);
  added[0].text = "edited";
  assert.equal(JSON.stringify(exam), frozen);
  const second = samples.createBank(first.bank);
  assert.notEqual(first.courseId, second.courseId);
  assert.equal(second.bank.courses.length, 4);
  assert.equal(second.bank.questions.length, 32);
  assert.deepEqual(D.parse(D.size(second.bank)), second.bank);
});
test("review samples cover boundaries, every correct-choice position and printable text without changing original examples", () => {
  const {
    createReviewBank,
  } = require("../scripts/fixtures/question-bank-review.cjs");
  const original = createDemoBank(D);
  const bank = createReviewBank(D);
  assert.deepEqual(bank.questions.slice(0, 16), original.questions);
  assert.deepEqual(D.parse(D.size(bank)), bank);
  assert.equal(bank.questions.length, 24);
  assert.equal(bank.exams.length, 3);
  const edge = bank.questions.slice(16);
  assert.deepEqual(
    edge.filter((q) => q.type === "mcq").map((q) => q.answer),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    edge.filter((q) => q.type === "boolean").map((q) => q.answer),
    [true, false],
  );
  assert.ok(edge.some((q) => q.score === 1));
  assert.ok(edge.some((q) => q.score === 10000));
  assert.ok(edge.some((q) => q.text.includes("<script>")));
  assert.equal(bank.exams[2].duration, 600);
  assert.equal(bank.exams[2].questions.length, 8);
});

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
