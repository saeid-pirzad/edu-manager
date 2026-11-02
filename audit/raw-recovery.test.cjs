"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  clone = structuredClone;
function fixture({ legacy = null, connected = true } = {}) {
  const names = [
      "records",
      "catalog",
      "events",
      "backups",
      "undo",
      "reports",
      "drafts",
    ],
    tables = Object.fromEntries(
      names.map((name) => [name, [{ id: name + "-raw", unvalidated: true }]]),
    ),
    downloads = [],
    blobs = [],
    transactions = [],
    hooks = { afterRead: null, failRead: "" },
    storage = {
      "Edu24.drafts.first.tab": '{"generation":2,"entries":[{"value":"99"}]}',
      "EduManager.periodicDrafts.first": '{"raw-note":"متن ذخیره‌نشده"}',
      "other-application-key": "do not export",
    };
  if (legacy !== null) storage.legacy = legacy;
  storage.getItem = (key) =>
    Object.hasOwn(storage, key) ? storage[key] : null;
  tables.reports = [{ id: "damaged-report", classes: [null] }];
  tables.undo = [{ id: "first", revision: "damaged", before: [null] }];
  tables.catalog = [{ id: "first", year: "سال نامعلوم قدیمی" }];
  tables.drafts = [
    { key: "EduManager.singleFile", handle: { deviceOnly: true } },
    {
      key: "Edu24.drafts.first.tab",
      workspace: "first",
      entries: [{ value: "99" }],
    },
  ];
  tables.backups = [
    {
      id: "nested",
      full: {
        format: "EduManager.RawRecovery",
        stores: {
          drafts: [
            { key: "EduManager.singleFile", handle: { deviceOnly: true } },
            { key: "keep", entries: [] },
          ],
          backups: { damaged: true },
          reports: [null],
        },
      },
    },
  ];
  const c = vm.createContext({
    Blob,
    connectionRetired: false,
    resetBusy: false,
    localStorage: storage,
    STORAGE_KEY: "legacy",
    EduDataStoreSchema: { stores: names.map((name) => ({ name })) },
    downloadJSON: (content, name) => downloads.push({ content, name }),
    downloadLocalFile: (blob, name) => blobs.push({ blob, name }),
    setStatus() {},
    requestPromise: (request) =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    transactionDone: (tx) => tx.done,
  });
  c.connection = connected
    ? {
        transaction(requested, mode) {
          transactions.push({ names: Array.from(requested), mode });
          let finish,
            fail,
            pending = 0,
            aborted = false;
          const done = new Promise((yes, no) => {
            finish = yes;
            fail = no;
          });
          return {
            done,
            objectStore(name) {
              return {
                getAll() {
                  const request = {};
                  pending++;
                  queueMicrotask(() => {
                    if (aborted) return;
                    if (hooks.failRead === name) {
                      aborted = true;
                      request.error = Error("raw read failed");
                      request.onerror();
                      fail(request.error);
                      return;
                    }
                    request.result = clone(tables[name]);
                    request.onsuccess();
                    pending--;
                    if (!pending) {
                      hooks.afterRead?.();
                      finish();
                    }
                  });
                  return request;
                },
              };
            },
          };
        },
      }
    : null;
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/data/raw-recovery.js"),
      "utf8",
    ),
    c,
  );
  return {
    c,
    tables,
    downloads,
    blobs,
    transactions,
    hooks,
    run: () => c.rawRecoveryV24(),
  };
}
test("raw recovery atomically preserves every store, damaged ancillary values and owned local drafts without device handles", async () => {
  const f = fixture(),
    before = clone(f.tables);
  await f.run();
  assert.equal(f.transactions.length, 1);
  assert.equal(f.transactions[0].mode, "readonly");
  assert.deepEqual(f.transactions[0].names, [
    "records",
    "catalog",
    "events",
    "backups",
    "undo",
    "reports",
    "drafts",
  ]);
  const content = f.downloads[0].content;
  assert.equal(content.recoveryDump, true);
  assert.equal(content.format, "EduManager.RawRecovery");
  assert.deepEqual(content.catalog, content.stores.catalog);
  assert.deepEqual(content.records, content.stores.records);
  for (const name of ["catalog", "records", "events", "undo", "reports"])
    assert.deepEqual(content.stores[name], before[name]);
  assert.equal(content.stores.drafts.length, 1);
  assert.equal(content.stores.backups[0].full.stores.drafts.length, 1);
  assert.equal(JSON.stringify(content).includes("deviceOnly"), false);
  assert.equal(
    Object.hasOwn(content.localRecovery, "Edu24.drafts.first.tab"),
    true,
  );
  assert.equal(
    Object.hasOwn(content.localRecovery, "EduManager.periodicDrafts.first"),
    true,
  );
  assert.equal(
    Object.hasOwn(content.localRecovery, "other-application-key"),
    false,
  );
  assert.deepEqual(f.tables, before);
});
test("legacy local data never hides current IndexedDB recovery data", async () => {
  const f = fixture({ legacy: '{"old":"exact legacy bytes"}' });
  await f.run();
  assert.equal(f.blobs.length, 0);
  assert.equal(
    f.downloads[0].content.legacyRaw,
    '{"old":"exact legacy bytes"}',
  );
  assert.deepEqual(f.downloads[0].content.stores.reports, f.tables.reports);
});
test("legacy-only recovery still downloads the unchanged original bytes without a database connection", async () => {
  const f = fixture({ legacy: "not necessarily valid JSON", connected: false });
  await f.run();
  assert.equal(f.downloads.length, 0);
  assert.equal(await f.blobs[0].blob.text(), "not necessarily valid JSON");
  assert.equal(f.transactions.length, 0);
});
for (const phase of [
  "retired",
  "replacement",
  "retired-after-read",
  "read-failure",
])
  test(
    "raw recovery never claims a stale or partial read after " + phase,
    async () => {
      const f = fixture();
      if (phase === "retired") f.c.connectionRetired = true;
      else if (phase === "replacement")
        f.hooks.afterRead = () => {
          f.c.connection = {};
        };
      else if (phase === "retired-after-read")
        f.hooks.afterRead = () => {
          f.c.connectionRetired = true;
        };
      else f.hooks.failRead = "reports";
      await assert.rejects(f.run());
      assert.equal(f.downloads.length, 0);
      assert.equal(f.blobs.length, 0);
    },
  );
test("raw recovery reports an unavailable source without an invented empty recovery file", async () => {
  const f = fixture({ connected: false });
  await assert.rejects(f.run(), /بانک محلی/);
  assert.equal(f.downloads.length + f.blobs.length, 0);
});
