"use strict";
// Local review only. A separate origin keeps its IndexedDB apart from the app.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
require("../src/features/question-bank/domain.js");
const { applicationFiles } = require("./application-files.cjs");
const { createReviewBank } = require("./fixtures/question-bank-review.cjs");
const root = path.resolve(__dirname, "..");
function createReviewServer() {
  const files = applicationFiles(root);
  const bank = createReviewBank(globalThis.EduQuestionBank);
  const initialization = `window.addEventListener('load',async()=>{
    try{
      const R=EduQuestionBankRepository;
      const current=await R.read();
      if(!current.courses.length&&!current.units.length&&!current.questions.length&&!current.exams.length&&current.revision===0)
        await R.save(${JSON.stringify(bank)},0);
      if(new URLSearchParams(location.search).get('sample-exam')==='1'){
        const latest=await R.read();
        if(!latest.exams.some(exam=>exam.id==='review-user-sample-exam')){
          const sample=${JSON.stringify(bank.exams[0])};
          sample.id='review-user-sample-exam';
          sample.title='طرح سؤال نمونه — ریاضی کاربردی — ۲۰ نمره';
          sample.date='2026-11-17';
          latest.exams.unshift(sample);
          await R.save(latest,latest.revision);
        }
      }
      const notice=document.createElement('p');
      notice.textContent='محیط نمونهٔ مستقل — تغییرات شما در این نشانی نگه داشته می‌شود. اطلاعات برنامهٔ اصلی در این محیط نیست.';
      notice.style.cssText='padding:12px;margin:0;background:#fff3cd;color:#422006;text-align:center';
      document.body.prepend(notice);
      await EduQuestionBankUI.open();
      if(new URLSearchParams(location.search).get('sample-exam')==='1'){
        const buttons=[...document.querySelectorAll('.qb-dialog button')];
        buttons.find(button=>button.textContent.trim()==='آزمون‌ها')?.click();
      }
    }catch(error){const p=document.createElement('p');p.textContent=error.message;document.body.prepend(p);}
  });`;
  return http.createServer((request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    const name =
      new URL(request.url, "http://localhost").pathname.slice(1) ||
      "EduManager.html";
    response.setHeader("Cache-Control", "no-store");
    let body, type;
    if (name === "review-init.js") {
      body = initialization;
      type = "application/javascript; charset=utf-8";
    } else if (name === "bank-review.json") {
      body = JSON.stringify(bank, null, 2);
      type = "application/json; charset=utf-8";
    } else if (files.has(name) && name !== "service-worker.js") {
      body = fs.readFileSync(path.join(root, name));
      type = files.get(name);
      if (name === "EduManager.html" || name === "index.html") {
        body = fs
          .readFileSync(path.join(root, "EduManager.html"), "utf8")
          .replace(
            "</body>",
            '<script src="./review-init.js"></script></body>',
          );
      }
    } else {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader("Content-Type", type);
    response.end(request.method === "HEAD" ? undefined : body);
  });
}
if (require.main === module) {
  const server = createReviewServer();
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(
    Number(process.env.QUESTION_BANK_REVIEW_PORT || 4175),
    "127.0.0.1",
    () =>
      console.log(
        "Question bank review: http://127.0.0.1:" + server.address().port + "/",
      ),
  );
}
module.exports = { createReviewServer };
