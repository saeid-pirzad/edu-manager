"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const effects = [],
    modalBody = { firstElementChild: { isConnected: true } },
    region = { isConnected: true, innerHTML: "" },
    modal = { classList: { contains: () => false } },
    item = {
      key: "missing-key",
      kind: "missing",
      date: "2026-10-24",
      day: 0,
      period: 0,
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
      sourcePeriodId: "first",
      sessionId: "",
    },
    context = vm.createContext({
      structuredClone,
      installationToken: "original-installation",
      workspace: { id: "first", year: "1405-1406", revision: 1 },
      connection: {},
      state: { view: "schools" },
      fileMode: false,
      resetBusy: false,
      periodLoading: false,
      connectionRetired: false,
      isAuthenticated: true,
      db: { settings: {}, schools: [], sessions: [] },
      writer: Promise.resolve(),
      assertWorkspaceReadable() {},
      assertEntityWritable() {
        if (context.workspace.closed) throw Error("closed");
      },
      captureWorkspaceContext: () => ({
        id: context.workspace.id,
        revision: context.workspace.revision,
      }),
      flushDrafts: async () => {},
      selectYearActivityPeriods() {},
      readAnnualRecordSets: async () => ({
        periods: [{ ...context.workspace }],
        recordSets: [context.db],
      }),
      decodeWorkspaceRecords: (data) => ({ data }),
      assertReportSnapshot: async (snapshot) => {
        if (
          snapshot.id !== context.workspace.id ||
          snapshot.revision !== context.workspace.revision
        )
          throw Error("stale snapshot");
      },
      EduAttendanceReminders: {
        build: () => ({
          items: [structuredClone(item)],
          start: "2026-09-23",
          end: "2026-11-05",
        }),
      },
      EduAcademicYear: { range: () => ({ start: "2026-09-23" }) },
      todayISO: () => "2026-11-06",
      verifyPassword: async () => true,
      prompt: () => "secret",
      uid: () => "marker-id",
      esc: (value) => String(value).replace(/</g, "&lt;"),
      renderAttendanceReminders: () => "reminders rendered",
      attendanceReminderDialogHtml: () => "dialog",
      attendanceReminderListHtml: () => "list",
      renderNotHeldRemindersHtml: () => "history",
      document: {
        getElementById: (id) =>
          ({ modalBody, modal, attendanceReminderRegion: region })[id],
      },
      showModal: () => {
        modalBody.firstElementChild.isConnected = false;
        modalBody.firstElementChild = { isConnected: true };
      },
      closeModal: () => {
        modalBody.firstElementChild.isConnected = false;
        effects.push("close");
      },
      lockControls() {},
      render() {},
      saveDBV24: async () => {
        effects.push("save");
        context.workspace.revision++;
      },
      openYearSession: async (owner, id) =>
        effects.push(["existing", owner, id]),
      openScheduledSessionV24: async (selected, current) => {
        assert.equal(current(), true);
        effects.push(["create", selected.date]);
      },
      switchPeriod: async (id) => {
        effects.push(["switch", id]);
        context.workspace.id = id;
      },
    });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/reminders.js"),
      "utf8",
    ),
    context,
  );
  const button = { dataset: { key: item.key }, isConnected: true };
  return { c: context, effects, item, modalBody, region, button };
}

test("not-held creates only a persisted meta marker; no session, roster or attendance is fabricated", async () => {
  const f = fixture();
  await f.c.openAttendanceReminder(f.button);
  assert.equal(await f.c.markAttendanceReminderNotHeld(), true);
  assert.equal(f.c.db.sessions.length, 0);
  assert.equal(f.c.db.notHeldSessions.length, 1);
  assert.deepEqual(
    Object.keys(f.c.db.notHeldSessions[0]).sort(),
    [
      "id",
      "schoolId",
      "classId",
      "lessonId",
      "date",
      "period",
      "recordedAt",
    ].sort(),
  );
  assert.equal(f.c.db.notHeldSessions[0].date, "2026-10-24");
  assert.equal(f.effects.filter((row) => row === "save").length, 1);
});

test("incomplete real attendance never exposes an alternate not-held write path", async () => {
  const f = fixture();
  f.item.kind = "incomplete";
  f.item.sessionId = "existing";
  await f.c.openAttendanceReminder(f.button);
  await assert.rejects(f.c.markAttendanceReminderNotHeld(), /تکمیل/);
  assert.equal(f.c.db.notHeldSessions, undefined);
  assert.equal(f.effects.length, 0);
  await f.c.recordAttendanceReminder({ dataset: {} });
  assert.deepEqual(f.effects, [["existing", "first", "existing"]]);
});

