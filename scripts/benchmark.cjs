"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const context = vm.createContext({});
for (const file of ["history-changes.js", "record-commit-plan.js"])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../assets/scripts", file), "utf8"),
    context,
  );
const measurements = [];
for (const size of [1000, 10000, 50000]) {
  const records = new Map(
    Array.from({ length: size }, (_, index) => [
      "record_" + index,
      {
        id: "student_" + index,
        name: "هنرجوی آزمایشی " + index,
        grades: { practical: 18, theory: 16 },
      },
    ]),
  );
  const committed = new Map(
    [...records].map(([key, value]) => [key, JSON.stringify(value)]),
  );
  const measure = (name, input, expected) => {
    const samples = [];
    for (let run = 0; run < 4; run++) {
      const start = performance.now();
      const result = context.EduRecordCommitPlan.create(input, committed);
      const elapsed = performance.now() - start;
      assert.equal(result.changed.length, expected);
      assert.equal(result.removed.length, 0);
      if (run) samples.push(elapsed);
    }
    measurements.push({
      records: size,
      operation: name,
      medianMs: Number(samples.sort((a, b) => a - b)[1].toFixed(2)),
    });
  };
  measure("unchanged-save-plan", records, 0);
  const changed = new Map(records);
  changed.set("record_0", {
    ...records.get("record_0"),
    grades: { practical: 19, theory: 16 },
  });
  measure("single-record-save-plan", changed, 1);
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      scope:
        "In-memory commit planning only; not device, DOM or IndexedDB performance",
      measurements,
    },
    null,
    2,
  ),
);
