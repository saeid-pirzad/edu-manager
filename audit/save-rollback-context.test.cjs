"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const reads = [],
    statuses = [];
  const failure = Error("disk error");
  const c = vm.createContext({
    workspace: { id: "first" },
    connection: {},
    db: { unsaved: true },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    fileMode: false,
    writeFailureGeneration: 0,
    writer: Promise.resolve(),
    busy: 0,
    paintStatus() {},
    checkScope() {},
    collectRecords: (value) => value,
    setStatus: (...args) => statuses.push(args),
    render() {},
    scheduleSingleFile() {},
    readWorkspace: async (id) => {
      reads.push(id);
      return { data: { durable: true } };
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/data/save.js"),
      "utf8",
    ),
    c,
  );
  c.commitRecords = async () => {
    throw failure;
  };
  return { c, reads, statuses, failure };
}
test("failed save reloads durable data only for the original workspace", async () => {
  const f = fixture();
  await assert.rejects(f.c.saveDBV24(), (error) => error === f.failure);
  assert.deepEqual(f.reads, ["first"]);
  assert.equal(f.c.db.durable, true);
  assert.equal(f.c.busy, 0);
  assert.equal(f.statuses.length, 1);
});
test("failed save does not read or alter a newly selected workspace", async () => {
  const f = fixture();
  f.c.commitRecords = async () => {
    f.c.workspace.id = "second";
    f.c.db = { selected: true };
    throw f.failure;
  };
  await assert.rejects(f.c.saveDBV24());
  assert.equal(f.reads.length + f.statuses.length, 0);
  assert.equal(f.c.db.selected, true);
});
for (const change of [
  "workspace",
  "connection",
  "periodLoading",
  "resetBusy",
  "connectionRetired",
]) {
  test(`rollback read cannot overwrite state after ${change} changes`, async () => {
    const f = fixture();
    f.c.readWorkspace = async () => {
      if (change === "workspace") f.c.workspace.id = "second";
      else if (change === "connection") f.c.connection = {};
      else f.c[change] = true;
      f.c.db = { selected: true };
      return { data: { obsolete: true } };
    };
    await assert.rejects(f.c.saveDBV24());
    assert.equal(f.c.db.selected, true);
    assert.equal(f.statuses.length, 0);
    assert.equal(f.c.busy, 0);
  });
}
test("rollback read failure preserves the original write error and releases busy state", async () => {
  const f = fixture();
  f.c.readWorkspace = async () => {
    throw Error("read error");
  };
  await assert.rejects(f.c.saveDBV24(), (error) => error === f.failure);
  assert.equal(f.c.busy, 0);
  assert.equal(f.c.writeFailureGeneration, 1);
  assert.equal(f.statuses.length, 1);
});

for (const change of [
  "workspace",
  "connection",
  "periodLoading",
  "resetBusy",
  "connectionRetired",
]) {
  test(`queued save refuses to write after ${change} changes`, async () => {
    const f = fixture();
    let release,
      writes = 0;
    f.c.writer = new Promise((resolve) => {
      release = resolve;
    });
    f.c.commitRecords = async () => {
      writes++;
    };
    const pending = f.c.saveDBV24();
    if (change === "workspace") f.c.workspace.id = "second";
    else if (change === "connection") f.c.connection = {};
    else f.c[change] = true;
    release();
    await assert.rejects(pending);
    assert.equal(writes, 0);
    assert.equal(f.statuses.length + f.reads.length, 0);
    assert.equal(f.c.busy, 0);
  });
}

test("late save completion does not clear storage errors or schedule a different bank's mirror", async () => {
  const f = fixture();
  let mirrors = 0;
  f.c.storageBlocked = true;
  f.c.storageProblem = "new bank error";
  f.c.scheduleSingleFile = () => {
    mirrors++;
  };
  f.c.commitRecords = async () => {
    f.c.connection = {};
  };
  await f.c.saveDBV24();
  assert.equal(f.c.storageBlocked, true);
  assert.equal(f.c.storageProblem, "new bank error");
  assert.equal(mirrors + f.statuses.length, 0);
  assert.equal(f.c.busy, 0);
});

test("valid queued save retains success notification and mirror scheduling", async () => {
  const f = fixture();
  let mirrors = 0;
  f.c.commitRecords = async () => {};
  f.c.scheduleSingleFile = () => {
    mirrors++;
  };
  await f.c.saveDBV24();
  assert.equal(f.statuses.length, 1);
  assert.equal(mirrors, 1);
  assert.equal(f.c.storageBlocked, false);
  assert.equal(f.c.busy, 0);
});
