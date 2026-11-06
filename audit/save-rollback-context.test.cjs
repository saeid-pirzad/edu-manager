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
    captureSaveFeedback: () => null,
    captureSessionEditRecovery: () => null,
    rebindSessionEditAfterRollback: () => false,
    invalidateSessionEditRecovery() {},
    workspace: { id: "first", revision: 1 },
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
    refreshAcademicYearWarnings() {},
    collectRecords: (value) => value,
    setStatus: (...args) => statuses.push(args),
    render() {},
    scheduleSingleFile() {},
    readWorkspaceSnapshot: async (id) => {
      reads.push(id);
      return { period: { id, revision: 1 }, data: { durable: true } };
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

test("a protected unauthenticated period cannot queue any data write", async () => {
  const f = fixture();
  f.c.db.settings = { password: "protected-hash" };
  f.c.isAuthenticated = false;
  let writes = 0;
  f.c.commitRecords = async () => writes++;
  await assert.rejects(f.c.saveDBV24(), /وارد ترم/);
  assert.equal(writes, 0);
  assert.equal(f.c.busy, 0);
  assert.equal(f.c.writeFailureGeneration, 0);
  assert.equal(f.reads.length, 0);
});

test("queued data writes recheck authentication before touching durable records", async () => {
  const f = fixture();
  f.c.db.settings = { password: "protected-hash" };
  f.c.isAuthenticated = true;
  let release,
    writes = 0;
  f.c.writer = new Promise((resolve) => {
    release = resolve;
  });
  f.c.commitRecords = async () => writes++;
  const saving = f.c.saveDBV24();
  f.c.isAuthenticated = false;
  release();
  await assert.rejects(saving, /وارد ترم/);
  assert.equal(writes, 0);
  assert.equal(f.c.busy, 0);
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
    f.c.readWorkspaceSnapshot = async () => {
      if (change === "workspace") f.c.workspace.id = "second";
      else if (change === "connection") f.c.connection = {};
      else f.c[change] = true;
      f.c.db = { selected: true };
      return {
        period: { id: "first", revision: 1 },
        data: { obsolete: true },
      };
    };
    await assert.rejects(f.c.saveDBV24());
    assert.equal(f.c.db.selected, true);
    assert.equal(f.statuses.length, 0);
    assert.equal(f.c.busy, 0);
  });
}
test("rollback read failure preserves the original write error and releases busy state", async () => {
  const f = fixture();
  f.c.readWorkspaceSnapshot = async () => {
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

test("queued saves retain the installation captured at invocation and reject local replacement without rollback into the newer installation", async () => {
  const f = fixture();
  f.c.installationToken = "epoch-a";
  let release,
    writes = 0;
  f.c.writer = new Promise((resolve) => {
    release = resolve;
  });
  f.c.commitRecords = async () => {
    writes++;
  };
  const operation = f.c.saveDBV24();
  f.c.installationToken = "epoch-b";
  release();
  await assert.rejects(operation);
  assert.equal(writes, 0);
  assert.equal(f.reads.length, 0);
  assert.equal(f.c.db.unsaved, true);
});
test("normal queued saves pass the original installation explicitly to the atomic boundary", async () => {
  const f = fixture();
  f.c.installationToken = "epoch-a";
  let options;
  f.c.commitRecords = async (_records, value) => {
    options = value;
  };
  await f.c.saveDBV24();
  assert.equal(options.expectedInstallation, "epoch-a");
});

for (const fails of [false, true]) {
  test(
    "save feedback retains the original editor scope across an async " +
      (fails ? "failure" : "success"),
    async () => {
      const f = fixture();
      let scope = "session-a",
        release;
      f.c.captureSaveFeedback = () => scope;
      f.c.writer = new Promise((resolve) => {
        release = resolve;
      });
      f.c.commitRecords = async () => {
        if (fails) throw f.failure;
      };
      const pending = f.c.saveDBV24();
      scope = "session-b";
      release();
      if (fails) await assert.rejects(pending);
      else await pending;
      assert.equal(f.statuses.length, 1);
      assert.equal(f.statuses[0][2], "session-a");
    },
  );
}

test("an already captured grade scope is not recaptured after an awaited draft flush", async () => {
  const f = fixture();
  f.c.captureSaveFeedback = () => "unrelated-editor";
  f.c.commitRecords = async () => {};
  await f.c.saveDBV24({}, { feedbackScope: "original-grade-editor" });
  assert.equal(f.statuses[0][2], "original-grade-editor");
});
