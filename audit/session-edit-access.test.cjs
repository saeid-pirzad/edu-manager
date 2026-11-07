"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const session = {
      id: "session",
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
      date: "2026-11-05",
      period: 0,
      attendance: { student: "present" },
      scores: [],
      roster: [{ id: "student", name: "Synthetic" }],
    },
    other = { ...structuredClone(session), id: "other" },
    effects = [],
    documentState = {
      root: null,
      hidden: true,
      decline: false,
      body: { isConnected: true, scrollTop: 0 },
      noticeScrollShift: 0,
      lockScrollShift: 0,
      legacyScroll: 0,
    };
  const makeRoot = (id) => {
    const nodes = Object.fromEntries(
      ["title", "description", "label"].map((key) => [
        key,
        { textContent: "" },
      ]),
    );
    const root = {
      isConnected: true,
      dataset: { sessionId: id },
      notice: "",
      contains: (button) => root.button === button,
      querySelector(selector) {
        if (selector === ".session-context")
          return {
            insertAdjacentHTML: (_position, html) => {
              root.notice = html;
              documentState.body.scrollTop += documentState.noticeScrollShift;
            },
          };
        if (!root.notice) return null;
        if (selector === "[data-session-edit-control]") return root.button;
        return nodes[
          selector.match(/data-session-edit-(title|description|label)/)?.[1]
        ];
      },
      querySelectorAll: () => [],
    };
    root.button = {
      isConnected: true,
      dataset: { key: id },
      setAttribute() {},
    };
    root.nodes = nodes;
    return root;
  };
  const c = vm.createContext({
    workspace: { id: "first", closed: false, revision: 1 },
    connection: {},
    installationToken: "epoch",
    currentSessionId: null,
    db: { sessions: [session, other], settings: {}, schools: [] },
    busy: 0,
    ready: true,
    blocked: false,
    fileMode: false,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    document: {
      querySelector: () => documentState.root,
      getElementById: (id) =>
        id === "modalBody"
          ? documentState.body
          : { classList: { contains: () => documentState.hidden } },
    },
    assertEntityWritable() {
      if (
        c.workspace.closed ||
        c.periodLoading ||
        c.resetBusy ||
        c.connectionRetired
      )
        throw Error("workspace readonly");
    },
    old: {
      openSessionModal(selected) {
        c.currentSessionId = selected.id;
        if (documentState.decline) return false;
        if (documentState.root) documentState.root.isConnected = false;
        documentState.root = makeRoot(selected.id);
        documentState.hidden = false;
        documentState.body.scrollTop = documentState.legacyScroll;
        documentState.afterRender?.();
        return true;
      },
    },
    esc: (value) => String(value).replace(/"/g, "&quot;"),
    EduIcons: { html: () => "<svg></svg>" },
    setControlLock: (control, _reason, locked) => {
      control.disabled = locked;
    },
    lockControls: () => {
      c.syncSessionEditNotice();
      documentState.body.scrollTop += documentState.lockScrollShift;
      documentState.afterLocks?.();
    },
    syncControlLocks: () => c.syncSessionEditNotice(),
    getSessionById: (id) => c.db.sessions.find((row) => row.id === id),
    saveDBV24: async () => effects.push("save"),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/edit-access.js"),
      "utf8",
    ),
    c,
  );
  return {
    c,
    session,
    other,
    effects,
    dom: documentState,
    unlock: () => c.toggleSessionEditing(documentState.root.button),
    close() {
      c.releaseSessionEditAccess();
      documentState.hidden = true;
    },
  };
}

test("opening a previously recorded session defaults to read-only without any data write", () => {
  const f = fixture(),
    before = JSON.stringify(f.c.db);
  f.c.openSessionModalV24(f.session);
  assert.equal(f.c.isSessionEditable("session"), false);
  assert.equal(f.dom.root.dataset.sessionMode, "view");
  assert.match(f.dom.root.nodes.label.textContent, /فعال‌کردن/);
  assert.throws(() => f.c.assertSessionEditable("session"), /فقط برای مشاهده/);
  assert.equal(JSON.stringify(f.c.db), before);
  assert.equal(f.effects.length, 0);
});

