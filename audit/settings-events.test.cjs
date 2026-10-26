"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/workspace/settings/editor.js"),
  "utf8",
);
function fixture(opened = true) {
  const listeners = new Map(),
    calls = [];
  const form = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    querySelector: () => ({
      addEventListener: (name, handler) =>
        listeners.set("cancel:" + name, handler),
    }),
  };
  const context = vm.createContext({
    workspace: { id: "one", year: "1405", term: "first" },
    ready: false,
    captureWorkspaceContext: () => ({ id: "one" }),
    esc: (value) => value,
    showModal: (title, html) => {
      calls.push(html);
      return opened;
    },
    document: { getElementById: () => form },
    rememberRecordEditor: () => calls.push("remember"),
    closeModal: () => calls.push("close"),
    handleError: (error) => {
      throw error;
    },
  });
  vm.runInContext(source, context);
  return { context, calls, listeners };
}
test("settings binds submit and cancellation explicitly on each newly opened form", async () => {
  const f = fixture();
  await f.context.openSettingsV24();
  assert.doesNotMatch(f.calls[0], /\son[a-z]+\s*=/i);
  assert.equal(f.listeners.size, 2);
  let prevented = false,
    saved = 0;
  f.context.saveSettingsV24 = async () => {
    saved++;
  };
  f.listeners.get("submit")({
    preventDefault: () => {
      prevented = true;
    },
  });
  f.listeners.get("cancel:click")();
  assert.equal(prevented, true);
  assert.equal(saved, 1);
  assert.equal(f.calls.at(-1), "close");
});
test("settings does not bind or replace editor state when opening is refused", async () => {
  const f = fixture(false);
  await f.context.openSettingsV24();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.calls.length, 1);
});
