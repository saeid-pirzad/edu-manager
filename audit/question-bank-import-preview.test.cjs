"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture() {
  const ui = fs.readFileSync("src/features/question-bank/ui.js", "utf8");
  const format = vm.runInNewContext(
    ui.slice(
      ui.indexOf("  function sheetTextDirection("),
      ui.indexOf("  function sheet(exam)"),
    ) + "; ({ direction: sheetTextDirection, clean: sheetCleanText });",
  );
  const context = vm.createContext({
    EduQuestionBank: {
      types: {
        mcq: "چهارگزینه‌ای",
        boolean: "صحیح / غلط",
        essay: "تشریحی",
        blank: "جای‌خالی",
      },
    },
    EduQuestionBankUI: { previewText: format },
  });
  const marker = "  root.EduQuestionBankImportUI = { mount };";
  const source = fs.readFileSync(
    "src/features/question-bank/question-import-ui.js",
    "utf8",
  );
  assert.equal(source.split(marker).length, 2);
  vm.runInContext(
    source.replace(
      marker,
      "  root.testPreview = { textBlock, appendQuestion };\n" + marker,
    ),
    context,
  );
  const el = (tag, text, className) => ({
    tag,
    textContent: text,
    className,
    children: [],
    dataset: {},
    append(...nodes) {
      this.children.push(...nodes);
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  });
  return { ...context.testPreview, el };
}

test("import preview reuses print direction for Persian prompts and individual code lines", () => {
  const { el, textBlock } = fixture();
  const text =
    'خروجی قطعه کد زیر چیست؟\r\nconst message = "سلام";\n\n  console.log(message);\rپاسخ را توضیح دهید.';
  const result = textBlock(el, "p", text, "prompt");
  assert.equal(result.dir, "rtl");
  assert.deepEqual(
    result.children.map((line) => [line.textContent, line.dir]),
    [
      ["خروجی قطعه کد زیر چیست؟", "rtl"],
      ['const message = "سلام";', "ltr"],
      ["", "rtl"],
      ["  console.log(message);", "ltr"],
      ["پاسخ را توضیح دهید.", "rtl"],
    ],
  );
  assert.equal(textBlock(el, "p", "CPU چیست؟", "prompt").dir, "rtl");
  assert.equal(textBlock(el, "p", "What is a CPU?", "prompt").dir, "ltr");
});

test("import preview keeps HTML literal and strips bidi overrides without changing stored source", () => {
  const { el, textBlock } = fixture();
  const source = '\u202e<h1 onclick="alert(1)">سلام</h1>\u202c';
  const result = textBlock(el, "p", source, "prompt");
  assert.equal(result.dir, "ltr");
  assert.equal(
    result.children[0].textContent,
    '<h1 onclick="alert(1)">سلام</h1>',
  );
  assert.ok(source.startsWith("\u202e"));
  assert.equal(result.children[0].tag, "span");
  assert.ok(!("innerHTML" in result.children[0]));
});

test("MCQ preview separates and labels options in the question language with isolated mixed lines", () => {
  const { el, appendQuestion } = fixture();
  const item = el("li");
  appendQuestion(
    item,
    {
      type: "mcq",
      text: "کدام قطعه کد صحیح است؟",
      options: [
        'const message = "سلام";\nconsole.log(message);',
        "گزینه فارسی",
        "English choice",
        "چهارم",
      ],
      answer: 0,
      score: 125,
      explanation: 'توضیح:\nconsole.log("سلام");',
    },
    el,
  );
  const options = item.children[0];
  assert.equal(options.className, "qb-import-options");
  assert.equal(options.dir, "rtl");
  assert.equal(options.dataset.multiline, "true");
  assert.equal(options.children.length, 4);
  assert.deepEqual(
    options.children.map((choice) => choice.children[0].textContent),
    ["الف)", "ب)", "ج)", "د)"],
  );
  assert.equal(options.children[0].children[1].dir, "ltr");
  assert.equal(options.children[1].children[1].dir, "rtl");
  assert.equal(options.children[2].children[1].dir, "ltr");
  assert.match(item.children[1].textContent, /۱٫۲۵/);
  assert.equal(item.children[2].children[0].textContent, "پاسخ صحیح:");
  assert.equal(
    item.children[2].children[1].children[0].textContent,
    "گزینهٔ ۱",
  );
  assert.equal(item.children[3].children[1].children[0].dir, "rtl");
  assert.equal(item.children[3].children[1].children[1].dir, "ltr");
});

test("English MCQs read A to D and text answers preserve indentation without Persian label interference", () => {
  const { el, appendQuestion } = fixture();
  const item = el("li");
  appendQuestion(
    item,
    {
      type: "mcq",
      text: "Choose the correct output:",
      options: ["One", "Two", "Three", "Four"],
      answer: 2,
      score: 100,
    },
    el,
  );
  const options = item.children[0];
  assert.equal(options.dir, "ltr");
  assert.deepEqual(
    options.children.map((choice) => choice.children[0].textContent),
    ["A)", "B)", "C)", "D)"],
  );
  const essay = el("li");
  appendQuestion(
    essay,
    {
      type: "essay",
      text: "کد را کامل کنید؟",
      answer: 'if (ready) {\n\tconsole.log("سلام");\n}',
      score: 100,
    },
    el,
  );
  const answer = essay.children[1].children[1];
  assert.equal(answer.dir, "ltr");
  assert.equal(answer.children[1].textContent, '\tconsole.log("سلام");');
  assert.equal(answer.children[1].dir, "ltr");
});

test("preview layout stays scoped and adapts options while isolating whitespace-sensitive lines", () => {
  const ui = fs.readFileSync("src/features/question-bank/ui.js", "utf8");
  const style = fs.readFileSync("src/styles/question-bank/import.css", "utf8");
  assert.ok(ui.includes(".qb-options,.qb-sheet-options,.qb-import-options"));
  assert.match(style, /\.qb-import-options\[data-columns="4"\]/);
  assert.match(style, /\.qb-import-options\[data-columns="2"\]/);
  assert.match(
    style,
    /\.qb-import-options\[data-multiline="true"\]\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/,
  );
  const lines = style.slice(
    style.indexOf(".qb-import-line {"),
    style.indexOf(".qb-import-options {"),
  );
  assert.match(lines, /unicode-bidi: isolate/);
  assert.match(lines, /white-space: pre-wrap/);
  assert.match(lines, /text-align: start/);
  assert.match(lines, /tab-size: 4/);
});
