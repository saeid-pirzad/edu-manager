const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

test("print sheet isolates Persian, mixed and English prompts without moving score columns", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/features/question-bank/ui.js"),
    "utf8",
  );
  const implementation = source.slice(
    source.indexOf("  function sheetTextDirection("),
    source.indexOf("  async function print("),
  );
  const textDirection = vm.runInNewContext(
    `${implementation}; sheetTextDirection`,
  );
  for (const text of [
    'const message = "سلام";',
    'console.log("سلام");',
    "<h1>سلام</h1>",
    'Explain the output:\nconsole.log("سلام");',
  ])
    assert.equal(textDirection(text), "ltr", text);
  assert.equal(textDirection("CPU چیست؟"), "rtl");
  assert.equal(textDirection("CPU (واحد پردازش مرکزی) چیست؟"), "rtl");
  const el = (tag, text, className) => ({
    tag,
    textContent: text,
    className,
    style: {},
    children: [],
    append(...nodes) {
      this.children.push(...nodes);
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    get lastElementChild() {
      return this.children.at(-1);
    },
  });
  const render = vm.runInNewContext(`${implementation}; sheet`, {
    el,
    crypto: { randomUUID: () => "test" },
    number: (value) => new Intl.NumberFormat("fa-IR").format(value),
    dateLabel: String,
    letters: ["الف", "ب", "ج", "د"],
    document: { createTextNode: (text) => text },
  });
  const result = render({
    title: "آزمون",
    courseTitle: "درس",
    duration: 20,
    questions: [
      { type: "boolean", text: "این یک book است ؟", score: 100 },
      { type: "boolean", text: "Is this a book?", score: 100 },
      {
        type: "mcq",
        text: "CPU چیست؟",
        score: 100,
        options: ["CPU", "پردازنده", "GPU", "گزینه"],
      },
      {
        type: "mcq",
        text: "Choose the correct answer?",
        score: 100,
        options: ["One", "Two", "Three", "Four"],
      },
      {
        type: "essay",
        text: "خروجی کد زیر چیست؟\nlet sum = 2 + 3;\nconsole.log(sum);",
        score: 100,
      },
    ],
  });
  const rows = result.children.filter(
    (node) => node.className === "qb-sheet-question",
  );
  assert.equal(result.dir, "rtl");
  assert.equal(rows[0].children[0].children[0].textContent, "۱.");
  assert.equal(rows[1].children[0].children[0].textContent, "");
  assert.equal(rows[3].children[0].children[0].textContent, "");
  assert.equal(
    rows[1].children[0].children[1].textContent,
    "2. Is this a book?",
  );
  assert.equal(
    rows[3].children[0].children[1].textContent,
    "4. Choose the correct answer?",
  );
  assert.equal(rows[1].children[0].children[0]["aria-hidden"], "true");
  assert.ok(rows.every((row) => row.children[0].children[0].dir === "ltr"));
  assert.deepEqual(
    rows.map((row) => row.children[0].children[1].dir),
    ["rtl", "ltr", "rtl", "ltr", "rtl"],
  );
  assert.equal(
    rows[0].children[0].children[1].children[1].textContent,
    "□ صحیح     □ غلط",
  );
  assert.equal(
    rows[1].children[0].children[1].children[1].textContent,
    "□ True     □ False",
  );
  assert.equal(rows[2].children[1].children[0].children[1].dir, "ltr");
  assert.equal(rows[2].children[1].children[1].children[1].dir, "rtl");
  assert.equal(rows[2].children[1].dir, "rtl");
  assert.equal(rows[3].children[1].dir, "ltr");
  assert.equal(rows[3].children[1].children[0].children[0].textContent, "A)");
  assert.equal(rows[3].children[1].children[3].children[0].textContent, "D)");
  const lines = rows[4].children[0].children[1].children;
  assert.deepEqual(
    lines.map((line) => line.dir),
    ["rtl", "ltr", "ltr"],
  );
  assert.equal(lines[1].textContent, "let sum = 2 + 3;");
});
