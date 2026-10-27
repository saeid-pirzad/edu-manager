"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const writes = [];
  const session = {
    id: "session",
    classId: "class",
    attendance: {},
    roster: [{ id: "historical" }],
  };
  const controls = ["present", "absent", "late"].map((kind) => {
    const classes = new Set([kind]);
    return {
      isConnected: true,
      textContent: kind,
      classList: {
        contains: (name) => classes.has(name),
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
      },
    };
  });
  const wrap = {
    dataset: { sid: "historical" },
    querySelectorAll: () => controls,
  };
  for (const control of controls) control.parentElement = wrap;
  const c = vm.createContext({
    workspace: { id: "first" },
    connection: {},
    currentSessionId: "session",
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    assertEntityWritable() {},
    getSessionById: () => session,
    findClass: () => ({ students: [] }),
    asciiDigits: (value) => value.replace(/۲/g, "2").replace(/۰/g, "0").trim(),
    prompt: () => "10",
    saveDBV24: async (scope) => writes.push(scope),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/actions.js"),
      "utf8",
    ),
    c,
  );
  return { c, session, controls, wrap, writes };
}
for (const [status, index] of [
  ["present", 0],
  ["absent", 1],
  ["late", 2],
]) {
  test(`single attendance saves historical roster member and then displays ${status}`, async () => {
    const f = fixture();
    await f.c.toggleAttendanceV24(f.controls[index], status);
    assert.equal(f.writes[0].sessionId, "session");
    assert.equal(
      f.session.attendance.historical,
      status === "late" ? "late:10" : status,
    );
    assert.equal(f.controls[index].classList.contains("active"), true);
  });
}
test("cancelled lateness does not alter attendance or controls", async () => {
  const f = fixture();
  f.session.attendance.historical = "present";
  f.controls[0].classList.add("active");
  f.c.prompt = () => null;
  assert.equal(await f.c.toggleAttendanceV24(f.controls[2], "late"), false);
  assert.equal(f.session.attendance.historical, "present");
  assert.equal(f.controls[0].classList.contains("active"), true);
  assert.equal(f.writes.length, 0);
});
for (const answer of ["-1", "1.5", "1000"]) {
  test(`invalid lateness is rejected before mutation: ${answer}`, async () => {
    const f = fixture();
    f.c.prompt = () => answer;
    await assert.rejects(
      f.c.toggleAttendanceV24(f.controls[2], "late"),
      /دقیقه نامعتبر/,
    );
    assert.equal(Object.keys(f.session.attendance).length + f.writes.length, 0);
  });
}
test("Persian lateness digits are normalized", async () => {
  const f = fixture();
  f.c.prompt = () => "۲۰";
  await f.c.toggleAttendanceV24(f.controls[2], "late");
  assert.equal(f.session.attendance.historical, "late:20");
});
test("unknown session member cannot receive attendance", async () => {
  const f = fixture();
  f.wrap.dataset.sid = "outsider";
  await assert.rejects(
    f.c.toggleAttendanceV24(f.controls[0], "present"),
    /فهرست این جلسه/,
  );
  assert.equal(f.writes.length, 0);
});
test("failed attendance write does not mark its button as saved", async () => {
  const f = fixture();
  f.c.saveDBV24 = async () => {
    throw Error("quota");
  };
  await assert.rejects(
    f.c.toggleAttendanceV24(f.controls[0], "present"),
    /quota/,
  );
  assert.equal(f.controls[0].classList.contains("active"), false);
});
test("late attendance completion does not change controls in another session", async () => {
  const f = fixture();
  f.c.saveDBV24 = async () => {
    f.c.currentSessionId = "other";
  };
  await f.c.toggleAttendanceV24(f.controls[0], "present");
  assert.equal(f.controls[0].classList.contains("active"), false);
});
test("attendance toggle uses stored state rather than stale button styling", async () => {
  const f = fixture();
  f.session.attendance.historical = "present";
  await f.c.toggleAttendanceV24(f.controls[0], "present");
  assert.equal(f.session.attendance.historical, undefined);
  assert.equal(f.controls[0].classList.contains("active"), false);
});

test("detached attendance control cannot write to the current session", async () => {
  const f = fixture();
  f.controls[0].isConnected = false;
  await assert.rejects(
    f.c.toggleAttendanceV24(f.controls[0], "present"),
    /صفحهٔ قبلی/,
  );
  assert.equal(Object.keys(f.session.attendance).length + f.writes.length, 0);
});
for (const kind of ["connection", "session-object", "read-only"]) {
  test(`lateness prompt cannot authorize a write after ${kind} changes`, async () => {
    const f = fixture();
    f.c.prompt = () => {
      if (kind === "connection") f.c.connection = {};
      else if (kind === "session-object")
        f.c.getSessionById = () => ({ ...f.session });
      else
        f.c.assertEntityWritable = () => {
          throw Error("closed");
        };
      return "10";
    };
    await assert.rejects(f.c.toggleAttendanceV24(f.controls[2], "late"));
    assert.equal(Object.keys(f.session.attendance).length + f.writes.length, 0);
  });
}

function useRealSaveQueue(f, failFirst) {
  f.c.db = { sessions: [structuredClone(f.session)] };
  let durable = structuredClone(f.c.db),
    attempts = 0;
  Object.assign(f.c, {
    fileMode: false,
    writeFailureGeneration: 0,
    busy: 0,
    writer: Promise.resolve(),
    paintStatus() {},
    checkScope() {},
    collectRecords: (value) => value,
    setStatus() {},
    render() {},
    scheduleSingleFile() {},
    readWorkspace: async () => ({ data: structuredClone(durable) }),
    getSessionById: () => f.c.db.sessions[0],
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/data/save.js"),
      "utf8",
    ),
    f.c,
  );
  f.c.commitRecords = async () => {
    if (++attempts === 1 && failFirst) throw Error("quota");
    durable = structuredClone(f.c.db);
  };
  return { durable: () => durable, attempts: () => attempts };
}
test("attendance retry after real save-queue rollback retains previous values and then persists once", async () => {
  const f = fixture();
  f.session.attendance.historical = "absent";
  f.controls[1].classList.add("active");
  const store = useRealSaveQueue(f, true);
  await assert.rejects(
    f.c.toggleAttendanceV24(f.controls[0], "present"),
    /quota/,
  );
  assert.equal(f.c.db.sessions[0].attendance.historical, "absent");
  assert.equal(f.controls[1].classList.contains("active"), true);
  await f.c.toggleAttendanceV24(f.controls[0], "present");
  assert.equal(store.durable().sessions[0].attendance.historical, "present");
  assert.equal(f.controls[0].classList.contains("active"), true);
  assert.equal(f.c.busy, 0);
});
test("concurrent attendance writes rejected after rollback do not leave uncommitted values", async () => {
  const f = fixture();
  const store = useRealSaveQueue(f, true);
  const results = await Promise.allSettled([
    f.c.toggleAttendanceV24(f.controls[0], "present"),
    f.c.toggleAttendanceV24(f.controls[1], "absent"),
  ]);
  assert.equal(
    results.every((result) => result.status === "rejected"),
    true,
  );
  assert.equal(Object.keys(f.c.db.sessions[0].attendance).length, 0);
  assert.equal(Object.keys(store.durable().sessions[0].attendance).length, 0);
  assert.equal(f.c.busy, 0);
});
