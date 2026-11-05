"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const calls = [];
  const c = vm.createContext({
    workspace: { id: "second", year: "1405-1406" },
    knownStudents: (classroom) => [
      ...classroom.students,
      ...(classroom.archivedStudents || []),
    ],
    assertAnnualLessonCompatibility: () => {},
    individualKarnameh: (classroom, options) => {
      calls.push({ classroom, options });
      return options.student.name;
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/reports/student.js"),
      "utf8",
    ),
    c,
  );
  const parts = ["first", "second"].map((id) => ({
    period: { id },
    data: {
      schools: [
        {
          id: "school",
          name: "SCHOOL",
          classes: [
            {
              id: "class",
              name: id,
              students: [
                { id: "a", name: "SELECTED" },
                { id: "b", name: "PRIVATE" },
              ],
              archivedStudents:
                id === "first" ? [{ id: "old", name: "ARCHIVED" }] : [],
              lessons: [{ id, name: id }],
            },
          ],
        },
        {
          id: "other",
          name: "PRIVATE_SCHOOL",
          classes: [
            {
              id: "class",
              students: [{ id: "other", name: "PRIVATE_OTHER" }],
              lessons: [],
            },
          ],
        },
      ],
    },
  }));
  return { c, calls, parts };
}
test("embedded parent grades call the actual karnameh renderer with selected pupil and annual snapshot only", () => {
  const { c, calls, parts } = fixture();
  const before = JSON.stringify(parts);
  const html = c.periodicKarnamehHtml(parts, {
    schoolId: "school",
    classId: "class",
    student: { id: "a", name: "SELECTED" },
  });
  assert.equal(html, "SELECTED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.parts, parts);
  assert.equal(calls[0].options.embedded, true);
  assert.equal(calls[0].classroom.name, "second");
  assert.deepEqual(
    Array.from(calls[0].classroom.lessons, (row) => row.id),
    ["second", "first"],
  );
  assert.equal(JSON.stringify(parts), before);
});
test("annual management karnameh retains archived pupils once and excludes other schools", () => {
  const { c, calls, parts } = fixture();
  const html = c.periodicKarnamehHtml(parts, { schoolId: "school" });
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map((call) => call.options.student.id)).size, 3);
  assert.ok(html.includes("ARCHIVED"));
  assert.ok(!html.includes("PRIVATE_OTHER"));
});
