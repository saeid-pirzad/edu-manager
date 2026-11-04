"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
function fixture() {
  const errors = [];
  const root = { isConnected: true, dataset: { sessionId: "session-a" } };
  const control = {
    closest(selector) {
      assert.equal(selector, ".session-workspace");
      return root;
    },
  };
  const context = vm.createContext({
    currentSessionId: "session-a",
    EduV24: { course: { error: (error) => errors.push(error) } },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/sessions/dialog.js"),
      "utf8",
    ),
    context,
  );
  return { context, root, control, errors };
}
test("session editor reports a synchronous validation failure only to its still-current editor", async () => {
  const { context, control, errors } = fixture();
  const error = Error("invalid score");
  assert.equal(
    await context.runSessionEditorAction(control, () => {
      throw error;
    }),
    false,
  );
  assert.deepEqual(errors, [error]);
});
test("session editor reports an asynchronous write failure without rejecting the delegated event", async () => {
  const { context, control, errors } = fixture();
  const error = Error("write failed");
  assert.equal(
    await context.runSessionEditorAction(control, async () => {
      throw error;
    }),
    false,
  );
  assert.deepEqual(errors, [error]);
});
for (const change of ["disconnected", "different-session", "mismatched-root"]) {
  test(
    "late write failure stays out of a " + change + " session editor",
    async () => {
      const { context, root, control, errors } = fixture();
      let reject;
      const pending = context.runSessionEditorAction(
        control,
        () =>
          new Promise((resolve, fail) => {
            reject = fail;
          }),
      );
      if (change === "disconnected") root.isConnected = false;
      else if (change === "different-session")
        context.currentSessionId = "session-b";
      else root.dataset.sessionId = "session-b";
      reject(Error("old editor failure"));
      assert.equal(await pending, false);
      assert.deepEqual(errors, []);
    },
  );
}
test("session editor keeps a successful action result and never reports an error", async () => {
  const { context, control, errors } = fixture();
  const result = { saved: true };
  assert.equal(
    await context.runSessionEditorAction(control, async () => result),
    result,
  );
  assert.deepEqual(errors, []);
});
