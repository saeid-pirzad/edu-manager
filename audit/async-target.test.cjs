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
    connection: {},
    writer: Promise.resolve(),
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
  assert.throws(check, /ترم یا کلاس/);
});
test("class-scoped async target rejects selection drift and rechecks readability", () => {
  const context = fixture(),
    check = context.preserveAsyncTarget({ classScoped: true });
  context.state.classId = "another";
  assert.throws(check, /ترم یا کلاس/);
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
  await assert.rejects(context.openBulkV24("lesson"), /ترم یا کلاس/);
  assert.equal(opened, false);
});
test("backup dialog rejects workspace navigation while waiting for pending writes", async () => {
  const context = fixture();
  let opened = false,
    release;
  context.writer = new Promise((resolve) => {
    release = resolve;
  });
  context.window = {};
  const modal = { classList: { contains: () => true } },
    body = { firstChild: {} };
  context.document = {
    getElementById: (id) => (id === "modal" ? modal : body),
  };
  context.showModal = () => {
    opened = true;
  };
  vm.runInContext(read("backups/period-import.js"), context);
  const pending = context.openBackups();
  context.workspace = { id: "two" };
  release();
  await assert.rejects(pending, /ترم یا کلاس/);
  assert.equal(opened, false);
});

test("backup hub markup offers independent file workflows without internal version management", () => {
  const context = fixture();
  context.esc = String;
  context.lastExternalBackupLabel = () => "هنوز پشتیبانی دریافت نشده است.";
  context.singleFilePanel = () =>
    '<section class="backup-automatic"></section>';
  context.allFrom = () => {
    throw Error("Internal backups must not be read");
  };
  vm.runInContext(read("backups/period-import.js"), context);
  const html = context.backupHubHtml();
  assert.doesNotMatch(
    html,
    /backup-history|download-backup|preview-backup|lastSafetyBackup|download-safety|safetyBackupStatus|بازیابی اضطراری/,
  );
  assert.match(html, /id="backupHub" class="backup-hub"/);
  assert.match(html, /data-backup-tab="school"/);
  assert.match(html, /data-backup-tab="bank"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.match(html, /id="backupBankPanel"[^>]*hidden inert/);
  for (const action of ["export-full", "prepare-share-backup", "choose-import"])
    assert.ok(html.includes('data-workspace-action="' + action + '"'));
  assert.match(html, /backup-automatic/);
  assert.match(
    html,
    /<details class="backup-reset"><summary>پاک‌سازی اطلاعات<\/summary>/,
  );
  assert.match(html, /data-workspace-action="open-wipe"/);
});
test("period dialog rejects a switch between catalog and report reads", async () => {
  const context = fixture();
  let opened = false;
  context.flushDrafts = async () => {};
  context.captureWorkspaceContext = () => ({ ...context.workspace });
  context.assertWorkspaceContext = (expected) => {
    if (
      context.workspace.id !== expected.id ||
      context.workspace.revision !== expected.revision
    )
      throw Error("ترم یا کلاس هنگام آماده‌سازی تغییر کرد");
  };
  context.esc = String;
  context.allFrom = async (store) => {
    if (store === "reports") context.workspace = { id: "two" };
    return [];
  };
  context.showModal = () => {
    opened = true;
  };
  vm.runInContext(read("periods/switch-create.js"), context);
  await assert.rejects(context.openPeriods(), /ترم یا کلاس/);
  assert.equal(opened, false);
});
