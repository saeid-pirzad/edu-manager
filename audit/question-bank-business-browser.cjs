"use strict";
// Business regressions run only against the shared harness's isolated browser.
// This never opens the user's profile or imports fixtures into their school data.
const { main } = require("./data-integrity.cjs");

main({
  stage: "question-bank-business",
  runExtra: async ({ evaluate, cases, delay }) => {
    const check = (name, result) => {
      const pass = result === true;
      cases.push({ name: `question bank business: ${name}`, pass });
      if (!pass) throw Error(`${name}: ${JSON.stringify(result)}`);
    };
    const waitFor = async (expression) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(expression)) return;
        await delay(30);
      }
      throw Error(`Timed out waiting for ${expression}`);
    };
    await evaluate(`(async()=>{
      closeModal();
      const D=EduQuestionBank, R=EduQuestionBankRepository, bank=D.empty();
      bank.courses=[
        {id:'business-a',title:'ریاضی نمونه',structure:'chapter'},
        {id:'business-b',title:'دانش فنی نمونه',structure:'module'}
      ];
      bank.units=[
        {id:'business-unit-a',courseId:'business-a',title:'فصل نخست'},
        {id:'business-unit-extra',courseId:'business-a',title:'فصل دوم'}
      ];
      bank.questions=Object.keys(D.types).map((type,index)=>({
        id:'business-question-'+index,unitId:'business-unit-a',type,
        text:'پرسش نمونه '+index,explanation:'SECRET-EXPLANATION-'+index,score:125,
        answer:type==='mcq'?2:type==='boolean'?false:'SECRET-ANSWER-'+index,
        ...(type==='mcq'?{options:['یک','دو','سه','چهار']}: {})
      }));
      bank.questions.push({
        id:'business-extra',unitId:'business-unit-extra',type:'essay',
        text:'پرسش فصل دوم',answer:'SECRET-EXTRA',explanation:'',score:100
      });
      bank.exams=[D.generate(bank,{
        courseId:'business-a',unitIds:['business-unit-a'],
        counts:{mcq:1,blank:1,essay:1,boolean:1},title:'آزمون نمونهٔ چهار نوع سؤال',
        school:'مدرسهٔ نمونه',teacher:'دبیر نمونه',date:'2026-11-17',duration:'۶۰'
      },()=>0.4)];
      window.__businessArchive=JSON.stringify(bank.exams);
      await R.save(bank,(await R.read()).revision);
      window.__qbBusiness={
        click(label,scope=document.querySelector('.qb-dialog')){
          const node=[...scope.querySelectorAll('button')].find(n=>(n.querySelector('.ui-button-label')?.textContent||n.textContent).trim()===label);
          if(!node)throw Error('Missing button: '+label);node.click();
        },
        field(label){
          const wrapper=[...document.querySelectorAll('.qb-dialog label')].find(n=>n.firstChild?.textContent===label);
          if(!wrapper)throw Error('Missing field: '+label);
          return wrapper.querySelector('input,select,textarea');
        },
        fill(label,value){
          const node=this.field(label);node.value=value;
          node.dispatchEvent(new Event('input',{bubbles:true}));return node;
        },
        chooseCourse(id){
          const node=document.querySelector('.qb-toolbar select');
          node.value=id;node.dispatchEvent(new Event('change',{bubbles:true}));
        },
        chooseUnit(id){
          const node=document.querySelector('.qb-section-picker select');
          node.value=id;node.dispatchEvent(new Event('change',{bubbles:true}));
        },
        confirm(){this.click('تأیید',document.querySelector('.qb-confirm'));},
        cancel(){this.click('انصراف',document.querySelector('.qb-confirm'));},
        submit(){document.querySelector('.qb-form').requestSubmit();}
      };
      await EduQuestionBankUI.open();__qbBusiness.chooseCourse('business-a');
      __qbBusiness.click('طرح آزمون');
    })()`);
    check(
      "zero-question aggregate exposes matching validity and aria state",
      await evaluate(`(()=>{
        const input=document.querySelector('.qb-count-field input');
        return !input.validity.valid&&input.getAttribute('aria-invalid')==='true';
      })()`),
    );
    await evaluate(
      `__qbBusiness.fill('عنوان آزمون','پیش‌نویس حفظ‌شده');__qbBusiness.chooseCourse('business-b');`,
    );
    check(
      "changing course with an unsaved plan requires confirmation",
      await evaluate(`!!document.querySelector('.qb-confirm')`),
    );
    await evaluate(`__qbBusiness.cancel()`);
    check(
      "cancelling a course switch restores the picker and keeps scope and draft",
      await evaluate(`(()=>{
        const picker=document.querySelector('.qb-toolbar select');
        const scope=document.querySelector('.qb-unit-selection');
        return picker.value==='business-a'&&scope.textContent.includes('فصل نخست')
          &&scope.textContent.includes('فصل دوم')
          &&__qbBusiness.field('عنوان آزمون').value==='پیش‌نویس حفظ‌شده'
          &&!document.querySelector('.qb-confirm');
      })()`),
    );
    await evaluate(
      `__qbBusiness.chooseCourse('business-b');__qbBusiness.confirm();__qbBusiness.click('سؤال‌ها');__qbBusiness.click('ویرایش درس');`,
    );
    check(
      "an empty course can correct its structure before sections exist",
      await evaluate(`!__qbBusiness.field('نوع درس').disabled`),
    );
    await evaluate(
      `__qbBusiness.fill('نوع درس','chapter');__qbBusiness.submit()`,
    );
    await waitFor(`!document.querySelector('.qb-form')`);
    check(
      "an empty course structure correction persists",
      await evaluate(
        `(async()=> (await EduQuestionBankRepository.read()).courses.find(c=>c.id==='business-b').structure==='chapter')()`,
      ),
    );
    await evaluate(
      `__qbBusiness.chooseCourse('business-a');__qbBusiness.click('ویرایش درس');`,
    );
    check(
      "a course with sections locks its structure",
      await evaluate(`__qbBusiness.field('نوع درس').disabled`),
    );
    await evaluate(
      `__qbBusiness.field('نوع درس').value='module';__qbBusiness.submit()`,
    );
    await waitFor(`!document.querySelector('.qb-form')`);
    check(
      "a tampered disabled structure cannot reinterpret existing sections",
      await evaluate(
        `(async()=> (await EduQuestionBankRepository.read()).courses.find(c=>c.id==='business-a').structure==='chapter')()`,
      ),
    );
    check(
      "the printed blank has response space and never includes secret answers",
      await evaluate(`(async()=>{
        const bank=await EduQuestionBankRepository.read();
        const sheet=EduQuestionBankUI.sheet(bank.exams[0]);
        const blank=bank.exams[0].questions.findIndex(q=>q.type==='blank');
        const row=sheet.querySelectorAll('.qb-sheet-question')[blank];
        return !!row.querySelector('.qb-short-answer')
          &&sheet.querySelectorAll('.qb-answer-space > span').length===4
          &&!sheet.textContent.includes('SECRET-');
      })()`),
    );
    check(
      "an authored inline blank is preserved without a duplicate response line",
      await evaluate(`(async()=>{
        const exam=structuredClone((await EduQuestionBankRepository.read()).exams[0]);
        exam.questions.find(q=>q.type==='blank').text='پاسخ صحیح را در ______ بنویسید.';
        const sheet=EduQuestionBankUI.sheet(exam);
        return !sheet.querySelector('.qb-short-answer')&&sheet.textContent.includes('______');
      })()`),
    );
    await evaluate(`(async()=>{__qbBusiness.chooseUnit('business-unit-a');__qbBusiness.click('افزودن سؤال');
      __qbBusiness.fill('متن سؤال','گزینه‌های هم‌ارز نباید ثبت شوند.');
      ['علي','علی','سه','چهار'].forEach((value,index)=>__qbBusiness.fill('گزینه '+(index+1),value));
      __qbBusiness.fill('پاسخ صحیح','0');
      window.__businessBeforeInvalid=JSON.stringify(await EduQuestionBankRepository.read());
      __qbBusiness.submit();})()`);
    await waitFor(
      `document.querySelector('.qb-message').getAttribute('role')==='alert'`,
    );
    check(
      "visually equivalent Arabic and Persian MCQ choices cannot be committed",
      await evaluate(`(async()=>{
        return JSON.stringify(await EduQuestionBankRepository.read())===__businessBeforeInvalid
          &&!!document.querySelector('.qb-question-form')
          &&document.querySelector('.qb-message').textContent.includes('گزینه');
      })()`),
    );
    await evaluate(`(async()=>{__qbBusiness.click('بازگشت');__qbBusiness.confirm();__qbBusiness.click('بستن');
      const bank=await EduQuestionBankRepository.read();
      bank.units.push({id:'business-unit-b',courseId:'business-b',title:'بخش مستقل'});
      bank.questions.push({id:'business-independent',unitId:'business-unit-b',type:'essay',text:'پرسش درس مستقل',answer:'پاسخ مستقل',explanation:'',score:100});
      await EduQuestionBankRepository.save(bank,bank.revision);
      await EduQuestionBankUI.open();__qbBusiness.chooseCourse('business-a');
      __qbBusiness.chooseUnit('business-unit-a');__qbBusiness.click('ویرایش فصل');})()`);
    await evaluate(`(async()=>{
      const bank=await EduQuestionBankRepository.read();
      bank.questions.push({id:'business-peer-unit',unitId:'business-unit-a',type:'essay',text:'ثبت هم‌زمان تازه',answer:'پاسخ تازه',explanation:'',score:100});
      await EduQuestionBankRepository.save(bank,bank.revision);
      window.__businessPeerUnit=JSON.stringify(await EduQuestionBankRepository.read());
      __qbBusiness.click('حذف فصل');
    })()`);
    check(
      "unit deletion preview names the section and preserves all data until confirmed",
      await evaluate(`(async()=>{
        const text=document.querySelector('.qb-confirm').textContent;
        return text.includes('فصل نخست')&&text.includes('آزمون')
          &&JSON.stringify(await EduQuestionBankRepository.read())===__businessPeerUnit;
      })()`),
    );
    await evaluate(`__qbBusiness.cancel()`);
    check(
      "cancelling section deletion preserves the section, questions and archive",
      await evaluate(
        `(async()=>JSON.stringify(await EduQuestionBankRepository.read())===__businessPeerUnit)()`,
      ),
    );
    await evaluate(`__qbBusiness.click('حذف فصل');__qbBusiness.confirm()`);
    await waitFor(
      `document.querySelector('.qb-message').textContent.includes('پنجره')`,
    );
    check(
      "stale section deletion cannot overwrite a concurrent question",
      await evaluate(
        `(async()=>JSON.stringify(await EduQuestionBankRepository.read())===__businessPeerUnit)()`,
      ),
    );
    await evaluate(`(async()=>{__qbBusiness.click('بستن');await EduQuestionBankUI.open();
      __qbBusiness.chooseCourse('business-a');__qbBusiness.chooseUnit('business-unit-a');
      __qbBusiness.click('ویرایش فصل');__qbBusiness.click('حذف فصل');__qbBusiness.confirm();})()`);
    await waitFor(`!document.querySelector('.qb-form')`);
    check(
      "confirmed section deletion cascades only its live questions and clears stale selection",
      await evaluate(`(async()=>{
        const bank=await EduQuestionBankRepository.read();
        return !bank.units.some(u=>u.id==='business-unit-a')
          &&!bank.questions.some(q=>q.unitId==='business-unit-a')
          &&bank.units.some(u=>u.id==='business-unit-extra')
          &&bank.questions.some(q=>q.id==='business-independent')
          &&document.querySelector('.qb-section-picker select').value===''
          &&JSON.stringify(bank.exams)===__businessArchive;
      })()`),
    );
    await evaluate(`(async()=>{__qbBusiness.click('ویرایش درس');
      const bank=await EduQuestionBankRepository.read();
      bank.questions.push({id:'business-peer-course',unitId:'business-unit-extra',type:'essay',text:'سؤال هم‌زمان فصل دیگر',answer:'پاسخ تازه',explanation:'',score:100});
      await EduQuestionBankRepository.save(bank,bank.revision);
      window.__businessPeerCourse=JSON.stringify(await EduQuestionBankRepository.read());
      __qbBusiness.click('حذف درس');})()`);
    check(
      "course deletion confirmation names the course and retains saved exams",
      await evaluate(`(()=>{
        const text=document.querySelector('.qb-confirm').textContent;
        return text.includes('ریاضی نمونه')&&text.includes('آزمون')&&text.includes('قابل برگشت نیست');
      })()`),
    );
    await evaluate(`__qbBusiness.cancel()`);
    check(
      "cancelling course deletion does not alter any stored bank data",
      await evaluate(
        `(async()=>JSON.stringify(await EduQuestionBankRepository.read())===__businessPeerCourse)()`,
      ),
    );
    await evaluate(`__qbBusiness.click('حذف درس');__qbBusiness.confirm()`);
    await waitFor(
      `document.querySelector('.qb-message').textContent.includes('پنجره')`,
    );
    check(
      "stale course deletion preserves concurrently committed questions and archive",
      await evaluate(
        `(async()=>JSON.stringify(await EduQuestionBankRepository.read())===__businessPeerCourse)()`,
      ),
    );
    await evaluate(`(async()=>{__qbBusiness.click('بستن');await EduQuestionBankUI.open();
      __qbBusiness.chooseCourse('business-a');__qbBusiness.click('ویرایش درس');
      __qbBusiness.click('حذف درس');__qbBusiness.confirm();})()`);
    await waitFor(`!document.querySelector('.qb-form')`);
    check(
      "confirmed course deletion cascades its sections and questions but not another course or exam snapshot",
      await evaluate(`(async()=>{
        const bank=await EduQuestionBankRepository.read();
        return bank.courses.length===1&&bank.courses[0].id==='business-b'
          &&bank.courses[0].structure==='chapter'
          &&bank.units.length===1&&bank.units[0].id==='business-unit-b'
          &&bank.questions.length===1&&bank.questions[0].id==='business-independent'
          &&JSON.stringify(bank.exams)===__businessArchive
          &&document.querySelector('.qb-toolbar select').value==='';
      })()`),
    );
    await evaluate(
      `__qbBusiness.click('آزمون‌ها');__qbBusiness.click('مشاهده آزمون')`,
    );
    check(
      "an archived four-type exam remains printable after deleting its source course",
      await evaluate(`document.querySelectorAll('.qb-sheet-question').length===4
        &&!!document.querySelector('.qb-short-answer')
        &&!document.querySelector('.qb-sheet').textContent.includes('SECRET-')`),
    );
  },
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 2;
});
