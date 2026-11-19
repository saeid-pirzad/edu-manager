"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
require("../src/features/question-bank/domain.js");
require("../src/features/question-bank/school-word.js");
const { createNetworkGrade11Bank } = require("./fixtures/network-grade11.cjs");
const { main } = require("../audit/data-integrity.cjs");
const D = globalThis.EduQuestionBank;
const W = globalThis.EduQuestionBankSchoolWord;
const bank = createNetworkGrade11Bank(D);
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const base = path.resolve(__dirname, "../docs/examples");
fs.mkdirSync(base, { recursive: true });
// Always a fresh artifact directory; never overwrite an existing sample/user file.
const output = fs.mkdtempSync(path.join(base, "network-grade11-"));
const artifacts = new Map();
main({
  stage: "network-grade11-demo",
  runExtra: async ({ evaluate, cdp, cases }) => {
    const check = (name, pass) => {
      cases.push({ name: "network grade11: " + name, pass: !!pass });
      assert.ok(pass, name);
    };
    const saved = await evaluate(`(async()=>{
      const current=await EduQuestionBankRepository.read();
      if(current.questions.length||current.courses.length||current.exams.length)throw Error('Isolated profile is not empty');
      await EduQuestionBankRepository.save(${JSON.stringify(bank)},current.revision);
      return EduQuestionBankRepository.read();
    })()`);
    check(
      "bank survives actual IndexedDB write/read",
      JSON.stringify({ ...bank, revision: saved.revision }) ===
        JSON.stringify(saved),
    );
    artifacts.set("Classyar-QuestionBank.json", JSON.stringify(saved, null, 2));
    const snapshots = [];
    for (const [index, exam] of bank.exams.entries()) {
      const total = exam.questions.reduce((sum, q) => sum + q.score, 0);
      check(
        "four question types and unique IDs " + index,
        new Set(exam.questions.map((q) => q.type)).size === 4 &&
          new Set(exam.questions.map((q) => q.id)).size ===
            exam.questions.length,
      );
      if (index % 2 === 0)
        check("full exam has exactly 20 points " + index, total === 2000);
      const captured = await evaluate(`(async()=>{
        const exam=${JSON.stringify(exam)};
        const observer=new MutationObserver(()=>{
          const frame=document.querySelector('.qb-print-frame');
          if(frame)frame.contentWindow.print=()=>{};
        });
        observer.observe(document.body,{childList:true});
        try{
          await EduQuestionBankUI.print(exam);
          const frame=document.querySelector('.qb-print-frame'),doc=frame.contentDocument,sheet=doc.querySelector('.qb-sheet');
          const result={html:'<!doctype html>'+doc.documentElement.outerHTML,sheet:sheet.outerHTML,count:sheet.querySelectorAll('.qb-sheet-question').length,noAnswers:exam.questions.every(q=>!doc.body.textContent.includes(q.explanation))};
          frame.remove();return result;
        }finally{observer.disconnect();}
      })()`);
      check(
        "real print output includes every question and no explanations " +
          index,
        captured.count === exam.questions.length && captured.noAnswers,
      );
      snapshots.push(captured);
      const word = Buffer.from(await W.create(exam).arrayBuffer());
      check(
        "real DOCX package " + index,
        word.subarray(0, 2).toString() === "PK",
      );
      artifacts.set(`exam-${index + 1}.docx`, word);
    }
    const tree = await cdp("Page.getFrameTree");
    await cdp("Emulation.setEmulatedMedia", { media: "print" });
    for (const [index, snapshot] of snapshots.entries()) {
      await cdp("Page.setDocumentContent", {
        frameId: tree.frameTree.frame.id,
        html: snapshot.html,
      });
      await evaluate(`(async()=>{
        for(let n=0;n<100;n++){
          if([...document.querySelectorAll('link[rel=stylesheet]')].every(l=>!!l.sheet))break;
          await new Promise(r=>setTimeout(r,50));
        }
        if(![...document.querySelectorAll('link[rel=stylesheet]')].every(l=>!!l.sheet))throw Error('Missing print CSS');
        await document.fonts.load('16px IRANSans');await document.fonts.ready;
      })()`);
      const pdf = await cdp("Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
      });
      const bytes = Buffer.from(pdf.data, "base64");
      check(
        "native PDF " + index,
        bytes.subarray(0, 5).toString() === "%PDF-" && bytes.length > 10000,
      );
      artifacts.set(`exam-${index + 1}.pdf`, bytes);
    }
    const head =
      '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../../../assets/styles/app.css"><title>نمونهٔ یازدهم شبکه و نرم‌افزار</title><body style="padding:24px;max-width:1000px;margin:auto">';
    const intro =
      '<h1>بانک سؤال آزمایشی یازدهم شبکه و نرم‌افزار</h1><p>۲۴ سؤال تألیفی، دو درس و چهار آزمون. نمونهٔ آموزشی و تست نرم‌افزار است؛ انطباق رسمی با کتاب درسی یا استاندارد ارزشیابی ادعا نمی‌شود. درس دوم عمداً فصلی تعریف شده تا هر دو ساختار بانک آزمایش شوند.</p><p>فایل JSON شامل پاسخ‌هاست؛ برای هنرجو فقط PDF یا Word آزمون ارسال شود. بازیابی بانک ممکن است دادهٔ فعلی بانک را جایگزین کند؛ ابتدا از بانک فعلی پشتیبان بگیرید یا از محیط آزمایشی مستقل استفاده کنید.</p><a href="Classyar-QuestionBank.json" download>دریافت بانک سؤال و آزمون‌ها</a>';
    artifacts.set(
      "preview.html",
      head +
        intro +
        bank.exams
          .map(
            (exam, i) =>
              `<section><h2>${escape(exam.courseTitle)} — ${escape(exam.title)}</h2><p>${exam.questions.length} سؤال · بارم ${exam.questions.reduce((s, q) => s + q.score, 0) / 100} · <a href="exam-${i + 1}.pdf">PDF</a> · <a href="exam-${i + 1}.docx">Word</a></p>${snapshots[i].sheet}</section>`,
          )
          .join("") +
        "</body></html>",
    );
    artifacts.set(
      "teacher-answers.html",
      head +
        "<h1>پاسخ‌نامهٔ جداگانهٔ دبیر — ارسال نشود</h1>" +
        bank.exams
          .map(
            (exam, i) =>
              `<h2>آزمون ${i + 1} — ${escape(exam.courseTitle)}</h2><ol>${exam.questions.map((q) => `<li><p>${escape(q.text)}</p><p>پاسخ: ${escape(q.type === "mcq" ? `${q.answer + 1}) ${q.options[q.answer]}` : q.type === "boolean" ? (q.answer ? "صحیح" : "غلط") : q.answer)}</p><p>${escape(q.explanation)}</p></li>`).join("")}</ol>`,
          )
          .join("") +
        "</body></html>",
    );
    for (const [name, content] of artifacts)
      fs.writeFileSync(path.join(output, name), content, { flag: "wx" });
    console.log("GRADE11_OUTPUT=" + output);
  },
});
