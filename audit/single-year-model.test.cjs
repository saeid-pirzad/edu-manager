"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = (name) =>
  fs.readFileSync(path.join(__dirname, "../src", name), "utf8");
const period = (
  id,
  year = "1405-1406",
  kind = "first",
  createdAt = "2026-11-02T00:00:00Z",
) => ({
  id,
  year,
  term:
    { first: "اول", second: "دوم", summer: "تابستان" }[kind] || "سوابق پیشین",
  termKind: ["first", "second", "summer"].includes(kind) ? kind : null,
  revision: 1,
  closed: false,
  createdAt,
});
function fixture() {
  const storage = new Map(),
    session = new Map(),
    api = (map) => ({
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    }),
    c = vm.createContext({
      structuredClone,
      localStorage: api(storage),
      sessionStorage: api(session),
      academicTermKind: (term) =>
        ({ اول: "first", دوم: "second", تابستان: "summer" })[
          String(term).split(" — بازیابی ")[0]
        ] || null,
    });
  for (const name of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "workspace/periods/single-year.js",
    "workspace/collaboration/session-drafts.js",
  ])
    vm.runInContext(source(name), c);
  return { c, storage, session };
}
function bootstrapFixture(rows, marker = null) {
  const f = fixture(),
    { c, storage, session } = f,
    calls = [];
  Object.assign(c, {
    document: { getElementById: () => ({ innerHTML: "" }) },
    claimTab: async () => {},
    openDatabase: async () => ({}),
    readRecord: async (store, key) =>
      key === "@installation-reset" ? marker : null,
    RESET_RECORD_KEY: "@installation-reset",
    RESET_EPOCH_KEY: "reset",
    allFrom: async () => rows,
    synchronizeYearNotesScope: async () => {},
    synchronizeAcademicYearsForRead: async () => ({ changed: [] }),
    readWorkspaceSnapshot: async (id) => ({
      period: rows.find((row) => row.id === id),
      data: { settings: { password: "protected-value" } },
      records: new Map(),
    }),
    completeResetCleanup: async () => {
      storage.clear();
      session.clear();
      calls.push("cleanup");
    },
    setStatus: (message, state) => calls.push({ message, state }),
    hydrateReportNotes() {},
    loadDrafts: async () => {},
    render: () => calls.push("render"),
    recoverDrafts: async () => {},
    restoreSingleFile: async () => {},
    navigator: {},
    ready: false,
    isAuthenticated: false,
    esc: String,
  });
  vm.runInContext(source("workspace/core/bootstrap.js"), c);
  return { ...f, calls };
}
test("an explicit academic-year anchor defeats a stale preference in another year without changing catalog data", () => {
  const { c } = fixture(),
    rows = [
      period("first"),
      period("second", "1405-1406", "second"),
      period("unrelated", "1404-1405", "second"),
    ],
    before = JSON.stringify(rows);
  assert.equal(
    c.selectAcademicWorkspace(rows, {
      year: "۱۴۰۵/۱۴۰۶",
      preferredId: "unrelated",
    }).id,
    "second",
  );
  assert.equal(JSON.stringify(rows), before);
});
test("a represented preferred identity determines the year only when the stored anchor is stale or absent", () => {
  const { c } = fixture(),
    rows = [period("old", "1404-1405"), period("current")];
  for (const year of [undefined, "1399-1400"])
    assert.equal(
      c.selectAcademicWorkspace(rows, { year, preferredId: "old" }).id,
      "old",
    );
});
test("no preference chooses the latest academic year, not the newest-created restored backup", () => {
  const { c } = fixture(),
    rows = [
      period("old-import", "1404-1405", "first", "2099-01-01T00:00:00Z"),
      period("current", "1405-1406", "first", "2020-01-01T00:00:00Z"),
    ];
  assert.equal(c.selectAcademicWorkspace(rows).id, "current");
  assert.equal(c.selectAcademicWorkspace([...rows].reverse()).id, "current");
});
test("fixed term selection prefers the second term while an explicit first-term identity remains first", () => {
  const { c } = fixture(),
    rows = [period("second", "1405-1406", "second"), period("first")];
  assert.equal(c.selectAcademicWorkspace(rows).id, "second");
  assert.equal(
    c.selectAcademicWorkspace(rows, { preferredId: "first" }).id,
    "first",
  );
});
test("duplicate term slots cannot be chosen silently, but an explicit saved identity remains recoverable", () => {
  const { c } = fixture(),
    rows = [period("first"), period("first-copy")];
  assert.throws(
    () => c.selectAcademicWorkspace(rows),
    (error) => error.code === "ACADEMIC_TERM_AMBIGUOUS",
  );
  assert.equal(
    c.selectAcademicWorkspace(rows, { preferredId: "first-copy" }).id,
    "first-copy",
  );
  assert.match(
    c.academicWorkspaceRecoveryWarning(rows[1], rows),
    /چند نسخه.*حذف نشده/,
  );
});
test("legacy summer or unknown entries remain unchanged and need an explicit identity for a recovery view", () => {
  const { c } = fixture();
  for (const kind of ["summer", "unknown"]) {
    const rows = [period("legacy", "1405-1406", kind)],
      before = JSON.stringify(rows);
    assert.throws(
      () => c.selectAcademicWorkspace(rows),
      (error) => error.code === "ACADEMIC_TERM_SELECTION_REQUIRED",
    );
    assert.equal(
      c.selectAcademicWorkspace(rows, { preferredId: "legacy" }),
      rows[0],
    );
    assert.match(
      c.academicWorkspaceRecoveryWarning(rows[0], rows),
      /نمای بازیابی.*تبدیل نشده/,
    );
    assert.equal(JSON.stringify(rows), before);
  }
});
test("preferences normalize the year and ignore invalid or inaccessible browser storage without inventing data", () => {
  const { c, storage } = fixture();
  assert.equal(c.preferredAcademicYear(), null);
  c.rememberAcademicYear("۱۴۰۵–۱۴۰۶");
  assert.equal(storage.get("Edu24.academicYear"), "1405-1406");
  assert.equal(c.preferredAcademicYear(), "1405-1406");
  storage.set("Edu24.academicYear", "bad year");
  assert.equal(c.preferredAcademicYear(), null);
  c.localStorage.getItem = () => {
    throw Error("blocked");
  };
  c.localStorage.setItem = () => {
    throw Error("blocked");
  };
  assert.equal(c.preferredAcademicYear(), null);
  assert.equal(c.rememberAcademicYear("1405-1406"), "1405-1406");
});
test("remembering the current term persists its year, but a stale identity cannot silently re-anchor another year", () => {
  const { c, storage } = fixture();
  c.workspace = period("current");
  c.rememberPeriod("current");
  assert.equal(storage.get("Edu24.academicYear"), "1405-1406");
  c.rememberPeriod("stale-old-id");
  assert.equal(storage.get("Edu24.academicYear"), "1405-1406");
});
test("bootstrap obeys the persisted year and preserves protected-term authentication boundaries", async () => {
  const rows = [
      period("old", "1404-1405"),
      period("first"),
      period("second", "1405-1406", "second"),
    ],
    { c, storage, session, calls } = bootstrapFixture(rows);
  storage.set("Edu24.academicYear", "1405-1406");
  session.set("Edu24.activePeriod", "old");
  await c.bootstrapV24();
  assert.equal(c.workspace.id, "second");
  assert.equal(c.workspace.year, "1405-1406");
  assert.equal(c.isAuthenticated, false);
  assert.equal(c.ready, true);
  assert.equal(calls.filter((call) => call === "render").length, 1);
  assert.equal(rows.length, 3);
});

