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
          () => [
            {
              period,
              data: { settings: { academicTerm: "اول" }, sessions: [] },
            },
          ],
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

test("failed replacement retains the original writer and its generation", async () => {
  const f = fixture({ asyncFailure: true });
  const writer = f.c.writer;
  f.c.writeFailureGeneration = 7;
  await assert.rejects(f.c.restoreFullBackup());
  assert.equal(f.c.writer, writer);
  assert.equal(f.c.writeFailureGeneration, 7);
});
