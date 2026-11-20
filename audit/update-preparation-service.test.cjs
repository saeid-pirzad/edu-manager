"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");

// No DOM, workspace bindings or browser globals are supplied to the service.
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/services/update-preparation.js"),
    "utf8",
  ),
  context,
);
const create = context.EduUpdatePreparation;
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(id) {
  const state = {
    id,
    connection: {},
    records: Promise.resolve(),
    drafts: Promise.resolve(),
    file: null,
    readable: true,
    edited: false,
    report: null,
  };
  const service = create({
    assertReadable() {
      if (!state.readable) throw Error("not readable");
    },
    getContext: () => ({ id: state.id, connection: state.connection }),
    flushDrafts: async (options) => assert.equal(options.strict, true),
    getPeriodicReport: () => state.report,
    getPendingWrites: () => ({
      records: state.records,
      drafts: state.drafts,
      file: state.file,
    }),
    hasUnsavedChanges: () => state.edited,
  });
  return { state, service };
}

test("independent update barriers never share writers, edits or workspace context", async () => {
  const first = fixture("first"),
    second = fixture("second"),
    pending = deferred();
  first.state.records = pending.promise;
  let completed = false;
  const waiting = first.service.prepare().then(() => {
    completed = true;
  });
  assert.equal(await second.service.prepare(), true);
  assert.equal(completed, false);
  second.state.id = "other";
  second.state.edited = true;
  pending.resolve();
  await waiting;
  assert.equal(completed, true);
  await assert.rejects(second.service.prepare(), /ویرایش/);
});

test("replacement draft and file writes remain part of the live update barrier", async () => {
  const { state, service } = fixture("first"),
    record = deferred(),
    draft = deferred(),
    file = deferred();
  state.records = record.promise;
  let completed = false;
  const waiting = service.prepare().then(() => {
    completed = true;
  });
  await tick();
  state.drafts = draft.promise;
  state.file = file.promise;
  record.resolve();
  await tick();
  assert.equal(completed, false);
  draft.resolve();
  await tick();
  assert.equal(completed, false);
  file.resolve();
  await waiting;
  assert.equal(completed, true);
});

for (const changed of ["id", "connection", "readable"])
  test(
    "report-note retry cannot authorize an update after context change: " +
      changed,
    async () => {
      const { state, service } = fixture("first"),
        pending = deferred();
      let notesPending = true;
      state.report = {
        hasPendingNotes: () => notesPending,
        retryNotes: () => pending.promise,
      };
      const waiting = service.prepare();
      await tick();
      if (changed === "id") state.id = "second";
      else if (changed === "connection") state.connection = {};
      else state.readable = false;
      notesPending = false;
      pending.resolve();
      await assert.rejects(waiting, /اطلاعات|not readable/);
    },
  );