test("missing attendance reuses guarded scheduled creation with its past date", async () => {
  const f = fixture();
  await f.c.openAttendanceReminder(f.button);
  await f.c.recordAttendanceReminder({ dataset: {} });
  assert.deepEqual(f.effects, [["create", "2026-10-24"]]);
});

for (const [label, mutate] of [
  [
    "installation",
    (f) => {
      f.c.installationToken = "restored-installation";
    },
  ],
  [
    "database",
    (f) => {
      f.c.connection = {};
    },
  ],
  [
    "data object",
    (f) => {
      f.c.db = structuredClone(f.c.db);
    },
  ],
  [
    "workspace",
    (f) => {
      f.c.workspace.id = "second";
    },
  ],
  [
    "revision",
    (f) => {
      f.c.workspace.revision++;
    },
  ],
  [
    "view",
    (f) => {
      f.c.state.view = "reports";
    },
  ],
  [
    "modal",
    (f) => {
      f.modalBody.firstElementChild.isConnected = false;
    },
  ],
  [
    "date rollover",
    (f) => {
      f.c.todayISO = () => "2026-11-07";
    },
  ],
]) {
  test(
    "a stale " + label + " prevents not-held marking without mutation",
    async () => {
      const f = fixture();
      await f.c.openAttendanceReminder(f.button);
      mutate(f);
      await assert.rejects(f.c.markAttendanceReminderNotHeld());
      assert.equal(f.c.db.notHeldSessions, undefined);
      assert.equal(f.effects.length, 0);
    },
  );
}

test("a changed peer revision discovered asynchronously cannot record a not-held marker", async () => {
  const f = fixture();
  await f.c.openAttendanceReminder(f.button);
  f.c.assertReportSnapshot = async () => {
    throw Error("peer changed");
  };
  await assert.rejects(f.c.markAttendanceReminderNotHeld(), /peer changed/);
  assert.equal(f.c.db.notHeldSessions, undefined);
});

test("a closed term refuses marker mutations", async () => {
  const f = fixture();
  await f.c.openAttendanceReminder(f.button);
  f.c.workspace.closed = true;
  await assert.rejects(f.c.markAttendanceReminderNotHeld(), /closed/);
  assert.equal(f.c.db.notHeldSessions, undefined);
});

test("rapid repeated not-held clicks commit at most once", async () => {
  const f = fixture();
  await f.c.openAttendanceReminder(f.button);
  await Promise.all([
    f.c.markAttendanceReminderNotHeld(),
    f.c.markAttendanceReminderNotHeld(),
  ]);
  assert.equal(f.c.db.notHeldSessions.length, 1);
  assert.equal(f.effects.filter((row) => row === "save").length, 1);
});

test("a failed marker write surfaces failure; the ordinary persistence rollback remains authoritative", async () => {
  const f = fixture();
  await f.c.openAttendanceReminder(f.button);
  f.c.saveDBV24 = async () => {
    // Production saveDBV24 restores the last committed workspace on failure.
    delete f.c.db.notHeldSessions;
    throw Error("quota exceeded");
  };
  await assert.rejects(f.c.markAttendanceReminderNotHeld(), /quota exceeded/);
  assert.equal(f.c.db.notHeldSessions, undefined);
  assert.equal(f.effects.includes("close"), false);
});

test("conflict review opens only the explicitly selected original owner; never fabricates a new session", async () => {
  const f = fixture();
  Object.assign(f.item, {
    kind: "conflict",
    sessions: [
      { sourcePeriodId: "first", sessionId: "one" },
      { sourcePeriodId: "second", sessionId: "two" },
    ],
  });
  await f.c.openAttendanceReminder(f.button);
  await assert.rejects(
    f.c.recordAttendanceReminder({
      dataset: { workspace: "second", session: "one" },
    }),
  );
  await f.c.recordAttendanceReminder({
    dataset: { workspace: "second", session: "two" },
  });
  assert.deepEqual(f.effects, [["existing", "second", "two"]]);
});

test("a detached list cannot open a delayed reminder modal", async () => {
  const f = fixture();
  f.c.readAnnualRecordSets = async () => {
    f.button.isConnected = false;
    return { periods: [{ ...f.c.workspace }], recordSets: [f.c.db] };
  };
  await assert.rejects(f.c.openAttendanceReminder(f.button));
  assert.equal(f.effects.length, 0);
});

test("not-held history restores only its selected marker and preserves real sessions", async () => {
  const f = fixture();
  const marker = {
    id: "one",
    date: "2026-10-24",
    period: 0,
    schoolId: "school",
    classId: "class",
    lessonId: "lesson",
  };
  f.c.db.notHeldSessions = [marker, { ...marker, id: "two", period: 1 }];
  f.c.db.sessions.push({ id: "real" });
  await f.c.openAttendanceRemindersList({ notHeld: true });
  await f.c.restoreAttendanceReminder({
    dataset: { key: "one", workspace: "first" },
    isConnected: true,
  });
  assert.equal(f.c.db.notHeldSessions.length, 1);
  assert.equal(f.c.db.notHeldSessions[0].id, "two");
  assert.equal(f.c.db.sessions[0].id, "real");
});

