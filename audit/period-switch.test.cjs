"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = (file) =>
  fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
function fixture() {
  const reads = [],
    locks = [],
    recovered = [];
  const c = vm.createContext({
    assessmentContext: {
      hasDrafts: () => false,
      handles: () => false,
      dispose: async () => {},
    },
    synchronizeYearNotesScope: async () => {},
    workspace: { id: "source", year: "1405-1406", revision: 1 },
    db: { settings: {}, marker: "source" },
    committed: new Map(),
    periodLoading: false,
    ready: true,
    fileMode: false,
    resetBusy: false,
    connectionRetired: false,
    blocked: false,
    drafts: new Map([["source-draft", {}]]),
    writer: Promise.resolve(),
    flushDrafts: async () => {},
    lockControls: () => locks.push(c.periodLoading),
    readWorkspaceSnapshot: async (id) => {
      reads.push(id);
      return {
        period: { id, year: "1405-1406", revision: 4 },
        data: { marker: id, settings: {} },
        records: new Map(),
      };
    },
    loadDrafts: async () => {
      c.drafts.set("destination", { workspace: c.workspace.id });
    },
    closeModal() {},
    render() {},
    rememberPeriod() {},
    hydrateReportNotes() {},
    recoverDrafts: async () => recovered.push(c.workspace.id),
  });
  vm.runInContext(source("workspace/periods/switch-create.js"), c);
  return { c, reads, locks, recovered };
}
test("overlapping period switches cannot interleave destination data or drafts", async () => {
  const { c, reads, recovered } = fixture();
  let release;
  c.readWorkspaceSnapshot = (id) => {
    reads.push(id);
    return new Promise((resolve) => {
      release = () =>
        resolve({
          period: { id, year: "1405-1406", revision: 4 },
          data: { marker: id, settings: {} },
          records: new Map(),
        });
    });
  };
  const first = c.switchPeriod("destination");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(c.periodLoading, true);
  await assert.rejects(c.switchPeriod("other"));
  release();
  await first;
  assert.deepEqual(reads, ["destination"]);
  assert.equal(c.workspace.id, "destination");
  assert.equal(c.db.marker, "destination");
  assert.equal(c.drafts.get("destination").workspace, "destination");
  assert.deepEqual(recovered, ["destination"]);
  assert.equal(c.periodLoading, false);
});
test("the transition remains locked until destination drafts have finished loading", async () => {
  const { c } = fixture();
  let release;
  c.loadDrafts = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const first = c.switchPeriod("destination");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(c.periodLoading, true);
  assert.equal(c.workspace.id, "destination");
  vm.runInContext(source("workspace/drafts/inputs.js"), c);
  c.gradeInput({});
  c.clearGrade({});
  assert.equal(c.drafts.size, 0);
  vm.runInContext(source("workspace/data/save.js"), c);
  await assert.rejects(c.saveDBV24());
  vm.runInContext(source("workspace/entities/edit.js"), c);
  assert.throws(() => c.assertEntityWritable());
  release();
  await first;
  assert.equal(c.periodLoading, false);
});
test("failed reads preserve the source state and release the transition for retry", async () => {
  const { c, locks } = fixture(),
    original = c.db,
    read = c.readWorkspaceSnapshot;
  c.readWorkspaceSnapshot = async () => {
    throw Error("read failure");
  };
  await assert.rejects(c.switchPeriod("destination"), /read failure/);
  assert.equal(c.db, original);
  assert.equal(c.workspace.id, "source");
  assert.equal(c.periodLoading, false);
  assert.equal(c.drafts.has("source-draft"), true);
  assert.equal(locks.at(-1), false);
  c.readWorkspaceSnapshot = read;
  await c.switchPeriod("destination");
  assert.equal(c.workspace.id, "destination");
});
test("retiring the connection during a read prevents installation of the destination", async () => {
  const { c } = fixture();
  c.readWorkspaceSnapshot = async (id) => {
    c.connectionRetired = true;
    return {
      period: { id, year: "1405-1406", revision: 4 },
      data: { marker: id },
      records: new Map(),
    };
  };
  await assert.rejects(c.switchPeriod("destination"));
  assert.equal(c.workspace.id, "source");
  assert.equal(c.db.marker, "source");
  assert.equal(c.periodLoading, false);
});
test("snapshot loads catalog and bounded records in one transaction and waits for completion", async () => {
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  const calls = [];
  const c = vm.createContext({
    assessmentContext: {
      hasDrafts: () => false,
      handles: () => false,
      dispose: async () => {},
    },
    synchronizeYearNotesScope: async () => {},
    clone: structuredClone,
    normalizeDB() {},
    isDataObject() {},
    isSafeRecordId() {},
    EduWorkspaceRecords: {
      create: () => ({
        decodeWorkspaceRecords: (rows, options) => ({
          data: { rows, workspace: options.workspaceId },
          records: new Map(),
        }),
      }),
    },
    IDBKeyRange: { bound: (...bounds) => ({ bounds }) },
    requestPromise: async (value) => value,
    transactionDone: () => done,
    connection: {
      transaction: (names, mode) => {
        calls.push({ names, mode });
        return {
          objectStore: (name) => ({
            get: (id) => ({ id, revision: 5 }),
            getAll: (range) => {
              calls.push(range);
              return [{ workspace: "target", value: 1 }];
            },
          }),
        };
      },
    },
  });
  vm.runInContext(source("workspace/data/records.js"), c);
  let settled = false;
  const pending = c.readWorkspaceSnapshot("target").then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  finish();
  const result = await pending;
  assert.deepEqual(Array.from(calls[0].names), ["catalog", "records"]);
  assert.equal(calls[0].mode, "readonly");
  assert.deepEqual(Array.from(calls[1].bounds), [
    "target|",
    "target}",
    false,
    true,
  ]);
  assert.equal(result.period.revision, 5);
  assert.equal(result.data.workspace, "target");
});

