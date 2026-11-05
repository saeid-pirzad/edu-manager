"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const writes = [],
    errors = [],
    backupWrites = [];
  const candidate = {
    schools: [],
    sessions: [],
    settings: { academicYear: "1405-1406", academicTerm: "اول" },
  };
  const c = vm.createContext({
    workspace: { id: "first", revision: 1, year: "1405-1406", term: "اول" },
    db: structuredClone(candidate),
    pendingImport: {
      workspace: "first",
      revision: 1,
      candidate,
      label: "fixture",
    },
    fileMode: false,
    connection: {},
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    busy: 0,
    writer: Promise.resolve(),
    drafts: new Map(),
    document: {
      getElementById: (id) =>
        id === "restoreMode" ? { value: "current" } : { checked: true },
    },
    confirm: () => true,
    normalizeDB: structuredClone,
    academicTermKind: (term) => ({ اول: "first", دوم: "second" })[term] || null,
    normalizedName: String,
    validateV24: () => true,
    flushDrafts: async () => {},
    putBackup: async () => backupWrites.push("operation backup"),
    collectRecords: (x) => x,
    commitRecords: async (x) => {
      writes.push(x);
      c.workspace.revision++;
      return true;
    },
    paintStatus() {},
    storeDrafts() {},
    closeModal() {},
    scheduleSingleFile() {},
    setStatus() {},
    render() {},
    handleError: (e) => errors.push(e),
    assertWorkspaceContext: (target, { write } = {}) => {
      if (
        c.workspace.id !== target.id ||
        c.workspace.revision !== target.revision ||
        (write && c.workspace.closed)
      )
        throw Error("stale context");
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/period-import.js"),
      "utf8",
    ),
    c,
  );
  return { c, writes, errors, backupWrites };
}
test("replacement import aborts before writing if workspace changes during draft flush", async () => {
  const { c, writes } = fixture();
  c.flushDrafts = async () => {
    c.workspace = { ...c.workspace, id: "second" };
  };
  await assert.rejects(c.confirmImport(), /stale/);
  assert.equal(writes.length, 0);
});

test("replacement still rejects a preview whose source revision has advanced", async () => {
  const { c, writes } = fixture();
  c.workspace.revision++;
  await assert.rejects(c.confirmImport(), /stale/);
  assert.equal(writes.length, 0);
});

test("replacement import aborts if revision changes while waiting for pending writes", async () => {
  const { c, writes, backupWrites } = fixture();
  let finish;
  c.writer = new Promise((resolve) => {
    finish = resolve;
  });
  const importing = c.confirmImport();
  await Promise.resolve();
  c.workspace.revision++;
  finish();
  await assert.rejects(importing, /stale/);
  assert.equal(writes.length, 0);
  assert.deepEqual(backupWrites, []);
});

test("replacement validates the target-year candidate before writing", async () => {
  const { c, writes, backupWrites } = fixture();
  c.validateV24 = () => {
    throw Error("policy year mismatch");
  };
  await assert.rejects(c.confirmImport(), /policy year/);
  assert.deepEqual(backupWrites, []);
  assert.equal(writes.length, 0);
});

