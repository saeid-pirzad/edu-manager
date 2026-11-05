"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { summarizeResult } = require("./result-summary.cjs");

test("audit summary retains every failure and its diagnostic details", () => {
  const failure = {
    id: "FAILED-CHECK",
    name: "required check",
    pass: false,
    observed: { actual: 3, expected: 4 },
  };
  const result = {
    stage: "release",
    cases: [{ id: "PASS", pass: true }, failure, { id: "MISSING-PASS" }],
  };
  const before = JSON.stringify(result);
  assert.deepEqual(summarizeResult(result, "results.json"), {
    stage: "release",
    total: 3,
    passed: 1,
    failed: 2,
    resultFile: "results.json",
    failures: [failure, { id: "MISSING-PASS" }],
  });
  assert.equal(JSON.stringify(result), before);
});

test("successful audit summary reports no failures without including passing payloads", () => {
  assert.deepEqual(
    summarizeResult(
      { stage: "release", cases: [{ pass: true }] },
      "result.json",
    ),
    {
      stage: "release",
      total: 1,
      passed: 1,
      failed: 0,
      resultFile: "result.json",
      failures: [],
    },
  );
});
