"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

function fixture() {
  const listeners = new Map();
  const context = vm.createContext({
    document: {
      getElementById: (id) => ({
        addEventListener: (type, listener) =>
          listeners.set(id + ":" + type, listener),
      }),
    },
    console,
  });
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/legacy/core/events.js"), "utf8"),
    context,
  );
  const registry = vm.runInContext("EduLegacyEvents", context);
  const element = (actions) => ({
    getAttribute: (name) => actions[name.replace("data-legacy-", "")] ?? null,
    matches: () => false,
    closest: () => null,
  });
  return { registry, element, context, listeners };
}

test("explicit write metadata survives renamed wrappers and preserves dispatch and source", () => {
  const { registry, element, listeners } = fixture();
  let invoked;
  const handler = function renamedWrapper() {
    invoked = this;
  };
  registry.register("write", handler, { mutating: true });
  const control = element({ click: "write" });
  assert.equal(registry.mutates(control, /\bsave\s*\(/), true);
  assert.equal(registry.source("write"), String(handler));
  listeners.get("app:click")({ composedPath: () => [control] });
  assert.equal(invoked, control);
});

test("explicit false overrides handler-name inference and mixed events retain a write", () => {
  const { registry, element } = fixture();
  const save = () => {};
  registry.register("preview", () => save(), { mutating: false });
  registry.register("write", () => {}, { mutating: true });
  assert.equal(
    registry.mutates(element({ click: "preview" }), /\bsave\s*\(/),
    false,
  );
  assert.equal(
    registry.mutates(
      element({ click: "preview", change: "write" }),
      /\bsave\s*\(/,
    ),
    true,
  );
});

test("unannotated handlers retain compatibility inference while unknown keys never mutate", () => {
  const { registry, element } = fixture();
  const save = () => {};
  registry.register("legacy", () => save());
  registry.register("view", () => {});
  assert.equal(
    registry.mutates(element({ submit: "legacy" }), /\bsave\s*\(/),
    true,
  );
  assert.equal(
    registry.mutates(element({ input: "view" }), /\bsave\s*\(/),
    false,
  );
  assert.equal(
    registry.mutates(
      element({ click: "missing", change: "constructor" }),
      /.*/,
    ),
    false,
  );
  assert.equal(registry.source("missing"), "");
});

test("invalid metadata is rejected before reserving the handler key", () => {
  const { registry, element } = fixture();
  for (const mutating of [null, "true", 1, {}]) {
    assert.throws(
      () => registry.register("retry", () => {}, { mutating }),
      /Invalid legacy handler: retry/,
    );
  }
  registry.register("retry", () => {}, { mutating: true });
  assert.equal(registry.mutates(element({ click: "retry" }), /never/), true);
  assert.throws(
    () => registry.register("retry", () => {}, { mutating: false }),
    /Invalid legacy handler: retry/,
  );
  assert.equal(registry.mutates(element({ click: "retry" }), /never/), true);
});

test("session registrations classify writes independently of function source", () => {
  const { registry, element, context } = fixture();
  vm.runInContext(
    fs.readFileSync(
      path.join(root, "src/legacy/events/sessions-dialog.js"),
      "utf8",
    ),
    context,
  );
  const writes = [
    "reuse-previous",
    "1",
    "2",
    "3",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "leave",
    "all-present",
  ];
  const views = [
    "attendance-search",
    "0",
    "4",
    "5",
    "13",
    "14",
    "entry-change",
  ];
  for (const key of writes)
    assert.equal(
      registry.mutates(element({ click: "sessions-dialog:" + key }), /never/),
      true,
      key,
    );
  for (const key of views)
    assert.equal(
      registry.mutates(element({ click: "sessions-dialog:" + key }), /.*/),
      false,
      key,
    );
});