test("explicit edit control enables only this session, and locking invalidates old leases", () => {
  const f = fixture();
  f.c.openSessionModalV24(f.session);
  f.unlock();
  const token = f.c.assertSessionEditable("session");
  assert.equal(f.c.isSessionEditable("session", token), true);
  assert.equal(f.c.isSessionEditable("other"), false);
  assert.equal(f.dom.root.dataset.sessionMode, "edit");
  f.unlock();
  f.unlock();
  assert.equal(f.c.isSessionEditable("session", token), false);
  assert.equal(f.c.isSessionEditable("session"), true);
  assert.equal(f.effects.length, 0);
});

test("a genuinely new committed session starts editable but closing and reopening relocks it", () => {
  const f = fixture();
  f.c.openNewSessionDialogV24(f.session);
  assert.equal(f.c.isSessionEditable("session"), true);
  assert.equal(f.dom.root.dataset.sessionMode, "edit");
  assert.equal(f.dom.root.notice, "");
  assert.equal(f.dom.root.querySelector("[data-session-edit-control]"), null);
  f.close();
  assert.equal(
    f.dom.root.isConnected,
    true,
    "generic close may leave the old DOM connected",
  );
  assert.equal(f.c.isSessionEditable("session"), false);
  f.c.openSessionModalV24(f.session);
  assert.equal(f.c.isSessionEditable("session"), false);
  assert.match(f.dom.root.notice, /data-session-edit-control/);
  assert.match(f.dom.root.nodes.label.textContent, /فعال‌کردن/);
});

test("the initial creation dialog stays directly editable without an edit notice after internal rerender", () => {
  const f = fixture();
  f.c.openNewSessionDialogV24(f.session);
  const token = f.c.assertSessionEditable("session"),
    root = f.dom.root;
  f.c.workspace = { ...f.c.workspace, revision: 2 };
  f.session.scores.push({
    studentId: "student",
    type: "positive",
    value: 0.25,
  });
  f.c.openSessionModalV24(f.session, { activitySaved: {} });
  assert.equal(root.isConnected, false);
  assert.equal(f.c.isSessionEditable("session"), true);
  assert.equal(f.c.isSessionEditable("session", token), false);
  assert.equal(f.dom.root.notice, "");
  assert.equal(f.dom.root.querySelector("[data-session-edit-control]"), null);
  assert.equal(Object.hasOwn(f.session, "freshCreation"), false);
  assert.equal(f.effects.length, 0);
});

test("creation dialog state never carries into a different recorded session or an opener option", () => {
  const f = fixture();
  f.c.openNewSessionDialogV24(f.session);
  f.c.openSessionModalV24(f.other, { created: true, freshCreation: true });
  assert.equal(f.c.isSessionEditable("other"), false);
  assert.equal(f.dom.root.dataset.sessionMode, "view");
  assert.match(f.dom.root.notice, /data-session-edit-control/);
  f.c.openSessionModalV24(f.session);
  assert.equal(f.c.isSessionEditable("session"), false);
  assert.match(f.dom.root.notice, /data-session-edit-control/);
});

test("a stored empty session never counts as a new creation", () => {
  const f = fixture();
  f.session.attendance = {};
  f.c.openSessionModalV24(f.session);
  assert.equal(f.c.isSessionEditable("session"), false);
});

test("internal same-session rerender preserves edit mode but not stale callbacks", () => {
  const f = fixture();
  f.c.openSessionModalV24(f.session);
  f.unlock();
  const token = f.c.assertSessionEditable("session"),
    oldRoot = f.dom.root;
  f.c.workspace = { ...f.c.workspace, revision: 2 };
  f.c.openSessionModalV24(f.session, { activitySaved: {} });
  assert.equal(oldRoot.isConnected, false);
  assert.equal(f.c.isSessionEditable("session"), true);
  assert.equal(f.c.isSessionEditable("session", token), false);
});

