"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture({ syncFailure = false, asyncFailure = false } = {}) {
  const committed = [];
  let sequence = 0,
    aborted = false;
  const names = ["records", "catalog", "events", "backups", "undo", "reports"];
  const period = {
    id: "source",
    year: "1405-1406",
    term: "اول",
    revision: 2,
    closed: true,
  };
  const current = {
    id: "original",
    revision: 4,
    year: "1404-1405",
    term: "دوم",
    closed: true,
  };
  const source = {
    activeWorkspace: period.id,
    gradeDrafts: [],
    stores: Object.fromEntries(names.map((name) => [name, []])),
  };
  source.stores.catalog = [period];
  const safety = { stores: { catalog: [current] }, format: "safety-snapshot" };
  const c = vm.createContext({
    assessmentContext: { hasDrafts: () => false, dispose: async () => {} },
    synchronizeYearNotesScope: async () => {},
    workspace: { ...current },
    resetBusy: false,
    fileMode: false,
    ready: true,
    blocked: false,
    connectionRetired: false,
    periodLoading: false,
    busy: 0,
    singleFileTimer: null,
    singleFile: null,
    singleFileWriting: null,
    singleFileKey: "file",
    pauseSingleFile() {},
    startSingleFile() {},
    lockControls() {},
    assertWorkspaceReadable() {},
    captureWorkspaceContext: () => ({
      id: c.workspace.id,
      revision: c.workspace.revision,
    }),
    EduFullBackupValidator: {
      create: () =>
        Object.assign(
          () =>
            source.stores.catalog.map((saved) => ({
              period: saved,
              data: { settings: { academicTerm: saved.term }, sessions: [] },
            })),
          { normalize: (value) => value },
        ),
    },
    backupStores: names,
    assertSafeDataTree() {},
    isDataObject() {},
    isSafeRecordId() {},
    validateReportNotes: () => ({}),
    decodeWorkspaceRecords() {},
    validateFrozenReport() {},
    normalizeDB() {},
    validatedUndoCandidate() {},
    isSupportedGradeDraft() {},
    document: { getElementById: () => ({ checked: true }) },
    showModal: () => true,
    esc: (value) => String(value),
    confirm: () => true,
    writer: Promise.resolve(),
    draftWriter: Promise.resolve(),
    snapshotInstallation: async () => safety,
    uid: () => "new_" + ++sequence,
    collectRecords: (data) => new Map([["meta", data]]),
    clone: structuredClone,
    window: { EduPeriodicReports: { resetDrafts() {} } },
    setStatus() {},
    resetScreen() {},
    transactionDone: (tx) => tx.done,
    broadcast() {},
    completeResetCleanup: async () => {},
    RESET_RECORD_KEY: "@installation-reset",
    installationToken: "",
    drafts: new Map(),
    draftGeneration: 0,
    writeFailureGeneration: 0,
    rememberPeriod() {},
    rememberAcademicYear() {},
    academicWorkspaceRecoveryWarning: () => "",
    hydrateReportNotes() {},
    loadDrafts: async () => {},
    closeModal() {},
    render() {},
    readWorkspaceSnapshot: async () => ({
      period: committed.find((row) => row.name === "catalog" && row.row).row,
      data: { restored: true },
      records: new Map(),
    }),
    connection: {
      transaction: () => {
        const queued = [];
        let resolve, reject;
        const done = new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        });
        setImmediate(() => {
          if (aborted) return;
          if (asyncFailure) return reject(Error("asynchronous write failure"));
          committed.push(...queued);
          resolve();
        });
        return {
          done,
          abort() {
            aborted = true;
            reject(Error("transaction aborted"));
          },
          objectStore: (name) => ({
            getAll() {
              const request = { result: [current] };
              queueMicrotask(() => request.onsuccess());
              return request;
            },
            clear() {
              queued.push({ name, clear: true });
            },
            add(row) {
              if (syncFailure && name === "catalog")
                throw Error("synchronous write failure");
              queued.push({ name, row });
            },
            put(row) {
              queued.push({ name, row });
            },
          }),
        };
      },
    },
  });
  for (const source of ["domain/calendar.js", "domain/academic-year.js"])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
      c,
    );
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/full-restore.js"),
      "utf8",
    ),
    c,
  );
  c.previewFullBackup(source);
  return { c, source, safety, committed, aborted: () => aborted };
}
test("full restore preview isolates its layout and exposes inline errors and cancellation", () => {
  const { c, source } = fixture();
  let html;
  c.showModal = (title, body) => {
    html = body;
    return true;
  };
  source.exportedAt = "2026-10-31T10:00:00Z";
  c.previewFullBackup(source);
  assert.match(html, /class="full-restore"/);
  assert.match(html, /id="operationError" role="alert"/);
  assert.match(html, /for="fullRestoreConfirmed"/);
  assert.match(html, /data-workspace-action="close"/);
  assert.match(html, /ادغام نمی‌شود/);
  assert.doesNotMatch(html, /courseError|در فایل ثبت نشده/);
});

