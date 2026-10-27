"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    errors = [],
    input = { value: "new-password" },
    remove = { checked: false };
  const form = {
    isConnected: true,
    querySelector: (selector) => (selector === "#newPass" ? input : remove),
  };
  const context = { id: "first", revision: 1, form };
  const c = vm.createContext({
    workspace: { id: "first", revision: 1 },
    connection: {},
    isAuthenticated: false,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    db: { settings: { password: "old-hash" } },
    document: { querySelector: () => form },
    beginRecordEditorSave: () => () => {},
    assertWorkspaceContext(target) {
      if (
        target.id !== c.workspace.id ||
        target.revision !== c.workspace.revision
      )
        throw Error("stale");
    },
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    hashPassword: async () => "new-hash",
    saveDBV24: async () => {
      c.workspace.revision++;
      effects.push("save");
    },
    rememberRecordEditor() {},
    closeModal: () => effects.push("close"),
    setStatus: () => effects.push("status"),
    showRecordEditorError: (error) => {
      errors.push(error);
      return true;
    },
    context,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/settings/editor.js"),
      "utf8",
    ),
    c,
  );
  vm.runInContext("settingsEditing = context", c);
  return {
    c,
    effects,
    errors,
    input,
    form,
    context,
    pending: () => vm.runInContext("settingsEditing", c),
  };
}
test("password hashing rechecks connection before changing stored password", async () => {
  const f = fixture();
  f.c.hashPassword = async () => {
    f.c.connection = {};
    return "new-hash";
  };
  assert.equal(await f.c.saveSettingsV24(), false);
  assert.equal(f.c.db.settings.password, "old-hash");
  assert.equal(f.c.isAuthenticated, false);
  assert.equal(f.effects.length, 0);
});

test("settings form from a previous connection cannot change the replacement bank", async () => {
  const f = fixture();
  f.context.connection = {};
  assert.equal(await f.c.saveSettingsV24(), false);
  assert.equal(f.c.db.settings.password, "old-hash");
  assert.equal(f.c.isAuthenticated, false);
  assert.equal(f.effects.length, 0);
});
for (const kind of ["workspace", "connection", "form", "detached"]) {
  test(`late settings save does not authenticate or close a changed ${kind} context`, async () => {
    const f = fixture();
    f.c.saveDBV24 = async () => {
      if (kind === "workspace") f.c.workspace = { id: "second", revision: 1 };
      else if (kind === "connection") f.c.connection = {};
      else if (kind === "detached") f.form.isConnected = false;
      else vm.runInContext("settingsEditing = { ...context }", f.c);
    };
    assert.equal(await f.c.saveSettingsV24(), true);
    assert.equal(f.c.isAuthenticated, false);
    assert.equal(f.input.value, "new-password");
    assert.equal(f.effects.length, 0);
    assert.notEqual(f.pending(), null);
  });
}
test("valid password save authenticates only its own period after persistence", async () => {
  const f = fixture();
  assert.equal(await f.c.saveSettingsV24(), true);
  assert.equal(f.c.db.settings.password, "new-hash");
  assert.equal(f.c.isAuthenticated, true);
  assert.equal(f.input.value, "");
  assert.deepEqual(f.effects, ["save", "close", "status"]);
  assert.equal(f.pending(), null);
});
test("failed password persistence does not authenticate or clear retryable input", async () => {
  const f = fixture();
  f.c.saveDBV24 = async () => {
    throw Error("quota");
  };
  assert.equal(await f.c.saveSettingsV24(), false);
  assert.equal(f.c.isAuthenticated, false);
  assert.equal(f.input.value, "new-password");
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors.length, 1);
});
