"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");

function loadFactory(source, name) {
  // No workspace, DOM, browser storage or application namespaces are provided.
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(source, "utf8"), context);
  return context[name];
}
const backupFactory = loadFactory(
    "src/services/installation-backup.js",
    "EduInstallationBackup",
  ),
  noteFactory = loadFactory(
    "src/services/year-note-scope.js",
    "EduYearNoteScope",
  );

function deferred() {
  let resolve;
  const promise = new Promise((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function backupFixture(id) {
  const rows = {
      records: [{ key: "@reset", value: { token: id } }],
      catalog: [{ id, revision: 1 }],
      drafts: [],
      events: [],
      backups: [],
      reports: [],
      undo: [],
    },
    calls = [],
    state = {
      workspaceId: id,
      installation: id,
      ready: true,
      periodLoading: false,
      resetBusy: false,
      connectionRetired: false,
      connection: {
        transaction() {
          calls.push("transaction");
          const snapshot = structuredClone(rows);
          return {
            objectStore(name) {
              return {
                getAll: () => snapshot[name],
                get: (key) => snapshot[name].find((row) => row.key === key),
                getAllKeys: () => snapshot[name].map((row) => row.id),
                openCursor() {
                  const request = {};
                  queueMicrotask(() => {
                    request.result = null;
                    request.onsuccess();
                  });
                  return request;
                },
              };
            },
          };
        },
      },
    },
    writes = { current: Promise.resolve() },
    draft = {
      key: "draft-" + id,
      workspace: id,
      generation: 1,
      entries: [{ value: id }],
    };
  const service = backupFactory({
    getState: () => ({ ...state }),
    storage: {
      local: () => ({ getItem: () => null }),
      storeNames: () => Object.keys(rows).filter((name) => name !== "drafts"),
      resetRecordKey: () => "@reset",
      request: async (value) => value,
      done: async () => {},
    },
    drafts: {
      current: () => structuredClone(draft),
      assessment: () => null,
      portable: (entries) => entries.filter((row) => row.entries.length),
      flush: async () => calls.push("flush"),
      persist: async () => calls.push("persist"),
      writes: () => writes.current,
      pending: () => Promise.resolve(),
    },
    reports: { drafts: () => (workspace) => ({ source: workspace }) },
    identity: () => null,
  });
  return { service, state, calls, writes, rows, draft };
}

test("full-backup services run without application globals and keep concurrent instances independent", async () => {
  const first = backupFixture("first"),
    second = backupFixture("second");
  const [a, b] = await Promise.all([
    first.service.snapshot(),
    second.service.snapshot(),
  ]);
  assert.equal(Object.isFrozen(first.service), true);
  assert.equal(a.activeWorkspace, "first");
  assert.equal(b.activeWorkspace, "second");
  assert.equal(a.gradeDrafts[0].entries[0].value, "first");
  assert.equal(b.gradeDrafts[0].entries[0].value, "second");
  assert.equal(a.reportDrafts.first.source, "first");
  assert.equal(b.reportDrafts.second.source, "second");
  first.rows.catalog[0].revision++;
  first.draft.entries[0].value = "new first draft";
  const next = await first.service.snapshot();
  assert.equal(next.stores.catalog[0].revision, 2);
  assert.equal(next.gradeDrafts[0].entries[0].value, "new first draft");
  assert.equal(b.stores.catalog[0].revision, 1);
  assert.equal(b.gradeDrafts[0].entries[0].value, "second");
});

test("full-backup ports read the latest writer and refuse retired state before draft persistence", async () => {
  const f = backupFixture("first"),
    write = deferred();
  // Replace the writer after constructing the service: it must not be captured.
  f.writes.current = write.promise;
  const pending = f.service.snapshot();
  await Promise.resolve();
  assert.deepEqual(f.calls, ["flush"]);
  f.state.connectionRetired = true;
  write.resolve();
  await assert.rejects(pending, (error) => error.code === "BACKUP_NOT_READY");
  assert.deepEqual(f.calls, ["flush"]);
  const healthy = backupFixture("independent");
  assert.equal(
    (await healthy.service.snapshot()).activeWorkspace,
    "independent",
  );
});

function noteFixture() {
  const rows = [
      { id: "first", termKind: "first", password: "source" },
      { id: "second", termKind: "second", password: "peer" },
    ],
    state = {
      workspace: { id: "first", year: "1405-1406" },
      installation: "installation-one",
      password: "source",
      authenticated: true,
      resetBusy: false,
      connectionRetired: false,
    },
    completion = { current: Promise.resolve() };
  state.connection = {
    transaction() {
      const snapshot = rows.map((row) => ({ ...row, year: "1405-1406" }));
      return {
        objectStore(name) {
          return name === "catalog"
            ? {
                getAll() {
                  const request = {};
                  queueMicrotask(() => {
                    request.result = snapshot;
                    request.onsuccess();
                  });
                  return request;
                },
              }
            : {
                get: (key) => ({
                  value: {
                    settings: {
                      password: snapshot.find((row) => key === row.id + "|meta")
                        .password,
                    },
                  },
                }),
              };
        },
      };
    },
  };
  const ports = {
    getState: () => ({ ...state }),
    storage: {
      request: async (value) => value,
      done: () => completion.current,
    },
    termKind: (value) => value,
  };
  return { service: noteFactory(ports), ports, state, rows, completion };
}

test("annual-note authorization and cache are private even when services share the same host ports", async () => {
  const f = noteFixture(),
    other = noteFactory(f.ports);
  await Promise.all([f.service.synchronize(), other.synchronize()]);
  assert.equal(Object.isFrozen(f.service), true);
  f.service.permit({ id: "second" }, { settings: { password: "peer" } });
  assert.equal(f.service.context().notesWorkspaceIds.includes("second"), true);
  assert.equal(other.context().notesWorkspaceIds.includes("second"), false);
  other.permit({ id: "second" }, { settings: { password: "peer" } });
  f.service.invalidate({ workspace: "second", revision: 2 });
  assert.equal(f.service.context().notesWorkspaceIds.includes("second"), false);
  assert.equal(other.context().notesWorkspaceIds.includes("second"), true);
  f.state.installation = "installation-two";
  assert.equal(other.context().notesWorkspaceIds.includes("second"), false);
});

for (const [label, retire] of [
  ["connection", (f) => (f.state.connection = {})],
  ["workspace", (f) => (f.state.workspace = { id: "new", year: "1405-1406" })],
  ["year", (f) => (f.state.workspace.year = "1406-1407")],
  ["reset", (f) => (f.state.resetBusy = true)],
  ["retirement", (f) => (f.state.connectionRetired = true)],
]) {
  test(
    "annual-note synchronization cannot publish stale cache after " +
      label +
      " changes",
    async () => {
      const f = noteFixture();
      await f.service.synchronize();
      f.rows.splice(1, 1, { id: "stale", termKind: "second", password: "" });
      const done = deferred();
      f.completion.current = done.promise;
      const pending = f.service.synchronize();
      await Promise.resolve();
      retire(f);
      done.resolve();
      await pending;
      assert.equal(
        f.service.context().notesWorkspaceIds.includes("stale"),
        false,
      );
    },
  );
}
