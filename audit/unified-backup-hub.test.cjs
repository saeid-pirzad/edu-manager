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
    app = { firstChild: { id: "original-page" } },
    modal = { classList: { contains: () => hidden } },
    listeners = new Map(),
    input = {
      click: () => clicks++,
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type),
    },
    shown = [];
  const context = vm.createContext({
    state: { view: "schools" },
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
            : id === "app"
              ? app
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
    render: () => {
      shown.push({ view: context.state.view, tab: context.state.backupTab });
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
    app,
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

test("a delayed backup opener preserves navigation to a newer page", async () => {
  const f = fixture(),
    pending = f.context.openBackups();
  f.app.firstChild = { id: "reports-page" };
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
  assert.equal(f.shown[0].view, "backups");
  assert.equal(f.shown[0].tab, "bank");
});

test("reopening the active backup page preserves its tab and selects an explicit tab without rerendering", async () => {
  const f = fixture(),
    selected = [];
  f.context.state = { view: "backups", backupTab: "bank" };
  f.context.existingHub = {
    isCurrent: () => true,
    selectTab: (tab) => selected.push(tab),
  };
  vm.runInContext("backupHubSession=existingHub", f.context);
  const opening = f.context.openBackups();
  f.release();
  await opening;
  await f.context.openBackups({ tab: "school" });
  assert.deepEqual(selected, ["bank", "school"]);
  assert.equal(f.shown.length, 0);
});

test("navigation refused by the existing editor guard does not dispose the active hub", async () => {
  const f = fixture();
  let disposals = 0;
  f.context.existingHub = {
    isCurrent: () => false,
    dispose: () => disposals++,
  };
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
    isCurrent: (scope) => !scope || (current && scope === "school"),
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
