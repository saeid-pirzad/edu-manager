"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    errors = [];
  const cls = {
    id: "class",
    name: "Class",
    students: [{ id: "student", name: "Student", code: "1" }],
    archivedStudents: [],
    lessons: [{ grades: { student: 18 } }],
  };
  const context = {
    workspace: "first",
    revision: 1,
    schoolId: "school",
    classId: "class",
    studentId: "student",
    action: "archive",
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
        {
          classId: "class",
          attendance: { student: "present" },
          scores: [{ studentId: "student", value: 18 }],
        },
      ],
    },
    document: { querySelector: () => ({ closest: () => ({}) }) },
    beginRecordEditorSave: () => () => {},
    assertEntityWritable() {},
    getClassObj: () => cls,
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    saveDBV24: async () => effects.push("save"),
    rememberRecordEditor() {},
    closeModal: () => effects.push("close"),
    render: () => effects.push("render"),
    setStatus: () => effects.push("status"),
    showRecordEditorError: (error) => {
      errors.push(error);
      return true;
    },
    clone: structuredClone,
    structuredClone,
    context,
  });
  for (const file of [
    "legacy/students/roster.js",
    "workspace/students/membership.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  vm.runInContext("membershipContext = context", c);
  return {
    c,
    cls,
    effects,
    errors,
    pending: () => vm.runInContext("membershipContext", c),
  };
}
function change(f, kind) {
  if (kind === "connection") f.c.connection = {};
  else if (kind === "class") f.c.state.classId = "other-class";
  else vm.runInContext("membershipContext = { ...context }", f.c);
}
for (const kind of ["connection", "class", "preview"]) {
  test(`membership stops before mutation after ${kind} changes during flush`, async () => {
    const f = fixture();
    f.c.flushDrafts = async () => change(f, kind);
    await f.c.saveMembership();
    assert.equal(f.cls.students.length, 1);
    assert.equal(f.cls.archivedStudents.length, 0);
    assert.equal(f.effects.length, 0);
    assert.equal(f.errors.length, 1);
  });
  test(`late membership completion does not close or overwrite a changed ${kind} view`, async () => {
    const f = fixture();
    f.c.saveDBV24 = async () => change(f, kind);
    await f.c.saveMembership();
    assert.equal(f.effects.length, 0);
    assert.notEqual(f.pending(), null);
  });
}
test("archiving preserves grades, attendance, scores and historical student identity", async () => {
  const f = fixture();
  const before = JSON.stringify({
    grades: f.cls.lessons,
    attendance: f.c.db.sessions[0].attendance,
    scores: f.c.db.sessions[0].scores,
  });
  await f.c.saveMembership();
  assert.equal(f.cls.students.length, 0);
  assert.equal(f.cls.archivedStudents[0].id, "student");
  assert.equal(f.c.db.sessions[0].roster[0].id, "student");
  assert.equal(
    JSON.stringify({
      grades: f.cls.lessons,
      attendance: f.c.db.sessions[0].attendance,
      scores: f.c.db.sessions[0].scores,
    }),
    before,
  );
  assert.deepEqual(f.effects, ["save", "close", "render", "status"]);
});
test("restoring archived membership retains student id and the frozen historical roster", async () => {
  const f = fixture();
  f.cls.archivedStudents = f.cls.students;
  f.cls.students = [];
  f.c.context.action = "restore";
  f.c.db.sessions[0].roster = [{ id: "student", name: "Historical name" }];
  await f.c.saveMembership();
  assert.equal(f.cls.students[0].id, "student");
  assert.equal(f.cls.archivedStudents.length, 0);
  assert.equal(f.c.db.sessions[0].roster[0].name, "Historical name");
  assert.equal(f.errors.length, 0);
});
