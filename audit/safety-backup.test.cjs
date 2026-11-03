"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const snapshot = () => ({
  format: "EduManager.FullBackup",
  version: 2,
  schemaVersion: 26,
  exportedAt: "2026-11-02T00:00:00Z",
  activeWorkspace: "current",
  stores: {
    catalog: [{ id: "current" }],
    records: [{ value: "historical data" }],
    reports: [],
    undo: [],
    events: [],
    backups: [],
  },
  gradeDrafts: [],
  reportDrafts: {},
});
const backup = (id = "safety-one", at = "2026-11-02T00:00:00Z") => ({
  id,
  workspace: null,
  label: "پیش از حذف مدرسه",
  at,
  full: snapshot(),
});
function fixture(initial = [backup()]) {
  const rows = new Map(initial.map((row) => [row.id, structuredClone(row)])),
    downloads = [],
    statuses = [],
    hooks = {},
    notice = { textContent: "" };
  let serial = 0;
  const c = vm.createContext({
    workspace: { id: "current", revision: 1, closed: false },
    state: {},
    authenticated: true,
    writer: Promise.resolve(),
    assertWorkspaceReadable() {
      if (!c.authenticated) throw Error("locked");
    },
    isSafeRecordId: (id) =>
      typeof id === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(id),
    validateFullBackup: {
      normalize(value) {
        if (value.invalid) throw Error("invalid snapshot");
        return structuredClone(value);
      },
    },
    document: {
      getElementById: (id) => (id === "safetyBackupStatus" ? notice : null),
    },
    esc: (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll('"', "&quot;"),
    downloadJSON: (value, name) => {
      if (hooks.download) hooks.download();
      downloads.push({ value, name });
    },
    recordFullBackupDelivery() {
      throw Error("Historical safety must not update current backup status");
    },
    setStatus: (message, state) => statuses.push({ message, state }),
    uid: () => "new-" + ++serial,
    readRecord: async (_store, id) => {
      if (hooks.read) hooks.read();
      return structuredClone(rows.get(id));
    },
    transactionDone: (tx) => tx.done,
    connection: {
      transaction(_name, mode) {
        const staged = structuredClone(rows);
        let resolve,
          reject,
          aborted = false;
        const tx = {
            done: new Promise((yes, no) => {
              resolve = yes;
              reject = no;
            }),
            abort() {
              aborted = true;
              reject(Error("aborted"));
            },
          },
          finish = () => {
            if (aborted) return;
            if (mode === "readwrite") {
              rows.clear();
              for (const [id, value] of staged) rows.set(id, value);
            }
            resolve();
          };
        tx.objectStore = (storeName) => ({
          get() {
            const request = {};
            queueMicrotask(() => {
              if (aborted) return;
              request.result =
                storeName === "records" ? c.resetMarker : undefined;
              request.onsuccess?.();
            });
            return request;
          },
          getAll() {
            const request = {};
            queueMicrotask(() => {
              request.result = [...staged.values()];
              request.onsuccess();
            });
            return request;
          },
          put(value) {
            if (hooks.put) hooks.put();
            staged.set(value.id, structuredClone(value));
          },
          delete(id) {
            staged.delete(id);
          },
          openCursor() {
            const request = {},
              entries = [...staged.values()];
            let index = 0;
            const next = () =>
              queueMicrotask(() => {
                if (aborted) return;
                if (hooks.cursor) hooks.cursor();
                request.result =
                  index < entries.length
                    ? {
                        value: structuredClone(entries[index++]),
                        continue: next,
                      }
                    : null;
                request.onsuccess();
                if (!request.result) finish();
              });
            next();
            return request;
          },
        });
        setImmediate(finish);
        return tx;
      },
    },
  });
  for (const file of ["core/async-target.js", "backups/safety.js"])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/workspace", file), "utf8"),
      c,
    );
  const button = (id = "safety-one") => ({
    dataset: { key: id, safetyWorkspace: "current" },
    isConnected: true,
  });
  return { c, rows, downloads, statuses, hooks, notice, button };
}
test("the last-safety panel is one collapsed download, not a multi-version list or direct restore", async () => {
  const f = fixture([backup("older", "2026-11-01T00:00:00Z"), backup()]);
  const metadata = await f.c.readLatestSafetyBackup();
  assert.deepEqual(Object.keys(metadata).sort(), ["at", "id", "label"]);
  assert.equal(metadata.id, "safety-one");
  const html = f.c.safetyBackupPanel(metadata);
  assert.match(
    html,
    /^<details class="backup-help" id="lastSafetyBackup"><summary>/,
  );
  assert.equal((html.match(/<button/g) || []).length, 1);
  assert.match(
    html,
    /data-workspace-action="download-safety" data-key="safety-one"/,
  );
  assert.match(html, /نه اطلاعات فعلی/);
  assert.doesNotMatch(
    html,
    /<details[^>]* open|<table|preview-backup|restore-full|download-backup/,
  );
  assert.equal(f.c.safetyBackupPanel(null), "");
});
test("safety metadata is escaped and the newest full snapshot is selected independently of the active term", async () => {
  const row = backup();
  row.label = '<img src="x" onerror="bad()">';
  const f = fixture([{ id: "period-only", at: "2099-01-01", db: {} }, row]);
  const html = f.c.safetyBackupPanel(await f.c.readLatestSafetyBackup());
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});
test("download validates a detached full backup, excludes nested safety copies and never restores or updates current backup delivery", async () => {
  const row = backup();
  row.full.stores.backups = [{ id: "nested", full: snapshot() }];
  const f = fixture([row]);
  assert.equal(await f.c.downloadLastSafetyBackup(f.button()), true);
  assert.equal(f.downloads.length, 1);
  assert.equal(f.downloads[0].value.stores.records[0].value, "historical data");
  assert.equal(f.downloads[0].value.stores.backups.length, 0);
  assert.equal(f.rows.get(row.id).full.stores.backups.length, 1);
  assert.match(f.downloads[0].name, /^EduManager-safety-.*\.json$/);
  assert.match(
    f.notice.textContent,
    /درخواست شد.*نه اطلاعات فعلی.*بازیابی از فایل/,
  );
});
test("an expired displayed ID never silently downloads a newer safety snapshot", async () => {
  const f = fixture([backup(), backup("newer", "2026-11-03T00:00:00Z")]);
  await assert.rejects(
    f.c.downloadLastSafetyBackup(f.button()),
    /آخرین عملیات تغییر کرده/,
  );
  assert.equal(f.downloads.length, 0);
});
test("invalid full snapshots and raw-recovery dumps fail explicitly without a download", async () => {
  for (const full of [
    { ...snapshot(), invalid: true },
    { format: "EduManager.RawRecovery", stores: {} },
  ]) {
    const row = backup();
    row.full = full;
    const f = fixture([row]);
    await assert.rejects(f.c.downloadLastSafetyBackup(f.button()));
    assert.equal(f.downloads.length, 0);
    assert.match(f.notice.textContent, /انجام نشد/);
  }
});
test("workspace, connection, detached button or authentication drift cannot download a stale safety file", async () => {
  for (const change of [
    (f) => {
      f.c.workspace.id = "other";
    },
    (f) => {
      f.c.connection = {};
    },
    (f, button) => {
      button.isConnected = false;
    },
    (f) => {
      f.c.authenticated = false;
    },
  ]) {
    const f = fixture(),
      button = f.button();
    f.hooks.read = () => change(f, button);
    await assert.rejects(f.c.downloadLastSafetyBackup(button));
    assert.equal(f.downloads.length, 0);
  }
});
test("a closed readable term may download safety but a locked term cannot read it", async () => {
  const f = fixture();
  f.c.workspace.closed = true;
  assert.equal(await f.c.downloadLastSafetyBackup(f.button()), true);
  f.c.authenticated = false;
  await assert.rejects(f.c.readLatestSafetyBackup(), /locked/);
});
test("a write failure never claims a download or records successful delivery", async () => {
  const f = fixture();
  f.hooks.download = () => {
    throw Error("download failed");
  };
  await assert.rejects(
    f.c.downloadLastSafetyBackup(f.button()),
    /download failed/,
  );
  assert.equal(f.downloads.length, 0);
  assert.equal(f.statuses.length, 0);
});
test("storing safety validates first, strips nested copies and durably retains only the existing eight-snapshot bound", async () => {
  const rows = Array.from({ length: 10 }, (_, index) =>
    backup(
      "older-" + index,
      "2026-10-" + String(index + 1).padStart(2, "0") + "T00:00:00Z",
    ),
  );
  const f = fixture(rows),
    full = snapshot();
  full.stores.backups = [{ id: "nested", full: snapshot() }];
  const saved = await f.c.putSafetySnapshot(full, "پیش از حذف", {
    idPrefix: "before-shared-delete-",
  });
  assert.equal(f.rows.size, 8);
  assert.ok(f.rows.has(saved.id));
  assert.equal(saved.full.stores.backups.length, 0);
  assert.equal(full.stores.backups.length, 1);
});
test("validation or transactional failure leaves the previous safety snapshots intact", async () => {
  const f = fixture(),
    before = JSON.stringify([...f.rows]);
  await assert.rejects(
    f.c.putSafetySnapshot({ ...snapshot(), invalid: true }, "عملیات"),
    /invalid snapshot/,
  );
  assert.equal(JSON.stringify([...f.rows]), before);
  f.hooks.put = () => {
    throw Error("quota");
  };
  await assert.rejects(f.c.putSafetySnapshot(snapshot(), "عملیات"), /quota/);
  assert.equal(JSON.stringify([...f.rows]), before);
});
