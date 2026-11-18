"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
async function fixture() {
  const c = {
    installationToken: "installation-one",
    workspace: { id: "first", year: "1405-1406" },
    db: { settings: { password: "source-hash" } },
    isAuthenticated: true,
    resetBusy: false,
    connectionRetired: false,
    academicTermKind: (term) =>
      ({ first: "first", second: "second" })[term] || null,
    transactionDone: async () => {},
    requestPromise: async (value) => value,
  };
  const rows = [
    { id: "first", termKind: "first", password: "source-hash" },
    { id: "second", termKind: "second", password: "peer-hash" },
    { id: "empty", termKind: "second", password: "" },
    { id: "same", termKind: "second", password: "source-hash" },
    { id: "unknown", termKind: null, password: "" },
  ];
  c.connection = {
    transaction() {
      return {
        objectStore(name) {
          return name === "catalog"
            ? {
                getAll() {
                  const request = {};
                  queueMicrotask(() => {
                    request.result = rows.map((row) => ({
                      ...row,
                      year: "1405-1406",
                    }));
                    request.onsuccess();
                  });
                  return request;
                },
              }
            : {
                get(key) {
                  return {
                    value: {
                      settings: {
                        password: rows.find((row) => key === row.id + "|meta")
                          .password,
                      },
                    },
                  };
                },
              };
        },
      };
    },
  };
  vm.createContext(c);
  vm.runInContext(
    fs.readFileSync("src/services/year-note-scope.js", "utf8"),
    c,
  );
  vm.runInContext(
    fs.readFileSync("src/workspace/reports/year-notes-scope.js", "utf8") +
      "\nglobalThis.api={context:academicYearNotesContext,permit:permitYearNoteAccess,sync:synchronizeYearNotesScope,invalidate:invalidateYearNotesScope};",
    c,
  );
  await c.api.sync();
  return c;
}
test("annual note scope excludes differently protected peers and legacy unknown roles", async () => {
  const c = await fixture(),
    value = c.api.context();
  assert.deepEqual([...value.notesWorkspaceIds].sort(), [
    "empty",
    "first",
    "same",
  ]);
  assert.equal(value.notesWorkspaceId, "first");
});
test("equal password hashes require authenticated source before granting peer access", async () => {
  const c = await fixture();
  c.isAuthenticated = false;
  assert.equal(c.api.context().notesWorkspaceIds.includes("same"), false);
  c.isAuthenticated = true;
  assert.equal(c.api.context().notesWorkspaceIds.includes("same"), true);
});
test("explicitly verified peer is included only for that installation and current password", async () => {
  const c = await fixture();
  c.api.permit({ id: "second" }, { settings: { password: "peer-hash" } });
  assert.equal(c.api.context().notesWorkspaceIds.includes("second"), true);
  c.installationToken = "installation-two";
  assert.equal(c.api.context().notesWorkspaceIds.includes("second"), false);
});
test("changing the year revokes cached note scope", async () => {
  const c = await fixture();
  c.workspace.year = "1406-1407";
  assert.deepEqual([...c.api.context().notesWorkspaceIds], ["first"]);
});
test("active legacy workspace remains readable while unrelated unknown roles stay excluded", async () => {
  const c = await fixture();
  c.workspace.id = "unknown";
  const scope = c.api.context();
  assert.equal(scope.notesWorkspaceIds.includes("unknown"), true);
  assert.equal(scope.notesWorkspaceIds.includes("second"), false);
});
test("catalog synchronization does not read other years or unknown role metadata", async () => {
  const c = await fixture(),
    reads = [],
    catalog = [
      { id: "first", year: c.workspace.year, termKind: "first" },
      { id: "second", year: c.workspace.year, termKind: "second" },
      { id: "unknown", year: c.workspace.year, termKind: "unknown" },
      { id: "old", year: "1404-1405", termKind: "first" },
    ];
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  c.transactionDone = () => done;
  c.requestPromise = async (value) => value;
  const catalogStore = {
    getAll() {
      const request = {};
      queueMicrotask(() => {
        request.result = catalog;
        request.onsuccess();
        queueMicrotask(finish);
      });
      return request;
    },
  };
  const recordsStore = {
    get(key) {
      reads.push(key);
      return { value: { settings: { password: "" } } };
    },
  };
  c.connection = {
    transaction() {
      return {
        objectStore(name) {
          return name === "catalog" ? catalogStore : recordsStore;
        },
      };
    },
  };
  await c.api.sync();
  assert.deepEqual(reads, ["first|meta", "second|meta"]);
  assert.deepEqual([...c.api.context().notesWorkspaceIds], ["first", "second"]);
});
