"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({});
for (const file of ["history-changes.js", "record-commit-plan.js"])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../assets/scripts", file), "utf8"),
    context,
  );
const plan = (records, baseline, options) =>
  JSON.parse(
    JSON.stringify(
      context.EduRecordCommitPlan.create(
        new Map(records),
        new Map(baseline.map(([key, value]) => [key, JSON.stringify(value)])),
        options,
      ),
    ),
  );

test("unchanged save produces no writes, history or undo entries", () => {
  assert.deepEqual(plan([["meta", { value: 0 }]], [["meta", { value: 0 }]]), {
    changed: [],
    removed: [],
    before: [],
    changes: [],
  });
});
test("partial save preserves records outside its scope", () => {
  const result = plan(
    [["class:a", { name: "new" }]],
    [
      ["class:a", { name: "old" }],
      ["class:b", { name: "other" }],
    ],
  );
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.before, [{ key: "class:a", value: { name: "old" } }]);
  assert.equal(result.changed.length, 1);
});
test("replacement includes removed records in undo and history", () => {
  const result = plan(
    [["class:b", { name: "new" }]],
    [["class:a", { name: "old" }]],
    { replace: true },
  );
  assert.deepEqual(result.removed, ["class:a"]);
  assert.deepEqual(result.before, [
    { key: "class:b", value: null },
    { key: "class:a", value: { name: "old" } },
  ]);
  assert.equal(result.changes.length, 2);
});
test("undo retains original password while descriptive history redacts it", () => {
  const result = plan(
    [],
    [["meta", { settings: { password: "original-hash" } }]],
    { replace: true },
  );
  assert.equal(result.before[0].value.settings.password, "original-hash");
  assert.ok(!JSON.stringify(result.changes).includes("original-hash"));
});
test("planning does not mutate caller maps or record objects", () => {
  const value = { name: "new" },
    records = new Map([["class:a", value]]),
    committed = new Map([["class:a", '{"name":"old"}']]);
  const result = context.EduRecordCommitPlan.create(records, committed);
  result.before[0].value.name = "changed";
  assert.equal(committed.get("class:a"), '{"name":"old"}');
  assert.equal(records.get("class:a"), value);
  assert.equal(value.name, "new");
});
