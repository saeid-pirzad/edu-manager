"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture({ activeFile = true, fileFailed = false } = {}) {
  let restarts = 0;
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
      querySelector: () => ({}),
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
  return { c, restarts: () => restarts };
}

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
