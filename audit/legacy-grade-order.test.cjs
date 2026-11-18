"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const context = vm.createContext({
    ownScoreRecord: (records, id) => records?.[id] || {},
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/grading/calculation.js"),
      "utf8",
    ),
    context,
  );
  const classroom = { id: "class" },
    lesson = {
      id: "lesson",
      poudmans: [
        {
          id: "module",
          units: [{ id: "unit", unitScores: {} }],
        },
      ],
    },
    session = (id, period, scores, overrides = {}) => ({
      id,
      classId: "class",
      lessonId: "lesson",
      date: "2026-11-18",
      period,
      poudmanId: "module",
      unitId: "unit",
      attendance: { student: "present" },
      scores,
      ...overrides,
    }),
    score = (type, value, studentId = "student") => ({
      studentId,
      type,
      value,
    }),
    read = (sessions) =>
      context.calcStudentLessonBase(classroom, lesson, "student", {
        sessions,
      });
  return { lesson, session, score, read };
}

test("legacy grades retain session and last-entry priority, grouped zero, and reverse summation order", () => {
  const { lesson, session, score, read } = fixture(),
    sessions = [
      session("a", 0, [score("mostamar", 8), score("payani", 9)]),
      session("z", 1, [score("mostamar", 11), score("payani", 12)]),
      session("a", 1, [score("mostamar", 13), score("payani", 14)]),
      session("older", 4, [score("mostamar", 17), score("payani", 18)], {
        date: "2026-11-17",
      }),
      session(
        "newer",
        0,
        [
          score("mostamar", 15),
          score("payani", 16),
          score("mostamar", 0),
          score("payani", 19),
          score("positive", 1),
          score("positive", Number.EPSILON / 2),
          score("positive", Number.EPSILON / 2),
          score("negative", 1),
          score("negative", Number.EPSILON / 2),
          score("negative", Number.EPSILON / 2),
          score("positive", 20, "another-student"),
          score("homework", null),
        ],
        { date: "2026-11-19", attendance: { student: "late:5" } },
      ),
      session("unrelated", 5, [score("mostamar", 20)], {
        classId: "another-class",
      }),
    ],
    before = structuredClone(sessions),
    result = read(sessions),
    unit = result.details.module.unit;
  assert.equal(unit.m, 0);
  assert.equal(unit.p, 19);
  assert.equal(unit.posSum, 1 + Number.EPSILON);
  assert.equal(unit.negSum, 1 + Number.EPSILON);
  assert.equal(result.posCount, 3);
  assert.equal(result.negCount, 3);
  assert.equal(result.hwCount, 1);
  assert.equal(unit.att.present, 4);
  assert.equal(unit.att.late, 1);
  assert.equal(result.final, 11.4);
  assert.deepEqual(sessions, before);

  lesson.poudmans[0].units[0].unitScores.student = { m: 0, p: 0 };
  assert.equal(read(sessions).final, 0);
  assert.equal(read(sessions.slice(0, 3)).details.module.unit.m, 0);
  delete lesson.poudmans[0].units[0].unitScores.student;
  assert.equal(read(sessions.slice(0, 3)).details.module.unit.m, 11);
});

test("legacy score priority preserves distinct null and undefined fallback behavior", () => {
  const { session, score, read } = fixture();
  for (const value of [null, undefined]) {
    const result = read([
      session("session", 0, [
        score("mostamar", 7),
        score("mostamar", value),
        score("payani", 0),
      ]),
    ]);
    assert.equal(result.details.module.unit.m, value === null ? 7 : undefined);
    assert.equal(result.details.module.unit.p, 0);
  }
});
