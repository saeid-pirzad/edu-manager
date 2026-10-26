"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const read = (name) =>
  fs.readFileSync(path.join(__dirname, "../src/workspace", name), "utf8");
function fixture() {
  const context = vm.createContext({
    workspace: { id: "one", revision: 1 },
    state: { schoolId: "school", classId: "class" },
    assertWorkspaceReadable() {},
  });
  vm.runInContext(read("core/async-target.js"), context);
  return context;
}
test("async target tolerates own revision changes but rejects workspace drift", () => {
  const context = fixture(),
    check = context.preserveAsyncTarget();
  context.workspace.revision++;
  assert.doesNotThrow(check);
  context.workspace = { id: "two", revision: 1 };
  assert.throws(check, /دوره یا کلاس/);
});
test("class-scoped async target rejects selection drift and rechecks readability", () => {
  const context = fixture(),
    check = context.preserveAsyncTarget({ classScoped: true });
  context.state.classId = "another";
  assert.throws(check, /دوره یا کلاس/);
  context.state.classId = "class";
  context.assertWorkspaceReadable = () => {
    throw Error("locked");
  };
  assert.throws(check, /locked/);
});
test("bulk grade editor cannot open a different class after waiting for drafts", async () => {
  const context = fixture();
  let opened = false;
  context.flushDrafts = async () => {
    context.state.classId = "another";
  };
  context.showModal = () => {
    opened = true;
  };
  context.getClassObj = () => ({
    lessons: [{ id: "lesson", gradeMode: "kardanesh" }],
  });
  context.getLessonObj = (classroom) => classroom.lessons[0];
  context.buildKardaneshEditor = () => "wrong class editor";
  vm.runInContext(read("grading/editors.js"), context);
  await assert.rejects(context.openBulkV24("lesson"), /دوره یا کلاس/);
  assert.equal(opened, false);
});
test("backup dialog cannot combine old rows with a newly selected workspace during storage estimate", async () => {
  const context = fixture();
  let opened = false;
  context.writer = Promise.resolve();
  context.esc = String;
  context.lastExternalBackupLabel = () => "backup";
  context.allFrom = async () => [];
  context.navigator = {
    storage: {
      estimate: async () => {
        context.workspace = { id: "two" };
        return { usage: 1, quota: 2 };
      },
    },
  };
  context.showModal = () => {
    opened = true;
  };
  vm.runInContext(read("backups/period-import.js"), context);
  await assert.rejects(context.openBackups(), /دوره یا کلاس/);
  assert.equal(opened, false);
});
test("period dialog rejects a switch between catalog and report reads", async () => {
  const context = fixture();
  let opened = false;
  context.flushDrafts = async () => {};
  context.esc = String;
  context.allFrom = async (store) => {
    if (store === "reports") context.workspace = { id: "two" };
    return [];
  };
  context.showModal = () => {
    opened = true;
  };
  vm.runInContext(read("periods/switch-create.js"), context);
  await assert.rejects(context.openPeriods(), /دوره یا کلاس/);
  assert.equal(opened, false);
});
