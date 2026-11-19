"use strict";
// Synthetic document only. The optional PowerShell audit owns a separate Word
// instance; it never opens or changes the user's sample or existing documents.
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const c = vm.createContext({
  Blob,
  TextEncoder,
  Uint8Array,
  Uint32Array,
  DataView,
  Intl,
});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/features/question-bank/school-word.js"),
    "utf8",
  ),
  c,
);
const questions = [
  { type: "essay", text: "کاربرد رایانه را بنویسید.", score: 100 },
  {
    type: "essay",
    text: "CPU چیست و Adobe Photoshop چه کاربردی دارد؟",
    score: 100,
  },
  {
    type: "essay",
    text: "Explain the function of a computer processor.",
    score: 100,
  },
  {
    type: "mcq",
    text: "Which one is an operating system?",
    options: ["Windows", "Photoshop", "Illustrator", "CorelDRAW"],
    score: 100,
  },
  {
    type: "mcq",
    text: "کدام نرم‌افزار را انتخاب می‌کنید؟",
    options: [
      "Adobe Photoshop (2026)",
      "نرم‌افزار فارسی",
      "CPU / GPU",
      "https://example.com/a?b=2",
    ],
    score: 100,
  },
];
const auditRoot = path.resolve(__dirname, "../.cache/school-word-native");
fs.mkdirSync(auditRoot, { recursive: true });
const auditFolder = fs.mkdtempSync(path.join(auditRoot, "run-"));
const destination = path.join(auditFolder, "mixed.docx");
c.EduQuestionBankSchoolWord.create({ questions })
  .arrayBuffer()
  .then(async (buffer) => {
    fs.writeFileSync(destination, Buffer.from(buffer));
    console.log(destination);
    await generateStress();
    await generateEdge();
    fs.writeFileSync(path.join(auditRoot, "latest.txt"), destination);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
async function generateStress() {
  const questions = Array.from({ length: 80 }, (_, i) => {
    const marker = "Q" + String(i + 1).padStart(4, "0");
    const sample = [
      {
        type: "essay",
        text:
          marker +
          " ـ کار با CPU و Adobe Photoshop را با ذکر مثال توضیح دهید. " +
          "متن طولانی برای بررسی خوانایی و صفحه‌بندی. ".repeat(
            i === 0 ? 35 : 3,
          ),
        score: 25,
      },
      {
        type: "mcq",
        text:
          marker +
          " Which example is correct? " +
          "Compare the choices carefully. ".repeat(3),
        options: [
          "Option one",
          "A longer second choice used to verify wrapping without losing its text.",
          "Option three",
          "گزینهٔ چهارم",
        ],
        score: 50,
      },
      {
        type: "boolean",
        text: marker + " ـ رایانه برای پردازش داده به پردازنده نیاز دارد.",
        score: 75,
      },
      {
        type: "blank",
        text: marker + " Fill the blank: the operating system is ________.",
        score: 100,
      },
    ][i % 4];
    return {
      ...sample,
      answer: "PRIVATE_ANSWER_" + marker,
      explanation: "PRIVATE_EXPLANATION_" + marker,
    };
  });
  const folder = path.dirname(destination);
  fs.writeFileSync(
    path.join(folder, "stress.docx"),
    Buffer.from(
      await c.EduQuestionBankSchoolWord.create({ questions }).arrayBuffer(),
    ),
  );
  fs.writeFileSync(
    path.join(folder, "stress.json"),
    JSON.stringify({
      questions,
      total: new Intl.NumberFormat("fa-IR").format(
        questions.reduce((sum, q) => sum + q.score, 0) / 100,
      ),
    }),
  );
  console.log("Generated synthetic 80-question pagination fixture.");
}

async function generateEdge() {
  const questions = [
    {
      type: "essay",
      text: 'خروجی قطعه کد زیر چیست؟\nconsole.log("سلام");\nconst message = "سلام";\n<h1>سلام</h1>',
      score: 100,
    },
    { type: "blank", text: "Name the network device:", score: 25 },
    {
      type: "mcq",
      text: "کدام گزینه درست است؟",
      options: [
        "گزینهٔ بلند برای بررسی حفظ تمام متن و نمایش تمام‌عرض در فایل Word. ".repeat(
          4,
        ),
        'توضیح فارسی گزینه\nconsole.log("سلام");',
        "گزینهٔ سوم",
        "گزینهٔ چهارم",
      ],
      score: 125,
    },
    { type: "boolean", text: "Is this a computer?", score: 50 },
    { type: "boolean", text: "این یک book است؟", score: 75 },
    {
      type: "mcq",
      text: 'Explain this code:\nconsole.log("سلام");',
      options: ["One", "Two", "Three", "Four"],
      score: 25,
    },
  ].map((question, index) => ({
    ...question,
    answer: "PRIVATE_EDGE_ANSWER_" + index,
    explanation: "PRIVATE_EDGE_EXPLANATION_" + index,
  }));
  const paragraphs = [
    { row: 2, text: "۱. خروجی قطعه کد زیر چیست؟", dir: "rtl" },
    { row: 2, text: 'console.log("سلام");', dir: "ltr" },
    { row: 2, text: 'const message = "سلام";', dir: "ltr" },
    { row: 2, text: "<h1>سلام</h1>", dir: "ltr" },
    { row: 3, text: "2. Name the network device:", dir: "ltr" },
    { row: 3, text: "Answer: ", dir: "ltr" },
    { row: 4, text: "ب) توضیح فارسی گزینه", dir: "rtl" },
    { row: 4, text: 'console.log("سلام");', dir: "ltr" },
    {
      row: 5,
      text: "4. Is this a computer?    □ True    □ False",
      dir: "ltr",
    },
    { row: 6, text: "۵. این یک book است؟    □ صحیح    □ غلط", dir: "rtl" },
    { row: 7, text: "6. Explain this code:", dir: "ltr" },
    { row: 7, text: 'console.log("سلام");', dir: "ltr" },
    { row: 7, text: "A) One", dir: "ltr" },
    { row: 7, text: "D) Four", dir: "ltr" },
  ];
  const folder = path.dirname(destination);
  fs.writeFileSync(
    path.join(folder, "edge.docx"),
    Buffer.from(
      await c.EduQuestionBankSchoolWord.create({ questions }).arrayBuffer(),
    ),
  );
  fs.writeFileSync(
    path.join(folder, "edge.json"),
    JSON.stringify({
      questions,
      paragraphs,
      total: new Intl.NumberFormat("fa-IR").format(
        questions.reduce((sum, q) => sum + q.score, 0) / 100,
      ),
    }),
  );
  console.log(
    "Generated synthetic code, bilingual and multiline-option fixture.",
  );
}
