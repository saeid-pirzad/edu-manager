"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/ui/shell-events.js"), "utf8");

test("shell events bind explicit controls and resolve current handlers at dispatch time", () => {
  const listeners = new Map(), calls = [];
  const context = vm.createContext({
    document: { getElementById: id => ({ addEventListener: (type, handler) => listeners.set(id + ":" + type, handler) }) },
    closeModal: () => calls.push("closed"),
    handleImport: event => calls.push(["json", event]),
    handleExcelImport: event => calls.push(["csv", event]),
  });
  vm.runInContext(source, context);
  assert.equal(listeners.size, 3);
  const event = { target: { files: [] } };
  listeners.get("modalClose:click")(event);
  listeners.get("importFile:change")(event);
  listeners.get("excelFile:change")(event);
  assert.deepEqual(calls, ["closed", ["json", event], ["csv", event]]);
  context.handleImport = () => calls.push("updated");
  listeners.get("importFile:change")(event);
  assert.equal(calls.at(-1), "updated");
});

test("shell markup has no executable inline handlers and missing controls fail clearly", () => {
  const html = fs.readFileSync(path.join(root, "EduManager.html"), "utf8");
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.throws(() => vm.runInNewContext(source, { document: { getElementById: () => null } }), /Missing application shell element: modalClose/);
});

test("login rendering reconnects the submit handler after replacing its markup", () => {
  const login = fs.readFileSync(path.join(root, "src/legacy/ui/login-render.js"), "utf8");
  const submissions = [];
  const handler = () => {};
  const app = { innerHTML: "", querySelector: selector => {
    assert.equal(selector, "#loginForm");
    return { addEventListener: (type, listener) => submissions.push([type, listener]) };
  } };
  const context = vm.createContext({ document: { getElementById: () => app }, checkPassword: handler });
  vm.runInContext(login, context);
  context.renderLogin();
  context.renderLogin();
  assert.equal(submissions.length, 2);
  for (const [type, listener] of submissions) {
    assert.equal(type, "submit");
    assert.equal(listener, handler);
  }
  assert.doesNotMatch(app.innerHTML, /onsubmit\s*=/i);
});
