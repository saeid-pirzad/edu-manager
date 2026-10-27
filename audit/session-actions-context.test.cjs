"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const modals = [],
    writes = [];
  const session = {
    id: "session",
    classId: "class",
    lessonId: "lesson",
    poudmanId: null,
    unitId: null,
    date: "2026-10-27",
    period: 0,
    attendance: {},
    scores: [],
    roster: [{ id: "historical", name: "Historical" }],
  };
  const cls = { students: [{ id: "current", name: "New student" }] };
  const lesson = {
    poudmans: [
      { id: "pod", name: "Pod", units: [{ id: "unit", name: "Unit" }] },
    ],
  };
  const c = vm.createContext({
    workspace: { id: "first" },
    connection: {},
    currentSessionId: "session",
    db: { sessions: [session] },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    assertEntityWritable() {},
    getSessionById: () => session,
    findClass: () => cls,
    getLessonObj: () => lesson,
    document: {
      getElementById: (id) => ({
        value:
          id === "sessDate"
            ? "2026-10-28"
            : id === "sessPoudman"
              ? "pod"
              : "unit",
      }),
    },
    confirm: () => true,
    saveDBV24: async (scope) => writes.push(scope),
    openSessionModal: (value) => modals.push(value),
    TYPE_LABELS: { classGrade: "class grade" },
    parseGrade: () => ({ ok: true, value: 18 }),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/actions.js"),
      "utf8",
    ),
    c,
  );
  const scoreEvent = () => ({
    preventDefault() {},
    target: {
      type: { value: "classGrade" },
      studentId: { value: "historical" },
      value: { value: "18" },
      note: { value: "note" },
    },
  });
  const run = (action) =>
    action === "attendance"
      ? c.setAllAttendanceV24("present")
      : action === "date"
        ? c.changeSessionDateV24("session")
        : action === "unit"
          ? c.saveSessionUnitV24()
          : c.addSessionScoreV24(scoreEvent(), "session");
  return { c, session, cls, lesson, modals, writes, run, scoreEvent };
}
for (const action of ["attendance", "unit", "score", "date"]) {
  for (const change of ["connection", "session"]) {
    test(`late ${action} save does not reopen a changed ${change} dialog`, async () => {
      const f = fixture();
      f.c.saveDBV24 = async () => {
        if (change === "connection") f.c.connection = {};
        else f.c.currentSessionId = "other";
      };
      await f.run(action);
      assert.equal(f.modals.length, 0);
    });
  }
  test(`${action} refuses read-only mutation before touching session data`, async () => {
    const f = fixture();
    const before = JSON.stringify(f.session);
    f.c.assertEntityWritable = () => {
      throw Error("closed");
    };
    await assert.rejects(f.run(action), /closed/);
    assert.equal(JSON.stringify(f.session), before);
    assert.equal(f.writes.length, 0);
  });
}
test("bulk attendance uses the frozen session roster rather than new class members", async () => {
  const f = fixture();
  await f.run("attendance");
  assert.equal(f.session.attendance.historical, "present");
  assert.equal(f.session.attendance.current, undefined);
  assert.equal(f.writes[0].sessionId, "session");
  assert.equal(f.modals.length, 1);
});
test("session score preserves historical student identity and persists the original session", async () => {
  const f = fixture();
  await f.run("score");
  assert.equal(f.session.scores[0].studentId, "historical");
  assert.equal(f.session.scores[0].value, 18);
  assert.equal(f.writes[0].sessionId, "session");
  assert.equal(f.modals.length, 1);
});

for (const status of ["invalid", "late:1000", "late:-1", "late:1.5", null]) {
  test(`invalid bulk attendance is rejected without mutation: ${status}`, async () => {
    const f = fixture();
    await assert.rejects(f.c.setAllAttendanceV24(status), /وضعیت حضور/);
    assert.equal(Object.keys(f.session.attendance).length, 0);
    assert.equal(f.writes.length, 0);
  });
}
for (const status of ["present", "absent", "late", "late:0", "late:999"]) {
  test(`supported bulk attendance remains valid: ${status}`, async () => {
    const f = fixture();
    await f.c.setAllAttendanceV24(status);
    assert.equal(f.session.attendance.historical, status);
    assert.equal(f.writes.length, 1);
  });
}
for (const missing of ["session", "class", "lesson"]) {
  test(`score entry reports a missing ${missing} before mutation`, async () => {
    const f = fixture();
    if (missing === "session") f.c.getSessionById = () => null;
    if (missing === "class") f.c.findClass = () => null;
    if (missing === "lesson") f.c.getLessonObj = () => null;
    await assert.rejects(f.run("score"), /دیگر وجود ندارد/);
    assert.equal(f.session.scores.length + f.writes.length, 0);
  });
}
test("oversized score note is rejected before replacing a previous official score", async () => {
  const f = fixture();
  f.c.TYPE_LABELS.mostamar = "mostamar";
  f.session.poudmanId = "pod";
  f.session.unitId = "unit";
  f.session.scores.push({
    studentId: "historical",
    type: "mostamar",
    value: 16,
  });
  const event = f.scoreEvent();
  event.target.type.value = "mostamar";
  event.target.note.value = "x".repeat(10001);
  await assert.rejects(f.c.addSessionScoreV24(event, "session"), /۱۰۰۰۰/);
  assert.equal(f.session.scores[0].value, 16);
  assert.equal(f.writes.length, 0);
});

