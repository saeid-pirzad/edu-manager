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
          {
            normalize: (value) => value,
            prepare: (value) => ({
              value,
              periods: source.stores.catalog.map((saved) => ({
                period: saved,
                data: { settings: { academicTerm: saved.term }, sessions: [] },
              })),
            }),
          },
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
    snapshotInstallation: async ({ onDurableDrafts } = {}) => {
      onDurableDrafts?.(structuredClone(c.rawStores?.drafts || []));
      return safety;
    },
    uid: () => "new_" + ++sequence,
    collectRecords: (data) => new Map([["meta", data]]),
    clone: structuredClone,
    window: { EduPeriodicReports: { resetDrafts() {} } },
    setStatus() {},
    resetScreen() {},
    transactionDone: (tx) => tx.done,
    requestPromise: (request) =>
      new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result);
      }),
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
            get() {
              const request = {
                result: name === "drafts" ? c.liveIdentity : c.liveResetMarker,
              };
              queueMicrotask(() => request.onsuccess());
              return request;
            },
            getAll() {
              const request = {
                result: structuredClone(
                  c.rawStores?.[name] || (name === "catalog" ? [current] : []),
                ),
              };
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
  for (const source of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/deputy-export-identity.js",
  ])
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
  c.snapshotInstallation = ({ onDurableDrafts } = {}) =>
    new Promise((resolve) => {
      release = () => {
        onDurableDrafts?.([]);
        resolve(safety);
      };
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

const senderIdentity = (token = "saved-sender") => ({
  version: 1,
  token,
  sender: { code: "TEACHER_1", name: "دبیر نمونه" },
  schools: [{ year: "1405-1406", id: "school", code: "SCHOOL_1" }],
});

test("full restore replaces sender identity atomically with a fresh compare-and-swap token", async () => {
  const f = fixture();
  f.source.deputyExportIdentity = senderIdentity("incoming-token");
  f.safety.deputyExportIdentity = senderIdentity("current-token");
  f.c.liveIdentity = f.c.EduDeputyExportIdentity.row(
    f.safety.deputyExportIdentity,
  );
  f.c.previewFullBackup(f.source);
  await f.c.restoreFullBackup();
  const row = f.committed.find(
    (item) =>
      item.name === "drafts" &&
      item.row?.key === f.c.EduDeputyExportIdentity.key,
  ).row;
  assert.notEqual(row.value.token, "incoming-token");
  assert.notEqual(row.value.token, "current-token");
  assert.deepEqual(
    JSON.parse(JSON.stringify(row.value.sender)),
    f.source.deputyExportIdentity.sender,
  );
  assert.equal(f.source.deputyExportIdentity.token, "incoming-token");
});

test("restoring an old backup clears the overwritten sender identity instead of reusing it", async () => {
  const f = fixture();
  f.safety.deputyExportIdentity = senderIdentity();
  f.c.liveIdentity = f.c.EduDeputyExportIdentity.row(
    f.safety.deputyExportIdentity,
  );
  await f.c.restoreFullBackup();
  assert.ok(f.committed.some((item) => item.name === "drafts" && item.clear));
  assert.equal(
    f.committed.some(
      (item) => item.row?.key === f.c.EduDeputyExportIdentity.key,
    ),
    false,
  );
});

test("an unseen identity update after the safety snapshot blocks destructive full restore", async () => {
  const f = fixture();
  f.safety.deputyExportIdentity = senderIdentity("old-token");
  f.c.liveIdentity = f.c.EduDeputyExportIdentity.row(
    senderIdentity("new-token"),
  );
  await assert.rejects(f.c.restoreFullBackup(), /مشخصات فرستنده/);
  assert.equal(f.committed.length, 0);
});

test("a stale restore window cannot overwrite a newer installation with an unchanged catalog", async () => {
  const f = fixture();
  f.c.liveResetMarker = {
    key: "@installation-reset",
    value: { token: "another-installation" },
  };
  await assert.rejects(f.c.restoreFullBackup(), /جایگزین/);
  assert.equal(f.committed.length, 0);
});

test("failed replacement does not partially commit incoming sender metadata", async () => {
  const f = fixture({ asyncFailure: true });
  f.source.deputyExportIdentity = senderIdentity();
  f.c.previewFullBackup(f.source);
  await assert.rejects(f.c.restoreFullBackup(), /asynchronous write failure/);
  assert.equal(f.committed.length, 0);
});

function damagedIdentityFixture() {
  const f = fixture();
  f.c.liveIdentity = {
    key: f.c.EduDeputyExportIdentity.key,
    value: { version: 99, corrupt: "preserve this exact original row" },
  };
  f.c.rawStores = { drafts: [structuredClone(f.c.liveIdentity)] };
  f.c.snapshotInstallation = async () =>
    f.c.EduDeputyExportIdentity.normalize(f.c.liveIdentity.value);
  f.source.deputyExportIdentity = senderIdentity("incoming-valid");
  f.c.previewFullBackup(f.source);
  return f;
}

test("a corrupt durable sender profile does not prevent full recovery and is preserved in raw safety data", async () => {
  const f = damagedIdentityFixture(),
    damaged = structuredClone(f.c.liveIdentity);
  await f.c.restoreFullBackup();
  const safety = f.committed.find(
      (item) => item.name === "backups" && item.row?.full,
    ).row.full,
    restored = f.committed.find(
      (item) =>
        item.name === "drafts" &&
        item.row?.key === f.c.EduDeputyExportIdentity.key,
    ).row;
  assert.equal(safety.format, "EduManager.RawRecovery");
  assert.deepEqual(
    JSON.parse(JSON.stringify(safety.stores.drafts[0])),
    damaged,
  );
  assert.equal(restored.value.sender.name, "دبیر نمونه");
  assert.notEqual(restored.value.token, "incoming-valid");
});

test("raw safety identity comparison still detects a concurrent change before destructive recovery", async () => {
  const f = damagedIdentityFixture(),
    snapshot = f.c.snapshotBeforeSystemRestore;
  f.c.snapshotBeforeSystemRestore = async () => {
    const safety = await snapshot();
    f.c.liveIdentity = {
      ...f.c.liveIdentity,
      value: { version: 99, corrupt: "changed in another window" },
    };
    return safety;
  };
  await assert.rejects(f.c.restoreFullBackup(), /مشخصات فرستنده/);
  assert.equal(f.committed.length, 0);
});

test("corrupt current metadata never permits malformed incoming metadata to reach replacement writes", async () => {
  const f = damagedIdentityFixture();
  f.source.deputyExportIdentity = { version: 99 };
  f.c.previewFullBackup(f.source);
  await assert.rejects(
    f.c.restoreFullBackup(),
    (error) => error.code === "DEPUTY_IDENTITY_INVALID",
  );
  assert.equal(f.committed.length, 0);
});

test("unrelated backup errors never trigger the raw-recovery fallback", async () => {
  const f = fixture();
  f.c.snapshotInstallation = async () => {
    throw Error("unrelated storage failure");
  };
  await assert.rejects(f.c.restoreFullBackup(), /unrelated storage failure/);
  assert.equal(f.committed.length, 0);
});

test("unserializable corrupt identity rows fail clearly rather than bypassing the recovery compare guard", () => {
  const f = fixture(),
    row = { key: f.c.EduDeputyExportIdentity.key };
  row.value = row;
  assert.throws(
    () =>
      f.c.restoreIdentityMatches(
        { format: "EduManager.RawRecovery", stores: { drafts: [row] } },
        row,
      ),
    /مقایسهٔ امن/,
  );
});

test("a grade draft saved in another tab after the safety snapshot blocks destructive replacement", async () => {
  const f = fixture(),
    snapshot = f.c.snapshotBeforeSystemRestore;
  f.c.snapshotBeforeSystemRestore = async () => {
    const safety = await snapshot();
    f.c.rawStores = {
      drafts: [
        {
          key: "Edu24.drafts.original.peer.document",
          workspace: "original",
          generation: 1,
          entries: [{ kind: "k", value: "18" }],
          updatedAt: "2026-11-03T10:00:00Z",
        },
      ],
    };
    return safety;
  };
  await assert.rejects(f.c.restoreFullBackup(), /پیش‌نویس/);
  assert.equal(f.committed.length, 0);
});

for (const change of ["edited", "removed", "discarded"]) {
  test(
    "replacement preserves a concurrent " +
      change +
      " draft operation by refusing an obsolete safety snapshot",
    async () => {
      const f = fixture(),
        snapshot = f.c.snapshotBeforeSystemRestore;
      const row = {
        key: "Edu24.drafts.original.peer.document",
        workspace: "original",
        generation: 1,
        entries: [{ kind: "k", value: "18" }],
        updatedAt: "2026-11-03T10:00:00Z",
      };
      f.c.rawStores = { drafts: [structuredClone(row)] };
      f.c.snapshotBeforeSystemRestore = async () => {
        const safety = await snapshot();
        f.c.rawStores.drafts =
          change === "removed"
            ? []
            : [
                {
                  ...row,
                  entries:
                    change === "discarded" ? [] : [{ kind: "k", value: "19" }],
                },
              ];
        return safety;
      };
      await assert.rejects(f.c.restoreFullBackup(), /پیش‌نویس/);
      assert.equal(f.committed.length, 0);
    },
  );
}

test("restore draft guard ignores device file configuration and stable draft ordering", () => {
  const f = fixture(),
    a = { key: "Edu24.drafts.original.a", entries: [] },
    b = { key: "Edu24.drafts.original.b", entries: [] };
  assert.equal(
    f.c.restoreDraftSignature([a, b]),
    f.c.restoreDraftSignature([
      { key: "EduManager.singleFile", handle: {} },
      b,
      a,
    ]),
  );
});

test("replacement waits for the automatic file lock through an outstanding stream close", async () => {
  const f = fixture();
  let release;
  f.c.navigator = {
    locks: {
      request(name, run) {
        assert.equal(name, "EduManager.singleFile");
        return new Promise((resolve, reject) => {
          release = () => run().then(resolve, reject);
        });
      },
    },
  };
  const restore = f.c.restoreFullBackup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    typeof release,
    "function",
    "must use the same cross-tab lock as file streams",
  );
  assert.equal(
    f.committed.length,
    0,
    "the database remains unchanged while an older stream can still close",
  );
  release();
  await restore;
  assert.ok(f.committed.length > 0);
});

test("failed automatic-file locking never partially replaces the installation", async () => {
  const f = fixture();
  f.c.navigator = {
    locks: {
      request() {
        throw Error("file lock unavailable");
      },
    },
  };
  await assert.rejects(f.c.restoreFullBackup(), /file lock unavailable/);
  assert.equal(f.committed.length, 0);
});

test("replacement preserves the latest durable file handle and rotates its connection identity", async () => {
  const f = fixture();
  f.c.singleFile = {
    connectionId: "obsolete-tab-connection",
    handle: { name: "old.json" },
  };
  const current = {
    key: "file",
    connectionId: "live-connection",
    handle: { name: "current.json" },
    modified: 2,
    size: 5,
    savedAt: "2026-11-03T10:00:00Z",
  };
  f.c.rawStores = { drafts: [current] };
  await f.c.restoreFullBackup();
  const saved = f.committed.find(
    (row) => row.name === "drafts" && row.row?.key === "file",
  ).row;
  assert.equal(saved.handle.name, "current.json");
  assert.notEqual(saved.connectionId, current.connectionId);
  assert.equal(f.c.singleFile, saved);
  assert.equal(
    current.connectionId,
    "live-connection",
    "the source snapshot must not be mutated",
  );
});

test("full replacement preserves both a reviewed grade and long invalid raw input from a portable JSON backup", async () => {
  const f = fixture(),
    long = "۹".repeat(101);
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/domain/grade-drafts.js"),
      "utf8",
    ),
    f.c,
  );
  const exported = f.c.EduGradeDrafts.portableGradeDrafts(
    [
      {
        key: "Edu24.drafts.source.tab.document",
        workspace: "source",
        generation: 3,
        updatedAt: "2026-11-04T00:00:00Z",
        entries: [
          {
            kind: "k",
            classId: "class",
            lid: "lesson",
            sid: "student1",
            field: "practical",
            value: "17",
            review: true,
          },
          {
            kind: "k",
            classId: "class",
            lid: "lesson",
            sid: "student2",
            field: "theory",
            value: long,
          },
        ],
      },
    ],
    f.source.stores.catalog,
  );
  f.source.gradeDrafts = JSON.parse(JSON.stringify(exported));
  const incoming = JSON.parse(JSON.stringify(f.source));
  f.c.previewFullBackup(incoming);
  await f.c.restoreFullBackup();
  const restored = f.committed.find(
    (row) =>
      row.name === "drafts" && row.row?.key === incoming.gradeDrafts[0].key,
  )?.row;
  assert.ok(restored);
  assert.deepEqual(
    restored.entries.map((entry) => entry.value),
    ["17", long],
  );
  assert.equal(restored.owner, "imported");
  assert.ok(restored.entries.every((entry) => entry.review === true));
  assert.equal(f.source.gradeDrafts[0].entries[1].value, long);
});
