"use strict";
// Extended synthetic review uses the same isolated runner as integrity checks.
const { main } = require("./data-integrity.cjs");
const {
  seniorReviewFlows,
  seniorUiReview,
  postFixFlows,
  headerEvents,
  courseFormEvents,
  courseTableEvents,
  gradeEvents,
  periodLabelEvents,
  securityRendering,
  delegatedUi,
  asyncTargets,
  singleFile,
  scopedNavigation,
  largeTable,
} = require("./flows/index.cjs");

if (process.argv.includes("--help")) {
  console.log(
    "node audit/workflow-review.cjs\nSynthetic browser regression and two-release PWA upgrade. Requires Node.js 22+, Edge and Git history containing 594217b.",
  );
} else {
  main({
    stage: "4-adversarial-workflow-review",
    async runExtra({ cdp, evaluate, cases, root, ws, delay }) {
      const evaluateFlow = evaluate;
      evaluate = async (expression) => {
        const label = expression.match(/^\((?:async )?function ([\w]+)/)?.[1];
        if (label) console.log("Review flow: " + label);
        return evaluateFlow(expression);
      };
      await require("./browser-ready.cjs")({ cdp, evaluate, delay });
      cases.push(
        ...(await evaluate(
          "(" + require("./flows/sessionAlerts.cjs").toString() + ")()",
        )),
      );
      cases.push(
        ...(await evaluate("(" + seniorReviewFlows.toString() + ")()")),
      );
      cases.push(...(await evaluate("(" + postFixFlows.toString() + ")()")));
      cases.push(...(await evaluate("(" + headerEvents.toString() + ")()")));
      cases.push(
        ...(await evaluate("(" + courseFormEvents.toString() + ")()")),
      );
      cases.push(
        ...(await evaluate("(" + courseTableEvents.toString() + ")()")),
      );
      cases.push(...(await evaluate("(" + gradeEvents.toString() + ")()")));
      cases.push(
        ...(await evaluate("(" + periodLabelEvents.toString() + ")()")),
      );
      cases.push(
        ...(await evaluate("(" + securityRendering.toString() + ")()")),
      );
      cases.push(...(await evaluate("(" + delegatedUi.toString() + ")()")));
      cases.push(...(await evaluate("(" + asyncTargets.toString() + ")()")));
      cases.push(...(await evaluate("(" + singleFile.toString() + ")()")));
      cases.push(
        ...(await evaluate("(" + scopedNavigation.toString() + ")()")),
      );
      cases.push(...(await evaluate("(" + largeTable.toString() + ")()")));
      await require("./mobile-ux.cjs")({ cdp, evaluate, cases, delay });
      await require("./csv-ux.cjs")({ cdp, evaluate, cases, delay });
      await require("./student-create-ux.cjs")({ cdp, evaluate, cases, delay });
      await require("./list-first-layout.cjs")({ cdp, evaluate, cases, delay });
      await require("./workspace-tools-ux.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await cdp("Emulation.setDeviceMetricsOverride", {
        width: 320,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      cases.push(...(await evaluate("(" + seniorUiReview.toString() + ")()")));
      cases.push(
        ...(await evaluate(
          "(" + require("./flows/businessConsistency.cjs").toString() + ")()",
        )),
      );
      cases.push(
        ...(await evaluate(
          "(" + require("./flows/workspaceScale.cjs").toString() + ")()",
        )),
      );
      cases.push(
        ...(await evaluate(
          "(" + require("./flows/fullRestoreSafety.cjs").toString() + ")()",
        )),
      );
      cases.push(
        ...(await require("./local-file.cjs")({ cdp, evaluate, root, delay })),
      );
      cases.push(
        ...(await evaluate(
          "(" + require("./flows/backupSharing.cjs").toString() + ")()",
        )),
      );
      for (const flow of [
        "unifiedBackup",
        "sharedYearDirectory",
        "sharedYearCourses",
        "academicYearSafety",
        "importReplacement",
      ])
        cases.push(
          ...(await evaluate(
            "(" + require("./flows/" + flow + ".cjs").toString() + ")()",
          )),
        );
      await require("./academic-backup-lifecycle.cjs")({
        cdp,
        evaluate,
        cases,
      });
      await require("./period-import-browser.cjs")({ cdp, evaluate, cases });
      await require("./annual-modular-browser.cjs")({ cdp, evaluate, cases });
      await require("./protected-grade-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./recovered-name-undo-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./flows/singleYear.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./frozen-modular-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./cross-term-session-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./report-copy-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
        ws,
      });
      await require("./assessment-status-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      cases.push(
        ...(await evaluate(
          "(" + require("./flows/annualActivityView.cjs").toString() + ")()",
        )),
      );
      cases.push(
        ...(await evaluate(
          "(" + require("./flows/annualBackupRoundtrip.cjs").toString() + ")()",
        )),
      );
      await require("./report-excel-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./session-schedule-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./daily-session-browser.cjs").run({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./report-export-layout.cjs")({ cdp, evaluate, cases });
      await require("./deputy-report-action.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./report-surface-layout.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./report-session-layout.cjs")({ cdp, evaluate, cases });
      await require("./session-pdf-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./parent-performance-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./report-range-controls.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./karnameh-excel-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./karnameh-grid-browser.cjs")({
        cdp,
        evaluate,
        cases,
        delay,
      });
      await require("./button-controls-browser.cjs").run({
        cdp,
        evaluate,
        cases,
        delay,
      });
      cases.push(
        ...(await require("./pwa-upgrade.cjs")({
          cdp,
          debuggerUrl: ws.url,
          root,
        })),
      );
    },
  }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
}
