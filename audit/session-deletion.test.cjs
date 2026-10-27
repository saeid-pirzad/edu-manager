"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [];
  const c = vm.createContext({
    workspace: { id: "first" },
    connection: {},
    state: { schoolId: "school", classId: "class", lessonId: "lesson" },
    currentSessionId: "one",
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    db: {
      sessions: [
        { id: "one", classId: "class", lessonId: "lesson" },
        { id: "two", classId: "class", lessonId: "lesson" },
        { id: "other-lesson", classId: "class", lessonId: "other" },
        { id: "other-class", classId: "other", lessonId: "lesson" },
      ],
    },
    assertEntityWritable() {},
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    confirm: () => true,
    saveDBV24: async () => effects.push("save"),
    render: () => effects.push("render"),
    closeModal: () => effects.push("close"),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/actions.js"),
      "utf8",
    ),
    c,
  );
  return { c, effects };
}
test("single-session deletion preserves other sessions and closes only its deleted active dialog", async () => {
  const f = fixture();
  await f.c.deleteSessionV24("one");
  assert.deepEqual(
    Array.from(f.c.db.sessions, (row) => row.id),
    ["two", "other-lesson", "other-class"],
  );
  assert.equal(f.c.currentSessionId, null);
  assert.deepEqual(f.effects, ["save", "close", "render"]);
});
test("bulk deletion is limited to the specified class and lesson", async () => {
  const f = fixture();
  await f.c.deleteAllSessionsV24("class", "lesson");
  assert.deepEqual(
    Array.from(f.c.db.sessions, (row) => row.id),
    ["other-lesson", "other-class"],
  );
});
test("declined deletion does not mutate or save", async () => {
  const f = fixture();
  f.c.confirm = () => false;
  assert.equal(await f.c.deleteSessionV24("one"), false);
  assert.equal(f.c.db.sessions.length, 4);
  assert.equal(f.effects.length, 0);
});
test("missing-session deletion does not enqueue a write", async () => {
  const f = fixture();
  assert.equal(await f.c.deleteSessionV24("missing"), false);
  assert.equal(f.effects.length, 0);
});
test("read-only deletion fails before touching data", async () => {
  const f = fixture();
  f.c.assertEntityWritable = () => {
    throw Error("closed");
  };
  await assert.rejects(f.c.deleteSessionV24("one"), /closed/);
  assert.equal(f.c.db.sessions.length, 4);
});
for (const step of ["flush", "save"]) {
  test(`session deletion preserves a new context changed during ${step}`, async () => {
    const f = fixture();
    f.c[step === "flush" ? "flushDrafts" : "saveDBV24"] = async () => {
      f.c.connection = {};
    };
    const pending = f.c.deleteSessionV24("one");
    if (step === "flush") {
      await assert.rejects(pending);
      assert.equal(f.c.db.sessions.length, 4);
    } else await pending;
    assert.equal(f.effects.length, 0);
    assert.equal(f.c.currentSessionId, "one");
  });
}
test("concurrent deletion submissions are serialized", async () => {
  const f = fixture();
  let release;
  f.c.flushDrafts = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const first = f.c.deleteSessionV24("one");
  assert.equal(await f.c.deleteSessionV24("one"), false);
  release();
  await first;
  assert.equal(f.effects.filter((value) => value === "save").length, 1);
});

test("failed session deletion rolls back through the real save queue and can be retried", async () => {
  const f = fixture();
  let durable = structuredClone(f.c.db),
    attempts = 0;
  Object.assign(f.c, {
    fileMode: false,
    writeFailureGeneration: 0,
    busy: 0,
    paintStatus() {},
    checkScope() {},
    collectRecords: (value) => value,
    setStatus() {},
    scheduleSingleFile() {},
    readWorkspace: async () => ({ data: structuredClone(durable) }),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/data/save.js"),
      "utf8",
    ),
    f.c,
  );
  f.c.commitRecords = async () => {
    if (++attempts === 1) throw Error("quota");
    durable = structuredClone(f.c.db);
  };
  await assert.rejects(f.c.deleteSessionV24("one"), /quota/);
  assert.equal(f.c.db.sessions.length, 4);
  assert.equal(f.c.currentSessionId, "one");
  assert.equal(f.effects.includes("close"), false);
  await f.c.deleteSessionV24("one");
  assert.equal(durable.sessions.length, 3);
  assert.equal(f.c.currentSessionId, null);
  assert.equal(f.c.busy, 0);
});
