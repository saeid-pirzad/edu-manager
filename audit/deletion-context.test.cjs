"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    errors = [];
  const context = {
    kind: "school",
    id: "school",
    schoolId: "school",
    workspace: "first",
    revision: 1,
  };
  const c = vm.createContext({
    workspace: { id: "first", revision: 1 },
    connection: {},
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    state: { view: "school", schoolId: "school", classId: "class" },
    db: {
      schools: [{ id: "school", name: "School", classes: [] }],
      sessions: [],
      masterSchedule: {},
    },
    document: {
      querySelector: () => ({ form: {} }),
      getElementById: () => ({ value: "School" }),
    },
    beginRecordEditorSave: () => () => {},
    assertEntityWritable() {},
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    putBackup: async () => effects.push("backup"),
    saveDBV24: async () => effects.push("save"),
    rememberRecordEditor() {},
    render: () => effects.push("render"),
    closeModal: () => effects.push("close"),
    setStatus: () => effects.push("status"),
    showRecordEditorError: (error) => {
      errors.push(error);
      return true;
    },
    context,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/entities/delete.js"),
      "utf8",
    ),
    c,
  );
  vm.runInContext("deletionContext = context", c);
  c.getSchool = (id) => c.db.schools.find((school) => school.id === id);
  return {
    c,
    effects,
    errors,
    pending: () => vm.runInContext("deletionContext", c),
  };
}
for (const kind of ["workspace", "connection", "preview"]) {
  test(`deletion stops before mutation if ${kind} changes during backup`, async () => {
    const f = fixture();
    f.c.putBackup = async () => {
      if (kind === "workspace") f.c.workspace.id = "second";
      else if (kind === "connection") f.c.connection = {};
      else vm.runInContext("deletionContext = { ...context }", f.c);
    };
    await f.c.confirmDeletion();
    assert.equal(f.c.db.schools.length, 1);
    assert.equal(f.effects.length, 0);
    assert.equal(f.errors.length, 1);
  });
}
for (const kind of ["workspace", "connection", "preview"]) {
  test(`late deletion completion preserves a changed ${kind} view`, async () => {
    const f = fixture();
    f.c.saveDBV24 = async () => {
      if (kind === "workspace") f.c.workspace.id = "second";
      else if (kind === "connection") f.c.connection = {};
      else vm.runInContext("deletionContext = { ...context }", f.c);
    };
    await f.c.confirmDeletion();
    assert.deepEqual(f.effects, ["backup"]);
    assert.equal(f.c.state.view, "school");
    assert.equal(f.c.state.schoolId, "school");
    assert.notEqual(f.pending(), null);
  });
}
test("valid deletion saves backup first, persists removal and then updates its view", async () => {
  const f = fixture();
  await f.c.confirmDeletion();
  assert.deepEqual(f.effects, ["backup", "save", "render", "close", "status"]);
  assert.equal(f.c.db.schools.length, 0);
  assert.equal(f.c.state.view, "schools");
  assert.equal(f.pending(), null);
  assert.equal(f.errors.length, 0);
});
test("failed pre-deletion backup prevents deletion", async () => {
  const f = fixture();
  f.c.putBackup = async () => {
    throw Error("quota");
  };
  await f.c.confirmDeletion();
  assert.equal(f.c.db.schools.length, 1);
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors.length, 1);
});
