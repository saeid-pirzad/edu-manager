"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function storage() {
  const result = {};
  Object.defineProperties(result, {
    getItem: {
      value(key) {
        return Object.hasOwn(this, key) ? this[key] : null;
      },
    },
    setItem: {
      value(key, value) {
        this[key] = String(value);
      },
    },
    removeItem: {
      value(key) {
        delete this[key];
      },
    },
  });
  return result;
}
function fixture({ expected = "old", actual = "new" } = {}) {
  let serial = 0;
  const names = ["records", "catalog", "backups", "drafts"],
    stores = Object.fromEntries(names.map((name) => [name, new Map()]));
  stores.records.set("@installation-reset", {
    key: "@installation-reset",
    value: { token: actual, phase: "complete" },
  });
  stores.catalog.set("year", { id: "year", revision: 1 });
  const c = vm.createContext({
    installationToken: expected,
    RESET_RECORD_KEY: "@installation-reset",
    RESET_EPOCH_KEY: "EduManager.resetEpoch",
    workspace: { id: "year", revision: 1 },
    ready: true,
    resetBusy: false,
    connectionRetired: false,
    clone: structuredClone,
    uid: () => "generated-" + ++serial,
    documentToken: "document",
    draftGeneration: 1,
    drafts: new Map(),
    draftWriter: Promise.resolve(),
    draftWritesPending: 0,
    draftRecoveryFailed: false,
    draftBaseKey: () => "Edu24.drafts.year.tab",
    localStorage: storage(),
    sessionStorage: storage(),
    document: { getElementById: () => null },
    window: {},
    setStatus() {},
    preserveAsyncTarget: () => () => {},
    validateFullBackup: { normalize: structuredClone },
    STORAGE_KEY: "EduManager",
    transactionDone: (tx) => tx.done,
    requestPromise: (request) =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    allFrom: async (name) => structuredClone([...stores[name].values()]),
  });
  c.connection = {
    objectStoreNames: { contains: (name) => !!stores[name] },
    transaction(_names, mode = "readonly") {
      const staged = Object.fromEntries(
        names.map((name) => [name, structuredClone(stores[name])]),
      );
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
      };
      const request = (work) => {
        const req = {};
        queueMicrotask(() => {
          if (aborted) return;
          req.result = structuredClone(work());
          req.onsuccess?.();
        });
        return req;
      };
      tx.objectStore = (name) => ({
        get: (key) => request(() => staged[name].get(key)),
        getAll: () => request(() => [...staged[name].values()]),
        put(row) {
          const key = row.key ?? row.id;
          staged[name].set(key, structuredClone(row));
        },
        delete(key) {
          staged[name].delete(key);
        },
        clear() {
          staged[name].clear();
        },
      });
      setImmediate(() => {
        if (aborted) return;
        if (mode === "readwrite")
          for (const name of names) {
            stores[name].clear();
            for (const [key, row] of staged[name]) stores[name].set(key, row);
          }
        resolve();
      });
      return tx;
    },
  };
  c.EduDataStoreRuntime = {
    requestPromise: c.requestPromise,
    transactionDone: c.transactionDone,
  };
  function load(file) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/workspace", file), "utf8"),
      c,
    );
  }
  return { c, stores, load };
}
test("stale tab cannot append a period backup into a replaced installation", async () => {
  const f = fixture();
  f.load("backups/local.js");
  await assert.rejects(
    f.c.putBackup({ schools: [] }, "before close"),
    (error) => error.code === "INSTALLATION_CHANGED",
  );
  assert.equal(f.stores.backups.size, 0);
});
test("a deleted workspace cannot receive an orphan backup even when the installation token matches", async () => {
  const f = fixture({ expected: "same", actual: "same" });
  f.stores.catalog.clear();
  f.load("backups/local.js");
  await assert.rejects(
    f.c.putBackup({ schools: [] }, "before close"),
    /ترم|نوبت/,
  );
  assert.equal(f.stores.backups.size, 0);
});
test("stale file picker cannot replace the restored installation's file connection", async () => {
  const f = fixture();
  f.load("backups/single-file.js");
  vm.runInContext(
    'singleFile={connectionId:"obsolete",handle:{name:"old.json"}}',
    f.c,
  );
  f.stores.drafts.set("EduManager.singleFile", {
    key: "EduManager.singleFile",
    connectionId: "new-current",
  });
  await assert.rejects(
    f.c.persistSingleFile({ replace: true }),
    (error) => error.code === "INSTALLATION_CHANGED",
  );
  assert.equal(
    f.stores.drafts.get("EduManager.singleFile").connectionId,
    "new-current",
  );
});
test("obsolete draft cleanup cannot delete a restored row with the same draft key", async () => {
  const f = fixture({ expected: "same", actual: "same" });
  f.load("drafts/persistence.js");
  const old = {
      key: "Edu24.drafts.year.tab.old",
      generation: 1,
      entries: [{ kind: "k", value: "18" }],
      updatedAt: "2026-11-03T10:00:00Z",
    },
    newer = {
      key: "Edu24.drafts.year.tab.new",
      generation: 3,
      entries: [],
      updatedAt: "2026-11-03T11:00:00Z",
    },
    replacement = {
      ...old,
      generation: 7,
      entries: [{ kind: "k", value: "20" }],
    };
  f.stores.drafts.set(old.key, replacement);
  f.c.localStorage.setItem(old.key, JSON.stringify(replacement));
  f.c.persistedGradeDrafts = async () => [old, newer];
  f.c.storeDrafts = async () => {};
  await f.c.loadDrafts();
  assert.equal(f.stores.drafts.has(old.key), true);
  assert.equal(f.c.localStorage.getItem(old.key), JSON.stringify(replacement));
});
test("obsolete reset cleanup cannot erase preferences from a newer installation", async () => {
  const f = fixture();
  f.load("data/reset.js");
  f.c.localStorage.setItem("Edu24.drafts.year.new.document", "current data");
  const marker = {
    key: "@installation-reset",
    value: { token: "old", phase: "cleanup" },
  };
  await assert.rejects(f.c.completeResetCleanup(f.c.connection, marker));
  assert.equal(
    f.c.localStorage.getItem("Edu24.drafts.year.new.document"),
    "current data",
  );
  assert.equal(f.stores.records.get("@installation-reset").value.token, "new");
});

