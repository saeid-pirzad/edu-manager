"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(kind = "school") {
  const effects = [],
    errors = [],
    savedScopes = [],
    transactions = [],
    copyCalls = [],
    hooks = {};
  const catalog = [
      { id: "first", year: "1405-1406", term: "اول", revision: 1 },
      { id: "second", year: "1405-1406", term: "دوم", revision: 2 },
      { id: "another-year", year: "1406-1407", term: "اول", revision: 3 },
    ],
    context = {
      kind,
      id: kind,
      schoolId: "school",
      classId: "class",
      workspace: "first",
      revision: 1,
    },
    forbidCopy = (name) => () => {
      copyCalls.push(name);
      throw Error("Deletion must not create an internal safety copy: " + name);
    };
  const c = vm.createContext({
    workspace: { id: "first", revision: 1, year: "1405-1406" },
    installationToken: "test-installation",
    RESET_RECORD_KEY: "@installation-reset",
    connection: {
      transaction(names, mode) {
        const storeNames = Array.from(names);
        transactions.push({ names: storeNames, mode });
        assert.deepEqual(storeNames, ["catalog", "records"]);
        assert.equal(mode, "readonly");
        let resolve;
        const tx = {
          done: new Promise((yes) => {
            resolve = yes;
          }),
          objectStore(storeName) {
            assert.ok(storeNames.includes(storeName));
            const request = (result) => {
              const value = {};
              queueMicrotask(() => {
                value.result = structuredClone(result());
                value.onsuccess();
              });
              return value;
            };
            if (storeName === "catalog")
              return { getAll: () => request(() => catalog) };
            return {
              get(key) {
                assert.equal(key, c.RESET_RECORD_KEY);
                return request(
                  () =>
                    hooks.marker ?? {
                      key,
                      value: { token: "test-installation" },
                    },
                );
              },
            };
          },
        };
        setImmediate(resolve);
        return tx;
      },
    },
    requestPromise: (request) =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    transactionDone: (tx) => tx.done,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    state: { view: "school", schoolId: "school", classId: "class" },
    db: {
      schools: [
        {
          id: "school",
          name: "School",
          classes: [
            {
              id: "class",
              name: "Class",
              students: [],
              archivedStudents: [],
              lessons: [{ id: "lesson", name: "Lesson" }],
            },
          ],
        },
      ],
      sessions: [],
      masterSchedule: {},
    },
    document: {
      querySelector: () => ({ form: {} }),
      getElementById: () => ({ value: kind[0].toUpperCase() + kind.slice(1) }),
    },
    beginRecordEditorSave: () => () => {},
    assertEntityWritable() {},
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    putBackup: forbidCopy("putBackup"),
    putSafetySnapshot: forbidCopy("putSafetySnapshot"),
    snapshotInstallation: forbidCopy("snapshotInstallation"),
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
    savedScopes,
    transactions,
    copyCalls,
    catalog,
    hooks,
    pending: () => vm.runInContext("deletionContext", c),
  };
}
for (const kind of ["workspace", "connection", "preview", "installation"]) {
  test(`deletion stops before mutation if ${kind} changes during catalog read`, async () => {
    const f = fixture(),
      before = structuredClone(f.c.db),
      read = f.c.readDeletionCatalog;
    let injected = false;
    f.c.readDeletionCatalog = async (...args) => {
      const catalog = await read(...args);
      injected = true;
      if (kind === "workspace") f.c.workspace.id = "second";
      else if (kind === "connection") f.c.connection = {};
      else if (kind === "installation") f.c.installationToken = "replacement";
      else vm.runInContext("deletionContext = { ...context }", f.c);
      return catalog;
    };
    await f.c.confirmDeletion();
    assert.equal(injected, true);
    assert.deepEqual(structuredClone(f.c.db), before);
    assert.equal(f.effects.length, 0);
    assert.equal(f.errors.length, 1);
    assert.deepEqual(f.copyCalls, []);
  });
}
for (const kind of ["workspace", "connection", "preview", "installation"]) {
  test(`late deletion completion preserves a changed ${kind} view`, async () => {
    const f = fixture();
    let injected = false;
    f.c.saveDBV24 = async () => {
      injected = true;
      if (kind === "workspace") f.c.workspace.id = "second";
      else if (kind === "connection") f.c.connection = {};
      else if (kind === "installation") f.c.installationToken = "replacement";
      else vm.runInContext("deletionContext = { ...context }", f.c);
    };
    await f.c.confirmDeletion();
    assert.equal(injected, true);
    assert.deepEqual(f.effects, []);
    assert.equal(f.c.state.view, "school");
    assert.equal(f.c.state.schoolId, "school");
    assert.notEqual(f.pending(), null);
    assert.deepEqual(f.copyCalls, []);
  });
}

