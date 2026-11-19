"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
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
  fs.readFileSync("src/features/question-bank/school-word.js", "utf8"),
  c,
);
const W = c.EduQuestionBankSchoolWord;
const plain = (doc) =>
  doc
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
const exam = () => ({
  title: "دی ماه",
  courseTitle: "درس نمونه",
  teacher: "PRIVATE_TEACHER",
  school: "PRIVATE_SCHOOL",
  questions: [
    {
      type: "mcq",
      text: "حاصل ۲ + ۲؟",
      options: ["۱", "۲", "۳", "۴"],
      answer: 3,
      explanation: "PRIVATE_EXPLANATION",
      score: 50,
    },
    { type: "boolean", text: "آب مایع است.", answer: true, score: 25 },
    {
      type: "blank",
      text: "پایتخت ایران چیست؟",
      answer: "PRIVATE_ANSWER",
      score: 125,
    },
    {
      type: "essay",
      text: "دو روش را شرح دهید.",
      answer: "PRIVATE_ESSAY",
      score: 200,
    },
  ],
});
function unzip(buffer) {
  const entries = new Map();
  let at = 0;
  while (buffer.readUInt32LE(at) === 0x04034b50) {
    const n = buffer.readUInt16LE(at + 26),
      extra = buffer.readUInt16LE(at + 28),
      size = buffer.readUInt32LE(at + 18),
      start = at + 30 + n + extra;
    const data = buffer.subarray(start, start + size);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, buffer.readUInt32LE(at + 14));
    entries.set(
      buffer.toString("utf8", at + 30, at + 30 + n),
      data.toString("utf8"),
    );
    at = start + size;
  }
  assert.equal(buffer.readUInt32LE(at), 0x02014b50);
  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50);
  assert.equal(buffer.readUInt16LE(buffer.length - 12), entries.size);
  assert.equal(buffer.readUInt32LE(buffer.length - 6), at);
  return entries;
}
test("real DOCX package includes local document/styles relationships and valid ZIP checksums", async () => {
  const blob = W.create(exam()),
    files = unzip(Buffer.from(await blob.arrayBuffer()));
  assert.equal(
    blob.type,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  assert.equal(files.size, 5);
  assert.match(
    files.get("[Content_Types].xml"),
    /wordprocessingml.document.main\+xml/,
  );
  assert.match(files.get("_rels/.rels"), /Target="word\/document.xml"/);
  assert.match(
    files.get("word/_rels/document.xml.rels"),
    /Target="styles.xml"/,
  );
  for (const text of files.values())
    assert.doesNotMatch(text, /TargetMode="External"|vbaProject|<script/i);
});
test("school body contains all four question types, exact scores and no keys or personal header", () => {
  const source = exam(),
    before = JSON.stringify(source),
    doc = W.documentXml(source);
  for (const q of source.questions) assert.ok(plain(doc).includes(q.text));
  assert.match(plain(doc), /□ صحیح/);
  assert.match(plain(doc), /الف\) ۱/);
  assert.match(plain(doc), /پاسخ: /);
  assert.doesNotMatch(doc, /<w:pBdr>/);
  assert.match(plain(doc), /جمع بارم/);
  assert.ok(doc.includes("۰٫۲۵"));
  assert.match(doc, /<w:tblHeader\/>/);
  assert.match(doc, /<w:bidiVisual\/>/);
  assert.doesNotMatch(
    doc,
    /PRIVATE_|headerReference|footerReference|شماره صندلی|نام خانوادگی/,
  );
  assert.equal(JSON.stringify(source), before);
});
test("long options use two columns, short ones use four without reordering", () => {
  const value = exam();
  assert.match(W.documentXml(value), /<w:gridCol w:w="2375"\/>/);
  value.questions[0].options[0] =
    "گزینهٔ بسیار طولانی که باید در دو ستون نمایش داده شود";
  const doc = W.documentXml(value);
  assert.match(doc, /<w:gridCol w:w="4750"\/>/);
  assert.ok(
    plain(doc).indexOf("الف)") < plain(doc).indexOf("ب)") &&
      plain(doc).indexOf("ج)") < plain(doc).indexOf("د)"),
  );
});
test("Persian questions, including Latin-leading CPU terms, are explicitly RTL and right aligned", () => {
  for (const text of [
    "کاربرد رایانه چیست؟",
    "CPU چیست؟",
    "کار با Adobe Photoshop (2026) را شرح دهید.",
    "نشانی https://example.com/a?b=2 را بررسی کنید.",
  ]) {
    const doc = W.documentXml({
      questions: [{ type: "essay", text, score: 100 }],
    });
    const paragraph = [...doc.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)]
      .map((m) => m[0])
      .find((p) => plain(p).includes(text));
    assert.ok(paragraph, text);
    assert.match(paragraph, /<w:bidi w:val="1"\/>/);
    assert.match(paragraph, /<w:jc w:val="left"\/>/);
    for (const run of paragraph.matchAll(/<w:r>[\s\S]*?<\/w:r>/g)) {
      if (/[A-Za-z]/.test(plain(run[0])))
        assert.match(run[0], /<w:rtl w:val="0"\/>/);
    }
  }
});
test("English question paragraphs and option grids are LTR, while Persian option text stays RTL", () => {
  const source = {
    questions: [
      {
        type: "mcq",
        text: "Which processor is faster?",
        options: [
          "Intel Core i7",
          "AMD Ryzen 7",
          "پردازندهٔ فارسی",
          "CPU (2026)",
        ],
        score: 125,
      },
    ],
  };
  const doc = W.documentXml(source);
  const paragraphs = [...doc.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map(
    (m) => m[0],
  );
  for (const text of [
    "1. Which processor is faster?",
    "A) Intel Core i7",
    "B) AMD Ryzen 7",
    "D) CPU (2026)",
  ]) {
    const p = paragraphs.find((p) => plain(p).includes(text));
    assert.ok(p, text);
    assert.match(p, /<w:bidi w:val="0"\/>/);
    assert.match(p, /<w:jc w:val="left"\/>/);
  }
  const persian = paragraphs.find((p) => plain(p).includes("پردازندهٔ فارسی"));
  assert.match(persian, /<w:bidi w:val="1"\/>/);
  assert.match(persian, /<w:jc w:val="left"\/>/);
  assert.ok(plain(persian).includes("C) پردازندهٔ فارسی"));
  assert.match(doc, /<w:bidiVisual w:val="0"\/>/);
});
test("Persian MCQ keeps its original option labels even when individual choices are English", () => {
  const doc = W.documentXml({
    questions: [
      {
        type: "mcq",
        text: "کدام مورد درست است؟",
        score: 100,
        options: [
          "Adobe Photoshop",
          "گزینه فارسی",
          "CPU / GPU",
          "https://example.com",
        ],
      },
    ],
  });
  const text = plain(doc);
  for (const [i, label] of ["الف", "ب", "ج", "د"].entries())
    assert.ok(
      text.includes(
        label +
          ") " +
          [
            "Adobe Photoshop",
            "گزینه فارسی",
            "CPU / GPU",
            "https://example.com",
          ][i],
      ),
    );
  assert.doesNotMatch(text, /[A-D]\) /);
});
test("clipboard direction overrides never escape into the generated Word text", () => {
  const doc = W.documentXml({
    questions: [
      {
        type: "essay",
        text: "متن \u202eCPU\u202c و \u2066Adobe Photoshop\u2069 را بررسی کنید.",
        score: 100,
      },
    ],
  });
  assert.doesNotMatch(doc, /[\u202a-\u202e\u2066-\u2069]/);
  assert.ok(plain(doc).includes("متن CPU و Adobe Photoshop را بررسی کنید."));
  assert.match(doc, /<w:rtl w:val="0"\/>/);
});
test("Persian question numbers stay in the RTL run before mixed-language text", () => {
  const doc = W.documentXml({
    questions: [{ type: "boolean", text: "این یک book است ؟", score: 100 }],
  });
  assert.match(doc, /<w:t xml:space="preserve">۱\. این یک <\/w:t>/);
  const prompt = [...doc.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)]
    .map((match) => match[0])
    .find((p) => plain(p).includes("۱. این یک book است ؟"));
  assert.ok(prompt);
  assert.doesNotMatch(prompt, /<w:dir\b|<w:bdo\b/);
  const runs = [...prompt.matchAll(/<w:r>[\s\S]*?<\/w:r>/g)].map((m) => m[0]);
  assert.deepEqual(runs.map(plain), [
    "۱. این یک ",
    "book",
    " است ؟    □ صحیح    □ غلط",
  ]);
  assert.match(runs[1], /<w:rtl w:val="0"\/>/);
});
test("true/false choices share the question paragraph and wrap naturally in Word", () => {
  for (const text of ["این یک book است ؟", "Is this a book?"]) {
    const doc = W.documentXml({
      questions: [{ type: "boolean", text, score: 100 }],
    });
    const paragraphs = [...doc.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map(
      (m) => m[0],
    );
    const prompt = paragraphs.find((p) => plain(p).includes(text));
    assert.ok(
      plain(prompt).includes(
        text.includes("این") ? "□ صحیح    □ غلط" : "□ True    □ False",
      ),
    );
    assert.doesNotMatch(prompt, /<w:br\/>|<w:noWrap/);
  }
});
test("sparse questions and missing option slots fail before creating an incomplete document", () => {
  assert.throws(() => W.create({ questions: Array(3) }));
  const options = ["one", "two", "three", "four"];
  delete options[2];
  assert.throws(() =>
    W.create({
      questions: [{ type: "mcq", text: "Question?", score: 100, options }],
    }),
  );
});
test("Latin phrases and their punctuation stay together in sibling runs", () => {
  const doc = W.documentXml({
    questions: [
      {
        type: "essay",
        text: "از (Adobe Photoshop 2026) و https://example.com/a?b=2 استفاده کنید.",
        score: 100,
      },
    ],
  });
  const embeddings = [...doc.matchAll(/<w:r>[\s\S]*?<\/w:r>/g)].map((m) =>
    plain(m[0]),
  );
  assert.ok(embeddings.some((text) => text.includes("(Adobe Photoshop 2026)")));
  assert.ok(
    embeddings.some((text) => text.includes("https://example.com/a?b=2")),
  );
  assert.doesNotMatch(doc, /<w:bdo/);
});
test("font-neutral Normal style lets the school apply any installed font and size", async () => {
  const files = unzip(Buffer.from(await W.create(exam()).arrayBuffer()));
  for (const name of ["word/styles.xml", "word/document.xml"]) {
    assert.doesNotMatch(
      files.get(name),
      /w:rFonts|<w:sz\b|<w:szCs\b|w:fontTable|w:embed/,
    );
  }
  assert.match(files.get("word/document.xml"), /<w:pStyle w:val="Normal"\/>/);
  assert.match(
    files.get("word/styles.xml"),
    /w:default="1" w:styleId="Normal"/,
  );
});
test("relative tables and unruled answer space avoid font-dependent offsets and clipping", () => {
  const doc = W.documentXml(exam());
  assert.match(doc, /<w:tblW w:w="5000" w:type="pct"\/>/);
  assert.match(doc, /<w:tcW w:w="4450" w:type="pct"\/>/);
  assert.match(doc, /<w:tcW w:w="550" w:type="pct"\/>/);
  assert.doesNotMatch(
    doc,
    /trHeight|lineRule="exact"|noWrap|textBox|drawing|pict|w:framePr|\.{20,}/,
  );
  assert.doesNotMatch(doc, /<w:pBdr>|<w:between /);
  assert.equal(
    (doc.match(/<w:t xml:space="preserve"><\/w:t>/g) || []).length,
    4,
  );
  assert.match(doc, /<w:cantSplit\/><w:tblHeader\/>/);
  assert.match(doc, /<w:bidi w:val="1"\/><w:spacing[^>]+\/><w:jc/);
  assert.match(doc, /<w:shd[^>]+\/><w:vAlign/);
});
test("authored blank markers remain part of the question without generating extra answer rules", () => {
  const text = "جای خالی را پر کنید: ........";
  const doc = W.documentXml({
    questions: [{ type: "blank", text, score: 100 }],
  });
  assert.ok(plain(doc).includes(text));
  assert.doesNotMatch(doc, /<w:pBdr>|dotted|dashed/);
});
test("question XML and line breaks are escaped without embedding executable or external markup", () => {
  const value = exam();
  value.questions[0].text = '<w:hyperlink> & "متن"\nسطر دوم';
  const doc = W.documentXml(value);
  assert.ok(plain(doc).includes('<w:hyperlink> & "متن"'));
  assert.ok(plain(doc).includes("سطر دوم"));
  assert.doesNotMatch(doc, /<w:hyperlink>/);
});
test("long options stack vertically and Persian introductions do not force English code lines RTL", () => {
  const doc = W.documentXml({
    questions: [
      {
        type: "mcq",
        text: "خروجی قطعه کد زیر چیست؟\nlet total = 2 + 3;\nconsole.log(total);",
        score: 100,
        options: ["گزینهٔ طولانی ".repeat(12), "دو", "سه", "چهار"],
      },
    ],
  });
  assert.match(doc, /<w:gridCol w:w="9500"\/>/);
  const code = [...doc.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)]
    .map((m) => m[0])
    .find((p) => plain(p) === "let total = 2 + 3;");
  assert.ok(code);
  assert.match(code, /<w:bidi w:val="0"\/>/);
  assert.match(code, /<w:jc w:val="left"\/>/);
});
test("invalid question bodies and more than 500 questions are rejected before download", () => {
  for (const questions of [
    [],
    Array(501).fill(exam().questions[0]),
    [{ type: "mcq", text: "سؤال", score: 100, options: ["الف"] }],
    [{ type: "essay", text: "سؤال", score: -1 }],
  ])
    assert.throws(() => W.create({ questions }));
  assert.doesNotThrow(() =>
    W.create({ questions: Array(500).fill(exam().questions[0]) }),
  );
});
test("Word exports long question and option text accepted by the bank without truncation", () => {
  const text = "متن بلند سؤال ".repeat(900);
  const option = "گزینهٔ بلند ".repeat(220);
  const doc = W.documentXml({
    questions: [
      {
        type: "mcq",
        text,
        score: 100,
        options: [option, "دوم", "سوم", "چهارم"],
      },
    ],
  });
  assert.ok(plain(doc).includes(text));
  assert.ok(plain(doc).includes(option));
});
test("download filenames cannot contain Windows paths, controls or direction overrides", () => {
  const name = W.filename({
    courseTitle: "../مدرسه\\درس\u202e",
    title: 'آزمون:*?"',
  });
  assert.doesNotMatch(name, /[\\/:*?"<>|\u202a-\u202e]/);
  assert.ok(name.endsWith("بدون سربرگ.docx"));
});
