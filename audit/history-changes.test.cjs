"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/scripts/history-changes.js"), "utf8"), context);
const diff = (...args) => JSON.parse(JSON.stringify(context.EduHistoryChanges.changesBetween(...args)));

test("history records field changes and skips identical data", () => {
  assert.deepEqual(diff({ name: "old", score: 0 }, { name: "new", score: 0 }, "class:c1"), [
    { path: "class:c1.name", before: "old", after: "new" },
  ]);
  assert.deepEqual(diff({ score: 0 }, { score: 0 }), []);
});
test("history redacts direct password changes including root password", () => {
  for (const path of ["password", "meta.settings.password"])
    assert.deepEqual(diff("old-secret", "new-secret", path), [{ path, before: "رمز تنظیم‌شده", after: "رمز تنظیم‌شده" }]);
});
test("history redacts passwords when whole objects are added or removed", () => {
  const data = { settings: { password: "secret-hash", name: "نام" }, children: [{ password: "legacy-secret" }] };
  for (const pair of [[null, data], [data, null]]) {
    const events = diff(...pair, "meta");
    assert.ok(!JSON.stringify(events).includes("secret"));
    assert.ok(JSON.stringify(events).includes("نام"));
  }
  assert.equal(data.settings.password, "secret-hash");
});
test("history preserves zero, false and missing field semantics", () => {
  assert.deepEqual(diff({ score: 0, active: false }, {}, "x"), [
    { path: "x.score", before: 0, after: null },
    { path: "x.active", before: false, after: null },
  ]);
});
