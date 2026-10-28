"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/ui/course/table-events.js"),
  "utf8",
);
test("course controls work in the main grade tab as well as the modal", async () => {
  const listeners = new Map(),
    calls = [];
  const body = {
    contains: () => false,
    addEventListener: (name, handler) => listeners.set("modal", handler),
  };
  const app = {
    contains: () => true,
    addEventListener: (name, handler) => listeners.set("app", handler),
  };
  const context = vm.createContext({
    document: { getElementById: (id) => (id === "app" ? app : body) },
    selectGradeModule: () => calls.push("module"),
    gate: async (...args) => calls.push(args),
    error: (error) => {
      throw error;
    },
  });
  vm.runInContext(source, context);
  context.installCourseTableEvents();
  const target = {
    dataset: { lessonId: "lesson", podId: "pod", studentId: "student" },
    value: "yes",
    matches: (selector) => selector !== ":disabled",
    closest: () => null,
  };
  listeners.get("app")({ target });
  await Promise.resolve();
  assert.deepEqual(calls[0], ["lesson", "pod", "student", "yes"]);
  target.dataset.modulePicker = "";
  listeners.get("app")({ target });
  assert.equal(calls[1], "module");
});
function fixture(reject = false) {
  const calls = [],
    errors = [];
  let listener;
  const body = {
    contains: (target) => !target.outside,
    addEventListener: (type, handler) => {
      assert.equal(type, "change");
      listener = handler;
    },
  };
  const context = vm.createContext({
    document: { getElementById: () => body },
    gate: async (...args) => {
      calls.push(args);
      if (reject) throw Error("write failed");
    },
    error: (error) => errors.push(error.message),
  });
  vm.runInContext(source, context);
  context.installCourseTableEvents();
  return {
    calls,
    errors,
    change(value, options = {}) {
      const target = {
        dataset: {
          lessonId: "lesson",
          podId: "pod",
          studentId: "student",
          ...options.dataset,
        },
        value,
        outside: options.outside,
        matches: (selector) =>
          selector === ":disabled" ? !!options.disabled : !options.unrelated,
        closest: () => !!options.inert,
      };
      listener({ target });
    },
  };
}
test("delegated gate listener survives replacement controls and passes identifiers and all states", async () => {
  const f = fixture();
  for (const value of ["yes", "no", ""]) f.change(value);
  await Promise.resolve();
  assert.deepEqual(
    f.calls,
    ["yes", "no", ""].map((value) => ["lesson", "pod", "student", value]),
  );
});
test("gate listener ignores unrelated, disabled, inert, outside and incomplete controls", () => {
  const f = fixture();
  for (const options of [
    { unrelated: true },
    { disabled: true },
    { inert: true },
    { outside: true },
    { dataset: { lessonId: "" } },
  ])
    f.change("yes", options);
  assert.deepEqual(f.calls, []);
});
test("gate listener forwards rejected writes to the existing error presenter", async () => {
  const f = fixture(true);
  f.change("yes");
  await Promise.resolve();
  assert.deepEqual(f.errors, ["write failed"]);
});
