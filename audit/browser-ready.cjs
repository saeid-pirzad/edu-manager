"use strict";

// The school bootstrap can finish while the parser is still loading the final
// question-bank script. A fresh school-ready flag alone is not full readiness.
async function waitReady(
  { evaluate, delay },
  { attempts = 150, marker = "__eduAuditBeforeReload" } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      if (
        await evaluate(
          "!globalThis[" +
            JSON.stringify(marker) +
            '] && document.readyState === "complete" && !!globalThis.EduV24?.getReportContext?.().ready' +
            ' && typeof globalThis.EduQuestionBankRepository?.read === "function"' +
            ' && typeof globalThis.EduQuestionBankRepository?.readBackup === "function"' +
            ' && typeof globalThis.EduQuestionBankUI?.open === "function"',
        )
      ) {
        await require("./session-edit-test-helpers.cjs").installSessionEditTestHelper(
          evaluate,
        );
        return;
      }
    } catch (error) {
      if (
        !/Execution context was destroyed|Cannot find (?:default execution )?context|Inspected target navigated/i.test(
          error.message || String(error),
        )
      )
        throw error;
    }
    await delay(100);
  }
  throw Error(
    "Browser reload did not reach a fresh, ready application context",
  );
}

// Mark the old execution context before exactly one requested navigation. The
// wait-only helper also supports application-triggered reloads such as reset.
async function reloadReady(tools, { attempts = 150, ignoreCache = true } = {}) {
  await tools.evaluate("globalThis.__eduAuditBeforeReload = true");
  await tools.cdp("Page.reload", { ignoreCache });
  await waitReady(tools, { attempts });
}

module.exports = reloadReady;
module.exports.waitReady = waitReady;
