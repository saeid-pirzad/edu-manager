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

function transferFixture(copy = false) {
  const f = fixture();
  const destination = {
    id: "destination",
    name: "Destination",
    students: [],
    archivedStudents: [],
    lessons: [],
  };
  f.c.context.action = "transfer";
  f.c.findClass = (id) => (id === destination.id ? destination : null);
  f.c.knownStudents = (classroom) => [
    ...classroom.students,
    ...classroom.archivedStudents,
  ];
  f.c.uid = () => "new-student";
  f.c.document.getElementById = (id) =>
    id === "transferTarget" ? { value: destination.id } : { checked: copy };
  f.c.db.schools = [
    { id: "school", name: "School", classes: [f.cls, destination] },
  ];
  f.c.getSchool = () => f.c.db.schools[0];
  f.c.esc = String;
  f.c.handleError = (error) => f.errors.push(error);
  f.c.showModal = (title, html) => {
    f.html = html;
    return true;
  };
  f.c.document.querySelector = () => ({
    closest: () => ({}),
    addEventListener() {},
  });
  return { f, destination };
}
test("transfer preview groups destinations and uses one explicit operation selector", async () => {
  const { f } = transferFixture();
  await f.c.openMembership("transfer", "student");
  assert.equal(f.errors.length, 0);
  assert.match(f.html, /<optgroup label="School">/);
  assert.match(f.html, /id="membershipCopy"/);
  assert.match(f.html, /name="membershipMode" value="transfer" checked/);
  assert.equal((f.html.match(/type="submit"/g) || []).length, 1);
  assert.doesNotMatch(f.html, /data-workspace-action="copy-membership"/);
});
test("transfer preview with no destination hides both operation and submit controls", async () => {
  const { f } = transferFixture();
  f.c.db.schools[0].classes = [f.cls];
  await f.c.openMembership("transfer", "student");
  assert.match(f.html, /کلاس مقصدی وجود ندارد/);
  assert.doesNotMatch(
    f.html,
    /type="submit"|id="transferTarget"|membershipMode/,
  );
});
for (const copy of [false, true]) {
  test(`selected ${copy ? "copy" : "transfer"} preserves source history and applies correct identity semantics`, async () => {
    const { f, destination } = transferFixture(copy);
    const oldScores = JSON.stringify(f.cls.lessons);
    await f.c.saveMembership();
    assert.equal(f.errors.length, 0);
    assert.equal(destination.students[0].id, copy ? "new-student" : "student");
    assert.equal(f.cls.students.length, copy ? 1 : 0);
    assert.equal(JSON.stringify(f.cls.lessons), oldScores);
    assert.equal(destination.lessons.length, 0);
    if (!copy) assert.equal(f.c.db.sessions[0].roster[0].id, "student");
  });
}
