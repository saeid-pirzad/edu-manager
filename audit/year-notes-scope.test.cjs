"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
function fixture() {
  const c = {
    installationToken: "installation-one",
    workspace: { id: "first", year: "1405-1406" },
    db: { settings: { password: "source-hash" } },
    isAuthenticated: true,
    resetBusy: false,
    connectionRetired: false,
    academicTermKind: (term) =>
      ({ first: "first", second: "second" })[term] || null,
  };
  vm.createContext(c);
  vm.runInContext(
    fs.readFileSync("src/workspace/reports/year-notes-scope.js", "utf8") +
      "\nglobalThis.api={context:academicYearNotesContext,permit:permitYearNoteAccess,sync:synchronizeYearNotesScope,setScope:(value)=>academicYearNotesScope=value};",
    c,
  );
  c.api.setScope({
    year: c.workspace.year,
    periods: [
      { id: "first", kind: "first", password: "source-hash" },
      { id: "second", kind: "second", password: "peer-hash" },
      { id: "empty", kind: "second", password: "" },
      { id: "same", kind: "second", password: "source-hash" },
      { id: "unknown", kind: null, password: "" },
    ],
  });
  return c;
}
test("annual note scope excludes differently protected peers and legacy unknown roles", () => {
  const c = fixture(),
    value = c.api.context();
  assert.deepEqual([...value.notesWorkspaceIds].sort(), [
    "empty",
    "first",
    "same",
  ]);
  assert.equal(value.notesWorkspaceId, "first");
});
test("equal password hashes require authenticated source before granting peer access", () => {
  const c = fixture();
  c.isAuthenticated = false;
  assert.equal(c.api.context().notesWorkspaceIds.includes("same"), false);
  c.isAuthenticated = true;
  assert.equal(c.api.context().notesWorkspaceIds.includes("same"), true);
});
test("explicitly verified peer is included only for that installation and current password", () => {
  const c = fixture();
  c.api.permit({ id: "second" }, { settings: { password: "peer-hash" } });
  assert.equal(c.api.context().notesWorkspaceIds.includes("second"), true);
  c.installationToken = "installation-two";
  assert.equal(c.api.context().notesWorkspaceIds.includes("second"), false);
});
test("changing the year revokes cached note scope", () => {
  const c = fixture();
  c.workspace.year = "1406-1407";
  assert.deepEqual([...c.api.context().notesWorkspaceIds], ["first"]);
});
test("active legacy workspace remains readable while unrelated unknown roles stay excluded", () => {
  const c = fixture();
  c.workspace.id = "unknown";
  const scope = c.api.context();
  assert.equal(scope.notesWorkspaceIds.includes("unknown"), true);
  assert.equal(scope.notesWorkspaceIds.includes("second"), false);
});
test("catalog synchronization does not read other years or unknown role metadata", async () => {
  const c = fixture(),
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
