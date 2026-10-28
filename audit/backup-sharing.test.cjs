"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { File } = require("node:buffer");
const source = fs.readFileSync(
  path.join(__dirname, "../src/workspace/backups/sharing.js"),
  "utf8",
);
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const shares = [],
    downloads = [],
    observers = [],
    locks = [];
  let panel;
  const content = {
    format: "EduManager.FullBackup",
    version: 2,
    schemaVersion: 26,
    exportedAt: "2026-10-28T08:12:30.000Z",
    activeWorkspace: "A",
    stores: {
      catalog: [{ id: "A", revision: 1 }],
      records: [{ data: "preserved" }],
    },
    reportDrafts: { A: { note: "saved note" } },
    gradeDrafts: [{ entries: [{ value: "18" }] }],
  };
  const modal = { hidden: false, classList: { contains: () => modal.hidden } };
  const c = vm.createContext({
    workspace: { id: "A", revision: 1 },
    connection: {},
    Blob,
    File,
    isSecureContext: true,
    EduIcons: { html: () => "" },
    esc: String,
    document: {
      getElementById: (id) =>
        id === "modal" ? modal : id === "modalBody" ? {} : panel,
    },
    MutationObserver: class {
      constructor(callback) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
    preserveAsyncTarget() {
      const id = c.workspace.id;
      return () => {
        if (c.workspace.id !== id) throw Error("period changed");
      };
    },
    captureWorkspaceContext: () => ({ ...c.workspace }),
    assertWorkspaceContext: (expected) => {
      if (
        expected.id !== c.workspace.id ||
        expected.revision !== c.workspace.revision
      )
        throw Error("stale backup");
    },
    showModal() {
      if (panel) panel.isConnected = false;
      const nodes = new Map();
      panel = {
        isConnected: true,
        querySelector: (selector) => {
          if (!nodes.has(selector))
            nodes.set(selector, {
              hidden: true,
              disabled: true,
              dataset: {},
              isConnected: true,
            });
          return nodes.get(selector);
        },
      };
      return true;
    },
    snapshotInstallation: async () => content,
    validateFullBackup: (value) => {
      if (value.invalid) throw Error("invalid backup");
    },
    navigator: {
      canShare: ({ files }) =>
        files.length === 1 && files[0].type === "application/json",
      share: async (value) => {
        shares.push(value);
      },
    },
    downloadLocalFile: (blob, name) => downloads.push({ blob, name }),
    setControlLock: (...args) => locks.push(args),
  });
  vm.runInContext(source, c);
  return {
    c,
    content,
    shares,
    downloads,
    observers,
    locks,
    panel: () => panel,
    node: (selector) => panel.querySelector(selector),
    shareButton: () =>
      panel.querySelector('[data-workspace-action="share-backup-file"]'),
    status: () => panel.querySelector("[data-backup-share-status]").textContent,
    close() {
      modal.hidden = true;
      for (const observer of observers) observer();
    },
  };
}
test("backup preparation validates and builds an exact JSON file without sending or downloading", async () => {
  const f = fixture();
  assert.equal(await f.c.openBackupShare(), true);
  assert.equal(f.shares.length, 0);
  assert.equal(f.downloads.length, 0);
  assert.equal(f.shareButton().hidden, false);
  await f.c.sharePreparedBackup(f.shareButton());
  const file = f.shares[0].files[0];
  assert.equal(file.type, "application/json");
  assert.match(file.name, /^KelasYar-Backup-.*\.json$/);
  assert.deepEqual(JSON.parse(await file.text()), f.content);
});
test("native share is invoked synchronously within the second click, before any await", async () => {
  const f = fixture();
  await f.c.openBackupShare();
  let active = true,
    called = false;
  f.c.navigator.share = async () => {
    assert.equal(active, true);
    called = true;
  };
  const operation = f.c.sharePreparedBackup(f.shareButton());
  active = false;
  assert.equal(called, true);
  assert.equal(await operation, true);
});
test("unsupported sharing has an explicit manual download containing all original data", async () => {
  for (const setup of [
    (c) => {
      c.navigator.canShare = () => false;
    },
    (c) => {
      c.navigator.canShare = () => {
        throw Error("policy denied");
      };
    },
    (c) => {
      c.navigator.share = undefined;
    },
    (c) => {
      c.File = undefined;
    },
    (c) => {
      c.isSecureContext = false;
    },
  ]) {
    const f = fixture();
    setup(f.c);
    assert.equal(await f.c.openBackupShare(), true);
    assert.equal(f.shareButton().hidden, true);
    assert.equal(f.downloads.length, 0);
    assert.equal(f.c.downloadPreparedBackup(), true);
    assert.deepEqual(JSON.parse(await f.downloads[0].blob.text()), f.content);
  }
});
test("cancellation neither downloads nor claims successful delivery and permits retry", async () => {
  const f = fixture();
  await f.c.openBackupShare();
  f.c.navigator.share = async () => {
    throw Object.assign(Error("cancel"), { name: "AbortError" });
  };
  assert.equal(await f.c.sharePreparedBackup(f.shareButton()), false);
  assert.match(f.status(), /لغو/);
  assert.equal(f.downloads.length, 0);
  f.c.navigator.share = async () => {};
  assert.equal(await f.c.sharePreparedBackup(f.shareButton()), true);
});
test("permission and platform errors leave manual download available without automatic fallback", async () => {
  const f = fixture();
  await f.c.openBackupShare();
  f.c.navigator.share = async () => {
    throw Object.assign(Error("denied"), { name: "NotAllowedError" });
  };
  assert.equal(await f.c.sharePreparedBackup(f.shareButton()), false);
  assert.equal(f.downloads.length, 0);
  assert.match(f.status(), /denied/);
  assert.equal(f.c.downloadPreparedBackup(), true);
});
test("changed revision, period or connection blocks both share and manual download", async () => {
  for (const change of [
    (c) => {
      c.workspace.revision++;
    },
    (c) => {
      c.workspace.id = "B";
    },
    (c) => {
      c.connection = {};
    },
  ]) {
    const f = fixture();
    await f.c.openBackupShare();
    change(f.c);
    assert.equal(await f.c.sharePreparedBackup(f.shareButton()), false);
    assert.equal(f.c.downloadPreparedBackup(), false);
    assert.equal(f.shares.length + f.downloads.length, 0);
    assert.equal(
      f.node('[data-workspace-action="prepare-share-backup"]').hidden,
      false,
    );
  }
});
test("navigation or a closed modal during snapshot creation never enables a stale file", async () => {
  for (const change of [
    (f) => {
      f.c.workspace.id = "B";
    },
    (f) => {
      f.c.connection = {};
    },
    (f) => f.close(),
  ]) {
    const f = fixture(),
      gate = deferred();
    f.c.snapshotInstallation = async () => {
      await gate.promise;
      return f.content;
    };
    const operation = f.c.openBackupShare();
    change(f);
    gate.resolve();
    assert.equal(await operation, false);
    assert.equal(f.downloads.length + f.shares.length, 0);
  }
});
test("invalid snapshots and snapshots superseded during preparation cannot be sent", async () => {
  for (const change of [
    (f) => {
      f.content.invalid = true;
    },
    (f) => {
      f.content.stores.catalog[0].revision = 0;
    },
  ]) {
    const f = fixture();
    change(f);
    assert.equal(await f.c.openBackupShare(), false);
    assert.equal(f.shareButton().hidden, true);
    assert.equal(f.c.downloadPreparedBackup(), false);
  }
});
test("duplicate clicks cannot open two native share sheets or download during sharing", async () => {
  const f = fixture(),
    gate = deferred();
  await f.c.openBackupShare();
  f.c.navigator.share = async (value) => {
    f.shares.push(value);
    await gate.promise;
  };
  const operation = f.c.sharePreparedBackup(f.shareButton());
  assert.equal(await f.c.sharePreparedBackup(f.shareButton()), false);
  assert.equal(f.c.downloadPreparedBackup(), false);
  assert.equal(f.shares.length, 1);
  gate.resolve();
  assert.equal(await operation, true);
});
test("closing the share dialog releases prepared data and prevents later sends", async () => {
  const f = fixture();
  await f.c.openBackupShare();
  f.close();
  assert.equal(await f.c.sharePreparedBackup(f.shareButton()), false);
  assert.equal(f.c.downloadPreparedBackup(), false);
  assert.equal(f.downloads.length + f.shares.length, 0);
});
