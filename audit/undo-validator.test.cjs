"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({ Map });
for (const file of ["workspace-records.js", "undo-validator.js"])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../assets/scripts", file), "utf8"),
    context,
  );
const dependencies = {
  clone: structuredClone,
  assertSafeDataTree: () => {},
  normalizeDB: (value) => value,
  isDataObject: (value) =>
    !!value && typeof value === "object" && !Array.isArray(value),
  isSafeRecordId: (value) =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value),
};
Object.assign(dependencies, context.EduWorkspaceRecords.create(dependencies));
const baseline = () =>
  new Map([
    ["meta", { layout: [{ id: "s1", name: "مدرسه", classes: ["c1"] }] }],
    ["class:c1", { id: "c1", name: "new", students: [], lessons: [] }],
  ]);
const undo = () => ({
  id: "w1",
  workspace: "w1",
  revision: 2,
  action: "ویرایش",
  before: [
    {
      key: "class:c1",
      value: { id: "c1", name: "old", students: [], lessons: [] },
    },
  ],
});
const validate = (
  value,
  records = baseline(),
  period = { id: "w1", revision: 2 },
) => context.EduUndoValidator.validate(value, records, period, dependencies);

test("undo returns a detached candidate and preserves original records", () => {
  const records = baseline(),
    value = undo(),
    candidate = validate(value, records);
  assert.equal(candidate.get("class:c1").name, "old");
  candidate.get("class:c1").name = "changed";
  assert.equal(records.get("class:c1").name, "new");
  assert.equal(value.before[0].value.name, "old");
});
test("undo rejects foreign workspace, future revision and duplicate keys", () => {
  for (const mutate of [
    (value) => {
      value.id = "w2";
    },
    (value) => {
      value.workspace = "w2";
    },
    (value) => {
      value.revision = 3;
    },
    (value) => {
      value.before.push(structuredClone(value.before[0]));
    },
    (value) => {
      delete value.before[0].value;
    },
    (value) => {
      value.before[0].value.id = "wrong";
    },
  ]) {
    const value = undo();
    mutate(value);
    assert.throws(() => validate(value));
  }
});
test("undo cannot remove required metadata or a referenced class", () => {
  for (const key of ["meta", "class:c1"]) {
    const value = undo();
    value.before = [{ key, value: null }];
    assert.throws(() => validate(value));
  }
});
test("historical stale undo remains readable without executing against newer layout", () => {
  const value = undo();
  value.revision = 1;
  value.before = [{ key: "class:c1", value: null }];
  assert.equal(validate(value).has("class:c1"), false);
  // Execution rejects a stale revision in performUndo; this validator also serves backup import.
});