test("synchronous write failure rolls back all clears and queued restore writes", async () => {
  const { c, committed, aborted } = fixture({ syncFailure: true });
  await assert.rejects(c.restoreFullBackup(), /synchronous write failure/);
  assert.equal(committed.length, 0);
  assert.equal(aborted(), true);
});
test("asynchronous transaction failure preserves the current workspace", async () => {
  const { c, committed } = fixture({ asyncFailure: true });
  await assert.rejects(c.restoreFullBackup(), /asynchronous write failure/);
  assert.equal(committed.length, 0);
  assert.equal(c.workspace.id, "original");
});
test("full restore preserves period identities and closed status and keeps a safety snapshot", async () => {
  const { c, committed, safety } = fixture();
  assert.equal(await c.restoreFullBackup(), 1);
  const periods = committed.filter((row) => row.name === "catalog" && row.row);
  assert.equal(periods.length, 1);
  assert.equal(periods[0].row.id, "source");
  assert.equal(periods[0].row.closed, true);
  assert.equal(c.workspace.id, "source");
  assert.ok(
    committed.some((row) => row.name === "backups" && row.row?.full === safety),
  );
});

for (const stalePeer of [false, true]) {
  test(`full restore remaps only snapshot-matching recovered-name undo guards (${stalePeer ? "stale peer" : "current peers"})`, async () => {
    const f = fixture();
    f.source.stores.catalog.push({
      ...f.source.stores.catalog[0],
      id: "second",
      term: "دوم",
      revision: 4,
    });
    f.source.stores.undo.push({
      id: "source",
      revision: 2,
      action: "اصلاح نام بازیابی‌شده",
      before: [],
      recoveredPeers: [
        {
          id: "second",
          revision: stalePeer ? 3 : 4,
          rosters: [],
          migrationWarnings: ["نام دانش‌آموز a در کلاس نیازمند بررسی است."],
        },
      ],
    });
    f.c.previewFullBackup(f.source);
    const sourceJson = JSON.stringify(f.source);
    await f.c.restoreFullBackup();
    const restoredCatalog = f.committed
        .filter((row) => row.name === "catalog" && row.row)
        .map((row) => row.row),
      restoredUndo = f.committed.find(
        (row) => row.name === "undo" && row.row,
      ).row;
    assert.equal(restoredUndo.revision, 3);
    assert.equal(
      restoredCatalog.find((row) => row.id === "second").revision,
      5,
    );
    assert.equal(restoredUndo.recoveredPeers[0].revision, stalePeer ? 3 : 5);
    assert.equal(JSON.stringify(f.source), sourceJson);
  });
}
test("full restore requires confirmation before taking a snapshot or writing", async () => {
  const { c, committed } = fixture();
  c.document.getElementById = () => ({ checked: false });
  c.snapshotInstallation = async () => {
    throw Error("must not snapshot");
  };
  await assert.rejects(c.restoreFullBackup(), /تأیید/);
  assert.equal(committed.length, 0);
});
test("active full-restore preview cannot be replaced", async () => {
  const { c, source, safety } = fixture();
  let release;
  c.snapshotInstallation = () =>
    new Promise((resolve) => {
      release = () => resolve(safety);
    });
  const pending = c.restoreFullBackup();
  assert.throws(() => c.previewFullBackup({}), /در حال انجام/);
  assert.equal(vm.runInContext("pendingFullBackup", c), source);
  release();
  await pending;
});
test("workspace switch before restore prevents replacement writes", async () => {
  const { c, safety, committed } = fixture();
  c.snapshotInstallation = async () => {
    c.workspace.id = "other";
    return safety;
  };
  await assert.rejects(c.restoreFullBackup(), /تغییر/);
  assert.equal(committed.length, 0);
});
test("cleanup failure after commit blocks writes rather than displaying stale data", async () => {
  const { c, committed } = fixture();
  c.completeResetCleanup = async () => {
    throw Error("storage unavailable");
  };
  await assert.rejects(c.restoreFullBackup(), /storage unavailable/);
  assert.ok(committed.length > 0);
  assert.equal(c.blocked, true);
  assert.equal(c.ready, false);
});
test("a validated full backup can recover failed startup while retaining a raw safety copy", async () => {
  const { c, committed } = fixture();
  c.ready = false;
  c.blocked = true;
  c.workspace = null;
  c.captureWorkspaceContext = () => ({ id: "", revision: 0 });
  c.assertWorkspaceReadable = () => {
    throw Error("startup is not readable");
  };
  c.snapshotInstallation = async () => {
    throw Error("normal snapshots are unavailable");
  };
  c.requestPromise = (request) =>
    new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
  const transaction = c.connection.transaction;
  c.connection.transaction = (names, mode) =>
    mode !== "readonly"
      ? transaction(names, mode)
      : {
          done: Promise.resolve(),
          objectStore: (name) => ({
            getAll: () => {
              const request = {
                result:
                  name === "catalog"
                    ? [
                        {
                          id: "original",
                          revision: 4,
                          year: "1404-1405",
                          term: "دوم",
                          closed: true,
                        },
                      ]
                    : name === "records"
                      ? [{ key: "damaged", value: "original broken record" }]
                      : [],
              };
              queueMicrotask(() => request.onsuccess());
              return request;
            },
          }),
        };
  await c.restoreFullBackup();
  assert.equal(c.ready, true);
  assert.equal(c.blocked, false);
  const safety = committed.find(
    (row) => row.name === "backups" && row.row?.full,
  ).row.full;
  assert.equal(safety.format, "EduManager.RawRecovery");
  assert.equal(safety.stores.records[0].value, "original broken record");
});

