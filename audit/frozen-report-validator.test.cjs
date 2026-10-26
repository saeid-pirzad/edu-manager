"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../assets/scripts/frozen-report-validator.js"),
    "utf8",
  ),
  context,
);
const dependencies = {
  assertSafeDataTree: () => {},
  isDataObject: (value) =>
    !!value && typeof value === "object" && !Array.isArray(value),
  isSafeRecordId: (value) =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value),
  // Assessment recalculation is covered by browser tests using real domain math.
  weightedKardanesh: () => {
    throw Error("Unexpected assessment in legacy fixture");
  },
};
const validate = (report) =>
  context.EduFrozenReportValidator.validate(report, dependencies);
const fixture = () => ({
  id: "r1",
  workspace: "w1",
  year: "1405-1406",
  term: "اول",
  at: "2026-10-25T00:00:00Z",
  classes: [
    {
      school: "مدرسه",
      name: "کلاس",
      students: [
        {
          id: "s1",
          name: "هنرجو",
          average: 16,
          lessons: [
            {
              id: "l1",
              name: "درس",
              mode: "kardanesh",
              practical: 18,
              theory: 12,
              final: 16.2,
              passed: true,
            },
          ],
        },
      ],
    },
  ],
});
test("legacy frozen reports validate without adding fabricated assessments", () => {
  const report = fixture(),
    original = JSON.stringify(report);
  assert.equal(validate(report), true);
  assert.equal(JSON.stringify(report), original);
  assert.equal(report.classes[0].students[0].lessons[0].assessments, undefined);
});
test("frozen reports reject invalid scores and malformed dates", () => {
  for (const value of [-1, 21, Infinity, NaN, "18"]) {
    const report = fixture();
    report.classes[0].students[0].lessons[0].final = value;
    assert.throws(() => validate(report));
  }
  const report = fixture();
  report.at = "not-a-date";
  assert.throws(() => validate(report));
});
test("frozen reports reject duplicate student, lesson and module identities", () => {
  const students = fixture();
  students.classes[0].students.push(
    structuredClone(students.classes[0].students[0]),
  );
  assert.throws(() => validate(students));
  const lessons = fixture();
  const student = lessons.classes[0].students[0];
  student.lessons.push(structuredClone(student.lessons[0]));
  assert.throws(() => validate(lessons));
  const modules = fixture();
  modules.classes[0].students[0].lessons[0].modules = [
    { id: "m1", name: "اول" },
    { id: "m1", name: "دوم" },
  ];
  assert.throws(() => validate(modules));
});