test("concurrent replacement cannot commit the same preview twice", async () => {
  const { c, writes } = fixture();
  let unblock;
  c.flushDrafts = () =>
    new Promise((resolve) => {
      unblock = resolve;
    });
  const first = c.confirmImport();
  await assert.rejects(c.confirmImport());
  unblock();
  await first;
  assert.equal(writes.length, 1);
  assert.equal(c.pendingImport, null);
});
test("a replacement preview rejected by the dirty-modal guard does not replace the accepted preview", () => {
  const { c } = fixture(),
    previous = c.pendingImport;
  c.esc = String;
  c.showModal = () => false;
  c.previewImport(
    { schools: [], sessions: [], settings: { academicYear: "1405-1406" } },
    "rejected",
  );
  assert.equal(c.pendingImport, previous);
});
test("full-backup preview also preserves the accepted source when modal replacement is declined", () => {
  let accepted = true;
  const c = vm.createContext({
    EduFullBackupValidator: {
      create: () =>
        Object.assign(
          () => [
            {
              period: {
                id: "saved",
                year: "1405-1406",
                term: "اول",
                closed: false,
              },
              data: { sessions: [] },
            },
          ],
          {
            normalize: (value) => value,
            prepare: (value) => ({
              value,
              periods: [
                {
                  period: {
                    id: "saved",
                    year: "1405-1406",
                    term: "\u0627\u0648\u0644",
                    closed: false,
                  },
                  data: { sessions: [] },
                },
              ],
            }),
          },
        ),
    },
    backupStores: [],
    assertSafeDataTree() {},
    isDataObject() {},
    isSafeRecordId() {},
    validateReportNotes() {},
    decodeWorkspaceRecords() {},
    validateFrozenReport() {},
    normalizeDB() {},
    validatedUndoCandidate() {},
    isSupportedGradeDraft() {},
    showModal: () => accepted,
    esc: (value) => String(value),
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
  const first = { gradeDrafts: [] },
    second = { gradeDrafts: [] };
  c.previewFullBackup(first);
  accepted = false;
  c.previewFullBackup(second);
  assert.equal(vm.runInContext("pendingFullBackup", c), first);
});

test("period restore never installs an independent period even if an old client submits restoreMode=new", async () => {
  const { c, writes } = fixture();
  let installs = 0;
  c.installWorkspace = async () => installs++;
  await c.confirmImport();
  assert.equal(installs, 0);
  assert.equal(writes.length, 1);
});
test("a period backup cannot overwrite a different academic year or term", async () => {
  for (const settings of [
    { academicYear: "1406-1407", academicTerm: "اول" },
    { academicYear: "1405-1406", academicTerm: "دوم" },
  ]) {
    const { c, writes } = fixture();
    c.pendingImport.candidate.settings = settings;
    await assert.rejects(c.confirmImport(), /متعلق به نوبت فعلی نیست/);
    assert.equal(writes.length, 0);
  }
});

test("period replacement joins the writer until the restored data is installed", async () => {
  const { c } = fixture();
  let finish, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  c.commitRecords = async () => {
    entered();
    await new Promise((resolve) => {
      finish = resolve;
    });
    c.workspace.revision++;
    return true;
  };
  const restoring = c.confirmImport();
  await started;
  let completed = false;
  const pendingWrite = c.writer.then(() => {
    completed = true;
    assert.deepEqual(c.db, restoredCandidate);
  });
  const restoredCandidate = c.pendingImport.candidate;
  await Promise.resolve();
  assert.equal(completed, false);
  finish();
  await Promise.all([restoring, pendingWrite]);
  assert.equal(completed, true);
  assert.equal(c.db.settings.academicTerm, "اول");
  assert.equal(c.pendingImport, null);
  assert.equal(c.busy, 0);
});

for (const changedContext of [
  "workspace",
  "connection",
  "periodLoading",
  "resetBusy",
  "connectionRetired",
  "newer revision",
]) {
  test(`committed replacement never clobbers UI or drafts after ${changedContext} changes`, async () => {
    const { c } = fixture();
    const destination = { marker: "newer selected data" },
      destinationState = { view: "destination" },
      pendingDraft = { marker: "destination draft" };
    let effects = 0;
    c.closeModal =
      c.render =
      c.setStatus =
      c.scheduleSingleFile =
        () => effects++;
    c.commitRecords = async () => {
      if (changedContext === "workspace")
        c.workspace = { ...c.workspace, id: "second" };
      else if (changedContext === "connection") c.connection = {};
      else if (changedContext === "newer revision") c.workspace.revision += 2;
      else c[changedContext] = true;
      c.db = destination;
      c.state = destinationState;
      c.drafts.set("destination", pendingDraft);
      return true;
    };
    await c.confirmImport();
    assert.equal(c.db, destination);
    assert.equal(c.state, destinationState);
    assert.equal(c.drafts.get("destination"), pendingDraft);
    assert.equal(effects, 0);
    assert.equal(c.busy, 0);
  });
}

test("import preview cannot be reused after replacement even if period and revision are identical", async () => {
  const f = fixture();
  f.c.installationToken = "epoch-b";
  f.c.pendingImport.installation = "epoch-a";
  await assert.rejects(
    f.c.confirmImport(),
    (error) => error.code === "INSTALLATION_CHANGED",
  );
  assert.equal(f.writes.length, 0);
});
test("import intent rechecks its frozen installation after pending writes settle", async () => {
  const f = fixture();
  f.c.installationToken = "epoch-a";
  f.c.pendingImport.installation = "epoch-a";
  let finish;
  f.c.writer = new Promise((resolve) => {
    finish = resolve;
  });
  const importing = f.c.confirmImport();
  await Promise.resolve();
  f.c.installationToken = "epoch-b";
  finish();
  await assert.rejects(
    importing,
    (error) => error.code === "INSTALLATION_CHANGED",
  );
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.backupWrites, []);
});

test("normal import passes the preview installation to atomic persistence without an operation backup", async () => {
  const f = fixture();
  f.c.installationToken = "epoch-a";
  f.c.pendingImport.installation = "epoch-a";
  let options;
  f.c.commitRecords = async (_records, value) => {
    options = value;
    f.c.workspace.revision++;
    return true;
  };
  await f.c.confirmImport();
  assert.equal(options.expectedInstallation, "epoch-a");
  assert.deepEqual(f.backupWrites, []);
});

function legacyImportFixture({ accepted = true } = {}) {
  const storageKey = "EduManagerLegacyFixture",
    historicalKey = storageKey + "_beforeImport",
    baseline = {
      schools: [{ id: "old_school", name: "مدرسه قبلی", classes: [] }],
      sessions: [],
      settings: { academicYear: "1405-1406" },
    },
    replacement = {
      schools: [{ id: "new_school", name: "مدرسه بازیابی‌شده", classes: [] }],
      sessions: [],
      settings: { academicYear: "1405-1406" },
    },
    original = JSON.stringify(baseline),
    historical = "historical pre-import data retained until an explicit reset",
    stored = new Map([
      [storageKey, original],
      [historicalKey, historical],
    ]),
    writes = [],
    removes = [],
    alerts = [],
    confirmations = [],
    reads = [];
  let renders = 0,
    filterResets = 0,
    fileReads = 0;
  const c = vm.createContext({
    STORAGE_KEY: storageKey,
    db: structuredClone(baseline),
    storageSnapshot: original,
    storageBlocked: true,
    storageProblem: "previous failure",
    isAuthenticated: true,
    state: { view: "class", schoolId: "old_school" },
    lessonReportFilter: { schoolId: "old_school" },
    karnamehFilter: { schoolId: "old_school" },
    localStorage: {
      getItem(key) {
        reads.push(key);
        return stored.get(key) ?? null;
      },
      setItem(key, value) {
        writes.push([key, value]);
        stored.set(key, value);
      },
      removeItem(key) {
        removes.push(key);
        stored.delete(key);
      },
    },
    confirm(message) {
      confirmations.push(message);
      return accepted;
    },
    alert(message) {
      alerts.push(message);
    },
    legacy_defaultDB: () => ({
      schools: [],
      sessions: [],
      masterSchedule: {},
      settings: { academicYear: "1405-1406" },
    }),
    legacy_render() {
      renders++;
    },
    resetGlobalFilters() {
      filterResets++;
    },
    FileReader: class {
      readAsText(file, encoding) {
        fileReads++;
        assert.equal(encoding, "UTF-8");
        this.onload({ target: { result: file.content } });
      }
    },
  });
  for (const name of [
    "core/runtime-api.js",
    "domain/data-boundary.js",
    "legacy/validation/database.js",
    "legacy/data/legacy-storage.js",
    "legacy/data/backup-import.js",
    "legacy/core/runtime-facade.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
      c,
      { filename: name },
    );
  const input = (value = { version: 23, db: replacement }) => ({
    value: "selected.json",
    files: [
      {
        size: 2048,
        content: typeof value === "string" ? value : JSON.stringify(value),
      },
    ],
  });
  return {
    c,
    stored,
    storageKey,
    historicalKey,
    historical,
    baseline,
    replacement,
    original,
    writes,
    removes,
    alerts,
    confirmations,
    reads,
    input,
    counters: () => ({ renders, filterResets, fileReads }),
  };
}

test("legacy facade fallback validates then replaces the current data without creating an operation copy", () => {
  const f = legacyImportFixture(),
    input = f.input();
  f.c.handleImport({ target: input });
  assert.equal(f.confirmations.length, 1);
  assert.match(f.confirmations[0], /جایگزین تمام اطلاعات فعلی/);
  assert.doesNotMatch(f.confirmations[0], /نسخه قبلی|نگه داشته/);
  assert.deepEqual(
    f.writes.map(([key]) => key),
    [f.storageKey],
  );
  const restored = JSON.parse(f.stored.get(f.storageKey));
  assert.deepEqual(restored.schools, f.replacement.schools);
  assert.equal(
    restored.schemaVersion,
    23,
    "the real legacy validator/normalizer prepared the candidate",
  );
  assert.equal(JSON.stringify(f.c.db), f.stored.get(f.storageKey));
  assert.equal(f.c.storageSnapshot, f.stored.get(f.storageKey));
  assert.equal(f.c.storageBlocked, false);
  assert.equal(f.c.storageProblem, "");
  assert.equal(f.c.isAuthenticated, false);
  assert.equal(f.c.state.view, "schools");
  assert.equal(input.value, "");
  assert.deepEqual(f.counters(), { renders: 1, filterResets: 1, fileReads: 1 });
  assert.equal(
    f.stored.get(f.historicalKey),
    f.historical,
    "old historical recovery keys are not proactively purged or replaced",
  );
  assert.deepEqual(f.removes, []);
  assert.deepEqual(f.reads, []);
});

test("canceled legacy fallback import leaves current and historical data untouched", () => {
  const f = legacyImportFixture({ accepted: false }),
    input = f.input(),
    originalDB = f.c.db;
  f.c.handleImport({ target: input });
  assert.equal(f.confirmations.length, 1);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removes, []);
  assert.equal(f.c.db, originalDB);
  assert.equal(f.stored.get(f.storageKey), f.original);
  assert.equal(f.stored.get(f.historicalKey), f.historical);
  assert.equal(input.value, "");
  assert.equal(f.counters().renders, 0);
  assert.deepEqual(f.alerts, []);
});

for (const [label, value] of [
  ["malformed JSON", "{broken"],
  ["unsupported version", { version: 24, db: { schools: [], sessions: [] } }],
  [
    "invalid database",
    { version: 23, db: { schools: "not-an-array", sessions: [] } },
  ],
])
  test(
    "invalid legacy fallback import makes no writes before confirmation: " +
      label,
    () => {
      const f = legacyImportFixture(),
        input = f.input(value),
        originalDB = f.c.db;
      f.c.handleImport({ target: input });
      assert.deepEqual(f.writes, []);
      assert.deepEqual(f.removes, []);
      assert.deepEqual(f.confirmations, []);
      assert.equal(f.c.db, originalDB);
      assert.equal(f.stored.get(f.storageKey), f.original);
      assert.equal(f.stored.get(f.historicalKey), f.historical);
      assert.equal(input.value, "");
      assert.equal(f.alerts.length, 1);
      assert.match(f.alerts[0], /بازیابی انجام نشد/);
    },
  );

test("oversized legacy fallback import is rejected before reading, confirmation or storage changes", () => {
  const f = legacyImportFixture(),
    input = f.input();
  input.files[0].size = 20 * 1024 * 1024 + 1;
  f.c.handleImport({ target: input });
  assert.equal(f.counters().fileReads, 0);
  assert.deepEqual(f.confirmations, []);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removes, []);
  assert.equal(input.value, "");
  assert.equal(f.alerts.length, 1);
});

test("installed current import handler bypasses the real legacy fallback", () => {
  const f = legacyImportFixture(),
    input = f.input(),
    event = { target: input };
  let received;
  f.c.EduRuntimeAPI.install({
    handleImport: (value) => {
      received = value;
      return "current implementation";
    },
  });
  assert.equal(f.c.handleImport(event), "current implementation");
  assert.equal(received, event);
  assert.equal(f.counters().fileReads, 0);
  assert.deepEqual(f.confirmations, []);
  assert.deepEqual(f.writes, []);
});

test("explicit legacy reset still removes the historical before-import key", () => {
  const f = legacyImportFixture();
  f.c.legacy_wipeAllData();
  assert.equal(f.confirmations.length, 2);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.removes, [f.storageKey, f.historicalKey]);
  assert.equal(f.stored.has(f.historicalKey), false);
  assert.equal(f.c.db.schools.length, 0);
  assert.equal(f.c.storageSnapshot, null);
});
