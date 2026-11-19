"use strict";
const { main } = require("./data-integrity.cjs");
main({
  stage: "settings-ui",
  async runExtra({ cdp, evaluate, cases, delay }) {
    await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    const check = (name, pass) => {
      cases.push({ name: "settings UI: " + name, pass: !!pass });
      if (!pass) throw Error(name);
    };
    await evaluate("closeModal();goSchools();");
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 860,
        deviceScaleFactor: 1,
        mobile: width < 700,
      });
      await evaluate("openSettingsModal()");
      check(
        "responsive form " + width,
        await evaluate(
          `(()=>{const form=document.querySelector('#settingsEditor'),input=form.querySelector('#newPass'),rect=form.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth+1&&form.scrollWidth<=form.clientWidth+1&&input.getBoundingClientRect().height>=44;})()`,
        ),
      );
      check(
        "show password and remove controls " + width,
        await evaluate(
          `(()=>{const form=document.querySelector('#settingsEditor'),input=form.querySelector('#newPass'),show=form.querySelector('[data-settings-show-password]'),remove=form.querySelector('#removePassword');input.value='synthetic-secret';show.click();const visible=input.type==='text';show.click();const hidden=input.type==='password';remove.checked=true;remove.dispatchEvent(new Event('change'));const removed=input.disabled&&!input.value&&!show.checked&&show.disabled;remove.checked=false;remove.dispatchEvent(new Event('change'));return visible&&hidden&&removed&&!input.disabled&&!show.disabled;})()`,
        ),
      );
      await evaluate("closeModal()");
    }
    check(
      "new password persists",
      await evaluate(
        `(async()=>{await openSettingsModal();document.querySelector('#newPass').value='settings-ui-secret';return await saveSettings()&&await verifyPassword('settings-ui-secret',db.settings.password);})()`,
      ),
    );
    check(
      "removal preserves school information",
      await evaluate(
        `(async()=>{const original=JSON.stringify(db.schools);await openSettingsModal();document.querySelector('#removePassword').click();const saved=await saveSettings();return saved&&!db.settings.password&&JSON.stringify(db.schools)===original;})()`,
      ),
    );
  },
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
