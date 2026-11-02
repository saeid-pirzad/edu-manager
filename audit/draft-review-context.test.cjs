"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const effects = [],
    draft = { value: "18", classId: "source-class" };
  const c = vm.createContext({
    assessmentContext: { hasDrafts: () => false, dispose: async () => {} },
    workspace: { id: "first", revision: 1 },
    connection: {},
    busy: 0,
    flushing: null,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    drafts: new Map([["grade", draft]]),
    draftTimer: null,
    db: { marker: "source memory" },
    clearTimeout() {},
    confirm: () => true,
    storeDrafts: async () => {},
    readWorkspace: async () => ({ data: { marker: "source durable" } }),
    setStatus: () => effects.push("status"),
    render: () => effects.push("render"),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/drafts/review.js"),
      "utf8",
    ),
    c,
  );
  return { c, draft, effects };
}

test("discard reload cannot replace destination data after a period switch", async () => {
  const { c, effects } = fixture();
  const destination = { marker: "destination memory" },
    destinationDraft = { value: "12", classId: "destination-class" };
  c.readWorkspace = async (id) => {
    assert.equal(id, "first");
    c.workspace = { id: "second" };
    c.db = destination;
    c.drafts.set("destination", destinationDraft);
    return { data: { marker: "obsolete source" } };
  };
  await assert.rejects(c.discardDrafts(), /وضعیت ثبت تغییر/);
  assert.equal(c.db, destination);
  assert.equal(c.drafts.get("destination"), destinationDraft);
  assert.equal(effects.length, 0);
});

test("discard checks its original period before starting a durable-data reload", async () => {
  const { c } = fixture();
  let reads = 0;
  c.storeDrafts = async () => {
    c.workspace = { id: "second" };
  };
  c.readWorkspace = async () => reads++;
  await assert.rejects(c.discardDrafts(), /وضعیت ثبت تغییر/);
  assert.equal(reads, 0);
});

for (const change of [
  "workspace",
  "connection",
  "resetBusy",
  "connectionRetired",
  "revision",
  "busy",
  "flushing",
]) {
  test(`failed discard never rolls source drafts into a changed ${change}`, async () => {
    const { c } = fixture();
    const destinationDraft = { value: "12", classId: "destination-class" };
    let stores = 0;
    c.storeDrafts = async () => {
      stores++;
      if (change === "workspace") c.workspace = { id: "second" };
      else if (change === "connection") c.connection = {};
      else if (change === "revision") c.workspace.revision++;
      else c[change] = true;
      c.drafts.clear();
      c.drafts.set("destination", destinationDraft);
      throw Error("draft store unavailable");
    };
    await assert.rejects(c.discardDrafts(), /draft store unavailable/);
    assert.equal(c.drafts.size, 1);
    assert.equal(c.drafts.get("destination"), destinationDraft);
    assert.equal(stores, 1);
  });
}

test("failed discard restores source drafts without overwriting a newer edit of the same cell", async () => {
  const { c } = fixture();
  const newer = { value: "20", classId: "source-class" };
  let stores = 0;
  c.storeDrafts = async () => {
    stores++;
    if (stores === 1) {
      c.drafts.set("grade", newer);
      throw Error("draft store unavailable");
    }
  };
  await assert.rejects(c.discardDrafts(), /draft store unavailable/);
  assert.equal(c.drafts.get("grade"), newer);
  assert.equal(stores, 2);
});

for (const change of ["revision", "busy", "flushing"]) {
  test(`discard refuses to install a stale reload after same-period ${change} changes`, async () => {
    const { c, effects } = fixture();
    const current = { marker: "newer same-period data" },
      currentDraft = { value: "20", classId: "source-class" };
    c.readWorkspace = async () => {
      if (change === "revision") c.workspace.revision++;
      else c[change] = true;
      c.db = current;
      c.drafts.set("newer", currentDraft);
      return { data: { marker: "stale durable snapshot" } };
    };
    await assert.rejects(c.discardDrafts(), /وضعیت ثبت تغییر/);
    assert.equal(c.db, current);
    assert.equal(c.drafts.get("newer"), currentDraft);
    assert.equal(effects.length, 0);
  });
}

test("discard cannot clear drafts while a same-period save is already pending", async () => {
  const { c, draft } = fixture();
  let stores = 0;
  c.busy = 1;
  c.storeDrafts = async () => stores++;
  await assert.rejects(c.discardDrafts(), /وضعیت ثبت تغییر/);
  assert.equal(c.drafts.get("grade"), draft);
  assert.equal(stores, 0);
});

test("successful discard clears only pending input and reloads the original durable data", async () => {
  const { c, effects } = fixture();
  await c.discardDrafts();
  assert.equal(c.drafts.size, 0);
  assert.equal(c.db.marker, "source durable");
  assert.deepEqual(effects, ["status", "render"]);
});
