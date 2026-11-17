"use strict";
// Business regressions run only against the shared harness's isolated browser.
// This never opens the user's profile or imports fixtures into their school data.
const { main } = require("./data-integrity.cjs");

main({
  stage: "question-bank-business",
  runExtra: async ({ evaluate, cases, delay, cdp }) => {
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
    // The shared audit deliberately leaves its classroom view stale. Reload it
    // before exercising the real update guard with a valid current workspace.
    await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    await waitFor(
      `!!window.EduQuestionBankUI&&!!window.EduQuestionBankRepository`,
    );
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
      bank.questions[0].options=['ی','ي','A','a'];
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
        click(label,scope=document.querySelector('.qb-page')){
          if(label==='بستن'){goSchools();return;}
          const node=[...scope.querySelectorAll('button')].find(n=>(n.querySelector('.ui-button-label')?.textContent||n.textContent).trim()===label);
          if(!node)throw Error('Missing button: '+label);const menu=node.closest('.qb-entity-menu');if(menu&&!menu.matches(':popover-open'))document.querySelector('[aria-controls="'+menu.id+'"]').click();node.click();
        },
        field(label){
          const wrapper=[...document.querySelectorAll('.qb-page label')].find(n=>n.firstChild?.textContent===label);
          if(!wrapper)throw Error('Missing field: '+label);
          return wrapper.querySelector('input,select,textarea');
        },
        fill(label,value){
          const node=this.field(label);node.value=value;
          node.dispatchEvent(new Event('input',{bubbles:true}));return node;
        },
        chooseCourse(id){
          const node=document.querySelector('.qb-toolbar select');
          node.value=id;node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));
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
      __qbBusiness.click('طراحی آزمون');
    })()`);
    check(
      "the bank is a main content page with one active entry and five mobile navigation targets",
      await evaluate(`(()=>{
        const page=document.querySelector('#questionBankPageHost > .qb-page');
        return !!page&&page.tagName==='SECTION'&&!page.matches(':modal')
          &&!document.querySelector('.qb-dialog,.qb-close')
          &&document.querySelectorAll('.topbar .question-bank-entry').length===1
          &&!!document.querySelector('.topbar [data-header-action="question-bank"][aria-current="page"]')
          &&document.querySelectorAll('#uiBottomNav > button').length===5
          &&!!document.querySelector('#uiBottomNav [data-view="question-bank"][aria-current="page"]')
          &&!document.querySelector('.workspace-tools .question-bank-entry');
      })()`),
    );
    check(
      "the bank keeps exactly its selected tab active after application enhancement",
      await evaluate(`(async()=>{
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const tabs=[...document.querySelectorAll('.qb-page .qb-tabs > button')];
        const selected=tabs.filter(button=>button.getAttribute('aria-pressed')==='true');
        return tabs.length===3&&selected.length===1&&selected[0].textContent.trim()==='طراحی آزمون'
          &&tabs.filter(button=>button.getAttribute('aria-pressed')==='false').length===2;
      })()`),
    );
    check(
      "an untouched bank form permits unloading and update preparation",
      await evaluate(`(async()=>{
        const event=new Event('beforeunload',{cancelable:true});dispatchEvent(event);
        return !EduQuestionBankUI.hasPendingChanges()&&!event.defaultPrevented&&await EduV24.prepareForUpdate()===true;
      })()`),
    );
    check(
      "an unsaved bank plan blocks unloading and update without discarding its draft",
      await evaluate(`(async()=>{
        const before=JSON.stringify(await EduQuestionBankRepository.read());
        __qbBusiness.fill('عنوان آزمون','پیش‌نویس آزمون برای بررسی خروج');
        const event=new Event('beforeunload',{cancelable:true});dispatchEvent(event);
        let blocked=false;try{await EduV24.prepareForUpdate();}catch(e){blocked=e.message.includes('ویرایش ذخیره‌نشده');}
        return EduQuestionBankUI.hasPendingChanges()&&event.defaultPrevented&&blocked
          &&__qbBusiness.field('عنوان آزمون').value==='پیش‌نویس آزمون برای بررسی خروج'
          &&JSON.stringify(await EduQuestionBankRepository.read())===before;
      })()`),
    );
    check(
      "unrelated application rerenders preserve the same bank form, values, focus and course selection",
      await evaluate(`(async()=>{
        const page=document.querySelector('.qb-page'),form=document.querySelector('.qb-form');
        const title=__qbBusiness.field('عنوان آزمون');title.focus({preventScroll:true});
        title.scrollIntoView({block:'center',behavior:'instant'});
        const beforeScroll={left:scrollX,top:scrollY};
        const value=title.value,course=document.querySelector('.qb-toolbar select').value;
        render();render();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const observed={page:document.querySelector('.qb-page')===page,form:document.querySelector('.qb-form')===form,
          input:__qbBusiness.field('عنوان آزمون')===title,value:title.value===value,
          focus:document.activeElement===title,course:document.querySelector('.qb-toolbar select').value===course,
          horizontalScroll:Math.abs(scrollX-beforeScroll.left)<=1,verticalScroll:Math.abs(scrollY-beforeScroll.top)<=1,
          pending:EduQuestionBankUI.hasPendingChanges()};
        if(!Object.values(observed).every(Boolean))throw Error(JSON.stringify({observed,beforeScroll,afterScroll:{left:scrollX,top:scrollY},pageTop:page.getBoundingClientRect().top,formHeight:form.getBoundingClientRect().height}));
        return document.querySelector('.qb-page')===page&&document.querySelector('.qb-form')===form
          &&__qbBusiness.field('عنوان آزمون')===title&&title.value===value
          &&document.activeElement===title&&document.querySelector('.qb-toolbar select').value===course
          &&Math.abs(scrollX-beforeScroll.left)<=1&&Math.abs(scrollY-beforeScroll.top)<=1
          &&EduQuestionBankUI.hasPendingChanges();
      })()`),
    );
    check(
      "application rerenders preserve bank document scrolling while focus is outside the editor",
      await evaluate(`(async()=>{
        const title=__qbBusiness.field('عنوان آزمون'),form=document.querySelector('.qb-form');
        title.scrollIntoView({block:'center',behavior:'instant'});
        document.querySelector('.topbar [data-header-action="reports"]').focus({preventScroll:true});
        const beforeScroll={left:scrollX,top:scrollY};
        render();render();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return document.querySelector('.qb-form')===form&&title.isConnected
          &&Math.abs(scrollX-beforeScroll.left)<=1&&Math.abs(scrollY-beforeScroll.top)<=1
          &&EduQuestionBankUI.hasPendingChanges();
      })()`),
    );
    check(
      "application enhancement preserves the selected bank tab after global rerenders",
      await evaluate(`(async()=>{
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const tabs=[...document.querySelectorAll('.qb-page .qb-tabs > button')];
        const selected=tabs.filter(button=>button.getAttribute('aria-pressed')==='true');
        return tabs.length===3&&selected.length===1&&selected[0].textContent.trim()==='طراحی آزمون'
          &&tabs.filter(button=>button.getAttribute('aria-pressed')==='false').length===2;
      })()`),
    );
    check(
      "inline confirmation survives rerenders and Escape preserves the bank draft, route and stored data",
      await evaluate(`(async()=>{
        const before=JSON.stringify(await EduQuestionBankRepository.read());
        const page=document.querySelector('.qb-page'),title=__qbBusiness.field('عنوان آزمون'),value=title.value;
        title.focus({preventScroll:true});title.setSelectionRange(3,8);
        document.querySelector('.topbar [data-header-action="reports"]').click();
        const confirmation=document.querySelector('.qb-confirm');
        const cancel=[...confirmation.querySelectorAll('button')].find(button=>button.textContent.trim()==='انصراف');
        const guarded=confirmation?.parentElement===page&&confirmation.tagName==='SECTION'
          &&confirmation.getAttribute('role')==='region'&&!confirmation.hasAttribute('aria-modal')
          &&!document.querySelector('dialog:modal')&&state.view==='question-bank'
          &&page.querySelector('.qb-body').inert&&!page.querySelector('.qb-storage-bar')
          &&document.activeElement===cancel;
        render();render();goSchools();
        const retained=document.querySelector('.qb-confirm')===confirmation
          &&document.querySelectorAll('.qb-confirm').length===1&&document.activeElement===cancel
          &&document.querySelector('.qb-page')===page&&__qbBusiness.field('عنوان آزمون')===title;
        cancel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
        return guarded&&!document.querySelector('.qb-confirm')&&state.view==='question-bank'
          &&retained&&document.querySelector('.qb-page')===page&&title.value===value&&title.isConnected
          &&!page.querySelector('.qb-body').inert&&!page.querySelector('.qb-storage-bar')
          &&document.activeElement===title&&title.selectionStart===3&&title.selectionEnd===8
          &&JSON.stringify(await EduQuestionBankRepository.read())===before;
      })()`),
    );
    await evaluate(`(async()=>{
      __qbBusiness.click('بستن');__qbBusiness.confirm();
    })()`);
    check(
      "an active bank file write blocks unloading and updates after leaving the bank page",
      await evaluate(`(async()=>{
        const service=EduQuestionBankFileBackup.service,state=service.state;
        try{
          service.state=()=>({...state(),state:'busy'});
          const event=new Event('beforeunload',{cancelable:true});dispatchEvent(event);
          let blocked=false;try{await EduV24.prepareForUpdate();}catch(e){blocked=e.message.includes('ویرایش ذخیره‌نشده');}
          return !document.querySelector('.qb-page')&&EduQuestionBankUI.hasPendingChanges()&&event.defaultPrevented&&blocked;
        }finally{service.state=state;}
      })()`),
    );
    await evaluate(`(async()=>{
      await EduQuestionBankUI.open();
      __qbBusiness.chooseCourse('business-a');__qbBusiness.click('ویرایش درس');
      const repository=EduQuestionBankRepository;
      window.__businessSaveOriginal=repository.save;
      window.__businessBeforeFailedSave=JSON.stringify(await repository.read());
      repository.save=()=>new Promise((_resolve,reject)=>{window.__businessRejectSave=()=>reject(Error('آزمون شکست ذخیرهٔ بانک'));});
      __qbBusiness.submit();
    })()`);
    check(
      "a pending bank commit blocks unloading and updates even without edited inputs",
      await evaluate(`(async()=>{
        const event=new Event('beforeunload',{cancelable:true});dispatchEvent(event);
        let blocked=false;try{await EduV24.prepareForUpdate();}catch(e){blocked=e.message.includes('ویرایش ذخیره‌نشده');}
        return EduQuestionBankUI.hasPendingChanges()&&event.defaultPrevented&&blocked
          &&document.querySelector('.qb-page').getAttribute('aria-busy')==='true';
      })()`),
    );
    check(
      "navigation during a bank commit preserves the route and editor until the save settles",
      await evaluate(`(()=>{
        const page=document.querySelector('.qb-page'),form=document.querySelector('.qb-form');
        document.querySelector('#uiBottomNav [data-view="schools"]').click();
        return state.view==='question-bank'&&document.querySelector('.qb-page')===page
          &&document.querySelector('.qb-form')===form&&!document.querySelector('.qb-confirm')
          &&page.getAttribute('aria-busy')==='true';
      })()`),
    );
    await evaluate(`__businessRejectSave()`);
    await waitFor(
      `document.querySelector('.qb-page').getAttribute('aria-busy')!=='true'`,
    );
    check(
      "a failed bank save retains editable form values and never changes the stored bank",
      await evaluate(`(async()=>{
        try{
          EduQuestionBankRepository.save=async()=>{throw Error('آزمون شکست ذخیرهٔ بانک');};
          __qbBusiness.fill('عنوان درس','متن حفظ‌شده پس از خطای ذخیره');__qbBusiness.submit();
          await new Promise(r=>setTimeout(r,30));
          return __qbBusiness.field('عنوان درس').value==='متن حفظ‌شده پس از خطای ذخیره'
            &&!document.querySelector('.qb-body').inert&&EduQuestionBankUI.hasPendingChanges()
            &&document.querySelector('.qb-message').textContent.includes('شکست ذخیره')
            &&JSON.stringify(await EduQuestionBankRepository.read())===__businessBeforeFailedSave;
        }finally{EduQuestionBankRepository.save=__businessSaveOriginal;}
      })()`),
    );
    check(
      "a new validation failure remains visible after a storage failure",
      await evaluate(`(async()=>{
        __qbBusiness.fill('عنوان درس','');__qbBusiness.submit();await new Promise(r=>setTimeout(r,30));
        const text=document.querySelector('.qb-message').textContent;
        return text.includes('عنوان خالی یا تکراری')&&text.includes('شکست ذخیره')
          &&JSON.stringify(await EduQuestionBankRepository.read())===__businessBeforeFailedSave;
      })()`),
    );
    await evaluate(`(async()=>{
      __qbBusiness.click('بستن');__qbBusiness.confirm();await EduQuestionBankUI.open();
      __qbBusiness.chooseCourse('business-a');__qbBusiness.click('درس جدید');
      __qbBusiness.fill('عنوان درس','ریاضی نمونه');__qbBusiness.submit();
    })()`);
    await waitFor(
      `document.querySelector('.qb-message').textContent.includes('عنوان خالی یا تکراری')`,
    );
    check(
      "a duplicate course error clears when its form is discarded and a new course starts",
      await evaluate(`(()=>{
        __qbBusiness.click('بازگشت');__qbBusiness.confirm();__qbBusiness.click('درس جدید');
        return document.querySelector('.qb-message').hidden&&__qbBusiness.field('عنوان درس').value==='';
      })()`),
    );
    await evaluate(`__qbBusiness.click('بازگشت');__qbBusiness.click('بانک سؤال');__qbBusiness.chooseUnit('business-unit-a');
      __qbBusiness.click('فصل جدید');__qbBusiness.fill('عنوان فصل','فصل نخست');__qbBusiness.submit();`);
    await waitFor(
      `document.querySelector('.qb-message').textContent.includes('عنوان خالی یا تکراری')`,
    );
    check(
      "a duplicate section error clears before a new section form starts",
      await evaluate(`(()=>{
        __qbBusiness.click('بازگشت');__qbBusiness.confirm();__qbBusiness.click('فصل جدید');
        return document.querySelector('.qb-message').hidden&&__qbBusiness.field('عنوان فصل').value==='';
      })()`),
    );
    await evaluate(
      `__qbBusiness.click('بازگشت');__qbBusiness.click('طراحی آزمون');`,
    );
    const recoveredNotice = await evaluate(`(async()=>{
      __qbBusiness.click('بستن');
      const service=EduQuestionBankFileBackup.service,repository=EduQuestionBankRepository;
      const methods=['subscribe','init','state','supported'],original=Object.fromEntries(methods.map(key=>[key,service[key]]));
      const originalSave=repository.save,listeners=new Set();
      let state={state:'permission',connected:true,message:'FILE-PERMISSION-PROBE'};
      const emit=(next)=>{state=next;for(const listener of listeners)listener(state);};
      const settled=async()=>{for(let i=0;i<100&&document.querySelector('.qb-page').getAttribute('aria-busy')==='true';i++)await new Promise(r=>setTimeout(r,10));};
      service.subscribe=listener=>{listeners.add(listener);listener(state);return()=>listeners.delete(listener);};
      service.init=async()=>{};service.state=()=>state;service.supported=()=>true;
      try{
        await EduQuestionBankUI.open();__qbBusiness.chooseCourse('business-a');__qbBusiness.click('ویرایش درس');__qbBusiness.submit();await settled();
        const warningShown=document.querySelector('.qb-message').textContent.includes('FILE-PERMISSION-PROBE');
        emit({state:'active',connected:true,message:'FILE-ACTIVE-PROBE'});
        const activeClears=warningShown&&document.querySelector('.qb-message').hidden;
        emit({state:'permission',connected:true,message:'FILE-PERMISSION-PROBE'});
        __qbBusiness.click('ویرایش درس');__qbBusiness.submit();await settled();
        __qbBusiness.click('ویرایش درس');__qbBusiness.fill('عنوان درس','');__qbBusiness.submit();await settled();
        emit({state:'active',connected:true,message:'FILE-ACTIVE-PROBE'});
        const validationPreserved=!document.querySelector('.qb-message').hidden
          &&document.querySelector('.qb-message').textContent.includes('عنوان خالی یا تکراری')
          &&!document.querySelector('.qb-message').textContent.includes('FILE-PERMISSION-PROBE');
        __qbBusiness.click('بازگشت');__qbBusiness.confirm();
        emit({state:'permission',connected:true,message:'FILE-PERMISSION-PROBE'});
        __qbBusiness.click('ویرایش درس');__qbBusiness.submit();await settled();
        emit({state:'inactive',connected:false,message:'FILE-DISCONNECTED-PROBE'});
        const inactiveClears=document.querySelector('.qb-message').hidden;
        __qbBusiness.click('ویرایش درس');repository.save=async()=>{throw Error('DATA-SAVE-FAILURE-PROBE');};
        __qbBusiness.submit();await settled();
        emit({state:'active',connected:true,message:'FILE-ACTIVE-PROBE'});
        const saveFailurePreserved=!document.querySelector('.qb-message').hidden
          &&document.querySelector('.qb-message').textContent.includes('DATA-SAVE-FAILURE-PROBE');
        return {activeClears,validationPreserved,inactiveClears,saveFailurePreserved};
      }finally{
        repository.save=originalSave;
        __qbBusiness.click('بستن');if(document.querySelector('.qb-confirm'))__qbBusiness.confirm();
        for(const key of methods)service[key]=original[key];
      }
    })()`);
    check(
      "file permission recovery clears its obsolete post-commit warning",
      recoveredNotice.activeClears,
    );
    check(
      "file recovery preserves a current unrelated form validation error",
      recoveredNotice.validationPreserved,
    );
    check(
      "disconnecting the bank file clears its obsolete post-commit warning",
      recoveredNotice.inactiveClears,
    );
    check(
      "file recovery never clears an independent failed bank save warning",
      recoveredNotice.saveFailurePreserved,
    );
    await evaluate(`(async()=>{
      await EduQuestionBankUI.open();__qbBusiness.chooseCourse('business-a');__qbBusiness.click('طراحی آزمون');
    })()`);
    await evaluate(
      `(()=>{const n=document.querySelector('.qb-count-field input');n.focus();n.click();})()`,
    );
    await cdp("Input.insertText", { text: "1" });
    check(
      "typing a new count replaces the selected default zero",
      await evaluate(
        `document.querySelector('.qb-count-field input').value==='1'`,
      ),
    );
    await evaluate(`(async()=>{
      window.__targetBefore=JSON.stringify(await EduQuestionBankRepository.read());
      __qbBusiness.click('انتخاب همه');
      for(const label of ['چهارگزینه‌ای','جای‌خالی','تشریحی','صحیح / غلط'])__qbBusiness.fill('تعداد '+label,'1');
      __qbBusiness.fill('نمرهٔ کل آزمون','20');__qbBusiness.fill('عنوان آزمون','هدف ناممکن');__qbBusiness.submit();
    })()`);
    await waitFor(`!document.querySelector('.qb-message').hidden`);
    check(
      "an impossible target score shows an error and saves no partial exam",
      await evaluate(
        `(async()=>document.querySelector('.qb-message').textContent.includes('ترکیبی')&&JSON.stringify(await EduQuestionBankRepository.read())===__targetBefore)()`,
      ),
    );
    await evaluate(
      `(async()=>{__qbBusiness.click('بستن');__qbBusiness.confirm();await EduQuestionBankUI.open();__qbBusiness.chooseCourse('business-a');__qbBusiness.click('طراحی آزمون');})()`,
    );
    check(
      "empty composition does not mark the first type red and cannot create an exam",
      await evaluate(`(()=>{
        const input=document.querySelector('.qb-count-field input');
        return input.validity.valid&&input.getAttribute('aria-invalid')==='false'&&!document.querySelector('.qb-target-score input').validity.valid;
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
      `__qbBusiness.chooseCourse('business-b');__qbBusiness.confirm();__qbBusiness.click('بانک سؤال');__qbBusiness.chooseCourse('business-b');__qbBusiness.click('ویرایش درس');`,
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
      "question entry follows course then section selection before enabling add, independently of search",
      await evaluate(`(()=>{
      __qbBusiness.chooseUnit('');
      const findAdd=()=>[...document.querySelectorAll('.qb-question-entry button')].find(b=>b.textContent.trim()==='افزودن سؤال');
      const initiallyDisabled=findAdd().disabled;
      __qbBusiness.chooseUnit('business-unit-a');
      const entry=document.querySelector('.qb-question-entry');
      const search=document.querySelector('.qb-question-controls');
      const ordered=!!(entry.compareDocumentPosition(search)&Node.DOCUMENT_POSITION_FOLLOWING);
      const enabled=!findAdd().disabled;
      __qbBusiness.click('افزودن سؤال');
      const selected=__qbBusiness.field('فصل').value==='business-unit-a';
      __qbBusiness.click('بازگشت');
      return initiallyDisabled&&enabled&&ordered&&selected;
    })()`),
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
    await evaluate(
      `__qbBusiness.click('بازگشت');__qbBusiness.confirm();__qbBusiness.click('افزودن سؤال');`,
    );
    check(
      "leaving an invalid question clears its obsolete error before a new question is entered",
      await evaluate(
        `document.querySelector('.qb-message').hidden&&!!document.querySelector('.qb-question-form')`,
      ),
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 667,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(80);
    await evaluate(`__qbBusiness.click('بازگشت');
      document.querySelector('.qb-question-row summary').click();__qbBusiness.click('ویرایش سؤال');
      __qbBusiness.fill('متن سؤال','اصلاح متن سؤال قدیمی بدون تغییر گزینه‌ها');
      document.querySelector('.qb-form button[type=submit]').scrollIntoView({block:'center',behavior:'instant'});
      __qbBusiness.submit();`);
    await waitFor(`!document.querySelector('.qb-question-form')`);
    check(
      "saving a long mobile question form returns the bank header below the application header",
      await evaluate(`(()=>{
        const topbar=document.querySelector('.topbar').getBoundingClientRect();
        const header=document.querySelector('.qb-page-header').getBoundingClientRect();
        return header.top>=topbar.bottom-1&&header.bottom<innerHeight
          &&document.querySelector('.qb-page').scrollWidth<=innerWidth;
      })()`),
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    check(
      "legacy distinct options do not block unrelated question corrections",
      await evaluate(`(async()=>{
        const q=(await EduQuestionBankRepository.read()).questions.find(q=>q.id==='business-question-0');
        return q.text==='اصلاح متن سؤال قدیمی بدون تغییر گزینه‌ها'&&JSON.stringify(q.options)===JSON.stringify(['ی','ي','A','a']);
      })()`),
    );
    await evaluate(`(async()=>{__qbBusiness.click('بستن');
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
    await evaluate(`window.__inlineConfirmationText=document.querySelector('.qb-confirm > p').textContent;
      document.querySelector('.qb-confirm > p').textContent=__inlineConfirmationText.repeat(20);`);
    for (const [width, height] of [
      [320, 568],
      [390, 667],
      [768, 900],
    ]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(80);
      check(
        `long inline confirmation keeps its actions visible and its message scrollable at ${width}`,
        await evaluate(`(()=>{
          const panel=document.querySelector('.qb-confirm'),page=document.querySelector('.qb-page');
          const box=panel.getBoundingClientRect(),bounds=page.getBoundingClientRect();
          const message=panel.querySelector('p'),text=message.getBoundingClientRect();
          return panel.tagName==='SECTION'&&panel.parentElement===page&&!document.querySelector('dialog:modal')
            &&box.left>=0&&box.right<=innerWidth+1&&box.top>=0&&box.bottom<=bounds.bottom+1
            &&getComputedStyle(message).overflowY==='auto'&&message.scrollHeight>message.clientHeight
            &&[...panel.querySelectorAll('button')].every(button=>{
              const b=button.getBoundingClientRect();
              return b.height>=44&&b.width>=44&&b.top>=box.top&&b.bottom<=box.bottom+1
                &&b.left>=box.left&&b.right<=box.right+1
                &&(text.right<=b.left+1||text.left>=b.right-1||text.bottom<=b.top+1);
            });
        })()`),
      );
    }
    await evaluate(`document.querySelector('.qb-confirm > p').textContent=__inlineConfirmationText;
      delete window.__inlineConfirmationText;`);
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
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
    check(
      "a revision conflict continues to require reopening after deliberate form navigation",
      await evaluate(`(()=>{
        __qbBusiness.click('بازگشت');__qbBusiness.click('فصل جدید');
        return !document.querySelector('.qb-message').hidden
          &&document.querySelector('.qb-message').textContent.includes('بانک را ببندید و دوباره باز کنید');
      })()`),
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
      `__qbBusiness.click('آزمون‌های من');__qbBusiness.click('مشاهده آزمون')`,
    );
    check(
      "an archived four-type exam remains printable after deleting its source course",
      await evaluate(`document.querySelectorAll('.qb-sheet-question').length===4
        &&!!document.querySelector('.qb-short-answer')
        &&!document.querySelector('.qb-sheet').textContent.includes('SECRET-')`),
    );
    check(
      "print header, closing and inline true-false choices adapt to available space",
      await evaluate(`(async()=>{
      const exam=structuredClone((await EduQuestionBankRepository.read()).exams[0]);
      exam.questions=[{...exam.questions.find(q=>q.type==='boolean'),text:'آب مایع است.'}];
      const host=document.createElement('div');
      host.style.cssText='position:fixed;inset:0 auto auto 0;width:794px;background:white';
      document.body.append(host);
      try{
        const sheet=EduQuestionBankUI.sheet(exam);host.append(sheet);
        const prompt=sheet.querySelector('.qb-sheet-prompt p');
        const choices=prompt.querySelector('.qb-sheet-boolean');
        const range=document.createRange();range.selectNodeContents(prompt.firstChild);
        const first=range.getClientRects()[0];
        const inline=Math.abs(first.top-choices.getBoundingClientRect().top)<5;
        const heading=sheet.querySelector('.qb-sheet-header').firstElementChild.textContent==='به نام خدا';
        const closing=sheet.lastElementChild.querySelector('.qb-sheet-closing').textContent.includes('موفق باشید');
        const pageStyle=sheet.querySelector('style[media="print"]');
        const rules=[...pageStyle.sheet.cssRules];
        const running=rules.length===2&&rules[0].cssText.includes('@top-center')
          &&rules[0].cssText.includes('counter(pages)')&&rules[1].cssText.includes('content: none')
          &&rules[0].selectorText===sheet.style.page;
        host.style.width='260px';
        prompt.firstChild.textContent='این صورت سؤال طولانی است و باید در عرض کم بدون بریدگی و با حفظ گزینه‌های صحیح و غلط به خط بعد برود. '.repeat(5);
        range.selectNodeContents(prompt.firstChild);
        const wrapped=choices.getBoundingClientRect().top>range.getClientRects()[0].top+10;
        return inline&&heading&&closing&&running&&wrapped&&sheet.scrollWidth<=sheet.clientWidth+1;
      }finally{host.remove();}
    })()`),
    );
    await evaluate(`(async()=>{
      __qbBusiness.click('بستن');
      const R=EduQuestionBankRepository,bank=await R.read(),copy=structuredClone(bank.exams[0]);
      copy.id='business-delete-only';copy.title='آزمون قابل حذف';bank.exams.push(copy);
      window.__beforeExamDeletion=await R.save(bank,bank.revision);
      await EduQuestionBankUI.open();__qbBusiness.click('آزمون‌های من');
      window.__deleteSampleExam=()=>{
        const card=[...document.querySelectorAll('.qb-exam-card')].find(n=>n.querySelector('h3').textContent===copy.title);
        __qbBusiness.click('حذف آزمون',card);
      };
      __deleteSampleExam();__qbBusiness.cancel();
    })()`);
    check(
      "cancelling exam deletion preserves every stored bank record and revision",
      await evaluate(
        `(async()=>JSON.stringify(await EduQuestionBankRepository.read())===JSON.stringify(__beforeExamDeletion))()`,
      ),
    );
    await evaluate(`__deleteSampleExam();__qbBusiness.confirm()`);
    await waitFor(`document.querySelectorAll('.qb-exam-card').length===1`);
    check(
      "confirmed exam deletion removes only its snapshot and preserves source questions and other exams",
      await evaluate(`(async()=>{
        const after=await EduQuestionBankRepository.read(),before=__beforeExamDeletion;
        return ['courses','units','questions'].every(key=>JSON.stringify(after[key])===JSON.stringify(before[key]))
          &&after.questions.length===1&&after.exams.length===1&&after.exams[0].id===before.exams[0].id
          &&after.revision===before.revision+1;
      })()`),
    );
    check(
      "a late initial bank read cannot replace a newer page after navigation",
      await evaluate(`(async()=>{
        __qbBusiness.click('بستن');
        const repository=EduQuestionBankRepository,originalRead=repository.read;
        const snapshot=await originalRead();let release;
        repository.read=()=>new Promise(resolve=>{release=resolve;});
        try{
          const opening=EduQuestionBankUI.open(),oldPage=document.querySelector('.qb-page');
          goReports();repository.read=originalRead;
          const left=!oldPage.isConnected&&state.view==='reports';
          await EduQuestionBankUI.open();const current=document.querySelector('.qb-page');
          release(snapshot);await opening;
          return left&&current!==oldPage&&document.querySelector('.qb-page')===current
            &&document.querySelectorAll('.qb-page').length===1&&state.view==='question-bank'
            &&JSON.stringify(await originalRead())===JSON.stringify(snapshot);
        }finally{repository.read=originalRead;release?.(snapshot);}
      })()`),
    );
    check(
      "a file read completing after closing the shared backup hub cannot open a restore confirmation or replace bank data",
      await evaluate(`(async()=>{
        document.querySelector('[data-workspace-action="backups"]').click();
        for(let i=0;i<100&&(!document.querySelector('#backupHub')||document.getElementById('modal').classList.contains('hidden'));i++)await new Promise(resolve=>setTimeout(resolve,30));
        document.querySelector('#backupHub [data-backup-tab="bank"]').click();
        const before=JSON.stringify(await EduQuestionBankRepository.read());
        const input=document.querySelector('#backupBankPanel input[type=file]'),transfer=new DataTransfer();
        transfer.items.add(new File([JSON.stringify(EduQuestionBank.empty())],'Classyar-QuestionBank.json',{type:'application/json'}));
        input.files=transfer.files;let release;
        Object.defineProperty(input.files[0],'text',{value:()=>new Promise(resolve=>{release=resolve;})});
        const reading=input.onchange();closeModal();goSchools();
        release(JSON.stringify(EduQuestionBank.empty()));await reading;
        const safe=state.view==='schools'&&!document.querySelector('.qb-page,.qb-backup-confirm')
          &&document.getElementById('modal').classList.contains('hidden')
          &&JSON.stringify(await EduQuestionBankRepository.read())===before;
        await EduQuestionBankUI.open();return safe;
      })()`),
    );
    const server =
      require("../scripts/question-bank-review.cjs").createReviewServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const url = "http://127.0.0.1:" + server.address().port + "/";
      await cdp("Page.navigate", { url });
      await waitFor(`!!document.querySelector('.qb-page')`);
      check(
        "review enters all twenty-four sample questions and three archived exams in independent IndexedDB",
        await evaluate(`(async()=>{
        const bank=await EduQuestionBankRepository.read();
        return bank.courses.length===3&&bank.units.length===5&&bank.questions.length===24&&bank.exams.length===3&&bank.revision===1;
      })()`),
      );
      await evaluate(`(async()=>{
        const bank=await EduQuestionBankRepository.read();bank.questions[0].text='REVIEW-USER-EDIT';
        await EduQuestionBankRepository.save(bank,bank.revision);
      })()`);
      await cdp("Page.navigate", { url });
      await waitFor(`!!document.querySelector('.qb-page')`);
      check(
        "reopening review preserves the reviewer edits without reseeding",
        await evaluate(`(async()=>{
        const bank=await EduQuestionBankRepository.read();
        return bank.questions.length===24&&bank.questions[0].text==='REVIEW-USER-EDIT'&&bank.revision===2;
      })()`),
      );
      await cdp("Page.navigate", { url: url + "?sample-exam=1" });
      await waitFor(`!!document.querySelector('.qb-page')`);
      check(
        "requested sample exam is saved with eight questions and twenty points",
        await evaluate(`(async()=>{
        const bank=await EduQuestionBankRepository.read();
        const sample=bank.exams.find(exam=>exam.id==='review-user-sample-exam');
        return bank.exams.length===4&&sample.questions.length===8&&sample.duration===45
          &&sample.questions.reduce((sum,q)=>sum+q.score,0)===2000
          &&bank.questions[0].text==='REVIEW-USER-EDIT'
          &&document.querySelector('.qb-page').textContent.includes(sample.title);
      })()`),
      );
      await cdp("Page.navigate", { url: url + "?sample-exam=1" });
      await waitFor(`!!document.querySelector('.qb-page')`);
      check(
        "sample registration is idempotent on reload",
        await evaluate(`(async()=>{
        const bank=await EduQuestionBankRepository.read();
        return bank.exams.length===4&&bank.revision===3;
      })()`),
      );
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 2;
});