test("valid deletion persists removal and then updates its view without a safety copy", async () => {
  const f = fixture();
  await f.c.confirmDeletion();
  assert.deepEqual(f.effects, ["save", "render", "close", "status"]);
  assert.equal(f.c.db.schools.length, 0);
  assert.equal(f.c.state.view, "schools");
  assert.equal(f.pending(), null);
  assert.equal(f.errors.length, 0);
  assert.deepEqual(f.copyCalls, []);
});

test("failed catalog read prevents deletion", async () => {
  const f = fixture(),
    before = structuredClone(f.c.db);
  f.c.readDeletionCatalog = async () => {
    throw Error("catalog read failed");
  };
  await f.c.confirmDeletion();
  assert.deepEqual(structuredClone(f.c.db), before);
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors[0].message, "catalog read failed");
  assert.deepEqual(f.copyCalls, []);
});

for (const kind of ["school", "class", "lesson"]) {
  test(`shared ${kind} deletion reads only catalog and installation guards and threads every same-year revision`, async () => {
    const f = fixture(kind),
      originalCatalog = structuredClone(f.catalog);
    await f.c.confirmDeletion();
    assert.equal(f.errors.length, 0);
    assert.deepEqual(f.copyCalls, []);
    assert.deepEqual(f.transactions, [
      { names: ["catalog", "records"], mode: "readonly" },
    ]);
    assert.deepEqual(f.savedScopes[0].directoryRevisions, [
      { id: "first", year: "1405-1406", revision: 1 },
      { id: "second", year: "1405-1406", revision: 2 },
    ]);
    assert.deepEqual(f.catalog, originalCatalog);
    assert.deepEqual(f.effects, ["save", "render", "close", "status"]);
    if (kind === "school") assert.equal(f.c.db.schools.length, 0);
    else if (kind === "class")
      assert.equal(f.c.db.schools[0].classes.length, 0);
    else assert.equal(f.c.db.schools[0].classes[0].lessons.length, 0);
  });
}

test("failed deletion save keeps its editor and view pending", async () => {
  const f = fixture();
  f.c.saveDBV24 = async () => {
    throw Error("write failed");
  };
  await f.c.confirmDeletion();
  assert.equal(f.c.state.view, "school");
  assert.equal(f.c.state.schoolId, "school");
  assert.notEqual(f.pending(), null);
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors[0].message, "write failed");
  assert.deepEqual(f.copyCalls, []);
});

test("a durable installation mismatch prevents deletion without creating a safety copy", async () => {
  const f = fixture(),
    before = structuredClone(f.c.db);
  f.hooks.marker = {
    key: f.c.RESET_RECORD_KEY,
    value: { token: "replacement-installation" },
  };
  await f.c.confirmDeletion();
  assert.deepEqual(structuredClone(f.c.db), before);
  assert.deepEqual(f.copyCalls, []);
  assert.equal(f.effects.length, 0);
  assert.equal(f.savedScopes.length, 0);
  assert.equal(f.errors[0].code, "INSTALLATION_CHANGED");
});