for (const phase of ["cleanup", "complete"]) {
  test(`reload after a committed restore (${phase} marker) recovers its durable selected year instead of the newest unrelated year`, async () => {
    const rows = [
        period("restored-first"),
        period("restored-second", "1405-1406", "second"),
        period("unrelated-latest", "1407-1408"),
      ],
      marker = {
        value: {
          token: "restore",
          phase,
          academicYear: "1405-1406",
          activeWorkspace: "restored-first",
        },
      },
      { c, storage, session } = bootstrapFixture(rows, marker);
    session.set("Edu24.activePeriod", "unrelated-latest");
    await c.bootstrapV24();
    assert.equal(c.workspace.id, "restored-first");
    assert.equal(c.workspace.year, "1405-1406");
    assert.equal(c.ready, true);
    assert.equal(storage.get("Edu24.academicYear"), "1405-1406");
    assert.equal(c.isAuthenticated, false);
  });
}
test("ordinary later term preferences win over an older completed restore marker", async () => {
  const rows = [period("first"), period("second", "1405-1406", "second")],
    { c, storage, session } = bootstrapFixture(rows, {
      value: {
        token: "restore",
        phase: "complete",
        academicYear: "1405-1406",
        activeWorkspace: "first",
      },
    });
  storage.set("Edu24.academicYear", "1405-1406");
  session.set("Edu24.activePeriod", "second");
  await c.bootstrapV24();
  assert.equal(c.workspace.id, "second");
});
test("legacy reset markers and invalid or mismatched anchor fields do not invent a restored view", () => {
  const { c } = fixture(),
    rows = [period("current"), period("old", "1404-1405")];
  for (const value of [
    { token: "wipe", phase: "complete" },
    { academicYear: "bad", activeWorkspace: "old" },
    { academicYear: "1405-1406", activeWorkspace: "old" },
    { academicYear: "1404-1405", activeWorkspace: "missing" },
  ]) {
    const preferences = c.academicBootstrapPreferences(rows, {
      resetMarker: { value },
    });
    assert.equal(c.selectAcademicWorkspace(rows, preferences).id, "current");
  }
});
test("first migration of legacy local data without a term keeps the newly installed identity as an explicit recovery view", async () => {
  const rows = [],
    { c, storage, calls } = bootstrapFixture(rows),
    legacy = {
      settings: { academicYear: "1405-1406", password: "" },
      schools: [],
      sessions: [],
    };
  c.STORAGE_KEY = "legacy-school-data";
  storage.set(c.STORAGE_KEY, JSON.stringify(legacy));
  c.normalizeDB = (data) => ({
    ...structuredClone(data),
    settings: { ...data.settings, academicTerm: "اول" },
  });
  c.putBackup = async () => {};
  c.installWorkspace = async (data, details) => {
    const installed = {
      ...period(details.id),
      term: details.term,
      termKind: c.academicTermKind(details.term),
    };
    rows.push(installed);
    c.readWorkspaceSnapshot = async () => ({
      period: installed,
      data,
      records: new Map(),
    });
    return installed;
  };
  c.readWorkspace = async () => ({ data: legacy });
  await c.bootstrapV24();
  assert.equal(c.ready, true);
  assert.equal(c.workspace.id, "initial");
  assert.equal(c.workspace.term, "سوابق پیشین");
  assert.equal(c.workspace.termKind, null);
  assert.equal(storage.has(c.STORAGE_KEY), false);
  assert.ok(
    calls.some(
      (call) =>
        call?.state === "pending" && call.message.includes("نمای بازیابی"),
    ),
  );
});
test("a full snapshot retains records, reports, events and drafts from every legacy year and summer entry", async () => {
  const { c } = fixture(),
    rows = [
      period("active"),
      period("old", "1404-1405"),
      period("summer", "1404-1405", "summer"),
    ],
    stores = {
      catalog: rows,
      records: rows.map((row) => ({
        key: row.id + "|meta",
        workspace: row.id,
        logical: "meta",
        value: { preserved: row.id },
      })),
      reports: rows.map((row) => ({
        id: "report-" + row.id,
        workspace: row.id,
      })),
      events: rows.map((row) => ({ workspace: row.id, action: "preserved" })),
      undo: [],
      backups: [],
      drafts: [
        {
          key: "Edu24.drafts.old.tab.owner",
          workspace: "old",
          generation: 1,
          updatedAt: "2026-11-02T00:00:00Z",
          entries: [{ kind: "k", value: "0" }],
        },
      ],
    };
  stores.records.push({
    key: "@installation-reset",
    workspace: null,
    logical: "installation-reset",
    value: {
      token: "restore",
      phase: "complete",
      academicYear: "1405-1406",
      activeWorkspace: "active",
    },
  });
  Object.assign(c, {
    workspace: rows[0],
    ready: true,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    draftWriter: Promise.resolve(),
    storeDrafts: async () => {},
    draftStorageKey: () => "Edu24.drafts.active.tab.owner",
    documentToken: "owner",
    draftGeneration: 0,
    drafts: new Map(),
    clone: structuredClone,
    backupStores: [
      "catalog",
      "records",
      "reports",
      "events",
      "undo",
      "backups",
    ],
    connection: {
      transaction: () => ({
        objectStore: (name) => ({
          getAll: () => structuredClone(stores[name]),
        }),
      }),
    },
    requestPromise: async (value) => value,
    transactionDone: async () => {},
    RESET_RECORD_KEY: "@installation-reset",
    window: {
      EduPeriodicReports: { getDrafts: (id) => ({ [id]: "preserved" }) },
    },
    installationToken: "restore",
  });
  vm.runInContext(source("domain/grade-drafts.js"), c);
  vm.runInContext(source("domain/deputy-export-identity.js"), c);
  vm.runInContext(source("workspace/backups/full-export.js"), c);
  const snapshot = await c.snapshotInstallation();
  for (const store of ["catalog", "records", "reports", "events"])
    assert.equal(
      JSON.stringify(snapshot.stores[store]),
      JSON.stringify(
        store === "records"
          ? stores.records.filter((row) => row.key !== "@installation-reset")
          : stores[store],
      ),
    );
  assert.equal(
    snapshot.stores.records.some((row) => row.key === "@installation-reset"),
    false,
  );
  assert.equal(snapshot.gradeDrafts[0].workspace, "old");
  assert.equal(snapshot.reportDrafts.summer.summer, "preserved");
  assert.equal(snapshot.activeWorkspace, "active");
});
