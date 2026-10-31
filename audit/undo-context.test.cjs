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

function previewFixture() {
  const f = fixture();
  f.c.esc = String;
  f.c.document = { querySelector: () => ({}) };
  f.c.showModal = (title, html) => {
    f.html = html;
    return true;
  };
  f.c.workspace.year = "1405-1406";
  f.c.workspace.term = "اول";
  return f;
}
test("undo modal previews the operation without mutating records or opening native confirmation", async () => {
  const f = previewFixture();
  f.c.commitRecords = () => {
    throw Error("must not write before approval");
  };
  f.c.confirm = () => {
    throw Error("must not open native confirmation");
  };
  await f.c.openUndoModal();
  assert.match(f.html, /id="undoPreview"/);
  assert.match(f.html, /edit/);
  assert.match(f.html, /data-workspace-action="confirm-undo"/);
  assert.match(f.html, /data-workspace-action="close"/);
});
test("empty undo state does not expose a confirmation action", async () => {
  const f = previewFixture();
  f.c.readRecord = async () => null;
  await f.c.openUndoModal();
  assert.match(f.html, /تغییری برای بازگرداندن وجود ندارد/);
  assert.doesNotMatch(f.html, /confirm-undo/);
  await assert.rejects(f.c.confirmUndo(), /منقضی/);
});
test("modal approval restores only the previewed operation without a second browser prompt", async () => {
  const f = previewFixture();
  f.c.confirm = () => {
    throw Error("duplicate browser prompt");
  };
  await f.c.openUndoModal();
  assert.equal(await f.c.confirmUndo(), true);
  assert.equal(f.c.db.restored, true);
});
test("stale or closed undo preview cannot restore a different latest operation", async () => {
  for (const change of ["revision", "record", "closed"]) {
    const f = previewFixture();
    await f.c.openUndoModal();
    f.c.commitRecords = () => {
      throw Error("must not write stale approval");
    };
    if (change === "revision") f.c.workspace.revision++;
    if (change === "record")
      f.c.readRecord = async () => ({
        revision: 1,
        action: "different operation",
      });
    if (change === "closed") f.c.document.querySelector = () => null;
    await assert.rejects(f.c.confirmUndo(), /تغییر|منقضی/);
  }
});