for (const mode of ["view", "edit", "creation"])
  test(
    "same-session " +
      mode +
      " rerender restores scroll after notice and control layout shifts",
    () => {
      const f = fixture();
      if (mode === "creation") f.c.openNewSessionDialogV24(f.session);
      else {
        f.c.openSessionModalV24(f.session);
        if (mode === "edit") f.unlock();
      }
      f.dom.body.scrollTop = 120;
      f.dom.legacyScroll = 120;
      f.dom.noticeScrollShift = 40;
      f.dom.lockScrollShift = 33;
      f.c.openSessionModalV24(f.session);
      assert.equal(f.dom.body.scrollTop, 120);
      assert.equal(f.c.isSessionEditable("session"), mode !== "view");
      assert.equal(f.effects.length, 0);
    },
  );

test("same-session rerender also preserves a zero scroll position", () => {
  const f = fixture();
  f.c.openSessionModalV24(f.session);
  f.dom.noticeScrollShift = 40;
  f.dom.lockScrollShift = 33;
  f.c.openSessionModalV24(f.session);
  assert.equal(f.dom.body.scrollTop, 0);
});

test("first opening and switching sessions keep the new dialog's own scroll", () => {
  const f = fixture();
  f.dom.body.scrollTop = 120;
  f.dom.legacyScroll = 7;
  f.dom.noticeScrollShift = 40;
  f.dom.lockScrollShift = 33;
  f.c.openSessionModalV24(f.session);
  assert.equal(f.dom.body.scrollTop, 80);
  f.dom.body.scrollTop = 120;
  f.c.openSessionModalV24(f.other);
  assert.equal(f.dom.body.scrollTop, 80);
});

test("a declined same-session render does not apply any scroll restoration", () => {
  const f = fixture();
  f.c.openSessionModalV24(f.session);
  f.dom.body.scrollTop = 120;
  f.dom.decline = true;
  const open = f.c.old.openSessionModal;
  f.c.old.openSessionModal = (session) => {
    const result = open(session);
    f.dom.body.scrollTop = 37;
    return result;
  };
  assert.equal(f.c.openSessionModalV24(f.session), false);
  assert.equal(f.dom.body.scrollTop, 37);
});

const invalidateScrollContext = [
  ["workspace", (f) => (f.c.workspace.id = "second")],
  ["installation", (f) => (f.c.installationToken = "replaced")],
  ["connection", (f) => (f.c.connection = {})],
  ["data bank", (f) => (f.c.db = structuredClone(f.c.db))],
  [
    "session identity",
    (f) => (f.c.db.sessions[0] = structuredClone(f.session)),
  ],
  ["selection", (f) => (f.c.currentSessionId = "other")],
  ["hidden modal", (f) => (f.dom.hidden = true)],
  ["detached root", (f) => (f.dom.root.isConnected = false)],
  ["changed root session", (f) => (f.dom.root.dataset.sessionId = "other")],
  ["detached modal body", (f) => (f.dom.body.isConnected = false)],
];

for (const [label, invalidate] of invalidateScrollContext)
  test(
    "an invalid " +
      label +
      " before rerender cannot carry scroll into a new context",
    () => {
      const f = fixture();
      f.c.openSessionModalV24(f.session);
      f.dom.body.scrollTop = 120;
      f.dom.legacyScroll = 7;
      f.dom.noticeScrollShift = 40;
      f.dom.lockScrollShift = 33;
      invalidate(f);
      f.c.openSessionModalV24(f.c.db.sessions[0]);
      assert.equal(f.dom.body.scrollTop, 80);
    },
  );

for (const [label, invalidate] of invalidateScrollContext)
  test(
    "a " + label + " invalidated during locks cannot receive the old scroll",
    () => {
      const f = fixture();
      f.c.openSessionModalV24(f.session);
      f.dom.body.scrollTop = 120;
      f.dom.legacyScroll = 7;
      f.dom.noticeScrollShift = 40;
      f.dom.lockScrollShift = 33;
      f.dom.afterLocks = () => invalidate(f);
      f.c.openSessionModalV24(f.session);
      assert.equal(f.dom.body.scrollTop, 80);
    },
  );

