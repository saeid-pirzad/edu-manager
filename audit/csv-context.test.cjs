"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    errors = [],
    choices = [{ value: "add" }];
  const cls = { students: [], archivedStudents: [] };
  const context = {
    workspace: "first",
    revision: 1,
    schoolId: "school",
    classId: "class",
    plan: [{ row: 2, name: "Student", code: "1", existingId: null }],
  };
  const c = vm.createContext({
    workspace: { id: "first", revision: 1 },
    connection: {},
    state: { schoolId: "school", classId: "class" },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    pendingCSV: context,
    document: { querySelector: () => ({ querySelectorAll: () => choices }) },
    beginRecordEditorSave: () => () => {},
    assertEntityWritable() {},
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    getClassObj: () => cls,
    knownStudents: (value) => [...value.students, ...value.archivedStudents],
    studentIdentity: (name, code) => ({ name, code }),
    uid: () => "new-id",
    freezeClassRosters() {},
    saveDBV24: async () => effects.push("save"),
    rememberRecordEditor() {},
    closeModal: () => effects.push("close"),
    render: () => effects.push("render"),
    setStatus: () => effects.push("status"),
    showRecordEditorError: (error) => {
      errors.push(error);
      return true;
    },
    handleError: (error) => errors.push(error),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/students/csv-import.js"),
      "utf8",
    ),
    c,
  );
  return { c, cls, context, effects, errors, choices };
}
for (const kind of ["connection", "preview"]) {
  test(`CSV commit rejects changed ${kind} before mutation`, async () => {
    const f = fixture();
    f.c.flushDrafts = async () => {
      if (kind === "connection") f.c.connection = {};
      else f.c.pendingCSV = { ...f.context };
    };
    assert.equal(await f.c.commitCSV(), false);
    assert.equal(f.cls.students.length + f.effects.length, 0);
    assert.equal(f.errors.length, 1);
  });
}
for (const kind of ["connection", "preview", "class"]) {
  test(`late CSV completion preserves a changed ${kind} view`, async () => {
    const f = fixture();
    f.c.saveDBV24 = async () => {
      if (kind === "connection") f.c.connection = {};
      else if (kind === "class") f.c.state.classId = "other-class";
      else f.c.pendingCSV = { ...f.context };
    };
    assert.equal(await f.c.commitCSV(), true);
    assert.equal(f.effects.length, 0);
    assert.notEqual(f.c.pendingCSV, null);
  });
}
test("CSV commit rejects a code already archived before adding any student", async () => {
  const f = fixture();
  f.cls.archivedStudents.push({ id: "archived", code: "1" });
  assert.equal(await f.c.commitCSV(), false);
  assert.equal(f.cls.students.length + f.effects.length, 0);
});
test("invalid CSV decision prevents applying previously prepared additions", async () => {
  const f = fixture();
  f.context.plan.push({ row: 3, name: "Other", code: "2" });
  f.choices.push({ value: "invalid" });
  assert.equal(await f.c.commitCSV(), false);
  assert.equal(f.cls.students.length + f.effects.length, 0);
});
test("valid CSV adds selected students then clears its own preview", async () => {
  const f = fixture();
  assert.equal(await f.c.commitCSV(), true);
  assert.equal(f.cls.students.length, 1);
  assert.equal(f.c.pendingCSV, null);
  assert.deepEqual(f.effects, ["save", "close", "render", "status"]);
});
test("CSV preview prepared on another connection is rejected even with identical period id and revision", async () => {
  const f = fixture();
  f.context.connection = {};
  assert.equal(await f.c.commitCSV(), false);
  assert.equal(f.cls.students.length + f.effects.length, 0);
});
test("CSV file read rejects a replaced bank before preparing preview", async () => {
  const f = fixture();
  f.c.document.querySelector = () => null;
  const event = {
    target: {
      value: "selected",
      files: [
        {
          size: 100,
          text: async () => {
            f.c.connection = {};
            return "csv";
          },
        },
      ],
    },
  };
  await f.c.csvImportV24(event);
  assert.equal(f.errors.length, 1);
  assert.equal(event.target.value, "");
  assert.equal(f.c.pendingCSV, f.context);
});

test("large CSV additions use bounded push calls rather than an unbounded argument spread", async () => {
  const f = fixture();
  let nextId = 0;
  f.c.uid = () => "csv-student-" + nextId++;
  f.context.plan = Array.from({ length: 6000 }, (_, i) => ({
    row: i + 2,
    name: "Student " + i,
    code: String(i + 1),
    existingId: null,
  }));
  f.choices.splice(0, 1, ...f.context.plan.map(() => ({ value: "add" })));
  const push = f.cls.students.push;
  let pushes = 0;
  f.cls.students.push = function (...args) {
    assert.equal(args.length, 1);
    pushes++;
    return push.apply(this, args);
  };
  assert.equal(await f.c.commitCSV(), true);
  assert.equal(pushes, 6000);
  assert.equal(f.cls.students.length, 6000);
});

test("CSV identity updates use the active-id index and verify the saved code", async () => {
  const f = fixture();
  const student = { id: "existing", name: "Old", code: "1" };
  f.cls.students.push(student);
  f.cls.students.find = () => {
    throw Error("repeated full scan");
  };
  f.context.plan[0].existingId = "existing";
  f.context.plan[0].archived = false;
  f.choices[0].value = "update";
  f.c.applyStudentIdentity = (cls, value, identity) =>
    Object.assign(value, identity);
  assert.equal(await f.c.commitCSV(), true);
  assert.equal(student.name, "Student");
});

for (const mode of ["add", "update"]) {
  test(`CSV ${mode} can retry after the real save queue rolls back a failed write`, async () => {
    const f = fixture();
    f.c.db = {
      cls: {
        students:
          mode === "update" ? [{ id: "existing", name: "Old", code: "1" }] : [],
        archivedStudents: [],
      },
    };
    let durable = structuredClone(f.c.db),
      attempts = 0;
    f.c.getClassObj = () => f.c.db.cls;
    f.c.applyStudentIdentity = (cls, student, identity) =>
      Object.assign(student, identity);
    if (mode === "update") {
      f.context.plan[0].existingId = "existing";
      f.choices[0].value = "update";
    }
    Object.assign(f.c, {
      fileMode: false,
      writeFailureGeneration: 0,
      busy: 0,
      paintStatus() {},
      checkScope() {},
      collectRecords: (db) => db,
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
      f.c.workspace.revision++;
    };
    assert.equal(await f.c.commitCSV(), false);
    assert.equal(f.c.pendingCSV, f.context);
    assert.equal(f.c.db.cls.students.length, mode === "add" ? 0 : 1);
    if (mode === "update") assert.equal(f.c.db.cls.students[0].name, "Old");
    assert.equal(await f.c.commitCSV(), true);
    assert.equal(durable.cls.students.length, 1);
    assert.equal(durable.cls.students[0].name, "Student");
    assert.equal(f.c.pendingCSV, null);
    assert.equal(f.c.busy, 0);
  });
}
