"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const c = vm.createContext({ Map });
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/domain/session-slots.js"),
    "utf8",
  ),
  c,
);
const model = c.EduSessionSlots,
  schoolLesson = {
    schoolId: "school",
    classId: "classroom",
    lessonId: "lesson",
  },
  meta = (extra = {}) => ({
    settings: { weekStartDate: "2026-10-24" },
    activeDays: [0, 1, 2, 3, 4, 5],
    periods: 6,
    masterSchedule: { "3-0-all": { ...schoolLesson } },
    ...extra,
  }),
  session = (extra = {}) => ({
    id: "meeting",
    ...schoolLesson,
    date: "2026-10-27",
    period: 0,
    attendance: {},
    scores: [],
    ...extra,
  }),
  changes = (current = session(), previous = null, restoredRecords = null) =>
    model.changes({
      changed: [["session:" + current.id, JSON.stringify(current)]],
      before: [{ key: "session:" + current.id, value: previous }],
      removed: [],
      restoredRecords,
    }),
  invalid = (error) => error.code === "SESSION_OUTSIDE_SCHEDULE";

test("week parity uses Saturday boundaries, including preceding weeks and the year's boundary", () => {
  const source = meta();
  for (const [date, parity] of [
    ["2026-10-24", "odd"],
    ["2026-10-30", "odd"],
    ["2026-10-17", "even"],
    ["2026-10-31", "even"],
    ["2026-11-07", "odd"],
  ])
    assert.equal(model.weekParity(source, date), parity, date);
  assert.equal(
    model.weekParity(
      meta({ settings: { weekStartDate: "2026-12-26" } }),
      "2027-01-02",
    ),
    "even",
  );
});

test("a non-Saturday reference normalizes to its containing week without DST-dependent arithmetic", () => {
  const source = meta({ settings: { weekStartDate: "2026-03-27" } });
  assert.equal(model.weekParity(source, "2026-03-21"), "odd");
  assert.equal(model.weekParity(source, "2026-03-28"), "even");
  assert.equal(model.weekParity(source, "2026-03-14"), "even");
});

test("missing week origin uses the explicit local-today reference consistently", () => {
  const source = meta({ settings: {} });
  assert.equal(model.weekParity(source, "2026-10-24", "2026-10-31"), "even");
  assert.equal(model.weekParity(source, undefined, "2026-10-31"), "odd");
  assert.equal(model.weekParity(source, "2026-11-07", "2026-10-31"), "even");
});

test("canonical date checks reject impossible dates and timestamps rather than normalizing them", () => {
  for (const date of [
    "2026-02-30",
    "2026-13-01",
    "2026-2-01",
    "2026-10-27T00:00:00Z",
    "",
    null,
  ]) {
    assert.throws(() => model.weekParity(meta(), date || "invalid"), invalid);
    assert.deepEqual(
      Array.from(model.matchingPeriods(meta(), { ...schoolLesson, date })),
      [],
    );
    assert.throws(
      () => model.assertScheduled(changes(session({ date })), meta()),
      invalid,
    );
  }
});

test("alternating entries override weekly fallback for the actual date's week only", () => {
  const override = {
    schoolId: "school",
    classId: "other-class",
    lessonId: "other-lesson",
  };
  const source = meta({
    masterSchedule: {
      "3-0-all": { ...schoolLesson },
      "3-0-odd": override,
    },
  });
  assert.equal(model.entry(source, 3, 0, "2026-10-27"), override);
  assert.equal(model.entry(source, 3, 0, "2026-11-03").classId, "classroom");
  assert.throws(() => model.assertScheduled(changes(), source), invalid);
  assert.doesNotThrow(() =>
    model.assertScheduled(changes(session({ date: "2026-11-03" })), source),
  );
});

test("matching periods contain only sorted bells for this exact school class and lesson", () => {
  const source = meta({
    masterSchedule: {
      "3-4-all": { ...schoolLesson },
      "3-0-all": { ...schoolLesson },
      "3-1-all": { ...schoolLesson, lessonId: "other-lesson" },
      "3-2-all": { ...schoolLesson, classId: "other-class" },
      "3-3-all": { ...schoolLesson, schoolId: "other-school" },
    },
  });
  assert.deepEqual(
    Array.from(model.matchingPeriods(source, session())),
    [0, 4],
  );
  for (const period of [1, 2, 3])
    assert.throws(
      () => model.assertScheduled(changes(session({ period })), source),
      invalid,
    );
  assert.doesNotThrow(() =>
    model.assertScheduled(changes(session({ period: 4 })), source),
  );
});

test("a lesson scheduled on Tuesday cannot be created on Wednesday or in a different bell", () => {
  assert.throws(
    () =>
      model.assertScheduled(changes(session({ date: "2026-10-28" })), meta()),
    invalid,
  );
  assert.throws(
    () => model.assertScheduled(changes(session({ period: 1 })), meta()),
    (error) => invalid(error) && /زنگ 1/.test(error.message),
  );
});

