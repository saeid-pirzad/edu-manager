"use strict";

// Keep failures at the end of long browser logs, not buried among passing cases.
function summarizeResult(result, resultFile) {
  const failures = result.cases.filter((test) => !test.pass);
  return {
    stage: result.stage,
    total: result.cases.length,
    passed: result.cases.length - failures.length,
    failed: failures.length,
    resultFile,
    failures,
  };
}

module.exports = { summarizeResult };
