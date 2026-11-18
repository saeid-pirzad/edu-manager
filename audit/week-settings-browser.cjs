"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { main } = require("./data-integrity.cjs");
main({
  stage: "week-settings",
  async runExtra({ cdp, evaluate, cases, root, delay }) {
    await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    const out = path.join(root, ".cache", "week-settings");
    fs.mkdirSync(out, { recursive: true });
    const check = (name, pass, observed = {}) => {
      cases.push({ name: "week settings: " + name, pass: !!pass, observed });
      if (!pass) throw Error(name + ": " + JSON.stringify(observed));
    };
    const wait = async (expression) => {
      for (let i = 0; i < 150; i++) {
        if (await evaluate(expression)) return;
        await delay(30);
      }
      throw Error("Timed out: " + expression);
    };
    await evaluate(
      "closeModal();goMaster();document.querySelector('.week-settings').open=true;window.__weekOriginal=JSON.stringify(db)",
    );
    check(
      "settings open locked with an explicit edit action",
      await evaluate(
        `(()=>{const root=document.querySelector('.week-settings');return root.dataset.editMode==='view'&&root.querySelector('.week-settings-fields').disabled&&!!root.querySelector('[data-workspace-action=week-settings-toggle-edit]')&&[...root.querySelectorAll('.week-settings-body input,.week-settings-body button')].every(c=>c.matches(':disabled'));})()`,
      ),
    );
    check(
      "direct commands cannot bypass the view lock",
      await evaluate(
        `(async()=>{let blocked=0;for(const command of [()=>toggleActiveDay(0),()=>changePeriods(1),()=>saveWeekStartDate()])try{await command();}catch{blocked++;}return blocked===3&&JSON.stringify(db)===__weekOriginal;})()`,
      ),
    );
    await evaluate(
      "document.querySelector('[data-workspace-action=week-settings-toggle-edit]').click()",
    );
    check(
      "explicit edit unlocks days, periods and date",
      await evaluate(
        `(()=>{const root=document.querySelector('.week-settings');return root.dataset.editMode==='edit'&&!root.querySelector('.week-settings-fields').disabled&&[...root.querySelectorAll('.week-settings-body input,.week-settings-body button')].every(c=>!c.matches(':disabled'));})()`,
      ),
    );
    await evaluate(
      "window.__weekOldDays=[...db.activeDays];document.querySelector('.week-working-days input').click()",
    );
    await wait(
      "document.querySelector('.week-settings').dataset.editMode==='edit'&&db.activeDays.includes(0)!==__weekOldDays.includes(0)",
    );
    await evaluate("(async()=>{await EduV24.test.settle();})()");
    await wait(
      "!document.querySelector('[data-legacy-click=\"schedule-timetable:7\"]').matches(':disabled')",
    );
    check(
      "a saved day change preserves editing within the same page",
      await evaluate(
        "!document.querySelector('.week-settings-fields').disabled&&db.activeDays.includes(0)!==__weekOldDays.includes(0)",
      ),
    );
    await evaluate(
      "window.__weekOldPeriods=db.periods;document.querySelector('[data-legacy-click=\"schedule-timetable:7\"]').click()",
    );
    await wait("db.periods===__weekOldPeriods+1");
    await evaluate("(async()=>{await EduV24.test.settle();})()");
    check(
      "period changes persist without leaving edit mode",
      await evaluate(
        "document.querySelector('.week-settings').dataset.editMode==='edit'&&db.periods===__weekOldPeriods+1",
      ),
    );
    for (const width of [320, 390, 768, 1024, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(80);
      const header = await evaluate(
        `(()=>{const root=document.querySelector('.week-settings'),bar=root.querySelector('.week-settings-access'),button=bar.querySelector('button'),status=bar.querySelector(':scope > span'),a=status.getBoundingClientRect(),b=button.getBoundingClientRect();return {open:root.open,fits:bar.scrollWidth<=bar.clientWidth+1,aligned:Math.abs((a.top+a.bottom-b.top-b.bottom)/2)<2,separate:!root.querySelector('summary').contains(button)};})()`,
      );
      check(
        "header status and edit action align without overflow " + width,
        header.open && header.fits && header.aligned && header.separate,
        header,
      );
      await evaluate(
        "document.querySelector('.week-settings').scrollIntoView({block:'start'})",
      );
      const headerShot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(out, `header-${width}.png`),
        Buffer.from(headerShot.data, "base64"),
      );
      const observed = await evaluate(
        `(()=>{const row=document.querySelector('.week-start-date'),input=row.querySelector('input[data-gregorian-target]'),button=row.querySelector(':scope > button'),a=input.getBoundingClientRect(),b=button.getBoundingClientRect();return {width:innerWidth,field:{top:a.top,bottom:a.bottom,height:a.height},button:{top:b.top,bottom:b.bottom,height:b.height},fits:document.documentElement.scrollWidth<=innerWidth+1&&row.scrollWidth<=row.clientWidth+1,aligned:Math.abs(a.height-b.height)<1&&Math.abs(a.bottom-b.bottom)<1};})()`,
      );
      check(
        "responsive origin input and save control " + width,
        observed.fits && (width <= 700 || observed.aligned),
        observed,
      );
      await evaluate(
        "document.querySelector('.week-settings-origin').scrollIntoView({block:'center'})",
      );
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(out, `origin-${width}.png`),
        Buffer.from(shot.data, "base64"),
      );
    }
    await evaluate(
      "document.getElementById('weekStartInput').value=db.settings.weekStartDate==='2026-10-31'?'2026-11-07':'2026-10-31';window.__weekChosen=document.getElementById('weekStartInput').value;document.querySelector('[data-legacy-click=\"schedule-timetable:9\"]').click()",
    );
    await wait("db.settings.weekStartDate===__weekChosen");
    await evaluate("(async()=>{await EduV24.test.settle();})()");
    check(
      "origin save keeps the confirmed date",
      await evaluate("db.settings.weekStartDate===__weekChosen"),
    );
    await evaluate(
      "document.querySelector('[data-workspace-action=week-settings-toggle-edit]').click()",
    );
    check(
      "finishing editing locks all setting controls",
      await evaluate(
        "document.querySelector('.week-settings').dataset.editMode==='view'&&document.querySelector('.week-settings-fields').disabled",
      ),
    );
    await evaluate(
      "document.querySelector('[data-workspace-action=week-settings-toggle-edit]').click();goSchools();goMaster();document.querySelector('.week-settings').open=true",
    );
    check(
      "leaving and returning does not retain an edit lease",
      await evaluate(
        "document.querySelector('.week-settings').dataset.editMode==='view'&&document.querySelector('.week-settings-fields').disabled",
      ),
    );
    await evaluate(
      "document.querySelector('[data-workspace-action=week-settings-toggle-edit]').click();document.querySelector('.week-settings').open=false",
    );
    check(
      "closed settings remain visually collapsed",
      await evaluate(
        "getComputedStyle(document.querySelector('.week-settings-body')).display==='none'",
      ),
    );
    await wait(
      "document.querySelector('.week-settings').dataset.editMode==='view'",
    );
    check(
      "collapsing settings also revokes editing",
      await evaluate(
        "document.querySelector('.week-settings-fields').disabled",
      ),
    );
    console.log("Week settings previews: " + out);
  },
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
