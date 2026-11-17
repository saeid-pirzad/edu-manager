"use strict";
// Only backup-file flows, on a temporary origin and browser profile. Never uses
// a user's selected file: all real handles belong to the disposable OPFS.
const { main } = require("./data-integrity.cjs");
const singleFile = require("./flows/singleFile.cjs");

main({
  stage: "backup-file-permissions",
  async runExtra({ cdp, evaluate, cases, delay }) {
    for (const width of [360, 768, 1440]) {
      // The naming regression restores its local ledger after each run. Reload
      // also resets its device-only in-memory reservation counter per viewport.
      await require("./browser-ready.cjs")({ cdp, evaluate, delay });
      console.log("Backup permission viewport: " + width);
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const results = await evaluate("(" + singleFile.toString() + ")()");
      cases.push(
        ...results.map((result) => ({
          ...result,
          id: result.id + "_VIEWPORT_" + width,
          observed: { ...result.observed, viewportWidth: width },
        })),
      );
      if (results.some((result) => !result.pass)) break;
    }
  },
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 2;
});
