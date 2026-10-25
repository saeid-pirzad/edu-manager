"use strict";
// Extended synthetic review uses the same isolated runner as integrity checks.
const { main } = require("./data-integrity.cjs");
const { seniorReviewFlows, seniorUiReview, postFixFlows } = require("./flows/index.cjs");

if (process.argv.includes("--help")) {
  console.log("node audit/workflow-review.cjs\nSynthetic browser regression and two-release PWA upgrade. Requires Node.js 22+, Edge and Git history containing 594217b.");
} else {
  main({
    stage: "4-adversarial-workflow-review",
    async runExtra({ cdp, evaluate, cases, root, ws, delay }) {
      await cdp("Page.reload");
      await delay(500);
      let ready = false;
      for (let i = 0; i < 150; i++) {
        ready = await evaluate("!!window.EduV24?.test?.getState().ready");
        if (ready) break;
        await delay(100);
      }
      if (!ready) throw Error("Application did not recover before the extended review.");
      cases.push(...await evaluate("(" + seniorReviewFlows.toString() + ")()"));
      cases.push(...await evaluate("(" + postFixFlows.toString() + ")()"));
      await cdp("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
      cases.push(...await evaluate("(" + seniorUiReview.toString() + ")()"));
      cases.push(...await require("./pwa-upgrade.cjs")({ cdp, debuggerUrl: ws.url, root }));
    },
  }).catch(error => { console.error(error.stack || String(error)); process.exitCode = 2; });
}
