"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/ui/header-events.js"), "utf8");
function fixture() {
  const calls = [];
  let listener;
  const app = { contains: button => !button.outside, addEventListener: (type, handler) => {
    assert.equal(type, "click"); listener = handler;
  } };
  const context = { document: { getElementById: id => id === "app" ? app : { click: () => calls.push("file") } } };
  for (const name of ["goSchools", "goReports", "goMaster", "openSettingsModal", "toggleDataMenu", "closeDataMenu", "exportBackup", "wipeAllData"])
    context[name] = (...args) => calls.push([name, ...args]);
  vm.runInNewContext(source, context);
  return { calls, click(action, options = {}) {
    const button = { dataset: { headerAction: action }, ...options,
      closest: selector => selector === ".topbar" ? !options.noHeader : !!options.inert };
    const event = { target: { closest: () => button } };
    listener(event);
    return event;
  } };
}
test("header actions preserve navigation and data-operation ordering", () => {
  const f = fixture();
  for (const action of ["schools", "reports", "master", "settings", "export", "import", "wipe"]) f.click(action);
  assert.deepEqual(f.calls, [
    ["goSchools"], ["goReports"], ["goMaster"], ["openSettingsModal"],
    ["closeDataMenu"], ["exportBackup"], ["closeDataMenu"], "file",
    ["closeDataMenu"], ["wipeAllData"],
  ]);
});
test("header toggle receives the original event; unknown, inert and unrelated controls do nothing", () => {
  const f = fixture();
  const event = f.click("toggle-data");
  assert.deepEqual(f.calls, [["toggleDataMenu", event]]);
  for (const action of ["toString", "constructor", "goSchools()", "unknown"]) f.click(action);
  for (const options of [{ disabled: true }, { inert: true }, { outside: true }, { noHeader: true }]) f.click("wipe", options);
  assert.equal(f.calls.length, 1);
});
test("rendered header contains only the eight declared action tokens and no inline handlers", () => {
  const context = vm.createContext({ state: { view: "schools" }, document: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.join(root, "src/legacy/ui/header-menus.js"), "utf8"), context);
  const html = context.headerHtml();
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.deepEqual([...html.matchAll(/data-header-action="([^"]+)"/g)].map(match => match[1]),
    ["schools", "reports", "master", "toggle-data", "export", "import", "wipe", "settings"]);
});
