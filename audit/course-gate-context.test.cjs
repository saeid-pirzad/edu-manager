"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/ui/course/copy-gate.js"),
  "utf8",
);
test("gate rejects malformed values before creating or flushing any grade state", async () => {
  let flushed = false;
  const context = vm.createContext({
    writable() {},
    api: {
      flushDrafts: async () => {
        flushed = true;
      },
    },
  });
  vm.runInContext(source, context);
  await assert.rejects(
    context.gate("lesson", "pod", "student", "invalid"),
    /وضعیت معیار نامعتبر/,
  );
  assert.equal(flushed, false);
});
test("gate cannot retarget a different workspace or class while awaiting drafts", async () => {
  for (const switched of ["workspace", "class"]) {
    let workspace = "one",
      classId = "class-one",
      lookedUp = false;
    const context = vm.createContext({
      writable() {},
      currentClass: () => {
        lookedUp = true;
      },
      api: {
        context: () => ({ id: workspace }),
        state: () => ({ classId }),
        flushDrafts: async () => {
          if (switched === "workspace") workspace = "two";
          else classId = "class-two";
        },
      },
    });
    vm.runInContext(source, context);
    await assert.rejects(
      context.gate("lesson", "pod", "student", "yes"),
      /دوره یا کلاس/,
    );
    assert.equal(lookedUp, false);
  }
});
