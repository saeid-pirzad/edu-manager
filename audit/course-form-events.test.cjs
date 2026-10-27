"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/ui/course/form-events.js"),
  "utf8",
);
function fixture(save) {
  const calls = [],
    listeners = new Map();
  const form = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    querySelector: (selector) => ({
      addEventListener: (name, handler) =>
        listeners.set(selector + ":" + name, handler),
    }),
  };
  const context = vm.createContext({
    save,
    error: (error) => calls.push(error),
    toggleBranch: () => calls.push("branch"),
    toggleMethod: () => calls.push("method"),
    syncTheoryWeight: () => calls.push("weight"),
    cancelEditor: () => calls.push("cancel"),
  });
  vm.runInContext(source, context);
  context.bindCourseFormEvents(form);
  return { calls, listeners };
}
test("course form binds branch, method, cancellation and submission without inline code", async () => {
  let saved = 0,
    prevented = false;
  const f = fixture(async () => {
    saved++;
  });
  f.listeners.get("#course_branch:change")();
  f.listeners.get("#course_method:change")();
  f.listeners.get("#course_subjectType:change")();
  f.listeners.get("#course_practicalWeight:input")();
  f.listeners.get("[data-course-cancel]:click")();
  f.listeners.get("submit")({
    preventDefault: () => {
      prevented = true;
    },
  });
  await Promise.resolve();
  assert.equal(f.listeners.size, 6);
  assert.equal(saved, 1);
  assert.equal(prevented, true);
  assert.deepEqual(f.calls, ["branch", "method", "method", "weight", "cancel"]);
});
test("course submit forwards asynchronous failure to the existing error presenter", async () => {
  const failure = Error("write rejected");
  const f = fixture(async () => {
    throw failure;
  });
  f.listeners.get("submit")({ preventDefault() {} });
  await Promise.resolve();
  assert.deepEqual(f.calls, [failure]);
});
