"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const writes = [],
    statuses = [];
  const durable = { schools: [{ id: "saved" }] };
  const c = vm.createContext({
    workspace: { id: "first" },
    db: { schools: [{ id: "unsaved" }] },
    ready: true,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    writer: Promise.resolve(),
    todayISO: () => "2026-10-27",
    allFrom: async () => [],
    readWorkspaceSnapshot: async (id) => {
      assert.equal(id, "first");
      return { data: durable };
    },
    setStatus: (...args) => statuses.push(args),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/local.js"),
      "utf8",
    ),
    c,
  );
  c.putBackup = async (...args) => {
    writes.push(args);
  };
  return { c, writes, statuses, durable };
}

test("daily backup reads durable data rather than unsaved working memory", async () => {
  const f = fixture();
  assert.equal(await f.c.ensureDailyBackup(), true);
  assert.equal(f.writes[0][0], f.durable);
  assert.equal(f.writes[0][2], "first");
});
test("daily backup waits for queued writes before reading", async () => {
  const f = fixture();
  let release,
    reads = 0;
  f.c.writer = new Promise((resolve) => {
    release = resolve;
  });
  f.c.allFrom = async () => {
    reads++;
    return [];
  };
  const pending = f.c.ensureDailyBackup();
  await Promise.resolve();
  assert.equal(reads, 0);
  release();
  await pending;
  assert.equal(reads, 1);
});
for (const step of ["writer", "catalog", "snapshot"]) {
  test(`daily backup skips a source changed during ${step}`, async () => {
    const f = fixture();
    if (step === "writer")
      f.c.writer = {
        catch: async () => {
          f.c.workspace.id = "second";
        },
      };
    if (step === "catalog")
      f.c.allFrom = async () => {
        f.c.workspace.id = "second";
        return [];
      };
    if (step === "snapshot")
      f.c.readWorkspaceSnapshot = async () => {
        f.c.workspace.id = "second";
        return { data: f.durable };
      };
    assert.equal(await f.c.ensureDailyBackup(), false);
    assert.equal(f.writes.length + f.statuses.length, 0);
  });
}
test("daily backup does not duplicate today's version in the same period", async () => {
  const f = fixture();
  f.c.allFrom = async () => [
    { workspace: "first", at: "2026-10-27T08:00:00Z" },
  ];
  assert.equal(await f.c.ensureDailyBackup(), false);
  assert.equal(f.writes.length, 0);
});
test("another period's daily backup does not suppress the source backup", async () => {
  const f = fixture();
  f.c.allFrom = async () => [
    { workspace: "second", at: "2026-10-27T08:00:00Z" },
  ];
  assert.equal(await f.c.ensureDailyBackup(), true);
});
test("daily backup failure warns without breaking startup", async () => {
  const f = fixture();
  f.c.putBackup = async () => {
    throw Error("quota");
  };
  assert.equal(await f.c.ensureDailyBackup(), false);
  assert.equal(f.statuses.length, 1);
});
test("late failure does not overwrite status for a different period", async () => {
  const f = fixture();
  f.c.putBackup = async () => {
    f.c.workspace.id = "second";
    throw Error("quota");
  };
  assert.equal(await f.c.ensureDailyBackup(), false);
  assert.equal(f.statuses.length, 0);
});
for (const [flag, value] of [
  ["ready", false],
  ["periodLoading", true],
  ["resetBusy", true],
  ["connectionRetired", true],
]) {
  test(`daily backup skips unavailable source: ${flag}`, async () => {
    const f = fixture();
    f.c[flag] = value;
    assert.equal(await f.c.ensureDailyBackup(), false);
    assert.equal(f.writes.length + f.statuses.length, 0);
  });
}
