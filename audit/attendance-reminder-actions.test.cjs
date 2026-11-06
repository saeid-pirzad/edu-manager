"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const domain = vm.createContext({});
  for (const name of [
    "calendar",
    "academic-year",
    "data-boundary",
    "attendance-reminders",
  ])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/domain", name + ".js"),
        "utf8",
      ),
      domain,
    );
  const effects = [],
    confirmations = [],
    saves = [],
    renders = [],
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
      currentSessionId: null,
      db: { settings: {}, schools: [], sessions: [] },
      writer: Promise.resolve(),
      assertWorkspaceReadable() {},
      assertEntityWritable() {
        if (context.workspace.closed) throw Error("closed");
        if (context.db.settings.password && !context.isAuthenticated)
          throw Error("locked");
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
        ...domain.EduAttendanceReminders,
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
      confirm: (message) => {
        confirmations.push(message);
        return true;
      },
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
      render() {
        renders.push(structuredClone(context.db));
      },
      saveDBV24: async (options) => {
        saves.push({ options, data: structuredClone(context.db) });
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
  return {
    c: context,
    effects,
    confirmations,
    saves,
    renders,
    item,
    modalBody,
    region,
    button,
  };
}

function emptySessionFixture() {
  const f = fixture(),
    session = {
      id: "empty-session",
      date: f.item.date,
      period: f.item.period,
      schoolId: f.item.schoolId,
      classId: f.item.classId,
      lessonId: f.item.lessonId,
      poudmanId: null,
      unitId: null,
      roster: [{ id: "student", name: "Frozen student" }],
      attendance: {},
      scores: [],
    };
  f.c.db.sessions = [session];
  Object.assign(f.item, { kind: "empty", sessionId: session.id });
  return { ...f, session };
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
  assert.equal(
    f.confirmations.length,
    0,
    "a missing session needs no removal consent",
  );
});

test("an untouched opened session is removed only after explicit consent in one full durable save", async () => {
  const f = emptySessionFixture(),
    otherSession = {
      ...structuredClone(f.session),
      id: "recorded-session",
      period: 1,
      attendance: { student: "present" },
      scores: [{ studentId: "student", value: 0 }],
    };
  f.c.db.sessions.push(otherSession);
  f.c.db.schools = [{ id: "preserved-school", classes: [] }];
  f.c.db.settings.kept = "unchanged";
  f.c.currentSessionId = f.session.id;
  const beforeOther = structuredClone(otherSession);
  await f.c.openAttendanceReminder(f.button);
  assert.equal(await f.c.markAttendanceReminderNotHeld(), true);
  assert.equal(f.confirmations.length, 1);
  assert.match(f.confirmations[0], /جلسه|اطلاعات|خالی/);
  assert.equal(f.saves.length, 1);
  assert.equal(
    f.saves[0].options.sessionId,
    undefined,
    "removal and meta must commit together, never a session-scoped write",
  );
  assert.equal(
    f.saves[0].options.classId,
    undefined,
    "the session deletion also must not be reduced to a class-scoped save",
  );
  assert.equal(f.saves[0].data.sessions.length, 1);
  assert.deepEqual(f.saves[0].data.sessions[0], beforeOther);
  assert.equal(f.saves[0].data.notHeldSessions.length, 1);
  assert.equal(f.saves[0].data.notHeldSessions[0].date, f.item.date);
  assert.equal(f.saves[0].data.notHeldSessions[0].period, f.item.period);
  assert.deepEqual(f.c.db.schools, [{ id: "preserved-school", classes: [] }]);
  assert.equal(f.c.db.settings.kept, "unchanged");
  assert.equal(f.effects.filter((row) => row === "save").length, 1);
  assert.equal(f.effects.includes("close"), true);
  assert.equal(f.c.currentSessionId, null);
});

test("canceling the empty-session confirmation preserves the placeholder and every byte of educational data", async () => {
  const f = emptySessionFixture(),
    before = structuredClone(f.c.db);
  f.c.confirm = () => false;
  await f.c.openAttendanceReminder(f.button);
  assert.equal(await f.c.markAttendanceReminderNotHeld(), false);
  assert.deepEqual(f.c.db, before);
  assert.equal(f.effects.length, 0);
  assert.equal(f.modalBody.firstElementChild.isConnected, true);
});

