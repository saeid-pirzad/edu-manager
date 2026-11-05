"use strict";

// A readiness flag in the old execution context is not evidence that a reload
// completed. Mark that context before navigation and wait for a fresh one.
module.exports = async function reloadReady(
  { cdp, evaluate, delay },
  { attempts = 150, ignoreCache = true } = {},
) {
  await evaluate("globalThis.__eduAuditBeforeReload = true");
  await cdp("Page.reload", { ignoreCache });
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      if (
        await evaluate(
          "!globalThis.__eduAuditBeforeReload && !!globalThis.EduV24?.getReportContext?.().ready",
        )
      )
        return;
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
};
