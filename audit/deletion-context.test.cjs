"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    errors = [],
    backups = new Map(),
    savedScopes = [],
    backupJournal = [],
    hooks = { failBackupPut: false };
  const context = {
    kind: "school",
    id: "school",
    schoolId: "school",
    workspace: "first",
    revision: 1,
  };
  const c = vm.createContext({
    workspace: { id: "first", revision: 1, year: "1405-1406" },
    connection: {
      transaction(name, mode) {
        assert.equal(name, "backups");
        assert.equal(mode, "readwrite");
        const staged = structuredClone(backups);
        let resolve,
          reject,
          aborted = false,
          written = false;
        const tx = {
          done: new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          }),
          abort() {
            aborted = true;
            reject(Error("backup transaction aborted"));
          },
          objectStore(storeName) {
            assert.equal(storeName, "backups");
            return {
              getAll() {
                const request = {};
                queueMicrotask(() => {
                  if (aborted) return;
                  request.result = [...staged.values()].map((value) =>
                    structuredClone(value),
                  );
                  request.onsuccess();
                  if (aborted) return;
                  backups.clear();
                  for (const [id, value] of staged) backups.set(id, value);
                  backupJournal.push("complete");
                  if (written) effects.push("backup");
                  resolve();
                });
                return request;
              },
              put(value) {
                assert.equal(
                  effects.includes("backup"),
                  false,
                  "backup is acknowledged only after transaction completion",
                );
                if (hooks.failBackupPut) throw Error("quota");
                backupJournal.push("put");
                staged.set(value.id, structuredClone(value));
                written = true;
              },
              delete(id) {
                staged.delete(id);
              },
            };
          },
        };
        return tx;
      },
    },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    state: { view: "school", schoolId: "school", classId: "class" },
    db: {
      schools: [{ id: "school", name: "School", classes: [] }],
      sessions: [],
      masterSchedule: {},
    },
    document: {
      querySelector: () => ({ form: {} }),
      getElementById: () => ({ value: "School" }),
    },
    beginRecordEditorSave: () => () => {},
    assertEntityWritable() {},
    preserveAsyncTarget() {
      const id = c.workspace.id;
      return () => {
        if (c.workspace.id !== id) throw Error("workspace changed");
      };
    },
    validateFullBackup: { normalize: structuredClone },
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    putBackup: async () => effects.push("backup"),
    transactionDone: (tx) => tx.done,
    uid: () => "test-backup",
    snapshotInstallation: async () => ({
      format: "EduManager.FullBackup",
      version: 2,
      schemaVersion: 26,
      activeWorkspace: "first",
      stores: {
        catalog: [
          { id: "first", year: "1405-1406", term: "اول", revision: 1 },
          { id: "second", year: "1405-1406", term: "دوم", revision: 2 },
          { id: "another-year", year: "1406-1407", term: "اول", revision: 3 },
        ],
        records: [
          {
            key: "second|class:peer",
            workspace: "second",
            logical: "class:peer",
            value: { id: "peer", name: "Peer course definitions preserved" },
          },
        ],
        events: [],
        undo: [],
        reports: [],
        backups: [],
      },
      reportDrafts: {},
      gradeDrafts: [],
    }),
    saveDBV24: async (scope) => {
      savedScopes.push(structuredClone(scope));
      effects.push("save");
    },
    rememberRecordEditor() {},
    render: () => effects.push("render"),
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
      path.join(__dirname, "../src/workspace/backups/safety.js"),
      "utf8",
    ),
    c,
  );
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/entities/delete.js"),
      "utf8",
    ),
    c,
  );
  vm.runInContext("deletionContext = context", c);
  c.getSchool = (id) => c.db.schools.find((school) => school.id === id);
  return {
    c,
    effects,
    errors,
    backups,
    savedScopes,
    backupJournal,
    hooks,
    pending: () => vm.runInContext("deletionContext", c),
  };
}
for (const kind of ["workspace", "connection", "preview"]) {
  test(`deletion stops before mutation if ${kind} changes during backup`, async () => {
    const f = fixture();
    let injected = false;
    f.c.snapshotInstallation = async () => {
      injected = true;
      if (kind === "workspace") f.c.workspace.id = "second";
      else if (kind === "connection") f.c.connection = {};
      else vm.runInContext("deletionContext = { ...context }", f.c);
    };
    await f.c.confirmDeletion();
    assert.equal(injected, true);
    assert.equal(f.c.db.schools.length, 1);
    assert.equal(f.effects.length, 0);
    assert.equal(f.errors.length, 1);
  });
}
for (const kind of ["workspace", "connection", "preview"]) {
  test(`late deletion completion preserves a changed ${kind} view`, async () => {
    const f = fixture();
    let injected = false;
    f.c.saveDBV24 = async () => {
      injected = true;
      if (kind === "workspace") f.c.workspace.id = "second";
      else if (kind === "connection") f.c.connection = {};
      else vm.runInContext("deletionContext = { ...context }", f.c);
    };
    await f.c.confirmDeletion();
    assert.equal(injected, true);
    assert.deepEqual(f.effects, ["backup"]);
    assert.equal(f.c.state.view, "school");
    assert.equal(f.c.state.schoolId, "school");
    assert.notEqual(f.pending(), null);
  });
}
test("valid deletion saves backup first, persists removal and then updates its view", async () => {
  const f = fixture();
  await f.c.confirmDeletion();
  assert.deepEqual(f.effects, ["backup", "save", "render", "close", "status"]);
  assert.equal(f.c.db.schools.length, 0);
  assert.equal(f.c.state.view, "schools");
  assert.equal(f.pending(), null);
  assert.equal(f.errors.length, 0);
});
test("failed pre-deletion backup prevents deletion", async () => {
  const f = fixture();
  f.c.snapshotInstallation = async () => {
    throw Error("quota");
  };
  await f.c.confirmDeletion();
  assert.equal(f.c.db.schools.length, 1);
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors.length, 1);
});

test("shared deletion stores the full snapshot and threads every same-year revision after durable backup", async () => {
  const f = fixture();
  await f.c.confirmDeletion();
  const backup = [...f.backups.values()][0];
  assert.equal(backup.workspace, null);
  assert.equal(backup.full.format, "EduManager.FullBackup");
  assert.equal(backup.full.stores.catalog.length, 3);
  assert.equal(
    backup.full.stores.records[0].value.name,
    "Peer course definitions preserved",
  );
  assert.deepEqual(f.backupJournal, ["put", "complete"]);
  assert.deepEqual(f.savedScopes[0].directoryRevisions, [
    { id: "first", year: "1405-1406", revision: 1 },
    { id: "second", year: "1405-1406", revision: 2 },
  ]);
  assert.deepEqual(f.effects, ["backup", "save", "render", "close", "status"]);
});
test("failed full-backup transaction never acknowledges backup or deletes school data", async () => {
  const f = fixture();
  f.hooks.failBackupPut = true;
  await f.c.confirmDeletion();
  assert.equal(f.c.db.schools.length, 1);
  assert.equal(f.backups.size, 0);
  assert.equal(f.effects.length, 0);
  assert.equal(f.savedScopes.length, 0);
  assert.equal(f.errors[0].message, "quota");
});
