"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/core/runtime-api.js"),
  "utf8",
);
const fresh = () => {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context.EduRuntimeAPI;
};

test("dialog definitions do not overwrite the stable modal facade", () => {
  const context = vm.createContext({ document: { addEventListener() {} } });
  vm.runInContext(source, context);
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/core/runtime-facade.js"),
      "utf8",
    ),
    context,
  );
  const entry = context.showModal;
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/ui/dialogs.js"), "utf8"),
    context,
  );
  assert.equal(context.showModal, entry);
  let called = false;
  context.EduRuntimeAPI.install({
    showModal: () => {
      called = true;
      return false;
    },
  });
  assert.equal(context.showModal("title", "html"), false);
  assert.equal(called, true);
  assert.equal(typeof context.legacy_showModal, "function");
});
test("runtime facade preserves entry-point identity before and after installation", () => {
  const api = fresh(),
    receiver = { value: 7 };
  const fallback = function (amount) {
    return this.value + amount;
  };
  const entry = function (...args) {
    return api.invoke("save", fallback, this, args);
  };
  assert.equal(entry.call(receiver, 2), 9);
  const identity = entry;
  api.install({
    save: function (amount) {
      return this.value * amount;
    },
  });
  assert.equal(entry, identity);
  assert.equal(entry.call(receiver, 2), 14);
  assert.throws(() => api.install({ save: () => 0 }), /already installed/);
});
test("runtime facade validates implementations and reports unavailable operations", () => {
  const api = fresh();
  assert.throws(() => api.install({ save: null }), /must be functions/);
  assert.throws(() => api.invoke("missing", undefined, null, []), /not ready/);
  api.install({ save: () => Promise.resolve(42) });
  assert.throws(() => api.invoke("toString", undefined, null, []), /not ready/);
  return api
    .invoke("save", undefined, null, [])
    .then((value) => assert.equal(value, 42));
});
