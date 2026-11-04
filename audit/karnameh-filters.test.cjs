const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function fixture(filter = {}) {
  const c = vm.createContext({
    db: {
      schools: [
        {
          id: "school-a",
          name: "School A",
          classes: [
            {
              id: "class-a",
              name: "Class A",
              students: [{ id: "active-a", name: "Active A" }],
              archivedStudents: [{ id: "archived-a", name: "Archived A" }],
            },
          ],
        },
        {
          id: "school-b",
          name: "School B",
          classes: [
            {
              id: "class-b",
              name: "Class B",
              students: [{ id: "active-b", name: "Active B" }],
              archivedStudents: [],
            },
          ],
        },
      ],
    },
    karnamehFilter: { schoolId: "", classId: "", studentId: "", ...filter },
    esc: (value) =>
      String(value).replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
    getSortedStudents: (classroom) => classroom.students,
    render() {},
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/reports/student.js"),
      "utf8",
    ),
    c,
  );
  return c;
}
test("student report selection is disabled until a class is selected", () => {
  const c = fixture();
  const html = c.renderKarnamehTabHtml();
  assert.match(html, /id="karnamehStudent"[^>]*disabled/);
  assert.doesNotMatch(html, /Active A|Active B|Archived A/);
  assert.match(html, /<optgroup label="School A">/);
});
test("class-scoped report selector shows only its students and distinguishes archived identities", () => {
  const c = fixture({ classId: "class-a", studentId: "archived-a" });
  const html = c.renderKarnamehTabHtml();
  assert.match(html, /Archived A — بایگانی/);
  assert.match(html, /Active A/);
  assert.doesNotMatch(html, /Active B/);
  assert.equal(c.karnamehFilter.studentId, "archived-a");
});
test("stale class or foreign student filters cannot survive a school change", () => {
  const c = fixture({
    schoolId: "school-b",
    classId: "class-a",
    studentId: "active-a",
  });
  c.renderKarnamehTabHtml();
  assert.equal(c.karnamehFilter.classId, "");
  assert.equal(c.karnamehFilter.studentId, "");
  c.karnamehFilter.classId = "class-b";
  c.karnamehFilter.studentId = "active-a";
  c.renderKarnamehTabHtml();
  assert.equal(c.karnamehFilter.studentId, "active-b");
});
test("switching class clears the previously selected individual report", () => {
  const c = fixture({ classId: "class-a", studentId: "active-a" });
  c.updateKarnamehFilter("classId", "class-b");
  assert.equal(c.karnamehFilter.studentId, "");
  c.updateKarnamehFilter("schoolId", "school-a");
  assert.equal(c.karnamehFilter.classId, "");
});

test("selecting a class automatically opens its first active student", () => {
  const c = fixture({ classId: "class-a" });
  const html = c.renderKarnamehTabHtml();
  assert.equal(c.karnamehFilter.studentId, "active-a");
  assert.match(html, /value="active-a" selected/);
});

test("a class with only archived students does not automatically open an archived sheet", () => {
  const c = fixture({ classId: "class-a" });
  c.db.schools[0].classes[0].students = [];
  const html = c.renderKarnamehTabHtml();
  assert.equal(c.karnamehFilter.studentId, "");
  assert.match(html, /Archived A/);
});
