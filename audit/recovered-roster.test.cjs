"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const student = {
      id: "lost",
      name: "دانش‌آموز بازیابی‌شده (lost)",
      code: "001",
      recovered: true,
    },
    ordinary = { id: "real", name: "نام واقعی تاریخی", code: "002" },
    cls = { id: "class", students: [student, ordinary], archivedStudents: [] },
    db = {
      schools: [{ classes: [cls] }],
      sessions: [],
      migrationWarnings: [
        "نام دانش‌آموز lost در کلاس نیازمند بررسی است.",
        "هشدار مستقل",
      ],
    },
    c = vm.createContext({
      structuredClone,
      db,
      knownStudents: (classroom) => [
        ...classroom.students,
        ...classroom.archivedStudents,
      ],
    });
  for (const file of [
    "legacy/students/roster.js",
    "workspace/students/editor.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  return { c, cls, student, ordinary, db };
}

test("new session roster preserves only explicit recovered identity provenance", () => {
  const f = fixture(),
    before = JSON.stringify(f.cls);
  const roster = f.c.snapshotRoster(f.cls);
  assert.equal(roster[0].recovered, true);
  assert.equal(Object.hasOwn(roster[1], "recovered"), false);
  assert.equal(JSON.stringify(f.cls), before);
  roster[0].name = "independent snapshot";
  assert.notEqual(roster[0].name, f.student.name);
});

test("repair after restored student's new session updates placeholders, not genuine historical names", () => {
  const f = fixture();
  f.db.sessions.push(
    { id: "new-session", classId: f.cls.id, roster: f.c.snapshotRoster(f.cls) },
    {
      id: "real-history",
      classId: f.cls.id,
      roster: [{ id: f.student.id, name: "نام واقعی ثبت‌شدهٔ گذشته" }],
    },
  );
  f.c.applyStudentIdentity(f.cls, f.student, {
    name: "نام اصلاح‌شده",
    code: "001",
  });
  assert.equal(f.db.sessions[0].roster[0].name, "نام اصلاح‌شده");
  assert.equal(f.db.sessions[0].roster[0].recovered, false);
  assert.equal(f.db.sessions[1].roster[0].name, "نام واقعی ثبت‌شدهٔ گذشته");
  assert.deepEqual(f.db.migrationWarnings, ["هشدار مستقل"]);
});

test("freezing an empty legacy session roster keeps recovered provenance for later repair", () => {
  const f = fixture();
  const roster = f.c.historicalRoster(f.cls, { attendance: {}, scores: [] });
  assert.equal(roster[0].recovered, true);
});
