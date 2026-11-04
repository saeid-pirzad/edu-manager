"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({ Map });
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/domain/session-slots.js"),
    "utf8",
  ),
  context,
);
const model = context.EduSessionSlots,
  meeting = (extra = {}) => ({
    id: "meeting",
    classId: "classroom",
    lessonId: "lesson",
    date: "2026-10-27",
    period: 0,
    attendance: {},
    scores: [],
    ...extra,
  }),
  change = (current, previous = null, restoredRecords = null) =>
    model.changes({
      changed: [["session:" + current.id, JSON.stringify(current)]],
      before: [{ key: "session:" + current.id, value: previous }],
      removed: [],
      restoredRecords,
    }),
  part = (id, sessions) => ({
    id,
    records: new Map(sessions.map((value) => ["session:" + value.id, value])),
  }),
  conflict = (error) => error.code === "ACADEMIC_SESSION_SLOT_CONFLICT";

test("the same class/date/bell is unique across terms regardless of lesson or session identity", () => {
  for (const lessonId of ["lesson", "other-lesson"])
    assert.throws(
      () =>
        model.assertAvailable(change(meeting()), "second", [
          part("first", [meeting({ id: "older", lessonId })]),
          part("second", []),
        ]),
      conflict,
    );
});
for (const [key, value] of [
  ["date", "2026-10-28"],
  ["period", 1],
])
  test(`a distinct ${key} does not conflict with the peer term`, () => {
    model.assertAvailable(change(meeting()), "second", [
      part("first", [meeting({ id: "older", [key]: value })]),
      part("second", []),
    ]);
  });
test("another class or school cannot claim the teacher's date and bell in a peer term", () => {
  for (const peer of [
    meeting({ id: "older", classId: "another-class" }),
    meeting({
      id: "older",
      classId: "another-class",
      schoolId: "another-school",
    }),
  ])
    assert.throws(
      () =>
        model.assertAvailable(change(meeting()), "second", [
          part("first", [peer]),
          part("second", []),
        ]),
      conflict,
    );
});
test("a date or bell correction into a peer slot is rejected", () => {
  for (const previous of [
    meeting({ date: "2026-10-28" }),
    meeting({ period: 1 }),
  ])
    assert.throws(
      () =>
        model.assertAvailable(change(meeting(), previous), "second", [
          part("first", [meeting({ id: "older" })]),
          part("second", [previous]),
        ]),
      conflict,
    );
});
test("existing legacy overlaps remain editable without rewriting their physical slot", () => {
  const previous = meeting(),
    current = meeting({
      attendance: { student: "late:10" },
      scores: [{ studentId: "student", type: "activity", value: 7 }],
    });
  const changes = change(current, previous);
  assert.equal(changes.guarded.length, 0);
  model.assertAvailable(changes, "second", [
    part("first", [meeting({ id: "older" })]),
    part("second", [previous]),
  ]);
});
test("only an exact validated historical record is exempt when undo restores an old overlap", () => {
  const restored = meeting(),
    previous = meeting({ date: "2026-10-28" }),
    records = new Map([["session:meeting", restored]]);
  assert.equal(change(restored, previous, records).guarded.length, 0);
  assert.equal(
    change(meeting({ attendance: { student: "present" } }), previous, records)
      .guarded.length,
    1,
  );
  assert.equal(change(restored, previous, new Map()).guarded.length, 1);
});
test("a valid batch swap checks final slots instead of falsely conflicting with its old records", () => {
  const a = meeting({ id: "a" }),
    b = meeting({ id: "b", period: 1 }),
    changes = model.changes({
      changed: [
        ["session:a", JSON.stringify({ ...a, period: 1 })],
        ["session:b", JSON.stringify({ ...b, period: 0 })],
      ],
      before: [
        { key: "session:a", value: a },
        { key: "session:b", value: b },
      ],
      removed: [],
    });
  model.assertAvailable(changes, "first", [part("first", [a, b])]);
});
test("a deleted source slot does not cause a false conflict for its replacement", () => {
  const changes = model.changes({
    changed: [["session:meeting", JSON.stringify(meeting())]],
    before: [{ key: "session:meeting", value: null }],
    removed: ["session:older"],
  });
  model.assertAvailable(changes, "first", [
    part("first", [meeting({ id: "older" })]),
  ]);
});
test("the guard never mutates caller snapshots and its error discloses no peer names or marks", () => {
  const parts = [
      part("first", [meeting({ id: "older", privateName: "SECRET" })]),
      part("second", []),
    ],
    before = JSON.stringify(parts.map((p) => [...p.records]));
  assert.throws(
    () => model.assertAvailable(change(meeting()), "second", parts),
    (error) => {
      assert.doesNotMatch(error.message, /SECRET|older/);
      return conflict(error);
    },
  );
  assert.equal(JSON.stringify(parts.map((p) => [...p.records])), before);
});

test("retargeting a lesson or school is guarded even when its physical date and bell are unchanged", () => {
  const previous = meeting({ schoolId: "school" });
  for (const extra of [
    { schoolId: "other-school" },
    { lessonId: "other-lesson" },
  ]) {
    const current = { ...previous, ...extra };
    assert.equal(change(current, previous).guarded.length, 1);
    assert.equal(
      change(current, previous, new Map([["session:meeting", current]])).guarded
        .length,
      0,
    );
  }
});
