"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  let release,
    hidden = true,
    checks = 0,
    clicks = 0,
    hub = null;
  const body = { firstChild: { id: "original-content" } },
    modal = { classList: { contains: () => hidden } },
    listeners = new Map(),
    input = {
      click: () => clicks++,
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type),
    },
    shown = [];
  const context = vm.createContext({
    writer: new Promise((resolve) => {
      release = resolve;
    }),
    window: { EduQuestionBankUI: { isPageActive: () => false } },
    document: {
      getElementById: (id) =>
        id === "modal"
          ? modal
          : id === "modalBody"
            ? body
            : id === "backupHub"
              ? hub
              : id === "importFile"
                ? input
                : null,
    },
    preserveAsyncTarget: () => () => checks++,
    esc: String,
    lastExternalBackupLabel: () => "هنوز پشتیبانی دریافت نشده است.",
    singleFilePanel: () => "<details>automatic file</details>",
    showModal: (title, html) => {
      shown.push({ title, html });
      return false;
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/period-import.js"),
      "utf8",
    ),
    context,
  );
  return {
    context,
    body,
    shown,
    release,
    checks: () => checks,
    clicks: () => clicks,
    hide: (value) => (hidden = value),
    hub: (value) => (hub = value),
    cancel: () => listeners.get("cancel")?.(),
  };
}

test("a delayed backup opener does not replace newer modal content", async () => {
  const f = fixture(),
    pending = f.context.openBackups();
  f.body.firstChild = { id: "newer-modal" };
  f.release();
  await pending;
  assert.equal(f.checks(), 1);
  assert.equal(f.shown.length, 0);
});

test("a delayed backup opener does not reopen a modal the user closed", async () => {
  const f = fixture();
  f.hide(false);
  const pending = f.context.openBackups();
  f.hide(true);
  f.release();
  await pending;
  assert.equal(f.shown.length, 0);
});

test("only the latest queued backup request can present a hub", async () => {
  const f = fixture(),
    first = f.context.openBackups({ tab: "school" }),
    second = f.context.openBackups({ tab: "bank" });
  f.release();
  await Promise.all([first, second]);
  assert.equal(f.checks(), 2);
  assert.equal(f.shown.length, 1);
  assert.match(f.shown[0].html, /id="backupHub"/);
});

test("a modal replacement refused by the existing editor guard does not dispose the active hub", async () => {
  const f = fixture();
  let disposals = 0;
  f.context.existingHub = { dispose: () => disposals++ };
  vm.runInContext("backupHubSession=existingHub", f.context);
  const pending = f.context.openBackups();
  f.release();
  await pending;
  assert.equal(f.shown.length, 1);
  assert.equal(disposals, 0);
  assert.equal(
    vm.runInContext("backupHubSession===existingHub", f.context),
    true,
  );
});

test("school restore selection requires the live school panel and captures its lifetime before clicking", () => {
  const f = fixture();
  let current = false;
  f.hub({});
  f.hide(false);
  f.context.session = {
    isCurrent: (scope) => current && scope === "school",
  };
  vm.runInContext("backupHubSession=session", f.context);
  assert.throws(() => f.context.chooseBackupImport(), /اطلاعات مدرسه/);
  assert.equal(f.clicks(), 0);
  current = true;
  f.context.chooseBackupImport();
  assert.equal(f.clicks(), 1);
  assert.equal(
    vm.runInContext("backupHubImportOrigin.isCurrent()", f.context),
    true,
  );
  current = false;
  assert.equal(
    vm.runInContext("backupHubImportOrigin.isCurrent()", f.context),
    false,
  );
  f.cancel();
  assert.equal(
    vm.runInContext("backupHubImportOrigin===null", f.context),
    true,
  );
});