test("reviewing or opening an empty session is read-only and retains its exact original owner", async () => {
  const f = emptySessionFixture(),
    before = structuredClone(f.c.db);
  await f.c.openAttendanceReminder(f.button);
  assert.deepEqual(f.c.db, before);
  await f.c.recordAttendanceReminder({ dataset: {} });
  assert.deepEqual(f.effects, [["existing", "first", "empty-session"]]);
  assert.deepEqual(f.c.db, before);
  assert.equal(f.confirmations.length, 0);
});

for (const [label, record] of [
  ["present attendance", { attendance: { student: "present" } }],
  ["unknown attendance entry", { attendance: { student: "" } }],
  ["unknown student attendance", { attendance: { outsider: "absent" } }],
  ["zero score", { scores: [{ studentId: "student", value: 0 }] }],
  [
    "ordinary activity",
    { scores: [{ studentId: "student", kind: "positive", value: 0.25 }] },
  ],
  ["unrecognized educational field", { customActivity: { student: 0 } }],
  ["unrecognized empty field", { unfamiliar: [] }],
  ["notes", { notes: "Preserve this teacher note" }],
]) {
  test("a stale empty label cannot erase " + label, async () => {
    const f = emptySessionFixture();
    await f.c.openAttendanceReminder(f.button);
    Object.assign(f.session, structuredClone(record));
    const before = structuredClone(f.c.db);
    await assert.rejects(f.c.markAttendanceReminderNotHeld());
    assert.deepEqual(f.c.db, before);
    assert.equal(f.effects.length, 0);
  });

  test(
    "a live " + label + " added during confirmation cancels removal",
    async () => {
      const f = emptySessionFixture();
      await f.c.openAttendanceReminder(f.button);
      f.c.confirm = () => {
        Object.assign(f.session, structuredClone(record));
        return true;
      };
      await assert.rejects(f.c.markAttendanceReminderNotHeld());
      assert.equal(f.c.db.sessions.includes(f.session), true);
      assert.deepEqual(
        Object.fromEntries(
          Object.keys(record).map((key) => [key, f.session[key]]),
        ),
        record,
      );
      assert.equal(f.c.db.notHeldSessions, undefined);
      assert.equal(f.effects.length, 0);
    },
  );
}