test("a prior rejected writer does not permanently disable a fresh review of durable data", async () => {
  const f = fixture();
  f.c.writer = Promise.reject(Error("earlier failed write"));
  const snapshot = await f.c.readAttendanceReminders();
  assert.equal(snapshot.model.items.length, 1);
});

for (const changedPassword of [false, true]) {
  test(
    "peer history authorizes only the unchanged verified password after a switch: " +
      changedPassword,
    async () => {
      const f = fixture(),
        firstData = f.c.db,
        peerData = {
          settings: { password: "peer-secret" },
          schools: [],
          sessions: [],
          notHeldSessions: [
            {
              id: "peer-marker",
              date: "2026-10-24",
              period: 0,
              schoolId: "school",
              classId: "class",
              lessonId: "lesson",
            },
          ],
        };
      f.c.assertWorkspaceReadable = () => {
        if (f.c.db.settings.password && !f.c.isAuthenticated)
          throw Error("locked");
      };
      f.c.readAnnualRecordSets = async () => ({
        periods: [
          { id: "first", year: "1405-1406", revision: 1 },
          { id: "second", year: "1405-1406", revision: 1 },
        ],
        recordSets: [firstData, peerData],
      });
      f.c.switchPeriod = async () => {
        f.c.isAuthenticated = false;
        f.c.workspace = { id: "second", year: "1405-1406", revision: 1 };
        f.c.db = structuredClone(peerData);
        if (changedPassword) f.c.db.settings.password = "changed-password";
      };
      await f.c.openAttendanceRemindersList({ notHeld: true });
      const operation = f.c.restoreAttendanceReminder({
        isConnected: true,
        dataset: { key: "peer-marker", workspace: "second" },
      });
      if (changedPassword) {
        await assert.rejects(operation, /دسترسی مقصد/);
        assert.equal(f.c.isAuthenticated, false);
      } else {
        await operation;
        assert.equal(f.c.isAuthenticated, true);
      }
      assert.equal(
        f.c.db.notHeldSessions.length,
        1,
        "switching alone must never remove a marker",
      );
      assert.equal(f.effects.includes("save"), false);
    },
  );
}

test("list pagination is read-only and rejects executable/stale page tokens", async () => {
  const f = fixture();
  await f.c.openAttendanceRemindersList();
  await f.c.pageAttendanceReminders({
    isConnected: true,
    dataset: { page: "1" },
  });
  assert.equal(f.effects.length, 0);
  await assert.rejects(
    f.c.pageAttendanceReminders({
      isConnected: true,
      dataset: { page: "1;wipe()" },
    }),
  );
  f.c.workspace.revision++;
  await assert.rejects(
    f.c.pageAttendanceReminders({ isConnected: true, dataset: { page: "0" } }),
  );
  assert.equal(f.effects.length, 0);
});

test("a replaced dashboard cancels its read before opening year transactions", async () => {
  const f = fixture();
  let reads = 0;
  f.c.readAnnualRecordSets = async () => {
    reads++;
    throw Error("should not read");
  };
  await assert.rejects(
    f.c.readAttendanceReminders({ isCurrent: () => false }),
    /صفحهٔ یادآورها/,
  );
  assert.equal(reads, 0);
});

test("future academic years do not issue background record reads or add empty dashboard cards", async () => {
  const f = fixture();
  let reads = 0;
  f.c.EduAcademicYear.range = () => ({ start: "2039-09-23" });
  f.c.readAnnualRecordSets = async () => {
    reads++;
    throw Error("should not read");
  };
  await f.c.refreshAttendanceReminders();
  assert.equal(reads, 0);
  assert.equal(f.region.innerHTML, "");
});

test("real year-session navigation recovers after a rolled-back earlier write", async () => {
  const f = fixture();
  f.c.db.sessions = [
    { id: "real", schoolId: "school", classId: "class", lessonId: "lesson" },
  ];
  f.c.readWorkspaceSnapshot = async () => ({
    period: { ...f.c.workspace },
    data: structuredClone(f.c.db),
  });
  f.c.openSessionModal = (session) => f.effects.push(["open", session.id]);
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/year-view.js"),
      "utf8",
    ),
    f.c,
  );
  f.c.writer = Promise.reject(Error("rolled back earlier write"));
  await f.c.openYearSession("first", "real");
  assert.deepEqual(f.effects, [["open", "real"]]);
});
