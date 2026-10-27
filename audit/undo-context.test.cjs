"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    reads = [];
  const c = vm.createContext({
    workspace: { id: "first", revision: 1 },
    connection: {},
    state: {},
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    busy: 0,
    writer: Promise.resolve(),
    db: { original: true },
    committed: new Map(),
    assertWorkspaceReadable() {},
    assertEntityWritable() {},
    flushDrafts: async () => {},
    paintStatus() {},
    readRecord: async () => ({ revision: 1, action: "edit" }),
    confirm: () => true,
    commitRecords: async () => {
      c.workspace.revision = 2;
    },
    readWorkspace: async (id) => {
      reads.push(id);
      return { data: { restored: true }, records: new Map() };
    },
    closeModal: () => effects.push("close"),
    render: () => effects.push("render"),
    setStatus: () => effects.push("status"),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/core/async-target.js"),
      "utf8",
    ),
    c,
  );
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/history/undo.js"),
      "utf8",
    ),
    c,
  );
  c.validatedUndoCandidate = () => new Map();
  return { c, effects, reads };
}
test("undo does not retarget after the source changes during draft flush", async () => {
  const f = fixture();
  let attempts = 0;
  f.c.flushDrafts = async () => {
    f.c.workspace.id = "second";
  };
  f.c.performUndo = async () => {
    attempts++;
  };
  await assert.rejects(f.c.undoLast());
  assert.equal(attempts, 0);
  assert.equal(f.c.busy, 0);
});
for (const kind of [
  "workspace",
  "connection",
  "periodLoading",
  "resetBusy",
  "connectionRetired",
  "revision",
]) {
  test(`undo reload does not overwrite state after ${kind} changes`, async () => {
    const f = fixture();
    f.c.readWorkspace = async () => {
      if (kind === "workspace") f.c.workspace.id = "second";
      else if (kind === "connection") f.c.connection = {};
      else if (kind === "revision") f.c.workspace.revision++;
      else f.c[kind] = true;
      f.c.db = { selected: true };
      return { data: { obsolete: true }, records: new Map() };
    };
    assert.equal(await f.c.performUndo({ id: "first", revision: 1 }), true);
    assert.equal(f.c.db.selected, true);
    assert.equal(f.effects.length, 0);
  });
}
test("undo completion skips reload after navigation during commit", async () => {
  const f = fixture();
  f.c.commitRecords = async () => {
    f.c.workspace.id = "second";
  };
  assert.equal(await f.c.performUndo({ id: "first", revision: 1 }), true);
  assert.equal(f.reads.length + f.effects.length, 0);
});
test("valid undo reloads its source and reports success", async () => {
  const f = fixture();
  assert.equal(await f.c.undoLast(), true);
  assert.deepEqual(f.reads, ["first"]);
  assert.equal(f.c.db.restored, true);
  assert.equal(f.effects.length, 3);
  assert.equal(f.c.busy, 0);
});