for (const [label, mutate] of [
  [
    "installation",
    (f) => {
      f.c.installationToken = "restored-installation";
    },
  ],
  [
    "connection",
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
  [
    "closed term",
    (f) => {
      f.c.workspace.closed = true;
    },
  ],
  [
    "authentication",
    (f) => {
      f.c.db.settings.password = "secret";
      f.c.isAuthenticated = false;
    },
  ],
]) {
  test(
    "a changed " + label + " during empty confirmation cannot remove a session",
    async () => {
      const f = emptySessionFixture();
      await f.c.openAttendanceReminder(f.button);
      f.c.confirm = () => {
        mutate(f);
        return true;
      };
      await assert.rejects(f.c.markAttendanceReminderNotHeld());
      assert.equal(
        f.c.db.sessions.some((row) => row.id === f.session.id),
        true,
      );
      assert.equal(f.c.db.notHeldSessions, undefined);
      assert.equal(f.effects.length, 0);
    },
  );
}

test("a peer revision discovered after empty-session confirmation aborts before any data change", async () => {
  const f = emptySessionFixture();
  await f.c.openAttendanceReminder(f.button);
  f.c.confirm = () => {
    f.c.assertReportSnapshot = async () => {
      throw Error("peer changed after consent");
    };
    return true;
  };
  await assert.rejects(
    f.c.markAttendanceReminderNotHeld(),
    /peer changed after consent/,
  );
  assert.equal(f.c.db.sessions[0], f.session);
  assert.equal(f.c.db.notHeldSessions, undefined);
  assert.equal(f.effects.length, 0);
});

test("the exact live empty session identity must still exist, not merely an identical replacement", async () => {
  const f = emptySessionFixture();
  await f.c.openAttendanceReminder(f.button);
  f.c.confirm = () => {
    f.c.db.sessions[0] = structuredClone(f.session);
    return true;
  };
  await assert.rejects(f.c.markAttendanceReminderNotHeld());
  assert.equal(f.c.db.sessions.length, 1);
  assert.equal(f.c.db.notHeldSessions, undefined);
  assert.equal(f.effects.length, 0);
});

for (const [field, value] of [
  ["date", "2026-10-25"],
  ["period", 1],
  ["schoolId", "another-school"],
  ["classId", "another-class"],
  ["lessonId", "another-lesson"],
]) {
  test(
    "an empty session moved to a different " +
      field +
      " during consent is not removed",
    async () => {
      const f = emptySessionFixture();
      await f.c.openAttendanceReminder(f.button);
      f.c.confirm = () => {
        f.session[field] = value;
        return true;
      };
      await assert.rejects(f.c.markAttendanceReminderNotHeld());
      assert.equal(f.c.db.sessions[0], f.session);
      assert.equal(f.session[field], value);
      assert.equal(f.c.db.notHeldSessions, undefined);
      assert.equal(f.effects.length, 0);
    },
  );
}

for (const where of ["active", "peer"]) {
  test(
    "a second physical date/bell claimant in " +
      where +
      " records prevents empty removal",
    async () => {
      const f = emptySessionFixture(),
        duplicate = {
          ...structuredClone(f.session),
          id: "other-session",
          classId: "other-class",
          lessonId: "other-lesson",
        };
      if (where === "active") f.c.db.sessions.push(duplicate);
      else {
        f.c.readAnnualRecordSets = async () => ({
          periods: [
            { ...f.c.workspace },
            { id: "second", year: "1405-1406", revision: 1 },
          ],
          recordSets: [
            f.c.db,
            { settings: {}, schools: [], sessions: [duplicate] },
          ],
        });
      }
      await f.c.openAttendanceReminder(f.button);
      const before = structuredClone(f.c.db);
      await assert.rejects(f.c.markAttendanceReminderNotHeld());
      assert.deepEqual(f.c.db, before);
      assert.equal(f.effects.length, 0);
    },
  );
}

test("a physical slot duplicate inserted during consent cannot be hidden by not-held marking", async () => {
  const f = emptySessionFixture();
  await f.c.openAttendanceReminder(f.button);
  f.c.confirm = () => {
    f.c.db.sessions.push({
      ...structuredClone(f.session),
      id: "new-claimant",
      classId: "other-class",
    });
    return true;
  };
  await assert.rejects(f.c.markAttendanceReminderNotHeld());
  assert.equal(f.c.db.sessions.length, 2);
  assert.equal(f.c.db.notHeldSessions, undefined);
  assert.equal(f.effects.length, 0);
});

test("an existing same-identity not-held marker is never duplicated", async () => {
  const f = emptySessionFixture();
  f.c.db.notHeldSessions = [
    {
      id: "existing-marker",
      schoolId: f.item.schoolId,
      classId: f.item.classId,
      lessonId: f.item.lessonId,
      date: f.item.date,
      period: f.item.period,
      recordedAt: "2026-11-01T00:00:00.000Z",
    },
  ];
  await f.c.openAttendanceReminder(f.button);
  const outcome = f.c.markAttendanceReminderNotHeld();
  try {
    await outcome;
  } catch {
    /* Refusing a corrupt/stale dismissal is also safe. */
  }
  assert.equal(f.c.db.notHeldSessions.length, 1);
  assert.equal(f.c.db.notHeldSessions[0].id, "existing-marker");
});

for (const failedWrite of [false, true]) {
  test(
    "a matching peer marker does not require a current marker array; failed write: " +
      failedWrite,
    async () => {
      const f = emptySessionFixture(),
        originalSessions = f.c.db.sessions,
        peerData = {
          settings: {},
          schools: [],
          sessions: [],
          notHeldSessions: [
            {
              id: "peer-marker",
              date: f.item.date,
              period: f.item.period,
              schoolId: f.item.schoolId,
              classId: f.item.classId,
              lessonId: f.item.lessonId,
              recordedAt: "2026-11-01T00:00:00.000Z",
            },
          ],
        },
        originalPeer = structuredClone(peerData),
        failure = Error("write failed without recovery");
      f.c.readAnnualRecordSets = async () => ({
        periods: [
          { ...f.c.workspace },
          { id: "second", year: "1405-1406", revision: 1 },
        ],
        recordSets: [f.c.db, peerData],
      });
      await f.c.openAttendanceReminder(f.button);
      if (failedWrite)
        f.c.saveDBV24 = async () => {
          throw failure;
        };
      if (failedWrite) {
        await assert.rejects(
          f.c.markAttendanceReminderNotHeld(),
          (error) => error === failure,
        );
        assert.equal(f.c.db.sessions, originalSessions);
        assert.equal(f.c.db.sessions[0], f.session);
      } else {
        assert.equal(await f.c.markAttendanceReminderNotHeld(), true);
        assert.equal(f.c.db.sessions.length, 0);
        assert.equal(f.saves.length, 1);
      }
      assert.equal(
        (f.c.db.notHeldSessions || []).length,
        0,
        "do not duplicate the existing owner's marker",
      );
      assert.deepEqual(peerData, originalPeer);
    },
  );
}

test("a failed atomic empty-session save restores the placeholder and does not close its review", async () => {
  const f = emptySessionFixture(),
    durable = structuredClone(f.c.db);
  await f.c.openAttendanceReminder(f.button);
  f.c.saveDBV24 = async () => {
    assert.equal(f.c.db.sessions.length, 0);
    assert.equal(f.c.db.notHeldSessions.length, 1);
    f.c.db = structuredClone(durable);
    throw Error("atomic save failed");
  };
  await assert.rejects(
    f.c.markAttendanceReminderNotHeld(),
    /atomic save failed/,
  );
  assert.deepEqual(f.c.db, durable);
  assert.equal(f.effects.includes("close"), false);
});

for (const hadMarkers of [false, true]) {
  test(
    "failed save plus failed durable recovery restores only the original untouched array references; prior markers: " +
      hadMarkers,
    async () => {
      const f = emptySessionFixture(),
        failure = Error("write failed; durable recovery unavailable");
      if (hadMarkers)
        f.c.db.notHeldSessions = [
          {
            id: "prior-marker",
            date: "2026-10-23",
            period: 1,
            schoolId: "school",
            classId: "class",
            lessonId: "lesson",
            recordedAt: "2026-11-01T00:00:00.000Z",
          },
        ];
      const originalData = f.c.db,
        originalSessions = originalData.sessions,
        originalMarkers = originalData.notHeldSessions,
        before = structuredClone(originalData);
      f.c.currentSessionId = f.session.id;
      await f.c.openAttendanceReminder(f.button);
      f.c.saveDBV24 = async () => {
        assert.equal(f.c.db, originalData);
        assert.equal(f.c.db.sessions.length, 0);
        assert.equal(f.c.db.notHeldSessions.length, hadMarkers ? 2 : 1);
        throw failure;
      };
      await assert.rejects(
        f.c.markAttendanceReminderNotHeld(),
        (error) => error === failure,
      );
      assert.equal(f.c.db, originalData);
      assert.equal(f.c.db.sessions, originalSessions);
      assert.equal(f.c.db.notHeldSessions, originalMarkers);
      assert.deepEqual(f.c.db, before);
      assert.equal(
        f.c.currentSessionId,
        f.session.id,
        "failed save cannot clear the previous session selection",
      );
      assert.equal(
        f.renders.length,
        1,
        "the corrected in-memory view must be rendered after fallback",
      );
      assert.deepEqual(f.renders[0], before);
      assert.equal(f.effects.includes("close"), false);
      await assert.rejects(
        f.c.markAttendanceReminderNotHeld(),
        "the stale review must be retired after a fallback",
      );
      assert.equal(f.confirmations.length, 1);
    },
  );
}

for (const [label, mutate] of [
  [
    "authoritative recovered data",
    (f) => {
      f.c.db = structuredClone(f.c.db);
    },
  ],
  [
    "replaced sessions array",
    (f) => {
      f.c.db.sessions = f.c.db.sessions.slice();
    },
  ],
  [
    "replaced markers array",
    (f) => {
      f.c.db.notHeldSessions = f.c.db.notHeldSessions.slice();
    },
  ],
  [
    "session appended in place",
    (f) => {
      f.c.db.sessions.push({
        ...structuredClone(f.session),
        id: "later-session",
        period: 1,
        attendance: { student: "present" },
      });
    },
  ],
  [
    "marker appended in place",
    (f) => {
      f.c.db.notHeldSessions.push({
        ...f.c.db.notHeldSessions[0],
        id: "later-marker",
        period: 1,
      });
    },
  ],
  [
    "workspace object published",
    (f) => {
      f.c.workspace = { ...f.c.workspace };
    },
  ],
  [
    "workspace revision advanced",
    (f) => {
      f.c.workspace.revision++;
    },
  ],
  [
    "workspace changed",
    (f) => {
      f.c.workspace.id = "second";
    },
  ],
  [
    "connection changed",
    (f) => {
      f.c.connection = {};
    },
  ],
  [
    "installation changed",
    (f) => {
      f.c.installationToken = "replacement-installation";
    },
  ],
]) {
  test("local failure fallback must not overwrite " + label, async () => {
    const f = emptySessionFixture(),
      failure = Error("save rejected after concurrent change");
    await f.c.openAttendanceReminder(f.button);
    let changedData, changedSessions, changedMarkers, expected;
    f.c.saveDBV24 = async () => {
      mutate(f);
      changedData = f.c.db;
      changedSessions = f.c.db.sessions;
      changedMarkers = f.c.db.notHeldSessions;
      expected = structuredClone(f.c.db);
      throw failure;
    };
    await assert.rejects(
      f.c.markAttendanceReminderNotHeld(),
      (error) => error === failure,
    );
    assert.equal(f.c.db, changedData);
    assert.equal(f.c.db.sessions, changedSessions);
    assert.equal(f.c.db.notHeldSessions, changedMarkers);
    assert.deepEqual(structuredClone(f.c.db), expected);
    assert.equal(
      f.renders.length,
      0,
      "this action cannot render or undo a newer owner/data view",
    );
    assert.equal(f.effects.includes("close"), false);
  });
}

test("a post-commit feedback failure cannot resurrect a durably removed session", async () => {
  const f = emptySessionFixture(),
    failure = Error("feedback failed after commit");
  await f.c.openAttendanceReminder(f.button);
  f.c.saveDBV24 = async () => {
    assert.equal(f.c.db.sessions.length, 0);
    assert.equal(f.c.db.notHeldSessions.length, 1);
    f.c.workspace = { ...f.c.workspace, revision: f.c.workspace.revision + 1 };
    throw failure;
  };
  await assert.rejects(
    f.c.markAttendanceReminderNotHeld(),
    (error) => error === failure,
  );
  assert.equal(f.c.db.sessions.length, 0);
  assert.equal(f.c.db.notHeldSessions.length, 1);
  assert.equal(f.renders.length, 0);
});

test("a fallback rendering failure cannot hide the original save error", async () => {
  const f = emptySessionFixture(),
    originalSessions = f.c.db.sessions,
    failure = Error("original atomic save failure");
  await f.c.openAttendanceReminder(f.button);
  f.c.saveDBV24 = async () => {
    throw failure;
  };
  f.c.render = () => {
    throw Error("secondary rendering failure");
  };
  await assert.rejects(
    f.c.markAttendanceReminderNotHeld(),
    (error) => error === failure,
  );
  assert.equal(f.c.db.sessions, originalSessions);
  assert.equal(f.c.db.sessions[0], f.session);
  assert.equal(f.c.db.notHeldSessions, undefined);
  await assert.rejects(f.c.markAttendanceReminderNotHeld());
});

for (const changed of [
  "none",
  "password",
  "installation",
  "connection",
  "year",
  "revision",
]) {
  test(
    "an empty peer session requires its verified owner and fresh consent; switch change: " +
      changed,
    async () => {
      const f = emptySessionFixture(),
        firstData = { settings: {}, schools: [], sessions: [] },
        peerData = structuredClone(f.c.db);
      peerData.settings.password = "peer-password";
      f.c.db = firstData;
      f.item.sourcePeriodId = "second";
      f.c.assertWorkspaceReadable = () => {
        if (f.c.db.settings.password && !f.c.isAuthenticated)
          throw Error("locked");
      };
      f.c.readAnnualRecordSets = async () => ({
        periods: [
          { id: "first", year: "1405-1406", revision: 1 },
          { id: "second", year: "1405-1406", revision: 1 },
        ],
        recordSets: [
          firstData,
          f.c.workspace.id === "second" ? f.c.db : peerData,
        ],
      });
      f.c.switchPeriod = async (id) => {
        f.effects.push(["switch", id]);
        f.c.isAuthenticated = false;
        f.c.workspace = { id, year: "1405-1406", revision: 1 };
        f.c.db = structuredClone(peerData);
        if (changed === "password")
          f.c.db.settings.password = "changed-password";
        if (changed === "installation")
          f.c.installationToken = "new-installation";
        if (changed === "connection") f.c.connection = {};
        if (changed === "year") f.c.workspace.year = "1406-1407";
        if (changed === "revision") f.c.workspace.revision++;
      };
      await f.c.openAttendanceReminder(f.button);
      const operation = f.c.markAttendanceReminderNotHeld();
      if (changed !== "none") {
        await assert.rejects(operation);
        assert.equal(
          f.c.isAuthenticated,
          false,
          "changed authorization cannot be silently promoted",
        );
      } else {
        await operation;
        assert.equal(f.c.workspace.id, "second");
        assert.equal(f.c.isAuthenticated, true);
        assert.equal(
          f.confirmations.length,
          0,
          "switching must only reopen a fresh review, not accept removal consent",
        );
        assert.equal(f.c.db.sessions.length, 1);
        assert.equal(f.effects.includes("save"), false);
        assert.equal(await f.c.markAttendanceReminderNotHeld(), true);
        assert.equal(f.confirmations.length, 1);
        assert.equal(f.c.db.sessions.length, 0);
        assert.equal(f.c.db.notHeldSessions.length, 1);
      }
      assert.deepEqual(
        firstData,
        { settings: {}, schools: [], sessions: [] },
        "the old term must never be mutated",
      );
      if (changed !== "none") {
        assert.equal(f.c.db.sessions.length, 1);
        assert.equal(f.c.db.notHeldSessions, undefined);
        assert.equal(f.effects.includes("save"), false);
      }
    },
  );
}

test("a closed peer owner may be reviewed but can never remove its empty session", async () => {
  const f = emptySessionFixture(),
    peerData = structuredClone(f.c.db);
  f.c.db.sessions = [];
  f.item.sourcePeriodId = "second";
  f.c.readAnnualRecordSets = async () => ({
    periods: [
      { ...f.c.workspace },
      { id: "second", year: "1405-1406", revision: 1, closed: true },
    ],
    recordSets: [f.c.db, peerData],
  });
  f.c.switchPeriod = async () => {
    f.c.workspace = {
      id: "second",
      year: "1405-1406",
      revision: 1,
      closed: true,
    };
    f.c.db = structuredClone(peerData);
  };
  await f.c.openAttendanceReminder(f.button);
  await f.c.markAttendanceReminderNotHeld();
  await assert.rejects(f.c.markAttendanceReminderNotHeld(), /closed/);
  assert.equal(peerData.sessions.length, 1);
  assert.equal(f.c.db.notHeldSessions, undefined);
  assert.equal(f.effects.includes("save"), false);
});

test("rapid duplicate empty-session clicks accept at most one removal and one marker", async () => {
  const f = emptySessionFixture();
  await f.c.openAttendanceReminder(f.button);
  await Promise.all([
    f.c.markAttendanceReminderNotHeld(),
    f.c.markAttendanceReminderNotHeld(),
  ]);
  assert.equal(f.c.db.sessions.length, 0);
  assert.equal(f.c.db.notHeldSessions.length, 1);
  assert.equal(f.confirmations.length, 1);
  assert.equal(f.saves.length, 1);
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
