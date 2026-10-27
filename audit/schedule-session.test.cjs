"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    modals = [];
  const controls = {
    sessNewDate: { value: "2026-10-24" },
    sessNewClass: { value: "class" },
    sessNewLesson: { value: "lesson" },
  };
  const target = {
    school: { id: "school" },
    classObj: {
      lessons: [{ id: "lesson" }],
      students: [{ id: "student", name: "Original" }],
    },
  };
  const c = vm.createContext({
    workspace: { id: "first" },
    connection: {},
    state: { view: "schedule" },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    db: { sessions: [] },
    assertEntityWritable() {},
    document: { getElementById: (id) => controls[id] },
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    findClassById: () => target,
    getDayIdxFromDate: () => 0,
    DAYS: ["Saturday", "Sunday"],
    faDate: (date) => date,
    confirm: () => true,
    alert: () => effects.push("warning"),
    uid: () => "new-session",
    snapshotRoster: (cls) => structuredClone(cls.students),
    saveDBV24: async () => effects.push("save"),
    openSessionModal: (session) => modals.push(session),
    getSessionById: (id) => c.db.sessions.find((session) => session.id === id),
  });
  for (const name of ["sessions/actions.js", "schedule/actions.js"])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/workspace", name), "utf8"),
      c,
    );
  return { c, effects, modals, controls, target };
}
for (const [day, period] of [
  [-1, 0],
  [0, 12],
]) {
  test(`schedule session rejects invalid slot ${day}/${period}`, async () => {
    const f = fixture();
    await assert.rejects(f.c.startSessionFromMasterV24(day, period));
    assert.equal(f.c.db.sessions.length + f.effects.length, 0);
  });
}
for (const missing of ["class", "lesson"]) {
  test(`schedule session rejects missing ${missing} before mutation`, async () => {
    const f = fixture();
    if (missing === "class") f.c.findClassById = () => null;
    else f.controls.sessNewLesson.value = "foreign";
    await assert.rejects(f.c.startSessionFromMasterV24(0, 0), /معتبر نیستند/);
    assert.equal(f.c.db.sessions.length + f.effects.length, 0);
  });
}
test("declined weekday mismatch leaves sessions unchanged", async () => {
  const f = fixture();
  f.c.confirm = () => false;
  assert.equal(await f.c.startSessionFromMasterV24(1, 0), false);
  assert.equal(f.c.db.sessions.length, 0);
});
test("new schedule session snapshots its roster and keeps selected school and lesson", async () => {
  const f = fixture();
  await f.c.startSessionFromMasterV24(0, 0);
  f.target.classObj.students[0].name = "Later";
  assert.equal(f.c.db.sessions[0].roster[0].name, "Original");
  assert.equal(f.c.db.sessions[0].schoolId, "school");
  assert.equal(f.c.db.sessions[0].lessonId, "lesson");
  assert.deepEqual(f.effects, ["save"]);
});
test("existing different-lesson session is preserved rather than overwritten", async () => {
  const f = fixture();
  const existing = {
    id: "existing",
    classId: "class",
    date: "2026-10-24",
    period: 0,
    lessonId: "previous",
    scores: [{ value: 18 }],
  };
  f.c.db.sessions.push(existing);
  await f.c.startSessionFromMasterV24(0, 0);
  assert.equal(f.c.db.sessions.length, 1);
  assert.equal(existing.scores[0].value, 18);
  assert.equal(f.modals[0], existing);
  assert.deepEqual(f.effects, ["warning"]);
});
test("changed selection during draft flush aborts session creation", async () => {
  const f = fixture();
  f.c.flushDrafts = async () => {
    f.controls.sessNewClass.value = "other";
  };
  await assert.rejects(f.c.startSessionFromMasterV24(0, 0), /انتخاب جلسه/);
  assert.equal(f.c.db.sessions.length, 0);
});

test("replaced class control invalidates the original session selection", async () => {
  const f = fixture();
  f.c.flushDrafts = async () => {
    f.controls.sessNewClass = { value: "other" };
  };
  await assert.rejects(f.c.startSessionFromMasterV24(0, 0), /انتخاب جلسه/);
  assert.equal(f.c.db.sessions.length, 0);
});
test("late session creation does not open a modal on a replacement bank", async () => {
  const f = fixture();
  f.c.saveDBV24 = async () => {
    f.c.connection = {};
  };
  await f.c.startSessionFromMasterV24(0, 0);
  assert.equal(f.modals.length, 0);
});
test("concurrent schedule-session submissions do not create duplicates", async () => {
  const f = fixture();
  let release;
  f.c.flushDrafts = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const first = f.c.startSessionFromMasterV24(0, 0);
  assert.equal(await f.c.startSessionFromMasterV24(0, 0), false);
  release();
  await first;
  assert.equal(f.c.db.sessions.length, 1);
});
