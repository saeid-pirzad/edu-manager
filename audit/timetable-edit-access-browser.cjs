"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { main } = require("./data-integrity.cjs");
const { seedReminders } = require("./attendance-reminders-browser.cjs");
const {
  unlockExistingTimetableForAudit,
} = require("./timetable-edit-test-helpers.cjs");
async function run({ cdp, evaluate, cases, delay }) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-timetable-edit-"),
  );
  const check = (id, pass, observed) =>
    cases.push({
      id: "TIMETABLE_EDIT_" + id,
      name: id,
      pass: !!pass,
      observed,
    });
  const signature = () =>
    evaluate(`(async()=>{
      const snapshot=await EduV24.snapshotInstallation();
      return JSON.stringify({data:db,stores:snapshot.stores,reportDrafts:snapshot.reportDrafts,gradeDrafts:snapshot.gradeDrafts});
    })()`);
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const original = await evaluate("EduV24.snapshotInstallation()");
  try {
    await evaluate("(" + seedReminders.toString() + ")()");
    await evaluate("closeModal();openMasterConfig(0,0)");
    const initial = await evaluate(
      `(()=>{const r=document.querySelector('.week-config-editor');return {mode:r.dataset.configMode,locked:[...r.querySelectorAll('select')].every(c=>c.disabled),edit:!!r.querySelector('[data-legacy-click="week-config-enable-edit"]')}})()`,
    );
    check(
      "EXISTING_IS_READ_ONLY",
      initial.mode === "view" && initial.locked && initial.edit,
      initial,
    );
    const lockedBefore = await signature(),
      rejected = await evaluate(
        `(async()=>{const before=JSON.stringify(db.masterSchedule),errors=[];for(const fn of [()=>saveMasterConfig(0,0),()=>clearMasterConfig(0,0)]){try{await fn()}catch(e){errors.push(e.message)}}return {errors,unchanged:before===JSON.stringify(db.masterSchedule)}})()`,
      );
    check(
      "DIRECT_WRITES_BLOCKED",
      rejected.errors.length === 2 &&
        rejected.errors.every((message) =>
          message.includes("ابتدا ویرایش برنامهٔ این زنگ را فعال کنید"),
        ) &&
        rejected.unchanged &&
        lockedBefore === (await signature()),
      rejected,
    );
    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(40);
      const layout = await evaluate(
        `(()=>{const r=document.querySelector('.week-config-editor'),b=r.querySelector('.week-config-access button'),m=document.getElementById('modalBody');return {overflow:m.scrollWidth>m.clientWidth+1,height:b.getBoundingClientRect().height}})()`,
      );
      check("LAYOUT_" + width, !layout.overflow && layout.height >= 44, layout);
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(directory, "view-" + width + ".png"),
        Buffer.from(shot.data, "base64"),
      );
    }
    const unlockBefore = await signature();
    await evaluate("(" + unlockExistingTimetableForAudit.toString() + ")()");
    check(
      "EXPLICIT_EDIT_UNLOCKS",
      unlockBefore === (await signature()) &&
        (await evaluate(
          `(()=>{const r=document.querySelector('.week-config-editor');return r.dataset.configMode==='edit'&&[...r.querySelectorAll('select')].every(c=>!c.disabled)})()`,
        )),
    );
    const result = await evaluate(
      `(async()=>{const before=JSON.stringify(db.masterSchedule),sessions=JSON.stringify(db.sessions);await saveMasterConfig(0,0);openMasterConfig(0,0);return {same:before===JSON.stringify(db.masterSchedule),history:sessions===JSON.stringify(db.sessions),relocked:document.querySelector('.week-config-editor').dataset.configMode==='view'}})()`,
    );
    check(
      "SAVE_AND_REOPEN_RELOCK",
      result.same && result.history && result.relocked,
      result,
    );
    await evaluate("closeModal();openMasterConfig(0,5)");
    check(
      "EMPTY_SLOT_STARTS_EDITABLE",
      await evaluate(
        `(()=>{const r=document.querySelector('.week-config-editor');return r.dataset.configMode==='edit'&&[...r.querySelectorAll('select')].every(c=>!c.disabled)})()`,
      ),
    );
    await evaluate("closeModal()");
    check(
      "CLOSED_DIALOG_CANNOT_WRITE",
      await evaluate(
        `(async()=>{try{await saveMasterConfig(0,5);return false}catch(e){return true}})()`,
      ),
    );
    console.log("Timetable previews: " + directory);
  } finally {
    await evaluate(
      `(async()=>{closeModal();EduV24.previewFullBackup(${JSON.stringify(original)});document.getElementById('fullRestoreConfirmed').checked=true;await EduV24.restoreFullBackup()})()`,
    );
  }
}
module.exports = { run };
if (require.main === module)
  main({ stage: "timetable-edit-access", runExtra: run }).catch((e) => {
    console.error(e.stack || e);
    process.exitCode = 2;
  });
