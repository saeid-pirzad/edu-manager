"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
function fixture() {
  const root = { isConnected: true, contains: () => true };
  const c = vm.createContext({
    root,
    workspace: { id: "term" },
    state: { view: "master" },
    connection: {},
    installationToken: "install",
    db: { settings: {}, activeDays: [0], periods: 6 },
    assertEntityWritable() {},
    document: { querySelector: () => root },
  });
  vm.runInContext(
    fs.readFileSync("src/workspace/schedule/actions.js", "utf8"),
    c,
  );
  c.paintWeekSettingsAccess = () => {};
  return {
    c,
    root,
    enable: () => c.toggleWeekSettingsEditing({ disabled: false }),
  };
}
test("day, period and origin commands cannot mutate settings before editing is enabled", async () => {
  const { c } = fixture(),
    before = JSON.stringify(c.db);
  for (const command of [
    () => c.toggleActiveDayV24(1),
    () => c.changePeriodsV24(1),
    () => c.saveWeekStartDateV24(),
  ])
    await assert.rejects(command, /ویرایش/);
  assert.equal(JSON.stringify(c.db), before);
});
test("an explicit edit action grants access only to the current settings section", () => {
  const { c, enable } = fixture();
  enable();
  assert.doesNotThrow(() => c.assertWeekSettingsEditable());
});
for (const [name, invalidate] of [
  ["navigation", (c) => (c.state.view = "schools")],
  ["workspace", (c) => (c.workspace.id = "other")],
  ["connection", (c) => (c.connection = {})],
  ["installation", (c) => (c.installationToken = "other")],
  ["restored data", (c) => (c.db = { settings: {} })],
  ["detached root", (c, root) => (root.isConnected = false)],
  ["replaced root", (c) => (c.document.querySelector = () => ({}))],
])
  test(`${name} invalidates settings editing`, () => {
    const { c, root, enable } = fixture();
    enable();
    invalidate(c, root);
    assert.throws(() => c.assertWeekSettingsEditable(), /ویرایش/);
  });
test("a disabled edit action cannot grant access", () => {
  const { c } = fixture();
  c.toggleWeekSettingsEditing({ disabled: true });
  assert.throws(() => c.assertWeekSettingsEditable(), /ویرایش/);
});
