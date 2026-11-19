"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { setup } = require("./daily-session-browser.cjs");
const { main } = require("./data-integrity.cjs");

main({
  stage: "session-history-pagination",
  runExtra: async (env) => {
    const { evaluate, cdp, cases } = env;
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "edu-history-pages-"),
    );
    const check = (name, result) => {
      cases.push({ name, pass: result === true, observed: result });
      if (result !== true) throw Error(name + ": " + JSON.stringify(result));
    };
    await require("./browser-ready.cjs")(env);
    try {
      await evaluate(`(${setup.toString()})()`);
      await evaluate(`(async()=>{
        const audit=globalThis.__dailySessionAudit,seed=structuredClone(db.sessions[0]);
        const range=EduAcademicYear.range(db.settings.academicYear);
        const offset=(audit.day-getDayIdxFromDate(range.start)+7)%7;
        for(let week=0,added=0;added<17;week++){
          const date=new Date(Date.parse(range.start+'T12:00:00Z')+(offset+week*7)*86400000).toISOString().slice(0,10);
          if(date===seed.date)continue;
          db.sessions.push({...structuredClone(seed),id:'history-'+(++added),date});
        }
        db.sessions.push({...structuredClone(seed),id:'other-period',period:1});
        await saveDB();await EduV24.test.settle();
        audit.expected=JSON.stringify(db.sessions.filter(s=>s.classId===audit.ids.classroom&&s.period===0&&getDayIdxFromDate(s.date)===audit.day).sort((a,b)=>b.date.localeCompare(a.date)).map(s=>s.id));
        audit.oldest=JSON.parse(audit.expected).at(-1);
        audit.before=JSON.stringify(db.sessions);
      })()`);
      for (const width of [320, 390, 768, 1280]) {
        await cdp("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await evaluate(
          `(()=>{closeModal();goMaster();clickMasterCell(__dailySessionAudit.day,0);})()`,
        );
        check(
          "history initial page is compact with navigation and no horizontal overflow " +
            width,
          await evaluate(`(()=>{
          const section=document.querySelector('.session-setup-history'),pager=section.querySelector('.session-history-pager'),modal=document.getElementById('modalBody');
          return section.querySelectorAll('.session-setup-recent-item').length===5&&section.dataset.historyPage==='0'&&
            pager.querySelector('[aria-label="قبلی"]').disabled&&pager.querySelector('[aria-current="page"]').getAttribute('aria-label')==='صفحه ۱'&&
            pager.scrollWidth<=pager.clientWidth+1&&modal.scrollWidth<=modal.clientWidth+1&&[...pager.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44);
        })()`),
        );
        check(
          "all 18 dates remain reachable and ordered without changing the form or stored session data " +
            width,
          await evaluate(`(()=>{
          const date=document.getElementById('sessNewDate');date.value='2026-11-18';
          const form=()=>['sessNewClass','sessNewLesson','sessNewDate'].map(id=>document.getElementById(id).value).join('|');
          const before=form(),seen=[];let count=0;
          while(count++<10){
            const section=document.querySelector('.session-setup-history');
            seen.push(...[...section.querySelectorAll('.session-setup-recent-item')].map(b=>b.getAttribute('data-legacy-click-arg0')));
            const next=section.querySelector('[aria-label="بعدی"]');if(next.disabled)break;next.click();
          }
          const section=document.querySelector('.session-setup-history');
          return JSON.stringify(seen)===__dailySessionAudit.expected&&new Set(seen).size===18&&section.dataset.historyPage==='3'&&
            section.querySelectorAll('.session-setup-recent-item').length===3&&form()===before&&JSON.stringify(db.sessions)===__dailySessionAudit.before;
        })()`),
        );
        await evaluate(
          `document.querySelector('.session-setup-history').scrollIntoView({block:'end'});`,
        );
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(directory, "history-" + width + ".png"),
          Buffer.from(shot.data, "base64"),
        );
        check(
          "page numbers navigate directly and clamp invalid targets " + width,
          await evaluate(`(()=>{
          document.querySelector('.session-history-pages [aria-label="صفحه ۲"]').click();
          const second=document.querySelector('.session-setup-history').dataset.historyPage==='1';
          renderSessionSetupHistory(1000);const last=document.querySelector('.session-setup-history').dataset.historyPage==='3';
          renderSessionSetupHistory(-1000);return second&&last&&document.querySelector('.session-setup-history').dataset.historyPage==='0';
        })()`),
        );
      }
      check(
        "sessions beyond the former 15-item limit open their original read-only record",
        await evaluate(`(()=>{
        renderSessionSetupHistory(3);
        [...document.querySelectorAll('.session-setup-recent-item')].find(b=>b.getAttribute('data-legacy-click-arg0')===__dailySessionAudit.oldest).click();
        return currentSessionId===__dailySessionAudit.oldest&&!!document.querySelector('.session-workspace [data-session-edit-control]');
      })()`),
      );
      await evaluate(
        `(()=>{closeModal();goMaster();clickMasterCell(__dailySessionAudit.day,1);})()`,
      );
      check(
        "single page history has no unnecessary pager",
        await evaluate(
          `document.querySelectorAll('.session-setup-recent-item').length===1&&!document.querySelector('.session-history-pager')`,
        ),
      );
    } finally {
      await evaluate(
        `(async()=>{const a=globalThis.__dailySessionAudit;if(a)await a.restore(a.original);delete globalThis.__dailySessionAudit;})()`,
      );
      console.log("History pagination audit images: " + directory);
    }
  },
});
