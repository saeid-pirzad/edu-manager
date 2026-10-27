"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  let stores = 0;
  const c = vm.createContext({
    workspace: { id: "source" },
    ready: true,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    draftWriter: Promise.resolve(),
    storeDrafts: async () => stores++,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/full-export.js"),
      "utf8",
    ),
    c,
  );
  return { c, stores: () => stores };
}
test("backup cannot overwrite destination drafts while a period is loading", async () => {
  const { c, stores } = fixture();
  c.periodLoading = true;
  await assert.rejects(c.snapshotInstallation());
  assert.equal(stores(), 0);
});
test("backup rechecks workspace after waiting for grade flush before persisting draft state", async () => {
  const { c, stores } = fixture();
  c.flushDrafts = async () => {
    c.workspace.id = "destination";
  };
  await assert.rejects(c.snapshotInstallation());
  assert.equal(stores(), 0);
});
test("backup rechecks transition state after its pending writer finishes", async () => {
  const { c, stores } = fixture();
  let finish;
  c.writer = new Promise((resolve) => {
    finish = resolve;
  });
  const backup = c.snapshotInstallation();
  await Promise.resolve();
  c.periodLoading = true;
  finish();
  await assert.rejects(backup);
  assert.equal(stores(), 0);
});
