"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture({ activeFile = true, fileFailed = false } = {}) {
  let restarts = 0;
  const form = { dataset: {} };
  const c = vm.createContext({
    fileMode: false,
    ready: true,
    connectionRetired: false,
    resetBusy: false,
    blocked: false,
    installationToken: "original-installation",
    singleFile: { savedAt: "2026-11-01T00:00:00.000Z" },
    singleFileFailure: fileFailed,
    singleFileTimer: activeFile ? 1 : null,
    singleFileWriting: null,
    draftTimer: null,
    flushing: null,
    writer: Promise.resolve(),
    draftWriter: Promise.resolve(),
    connection: { version: 26, close() {} },
    RESET_RECORD_KEY: "@installation-reset",
    document: {
      querySelector: () => form,
      getElementById: (id) =>
        id === "wipeText" ? { value: "حذف" } : { checked: true },
    },
    confirm: () => true,
    uid: () => "new-reset-token",
    clearTimeout() {},
    beginRecordEditorSave: () => () => {},
    pauseSingleFile() {
      c.singleFileTimer = null;
    },
    startSingleFile() {
      restarts++;
      c.singleFileTimer = 1;
    },
    resetDatabase: async () => {
      throw Error("simulated reset transaction failure");
    },
    openDatabase: async () => ({ version: 26, close() {} }),
    readRecord: async () => ({ value: { token: "original-installation" } }),
    showRecordEditorError() {},
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/data/wipe.js"),
      "utf8",
    ),
    c,
  );
  return { c, form, restarts: () => restarts };
}

function withConnectedFile() {
  const f = fixture();
  let removed = 0,
    resets = 0;
  const handle = {
    name: "Classyar-Classroom.json",
    kind: "file",
    requestPermission: async () => "granted",
    getFile: async () => ({ name: handle.name, size: 12, lastModified: 1 }),
    remove: async () => {
      removed++;
    },
  };
  f.c.singleFile = {
    handle,
    connectionId: "school-only",
    size: 12,
    modified: 1,
  };
  f.form.dataset.deleteConnectedFile = "true";
  vm.runInContext("wipeFileTarget=singleFile", f.c);
  f.c.singleFileKey = "EduManager.singleFile";
  f.c.navigator = { locks: { request: async (_key, action) => action() } };
  f.c.readRecord = async (store) =>
    store === "drafts"
      ? { connectionId: "school-only" }
      : { value: { token: "original-installation" } };
  f.c.assertClassroomFileName = (name) => {
    if (name !== "Classyar-Classroom.json") throw Error("foreign file");
  };
  f.c.assertSingleFileDestination = async () => {};
  f.c.resetDatabase = async () => {
    resets++;
    return { close() {} };
  };
  f.c.broadcast =
    f.c.forgetInstallation =
    f.c.rememberRecordEditor =
    f.c.closeModal =
    f.c.resetScreen =
      () => {};
  f.c.completeResetCleanup = async () => {};
  f.c.location = { reload() {} };
  return { ...f, handle, removed: () => removed, resets: () => resets };
}

test("school wipe removes only its captured file before clearing its independent database", async () => {
  const f = withConnectedFile();
  assert.equal(await f.c.confirmWipe(), true);
  assert.equal(f.removed(), 1);
  assert.equal(f.resets(), 1);
});

test("school wipe never discards a pending bank draft or interrupts its file write", async () => {
  const f = withConnectedFile();
  f.c.EduQuestionBankUI = { hasPendingChanges: () => true };
  assert.equal(await f.c.confirmWipe(), false);
  assert.equal(f.removed(), 0);
  assert.equal(f.resets(), 0);
});

for (const failure of ["invalid-name", "denied", "remove-failed"]) {
  test(`school wipe reuses its live connection after ${failure} instead of leaking it on retry`, async () => {
    const f = withConnectedFile();
    const source = f.c.connection;
    let opens = 0;
    f.c.openDatabase = async () => {
      opens++;
      throw Error("A live connection must not be replaced");
    };
    if (failure === "invalid-name") f.handle.name = "legacy-school.json";
    if (failure === "denied") f.handle.requestPermission = async () => "denied";
    if (failure === "remove-failed")
      f.handle.remove = async () => {
        throw Error("OS refused");
      };
    assert.equal(await f.c.confirmWipe(), false);
    assert.equal(await f.c.confirmWipe(), false);
    assert.equal(opens, 0);
    assert.equal(f.c.connection, source);
    assert.equal(f.c.ready, true);
    assert.equal(f.removed(), 0);
    assert.equal(f.resets(), 0);
  });
}

for (const failure of [
  "denied",
  "unsupported",
  "foreign-file",
  "connection-changed",
  "external-edit",
  "file-remove-failed",
]) {
  test(
    "school wipe preserves its database and file when " + failure,
    async () => {
      const f = withConnectedFile();
      if (failure === "denied")
        f.handle.requestPermission = async () => "denied";
      if (failure === "unsupported") delete f.handle.remove;
      if (failure === "foreign-file")
        f.handle.name = "Classyar-QuestionBank.json";
      if (failure === "connection-changed")
        f.c.readRecord = async () => ({ connectionId: "different" });
      if (failure === "external-edit")
        f.handle.getFile = async () => ({
          name: f.handle.name,
          size: 99,
          lastModified: 2,
        });
      if (failure === "file-remove-failed")
        f.handle.remove = async () => {
          throw Error("OS refused");
        };
      assert.equal(await f.c.confirmWipe(), false);
      assert.equal(f.removed(), 0);
      assert.equal(f.resets(), 0);
    },
  );
}

test("a reset failure after physical school-file removal reports that outcome and never restarts writing", async () => {
  const f = withConnectedFile();
  const errors = [];
  f.c.resetDatabase = async () => {
    throw Error("reset transaction failed");
  };
  f.c.showRecordEditorError = (error) => errors.push(error.message);
  assert.equal(await f.c.confirmWipe(), false);
  assert.equal(f.removed(), 1);
  assert.equal(f.restarts(), 0);
  assert.ok(errors.some((message) => message.includes("فایل متصل حذف شد")));
});

test("failed wipe resumes the previously active automatic file backup after reopening the original database", async () => {
  const { c, restarts } = fixture();
  assert.equal(await c.confirmWipe(), false);
  assert.equal(c.ready, true);
  assert.equal(c.connectionRetired, false);
  assert.equal(c.resetBusy, false);
  assert.equal(restarts(), 1);
  assert.equal(c.singleFileTimer, 1);
});

for (const config of [{ activeFile: false }, { fileFailed: true }]) {
  test(`failed wipe does not silently enable a paused or failed file connection: ${JSON.stringify(config)}`, async () => {
    const { c, restarts } = fixture(config);
    await c.confirmWipe();
    assert.equal(restarts(), 0);
    assert.equal(c.singleFileTimer, null);
  });
}
