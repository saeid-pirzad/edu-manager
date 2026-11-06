"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(sessionSchedule = false) {
  const effects = [];
  const values = {
    cfgAllClass: "class",
    cfgAllLesson: "lesson",
    cfgOddClass: "",
    cfgOddLesson: "",
    cfgEvenClass: "",
    cfgEvenLesson: "",
    sessNewDate: "2026-10-24",
    sessNewClass: "class",
    sessNewLesson: "lesson",
    weekStartInput: "2026-10-31",
  };
  const controls = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { value }]),
  );
  const target = {
    school: { id: "school" },
    classObj: { lessons: [{ id: "lesson" }], students: [{ id: "student" }] },
  };
  const c = vm.createContext({
    captureSaveFeedback: () => null,
    captureSessionEditRecovery: () => null,
    rebindSessionEditAfterRollback: () => false,
    invalidateSessionEditRecovery() {},
    workspace: { id: "first", year: "1405-1406", revision: 1 },
    connection: {},
    state: { view: "schedule" },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    fileMode: false,
    db: {
      settings: { weekStartDate: "2026-10-24" },
      activeDays: [0, 1],
      periods: 6,
      masterSchedule: {
        "0-0-all": sessionSchedule
          ? { schoolId: "school", classId: "class", lessonId: "lesson" }
          : { classId: "old" },
      },
      sessions: [],
    },
    writer: Promise.resolve(),
    busy: 0,
    writeFailureGeneration: 0,
    assertEntityWritable() {},
    assertSessionEditable: () => {
      c.assertEntityWritable();
      return "isolated-edit-lease";
    },
    isSessionEditable: () => true,
    paintStatus() {},
    checkScope() {},
    refreshAcademicYearWarnings() {},
    flushDrafts: async () => {},
    collectRecords: (value) => value,
    scheduleSingleFile() {},
    render: () => effects.push("render"),
    closeModal: () => effects.push("close"),
    alert: () => effects.push("alert"),
    openSessionModal: () => effects.push("session"),
    openNewSessionDialogV24: () => effects.push("session"),
    setStatus() {},
    document: { getElementById: (id) => controls[id] },
    confirm: () => true,
    findClassById: () => target,
    snapshotRoster: (cls) => structuredClone(cls.students),
    getSessionById: (id) => c.db.sessions.find((row) => row.id === id),
    uid: () => "session-id",
    getDayIdxFromDate: () => 0,
  });
  for (const source of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/session-slots.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
      c,
    );
  for (const file of [
    "sessions/actions.js",
    "schedule/actions.js",
    "data/save.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/workspace", file), "utf8"),
      c,
    );
  let durable = structuredClone(c.db),
    attempts = 0;
  c.readWorkspaceSnapshot = async () => ({
    period: { ...c.workspace },
    data: structuredClone(durable),
  });
  c.commitRecords = async () => {
    if (++attempts === 1) throw Error("injected quota");
    durable = structuredClone(c.db);
    c.workspace.revision++;
  };
  return {
    c,
    effects,
    target,
    controls,
    durable: () => durable,
    attempts: () => attempts,
  };
}
for (const operation of ["save-slot", "session"])
  test(`schedule ${operation} roster preflight does not enter the writer or alter durable data`, async () => {
    const f = fixture(operation === "session"),
      before = JSON.stringify(f.c.db);
    f.target.classObj.students = [];
    const run = () =>
      operation === "save-slot"
        ? f.c.saveMasterConfigV24(0, 0)
        : f.c.startSessionFromMasterV24(0, 0);
    await assert.rejects(run(), /ابتدا هنرجویان/);
    assert.equal(JSON.stringify(f.c.db), before);
    assert.equal(JSON.stringify(f.durable()), before);
    assert.equal(f.attempts(), 0);
    assert.equal(f.effects.length, 0);
    assert.equal(f.c.busy, 0);
    // Once students are registered, retain the existing atomic rollback and
    // retry path rather than consuming or bypassing its first write failure.
    f.target.classObj.students = [{ id: "student" }];
    await assert.rejects(run(), /injected quota/);
    assert.equal(f.attempts(), 1);
    assert.equal(JSON.stringify(f.c.db), before);
    assert.equal(JSON.stringify(f.durable()), before);
    await run();
    assert.equal(f.attempts(), 2);
    assert.equal(JSON.stringify(f.c.db), JSON.stringify(f.durable()));
    assert.notEqual(JSON.stringify(f.durable()), before);
    assert.equal(f.c.busy, 0);
  });
for (const operation of [
  "save-slot",
  "clear-slot",
  "active-day",
  "periods",
  "week-origin",
  "session",
]) {
  test(`schedule ${operation} restores durable data on failure and retries without partial writes`, async () => {
    const f = fixture(operation === "session");
    const run = () => {
      if (operation === "save-slot") return f.c.saveMasterConfigV24(0, 0);
      if (operation === "clear-slot") return f.c.clearMasterConfigV24(0, 0);
      if (operation === "active-day") return f.c.toggleActiveDayV24(0);
      if (operation === "periods") return f.c.changePeriodsV24(1);
      if (operation === "week-origin") return f.c.saveWeekStartDateV24();
      return f.c.startSessionFromMasterV24(0, 0);
    };
    const before = JSON.stringify(f.c.db);
    await assert.rejects(run(), /injected quota/);
    assert.equal(JSON.stringify(f.c.db), before);
    assert.equal(JSON.stringify(f.durable()), before);
    assert.equal(
      f.effects.includes("close") ||
        f.effects.includes("session") ||
        f.effects.includes("alert"),
      false,
    );
    await run();
    assert.notEqual(JSON.stringify(f.durable()), before);
    assert.equal(JSON.stringify(f.c.db), JSON.stringify(f.durable()));
    assert.equal(f.c.busy, 0);
    if (operation === "session") assert.equal(f.durable().sessions.length, 1);
  });
}
