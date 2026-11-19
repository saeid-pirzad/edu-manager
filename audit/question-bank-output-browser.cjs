"use strict";

// Synthetic output only: the shared harness uses a disposable browser profile.
// Capture the real print iframe before it closes, then rasterize its exact HTML.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { rasterizePdf } = require("./pdf-raster.cjs");

function createOutputExam() {
  const questions = [
    {
      type: "boolean",
      text: "این یک book است؟",
      answer: false,
      score: 125,
    },
    {
      type: "boolean",
      text: "A switch forwards Ethernet frames using MAC addresses.",
      answer: true,
      score: 75,
    },
    {
      type: "mcq",
      text: "Choose the correct HTML element.",
      options: ["<main>", "<aside>", "<footer>", "<article>"],
      answer: 0,
      score: 100,
    },
    {
      type: "mcq",
      text: "کدام گزینه، روش مناسب بررسی اتصال شبکه است؟",
      options: [
        "ابتدا اتصال فیزیکی و تنظیمات IP بررسی شود و سپس دسترسی به دروازه و سرویس مقصد با ابزار مناسب آزموده شود. ".repeat(
          2,
        ),
        "بدون ثبت نشانه‌ها، همه تنظیمات تجهیزات شبکه به حالت کارخانه بازگردانده شود. ".repeat(
          2,
        ),
        "Check the cable and the network adapter status before changing the IP configuration of the computer. ".repeat(
          2,
        ),
        "خط نخست بررسی\nخط دوم: اجرای ping و ثبت نتیجه برای دبیر",
      ],
      answer: 0,
      score: 200,
    },
    {
      type: "blank",
      text: "Name the protocol that resolves a domain name to an IP address.",
      answer: "PRIVATE-OUTPUT-ANSWER-DNS",
      score: 50,
    },
    {
      type: "blank",
      text: "نشانی پیش‌فرض دروازه در تنظیمات .............. ثبت می‌شود.",
      answer: "PRIVATE-OUTPUT-ANSWER-GATEWAY",
      score: 50,
    },
    {
      type: "essay",
      text: 'خروجی قطعه‌کد زیر چیست؟\nconst message = "سلام";\nconsole.log(message);\nconsole.log("Hello"); // نمایش نتیجه',
      answer: "PRIVATE-OUTPUT-ANSWER-CODE",
      score: 250,
    },
    {
      type: "mcq",
      text: "Select the most appropriate troubleshooting procedure.",
      options: [
        "Inspect the physical connection, record the configured address and gateway, and test each network layer separately. ".repeat(
          2,
        ),
        "Restart every device without recording the observed error or checking the link lights. ".repeat(
          2,
        ),
        "Change the subnet mask on all computers before testing the connection to the local gateway. ".repeat(
          2,
        ),
        "First inspect the cable.\nThen test the configured gateway with ping.",
      ],
      answer: 0,
      score: 200,
    },
  ];
  for (let i = 0; i < 24; i++) {
    questions.push({
      type: i % 3 === 0 ? "essay" : i % 3 === 1 ? "blank" : "boolean",
      text:
        i % 2 === 0
          ? `AUDIT-Q${String(i + 9).padStart(3, "0")} — روش عیب‌یابی ارتباط رایانه و دروازه را توضیح دهید. برای هر گام یک نتیجه قابل مشاهده بنویسید.`
          : `AUDIT-Q${String(i + 9).padStart(3, "0")} — Explain how you would verify the local network connection and record the observed result.`,
      answer: i % 3 === 2 ? false : "PRIVATE-OUTPUT-ANSWER-" + i,
      score: 25 + (i % 4) * 25,
    });
  }
  questions.push({
    type: "essay",
    text:
      "سناریوی بلند برای کنترل ادامهٔ سؤال در صفحهٔ بعد:\n" +
      "هنرجو باید مراحل بررسی تنظیمات IP، دروازه و سرویس مقصد را به ترتیب ثبت کند و برای هر گام نتیجهٔ قابل مشاهده بنویسد. ".repeat(
        45,
      ),
    answer: "PRIVATE-OUTPUT-ANSWER-OVERSIZE",
    score: 100,
  });
  return {
    id: "synthetic-output-audit",
    title: "ممیزی خروجی دوزبانه — یازدهم شبکه و نرم‌افزار",
    courseTitle: "طراحی وب و شبکه — آزمایشی",
    school: "هنرستان آزمایشی؛ دادهٔ ساختگی",
    teacher: "دبیر آزمایشی",
    date: "2026-11-19",
    duration: 90,
    questions: questions.map((question, index) => ({
      id: "output-audit-" + index,
      explanation: "PRIVATE-OUTPUT-EXPLANATION-" + index,
      ...question,
    })),
  };
}

