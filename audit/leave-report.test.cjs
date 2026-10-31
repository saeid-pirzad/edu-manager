"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
test("periodic report treats leave as a separate known status", () => {
  const text = fs.readFileSync(
    path.join(__dirname, "../src/reports/periodic/model.js"),
    "utf8",
  );
  const c = vm.createContext({});
  vm.runInContext(
    text.slice(
      text.indexOf("const emptyCounts"),
      text.indexOf("function build("),
    ),
    c,
  );
  const counts = vm.runInContext("emptyCounts()", c);
  const a = c.attendance("leave");
  c.tally(counts, a);
  assert.equal(a.label, "مرخصی");
  assert.equal(counts.leave, 1);
  assert.equal(counts.absent, 0);
  assert.equal(counts.unknown, 0);
});

test("leave is counted in module and student totals without changing the grade", () => {
  const c = vm.createContext({
    ownScoreRecord: (records, id) => records?.[id],
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/grading/calculation.js"),
      "utf8",
    ),
    c,
  );
  const cls = { id: "class" };
  const lesson = {
    id: "lesson",
    weightMostamar: 40,
    weightPayani: 60,
    poudmans: [
      {
        id: "module",
        units: [
          {
            id: "unit",
            unitScores: { student: { m: 16, p: 18 } },
            applyOptions: {
              present: true,
              late: true,
              pos: true,
              neg: true,
              hw: true,
            },
          },
        ],
      },
    ],
  };
  const source = { sessions: [] };
  const before = c.calcStudentLessonBase(cls, lesson, "student", source);
  source.sessions.push({
    id: "session",
    classId: "class",
    lessonId: "lesson",
    date: "2026-10-31",
    period: 0,
    poudmanId: "module",
    unitId: "unit",
    attendance: { student: "leave" },
    scores: [],
  });
  const after = c.calcStudentLessonBase(cls, lesson, "student", source);
  assert.equal(after.att.leave, 1);
  assert.equal(after.att.present + after.att.absent + after.att.late, 0);
  assert.equal(after.details.module.unit.att.leave, 1);
  assert.equal(after.final, before.final);
});
