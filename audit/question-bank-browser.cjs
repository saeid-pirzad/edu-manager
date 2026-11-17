"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { main } = require("./data-integrity.cjs");
main({
  stage: "question-bank",
  runExtra: async ({ evaluate, cdp, cases, root, delay }) => {
    const evaluateGesture = async (expression) => {
      const result = await cdp("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (result.exceptionDetails)
        throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const out = path.join(root, ".cache", "question-bank-audit");
    fs.mkdirSync(out, { recursive: true });
    const check = (name, pass) => {
      cases.push({ name: "question bank: " + name, pass: !!pass });
      if (!pass) throw Error(name);
    };
    const checkOptionLayout = async (selector, width) => {
      check(
        `short and long options use one or two rows ${selector} ${width}`,
        await evaluate(`(async()=>{
          const list=document.querySelector('${selector}');
          const spans=[...list.children].map(item=>item.lastElementChild);
          const original=spans.map(n=>n.textContent);
          const wait=()=>new Promise(r=>setTimeout(r,80));
          spans.forEach(n=>n.textContent='۱');await wait();
          const short=list.dataset.columns==='4'&&getComputedStyle(list).gridTemplateColumns.split(' ').length===4;
          spans[0].textContent='این یک گزینه با متن بسیار طولانی برای بررسی چیدمان گزینه‌های آزمون است';await wait();
          const long=list.dataset.columns==='2'&&getComputedStyle(list).gridTemplateColumns.split(' ').length===2&&list.scrollWidth<=list.clientWidth+1;
          spans.forEach((n,i)=>n.textContent=original[i]);await wait();
          if(!short||!long)throw Error(JSON.stringify({selector:'${selector}',short,long,width:list.clientWidth,scroll:list.scrollWidth,columns:list.dataset.columns,grid:getComputedStyle(list).gridTemplateColumns}));
          return short&&long;
        })()`),
      );
    };
    const captureEditor = async (name) => {
      for (const width of [390, 768, 1440]) {
        await cdp("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await delay(80);
        check(
          `${name} form fits ${width}`,
          await evaluate(
            `document.querySelector('.qb-body').scrollWidth<=document.querySelector('.qb-body').clientWidth+1`,
          ),
        );
        check(
          `${name} close control fits ${width}`,
          await evaluate(
            `(()=>{const b=document.querySelector('.qb-close'),r=b.getBoundingClientRect();return r.width<=46&&r.height<=46&&b.querySelector('.ui-button-label').hidden;})()`,
          ),
        );
        if (name === "question")
          check(
            `question editor groups context and answer fields ${width}`,
            await evaluate(
              `(()=>{const context=document.querySelector('.qb-question-context'),answer=document.querySelector('.qb-answer-editor');return context?.querySelectorAll('select').length===2&&answer?.tagName==='FIELDSET'&&answer.querySelector('legend')?.textContent==='گزینه‌ها و پاسخ'&&answer.querySelectorAll('input').length===4&&answer.querySelector('select')?.closest('label').classList.contains('qb-field-wide');})()`,
            ),
          );
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(out, `${name}-form-${width}.png`),
          Buffer.from(shot.data, "base64"),
        );
      }
    };
    await evaluate(`closeModal();goSchools();`);
    await delay(300);
    check(
      "menu entry",
      await evaluate(`!!document.querySelector('.question-bank-entry')`),
    );
    await evaluate(
      `for(const d of document.querySelectorAll('.navigation-menu,.workspace-tools'))d.open=true;document.querySelector('.question-bank-entry').focus();document.querySelector('.question-bank-entry').click()`,
    );
    await delay(100);
    check(
      "opening the bank keeps the status area unobtrusive and the header labelled",
      await evaluate(
        `document.querySelector('.qb-message').hidden&&document.querySelector('.qb-dialog').getAttribute('aria-labelledby')==='qb-title'&&!!document.querySelector('#qb-title svg')`,
      ),
    );
    check(
      "storage status has a direct automatic-file action rather than a plain success notice",
      await evaluate(
        `(()=>{const bar=document.querySelector('.qb-storage-bar'),action=bar.querySelector('button');return bar.querySelector('[role=status]')&&action.textContent.includes('خودکار')&&!!action.querySelector('svg')&&action.getBoundingClientRect().height>=(innerWidth<=700?40:44)&&document.querySelector('.qb-message').hidden;})()`,
      ),
    );
    check(
      "all tabs stay accessible and course selection belongs to the active question panel",
      await evaluate(
        `(()=>{const tabs=[...document.querySelectorAll('.qb-tabs button')];const accessible=tabs.length===4&&tabs.every(b=>!b.disabled&&!b.hidden);tabs[3].click();const backup=!!document.querySelector('.qb-backup')&&!document.querySelector('.qb-toolbar');document.querySelector('.qb-tabs button').click();return accessible&&backup&&!!document.querySelector('.qb-panel .qb-toolbar')&&!!document.querySelector('.qb-empty');})()`,
      ),
    );
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      for (const index of [0, 1]) {
        await evaluate(
          `document.querySelectorAll('.qb-tabs button')[${index}].click()`,
        );
        await delay(80);
        check(
          `initial course and empty cards align with tabs ${index} ${width}`,
          await evaluate(
            `(()=>{const tabs=document.querySelector('.qb-tabs').getBoundingClientRect();return ['.qb-course-required','.qb-panel>.qb-empty'].every(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return Math.abs(r.left-tabs.left)<1&&Math.abs(r.right-tabs.right)<1;})&&document.querySelector('.qb-body').scrollWidth<=document.querySelector('.qb-body').clientWidth+1;})()`,
          ),
        );
      }
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(out, `initial-${width}.png`),
        Buffer.from(shot.data, "base64"),
      );
    }
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    // Reopen on the initial empty course workspace before exercising course creation.
    await evaluate(
      `document.querySelector('.qb-close').click();EduQuestionBankUI.open()`,
    );
    await delay(100);
    await evaluate(
      `window.__qbClick=(label,scope=document.querySelector('.qb-dialog'))=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent===label);if(!b)throw Error(label);const menu=b.closest('.qb-entity-menu');if(menu&&!menu.matches(':popover-open'))document.querySelector('[aria-controls="'+menu.id+'"]').click();b.click();};window.__qbFill=(label,value)=>{const l=[...document.querySelectorAll('.qb-dialog label')].find(l=>l.firstChild.textContent===label);if(!l)throw Error(label);const n=l.querySelector('input,textarea,select');n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));return n;};__qbClick('درس جدید');document.querySelector('.qb-dialog form').requestSubmit();`,
    );
    await delay(100);
    check(
      "invalid course exposes an accessible error and does not save partial data",
      await evaluate(
        `(async()=>{const status=document.querySelector('.qb-message');return !status.hidden&&status.getAttribute('role')==='alert'&&status.dataset.state==='error'&&!(await EduQuestionBankRepository.read()).courses.length&&!!document.querySelector('.qb-form');})()`,
      ),
    );
    await evaluate(
      `__qbFill('عنوان درس','درس آزمایشی');document.querySelector('.qb-dialog form').requestSubmit();`,
    );
    await delay(100);
    check(
      "successful local save is shown inside the storage bar and course tabs become visible",
      await evaluate(
        `document.querySelector('.qb-message').hidden&&document.querySelector('.qb-storage-state').textContent.includes('مرورگر')&&[...document.querySelectorAll('.qb-tabs button')].every(b=>!b.hidden&&!b.disabled)`,
      ),
    );
    check(
      "clearing a course only empties the current panel and keeps tabs accessible",
      await evaluate(
        `(()=>{const picker=()=>document.querySelector('.qb-toolbar select'),tabs=()=>[...document.querySelectorAll('.qb-tabs button')].slice(0,2);const id=picker().value;picker().value='';picker().dispatchEvent(new Event('change'));const empty=!!document.querySelector('.qb-empty')&&tabs().every(b=>!b.disabled&&!b.hidden);picker().value=id;picker().dispatchEvent(new Event('change'));return empty&&!!document.querySelector('.qb-question-library');})()`,
      ),
    );
    await evaluate(
      `__qbClick('فصل جدید');__qbFill('عنوان فصل','بخش آزمایشی');document.querySelector('.qb-dialog form').requestSubmit();`,
    );
    await delay(100);
    await evaluate(`__qbClick('ویرایش درس')`);
    await captureEditor("course");
    await evaluate(`__qbClick('بازگشت');__qbClick('فصل جدید')`);
    await captureEditor("unit");
    await evaluate(`__qbClick('بازگشت')`);
    await evaluate(
      `__qbClick('افزودن سؤال');__qbFill('فصل',document.querySelector('.qb-dialog form select').options[1].value);__qbFill('متن سؤال','متن سؤال آزمایشی <img src=x onerror=alert(1)>');for(let i=1;i<=4;i++)__qbFill('گزینه '+i,'گزینه آزمایشی '+i);__qbFill('پاسخ صحیح','2');__qbFill('توضیح پاسخ (اختیاری)','SECRET-EXPLANATION');__qbFill('بارم','۱٫۲۵');document.querySelector('.qb-dialog form').requestSubmit();`,
    );
    await delay(100);
    check(
      "question persisted safely",
      await evaluate(
        `(async()=>{const b=await EduQuestionBankRepository.read();return b.questions.length===1&&b.questions[0].score===125&&!document.querySelector('.qb-dialog img');})()`,
      ),
    );
    await evaluate(`__qbClick('ویرایش سؤال')`);
    check(
      "switching question type preserves unsaved options and false answer",
      await evaluate(`(()=>{
        __qbFill('گزینه 1','پیش‌نویس گزینه');__qbFill('پاسخ صحیح','0');
        const change=(value)=>{const n=__qbFill('نوع سؤال',value);n.dispatchEvent(new Event('change'));};
        change('boolean');__qbFill('پاسخ صحیح','false');
        change('essay');__qbFill('پاسخ صحیح','پیش‌نویس تشریحی');
        change('boolean');const boolean=[...document.querySelectorAll('.qb-form label')].find(l=>l.firstChild.textContent==='پاسخ صحیح').querySelector('select').value==='false';
        change('essay');const essay=[...document.querySelectorAll('.qb-form label')].find(l=>l.firstChild.textContent==='پاسخ صحیح').querySelector('textarea').value==='پیش‌نویس تشریحی';
        change('mcq');const labels=[...document.querySelectorAll('.qb-form label')];
        const preserved=labels.find(l=>l.firstChild.textContent==='گزینه 1').querySelector('input').value==='پیش‌نویس گزینه'&&labels.find(l=>l.firstChild.textContent==='پاسخ صحیح').querySelector('select').value==='0';
        __qbFill('گزینه 1','گزینه آزمایشی 1');__qbFill('پاسخ صحیح','2');
        return boolean&&essay&&preserved;
      })()`),
    );
    await captureEditor("question");
    const designComparison = await evaluate(`(async()=>{
      await openSettingsModal();await new Promise(r=>setTimeout(r,200));
      const reference=getComputedStyle(document.getElementById('newPass'));
      const bank=getComputedStyle(document.querySelector('.qb-form input'));
      const properties=['fontFamily','fontSize','backgroundColor','borderTopColor','borderTopLeftRadius','paddingTop','paddingRight'];
      const values=Object.fromEntries(properties.map(p=>[p,{system:reference[p],bank:bank[p]}]));
      closeModal();return values;
    })()`);
    fs.writeFileSync(
      path.join(out, "design-comparison.json"),
      JSON.stringify(designComparison, null, 2),
    );
    check(
      "form controls use the system design",
      Object.values(designComparison).every((v) => v.system === v.bank),
    );
    await evaluate(
      `__qbFill('متن سؤال','متن ویرایش شده');document.querySelector('.qb-dialog form').requestSubmit();`,
    );
    await delay(100);
    check(
      "edit persisted",
      await evaluate(
        `(async()=> (await EduQuestionBankRepository.read()).questions[0].text==='متن ویرایش شده')()`,
      ),
    );
    check(
      "other question editors persist typed answers",
      await evaluate(`(async()=>{
      for(const type of ['blank','essay','boolean']) {
        __qbClick('افزودن سؤال');__qbFill('فصل',(await EduQuestionBankRepository.read()).units[0].id);
        const n=__qbFill('نوع سؤال',type);n.dispatchEvent(new Event('change'));
        __qbFill('متن سؤال','سؤال آزمایشی '+type);__qbFill('پاسخ صحیح',type==='boolean'?'false':'SECRET-ANSWER');
        document.querySelector('.qb-dialog form').requestSubmit();await new Promise(r=>setTimeout(r,100));
      }
      return (await EduQuestionBankRepository.read()).questions.length===4;
    })()`),
    );
    check(
      "course change clears section selection",
      await evaluate(`(async()=>{
      const b=await EduQuestionBankRepository.read();const original=b.courses[0].id;
      const extra=Array.from({length:17},(_,i)=>({...b.questions.find(q=>q.type==='blank'),id:'layout-'+i,text:'سؤال تمرینی '+(i+1)+': '+('در جای خالی واژه مناسب را بنویسید و دلیل انتخاب خود را توضیح دهید. ').repeat(i%3+1)}));
      extra[16].text+='X'.repeat(400);
      await EduQuestionBankRepository.save({...b,questions:[...b.questions,...extra],courses:[...b.courses,{id:'second-course',title:'درس پودمانی',structure:'module'}],units:[...b.units,{id:'second-unit',courseId:'second-course',title:'پودمان اول'}]},b.revision);
      __qbClick('بستن');await EduQuestionBankUI.open();
      const choose=(id)=>{const n=[...document.querySelectorAll('.qb-dialog label')].find(l=>l.firstChild.textContent==='درس').querySelector('select');n.value=id;n.dispatchEvent(new Event('change'));};
      choose(original);let unit=[...document.querySelectorAll('.qb-dialog label')].find(l=>l.firstChild.textContent==='فصل').querySelector('select');unit.value=b.units[0].id;unit.dispatchEvent(new Event('change'));
      choose('second-course');const cleared=[...document.querySelectorAll('.qb-dialog label')].find(l=>l.firstChild.textContent==='پودمان').querySelector('select').value==='';choose(original);return cleared;
    })()`),
    );
    check(
      "question and builder tabs retain independent courses and sections",
      await evaluate(`(()=>{
        const choose=id=>{const n=document.querySelector('.qb-toolbar select');n.value=id;n.dispatchEvent(new Event('change'));};
        const original=document.querySelector('.qb-toolbar select').value;
        const unit=document.querySelector('.qb-section-picker select');unit.selectedIndex=1;unit.dispatchEvent(new Event('change'));const unitId=unit.value;
        __qbClick('طرح آزمون');choose('second-course');__qbClick('انتخاب همه');
        __qbClick('سؤال‌ها');if(document.querySelector('.qb-confirm'))__qbClick('تأیید',document.querySelector('.qb-confirm'));const questions=document.querySelector('.qb-toolbar select').value===original&&document.querySelector('.qb-section-picker select').value===unitId;
        const score=document.querySelector('.qb-question-toggle>.qb-score'),style=getComputedStyle(score);
        const badge=style.backgroundColor!=='rgba(0, 0, 0, 0)'&&parseFloat(style.borderRadius)>0;
        __qbClick('طرح آزمون');const builder=document.querySelector('.qb-toolbar select').value==='second-course'&&document.querySelector('.qb-unit-selection input').checked;
        choose(original);return questions&&builder&&badge&&!!document.querySelector('.qb-panel .qb-toolbar');
      })()`),
    );
    check(
      "more menu supports keyboard navigation and direct deletion can be cancelled without changing data",
      await evaluate(`(async()=>{
        const before=JSON.stringify(await EduQuestionBankRepository.read());
        const trigger=document.querySelector('.qb-toolbar .qb-context-action');trigger.click();
        const menu=document.getElementById(trigger.getAttribute('aria-controls'));
        const items=[...menu.querySelectorAll('[role=menuitem]')];
        const opened=menu.matches(':popover-open')&&items.length===3&&document.activeElement===items[0];
        menu.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));const keyboard=document.activeElement===items[2];
        items[2].click();const confirmation=!!document.querySelector('.qb-confirm')&&!menu.matches(':popover-open');
        __qbClick('انصراف',document.querySelector('.qb-confirm'));
        return opened&&keyboard&&confirmation&&JSON.stringify(await EduQuestionBankRepository.read())===before;
      })()`),
    );
    await evaluate(
      `__qbClick('انتخاب همه');for(const label of ['چهارگزینه‌ای','جای‌خالی','تشریحی','صحیح / غلط'])__qbFill('تعداد '+label,'۱');__qbFill('عنوان آزمون','آزمون آزمایشی');document.querySelector('.qb-dialog form').requestSubmit();`,
    );
    await delay(100);
    check(
      "sheet excludes answers",
      await evaluate(
        `!!document.querySelector('.qb-sheet')&&!document.querySelector('.qb-sheet').textContent.includes('SECRET-EXPLANATION')&&!document.querySelector('.qb-sheet').textContent.includes('پاسخ صحیح')`,
      ),
    );
    check(
      "exam sheet separates identity question numbering marks and lined answer space",
      await evaluate(`(()=>{
        const sheet=document.querySelector('.qb-sheet');
        return sheet.querySelectorAll('.qb-student-field').length===2&&[...sheet.querySelectorAll('.qb-student-field')].some(n=>n.textContent.includes('نام و نام خانوادگی')&&n.querySelector('.qb-student-line'))&&sheet.querySelector('.qb-sheet-columns').children.length===3&&sheet.querySelectorAll('.qb-sheet-number').length===4&&[...sheet.querySelectorAll('.qb-sheet-score')].every(n=>n.getAttribute('aria-label').includes('نمره'))&&sheet.querySelector('.qb-answer-space').children.length===4;
      })()`),
    );
    for (const width of [320, 360, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(80);
      for (const view of ["sheet", "questions", "builder"]) {
        if (view === "sheet")
          await checkOptionLayout(".qb-sheet-options", width);
        if (view === "questions")
          await evaluate(
            `__qbClick('بازگشت به آزمون‌های من');__qbClick('سؤال‌ها');`,
          );
        if (view === "builder") await evaluate(`__qbClick('طرح آزمون')`);
        if (view === "questions") {
          const parity = await evaluate(`(()=>{
              const host=document.createElement('div');host.className='session-workspace';host.inert=true;host.setAttribute('aria-hidden','true');host.style.cssText='position:fixed;left:-10000px;top:0;width:500px;pointer-events:none';
              host.innerHTML='<nav class="session-mode-picker"><button aria-pressed="true">حضور و غیاب</button><button aria-pressed="false">فعالیت</button></nav><div class="att-row"><span class="att-name">هنرجو</span></div><label class="session-attendance-search">جست‌وجو<input type="search"></label>';
              document.querySelector('.qb-body').append(host);
              const actualSession=host.cloneNode(true);
              document.getElementById('modalBody').append(actualSession);
              try {
                const differences=[];
                const same=(a,b,props)=>{const x=getComputedStyle(a),y=getComputedStyle(b);for(const p of props)if(x[p]!==y[p])differences.push({element:a.className,property:p,bank:x[p],attendance:y[p]});return props.every(p=>x[p]===y[p]);};
                const palette=same(document.querySelector('.qb-tabs'),actualSession.querySelector('.session-mode-picker'),['backgroundColor','borderTopWidth','borderRadius','boxShadow',...(innerWidth>700?['paddingTop']:[])])&&same(document.querySelector('.qb-tabs [aria-pressed=true]'),actualSession.querySelector('[aria-pressed=true]'),['backgroundColor','color','borderRadius','boxShadow',...(innerWidth>700?['fontSize','lineHeight']:[])])&&same(document.querySelector('.qb-tabs [aria-pressed=false]'),actualSession.querySelector('[aria-pressed=false]'),['backgroundColor','color','borderRadius','boxShadow',...(innerWidth>700?['fontSize','lineHeight']:[])]);
                const cards=same(document.querySelector('.qb-question-library'),host.querySelector('.att-row'),['backgroundColor','borderTopColor','borderRadius']);
                // Compact mobile controls keep the palette and readable editable text.
                const mobile=innerWidth>700||same(document.querySelector('.qb-filters input'),host.querySelector('input'),['fontSize']);
                return {pass:palette&&cards&&mobile,differences};
              } finally {host.remove();actualSession.remove();}
            })()`);
          if (!parity.pass)
            console.log(
              "Attendance style differences",
              width,
              JSON.stringify(parity.differences),
            );
          check(
            `question bank matches attendance palette and geometry ${width}`,
            parity.pass,
          );
        }
        if (view === "questions")
          check(
            `mobile context controls are compact and accessible ${width}`,
            await evaluate(
              `(()=>{if(innerWidth>700)return true;const toolbar=document.querySelector('.qb-toolbar'),picker=document.querySelector('.qb-section-picker'),buttons=[...document.querySelectorAll('.qb-context-action')];return toolbar.getBoundingClientRect().height<=84&&picker.getBoundingClientRect().height<=105&&buttons.length===2&&buttons.every(b=>b.getAttribute('aria-label')===b.title&&!!b.querySelector('svg')&&b.getBoundingClientRect().width===36&&b.getBoundingClientRect().height===36)&&document.querySelector('.qb-question-row').getBoundingClientRect().bottom<=document.querySelector('.qb-body').getBoundingClientRect().bottom&&(document.querySelector('.qb-question-entry').compareDocumentPosition(document.querySelector('.qb-question-controls'))&Node.DOCUMENT_POSITION_FOLLOWING)!==0;})()`,
            ),
          );
        if (view === "questions") {
          const alignment = await evaluate(
            `['.qb-toolbar','.qb-section-picker'].map(selector=>{const row=document.querySelector(selector),s=row.querySelector('select').getBoundingClientRect();return {selector,select:{height:s.height,bottom:s.bottom},buttons:[...row.querySelectorAll('.qb-course-actions')].map(b=>{const r=b.getBoundingClientRect();return {height:r.height,bottom:r.bottom,text:b.textContent};})};})`,
          );
          const aligned = alignment.every(
            (row) =>
              Math.abs(row.select.height - (width <= 700 ? 40 : 44)) < 0.5 &&
              row.buttons.length === 1 &&
              row.buttons.every(
                (b) =>
                  Math.abs(b.height - row.select.height) < 0.5 &&
                  Math.abs(b.bottom - row.select.bottom) < 0.5,
              ),
          );
          if (!aligned)
            console.log("Control alignment", width, JSON.stringify(alignment));
          check(
            `course and section selects align with adjacent actions ${width}`,
            aligned,
          );
        }
        if (view === "questions") {
          const controls = await evaluate(
            `['input','select'].map(tag=>{const n=document.querySelector('.qb-filters '+tag),r=n.getBoundingClientRect(),s=getComputedStyle(n);return {height:r.height,bottom:r.bottom,font:s.fontSize,radius:s.borderRadius};})`,
          );
          const [a, b] = controls;
          const matches =
            Math.abs(a.height - (width <= 700 ? 40 : 44)) < 0.5 &&
            Math.abs(a.height - b.height) < 0.5 &&
            Math.abs(a.bottom - b.bottom) < 0.5 &&
            (width <= 700
              ? a.font === "16px" && b.font === "13px"
              : a.font === b.font) &&
            a.radius === b.radius;
          if (!matches)
            console.log("Search alignment", width, JSON.stringify(controls));
          check(
            `question search matches the adjacent select ${width}`,
            matches,
          );
        }
        if (view === "questions")
          check(
            `compact question rows ${width}`,
            await evaluate(
              `(()=>{const rows=[...document.querySelectorAll('.qb-results>.qb-question-row')];return rows.length===15&&rows.every(r=>!r.open&&r.getBoundingClientRect().height<=105)&&document.querySelector('.qb-body').scrollWidth<=document.querySelector('.qb-body').clientWidth+1;})()`,
            ),
          );
        if (view === "questions") {
          check(
            `question list scroll stays inside its bounded container ${width}`,
            await evaluate(`(()=>{
            const list=document.querySelector('.qb-question-library>.qb-results');
            const controls=document.querySelector('.qb-question-controls');
            const library=document.querySelector('.qb-question-library');
            const panel=document.querySelector('.qb-panel');
            const before={controls:controls.getBoundingClientRect().top,height:library.getBoundingClientRect().height,panel:panel.scrollTop};
            list.scrollTop=list.scrollHeight;
            const pass=list.scrollTop>0&&list.clientHeight<=420&&list.scrollHeight>list.clientHeight
              &&getComputedStyle(list).overflowY==='auto'&&list.tabIndex===0
              &&Math.abs(controls.getBoundingClientRect().top-before.controls)<1
              &&Math.abs(library.getBoundingClientRect().height-before.height)<1
              &&panel.scrollTop===before.panel&&list.querySelectorAll('.qb-question-row').length===15;
            list.scrollTop=0;return pass;
          })()`),
          );
        }
        check(
          `${view} width ${width}`,
          await evaluate(
            `document.querySelector('.qb-dialog').scrollWidth<=document.querySelector('.qb-dialog').clientWidth+1`,
          ),
        );
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(out, `${view}-${width}.png`),
          Buffer.from(shot.data, "base64"),
        );
        if (view === "questions") {
          check(
            `live search and type filter ${width}`,
            await evaluate(`(()=>{
            const search=__qbFill('جست‌وجو در سؤال‌ها','متن ویرایش شده');search.focus();search.dispatchEvent(new Event('input',{bubbles:true}));
            const focused=document.activeElement===search&&document.querySelectorAll('.qb-results>.qb-question').length===1;
            const type=__qbFill('نوع سؤال','boolean');type.dispatchEvent(new Event('change'));const empty=!!document.querySelector('.qb-results .qb-empty');
            type.value='';type.dispatchEvent(new Event('change'));search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));
            return focused&&empty&&document.querySelectorAll('.qb-results>.qb-question').length===15;
          })()`),
          );
          await evaluate(`__qbClick('بعدی')`);
          check(
            `pagination shows remaining questions ${width}`,
            await evaluate(
              `document.querySelectorAll('.qb-results>.qb-question').length===6&&document.querySelector('.qb-body').scrollWidth<=document.querySelector('.qb-body').clientWidth+1`,
            ),
          );
          const nextPage = await cdp("Page.captureScreenshot", {
            format: "png",
          });
          fs.writeFileSync(
            path.join(out, `questions-page2-${width}.png`),
            Buffer.from(nextPage.data, "base64"),
          );
          await evaluate(
            `__qbClick('قبلی');document.querySelector('.qb-question-row').open=true;document.querySelector('.qb-solution').open=true;document.querySelector('.qb-results').scrollIntoView({block:'start'});`,
          );
          const answerShot = await cdp("Page.captureScreenshot", {
            format: "png",
          });
          fs.writeFileSync(
            path.join(out, `question-answer-${width}.png`),
            Buffer.from(answerShot.data, "base64"),
          );
          check(
            `question options and answer fit ${width}`,
            await evaluate(
              `document.querySelector('.qb-body').scrollWidth<=document.querySelector('.qb-body').clientWidth+1&&document.querySelector('.qb-options').children.length===4`,
            ),
          );
          await checkOptionLayout(".qb-options", width);
          check(
            `single expanded row ${width}`,
            await evaluate(
              `(()=>{const rows=document.querySelectorAll('.qb-question-row');rows[1].querySelector('summary').click();return rows[1].open&&!rows[0].open;})()`,
            ),
          );
          await evaluate(
            `document.querySelectorAll('.qb-question-row').forEach(r=>r.open=false);document.querySelector('.qb-solution').open=false;document.querySelector('.qb-body').scrollTop=0;`,
          );
        }
        if (view === "builder") {
          check(
            `form content scrolls strictly between fixed tabs and footer ${width}`,
            await evaluate(`(()=>{
              const fields=document.querySelector('.qb-form-fields'),tabs=document.querySelector('.qb-tabs'),footer=document.querySelector('.qb-form>.record-editor-actions'),body=document.querySelector('.qb-body');
              const before={tab:tabs.getBoundingClientRect().top,footer:footer.getBoundingClientRect().top};
              fields.scrollTop=fields.scrollHeight;
              const box=fields.getBoundingClientRect();
              const pass=box.height>0&&box.top>=tabs.getBoundingClientRect().bottom-1&&box.bottom<=footer.getBoundingClientRect().top+1&&Math.abs(before.tab-tabs.getBoundingClientRect().top)<1&&Math.abs(before.footer-footer.getBoundingClientRect().top)<1&&getComputedStyle(body).overflowY==='hidden'&&getComputedStyle(footer).position==='static'&&(fields.scrollHeight<=fields.clientHeight+1||fields.scrollTop>0);
              fields.scrollTop=0;return pass;
            })()`),
          );
          check(
            `exam metadata keeps teacher and school visible beside each other ${width}`,
            await evaluate(
              `(()=>{const details=document.querySelector('.qb-exam-details'),labels=[...details.querySelectorAll('label')],school=labels.find(n=>n.firstChild.textContent==='نام مدرسه (اختیاری)'),teacher=labels.find(n=>n.firstChild.textContent==='نام دبیر (اختیاری)'),a=school.getBoundingClientRect(),b=teacher.getBoundingClientRect();return labels.length===5&&!teacher.closest('details')&&Math.abs(a.top-b.top)<1&&a.left>=b.right&&details.scrollWidth<=details.clientWidth+1;})()`,
            ),
          );
          await evaluate(
            `document.querySelector('.qb-exam-details').scrollIntoView({block:'center'});`,
          );
          const metadataShot = await cdp("Page.captureScreenshot", {
            format: "png",
          });
          fs.writeFileSync(
            path.join(out, `exam-details-${width}.png`),
            Buffer.from(metadataShot.data, "base64"),
          );
          await evaluate(`document.querySelector('.qb-body').scrollTop=0;`);
          check(
            `question capacity badges stay beside titles above inputs ${width}`,
            await evaluate(
              `(()=>{const badges=[...document.querySelectorAll('.qb-capacity-badge')];return badges.length===4&&badges.every(b=>{const input=b.parentElement.querySelector('input'),r=b.getBoundingClientRect(),title=b.parentElement.querySelector('.qb-count-title').getBoundingClientRect();return Math.abs((r.top+r.bottom)/2-(title.top+title.bottom)/2)<1&&title.left>=r.right&&getComputedStyle(b).gridRowStart==='1'&&r.bottom<=input.getBoundingClientRect().top+1&&r.left>=b.parentElement.getBoundingClientRect().left-1&&b.getAttribute('aria-label').includes('سؤال موجود');});})()`,
            ),
          );
          check(
            `exam date uses the shared interactive Jalali picker ${width}`,
            await evaluate(`(()=>{
              const native=document.getElementById('qb-exam-date');
              const proxy=native.nextElementSibling;
              if(!native.dataset.shamsiApplied||!proxy.dataset.gregorianTarget||!/[۰-۹]/.test(proxy.value))return false;
              proxy.click();
              const popup=document.getElementById('calPopup');
              const visible=popup.closest('.qb-dialog')&&popup.classList.contains('open')&&document.activeElement.closest('#calPopup');
              const day=popup.querySelector('[data-calendar-action=select]:not(:disabled)');
              day.click();
              return !!visible&&!popup.classList.contains('open')&&/^\\d{4}-\\d{2}-\\d{2}$/.test(native.value)&&/[۰-۹]/.test(proxy.value);
            })()`),
          );
          if (width <= 700)
            check(
              `mobile exam fields keep compact touch dimensions ${width}`,
              await evaluate(
                `(()=>{const inputs=[...document.querySelectorAll('.qb-builder input:not([type=checkbox]):not([type=date])')].filter(n=>!n.closest('details:not([open])'));return inputs.length===9&&inputs.every(n=>Math.abs(n.getBoundingClientRect().height-44)<0.5)&&[...document.querySelectorAll('.qb-count-field')].every(n=>n.getBoundingClientRect().height<=125)&&getComputedStyle(document.querySelector('.qb-builder')).gridTemplateColumns.split(' ').length===2;})()`,
              ),
            );
          const actions = await evaluate(
            `Array.from(document.querySelectorAll('.qb-course-actions>button,.qb-tabs button,.qb-form>.record-editor-actions>button'),b=>({text:b.textContent,tab:!!b.closest('.qb-tabs'),height:b.getBoundingClientRect().height,width:b.clientWidth,scroll:b.scrollWidth}))`,
          );
          const fits =
            actions.length === 7 &&
            actions.every(
              (b) =>
                b.height >= (width <= 700 ? (b.tab ? 35.9 : 39.9) : 43.9) &&
                b.height <= 50 &&
                b.scroll <= b.width + 1,
            );
          if (!fits)
            console.log(
              "Question bank action geometry",
              width,
              JSON.stringify(actions),
            );
          check(
            `primary navigation and form actions stay single-row touch targets ${width}`,
            fits,
          );
        }
        if (view === "builder")
          check(
            `builder section edges align with tabs ${width}`,
            await evaluate(
              `(()=>{const tabs=document.querySelector('.qb-tabs').getBoundingClientRect();const boxes=[...document.querySelectorAll('.qb-builder>.qb-form-fields>fieldset')].map(n=>n.getBoundingClientRect());const aligned=boxes.length===3&&boxes.every(r=>Math.abs(r.left-tabs.left)<1&&Math.abs(r.right-tabs.right)<1);if(!aligned)throw Error(JSON.stringify({tabs:{left:tabs.left,right:tabs.right},boxes:boxes.map(r=>({left:r.left,right:r.right}))}));return aligned;})()`,
            ),
          );
        if (view === "builder")
          check(
            `builder counts use compact two-column grouping ${width}`,
            await evaluate(
              `(()=>{const grid=document.querySelector('.qb-count-grid');return grid?.querySelectorAll('.qb-count-field').length===4&&getComputedStyle(grid).gridTemplateColumns.split(' ').length===2&&grid.scrollWidth<=grid.clientWidth+1;})()`,
            ),
          );
        if (view === "builder")
          check(
            `live exam composition ${width}`,
            await evaluate(
              `(()=>{__qbClick('انتخاب همه');for(const label of ['چهارگزینه‌ای','جای‌خالی','تشریحی','صحیح / غلط'])__qbFill('تعداد '+label,'۲');return document.querySelector('.qb-plan-summary').textContent.includes('۸')&&document.querySelectorAll('.qb-count-field[data-shortage=true]').length===3;})()`,
            ),
          );
        if (view === "builder") {
          check(
            `exam composition exposes shortage on the input ${width}`,
            await evaluate(
              `Array.from(document.querySelectorAll('.qb-count-field[data-shortage=true] input')).every(n=>!n.validity.valid&&n.getAttribute('aria-invalid')==='true'&&document.getElementById(n.getAttribute('aria-describedby')))`,
            ),
          );
          check(
            `exam duration accepts Persian digits and rejects invalid ranges ${width}`,
            await evaluate(
              `(()=>{const n=__qbFill('مدت آزمون (دقیقه)','۰');const invalid=!n.validity.valid;__qbFill('مدت آزمون (دقیقه)','۶۰');return invalid&&n.validity.valid;})()`,
            ),
          );
        }
      }
      await evaluate(
        `__qbClick('آزمون‌ها');if(document.querySelector('.qb-confirm'))__qbClick('تأیید',document.querySelector('.qb-confirm'));`,
      );
      check(
        `archive width ${width}`,
        await evaluate(
          `document.querySelector('.qb-body').scrollWidth<=document.querySelector('.qb-body').clientWidth+1`,
        ),
      );
      check(
        `archive uses compact rows and aligned search filters ${width}`,
        await evaluate(
          `(()=>{const labels=[...document.querySelectorAll('.qb-archive-filters label')],cards=[...document.querySelectorAll('.qb-exam-card')];return Math.abs(labels[0].getBoundingClientRect().top-labels[1].getBoundingClientRect().top)<1&&cards.length>0&&cards.every(n=>n.getBoundingClientRect().height<=(innerWidth<=700?175:130));})()`,
        ),
      );
      check(
        `backup is the final tab and absent from the exam archive ${width}`,
        await evaluate(
          `(()=>{const tabs=[...document.querySelectorAll('.qb-tabs button')];return tabs.length===4&&tabs.at(-1).textContent==='پشتیبان'&&!document.querySelector('.qb-backup');})()`,
        ),
      );
      check(
        `archive cards expose compact view print and named delete actions ${width}`,
        await evaluate(
          `(()=>{const cards=[...document.querySelectorAll('.qb-exam-card')];return cards.length>0&&cards.every(card=>{const actions=[...card.querySelectorAll('.qb-exam-actions button')];return actions.length===3&&actions[1].textContent==='چاپ'&&actions[1].getAttribute('aria-label').includes('PDF')&&actions[2].getAttribute('aria-label').includes(card.querySelector('h3').textContent)&&actions.every(b=>Math.abs(b.getBoundingClientRect().height-(innerWidth<=700?40:44))<0.5&&b.scrollWidth<=b.clientWidth+1);});})()`,
        ),
      );
      check(
        `archive course filter uses saved exam course names ${width}`,
        await evaluate(
          `(()=>{const filter=document.querySelector('.qb-archive-filters select');return filter&&filter.options.length>=2&&filter.options[0].textContent==='همهٔ درس‌ها'&&getComputedStyle(document.querySelector('.qb-exam-results')).gridTemplateColumns.split(' ').length===1;})()`,
        ),
      );
      const archiveShot = await cdp("Page.captureScreenshot", {
        format: "png",
      });
      fs.writeFileSync(
        path.join(out, `exams-${width}.png`),
        Buffer.from(archiveShot.data, "base64"),
      );
      await evaluate(`__qbClick('مشاهده آزمون');`);
    }
    check(
      "archive preserves search and course filter after exam preview",
      await evaluate(`(()=>{
        __qbClick('بازگشت به آزمون‌های من');
        const title=document.querySelector('.qb-exam-card h3').textContent;
        __qbFill('جست‌وجوی آزمون',title);
        const filter=document.querySelector('.qb-archive-filters select');
        filter.value=filter.options[1].value;filter.dispatchEvent(new Event('change'));
        const selected=filter.value;
        __qbClick('مشاهده آزمون');__qbClick('بازگشت به آزمون‌های من');
        const restored=document.querySelector('.qb-archive-filters input').value===title&&document.querySelector('.qb-archive-filters select').value===selected&&document.querySelectorAll('.qb-exam-card').length>0;
        __qbFill('جست‌وجوی آزمون','');
        const reset=document.querySelector('.qb-archive-filters select');reset.value='';reset.dispatchEvent(new Event('change'));
        __qbClick('مشاهده آزمون');return restored;
      })()`),
    );
    const existingDownloads = new Set(fs.readdirSync(out));
    await cdp("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: out,
    });
    await evaluate(
      "__qbClick('بازگشت به آزمون‌های من');__qbClick('پشتیبان');__qbClick('دریافت فایل بانک')",
    );
    for (let i = 0; i < 100; i++) {
      if (
        fs
          .readdirSync(out)
          .some(
            (n) =>
              !existingDownloads.has(n) &&
              n.startsWith("Classyar-QuestionBank-") &&
              n.endsWith(".json"),
          )
      )
        break;
      await delay(100);
    }
    const downloaded = fs
      .readdirSync(out)
      .find(
        (n) =>
          !existingDownloads.has(n) &&
          n.startsWith("Classyar-QuestionBank-") &&
          n.endsWith(".json"),
      );
    check(
      "independent JSON download",
      !!downloaded &&
        JSON.parse(fs.readFileSync(path.join(out, downloaded), "utf8"))
          .format === "classyar-question-bank",
    );
    await evaluate("__qbClick('آزمون‌ها');__qbClick('مشاهده آزمون')");
    await cdp("Emulation.setEmulatedMedia", { media: "print" });
    check(
      "print only displays exam sheet",
      await evaluate(
        "getComputedStyle(document.querySelector('.qb-sheet')).display!=='none'&&(!document.getElementById('printRoot')||getComputedStyle(document.getElementById('printRoot')).display==='none')",
      ),
    );
    const printedShot = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(out, "print-sheet.png"),
      Buffer.from(printedShot.data, "base64"),
    );
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    const pdf = await cdp("Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true,
    });
    fs.writeFileSync(
      path.join(out, "exam.pdf"),
      Buffer.from(pdf.data, "base64"),
    );
    check(
      "real PDF generated",
      Buffer.from(pdf.data, "base64").subarray(0, 5).toString() === "%PDF-",
    );
    check(
      "separate print document excludes answers and cleans up",
      await evaluate(`(async()=>{
      const before=document.querySelector('.qb-sheet').outerHTML;let printed=false;
      const observer=new MutationObserver(()=>{const frame=document.querySelector('.qb-print-frame');if(frame)frame.contentWindow.print=()=>{printed=frame.contentDocument.body.textContent.includes('متن ویرایش شده')&&!frame.contentDocument.body.textContent.includes('SECRET-');frame.contentWindow.dispatchEvent(new Event('afterprint'));};});
      observer.observe(document.body,{childList:true});
      try{await EduQuestionBankUI.print((await EduQuestionBankRepository.read()).exams[0]);}finally{observer.disconnect();}
      return printed&&!document.querySelector('.qb-print-frame')&&document.querySelector('.qb-sheet').outerHTML===before;
    })()`),
    );
    await evaluate(`__qbClick('بازگشت به آزمون‌های من');`);
    check(
      "large bank renders only one compact page",
      await evaluate(`(async()=>{
      const b=await EduQuestionBankRepository.read();const seed=b.questions.find(q=>q.type==='blank');const extra=Array.from({length:1000},(_,i)=>({...seed,id:'bulk-'+i,text:'سؤال حجیم '+i+' '+seed.text}));
      await EduQuestionBankRepository.save({...b,questions:[...b.questions,...extra]},b.revision);__qbClick('بستن');await EduQuestionBankUI.open();
      const course=__qbFill('درس',b.courses[0].id);course.dispatchEvent(new Event('change'));
      return document.querySelectorAll('.qb-question-row').length===15&&[...document.querySelectorAll('.qb-question-row')].every(r=>!r.open);
    })()`),
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const bulkShot = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(out, "questions-large-390.png"),
      Buffer.from(bulkShot.data, "base64"),
    );
    check(
      "large bank live search remains focused",
      await evaluate(
        `(()=>{const search=__qbFill('جست‌وجو در سؤال‌ها','سؤال حجیم 999');search.focus();search.dispatchEvent(new Event('input',{bubbles:true}));return document.activeElement===search&&document.querySelectorAll('.qb-question-row').length===1&&document.querySelector('.qb-body').scrollWidth<=document.querySelector('.qb-body').clientWidth+1;})()`,
      ),
    );
    check(
      "archive searches all courses and paginates immutable exam snapshots",
      await evaluate(`(async()=>{
        const bank=await EduQuestionBankRepository.read();
        const seed=bank.exams[0];
        const extra=Array.from({length:13},(_,i)=>({...structuredClone(seed),id:'archive-'+i,title:'آزمون آرشیوی '+i,courseTitle:i===12?'كتاب عربي':'درس دیگر'}));
        await EduQuestionBankRepository.save({...bank,exams:[...bank.exams,...extra]},bank.revision);
        __qbClick('بستن');await EduQuestionBankUI.open();__qbClick('آزمون‌ها');
        const first=document.querySelectorAll('.qb-exam-card').length===12&&!document.querySelector('.qb-toolbar');
        const region=document.querySelector('.qb-exam-results'),controls=document.querySelector('.qb-archive-controls'),top=controls.getBoundingClientRect().top;
        region.scrollTop=300;const bounded=region.scrollTop>0&&region.clientHeight<=innerHeight*.55+1&&controls.getBoundingClientRect().top===top&&region.tabIndex===0;
        __qbClick('بعدی');const second=document.querySelectorAll('.qb-exam-card').length===2&&region.scrollTop===0;
        const search=__qbFill('جست‌وجوی آزمون','کتاب عربی');search.focus();search.dispatchEvent(new Event('input',{bubbles:true}));
        return first&&bounded&&second&&document.querySelectorAll('.qb-exam-card').length===1&&document.activeElement===search;
      })()`),
    );
    check(
      "simple modular course flow uses two fields then module and question without management menus",
      await evaluate(`(async()=>{
        __qbClick('سؤال‌ها');__qbClick('درس جدید');
        const form=document.querySelector('.qb-form');
        const simple=form.querySelectorAll('input,select,textarea').length===2;
        const type=__qbFill('نوع درس','module');type.dispatchEvent(new Event('change'));
        __qbFill('عنوان درس','دانش فنی');form.requestSubmit();await new Promise(r=>setTimeout(r,100));
        const labels=()=>[...document.querySelectorAll('.qb-dialog label')];
        const modular=labels().some(l=>l.firstChild.textContent==='پودمان')&&!document.querySelector('.qb-course-tools');
        __qbClick('پودمان جدید');__qbFill('عنوان پودمان','پودمان اول');document.querySelector('.qb-form').requestSubmit();await new Promise(r=>setTimeout(r,100));
        const bank=await EduQuestionBankRepository.read();const unit=bank.units.find(u=>u.title==='پودمان اول'&&bank.courses.find(c=>c.id===u.courseId)?.title==='دانش فنی');
        const selected=labels().find(l=>l.firstChild.textContent==='پودمان').querySelector('select').value===unit.id;
        __qbClick('افزودن سؤال');
        const ready=labels().find(l=>l.firstChild.textContent==='پودمان').querySelector('select').value===unit.id;
        const kind=__qbFill('نوع سؤال','boolean');kind.dispatchEvent(new Event('change'));
        __qbFill('متن سؤال','سؤال پودمان اول');__qbFill('پاسخ صحیح','false');document.querySelector('.qb-form').requestSubmit();await new Promise(r=>setTimeout(r,100));
        return simple&&modular&&selected&&ready&&document.querySelectorAll('.qb-question-row').length===1&&(await EduQuestionBankRepository.read()).questions.some(q=>q.unitId===unit.id&&q.answer===false);
      })()`),
    );
    check(
      "automatic backup writes a real browser file and persists its native handle",
      await evaluateGesture(`(async()=>{
        const service=EduQuestionBankFileBackup.service;
        const directory=await navigator.storage.getDirectory();
        const handle=await directory.getFileHandle('question-bank-auto-'+Date.now()+'.json',{create:true});
        const picker=window.showSaveFilePicker;
        try {
          window.showSaveFilePicker=async()=>handle;
          __qbClick('فعال‌سازی خودکار');
          for(let i=0;i<100&&service.state().state!=='active';i++)await new Promise(r=>setTimeout(r,30));
          if(service.state().state!=='active')throw Error(service.state().message);
        } finally {window.showSaveFilePicker=picker;}
        const stored=await EduQuestionBankRepository.readBackup();
        const first=EduQuestionBank.parse(await (await handle.getFile()).text());
        const source=await EduQuestionBankRepository.read();
        const initial=stored?.handle?.name===handle.name&&first.revision===source.revision;
        source.questions[0].text+=' — ثبت خودکار';
        const changed=await EduQuestionBankRepository.save(source,source.revision);
        let updated=false;
        for(let i=0;i<150;i++){
          await new Promise(r=>setTimeout(r,100));
          if(EduQuestionBank.parse(await (await handle.getFile()).text()).revision===changed.revision){updated=true;break;}
        }
        const peer=EduQuestionBankFileBackup.create(EduQuestionBankRepository);
        await peer.init();const resumed=peer.state().state==='active';peer.dispose();
        window.__qbAutomaticFile=handle;
        window.__qbAutomaticText=await (await handle.getFile()).text();
        __qbClick('بستن');await EduQuestionBankUI.open();
        __qbClick('پشتیبان');
        return initial&&updated&&resumed&&document.querySelector('.qb-file-status').dataset.state==='active';
      })()`),
    );
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(80);
      const backupControls = await evaluate(
        `(()=>{const body=document.querySelector('.qb-body');return {fits:body.scrollWidth<=body.clientWidth+1,automatic:document.querySelectorAll('.qb-file-actions button').length,buttons:[...document.querySelectorAll('.qb-file-actions button,.qb-backup-manual>button')].map(b=>({label:b.textContent,height:b.getBoundingClientRect().height,width:b.clientWidth,scroll:b.scrollWidth}))};})()`,
      );
      const backupFits =
        backupControls.fits &&
        backupControls.automatic === 3 &&
        backupControls.buttons.length === 5 &&
        backupControls.buttons.every(
          (b) =>
            b.height >= (width <= 700 ? 39.9 : 43.9) &&
            b.height <= 50 &&
            b.scroll <= b.width + 1,
        );
      if (!backupFits)
        console.log(
          "Backup control geometry",
          width,
          JSON.stringify(backupControls),
        );
      check(`backup manual and automatic controls fit ${width}`, backupFits);
      await evaluate(
        `document.querySelector('.qb-backup').scrollIntoView({block:'start'})`,
      );
      await delay(60);
      const backupShot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(out, `backup-${width}.png`),
        Buffer.from(backupShot.data, "base64"),
      );
    }
    // Validate restore preview with a genuinely selected File; no early mutation.
    check(
      "restore preview and complete replacement",
      await evaluate(
        `(async()=>{const before=await EduQuestionBankRepository.read();const replacement=EduQuestionBank.empty();const input=document.querySelector('.qb-dialog input[type=file]');const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(replacement)],'bank.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,80));const unchanged=JSON.stringify(await EduQuestionBankRepository.read())===JSON.stringify(before);const preview=document.querySelector('.qb-confirm')?.textContent.includes('0 درس');__qbClick('تأیید',document.querySelector('.qb-confirm'));await new Promise(r=>setTimeout(r,80));const after=await EduQuestionBankRepository.read();return unchanged&&preview&&!after.questions.length&&!after.exams.length&&!after.courses.length;})()`,
      ),
    );
    check(
      "restore suspends the file mirror and cancelling replacement preserves its previous bytes",
      await evaluateGesture(`(async()=>{
        const service=EduQuestionBankFileBackup.service;
        const preserved=(await (await __qbAutomaticFile.getFile()).text())===__qbAutomaticText;
        const paused=service.state().state==='paused'&&(await EduQuestionBankRepository.readBackup()).suspended==='restore';
        __qbClick('ذخیره اکنون');
        for(let i=0;i<100&&!document.querySelector('.qb-confirm');i++)await new Promise(r=>setTimeout(r,20));
        const confirmation=document.querySelector('.qb-confirm');
        if(!confirmation)throw Error(service.state().message);
        __qbClick('انصراف',confirmation);await new Promise(r=>setTimeout(r,30));
        const cancelled=(await (await __qbAutomaticFile.getFile()).text())===__qbAutomaticText;
        await service.stop();
        return preserved&&paused&&cancelled&&!(await EduQuestionBankRepository.readBackup())&&(await (await __qbAutomaticFile.getFile()).text())===__qbAutomaticText;
      })()`),
    );
    check(
      "atomic stale revision rejected across browser windows",
      await evaluateGesture(
        `(async()=>{const stale=await EduQuestionBankRepository.read();const peer=window.open('about:blank','question-bank-peer');if(!peer)throw Error('Peer window blocked');try{const script=peer.document.createElement('script');const loaded=new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;});script.src=new URL('assets/scripts/question-bank.js',location.href).href;peer.document.body.append(script);await loaded;await peer.EduQuestionBankRepository.save({...stale,courses:[{id:'winner',title:'پنجره دیگر',structure:'module'}]},stale.revision);try{await EduQuestionBankRepository.save(stale,stale.revision);return false;}catch(e){const current=await EduQuestionBankRepository.read();return current.courses[0].id==='winner'&&e.message.includes('پنجره');}}finally{peer.close();}})()`,
      ),
    );
    await evaluate(`__qbClick('بستن')`);
    check(
      "close restores focus",
      await evaluate(
        `!document.querySelector('.qb-dialog')&&(document.activeElement.classList.contains('question-bank-entry')||['workspaceToolsToggle','headerNavigationToggle'].includes(document.activeElement.id))`,
      ),
    );
    await evaluate("window.__qbBeforeReload=true");
    await cdp("Page.reload");
    for (let i = 0; i < 100; i++) {
      if (
        await evaluate(
          "!window.__qbBeforeReload&&!!window.EduV24?.test.getState().ready",
        )
      )
        break;
      await delay(100);
    }
    check(
      "school backup excludes bank",
      await evaluate(
        "(async()=>!JSON.stringify(await EduV24.snapshotInstallation()).includes('winner'))()",
      ),
    );
    check(
      "school restore preserves bank",
      await evaluate(
        "(async()=>{const bank=JSON.stringify(await EduQuestionBankRepository.read());const backup=await EduV24.snapshotInstallation();EduV24.previewFullBackup(backup);document.getElementById('fullRestoreConfirmed').checked=true;await EduV24.restoreFullBackup();return JSON.stringify(await EduQuestionBankRepository.read())===bank;})()",
      ),
    );
    check(
      "offline cache includes bank",
      await evaluate(
        `(async()=>{const keys=await caches.keys();for(const k of keys){const c=await caches.open(k);if(await c.match(new URL('assets/scripts/question-bank.js',location.href).href))return true;}return false;})()`,
      ),
    );
    check(
      "unsaved confirmation and Escape preserve editor",
      await evaluate(`(async()=>{
      const click=(label,scope=document.querySelector('.qb-dialog'))=>[...scope.querySelectorAll('button')].find(b=>b.textContent===label).click();
      closeModal();await EduQuestionBankUI.open();click('درس جدید');const input=document.querySelector('.qb-dialog form input');input.value='ذخیره نشده';input.dispatchEvent(new Event('input',{bubbles:true}));click('بستن');
      const confirmation=document.querySelector('.qb-confirm');const shown=!!confirmation&&document.querySelector('.qb-dialog').matches(':modal');
      confirmation.dispatchEvent(new Event('cancel',{cancelable:true}));const preserved=!!document.querySelector('.qb-dialog form')&&!document.querySelector('.qb-confirm');
      click('بستن');click('تأیید',document.querySelector('.qb-confirm'));return shown&&preserved&&!document.querySelector('.qb-dialog');
    })()`),
    );
    check(
      "school wipe preserves separate bank",
      await evaluate(`(async()=>{
      const before=JSON.stringify(await EduQuestionBankRepository.read());closeModal();await wipeAllData();
      document.getElementById('wipeText').value='حذف';document.getElementById('wipeBackup').checked=true;await EduV24.confirmWipe();
      return JSON.stringify(await EduQuestionBankRepository.read())===before;
    })()`),
    );
    await cdp("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await evaluate("window.__qbBeforeOffline=true");
    await cdp("Page.reload");
    for (let i = 0; i < 100; i++) {
      if (
        await evaluate(
          "!window.__qbBeforeOffline&&!!window.EduQuestionBankUI&&document.readyState==='complete'",
        )
      )
        break;
      await delay(100);
    }
    check(
      "bank opens after offline reload and school wipe",
      await evaluate(
        `(async()=>{await EduQuestionBankUI.open();const b=await EduQuestionBankRepository.read();return !navigator.onLine&&b.courses[0].id==='winner'&&!!document.querySelector('.qb-dialog');})()`,
      ),
    );
    fs.writeFileSync(
      path.join(out, "checks.json"),
      JSON.stringify(
        cases.filter((c) => c.name?.startsWith("question bank:")),
        null,
        2,
      ),
    );
    await cdp("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await cdp("Page.navigate", {
      url: require("node:url").pathToFileURL(path.join(out, "exam.pdf")).href,
    });
    await delay(1500);
    const pdfShot = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(out, "pdf-render.png"),
      Buffer.from(pdfShot.data, "base64"),
    );
    console.log("Question bank artifacts: " + out);
  },
}).catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
