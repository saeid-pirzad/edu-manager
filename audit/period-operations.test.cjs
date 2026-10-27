"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const read = (file) =>
  fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
function creation() {
  const saved = [],
    switched = [];
  const fields = {
    periodYear: { value: "1406-1407" },
    periodTerm: { value: "اول" },
  };
  const c = vm.createContext({
    workspace: { id: "source", revision: 1 },
    db: { schools: [], settings: {}, sessions: [] },
    fileMode: false,
    document: { getElementById: (id) => fields[id] },
    asciiDigits: String,
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    allFrom: async () => [],
    clone: structuredClone,
    normalizeDB: (x) => x,
    installWorkspace: async (data, details) => {
      saved.push({ data, details });
      return { id: "created" };
    },
    captureWorkspaceContext: () => ({ ...c.workspace }),
    preserveAsyncTarget: () => {
      const id = c.workspace.id;
      return () => {
        if (id !== c.workspace.id) throw Error("workspace changed");
      };
    },
    assertWorkspaceContext: (ctx) => {
      if (ctx.id !== c.workspace.id || ctx.revision !== c.workspace.revision)
        throw Error("context changed");
    },
  });
  vm.runInContext(read("workspace/periods/switch-create.js"), c);
  c.switchPeriod = async (id) => switched.push(id);
  return { c, saved, switched, fields };
}
test("new period cannot copy another workspace after a delayed flush", async () => {
  const { c, saved } = creation();
  c.flushDrafts = async () => {
    c.workspace.id = "other";
  };
  await assert.rejects(c.createNewPeriod(), /workspace changed/);
  assert.equal(saved.length, 0);
});
test("new period rejects a stale source revision after checking existing periods", async () => {
  const { c, saved } = creation();
  c.allFrom = async () => {
    c.workspace.revision++;
    return [];
  };
  await assert.rejects(c.createNewPeriod(), /context changed/);
  assert.equal(saved.length, 0);
});
test("new period captures form values before waiting and rejects concurrent submissions", async () => {
  const { c, saved, fields } = creation();
  let resolve;
  c.flushDrafts = () =>
    new Promise((r) => {
      resolve = r;
    });
  const first = c.createNewPeriod();
  fields.periodYear.value = "1490-1491";
  await assert.rejects(c.createNewPeriod());
  resolve();
  await first;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].details.year, "1406-1407");
});
test("new period waits for pending writes before capturing its source", async () => {
  const { c, saved } = creation();
  let resolve;
  c.writer = new Promise((r) => {
    resolve = r;
  });
  const first = c.createNewPeriod();
  await Promise.resolve();
  assert.equal(saved.length, 0);
  c.db.settings.marker = "durable source";
  c.workspace.revision++;
  resolve();
  await first;
  assert.equal(saved[0].data.settings.marker, "durable source");
});
test("a completed creation does not navigate away from a newly selected workspace", async () => {
  const { c, switched } = creation();
  c.installWorkspace = async () => {
    c.workspace.id = "other";
    return { id: "created" };
  };
  await assert.rejects(c.createNewPeriod(), /context changed/);
  assert.equal(switched.length, 0);
});
function reopening({
  missing = false,
  switchBeforeRead = false,
  switchAfterWrite = false,
  deny = false,
  closing = false,
} = {}) {
  const puts = [],
    events = [],
    messages = [];
  let resolve, reject;
  const done = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const c = vm.createContext({
    workspace: { id: "source", revision: 3, closed: !closing },
    db: {},
    writer: Promise.resolve(),
    busy: 0,
    drafts: new Map(),
    flushDrafts: async () => {},
    assertEntityWritable() {},
    putBackup: async () => {},
    assertWorkspaceContext() {},
    uid: () => "report",
    validateFrozenReport() {},
    fileMode: false,
    assertWorkspaceReadable: () => {
      if (deny) throw Error("not authenticated");
    },
    confirm: () => true,
    captureWorkspaceContext: () => ({ ...c.workspace }),
    transactionDone: () => done,
    broadcast: (message) => messages.push(message),
    openPeriods: async () => {},
    render() {},
    connection: {
      transaction: () => ({
        abort: () => reject(Error("aborted")),
        objectStore: (name) =>
          name === "events"
            ? { add: (row) => events.push(row) }
            : {
                get: () => {
                  const request = {
                    result: missing
                      ? undefined
                      : { id: "source", revision: 3, closed: !closing },
                  };
                  queueMicrotask(() => {
                    if (switchBeforeRead)
                      c.workspace = { id: "other", revision: 3 };
                    request.onsuccess();
                    if (switchAfterWrite)
                      c.workspace = { id: "other", revision: 8 };
                    resolve();
                  });
                  return request;
                },
                put: (row) => puts.push(row),
                delete() {},
              },
      }),
    },
  });
  vm.runInContext(read("workspace/reports/finalize.js"), c);
  c.finalReportData = () => ({ classes: [], missing: [] });
  return { c, puts, events, messages };
}
test("reopening a missing or changed period aborts without catalog or history writes", async () => {
  for (const option of [{ missing: true }, { switchBeforeRead: true }]) {
    const { c, puts, events } = reopening(option);
    await assert.rejects(c.reopenPeriod(), /aborted/);
    assert.equal(puts.length, 0);
    assert.equal(events.length, 0);
  }
});
test("finalization publishes the source period without overwriting a different active workspace after commit", async () => {
  const { c, puts, events, messages } = reopening({
    closing: true,
    switchAfterWrite: true,
  });
  await c.finalizePeriod();
  assert.equal(c.workspace.id, "other");
  assert.equal(puts[0].id, "source");
  assert.equal(events[0].workspace, "source");
  assert.equal(messages[0].workspace, "source");
});
test("reopening enforces readable authenticated context before starting a transaction", async () => {
  const { c, puts } = reopening({ deny: true });
  await assert.rejects(c.reopenPeriod(), /not authenticated/);
  assert.equal(puts.length, 0);
});
test("reopening publishes the correct period without replacing a new active workspace after commit", async () => {
  const { c, puts, events, messages } = reopening({ switchAfterWrite: true });
  await c.reopenPeriod();
  assert.equal(c.workspace.id, "other");
  assert.equal(puts[0].id, "source");
  assert.equal(events[0].workspace, "source");
  assert.equal(messages[0].workspace, "source");
});