test("reset cleanup replay never erases new drafts after the same marker was completed by another tab", async () => {
  const f = fixture({ expected: "same", actual: "same" });
  f.load("data/reset.js");
  f.c.localStorage.setItem("Edu24.drafts.year.current.document", "new input");
  await f.c.completeResetCleanup(f.c.connection, {
    key: "@installation-reset",
    value: { token: "same", phase: "cleanup" },
  });
  assert.equal(
    f.c.localStorage.getItem("Edu24.drafts.year.current.document"),
    "new input",
  );
});
for (const token of ["", "same"]) {
  test(
    "valid and legacy installations retain exactly eight regular backups and the newly created snapshot: " +
      JSON.stringify(token),
    async () => {
      const f = fixture({ expected: token, actual: token });
      f.load("backups/local.js");
      if (!token) f.stores.records.clear();
      for (let i = 0; i < 10; i++)
        f.stores.backups.set("previous-" + i, {
          id: "previous-" + i,
          workspace: "year",
          at: "2099-01-01T00:00:00Z",
          label: "previous",
          db: {},
        });
      f.stores.backups.set("migration", {
        id: "migration",
        workspace: "year",
        label: "انتقال نسخه قبلی",
        db: {},
      });
      const saved = await f.c.putBackup({ schools: [] }, "before close");
      assert.equal(
        f.stores.backups.has(saved.id),
        true,
        "the new snapshot survives a backward system clock",
      );
      assert.equal(
        [...f.stores.backups.values()].filter(
          (row) =>
            row.workspace === "year" && !String(row.label).includes("انتقال"),
        ).length,
        8,
      );
      assert.equal(f.stores.backups.has("migration"), true);
    },
  );
}
test("legacy migration may keep an installation-wide backup before the first catalog exists", async () => {
  const f = fixture({ expected: "", actual: "" });
  f.stores.records.clear();
  f.stores.catalog.clear();
  f.load("backups/local.js");
  const saved = await f.c.putBackup({ schools: [] }, "انتقال نسخه قبلی", null);
  assert.equal(f.stores.backups.get(saved.id).workspace, null);
});
test("normal reset cleanup removes only owned preferences and completes its matching marker", async () => {
  const f = fixture({ expected: "same", actual: "same" });
  f.load("data/reset.js");
  f.stores.records.set("@installation-reset", {
    key: "@installation-reset",
    value: { token: "same", phase: "cleanup" },
  });
  f.c.localStorage.setItem("Edu24.drafts.year.current.document", "old input");
  f.c.localStorage.setItem("other-app", "unrelated");
  f.c.sessionStorage.setItem("Edu24.activePeriod", "old-period");
  await f.c.completeResetCleanup(f.c.connection, {
    key: "@installation-reset",
    value: { token: "same", phase: "cleanup" },
  });
  assert.equal(
    f.c.localStorage.getItem("Edu24.drafts.year.current.document"),
    null,
  );
  assert.equal(f.c.localStorage.getItem("other-app"), "unrelated");
  assert.equal(f.c.sessionStorage.getItem("Edu24.activePeriod"), null);
  assert.equal(
    f.stores.records.get("@installation-reset").value.phase,
    "complete",
  );
});
test("obsolete draft cleanup still removes unchanged superseded rows while retaining current ones", async () => {
  const f = fixture({ expected: "same", actual: "same" });
  f.load("drafts/persistence.js");
  const row = {
    key: "Edu24.drafts.year.tab.old",
    workspace: "year",
    generation: 1,
    entries: [],
    updatedAt: "2026-11-03T10:00:00Z",
  };
  f.stores.drafts.set(row.key, row);
  f.c.localStorage.setItem(row.key, JSON.stringify(row));
  await f.c.pruneGradeDrafts([row], f.c.connection, "same");
  assert.equal(f.stores.drafts.has(row.key), false);
  assert.equal(f.c.localStorage.getItem(row.key), null);
});
