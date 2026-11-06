"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { main } = require("./data-integrity.cjs"),
  { seedReminders } = require("./attendance-reminders-browser.cjs");

async function run({ cdp, evaluate, cases, delay }) {
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "edu-session-edit-lock-"),
    ),
    check = (id, pass, observed) =>
      cases.push({
        id: "SESSION_EDIT_" + id,
        name: id,
        pass: !!pass,
        observed,
      }),
    wait = async (expression) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await evaluate(expression)) return;
        await delay(30);
      }
      throw Error("Session edit lock wait: " + expression);
    },
    click = (selector) =>
      evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),
    signature = () =>
      evaluate(
        `(async()=>{const s=await EduV24.snapshotInstallation();return JSON.stringify(s.stores)})()`,
      );
  console.log("Session edit previews: " + directory);
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const original = await evaluate("EduV24.snapshotInstallation()");
  await evaluate("(" + seedReminders.toString() + ")()");
  try {
    await evaluate(`(async()=>{
      db.sessions[0].scores.push({studentId:'reminder-student-a',type:'positive',value:1,note:'Synthetic prior activity'});
      await saveDB();closeModal();openSessionModal(db.sessions[0]);
    })()`);
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .session-workspace[data-session-mode=view]')",
    );
    const initial = await evaluate(`(()=>{
      const root=document.querySelector('.session-workspace'),controls=[...root.querySelectorAll('[data-mutating="1"],form[data-mutating="1"] input,form[data-mutating="1"] select,form[data-mutating="1"] button')].filter(el=>el.matches('button,input,select,textarea')&&!el.hasAttribute('data-session-edit-control'));
      return {mode:root.dataset.sessionMode,writeControls:controls.length,locked:controls.every(el=>el.disabled),
      search:!root.querySelector('.session-attendance-search input').disabled,tabs:[...root.querySelectorAll('[data-session-tab]')].every(el=>!el.disabled),
      copy:!root.querySelector('[data-legacy-click="sessions-dialog:13"]').disabled,
      dates:['sessDate','sessPeriod'].every(id=>document.getElementById(id).disabled),unlock:!root.querySelector('[data-session-edit-control]').disabled};
    })()`);
    check(
      "READ_ONLY_DEFAULT",
      initial.mode === "view" &&
        initial.writeControls > 10 &&
        initial.locked &&
        initial.search &&
        initial.tabs &&
        initial.copy &&
        initial.dates &&
        initial.unlock,
      initial,
    );
    const before = await signature();
    await evaluate(`(async()=>{
      const root=document.querySelector('.session-workspace');
      root.querySelector('.att-btns .absent').click();
      root.querySelector('[data-legacy-click="sessions-dialog:7"]').click();
      showSessionPanel('activity');root.querySelector('[data-legacy-click="sessions-dialog:12"]').click();
      const errors=[];
      for(const action of [()=>setAllAttendance('absent'),()=>toggleAtt(root.querySelector('.att-btns .absent'),'absent'),()=>removeSessionScore(currentSessionId,0),()=>saveSessionUnit()]){
        try{await action()}catch(error){errors.push(error.message)}
      }
      globalThis.__sessionLockedErrors=errors;
    })()`);
    check(
      "NO_ACCIDENTAL_WRITES",
      before === (await signature()) &&
        (await evaluate(
          "globalThis.__sessionLockedErrors.length===4&&globalThis.__sessionLockedErrors.every(t=>t.includes('فقط برای مشاهده'))",
        )),
    );
    for (const width of [320, 390, 768, 1024, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evaluate(
        "showSessionPanel('attendance');document.getElementById('modalBody').scrollTop=0",
      );
      await delay(60);
      const layout = await evaluate(
        `(()=>{const notice=document.querySelector('.session-edit-notice'),button=notice.querySelector('button'),r=notice.getBoundingClientRect(),b=button.getBoundingClientRect(),m=document.querySelector('.modal-dialog').getBoundingClientRect();return{width:innerWidth,height:b.height,inside:b.left>=r.left&&b.right<=r.right+1&&r.left>=m.left&&r.right<=m.right+1,overflow:document.getElementById('modalBody').scrollWidth>document.getElementById('modalBody').clientWidth+1}})()`,
      );
      check(
        "LAYOUT_" + width,
        layout.height >= 44 && layout.inside && !layout.overflow,
        layout,
      );
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(directory, `session-view-${width}.png`),
        Buffer.from(shot.data, "base64"),
      );
    }
    await click("[data-workspace-action=session-toggle-edit]");
    await wait(
      "!!document.querySelector('.session-workspace[data-session-mode=edit]')",
    );
    check("UNLOCK_IS_NON_MUTATING", before === (await signature()));
    await click('.att-btns[data-sid="reminder-student-a"] .absent');
    await wait(
      "db.sessions[0].attendance['reminder-student-a']==='absent'&&!EduV24.test.getState().busy",
    );
    await evaluate(
      `showSessionPanel('activity');const f=document.querySelector('.session-entry-form');f.elements.studentId.value='reminder-student-b';f.elements.type.value='positive';f.elements.value.value='2';f.elements.note.value='Intentional synthetic edit';f.requestSubmit()`,
    );
    await wait(
      "db.sessions[0].scores.length===2&&!EduV24.test.getState().busy&&!!document.querySelector('.session-workspace[data-session-mode=edit]')",
    );
    check(
      "INTENTIONAL_EDITS_PERSIST_AND_KEEP_MODE",
      await evaluate(
        "db.sessions[0].attendance['reminder-student-a']==='absent'&&document.querySelector('.session-entry-form').elements.studentId.value==='reminder-student-b'",
      ),
    );
    const afterEdit = await signature();
    await click("[data-workspace-action=session-toggle-edit]");
    await click('.att-btns[data-sid="reminder-student-a"] .present');
    check(
      "FINISH_EDIT_RELOCKS_WITHOUT_WRITE",
      afterEdit === (await signature()) &&
        (await evaluate(
          "document.querySelector('.session-workspace').dataset.sessionMode==='view'",
        )),
    );
    await evaluate("closeModal();openSessionModal(db.sessions[0])");
    check(
      "REOPEN_RELOCKS",
      await evaluate(
        "document.querySelector('.session-workspace').dataset.sessionMode==='view'",
      ),
    );
    await click("[data-workspace-action=session-toggle-edit]");
    await evaluate(
      "EduV24.openYearSession('reminder-second','reminder-complete-peer')",
    );
    check(
      "PEER_TERM_RELOCKS",
      await evaluate(
        "EduV24.getReportContext().id==='reminder-second'&&document.querySelector('.session-workspace').dataset.sessionMode==='view'",
      ),
    );
    await evaluate(
      `closeModal();goSchool('reminder-school');goClass('reminder-class');goLesson('reminder-lesson');setTab('sessions')`,
    );
    await evaluate(
      `(()=>{const f=document.querySelector('.session-create-form');f.elements.date.value=${JSON.stringify(await evaluate("todayISO()"))};refreshSessionDateSchedule();f.elements.period.value='2';f.requestSubmit()})()`,
    );
    await wait(
      "!!document.querySelector('#modal:not(.hidden) .session-workspace[data-session-mode=edit]')&&!EduV24.test.getState().busy",
    );
    const createdId = await evaluate("currentSessionId");
    check(
      "NEW_SESSION_EDITABLE",
      await evaluate(
        "getSessionById(currentSessionId).date===todayISO()&&Object.keys(getSessionById(currentSessionId).attendance).length===0",
      ),
    );
    await evaluate(
      "closeModal();openSessionModal(getSessionById(" +
        JSON.stringify(createdId) +
        "))",
    );
    check(
      "EMPTY_STORED_SESSION_RELOCKS",
      await evaluate(
        "document.querySelector('.session-workspace').dataset.sessionMode==='view'",
      ),
    );
    await click("[data-workspace-action=session-toggle-edit]");
    await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    await evaluate(
      "openSessionModal(getSessionById(" + JSON.stringify(createdId) + "))",
    );
    check(
      "RELOAD_NEVER_PERSISTS_PERMISSION",
      await evaluate(
        "document.querySelector('.session-workspace').dataset.sessionMode==='view'",
      ),
    );
    await evaluate(
      "EduV24.test.getState().workspace.closed=true;EduV24.refreshControlLocks()",
    );
    check(
      "CLOSED_TERM_CANNOT_UNLOCK",
      await evaluate(
        "document.querySelector('[data-session-edit-control]').disabled",
      ),
    );
    await evaluate("EduV24.test.getState().workspace.closed=false");
  } finally {
    await evaluate(
      `(async()=>{closeModal();EduV24.previewFullBackup(${JSON.stringify(original)});document.getElementById('fullRestoreConfirmed').checked=true;await EduV24.restoreFullBackup()})()`,
    );
  }
  check(
    "PREVIEWS",
    fs.readdirSync(directory).filter((name) => name.endsWith(".png")).length ===
      5,
    { directory },
  );
}

module.exports = { run };
if (require.main === module)
  main({ stage: "session-edit-access", runExtra: run }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
