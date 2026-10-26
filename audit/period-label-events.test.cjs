"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/workspace/periods/labels.js"),
  "utf8",
);
function fixture() {
  const listeners = new Map(),
    calls = [];
  const form = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    querySelector: () => ({
      addEventListener: (type, handler) =>
        listeners.set("cancel:" + type, handler),
    }),
  };
  const context = vm.createContext({
    workspace: { id: "period-one", revision: 7, year: "1405", term: "first" },
    assertEntityWritable() {},
    esc: (value) => value,
    showModal: (title, html) => {
      calls.push(html);
      return true;
    },
    document: { getElementById: () => form },
    rememberRecordEditor: () => calls.push("remember"),
    closeModal: () => calls.push("close"),
  });
  vm.runInContext(source, context);
  return { context, listeners, calls };
}
test("period label form binds private submit and cancellation without inline code", async () => {
  const f = fixture();
  assert.equal(await f.context.editPeriodLabel(), true);
  assert.doesNotMatch(f.calls[0], /\son[a-z]+\s*=/i);
  let prevented = false,
    saved = 0;
  f.context.savePeriodLabel = async () => {
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
test("refusing period-label replacement preserves the previous editing context", async () => {
  const f = fixture();
  await f.context.editPeriodLabel();
  f.context.workspace = { id: "period-two", revision: 9 };
  f.context.showModal = () => false;
  assert.equal(await f.context.editPeriodLabel(), false);
  assert.equal(
    vm.runInContext("periodLabelEditing.id", f.context),
    "period-one",
  );
  assert.equal(vm.runInContext("periodLabelEditing.revision", f.context), 7);
});
