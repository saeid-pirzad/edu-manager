"use strict";
const { main } = require("./data-integrity.cjs");
main({
  stage: "question-bank-sample",
  runExtra: async ({ evaluate, cases, delay, cdp }) => {
    const check = (name, pass) => {
      cases.push({ name, pass: !!pass });
      if (!pass) throw Error(name);
    };
    await require("./browser-ready.cjs")(
      { evaluate, delay, cdp },
      { marker: "__sampleReady" },
    );
    await evaluate(`(async()=>{
      closeModal();
      const current=await EduQuestionBankRepository.read();
      if(current.courses.length)throw Error('Expected isolated empty bank');
      const next=EduQuestionBank.empty();next.courses.push({id:'keep-me',title:'درس موجود',structure:'chapter'});
      await EduQuestionBankRepository.save(next,current.revision);
      await EduQuestionBankUI.open();
      window.__sampleClick=(text)=>{
        const button=[...document.querySelectorAll('.qb-page button')].find(b=>b.textContent===text);
        if(!button)throw Error(text);
        const menu=button.closest('.qb-entity-menu');
        if(menu&&!menu.matches(':popover-open'))document.querySelector('[aria-controls="'+menu.id+'"]').click();
        button.click();
      };
      __sampleClick('افزودن نمونهٔ یازدهم شبکه و نرم‌افزار');
    })()`);
    check(
      "sample confirmation is explicit and cancellation preserves data",
      await evaluate(`(async()=>{
      const shown=document.querySelector('.qb-confirm').textContent.includes('اطلاعات موجود حفظ می‌شود');
      __sampleClick('انصراف');const bank=await EduQuestionBankRepository.read();
      return shown&&bank.courses.length===1&&bank.questions.length===0;
    })()`),
    );
    await evaluate(
      `__sampleClick('افزودن نمونهٔ یازدهم شبکه و نرم‌افزار');__sampleClick('تأیید');`,
    );
    for (let n = 0; n < 100; n++) {
      if (
        await evaluate(
          `(async()=> (await EduQuestionBankRepository.read()).questions.length===24)()`,
        )
      )
        break;
      await delay(30);
    }
    check(
      "sample UI adds 24 questions and four exams without replacing the existing course",
      await evaluate(`(async()=>{
      const b=await EduQuestionBankRepository.read();
      return b.courses.length===3&&b.courses[0].id==='keep-me'&&b.questions.length===24&&b.exams.length===4&&document.querySelector('.qb-toolbar select').value==='net11-web';
    })()`),
    );
    await evaluate(
      `__sampleClick('افزودن نمونهٔ یازدهم شبکه و نرم‌افزار');__sampleClick('تأیید');`,
    );
    await delay(100);
    check(
      "duplicate activation changes neither revision nor record counts",
      await evaluate(`(async()=>{
      const b=await EduQuestionBankRepository.read();return b.revision===2&&b.questions.length===24&&b.exams.length===4;
    })()`),
    );
  },
});
