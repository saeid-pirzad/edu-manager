"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(phase, mutation) {
  const writes = [];
  let pending = false,
    complete,
    fail;
  const c = vm.createContext({
    workspace: {
      id: "first",
      revision: 1,
      year: "1405-1406",
      term: "اول",
      closed: false,
    },
    db: {},
    fileMode: false,
    writer: Promise.resolve(),
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
    broadcast() {},
    openPeriods: async () => {},
    render() {},
    transactionDone: () =>
      new Promise((resolve, reject) => {
        complete = resolve;
        fail = reject;
      }),
    putBackup: async () => {
      if (phase === "backup") mutate();
    },
  });
  function mutate() {
    if (mutation === "assessment") pending = true;
    else if (mutation === "draft") c.drafts.set("new-grade", {});
    else if (mutation === "connection")
      c.connection = {
        transaction() {
          throw Error("retired connection used");
        },
      };
  }
  c.connection = {
    transaction() {
      return {
        abort: () => fail(Error("transaction aborted")),
        objectStore: (name) => ({
          get: () => {
            const request = { result: { ...c.workspace } };
            queueMicrotask(() => {
              if (phase === "catalog") mutate();
              request.onsuccess();
              complete();
            });
            return request;
          },
          put: (row) => writes.push({ name, row }),
          add: (row) => writes.push({ name, row }),
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
  return { c, writes };
}
for (const [phase, mutation] of [
  ["backup", "assessment"],
  ["catalog", "assessment"],
  ["catalog", "draft"],
  ["backup", "connection"],
  ["catalog", "connection"],
]) {
  test(
    "finalization refuses " +
      mutation +
      " changes during " +
      phase +
      " without closing or freezing stale data",
    async () => {
      const { c, writes } = fixture(phase, mutation);
      await assert.rejects(c.finalizePeriod());
      assert.equal(c.workspace.closed, false);
      assert.equal(writes.length, 0);
    },
  );
}