for (const [pod, unit] of [
  ["missing", "unit"],
  ["pod", "foreign-unit"],
  ["", "unit"],
]) {
  test(`session unit rejects mismatched selection ${pod}/${unit} without changing data`, async () => {
    const f = fixture();
    f.c.document.getElementById = (id) => ({
      value: id === "sessPoudman" ? pod : unit,
    });
    const before = JSON.stringify(f.session);
    await assert.rejects(f.run("unit"), /واحد نامعتبر/);
    assert.equal(JSON.stringify(f.session), before);
    assert.equal(f.writes.length, 0);
  });
}
test("declining session-unit reassignment preserves attendance and scores", async () => {
  const f = fixture();
  f.session.attendance.historical = "present";
  f.session.scores.push({
    studentId: "historical",
    type: "classGrade",
    value: 18,
  });
  f.c.confirm = () => false;
  const before = JSON.stringify(f.session);
  await f.run("unit");
  assert.equal(JSON.stringify(f.session), before);
  assert.equal(f.writes.length, 0);
});
test("confirmed session-unit reassignment preserves score and attendance values", async () => {
  const f = fixture();
  f.session.attendance.historical = "absent";
  f.session.scores.push({
    studentId: "historical",
    type: "classGrade",
    value: 18,
  });
  await f.run("unit");
  assert.equal(f.session.poudmanId, "pod");
  assert.equal(f.session.unitId, "unit");
  assert.equal(f.session.attendance.historical, "absent");
  assert.equal(f.session.scores[0].value, 18);
  assert.equal(f.writes.length, 1);
});
test("scored session cannot lose its unit association", async () => {
  const f = fixture();
  let warnings = 0;
  f.session.poudmanId = "pod";
  f.session.unitId = "unit";
  f.session.scores.push({
    studentId: "historical",
    type: "classGrade",
    value: 18,
  });
  f.c.document.getElementById = () => ({ value: "" });
  f.c.alert = () => warnings++;
  await f.run("unit");
  assert.equal(warnings, 1);
  assert.equal(f.session.unitId, "unit");
  assert.equal(f.writes.length, 0);
});
for (const missing of ["class", "lesson"]) {
  test(`unit reassignment reports missing ${missing} without mutation`, async () => {
    const f = fixture();
    if (missing === "class") f.c.findClass = () => null;
    else f.c.getLessonObj = () => null;
    await assert.rejects(f.run("unit"), /دیگر وجود ندارد/);
    assert.equal(f.writes.length, 0);
    assert.equal(f.session.unitId, null);
  });
}
test("read-only session cannot rebuild editable unit controls", () => {
  const f = fixture();
  let touched = false;
  f.c.assertEntityWritable = () => {
    throw Error("closed");
  };
  f.c.document.getElementById = () => {
    touched = true;
    return {};
  };
  assert.throws(() => f.c.updateSessionUnitsV24(), /closed/);
  assert.equal(touched, false);
});

for (const date of ["2026-02-30", "not-a-date", "2026-13-01"]) {
  test(`invalid session date is rejected before mutation: ${date}`, async () => {
    const f = fixture();
    f.c.document.getElementById = () => ({ value: date });
    await assert.rejects(f.run("date"), /تاریخ معتبر/);
    assert.equal(f.session.date, "2026-10-27");
    assert.equal(f.writes.length, 0);
  });
}
test("date conflict opens the existing session without merging or changing either session", async () => {
  const f = fixture();
  const other = {
    ...f.session,
    id: "conflict",
    lessonId: "another-lesson",
    date: "2026-10-28",
  };
  f.c.db.sessions.push(other);
  await f.run("date");
  assert.equal(f.session.date, "2026-10-27");
  assert.equal(f.modals[0], other);
  assert.equal(f.writes.length, 0);
});
test("valid date change preserves historical attendance and scores", async () => {
  const f = fixture();
  f.session.attendance.historical = "present";
  f.session.scores.push({ studentId: "historical", value: 18 });
  await f.run("date");
  assert.equal(f.session.date, "2026-10-28");
  assert.equal(f.session.scores[0].value, 18);
  assert.equal(f.session.attendance.historical, "present");
  assert.equal(f.writes[0].sessionId, "session");
});
test("unchanged session date does not enqueue an unnecessary save", async () => {
  const f = fixture();
  f.c.document.getElementById = () => ({ value: f.session.date });
  await f.run("date");
  assert.equal(f.writes.length, 0);
});

for (const index of [-1, 0.5, NaN, "0", 2]) {
  test(`score removal rejects invalid index without deleting another score: ${index}`, async () => {
    const f = fixture();
    f.session.scores.push({ value: 16 }, { value: 18 });
    await assert.rejects(
      f.c.removeSessionScoreV24("session", index),
      /امتیاز انتخاب/,
    );
    assert.equal(f.session.scores.length, 2);
    assert.equal(f.writes.length, 0);
  });
}
test("score removal deletes only its selected row and persists the session scope", async () => {
  const f = fixture();
  f.session.scores.push({ value: 16 }, { value: 18 });
  await f.c.removeSessionScoreV24("session", 0);
  assert.equal(f.session.scores.length, 1);
  assert.equal(f.session.scores[0].value, 18);
  assert.equal(f.writes[0].sessionId, "session");
  assert.equal(f.modals.length, 1);
});
for (const kind of ["connection", "session"]) {
  test(`late score removal does not reopen a changed ${kind}`, async () => {
    const f = fixture();
    f.session.scores.push({ value: 18 });
    f.c.saveDBV24 = async () => {
      if (kind === "connection") f.c.connection = {};
      else f.c.currentSessionId = "other";
    };
    await f.c.removeSessionScoreV24("session", 0);
    assert.equal(f.modals.length, 0);
  });
}
test("read-only score removal fails before mutating scores", async () => {
  const f = fixture();
  f.session.scores.push({ value: 18 });
  f.c.assertEntityWritable = () => {
    throw Error("closed");
  };
  await assert.rejects(f.c.removeSessionScoreV24("session", 0), /closed/);
  assert.equal(f.session.scores.length, 1);
});
