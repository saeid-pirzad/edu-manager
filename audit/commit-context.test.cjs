"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const messages = [];
  const c = vm.createContext({
    blocked: false,
    workspace: { id: "first", revision: 1 },
    connection: {},
    committed: new Map([["removed", "old"]]),
    resetBusy: false,
    connectionRetired: false,
    failNextWrite: false,
    normalizedName: String,
    academicTermKind: () => "first",
    EduRecordCommitPlan: {
      create: () => ({
        changed: [["new", "json"]],
        removed: ["removed"],
        before: [],
        changes: [],
      }),
    },
    EduRecordTransaction: {
      commit: async () => ({ id: "first", revision: 2 }),
    },
    broadcast: (value) => messages.push(value),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/data/save.js"),
      "utf8",
    ),
    c,
  );
  return { c, messages };
}
function change(c, kind) {
  if (kind === "workspace") c.workspace = { id: "second", revision: 1 };
  else if (kind === "revision") c.workspace.revision++;
  else if (kind === "connection") c.connection = {};
  else if (kind === "committed") c.committed = new Map([["selected", "data"]]);
  else c[kind] = true;
}
test("successful commit publishes records and revision to its current source", async () => {
  const f = fixture();
  assert.equal(await f.c.commitRecords(new Map()), true);
  assert.equal(f.c.workspace.revision, 2);
  assert.equal(f.c.committed.get("new"), "json");
  assert.equal(f.c.committed.has("removed"), false);
  assert.equal(f.messages[0].workspace, "first");
});
for (const kind of [
  "workspace",
  "revision",
  "connection",
  "committed",
  "resetBusy",
  "connectionRetired",
]) {
  test(`late commit cannot install old state after ${kind} changes`, async () => {
    const f = fixture();
    let selected, records;
    f.c.EduRecordTransaction.commit = async () => {
      change(f.c, kind);
      selected = f.c.workspace;
      records = f.c.committed;
      return { id: "first", revision: 2 };
    };
    await f.c.commitRecords(new Map());
    assert.equal(f.c.workspace, selected);
    assert.equal(f.c.committed, records);
    assert.equal(records.has("new"), false);
    const canBroadcast = ![
      "connection",
      "resetBusy",
      "connectionRetired",
    ].includes(kind);
    assert.equal(f.messages.length, canBroadcast ? 1 : 0);
    if (canBroadcast) assert.equal(f.messages[0].workspace, "first");
  });
}
for (const kind of [
  "workspace",
  "connection",
  "resetBusy",
  "connectionRetired",
]) {
  test(`old conflict does not block a changed ${kind} context`, async () => {
    const f = fixture();
    const failure = Object.assign(Error("conflict"), {
      code: "WORKSPACE_CONFLICT",
    });
    f.c.EduRecordTransaction.commit = async () => {
      change(f.c, kind);
      throw failure;
    };
    await assert.rejects(
      f.c.commitRecords(new Map()),
      (error) => error === failure,
    );
    assert.equal(f.c.blocked, false);
  });
}
test("conflict still blocks its active source", async () => {
  const f = fixture();
  f.c.EduRecordTransaction.commit = async () => {
    throw Object.assign(Error("conflict"), { code: "WORKSPACE_CONFLICT" });
  };
  await assert.rejects(f.c.commitRecords(new Map()));
  assert.equal(f.c.blocked, true);
});
