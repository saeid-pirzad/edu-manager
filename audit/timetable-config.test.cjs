"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [],
    controls = {};
  for (const prefix of ["All", "Odd", "Even"])
    for (const field of ["Class", "Lesson"])
      controls["cfg" + prefix + field] = { value: "" };
  controls.cfgAllClass.value = "class";
  controls.cfgAllLesson.value = "lesson";
  const c = vm.createContext({
    workspace: { id: "first" },
    connection: {},
    state: { view: "schedule" },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    db: {
      masterSchedule: {
        "0-0-all": { classId: "old" },
        "1-0-all": { classId: "unrelated" },
      },
      sessions: [{ id: "historical" }],
    },
    document: { getElementById: (id) => controls[id] },
    findClassById: (id) =>
      id === "class"
        ? {
            school: { id: "school" },
            classObj: { lessons: [{ id: "lesson" }] },
          }
        : null,
    assertEntityWritable() {},
    confirm: () => true,
    saveDBV24: async () => effects.push("save"),
    closeModal: () => effects.push("close"),
    render: () => effects.push("render"),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/schedule/actions.js"),
      "utf8",
    ),
    c,
  );
  return { c, effects, controls };
}
for (const choice of ["foreign-lesson", "missing-class", "incomplete"]) {
  test(`invalid later timetable section leaves the entire previous plan unchanged: ${choice}`, async () => {
    const f = fixture();
    f.controls.cfgOddClass.value =
      choice === "missing-class" ? "missing" : "class";
    f.controls.cfgOddLesson.value = choice === "incomplete" ? "" : "foreign";
    const before = JSON.stringify(f.c.db);
    await assert.rejects(f.c.saveMasterConfigV24(0, 0), /کلاس و درس/);
    assert.equal(JSON.stringify(f.c.db), before);
    assert.equal(f.effects.length, 0);
  });
}
test("valid timetable configuration preserves unrelated slots and historical sessions", async () => {
  const f = fixture();
  await f.c.saveMasterConfigV24(0, 0);
  assert.equal(f.c.db.masterSchedule["0-0-all"].schoolId, "school");
  assert.equal(f.c.db.masterSchedule["1-0-all"].classId, "unrelated");
  assert.equal(f.c.db.sessions[0].id, "historical");
  assert.deepEqual(f.effects, ["save", "close", "render"]);
});
test("clearing one slot preserves other slots and sessions", async () => {
  const f = fixture();
  f.c.db.masterSchedule["0-0-even"] = { classId: "class" };
  await f.c.clearMasterConfigV24(0, 0);
  assert.equal(f.c.db.masterSchedule["0-0-all"], undefined);
  assert.equal(f.c.db.masterSchedule["0-0-even"], undefined);
  assert.equal(f.c.db.masterSchedule["1-0-all"].classId, "unrelated");
  assert.equal(f.c.db.sessions.length, 1);
});
test("cancelled timetable clearing does not mutate data", async () => {
  const f = fixture();
  f.c.confirm = () => false;
  const before = JSON.stringify(f.c.db);
  assert.equal(await f.c.clearMasterConfigV24(0, 0), false);
  assert.equal(JSON.stringify(f.c.db), before);
});
for (const [day, period] of [
  [-1, 0],
  [0, 12],
  [0.5, 1],
]) {
  test(`invalid timetable coordinates are rejected: ${day}/${period}`, async () => {
    const f = fixture();
    await assert.rejects(f.c.saveMasterConfigV24(day, period), /معتبر نیست/);
    assert.equal(f.effects.length, 0);
  });
}
for (const kind of ["connection", "dialog"]) {
  test(`late timetable save does not close a changed ${kind}`, async () => {
    const f = fixture();
    f.c.saveDBV24 = async () => {
      if (kind === "connection") f.c.connection = {};
      else f.controls.cfgAllClass = { value: "new" };
    };
    await f.c.saveMasterConfigV24(0, 0);
    assert.equal(f.effects.length, 0);
  });
}
