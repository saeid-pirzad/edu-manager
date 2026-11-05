"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(phase, mutation) {
  const writes = [],
    backupWrites = [],
    reads = [],
    messages = [],
    hooks = { durableInstallation: "source-installation" };
  let pending = false,
    complete,
    fail,
    completedReads = 0,
    aborted = false;
  const c = vm.createContext({
    workspace: {
      id: "first",
      revision: 1,
      year: "1405-1406",
      term: "اول",
      closed: false,
    },
    db: {},
    installationToken: "source-installation",
    RESET_RECORD_KEY: "@installation-reset",
    fileMode: false,
    writer: Promise.resolve().then(() => {
      if (phase === "writer") mutate();
    }),
    busy: 0,
    drafts: new Map(),
    assessmentContext: { hasDrafts: () => pending },
    flushDrafts: async () => {},
    assertWorkspaceReadable() {},
    assertEntityWritable() {},
    assertWorkspaceContext() {},
    captureWorkspaceContext: () => ({ ...c.workspace }),
    confirm: () => true,
    uid: () => "frozen",
    validateFrozenReport() {},
    broadcast: (message) => messages.push(message),
    openPeriods: async () => {},
    render() {},
    transactionDone: () =>
      new Promise((resolve, reject) => {
        complete = resolve;
        fail = reject;
      }),
    putBackup: async () => backupWrites.push("operation backup"),
  });
  function mutate() {
    if (mutation === "assessment") pending = true;
    else if (mutation === "draft") c.drafts.set("new-grade", {});
    else if (mutation === "installation") c.installationToken = "replacement";
    else if (mutation === "connection")
      c.connection = {
        transaction() {
          throw Error("retired connection used");
        },
      };
  }
  c.connection = {
    transaction(names, mode) {
      assert.deepEqual(Array.from(names), [
        "catalog",
        "records",
        "reports",
        "events",
        "undo",
      ]);
      assert.equal(mode, "readwrite");
      const write = (name, row) => {
        assert.deepEqual(
          [...reads].sort(),
          ["catalog", "records"],
          "catalog and installation are read before any write",
        );
        writes.push({ name, row });
      };
      return {
        abort() {
          aborted = true;
          fail(Error("transaction aborted"));
        },
        objectStore: (name) => ({
          get(key) {
            assert.equal(
              key,
              name === "records" ? c.RESET_RECORD_KEY : "first",
            );
            const request = {
              result:
                name === "records"
                  ? { value: { token: hooks.durableInstallation } }
                  : { ...c.workspace },
            };
            queueMicrotask(() => {
              if (aborted) return;
              if (
                (phase === "catalog" && name === "catalog") ||
                (phase === "epoch" && name === "records")
              )
                mutate();
              reads.push(name);
              request.onsuccess();
              if (++completedReads === 2 && !aborted) {
                hooks.afterCommit?.();
                complete();
              }
            });
            return request;
          },
          put: (row) => write(name, row),
          add: (row) => write(name, row),
          delete() {},
        }),
      };
    },
  };
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/reports/finalize.js"),
      "utf8",
    ),
    c,
  );
  c.finalReportData = () => ({ classes: [], missing: [] });
  return { c, writes, backupWrites, hooks, messages };
}
for (const [phase, mutation] of [
  ["writer", "assessment"],
  ["catalog", "assessment"],
  ["catalog", "draft"],
  ["writer", "connection"],
  ["catalog", "connection"],
  ["writer", "installation"],
  ["catalog", "installation"],
  ["epoch", "installation"],
]) {
  test(
    "finalization refuses " +
      mutation +
      " changes during " +
      phase +
      " without closing or freezing stale data",
    async () => {
      const { c, writes, backupWrites } = fixture(phase, mutation);
      await assert.rejects(c.finalizePeriod());
      assert.equal(c.workspace.closed, false);
      assert.equal(writes.length, 0);
      assert.deepEqual(backupWrites, []);
    },
  );
}

test("finalization stores its fixed report and guards without an operation backup", async () => {
  const { c, writes, backupWrites } = fixture();
  await c.finalizePeriod();
  assert.equal(c.workspace.closed, true);
  assert.equal(c.workspace.revision, 2);
  assert.deepEqual(
    writes.map(({ name }) => name),
    ["catalog", "reports", "events"],
  );
  assert.deepEqual(backupWrites, []);
});

test("finalization rejects a stale durable installation before any report or catalog write", async () => {
  const { c, writes, backupWrites, hooks, messages } = fixture();
  hooks.durableInstallation = "replacement";
  await assert.rejects(
    c.finalizePeriod(),
    (error) => error.code === "INSTALLATION_CHANGED",
  );
  assert.equal(c.workspace.closed, false);
  assert.equal(c.workspace.revision, 1);
  assert.deepEqual(writes, []);
  assert.deepEqual(backupWrites, []);
  assert.deepEqual(messages, []);
});

test("a completed finalization cannot publish or replace the view of a newer installation", async () => {
  const { c, hooks, messages, backupWrites } = fixture();
  const destination = {
    id: "first",
    revision: 1,
    closed: false,
    marker: "new installation",
  };
  hooks.afterCommit = () => {
    c.installationToken = "replacement";
    c.workspace = destination;
  };
  await c.finalizePeriod();
  assert.equal(c.workspace, destination);
  assert.deepEqual(messages, []);
  assert.deepEqual(backupWrites, []);
});

test("legacy installation without a durable marker can still finalize without an operation backup", async () => {
  const { c, hooks, backupWrites } = fixture();
  c.installationToken = "";
  hooks.durableInstallation = undefined;
  await c.finalizePeriod();
  assert.equal(c.workspace.closed, true);
  assert.deepEqual(backupWrites, []);
});