test("a replaced modal body during render cannot receive the old body's scroll", () => {
  const f = fixture();
  f.c.openSessionModalV24(f.session);
  const previousBody = f.dom.body;
  previousBody.scrollTop = 120;
  f.dom.afterRender = () => {
    f.dom.body = { isConnected: true, scrollTop: 37 };
  };
  f.c.openSessionModalV24(f.session);
  assert.equal(f.dom.body.scrollTop, 37);
  assert.equal(previousBody.scrollTop, 0);
});

for (const [label, change] of [
  [
    "hidden",
    (f) => {
      f.dom.hidden = true;
    },
  ],
  [
    "different modal",
    (f) => {
      f.dom.root.isConnected = false;
    },
  ],
  [
    "workspace",
    (f) => {
      f.c.workspace.id = "second";
    },
  ],
  [
    "installation",
    (f) => {
      f.c.installationToken = "restored";
    },
  ],
  [
    "connection",
    (f) => {
      f.c.connection = {};
    },
  ],
  [
    "bank rollback",
    (f) => {
      f.c.db = structuredClone(f.c.db);
    },
  ],
  [
    "session replacement",
    (f) => {
      f.c.db.sessions[0] = structuredClone(f.session);
    },
  ],
  [
    "selected session",
    (f) => {
      f.c.currentSessionId = "other";
    },
  ],
])
  test("a " + label + " invalidates the edit lease", () => {
    const f = fixture();
    f.c.openNewSessionDialogV24(f.session);
    const token = f.c.assertSessionEditable("session");
    change(f);
    assert.equal(f.c.isSessionEditable("session", token), false);
    assert.throws(() => f.c.assertSessionEditable("session"));
  });

test("a session with the same ID after term navigation does not inherit old permission", () => {
  const f = fixture();
  f.c.openNewSessionDialogV24(f.session);
  f.c.workspace.id = "second";
  f.c.db = structuredClone(f.c.db);
  f.c.openSessionModalV24(f.c.db.sessions[0]);
  assert.equal(f.c.isSessionEditable("session"), false);
});

test("a declined modal replacement does not change the active selection or existing lease", () => {
  const f = fixture();
  f.c.openNewSessionDialogV24(f.session);
  const token = f.c.assertSessionEditable("session");
  f.dom.decline = true;
  assert.equal(f.c.openSessionModalV24(f.other), false);
  assert.equal(f.c.currentSessionId, "session");
  assert.equal(f.c.isSessionEditable("session", token), true);
});

test("closed workspaces, pending writes and detached controls cannot enable session edits", () => {
  const f = fixture();
  f.c.openSessionModalV24(f.session);
  f.c.workspace.closed = true;
  assert.throws(f.unlock, /workspace readonly/);
  f.c.workspace.closed = false;
  f.c.busy = 1;
  assert.throws(f.unlock, /ثبت قبلی/);
  f.c.busy = 0;
  assert.throws(() =>
    f.c.toggleSessionEditing({
      dataset: { key: "session" },
      isConnected: false,
    }),
  );
  assert.equal(f.c.isSessionEditable("session"), false);
});

function recoveryFixture(editable = true, freshCreation = false) {
  const f = fixture();
  if (freshCreation) f.c.openNewSessionDialogV24(f.session);
  else {
    f.c.openSessionModalV24(f.session);
    if (editable) f.unlock();
  }
  const recovery = f.c.captureSessionEditRecovery(),
    previous = f.c.db,
    loaded = {
      period: { id: "first", revision: 1 },
      installationToken: "epoch",
      data: structuredClone(previous),
    },
    expected = {
      workspaceId: "first",
      revision: 1,
      connection: f.c.connection,
      installation: "epoch",
    };
  f.c.db = loaded.data;
  return { ...f, recovery, previous, loaded, expected };
}

test("an own failed-save rollback restores the existing consent for the same continuously open dialog", () => {
  const f = recoveryFixture();
  f.previous.sessions[0].date = "2026-11-04";
  assert.equal(
    f.c.rebindSessionEditAfterRollback(
      f.recovery,
      f.previous,
      f.loaded,
      f.expected,
    ),
    true,
  );
  assert.equal(f.c.isSessionEditable("session"), true);
  assert.equal(f.c.isSessionEditable("session", f.recovery.token), false);
  assert.equal(f.c.db.sessions[0].date, "2026-11-05");
});

