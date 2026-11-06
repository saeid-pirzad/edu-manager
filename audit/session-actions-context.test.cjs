"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const modals = [],
    writes = [],
    attendanceRefreshes = [],
    activityRefreshes = [],
    finishedForms = [];
  const session = {
    id: "session",
    schoolId: "school",
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
  const cls = {
    id: "class",
    students: [{ id: "current", name: "New student" }],
  };
  const lesson = {
    id: "lesson",
    poudmans: [
      { id: "pod", name: "Pod", units: [{ id: "unit", name: "Unit" }] },
    ],
  };
  cls.lessons = [lesson];
  const c = vm.createContext({
    workspace: { id: "first", year: "1405-1406" },
    connection: {},
    currentSessionId: "session",
    db: {
      settings: { academicYear: "1405-1406", weekStartDate: "2026-10-24" },
      schools: [{ id: "school", classes: [cls] }],
      sessions: [session],
      periods: 6,
      activeDays: [0, 1, 2, 3, 4, 5],
      masterSchedule: {
        "3-0-all": { schoolId: "school", classId: "class", lessonId: "lesson" },
        "3-1-all": { schoolId: "school", classId: "class", lessonId: "lesson" },
        "4-0-all": { schoolId: "school", classId: "class", lessonId: "lesson" },
      },
    },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    assertEntityWritable() {},
    syncControlLocks() {},
    prepareSessionActivityRecords() {},
    captureSessionControlFocus: () => () => {},
    assertSessionEditable: () => {
      c.assertEntityWritable();
      return "isolated-edit-lease";
    },
    isSessionEditable: () => true,
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
    refreshSessionAttendanceRows: (value) => attendanceRefreshes.push(value),
    refreshSessionActivityRecords: (value) => activityRefreshes.push(value),
    finishSessionActivitySave: (form, options, focusOrigin) =>
      finishedForms.push({ form, options, focusOrigin }),
    sessionActivityControlMatches: () => true,
    TYPE_LABELS: { classGrade: "class grade" },
    parseGrade: () => ({ ok: true, value: 18 }),
  });
  for (const name of ["calendar.js", "academic-year.js", "session-slots.js"])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/domain", name), "utf8"),
      c,
    );
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
  return {
    c,
    session,
    cls,
    lesson,
    modals,
    writes,
    attendanceRefreshes,
    activityRefreshes,
    finishedForms,
    run,
    scoreEvent,
  };
}
function assertViewEffects(f, action, count = 1) {
  assert.equal(f.modals.length, ["unit", "date"].includes(action) ? count : 0);
  assert.equal(
    f.attendanceRefreshes.length,
    action === "attendance" ? count : 0,
  );
  assert.equal(
    f.activityRefreshes.length,
    ["score", "score-removal"].includes(action) ? count : 0,
  );
  assert.equal(f.finishedForms.length, action === "score" ? count : 0);
}
for (const action of ["attendance", "unit", "score", "date"]) {
  for (const change of ["connection", "session"]) {
    test(`late ${action} save does not update a changed ${change} dialog`, async () => {
      const f = fixture();
      f.c.saveDBV24 = async () => {
        if (change === "connection") f.c.connection = {};
        else f.c.currentSessionId = "other";
      };
      await f.run(action);
      assertViewEffects(f, action, 0);
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
  assertViewEffects(f, "attendance");
  assert.equal(f.attendanceRefreshes[0], f.session);
});
test("session score preserves historical student identity and persists the original session", async () => {
  const f = fixture();
  await f.run("score");
  assert.equal(f.session.scores[0].studentId, "historical");
  assert.equal(f.session.scores[0].value, 18);
  assert.equal(f.writes[0].sessionId, "session");
  assertViewEffects(f, "score");
  assert.equal(f.activityRefreshes[0], f.session);
});

for (const status of ["invalid", "late:1000", "late:-1", "late:1.5", null]) {
  test(`invalid bulk attendance is rejected without mutation: ${status}`, async () => {
    const f = fixture();
    await assert.rejects(f.c.setAllAttendanceV24(status), /وضعیت حضور/);
    assert.equal(Object.keys(f.session.attendance).length, 0);
    assert.equal(f.writes.length, 0);
  });
}
for (const status of [
  "present",
  "absent",
  "leave",
  "late",
  "late:0",
  "late:999",
]) {
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
test("date conflict is rejected without opening or changing another session", async () => {
  const f = fixture();
  const other = {
    ...f.session,
    id: "conflict",
    lessonId: "another-lesson",
    date: "2026-10-28",
  };
  f.c.db.sessions.push(other);
  await assert.rejects(f.run("date"), /تداخل جلسه/);
  assert.equal(f.session.date, "2026-10-27");
  assert.equal(f.modals.length, 0);
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
  assertViewEffects(f, "score-removal");
  assert.equal(f.activityRefreshes[0], f.session);
});
for (const kind of ["connection", "session"]) {
  test(`late score removal does not update a changed ${kind}`, async () => {
    const f = fixture();
    f.session.scores.push({ value: 18 });
    f.c.saveDBV24 = async () => {
      if (kind === "connection") f.c.connection = {};
      else f.c.currentSessionId = "other";
    };
    await f.c.removeSessionScoreV24("session", 0);
    assertViewEffects(f, "score-removal", 0);
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

test("session date edit rejects another class collision without changing attendance or grades", async () => {
  const f = fixture();
  f.session.attendance.historical = "leave";
  f.session.scores.push({ value: 18 });
  f.c.db.sessions.push({
    id: "occupied",
    classId: "other-class",
    date: "2026-10-28",
    period: 0,
  });
  const before = JSON.stringify(f.c.db.sessions);
  await assert.rejects(f.c.changeSessionDateV24("session"), /تداخل جلسه/);
  assert.equal(JSON.stringify(f.c.db.sessions), before);
  assert.equal(f.writes.length, 0);
});
test("correcting only the period preserves session identity roster attendance and scores", async () => {
  const f = fixture();
  f.session.attendance.historical = "leave";
  f.session.scores.push({ value: 18 });
  f.c.asciiDigits = (x) => x;
  f.c.document.getElementById = (id) =>
    id === "sessPeriod"
      ? { type: "number", value: "2" }
      : { value: f.session.date };
  await f.c.changeSessionDateV24("session");
  assert.equal(f.session.period, 1);
  assert.equal(f.session.id, "session");
  assert.equal(f.session.attendance.historical, "leave");
  assert.equal(f.session.scores[0].value, 18);
  assert.equal(f.session.roster[0].id, "historical");
  assert.equal(f.writes.length, 1);
});
test("period correction rejects a collision even when the date did not change", async () => {
  const f = fixture();
  f.c.asciiDigits = (x) => x;
  f.c.document.getElementById = (id) =>
    id === "sessPeriod"
      ? { type: "number", value: "2" }
      : { value: f.session.date };
  f.c.db.sessions.push({
    id: "occupied",
    classId: "other-class",
    date: f.session.date,
    period: 1,
  });
  await assert.rejects(f.c.changeSessionDateV24("session"), /تداخل جلسه/);
  assert.equal(f.session.period, 0);
  assert.equal(f.writes.length, 0);
});

test("fill-unset attendance preserves recorded exceptions and changes only missing frozen-roster members", async () => {
  const f = fixture();
  f.session.roster = [
    "historical",
    "absent",
    "leave",
    "late",
    "present",
    "missing",
  ].map((id) => ({ id, name: id }));
  f.session.attendance = {
    absent: "absent",
    leave: "leave",
    late: "late:17",
    present: "present",
    outsider: "leave",
  };
  await f.c.setAllAttendanceV24("present", { onlyUnset: true });
  assert.deepEqual(f.session.attendance, {
    absent: "absent",
    leave: "leave",
    late: "late:17",
    present: "present",
    outsider: "leave",
    historical: "present",
    missing: "present",
  });
  assert.equal(f.session.attendance.current, undefined);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].sessionId, "session");
  assertViewEffects(f, "attendance");
  const before = JSON.stringify(f.session);
  assert.equal(
    await f.c.setAllAttendanceV24("present", { onlyUnset: true }),
    false,
  );
  assert.equal(JSON.stringify(f.session), before);
  assert.equal(f.writes.length, 1);
  assertViewEffects(f, "attendance");
});

test("explicit bulk overwrite remains available and a repeated identical overwrite is a no-op", async () => {
  const f = fixture();
  f.session.roster = ["historical", "leave", "late"].map((id) => ({ id }));
  f.session.attendance = {
    historical: "absent",
    leave: "leave",
    late: "late:0",
    outsider: "absent",
  };
  await f.c.setAllAttendanceV24("present");
  assert.deepEqual(f.session.attendance, {
    historical: "present",
    leave: "present",
    late: "present",
    outsider: "absent",
  });
  assert.equal(f.writes.length, 1);
  assertViewEffects(f, "attendance");
  assert.equal(await f.c.setAllAttendanceV24("present"), false);
  assert.equal(f.writes.length, 1);
  assertViewEffects(f, "attendance");
});

test("rapid submissions of the same score form while a save is pending add one activity", async () => {
  const f = fixture(),
    event = f.scoreEvent();
  event.target.isConnected = true;
  let release;
  f.c.saveDBV24 = (scope) => {
    f.writes.push(scope);
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = f.c.addSessionScoreV24(event, "session");
  assert.equal(f.session.scores.length, 1);
  assert.equal(await f.c.addSessionScoreV24(event, "session"), false);
  assert.equal(f.session.scores.length, 1);
  assert.equal(f.writes.length, 1);
  assertViewEffects(f, "score", 0);
  release();
  assert.equal(await first, true);
  assertViewEffects(f, "score");
});

for (const stale of ["disconnected", "different-session"]) {
  test(
    "score submission rejects a " + stale + " form before mutation",
    async () => {
      const f = fixture(),
        event = f.scoreEvent();
      if (stale === "disconnected") event.target.isConnected = false;
      else f.c.currentSessionId = "other-session";
      const before = JSON.stringify(f.session);
      await assert.rejects(f.c.addSessionScoreV24(event, "session"));
      assert.equal(JSON.stringify(f.session), before);
      assert.equal(f.writes.length, 0);
      assert.equal(f.modals.length, 0);
    },
  );
}

test("a rejected disconnected score form does not leave its submission gate locked", async () => {
  const f = fixture(),
    event = f.scoreEvent();
  event.target.isConnected = false;
  await assert.rejects(f.c.addSessionScoreV24(event, "session"));
  event.target.isConnected = true;
  assert.equal(await f.c.addSessionScoreV24(event, "session"), true);
  assert.equal(f.session.scores.length, 1);
  assert.equal(f.writes.length, 1);
});

for (const action of ["attendance", "unit", "score", "date", "score-removal"]) {
  for (const change of ["same-id-database", "installation-epoch"]) {
    test(
      "late " + action + " completion cannot update after a replaced " + change,
      async () => {
        const f = fixture(),
          originalData = f.c.db,
          originalWorkspace = f.c.workspace;
        f.c.installationToken = "original-epoch";
        f.c.saveDBV24 = async (scope) => {
          f.writes.push(scope);
          if (change === "same-id-database") f.c.db = { ...f.c.db };
          else f.c.installationToken = "restored-epoch";
        };
        if (action === "score-removal") {
          f.session.scores.push({ value: 18 });
          await f.c.removeSessionScoreV24("session", 0);
        } else await f.run(action);
        assert.equal(f.writes.length, 1);
        assert.equal(f.c.workspace.id, "first");
        assert.equal(f.c.workspace, originalWorkspace);
        if (change === "same-id-database") {
          assert.notEqual(f.c.db, originalData);
          assert.equal(f.c.installationToken, "original-epoch");
        } else {
          assert.equal(f.c.db, originalData);
          assert.equal(f.c.installationToken, "restored-epoch");
        }
        assertViewEffects(f, action, 0);
      },
    );
  }
}

for (const action of ["attendance", "unit", "score", "date", "score-removal"]) {
  test(
    "a successful " +
      action +
      " save still updates after the normal catalog object replacement",
    async () => {
      const f = fixture(),
        original = f.c.workspace;
      f.c.saveDBV24 = async (scope) => {
        f.writes.push(scope);
        f.c.workspace = { ...f.c.workspace, revision: 1 };
      };
      if (action === "score-removal") {
        f.session.scores.push({ value: 18 });
        await f.c.removeSessionScoreV24("session", 0);
      } else await f.run(action);
      assert.notEqual(f.c.workspace, original);
      assert.equal(f.writes.length, 1);
      assertViewEffects(f, action);
    },
  );
}

for (const action of ["attendance", "score", "score-removal"]) {
  test(`a rejected ${action} write never refreshes or finishes the session form`, async () => {
    const f = fixture(),
      event = f.scoreEvent();
    f.session.scores.push({ value: 16 }, { value: 18 });
    const entry = JSON.stringify(event.target);
    f.c.saveDBV24 = async (scope) => {
      f.writes.push(scope);
      throw Error("synthetic quota failure");
    };
    const operation =
      action === "score-removal"
        ? f.c.removeSessionScoreV24("session", 0)
        : action === "score"
          ? f.c.addSessionScoreV24(event, "session")
          : f.run(action);
    await assert.rejects(operation, /synthetic quota failure/);
    assert.equal(f.writes.length, 1);
    assert.equal(JSON.stringify(event.target), entry);
    assertViewEffects(f, action, 0);
  });
}

test("successful activity submission finishes only its original form with the exact submitted strings and next intent", async () => {
  const f = fixture(),
    event = f.scoreEvent();
  event.target.value.value = "۱۸٫۵";
  event.target.note.value = "  exact pending note  ";
  event.submitter = { hasAttribute: (name) => name === "data-session-next" };
  const expected = Object.fromEntries(
    ["studentId", "type", "value", "note"].map((name) => [
      name,
      event.target[name].value,
    ]),
  );
  const originalFocus = { name: "attendance tab" };
  f.c.document.activeElement = originalFocus;
  f.c.saveDBV24 = async (scope) => {
    f.writes.push(scope);
    f.c.document.activeElement = { name: "new focus while saving" };
  };
  await f.c.addSessionScoreV24(event, "session");
  assertViewEffects(f, "score");
  assert.equal(f.finishedForms[0].form, event.target);
  assert.equal(f.finishedForms[0].focusOrigin, originalFocus);
  assert.deepEqual(JSON.parse(JSON.stringify(f.finishedForms[0].options)), {
    submitted: expected,
    advance: true,
  });
  assert.equal(f.session.scores[0].note, "exact pending note");
});

test("ordinary activity submission does not request a next-student advance", async () => {
  const f = fixture();
  await f.run("score");
  assert.equal(f.finishedForms[0].options.advance, false);
});

for (const failure of [false, true]) {
  test(`pending activity removal deletes once and releases its gate after ${failure ? "failure" : "success"}`, async () => {
    const f = fixture(),
      firstScore = { value: 16 },
      secondScore = { value: 18 };
    f.session.scores.push(firstScore, secondScore);
    let settle;
    f.c.saveDBV24 = (scope) => {
      f.writes.push(scope);
      return new Promise((resolve, reject) => {
        settle = () => {
          if (failure) {
            // Model the save queue restoring the original durable score list.
            f.session.scores = [firstScore, secondScore];
            reject(Error("synthetic quota failure"));
          } else resolve();
        };
      });
    };
    const first = f.c.removeSessionScoreV24("session", 0),
      completed = failure
        ? assert.rejects(first, /synthetic quota failure/)
        : first;
    assert.deepEqual(f.session.scores, [secondScore]);
    assert.equal(await f.c.removeSessionScoreV24("session", 0), false);
    assert.deepEqual(f.session.scores, [secondScore]);
    assert.equal(f.writes.length, 1);
    assertViewEffects(f, "score-removal", 0);
    settle();
    await completed;
    assertViewEffects(f, "score-removal", failure ? 0 : 1);
    f.c.saveDBV24 = async (scope) => f.writes.push(scope);
    assert.equal(await f.c.removeSessionScoreV24("session", 0), true);
    assert.equal(f.writes.length, 2);
    assert.deepEqual(f.session.scores, failure ? [secondScore] : []);
    assertViewEffects(f, "score-removal", failure ? 1 : 2);
  });
}

test("a stale activity control is rejected before deleting a row or claiming the removal gate", async () => {
  const f = fixture(),
    control = { isConnected: false };
  f.session.scores.push({ value: 16 }, { value: 18 });
  let checked = 0;
  f.c.sessionActivityControlMatches = (button, session, index) => {
    checked++;
    assert.equal(button, control);
    assert.equal(session, f.session);
    assert.equal(index, 0);
    return false;
  };
  const before = JSON.stringify(f.session);
  await assert.rejects(
    f.c.removeSessionScoreV24("session", 0, control),
    /ردیف فعالیت تغییر/,
  );
  assert.equal(checked, 1);
  assert.equal(JSON.stringify(f.session), before);
  assert.equal(f.writes.length, 0);
  assertViewEffects(f, "score-removal", 0);
  f.c.sessionActivityControlMatches = () => true;
  assert.equal(await f.c.removeSessionScoreV24("session", 0, control), true);
  assert.equal(f.session.scores[0].value, 18);
  assertViewEffects(f, "score-removal");
});

for (const action of ["attendance", "score", "score-removal"]) {
  for (const change of [
    "edit-lease",
    "workspace-id",
    "period-loading",
    "reset-busy",
    "connection-retired",
  ]) {
    test(`pending ${action} completion cannot patch after ${change} changes`, async () => {
      const f = fixture();
      let activeToken = {};
      f.c.assertSessionEditable = () => activeToken;
      f.c.isSessionEditable = (_id, token) => token === activeToken;
      f.c.saveDBV24 = async (scope) => {
        f.writes.push(scope);
        if (change === "edit-lease") activeToken = {};
        if (change === "workspace-id") f.c.workspace.id = "other-workspace";
        if (change === "period-loading") f.c.periodLoading = true;
        if (change === "reset-busy") f.c.resetBusy = true;
        if (change === "connection-retired") f.c.connectionRetired = true;
      };
      if (action === "score-removal") {
        f.session.scores.push({ value: 18 });
        await f.c.removeSessionScoreV24("session", 0);
      } else await f.run(action);
      assert.equal(f.writes.length, 1);
      assertViewEffects(f, action, 0);
    });
  }
}
