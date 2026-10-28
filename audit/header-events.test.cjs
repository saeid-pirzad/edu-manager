"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
test("classes navigation opens the school class list instead of a class lesson list", () => {
  const calls = [],
    state = {},
    db = {
      schools: [
        { id: "s1", classes: [{ id: "c1" }] },
        { id: "s2", classes: [{ id: "c2" }] },
      ],
    };
  const context = vm.createContext({
    state,
    db,
    document: { addEventListener() {} },
    goSchool: (id) => calls.push(id),
    goSchools: () => calls.push("schools"),
    goClass: () => assert.fail("must not enter a class"),
  });
  vm.runInContext(
    fs.readFileSync(
      path.resolve(__dirname, "../src/legacy/ui/header-menus.js"),
      "utf8",
    ),
    context,
  );
  for (const [schoolId, classId, expected] of [
    ["s2", "c2", "s2"],
    ["s2", null, "s2"],
    [null, "c2", "s2"],
    ["deleted", "deleted", "s1"],
    [null, null, "s1"],
  ]) {
    Object.assign(state, { schoolId, classId });
    context.goCurrentClass();
    assert.equal(calls.pop(), expected);
  }
  db.schools = [{ id: "empty", classes: [] }];
  context.goCurrentClass();
  assert.equal(calls.pop(), "empty");
  db.schools = [];
  context.goCurrentClass();
  assert.equal(calls.pop(), "schools");
});
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "src/ui/header-events.js"),
  "utf8",
);
function fixture() {
  const calls = [];
  let listener;
  const app = {
    contains: (button) => !button.outside,
    addEventListener: (type, handler) => {
      assert.equal(type, "click");
      listener = handler;
    },
  };
  const context = {
    document: {
      getElementById: (id) =>
        id === "app" ? app : { click: () => calls.push("file") },
    },
  };
  for (const name of [
    "goSchools",
    "goReports",
    "goMaster",
    "openSettingsModal",
  ])
    context[name] = (...args) => calls.push([name, ...args]);
  vm.runInNewContext(source, context);
  return {
    calls,
    click(action, options = {}) {
      const button = {
        dataset: { headerAction: action },
        ...options,
        closest: (selector) =>
          selector === ".topbar" ? !options.noHeader : !!options.inert,
      };
      const event = { target: { closest: () => button } };
      listener(event);
      return event;
    },
  };
}
test("header preserves navigation and ignores removed data commands", () => {
  const f = fixture();
  for (const action of [
    "schools",
    "reports",
    "master",
    "settings",
    "export",
    "import",
    "wipe",
  ])
    f.click(action);
  assert.deepEqual(f.calls, [
    ["goSchools"],
    ["goReports"],
    ["goMaster"],
    ["openSettingsModal"],
  ]);
});
test("removed, unknown, inert and unrelated header commands do nothing", () => {
  const f = fixture();
  for (const action of ["toggle-data", "export", "import", "wipe"])
    f.click(action);
  for (const action of ["toString", "constructor", "goSchools()", "unknown"])
    f.click(action);
  for (const options of [
    { disabled: true },
    { inert: true },
    { outside: true },
    { noHeader: true },
  ])
    f.click("wipe", options);
  assert.equal(f.calls.length, 0);
});
test("rendered header contains only the declared action tokens and no inline handlers", () => {
  const context = vm.createContext({
    state: { view: "schools" },
    document: { addEventListener() {} },
  });
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/legacy/ui/header-menus.js"), "utf8"),
    context,
  );
  const html = context.headerHtml();
  assert.equal(
    (html.match(/data-workspace-action="backups"/g) || []).length,
    1,
  );
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.deepEqual(
    [...html.matchAll(/data-header-action="([^"]+)"/g)].map(
      (match) => match[1],
    ),
    ["schools", "reports", "master", "settings"],
  );
});
