"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    errors = [];
  const student = { id: "student", name: "Original", code: "1" };
  const cls = {
    id: "class",
    students: [student],
    archivedStudents: [],
    lessons: [{ grades: { student: 18 } }],
  };
  const context = {
    workspace: "first",
    revision: 1,
    schoolId: "school",
    classId: "class",
    studentId: "student",
  };
  const c = vm.createContext({
    workspace: { id: "first", revision: 1 },
    connection: {},
    state: { schoolId: "school", classId: "class" },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    db: {
      sessions: [
        { classId: "class", roster: [{ id: "student", name: "Historical" }] },
      ],
    },
    document: {
      querySelector: () => ({}),
      getElementById: (id) => ({
        value: id === "editStudentName" ? "Updated" : "2",
      }),
    },
    beginRecordEditorSave: () => () => {},
    assertEntityWritable() {},
    getClassObj: () => cls,
    getStudentObj: () => student,
    knownStudents: (value) => [...value.students, ...value.archivedStudents],
    asciiDigits: (value) => String(value || "").trim(),
    normalizedName: (value) => value.trim(),
    recordFieldError: (message, fieldId) =>
      Object.assign(Error(message), { fieldId }),
    freezeClassRosters() {},
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    saveDBV24: async () => effects.push("save"),
    rememberRecordEditor() {},
    closeModal: () => effects.push("close"),
    render: () => effects.push("render"),
    showRecordEditorError: (error) => {
      errors.push(error);
      return true;
    },
    context,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/students/editor.js"),
      "utf8",
    ),
    c,
  );
  vm.runInContext("studentEditing = context", c);
  return {
    c,
    cls,
    student,
    effects,
    errors,
    pending: () => vm.runInContext("studentEditing", c),
  };
}
function change(f, kind) {
  if (kind === "connection") f.c.connection = {};
  else if (kind === "class") f.c.state.classId = "another-class";
  else vm.runInContext("studentEditing = { ...context }", f.c);
}
for (const kind of ["connection", "preview"]) {
  test(`student edit refuses a changed ${kind} before mutation`, async () => {
    const f = fixture();
    f.c.flushDrafts = async () => change(f, kind);
    await f.c.saveStudent();
    assert.equal(f.student.name, "Original");
    assert.equal(f.effects.length, 0);
    assert.equal(f.errors.length, 1);
  });
}
for (const kind of ["connection", "class", "preview"]) {
  test(`late student edit preserves the changed ${kind} view`, async () => {
    const f = fixture();
    f.c.saveDBV24 = async () => change(f, kind);
    await f.c.saveStudent();
    assert.equal(f.effects.length, 0);
    assert.notEqual(f.pending(), null);
  });
}
for (const list of ["students", "archivedStudents"]) {
  test(`student code already in ${list} is rejected before saving`, async () => {
    const f = fixture();
    f.cls[list].push({ id: "other", name: "Other", code: "2" });
    await f.c.saveStudent();
    assert.equal(f.student.code, "1");
    assert.equal(f.effects.length, 0);
    assert.equal(f.errors[0].fieldId, "editStudentCode");
  });
}
test("valid identity edit preserves student id, grades and historical names", async () => {
  const f = fixture();
  await f.c.saveStudent();
  assert.equal(f.student.id, "student");
  assert.equal(f.student.name, "Updated");
  assert.equal(f.cls.lessons[0].grades.student, 18);
  assert.equal(f.c.db.sessions[0].roster[0].name, "Historical");
  assert.deepEqual(f.effects, ["save", "close", "render"]);
});

function creationEvent() {
  return {
    preventDefault() {},
    target: {
      elements: {
        namedItem: (name) => ({ value: name === "name" ? "New student" : "3" }),
      },
    },
  };
}
test("student creation refuses a replacement bank before adding a record", async () => {
  const f = fixture();
  f.c.handleError = (error) => f.errors.push(error);
  f.c.flushDrafts = async () => {
    f.c.connection = {};
  };
  assert.equal(await f.c.addStudentV24(creationEvent()), false);
  assert.equal(f.cls.students.length, 1);
  assert.equal(f.effects.length, 0);
  assert.equal(f.errors.length, 1);
});
test("late student creation does not rerender a replacement bank", async () => {
  const f = fixture();
  f.c.uid = () => "new-student";
  f.c.saveDBV24 = async () => {
    f.c.connection = {};
  };
  assert.equal(await f.c.addStudentV24(creationEvent()), true);
  assert.equal(f.cls.students.length, 2);
  assert.equal(f.effects.length, 0);
});
