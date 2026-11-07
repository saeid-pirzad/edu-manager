"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const effects = [],
    errors = [],
    original = {
      settings: {},
      schools: [
        {
          id: "school",
          name: "Original school",
          classes: [{ id: "class", name: "Original class", students: [] }],
        },
      ],
    };
  const c = vm.createContext({
    db: original,
    workspace: {
      id: "same-period",
      revision: 1,
      year: "1405-1406",
      term: "first",
    },
    connection: {},
    installationToken: "original-installation",
    state: { view: "school", schoolId: "school" },
    fileMode: false,
    ready: true,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    blocked: false,
    isAuthenticated: true,
    beginRecordEditorSave: () => () => {},
    initializeRecordEditAccess() {},
    assertRecordEditAccess() {},
    normalizedName: (value) => value.trim(),
    recordFieldError: (message) => Error(message),
    flushDrafts: async () => {},
    uid: () => "new-entity",
    saveDBV24: async () => {
      c.workspace = { ...c.workspace, revision: c.workspace.revision + 1 };
      effects.push("save");
    },
    getSchool: (id) => c.db.schools.find((school) => school.id === id),
    render: () => effects.push("render"),
    closeModal: () => effects.push("close"),
    rememberRecordEditor() {},
    esc: String,
    showModal: () => effects.push("modal"),
    handleError: (error) => errors.push(error),
    showRecordEditorError: (error) => {
      errors.push(error);
      return true;
    },
    document: {
      querySelector: (selector) => (selector.startsWith("form[") ? null : {}),
      getElementById: () => ({ value: "Updated name" }),
    },
  });
  for (const name of ["edit", "create"])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/workspace/entities", name + ".js"),
        "utf8",
      ),
      c,
    );
  return { c, original, effects, errors };
}
function replace(f, kind) {
  if (kind === "bank") f.c.db = structuredClone(f.c.db);
  else if (kind === "connection") f.c.connection = {};
  else f.c.installationToken = "replaced-installation";
}
function event() {
  return {
    preventDefault() {},
    target: { elements: { namedItem: () => ({ value: "New entity" }) } },
  };
}

for (const entity of ["school", "class"])
  for (const kind of ["bank", "connection", "installation"])
    test(`${entity} creation refuses replacement ${kind} during draft flush`, async () => {
      const f = fixture();
      f.c.flushDrafts = async () => replace(f, kind);
      assert.equal(await f.c.createEntityV24(event(), entity), false);
      assert.equal(f.c.db.schools.length, 1);
      assert.equal(f.c.db.schools[0].classes.length, 1);
      assert.deepEqual(f.effects, []);
      assert.equal(f.errors.length, 1);
    });

for (const entity of ["school", "class"])
  for (const kind of ["bank", "connection", "installation"])
    test(`${entity} editor cannot open on replacement ${kind}`, async () => {
      const f = fixture();
      f.c.flushDrafts = async () => replace(f, kind);
      await assert.rejects(
        f.c.openEntityEditor(entity, entity, "school"),
        /تغییر/,
      );
      assert.deepEqual(f.effects, []);
    });

for (const entity of ["school", "class"])
  for (const kind of ["bank", "connection", "installation"])
    for (const timing of ["before-save", "during-flush"])
      test(`${entity} edit refuses replacement ${kind} ${timing}`, async () => {
        const f = fixture();
        await f.c.openEntityEditor(entity, entity, "school");
        f.effects.length = 0;
        if (timing === "before-save") replace(f, kind);
        else f.c.flushDrafts = async () => replace(f, kind);
        await f.c.saveEntityEditor();
        assert.equal(f.c.db.schools[0].name, "Original school");
        assert.equal(f.c.db.schools[0].classes[0].name, "Original class");
        assert.deepEqual(f.effects, []);
        assert.equal(f.errors.length, 1);
      });

for (const entity of ["school", "class"])
  test(`${entity} creation permits its successful save revision and refreshes`, async () => {
    const f = fixture();
    assert.equal(await f.c.createEntityV24(event(), entity), true);
    assert.deepEqual(f.effects, ["save", "render"]);
  });

for (const entity of ["school", "class"])
  test(`${entity} edit permits its successful save revision and closes`, async () => {
    const f = fixture();
    await f.c.openEntityEditor(entity, entity, "school");
    f.effects.length = 0;
    await f.c.saveEntityEditor();
    assert.equal(f.errors.length, 0);
    assert.deepEqual(f.effects, ["save", "close", "render"]);
  });

for (const operation of ["create", "edit"])
  for (const kind of ["bank", "connection", "installation"])
    test(`late ${operation} completion does not alter replacement ${kind} UI`, async () => {
      const f = fixture();
      if (operation === "edit") await f.c.openEntityEditor("school", "school");
      f.effects.length = 0;
      f.c.saveDBV24 = async () => replace(f, kind);
      if (operation === "edit") await f.c.saveEntityEditor();
      else await f.c.createEntityV24(event(), "school");
      assert.deepEqual(f.effects, []);
    });

test("entity edit can retry after its own failed write rolls back the bank object", async () => {
  const f = fixture(),
    durable = structuredClone(f.original);
  await f.c.openEntityEditor("school", "school");
  f.effects.length = 0;
  const successfulSave = f.c.saveDBV24;
  f.c.saveDBV24 = async () => {
    f.c.db = structuredClone(durable);
    throw Error("Simulated write failure");
  };
  await f.c.saveEntityEditor();
  assert.equal(f.c.db.schools[0].name, "Original school");
  assert.equal(f.errors.length, 1);
  f.c.saveDBV24 = successfulSave;
  await f.c.saveEntityEditor();
  assert.equal(f.c.db.schools[0].name, "Updated name");
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.effects, ["save", "close", "render"]);
});

test("creation accepts an ordinary revision advance from its own draft flush", async () => {
  const f = fixture();
  f.c.flushDrafts = async () => {
    f.c.workspace = { ...f.c.workspace, revision: 2 };
  };
  assert.equal(await f.c.createEntityV24(event(), "school"), true);
  assert.deepEqual(f.effects, ["save", "render"]);
});

test("opening an editor captures the revision after the normal draft flush", async () => {
  const f = fixture();
  f.c.flushDrafts = async () => {
    f.c.workspace = { ...f.c.workspace, revision: 2 };
  };
  await f.c.openEntityEditor("school", "school");
  f.effects.length = 0;
  await f.c.saveEntityEditor();
  assert.equal(f.errors.length, 0);
  assert.deepEqual(f.effects, ["save", "close", "render"]);
});

test("unrelated revision changes still invalidate an already open entity editor", async () => {
  const f = fixture();
  await f.c.openEntityEditor("school", "school");
  f.effects.length = 0;
  f.c.workspace.revision++;
  await f.c.saveEntityEditor();
  assert.equal(f.original.schools[0].name, "Original school");
  assert.deepEqual(f.effects, []);
  assert.equal(f.errors.length, 1);
});
