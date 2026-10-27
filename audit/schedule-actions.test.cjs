"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const effects = [];
  const c = vm.createContext({
    workspace: { id: "first" },
    connection: {},
    state: { view: "schedule" },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    db: {
      periods: 6,
      activeDays: [0, 1],
      masterSchedule: {},
      sessions: [{ id: "historical", period: 5 }],
    },
    assertEntityWritable() {},
    saveDBV24: async () => effects.push("save"),
    render: () => effects.push("render"),
    alert: () => effects.push("warning"),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/actions.js"),
      "utf8",
    ),
    c,
  );
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/schedule/actions.js"),
      "utf8",
    ),
    c,
  );
  return { c, effects };
}
for (const day of [-1, 7, 1.5, "1"]) {
  test(`invalid active day does not mutate data: ${day}`, async () => {
    const f = fixture();
    await assert.rejects(f.c.toggleActiveDayV24(day));
    assert.deepEqual(Array.from(f.c.db.activeDays), [0, 1]);
    assert.equal(f.effects.length, 0);
  });
}
for (const delta of [0.5, "1"]) {
  test(`invalid period delta is rejected before saving: ${delta}`, async () => {
    const f = fixture();
    await assert.rejects(f.c.changePeriodsV24(delta));
    assert.equal(f.c.db.periods, 6);
    assert.equal(f.effects.length, 0);
  });
}
test("occupied timetable blocks shrinking periods without changing historical sessions", async () => {
  const f = fixture();
  f.c.db.masterSchedule["0-5"] = { classId: "class" };
  assert.equal(await f.c.changePeriodsV24(-1), false);
  assert.equal(f.c.db.periods, 6);
  assert.deepEqual(f.effects, ["warning"]);
  assert.equal(f.c.db.sessions[0].period, 5);
});
test("shrinking empty timetable keeps historical sessions in their original periods", async () => {
  const f = fixture();
  assert.equal(await f.c.changePeriodsV24(-1), true);
  assert.equal(f.c.db.periods, 5);
  assert.equal(f.c.db.sessions[0].period, 5);
});
test("active-day changes do not delete timetable entries or historical sessions", async () => {
  const f = fixture();
  f.c.db.masterSchedule["0-0"] = { classId: "class" };
  await f.c.toggleActiveDayV24(0);
  assert.deepEqual(Array.from(f.c.db.activeDays), [1]);
  assert.equal(Object.keys(f.c.db.masterSchedule).length, 1);
  assert.equal(f.c.db.sessions.length, 1);
});
test("late schedule completion does not rerender a replacement bank", async () => {
  const f = fixture();
  f.c.saveDBV24 = async () => {
    f.c.connection = {};
  };
  await f.c.changePeriodsV24(1);
  assert.equal(f.effects.length, 0);
});
test("period bounds avoid unnecessary writes", async () => {
  const f = fixture();
  f.c.db.periods = 12;
  assert.equal(await f.c.changePeriodsV24(1), false);
  assert.equal(f.effects.length, 0);
});

function weekFixture() {
  const f = fixture();
  f.c.db.settings = { weekStartDate: "2026-10-24" };
  f.c.document = { getElementById: () => ({ value: "2026-10-31" }) };
  return f;
}
test("invalid week origin is rejected before changing settings", async () => {
  const f = weekFixture();
  f.c.document.getElementById = () => ({ value: "2026-02-30" });
  await assert.rejects(f.c.saveWeekStartDateV24(), /تاریخ معتبر/);
  assert.equal(f.c.db.settings.weekStartDate, "2026-10-24");
  assert.equal(f.effects.length, 0);
});
test("week origin changes do not rewrite timetable entries or historical sessions", async () => {
  const f = weekFixture();
  f.c.db.masterSchedule["0-0-odd"] = { classId: "class" };
  const before = JSON.stringify([f.c.db.masterSchedule, f.c.db.sessions]);
  assert.equal(await f.c.saveWeekStartDateV24(), true);
  assert.equal(f.c.db.settings.weekStartDate, "2026-10-31");
  assert.equal(
    JSON.stringify([f.c.db.masterSchedule, f.c.db.sessions]),
    before,
  );
  assert.deepEqual(f.effects, ["save", "render", "warning"]);
});
test("late week-origin save does not show success or render a replacement bank", async () => {
  const f = weekFixture();
  f.c.saveDBV24 = async () => {
    f.c.connection = {};
  };
  await f.c.saveWeekStartDateV24();
  assert.equal(f.effects.length, 0);
});
test("unchanged week origin avoids unnecessary persistence", async () => {
  const f = weekFixture();
  f.c.document.getElementById = () => ({ value: "2026-10-24" });
  assert.equal(await f.c.saveWeekStartDateV24(), false);
  assert.equal(f.effects.length, 0);
});
test("read-only period cannot change its week origin", async () => {
  const f = weekFixture();
  f.c.assertEntityWritable = () => {
    throw Error("closed");
  };
  await assert.rejects(f.c.saveWeekStartDateV24(), /closed/);
  assert.equal(f.c.db.settings.weekStartDate, "2026-10-24");
});
