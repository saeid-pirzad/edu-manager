"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture({ syncFailure = false, asyncFailure = false } = {}) {
  const committed = [],
    switched = [],
    status = [];
  let sequence = 0,
    aborted = false;
  const stores = ["records", "catalog", "events", "backups", "undo", "reports"];
  const source = {
    activeWorkspace: "source",
    gradeDrafts: [],
    stores: Object.fromEntries(stores.map((name) => [name, []])),
  };
  const c = vm.createContext({
    workspace: { id: "original" },
    resetBusy: false,
    connectionRetired: false,
    periodLoading: false,
    EduFullBackupValidator: {
      create: () => () => [
        {
          period: { id: "source", year: "1405-1406", term: "اول" },
          data: { settings: { academicTerm: "اول" } },
        },
      ],
    },
    backupStores: stores,
    assertSafeDataTree() {},
    isDataObject() {},
    isSafeRecordId() {},
    validateReportNotes: () => ({}),
    decodeWorkspaceRecords() {},
    validateFrozenReport() {},
    normalizeDB() {},
    validatedUndoCandidate() {},
    isSupportedGradeDraft() {},
    document: { querySelector: () => null },
    showModal: () => true,
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    allFrom: async () => [],
    normalizedName: String,
    uid: () => "new_" + ++sequence,
    academicTermKind: () => "first",
    collectRecords: (data) => new Map([["meta", data]]),
    clone: structuredClone,
    window: { EduPeriodicReports: { restoreDrafts: () => true } },
    switchPeriod: async (id) => switched.push(id),
    setStatus: (...args) => status.push(args),
    transactionDone: (tx) => tx.done,
    connection: {
      transaction: () => {
        const queued = [];
        let resolve, reject;
        const done = new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });
        setImmediate(() => {
          if (aborted) return;
          if (asyncFailure) {
            reject(Error("asynchronous write failure"));
            return;
          }
          committed.push(...queued);
          resolve();
        });
        return {
          done,
          abort: () => {
            aborted = true;
            reject(Error("transaction aborted"));
          },
          objectStore: (name) => ({
            add: (row) => {
              if (syncFailure && name === "catalog")
                throw Error("synchronous write failure");
              queued.push({ name, row });
            },
          }),
        };
      },
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/full-restore.js"),
      "utf8",
    ),
    c,
  );
  c.previewFullBackup(source);
  return { c, source, committed, switched, status, aborted: () => aborted };
}
test("a synchronous add failure aborts all earlier queued restore writes", async () => {
  const { c, committed, aborted } = fixture({ syncFailure: true });
  await assert.rejects(c.restoreFullBackup(), /synchronous write failure/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(committed.length, 0);
  assert.equal(aborted(), true);
});
test("an asynchronous transaction failure cannot navigate to or partially restore a new period", async () => {
  const { c, committed, switched } = fixture({ asyncFailure: true });
  await assert.rejects(c.restoreFullBackup(), /asynchronous write failure/);
  assert.equal(committed.length, 0);
  assert.equal(switched.length, 0);
});
test("full-restore preview cannot be replaced during an active restore", async () => {
  const { c, source } = fixture();
  let release;
  c.flushDrafts = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = c.restoreFullBackup();
  assert.throws(() => c.previewFullBackup({ gradeDrafts: [] }));
  assert.equal(vm.runInContext("pendingFullBackup", c), source);
  release();
  await pending;
});
test("workspace changes before restore commit prevent any writes", async () => {
  const { c, committed } = fixture();
  c.allFrom = async () => {
    c.workspace.id = "other";
    return [];
  };
  await assert.rejects(c.restoreFullBackup());
  assert.equal(committed.length, 0);
});
test("workspace changes after restore commit do not navigate away from the new selection", async () => {
  const { c, committed, switched } = fixture();
  c.window.EduPeriodicReports.restoreDrafts = () => {
    c.workspace.id = "other";
    return true;
  };
  assert.equal(await c.restoreFullBackup(), 1);
  assert.equal(committed.length, 2);
  assert.equal(switched.length, 0);
});