test("inactive days and configured bell limits override dormant schedule entries", () => {
  const source = meta({
    activeDays: [0],
    periods: 1,
    masterSchedule: {
      "3-0-all": { ...schoolLesson },
      "0-1-all": { ...schoolLesson },
    },
  });
  assert.throws(
    () => model.assertScheduled(changes(), source),
    (error) => invalid(error) && /روز انتخاب‌شده/.test(error.message),
  );
  assert.throws(
    () =>
      model.assertScheduled(
        changes(session({ date: "2026-10-24", period: 1 })),
        source,
      ),
    (error) => invalid(error) && /تعداد زنگ/.test(error.message),
  );
  assert.deepEqual(Array.from(model.matchingPeriods(source, session())), []);
});

test("default active weekdays and six bells apply only when their settings are absent", () => {
  const source = {
    settings: { weekStartDate: "2026-10-24" },
    masterSchedule: {
      "3-5-all": { ...schoolLesson },
      "3-6-all": { ...schoolLesson },
      "6-0-all": { ...schoolLesson },
    },
  };
  assert.doesNotThrow(() =>
    model.assertScheduled(changes(session({ period: 5 })), source),
  );
  assert.throws(
    () => model.assertScheduled(changes(session({ period: 6 })), source),
    invalid,
  );
  assert.throws(
    () =>
      model.assertScheduled(changes(session({ date: "2026-10-30" })), source),
    invalid,
  );
  assert.throws(
    () => model.assertScheduled(changes(), { ...source, activeDays: [] }),
    invalid,
  );
});

test("Friday and the twelfth bell are valid only when explicitly configured", () => {
  const source = meta({
    activeDays: [6],
    periods: 12,
    masterSchedule: { "6-11-all": { ...schoolLesson } },
  });
  assert.doesNotThrow(() =>
    model.assertScheduled(
      changes(session({ date: "2026-10-30", period: 11 })),
      source,
    ),
  );
  assert.deepEqual(
    Array.from(model.matchingPeriods(source, session({ date: "2026-10-30" }))),
    [11],
  );
});

test("empty schedules, missing identities and prototype entries never authorize a new session", () => {
  assert.throws(
    () => model.assertScheduled(changes(), meta({ masterSchedule: {} })),
    invalid,
  );
  assert.throws(() => model.assertScheduled(changes(), undefined), invalid);
  for (const field of ["schoolId", "classId", "lessonId"])
    assert.throws(
      () => model.assertScheduled(changes(session({ [field]: "" })), meta()),
      invalid,
    );
  const inherited = Object.create({ "3-0-all": { ...schoolLesson } });
  assert.equal(
    model.entry(meta({ masterSchedule: inherited }), 3, 0, "2026-10-27"),
    null,
  );
  assert.throws(
    () => model.assertScheduled(changes(), meta({ masterSchedule: inherited })),
    invalid,
  );
});

test("attendance and activity corrections leave existing off-schedule history usable", () => {
  const previous = session({ date: "2026-10-28" }),
    current = {
      ...previous,
      attendance: { student: "leave" },
      scores: [{ studentId: "student", type: "classGrade", value: 19 }],
    };
  const edited = changes(current, previous);
  assert.equal(edited.guarded.length, 0);
  assert.doesNotThrow(() =>
    model.assertScheduled(edited, meta({ masterSchedule: {} })),
  );
  assert.throws(
    () =>
      model.assertScheduled(
        changes({ ...current, period: 1 }, previous),
        meta(),
      ),
    invalid,
  );
});

test("retargeting a historical session's lesson or school requires a matching destination entry", () => {
  const previous = session();
  for (const extra of [
    { lessonId: "other-lesson" },
    { schoolId: "other-school" },
  ]) {
    const edited = changes({ ...previous, ...extra }, previous);
    assert.equal(edited.guarded.length, 1);
    assert.throws(() => model.assertScheduled(edited, meta()), invalid);
  }
});

test("only exact trusted undo records may restore an off-schedule historical slot", () => {
  const historical = session({ date: "2026-10-28" }),
    previous = session();
  const trusted = new Map([["session:meeting", historical]]);
  assert.doesNotThrow(() =>
    model.assertScheduled(changes(historical, previous, trusted), meta()),
  );
  assert.throws(
    () =>
      model.assertScheduled(
        changes(
          { ...historical, attendance: { student: "present" } },
          previous,
          trusted,
        ),
        meta(),
      ),
    invalid,
  );
});

test("schedule checks do not mutate inputs or disclose another class's identifying details", () => {
  const source = meta({
    masterSchedule: {
      "3-0-all": {
        schoolId: "SECRET_SCHOOL",
        classId: "SECRET_CLASS",
        lessonId: "SECRET_LESSON",
      },
    },
  });
  const change = changes(),
    before = JSON.stringify({ source, change });
  assert.throws(
    () => model.assertScheduled(change, source),
    (error) => invalid(error) && !/SECRET/.test(error.message),
  );
  assert.equal(JSON.stringify({ source, change }), before);
});
