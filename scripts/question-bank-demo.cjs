"use strict";

// Developer-owned illustrative fixtures only. The browser harness always creates
// a fresh temporary profile; it never uses an installed browser's user profile.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
require("../src/features/question-bank/domain.js");
const { createDemoBank } = require("./fixtures/question-bank-demo.cjs");
const { main } = require("../audit/data-integrity.cjs");
const D = globalThis.EduQuestionBank;
const root = path.resolve(__dirname, "..");
const output = path.join(root, "docs", "examples", "question-bank");
const marker = "scripts/question-bank-demo.cjs";
const artifactNames = [
  "bank.json",
  "preview.html",
  "teacher-answers.html",
  "general-exam.pdf",
  "modular-exam.pdf",
  "general-bank-390.png",
  "modular-bank-390.png",
  "preview-390.png",
];
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const escape = (value) =>
  String(value).replace(/[&<>"']/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });

function preserveExistingOutput() {
  const manifestPath = path.join(output, "generated-files.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : null;
  if (manifest && manifest.generator !== marker)
    throw Error("Unexpected output manifest; no files were changed.");
  for (const name of artifactNames) {
    const target = path.join(output, name);
    if (
      fs.existsSync(target) &&
      (!manifest || manifest.files?.[name] !== sha(fs.readFileSync(target)))
    )
      throw Error(
        "Refusing to overwrite an unexpected or edited file: " + target,
      );
  }
}

function page(title, body) {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${marker}">
<title>${escape(title)}</title>
<link rel="stylesheet" href="../../../assets/styles/app.css">
<style>
body{margin:0;background:#f1f5f9;color:#172033;font-family:IRANSans,sans-serif;line-height:1.9}
main{max-width:1000px;margin:auto;padding:24px 16px}.demo-intro{padding:20px;border:1px solid #cbd5e1;border-radius:16px;background:white;margin-bottom:24px}
.demo-intro h1{margin:0 0 8px;font-size:24px}.demo-links{display:flex;gap:12px;flex-wrap:wrap}.demo-links a{display:inline-block;padding:8px 12px;border:1px solid #b8c4d6;border-radius:10px;background:#f8fafc;color:#9f1239}
.demo-exam{margin-block:30px}.demo-exam>h2{font-size:20px}.qb-sheet{border:1px solid #cbd5e1;border-radius:12px}.demo-answer{padding:16px;background:white;border:1px solid #cbd5e1;border-radius:12px;margin-block:12px}.demo-answer h3{margin-top:0}.demo-answer p{white-space:pre-wrap}
@media(max-width:480px){main{padding:12px 8px}.demo-intro{padding:14px}.demo-intro h1{font-size:20px}}
@media screen and (max-width:700px){.qb-sheet-options[data-columns]{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media print{body{background:white}body>main{display:block!important;max-width:none;padding:0}.demo-intro,.demo-links,.demo-exam>h2{display:none}.demo-exam{break-before:page;margin:0}.demo-exam:first-of-type{break-before:auto}.qb-sheet{padding:0;border:0;border-radius:0}.demo-answer{break-inside:avoid}@page{size:A4 portrait;margin:15mm}}
</style>
</head>
<body><main>${body}</main></body>
</html>
`;
}

function answerKey(bank) {
  const letters = ["الف", "ب", "ج", "د"];
  return page(
    "پاسخ‌نامهٔ دبیر — نمونهٔ آموزشی غیررسمی",
    `<header class="demo-intro"><h1>پاسخ‌نامهٔ دبیر</h1><p>این محتوا تألیفی و صرفاً نمونهٔ آموزشی است؛ برنامهٔ رسمی درسی یا الگوی رسمی ارزشیابی نیست. این فایل جدا از برگه‌های PDF هنرجو نگه‌داری شده است.</p><a href="preview.html">بازگشت به نمونهٔ آزمون‌ها</a></header>` +
      bank.exams
        .map(
          (exam) =>
            `<section class="demo-exam"><h2>${escape(exam.title)}</h2>` +
            exam.questions
              .map((q, index) => {
                const answer =
                  q.type === "mcq"
                    ? `${letters[q.answer]}) ${q.options[q.answer]}`
                    : q.type === "boolean"
                      ? q.answer
                        ? "صحیح"
                        : "غلط"
                      : q.answer;
                return `<article class="demo-answer"><h3>سؤال ${index + 1} · ${escape(D.types[q.type])} · ${q.score / 100} نمره</h3><p>${escape(q.text)}</p><p><strong>پاسخ:</strong> ${escape(answer)}</p><p><strong>توضیح و راهنمای تصحیح:</strong> ${escape(q.explanation)}</p></article>`;
              })
              .join("") +
            "</section>",
        )
        .join(""),
  );
}

async function generate() {
  preserveExistingOutput();
  const fixture = createDemoBank(D);
  const artifacts = new Map();
  await main({
    stage: "question-bank-demo",
    runExtra: async ({ evaluate, cdp, cases, delay }) => {
      const check = (name, pass) => {
        cases.push({ name: "question-bank demo: " + name, pass: !!pass });
        if (!pass) throw Error("Demo validation failed: " + name);
      };
      await evaluate(`(async()=>{
        closeModal();
        if(document.querySelector('.qb-dialog'))document.querySelector('.qb-close').click();
        const bank=${JSON.stringify(fixture)};
        const current=await EduQuestionBankRepository.read();
        if(current.courses.length||current.units.length||current.questions.length||current.exams.length)
          throw Error('Isolated question bank unexpectedly contains data; not overwriting.');
        window.__demoBank=await EduQuestionBankRepository.save(bank,current.revision);
        await EduQuestionBankUI.open();
      })()`);
      const saved = await evaluate(`EduQuestionBankRepository.read()`);
      const expected = { ...fixture, revision: saved.revision };
      check(
        "actual IndexedDB save and reread match",
        D.size(saved) === D.size(expected),
      );
      artifacts.set(
        "bank.json",
        JSON.stringify(D.validate(saved), null, 2) + "\n",
      );
      await evaluate(`(async()=>{
        document.querySelector('.qb-close').click();
        await EduQuestionBankUI.open();
      })()`);
      check(
        "saved courses survive UI close and reopen",
        await evaluate(
          `document.querySelector('.qb-toolbar select').options.length===3`,
        ),
      );
      const printDocuments = [];
      const sheets = [];
      for (const [index, course] of saved.courses.entries()) {
        await cdp("Emulation.setDeviceMetricsOverride", {
          width: 390,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await evaluate(`(()=>{
          const picker=document.querySelector('.qb-toolbar select');
          picker.value=${JSON.stringify(course.id)};
          picker.dispatchEvent(new Event('change',{bubbles:true}));
        })()`);
        check(
          "course renders eight questions and chapter/module context " +
            course.id,
          await evaluate(`(()=>{
            const label=document.querySelector('.qb-section-picker label');
            return document.querySelectorAll('.qb-question-row').length===8&&
              label.textContent.includes(${JSON.stringify(course.structure === "module" ? "پودمان" : "فصل")})&&
              document.querySelector('.qb-body').scrollWidth<=document.querySelector('.qb-body').clientWidth+1;
          })()`),
        );
        check(
          "persisted course has two of every question type " + course.id,
          await evaluate(`(async()=>{
            const bank=await EduQuestionBankRepository.read();
            const units=bank.units.filter(u=>u.courseId===${JSON.stringify(course.id)}).map(u=>u.id);
            return Object.keys(EduQuestionBank.types).every(type=>bank.questions.filter(q=>units.includes(q.unitId)&&q.type===type).length===2);
          })()`),
        );
        await delay(80);
        const screenshot = await cdp("Page.captureScreenshot", {
          format: "png",
        });
        artifacts.set(
          index === 0 ? "general-bank-390.png" : "modular-bank-390.png",
          Buffer.from(screenshot.data, "base64"),
        );
        const exam = saved.exams[index];
        // The real application print path supplies the stylesheet, offline font,
        // answer-free sheet and adaptive MCQ option sizing. Suppress only the OS
        // print dialog; capture its actual iframe before generating the PDF.
        const captured = await evaluate(`(async()=>{
          const exam=${JSON.stringify(exam)};
          const observer=new MutationObserver(()=>{
            const frame=document.querySelector('.qb-print-frame');
            if(frame)frame.contentWindow.print=()=>{};
          });
          observer.observe(document.body,{childList:true});
          try{
            await EduQuestionBankUI.print(exam);
            const frame=document.querySelector('.qb-print-frame');
            if(!frame)throw Error('Actual print iframe was not produced.');
            const doc=frame.contentDocument;
            const sheet=doc.querySelector('.qb-sheet');
            const text=doc.body.textContent;
            const result={
              html:'<!doctype html>'+doc.documentElement.outerHTML,
              sheet:sheet.outerHTML,
              count:sheet.querySelectorAll('.qb-sheet-question').length,
              noAnswers:!sheet.querySelector('.qb-solution')&&exam.questions.every(q=>!text.includes(q.explanation))
            };
            frame.remove();
            return result;
          }finally{observer.disconnect();}
        })()`);
        check(
          "native print sheet excludes answer key " + exam.id,
          captured.noAnswers && captured.count === 8,
        );
        sheets.push(captured.sheet);
        printDocuments.push(captured.html);
      }
      const navigation = await cdp("Page.getFrameTree");
      await cdp("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp("Emulation.setEmulatedMedia", { media: "print" });
      for (const [index, html] of printDocuments.entries()) {
        await cdp("Page.setDocumentContent", {
          frameId: navigation.frameTree.frame.id,
          html,
        });
        await evaluate(`(async()=>{
          for(let attempt=0;attempt<100;attempt++){
            if([...document.querySelectorAll('link[rel=stylesheet]')].every(link=>!!link.sheet))break;
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          await document.fonts.load('16px IRANSans');
          await document.fonts.ready;
          if(![...document.querySelectorAll('link[rel=stylesheet]')].every(link=>!!link.sheet))throw Error('Print stylesheet failed to load.');
          const sheet=document.querySelector('.qb-sheet');
          if(!sheet||getComputedStyle(sheet).display==='none'||sheet.getBoundingClientRect().height<300)throw Error('Missing or hidden exam sheet.');
        })()`);
        const pdf = await cdp("Page.printToPDF", {
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: false,
          paperWidth: 8.2677,
          paperHeight: 11.6929,
          marginTop: 0.59055,
          marginBottom: 0.59055,
          marginLeft: 0.59055,
          marginRight: 0.59055,
        });
        const bytes = Buffer.from(pdf.data, "base64");
        check(
          "native A4 PDF generated " + index,
          bytes.subarray(0, 5).toString() === "%PDF-" && bytes.length > 10000,
        );
        artifacts.set(
          index === 0 ? "general-exam.pdf" : "modular-exam.pdf",
          bytes,
        );
      }
      artifacts.set("teacher-answers.html", answerKey(saved));
      artifacts.set(
        "preview.html",
        page(
          "نمونهٔ آزمون عمومی و پودمانی",
          `<header class="demo-intro"><h1>نمونهٔ طرح سؤال و آزمون</h1><p>این سؤال‌ها تألیفی و صرفاً نمونهٔ آموزشی‌اند؛ سرفصل رسمی یا آزمون استانداردشده نیستند. هر درس ۸ سؤال، چهار نوع سؤال و بارم کل ۲۰ دارد. نمونه‌ها در پروفایل موقت مرورگر ثبت و دوباره خوانده شده‌اند؛ اطلاعات واقعی شما تغییر نکرده است.</p><nav class="demo-links" aria-label="دریافت نمونه‌ها"><a href="bank.json" download>فایل بانک سؤال JSON</a><a href="general-exam.pdf">PDF آزمون عمومی</a><a href="modular-exam.pdf">PDF آزمون پودمانی</a><a href="teacher-answers.html">پاسخ‌نامهٔ جداگانهٔ دبیر</a></nav></header>` +
            sheets
              .map(
                (sheet, index) =>
                  `<section class="demo-exam"><h2>${escape(saved.exams[index].title)}</h2>${sheet}</section>`,
              )
              .join(""),
        ),
      );
      const previewBase = await evaluate(
        "location.origin+'/edu-manager/docs/examples/question-bank/'",
      );
      await cdp("Emulation.setEmulatedMedia", { media: "" });
      await cdp("Page.setDocumentContent", {
        frameId: navigation.frameTree.frame.id,
        html: artifacts
          .get("preview.html")
          .replace("<head>", `<head><base href="${escape(previewBase)}">`),
      });
      await evaluate(`(async()=>{
        for(let attempt=0;attempt<100;attempt++){
          if([...document.querySelectorAll('link[rel=stylesheet]')].every(link=>!!link.sheet))break;
          await new Promise(resolve=>setTimeout(resolve,50));
        }
        if(![...document.querySelectorAll('link[rel=stylesheet]')].every(link=>!!link.sheet))throw Error('Preview stylesheet failed to load.');
        await document.fonts.ready;
      })()`);
      for (const width of [320, 390, 768, 1440]) {
        await cdp("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await delay(60);
        check(
          "standalone preview fits viewport " + width,
          await evaluate(`(()=>{
            const lists=[...document.querySelectorAll('.qb-sheet-options')];
            const expected=${width}<=700?2:null;
            return document.documentElement.scrollWidth<=innerWidth+1&&lists.length===4&&
              lists.every(list=>list.scrollWidth<=list.clientWidth+1&&(!expected||getComputedStyle(list).gridTemplateColumns.split(' ').length===expected));
          })()`),
        );
        if (width === 390) {
          await evaluate(
            "document.querySelector('.qb-sheet').scrollIntoView({block:'start'})",
          );
          const screenshot = await cdp("Page.captureScreenshot", {
            format: "png",
          });
          artifacts.set(
            "preview-390.png",
            Buffer.from(screenshot.data, "base64"),
          );
        }
      }
    },
  });
  if (process.exitCode)
    throw Error("Integrity audit failed; demo files were not written.");
  preserveExistingOutput();
  fs.mkdirSync(output, { recursive: true });
  for (const [name, content] of artifacts)
    fs.writeFileSync(path.join(output, name), content);
  const files = Object.fromEntries(
    [...artifacts].map(([name, content]) => [name, sha(content)]),
  );
  fs.writeFileSync(
    path.join(output, "generated-files.json"),
    JSON.stringify({ generator: marker, files }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      { output, files: [...artifacts.keys()], isolatedBrowser: true },
      null,
      2,
    ),
  );
}

if (require.main === module)
  generate().catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  });

module.exports = { generate, answerKey };
