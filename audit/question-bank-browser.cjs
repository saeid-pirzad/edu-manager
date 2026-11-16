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
    await evaluate(
      `window.__qbClick=(label,scope=document.querySelector('.qb-dialog'))=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent===label);if(!b)throw Error(label);b.click();};window.__qbFill=(label,value)=>{const l=[...document.querySelectorAll('.qb-dialog label')].find(l=>l.firstChild.textContent===label);if(!l)throw Error(label);const n=l.querySelector('input,textarea,select');n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));return n;};__qbClick('درس جدید');__qbFill('عنوان درس','درس آزمایشی');document.querySelector('.qb-dialog form').requestSubmit();`,
    );
    await delay(100);
    await evaluate(
      `__qbClick('افزودن بخش');__qbFill('عنوان فصل / پودمان','بخش آزمایشی');document.querySelector('.qb-dialog form').requestSubmit();`,
    );
    await delay(100);
    await evaluate(`__qbClick('ویرایش عنوان درس')`);
    await captureEditor("course");
    await evaluate(`__qbClick('بازگشت');__qbClick('افزودن بخش')`);
    await captureEditor("unit");
    await evaluate(`__qbClick('بازگشت')`);
    await evaluate(
      `__qbClick('افزودن سؤال');__qbFill('فصل / پودمان',document.querySelector('.qb-dialog form select').options[1].value);__qbFill('متن سؤال','متن سؤال آزمایشی <img src=x onerror=alert(1)>');for(let i=1;i<=4;i++)__qbFill('گزینه '+i,'گزینه آزمایشی '+i);__qbFill('پاسخ صحیح','2');__qbFill('توضیح پاسخ (اختیاری)','SECRET-EXPLANATION');__qbFill('بارم','۱٫۲۵');document.querySelector('.qb-dialog form').requestSubmit();`,
    );
    await delay(100);
    check(
      "question persisted safely",
      await evaluate(
        `(async()=>{const b=await EduQuestionBankRepository.read();return b.questions.length===1&&b.questions[0].score===125&&!document.querySelector('.qb-dialog img');})()`,
      ),
    );
    await evaluate(`__qbClick('ویرایش سؤال')`);
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
        __qbClick('افزودن سؤال');__qbFill('فصل / پودمان',(await EduQuestionBankRepository.read()).units[0].id);
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
      choose(original);let unit=[...document.querySelectorAll('.qb-dialog label')].find(l=>l.firstChild.textContent==='فصل / پودمان').querySelector('select');unit.value=b.units[0].id;unit.dispatchEvent(new Event('change'));
      choose('second-course');const cleared=[...document.querySelectorAll('.qb-dialog label')].find(l=>l.firstChild.textContent==='فصل / پودمان').querySelector('select').value==='';choose(original);return cleared;
    })()`),
    );
    await evaluate(
      `__qbClick('طرح آزمون');__qbClick('انتخاب همه');for(const label of ['چهارگزینه‌ای','جای‌خالی','تشریحی','صحیح / غلط'])__qbFill('تعداد '+label,'۱');__qbFill('عنوان آزمون','آزمون آزمایشی');document.querySelector('.qb-dialog form').requestSubmit();`,
    );
    await delay(100);
    check(
      "sheet excludes answers",
      await evaluate(
        `!!document.querySelector('.qb-sheet')&&!document.querySelector('.qb-sheet').textContent.includes('SECRET-EXPLANATION')&&!document.querySelector('.qb-sheet').textContent.includes('پاسخ صحیح')`,
      ),
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
        if (view === "questions")
          await evaluate(
            `__qbClick('بازگشت به آزمون‌های من');__qbClick('سؤال‌ها');`,
          );
        if (view === "builder") await evaluate(`__qbClick('طرح آزمون')`);
        if (view === "questions")
          check(
            `compact question rows ${width}`,
            await evaluate(
              `(()=>{const rows=[...document.querySelectorAll('.qb-results>.qb-question-row')];return rows.length===15&&rows.every(r=>!r.open&&r.getBoundingClientRect().height<=105)&&document.querySelector('.qb-body').scrollWidth<=document.querySelector('.qb-body').clientWidth+1;})()`,
            ),
          );
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
        if (view === "builder")
          check(
            `live exam composition ${width}`,
            await evaluate(
              `(()=>{__qbClick('انتخاب همه');for(const label of ['چهارگزینه‌ای','جای‌خالی','تشریحی','صحیح / غلط'])__qbFill('تعداد '+label,'۲');return document.querySelector('.qb-plan-summary').textContent.includes('۸')&&document.querySelectorAll('.qb-count-field[data-shortage=true]').length===3;})()`,
            ),
          );
      }
      await evaluate(
        `__qbClick('آزمون‌های من');if(document.querySelector('.qb-confirm'))__qbClick('تأیید',document.querySelector('.qb-confirm'));`,
      );
      check(
        `archive width ${width}`,
        await evaluate(
          `document.querySelector('.qb-body').scrollWidth<=document.querySelector('.qb-body').clientWidth+1`,
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
    const existingDownloads = new Set(fs.readdirSync(out));
    await cdp("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: out,
    });
    await evaluate(
      "__qbClick('بازگشت به آزمون‌های من');__qbClick('دریافت فایل بانک')",
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
    await evaluate("__qbClick('مشاهده آزمون')");
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
    // Validate restore preview with a genuinely selected File; no early mutation.
    check(
      "restore preview and complete replacement",
      await evaluate(
        `(async()=>{const before=await EduQuestionBankRepository.read();const replacement=EduQuestionBank.empty();const input=document.querySelector('.qb-dialog input[type=file]');const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(replacement)],'bank.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,80));const unchanged=JSON.stringify(await EduQuestionBankRepository.read())===JSON.stringify(before);const preview=document.querySelector('.qb-confirm')?.textContent.includes('0 درس');__qbClick('تأیید',document.querySelector('.qb-confirm'));await new Promise(r=>setTimeout(r,80));const after=await EduQuestionBankRepository.read();return unchanged&&preview&&!after.questions.length&&!after.exams.length&&!after.courses.length;})()`,
      ),
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