test("legacy replacement preview names the selected file and lists exactly its own term", () => {
  const { c, source } = fixture();
  let html;
  c.showModal = (_title, body) => {
    html = body;
    return true;
  };
  c.previewFullBackup(source, { sourceName: "مدرسه قدیمی.json", legacy: true });
  assert.match(html, /نوبت‌های موجود در خود فایل/);
  assert.match(html, /مدرسه قدیمی.json/);
  assert.match(html, /1405-1406 \/ اول/);
  assert.match(html, /تمام سال‌ها و نوبت‌های فعلی حذف می‌شوند/);
  assert.match(html, /فقط محتوای همین فایل باقی می‌ماند/);
});

test("successful complete replacement retires a previously rejected write from the old installation", async () => {
  const f = fixture();
  const failure = Promise.reject(Error("old installation write failure"));
  failure.catch(() => {});
  f.c.writer = failure;
  f.c.writeFailureGeneration = 7;
  await f.c.restoreFullBackup();
  await f.c.writer;
  assert.notEqual(f.c.writer, failure);
  assert.equal(f.c.writeFailureGeneration, 8);
});

test("complete replacement anchors the incoming active academic year only after old installation preferences are cleaned", async () => {
  const f = fixture(),
    steps = [];
  f.c.completeResetCleanup = async () => steps.push("cleanup");
  f.c.rememberAcademicYear = (year) => steps.push("year:" + year);
  await f.c.restoreFullBackup();
  assert.deepEqual(steps, ["cleanup", "year:1405-1406"]);
  assert.equal(f.c.workspace.year, "1405-1406");
});

test("a failed full replacement never switches the existing installation's academic-year anchor", async () => {
  const f = fixture({ asyncFailure: true }),
    anchored = [];
  f.c.rememberAcademicYear = (year) => anchored.push(year);
  await assert.rejects(f.c.restoreFullBackup());
  assert.deepEqual(anchored, []);
});
test("a committed restore retains its durable selection when browser preference cleanup fails", async () => {
  const f = fixture();
  f.c.completeResetCleanup = async () => {
    throw Error("preference cleanup failed");
  };
  await assert.rejects(f.c.restoreFullBackup(), /preference cleanup failed/);
  const marker = f.committed.find(
    (entry) =>
      entry.name === "records" && entry.row?.key === "@installation-reset",
  ).row;
  assert.equal(marker.value.activeWorkspace, "source");
  assert.equal(marker.value.academicYear, "1405-1406");
  assert.equal(marker.value.phase, "cleanup");
  assert.equal(f.c.ready, false);
  assert.equal(f.c.blocked, true);
});

test("failed replacement retains the original writer and its generation", async () => {
  const f = fixture({ asyncFailure: true });
  const writer = f.c.writer;
  f.c.writeFailureGeneration = 7;
  await assert.rejects(f.c.restoreFullBackup());
  assert.equal(f.c.writer, writer);
  assert.equal(f.c.writeFailureGeneration, 7);
});

test("full restore revokes prior authentication before awaiting published target note metadata", async () => {
  const { c } = fixture();
  c.isAuthenticated = true;
  let entered, release;
  const reading = new Promise((resolve) => {
    entered = resolve;
  });
  c.readWorkspaceSnapshot = async () => ({
    period: { id: "source", revision: 3, year: "1405-1406" },
    data: { settings: { password: "restored-protected-hash" } },
    records: new Map(),
  });
  c.synchronizeYearNotesScope = () => {
    entered();
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const restoring = c.restoreFullBackup();
  await reading;
  assert.equal(c.workspace.id, "source");
  assert.equal(c.db.settings.password, "restored-protected-hash");
  assert.equal(
    c.isAuthenticated,
    false,
    "restored target must never inherit the replaced installation authorization",
  );
  const exposed = [];
  c.render = () => exposed.push(c.isAuthenticated);
  c.render();
  assert.deepEqual(exposed, [false]);
  release();
  await restoring;
  assert.equal(c.isAuthenticated, false);
  assert.equal(exposed.at(-1), false);
});

test("full restore target read failure does not alter source authentication before publication", async () => {
  const { c } = fixture(),
    original = { settings: { password: "source-hash" } };
  c.db = original;
  c.isAuthenticated = true;
  c.readWorkspaceSnapshot = async () => {
    throw Error("restored target read failure");
  };
  await assert.rejects(c.restoreFullBackup(), /restored target read failure/);
  assert.equal(c.workspace.id, "original");
  assert.equal(c.db, original);
  assert.equal(c.isAuthenticated, true);
  assert.equal(
    c.blocked,
    true,
    "a committed replacement cannot continue using stale source data after a read failure",
  );
});