test("protected destination revokes source authentication before awaiting note-scope metadata", async () => {
  const { c } = fixture();
  c.isAuthenticated = true;
  c.db.settings.password = "source-hash";
  let entered, release;
  const reading = new Promise((resolve) => {
    entered = resolve;
  });
  c.readWorkspaceSnapshot = async (id) => ({
    period: { id, year: "1405-1406", revision: 4 },
    data: { marker: id, settings: { password: "destination-hash" } },
    records: new Map(),
  });
  c.synchronizeYearNotesScope = () => {
    entered();
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const switching = c.switchPeriod("destination");
  await reading;
  assert.equal(c.workspace.id, "destination");
  assert.equal(c.db.settings.password, "destination-hash");
  assert.equal(
    c.isAuthenticated,
    false,
    "published target must never inherit source authorization",
  );
  assert.equal(c.periodLoading, true);
  const exposed = [];
  c.render = () => exposed.push(c.isAuthenticated);
  c.render();
  assert.deepEqual(exposed, [false]);
  release();
  await switching;
  assert.equal(c.isAuthenticated, false);
  assert.equal(exposed.at(-1), false);
});

test("failed target read preserves the original source authentication before publication", async () => {
  const { c } = fixture(),
    original = c.db;
  c.isAuthenticated = true;
  c.db.settings.password = "source-hash";
  c.readWorkspaceSnapshot = async () => {
    throw Error("target read failure");
  };
  await assert.rejects(c.switchPeriod("destination"), /target read failure/);
  assert.equal(c.workspace.id, "source");
  assert.equal(c.db, original);
  assert.equal(c.isAuthenticated, true);
});

test("another academic year is refused before annual synchronization without changing the active data or authentication", async () => {
  const { c, reads } = fixture(),
    before = c.db;
  let synchronized = 0;
  c.isAuthenticated = true;
  c.EduAnnualModules = {};
  c.synchronizeAnnualForRead = async () => {
    synchronized++;
    return { changed: [], conflicts: [] };
  };
  c.readWorkspaceSnapshot = async (id) => {
    reads.push(id);
    return {
      period: { id, year: "1404-1405", revision: 4 },
      data: { settings: {} },
      records: new Map(),
    };
  };
  for (const forged of [undefined, true, { allowOtherYear: true }, Symbol()])
    await assert.rejects(
      c.switchPeriod("historical", forged),
      /سال تحصیلی فعال/,
    );
  assert.equal(c.workspace.id, "source");
  assert.equal(c.workspace.year, "1405-1406");
  assert.equal(c.db, before);
  assert.equal(c.isAuthenticated, true);
  assert.equal(synchronized, 0);
  assert.equal(c.periodLoading, false);
  assert.equal(c.drafts.has("source-draft"), true);
  assert.equal(reads.length, 4);
});

test("a target whose year changes during annual synchronization is not published", async () => {
  const { c } = fixture(),
    before = c.db;
  let year = "1405-1406";
  c.EduAnnualModules = {};
  c.synchronizeAnnualForRead = async () => {
    year = "1404-1405";
    return { changed: [], conflicts: [] };
  };
  c.readWorkspaceSnapshot = async (id) => ({
    period: { id, year, revision: 4 },
    data: { settings: {} },
    records: new Map(),
  });
  await assert.rejects(c.switchPeriod("changed"), /سال تحصیلی فعال/);
  assert.equal(c.workspace.id, "source");
  assert.equal(c.db, before);
  assert.equal(c.periodLoading, false);
});
