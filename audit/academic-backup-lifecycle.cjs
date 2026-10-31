"use strict";
module.exports = async ({ cdp, evaluate, cases }) => {
  if (await evaluate("!!EduV24.getReportContext().blocked")) {
    await cdp("Page.reload", { ignoreCache: true });
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate("!!globalThis.EduV24?.getReportContext?.().ready"))
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  cases.push(
    ...(await evaluate(
      "(" + require("./flows/academicBackupLifecycle.cjs").toString() + ")()",
    )),
  );
};