async function run(env) {
  const { cdp, evaluate, cases, delay } = env;
  const check = (id, name, pass, observed) =>
    cases.push({ id, name, pass: pass === true, observed });
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-question-output-"),
  );
  const exam = createOutputExam();
  const documents = [];
  const pageCounts = [];
  await require("./browser-ready.cjs")(env);
  try {
    const errorCleanup = await evaluate(`(async()=>{
      let rejected=false;
      try{await EduQuestionBankUI.print({...${JSON.stringify(exam)},date:'not-a-date'});}
      catch{rejected=true;}
      return {rejected,cleaned:!document.querySelector('.qb-print-frame')};
    })()`);
    check(
      "QB_OUTPUT_ERROR_CLEANUP",
      "A failed output preparation rejects cleanly and removes its iframe",
      errorCleanup.rejected && errorCleanup.cleaned,
      errorCleanup,
    );
    for (const width of [390, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 700,
      });
      const prepared = await evaluate(`(async()=>{
        const exam=${JSON.stringify(exam)};
        const before=JSON.stringify(await EduQuestionBankRepository.read());
        const original=document.getElementById('app').innerHTML;
        let capture=null;
        const observer=new MutationObserver(()=>{
          const frame=document.querySelector('.qb-print-frame');
          if(!frame||frame.dataset.auditIntercepted)return;
          frame.dataset.auditIntercepted='true';
          frame.contentWindow.print=()=>{
            const doc=frame.contentDocument,view=frame.contentWindow;
            const rows=[...doc.querySelectorAll('.qb-sheet-question')];
            const bounds=node=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width,top:b.top,bottom:b.bottom};};
            const prompts=rows.map(row=>{
              const prompt=row.querySelector('.qb-sheet-prompt p');
              return {dir:prompt.dir,text:prompt.textContent,number:row.querySelector('.qb-sheet-number').textContent,
                box:bounds(prompt),score:bounds(row.querySelector('.qb-sheet-score')),
                lines:[...prompt.querySelectorAll('.qb-sheet-line')].map(line=>({text:line.textContent,dir:view.getComputedStyle(line).direction}))};
            });
            const options=rows.flatMap((row,index)=>{
              const list=row.querySelector('.qb-sheet-options');if(!list)return [];
              return [{index,dir:list.dir,columns:list.dataset.columns,box:bounds(list),items:[...list.children].map(item=>bounds(item)),
                labels:[...list.children].map(item=>{const label=item.firstElementChild,range=doc.createRange();range.selectNodeContents(label);const box=range.getBoundingClientRect();return {text:label.textContent,box:{top:box.top,bottom:box.bottom},lineHeight:parseFloat(view.getComputedStyle(label).lineHeight)};}),
                texts:[...list.children].map(item=>item.textContent)}];
            });
            const answer=rows[4].querySelector('.qb-short-answer');
            capture={html:'<!doctype html>'+doc.documentElement.outerHTML,text:doc.body.textContent,prompts,options,
              answer:{text:answer.textContent,dir:view.getComputedStyle(answer).direction},body:bounds(doc.body)};
            view.dispatchEvent(new Event('afterprint'));
          };
        });
        observer.observe(document.body,{childList:true});
        try{await EduQuestionBankUI.print(exam);}finally{observer.disconnect();}
        if(!capture)throw Error('The actual print iframe was not captured');
        capture.unchanged=before===JSON.stringify(await EduQuestionBankRepository.read())&&original===document.getElementById('app').innerHTML;
        capture.cleaned=!document.querySelector('.qb-print-frame');
        return capture;
      })()`);
      const { html, ...observed } = prepared;
      documents.push({ width, html });
      const prefix = "QB_OUTPUT_" + width + "_";
      check(
        prefix + "DATA",
        "Print document retains all synthetic questions without answer leakage",
        prepared.prompts.length === exam.questions.length &&
          !prepared.text.includes("PRIVATE-OUTPUT-") &&
          prepared.unchanged &&
          prepared.cleaned,
        {
          rows: prepared.prompts.length,
          unchanged: prepared.unchanged,
          cleaned: prepared.cleaned,
          leaked: prepared.text.includes("PRIVATE-OUTPUT-"),
        },
      );
      check(
        prefix + "DIRECTIONS",
        "Persian prompts and English inline numbering keep their own directions",
        prepared.prompts[0].dir === "rtl" &&
          prepared.prompts[0].number === "۱." &&
          prepared.prompts[1].dir === "ltr" &&
          prepared.prompts[1].number === "" &&
          prepared.prompts[1].text.startsWith("2. A switch") &&
          prepared.prompts[2].text.startsWith("3. Choose"),
        prepared.prompts.slice(0, 3),
      );
      check(
        prefix + "CODE",
        "Executable code remains LTR even with Persian strings and comments",
        prepared.prompts[6].lines.map((line) => line.dir).join(",") ===
          "rtl,ltr,ltr,ltr",
        prepared.prompts[6].lines,
      );
      check(
        prefix + "BLANK",
        "English short-answer space uses an English LTR label",
        prepared.answer.dir === "ltr" &&
          prepared.answer.text.startsWith("Answer:"),
        prepared.answer,
      );
      check(
        prefix + "OPTION_LABELS",
        "Persian and English option labels never shrink into multiple lines",
        prepared.options.every((list) =>
          list.labels.every(
            (label) => label.box.bottom - label.box.top <= label.lineHeight + 1,
          ),
        ),
        prepared.options.map(({ index, labels }) => ({ index, labels })),
      );
      check(
        prefix + "OPTIONS",
        "Long options stack and all options remain inside the prompt, outside scores",
        prepared.options.every((list) => {
          const prompt = prepared.prompts[list.index].box;
          return (
            list.box.left >= prompt.left - 1 &&
            list.box.right <= prompt.right + 1 &&
            list.items.every(
              (item) =>
                item.left >= prompt.left - 1 && item.right <= prompt.right + 1,
            ) &&
            (list.index === 3 || list.index === 7
              ? list.columns === "1" &&
                list.items.every(
                  (item, index, items) =>
                    !index || item.top >= items[index - 1].bottom - 1,
                )
              : list.items[0].left < list.items[3].left)
          );
        }),
        prepared.options,
      );
      fs.writeFileSync(
        path.join(directory, "print-layout-" + width + ".json"),
        JSON.stringify(observed, null, 2) + "\n",
      );
      fs.writeFileSync(path.join(directory, "print-" + width + ".html"), html);
    }

    // No rerendering or alternate hand-written output: use the captured document.
    for (const { width, html } of documents) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evaluate(
        "document.open();document.write(" +
          JSON.stringify(html) +
          ");document.close();true",
      );
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate("document.readyState==='complete'")) break;
        await delay(30);
      }
      await evaluate(
        "(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true})()",
      );
      const pdf = await cdp("Page.printToPDF", {
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: false,
      });
      const file = path.join(directory, "exam-" + width + ".pdf");
      const bytes = Buffer.from(pdf.data, "base64");
      fs.writeFileSync(file, bytes);
      const raster = rasterizePdf(
        file,
        path.join(directory, "raster-" + width),
        1000,
      );
      pageCounts.push(raster.pageCount);
      check(
        "QB_OUTPUT_" + width + "_PDF",
        "Native PDF raster has nonblank A4 pages within printable margins",
        bytes.subarray(0, 5).toString() === "%PDF-" &&
          raster.pageCount >= 3 &&
          raster.pageCount <= 15 &&
          raster.pages.every(
            (page) =>
              Math.abs(page.widthPoints - 595.28) < 2 &&
              Math.abs(page.heightPoints - 841.89) < 2 &&
              page.ink.inkPixels > 1000 &&
              ["topMargin", "bottomMargin", "leftMargin", "rightMargin"].every(
                (key) => page.ink[key] >= 15,
              ),
          ),
        raster,
      );
    }
    check(
      "QB_OUTPUT_PAGINATION",
      "Print documents prepared on mobile and desktop have identical pagination",
      pageCounts.length === 2 && pageCounts[0] === pageCounts[1],
      pageCounts,
    );
  } finally {
    console.log("Question bank output audit artifacts: " + directory);
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    await cdp("Emulation.clearDeviceMetricsOverride");
  }
}

module.exports = { run, createOutputExam };
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "question-bank-output", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