test("an own failed-save rollback preserves the creation dialog until it is closed, without persisting its mode", () => {
  const f = recoveryFixture(true, true);
  assert.equal(
    f.c.rebindSessionEditAfterRollback(
      f.recovery,
      f.previous,
      f.loaded,
      f.expected,
    ),
    true,
  );
  f.c.openSessionModalV24(f.c.db.sessions[0]);
  assert.equal(f.c.isSessionEditable("session"), true);
  assert.equal(f.dom.root.notice, "");
  assert.equal(Object.hasOwn(f.c.db.sessions[0], "freshCreation"), false);
  f.close();
  f.c.openSessionModalV24(f.c.db.sessions[0]);
  assert.equal(f.c.isSessionEditable("session"), false);
  assert.match(f.dom.root.notice, /data-session-edit-control/);
});

test("rollback never creates consent for a read-only session", () => {
  const f = recoveryFixture(false);
  assert.equal(
    f.c.rebindSessionEditAfterRollback(
      f.recovery,
      f.previous,
      f.loaded,
      f.expected,
    ),
    true,
  );
  assert.equal(f.c.isSessionEditable("session"), false);
});

for (const [label, mutate] of [
  [
    "a peer's durable revision",
    (f) => {
      f.loaded.period.revision++;
    },
  ],
  [
    "a peer's durable installation replacement",
    (f) => {
      f.loaded.installationToken = "replaced";
    },
  ],
  [
    "a changed in-memory revision",
    (f) => {
      f.c.workspace.revision++;
    },
  ],
  [
    "a new installation",
    (f) => {
      f.c.installationToken = "other";
    },
  ],
  [
    "a new connection",
    (f) => {
      f.c.connection = {};
    },
  ],
  [
    "a switched workspace",
    (f) => {
      f.c.workspace.id = "second";
    },
  ],
  [
    "a closed term",
    (f) => {
      f.c.workspace.closed = true;
    },
  ],
  [
    "a blocked conflict",
    (f) => {
      f.c.blocked = true;
    },
  ],
  [
    "a replaced session identity",
    (f) => {
      f.loaded.data.sessions[0].lessonId = "another-lesson";
    },
  ],
  [
    "a hidden dialog",
    (f) => {
      f.dom.hidden = true;
    },
  ],
  [
    "a modal closed and reopened during recovery",
    (f) => {
      f.close();
      f.c.openSessionModalV24(f.c.db.sessions[0]);
    },
  ],
])
  test("rollback cannot revive edit permission after " + label, () => {
    const f = recoveryFixture();
    mutate(f);
    assert.equal(
      f.c.rebindSessionEditAfterRollback(
        f.recovery,
        f.previous,
        f.loaded,
        f.expected,
      ),
      false,
    );
    assert.equal(f.c.isSessionEditable("session"), false);
  });

for (const [name, invoke] of [
  [
    "individual attendance",
    (c) => c.toggleAttendanceV24({ isConnected: true }, "absent"),
  ],
  ["bulk attendance", (c) => c.setAllAttendanceV24("absent")],
  ["copy previous attendance", (c) => c.copyPreviousAttendanceV24("session")],
  ["date and bell", (c) => c.changeSessionDateV24("session")],
  ["module and unit", (c) => c.saveSessionUnitV24()],
  ["module option change", (c) => c.updateSessionUnitsV24()],
  ["activity removal", (c) => c.removeSessionScoreV24("session", 0)],
  [
    "activity addition",
    (c) => c.addSessionScoreV24({ preventDefault() {}, target: {} }, "session"),
  ],
])
  test(
    "locked " +
      name +
      " refuses direct handler invocation before any data mutation",
    async () => {
      const f = fixture();
      vm.runInContext(
        fs.readFileSync(
          path.join(__dirname, "../src/workspace/sessions/actions.js"),
          "utf8",
        ),
        f.c,
      );
      f.c.openSessionModalV24(f.session);
      const before = JSON.stringify(f.c.db);
      await assert.rejects(async () => invoke(f.c), /فقط برای مشاهده/);
      assert.equal(JSON.stringify(f.c.db), before);
      assert.equal(f.effects.length, 0);
    },
  );
