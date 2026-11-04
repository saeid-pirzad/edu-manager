"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const names = ["records", "catalog", "events", "backups", "undo", "reports"];
const draft = (value) => ({
  kind: "k",
  classId: "class",
  lid: "lesson",
  sid: "student",
  field: "theory",
  value,
  review: true,
});
const draftRow = (value, workspace = "first", owner = "peer") => ({
  key: "Edu24.drafts." + workspace + "." + owner + ".document",
  workspace,
  generation: 1,
  entries: [draft(value)],
  updatedAt: "2026-11-04T00:00:00Z",
});
function fixture() {
  const calls = [],
    notes = {},
    local = Object.create(null),
    stores = {
      records: [
        { key: "@installation-reset", value: { token: "epoch" } },
        {
          key: "first|meta",
          workspace: "first",
          logical: "meta",
          value: { marker: 1 },
        },
      ],
      catalog: [
        { id: "first", year: "1405-1406", term: "اول", revision: 1 },
        { id: "second", year: "1405-1406", term: "دوم", revision: 1 },
      ],
      events: [{ id: 1, workspace: "first" }],
      backups: [
        { id: "ordinary", workspace: "first", db: { marker: 1 } },
        {
          id: "before-operation",
          workspace: null,
          full: { marker: "must not be retained in output" },
        },
      ],
      undo: [{ id: "first" }],
      reports: [{ id: "closed-report", workspace: "first" }],
      drafts: [],
    };
  Object.defineProperties(local, {
    getItem: {
      value(key) {
        return Object.hasOwn(this, key) ? this[key] : null;
      },
    },
    setItem: {
      value(key, value) {
        this[key] = String(value);
      },
    },
    removeItem: {
      value(key) {
        delete this[key];
      },
    },
  });
  let transactionHook = null,
    assessment = null;
  const c = vm.createContext({
    structuredClone,
    ready: true,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    workspace: { id: "first", revision: 1 },
    installationToken: "epoch",
    RESET_RECORD_KEY: "@installation-reset",
    backupStores: names,
    draftGeneration: 1,
    documentToken: "document",
    drafts: new Map(),
    draftStorageKey: () => "Edu24.drafts.first.self.document",
    clone: structuredClone,
    writer: Promise.resolve(),
    draftWriter: Promise.resolve(),
    flushDrafts: async () => {},
    storeDrafts: async () => {},
    localStorage: local,
    window: {
      EduPeriodicReports: {
        getDrafts: (id, recovery) => ({ ...recovery, ...notes[id] }),
      },
    },
    assessmentContext: { snapshot: () => structuredClone(assessment) },
    transactionDone: () => Promise.resolve(),
    requestPromise: (request) => Promise.resolve(request),
    connection: {
      transaction(requested, mode) {
        assert.equal(mode, "readonly");
        const snapshot = structuredClone(stores);
        transactionHook?.();
        return {
          objectStore(name) {
            assert.ok(requested.includes(name));
            return {
              getAll() {
                calls.push([name, "getAll"]);
                if (name === "backups")
                  throw Error("Full backups must use a cursor");
                return snapshot[name];
              },
              get(key) {
                calls.push([name, "get"]);
                return snapshot[name].find(
                  (row) => row.key === key || row.id === key,
                );
              },
              getAllKeys() {
                calls.push([name, "getAllKeys"]);
                return snapshot[name].map((row) => row.id ?? row.key);
              },
              openCursor() {
                calls.push([name, "openCursor"]);
                const request = {};
                let index = 0;
                const next = () =>
                  queueMicrotask(() => {
                    const row = snapshot[name][index++];
                    request.result = row
                      ? { primaryKey: row.id, value: row, continue: next }
                      : null;
                    request.onsuccess?.();
                  });
                next();
                return request;
              },
            };
          },
        };
      },
    },
  });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/grade-drafts.js",
    "domain/deputy-export-identity.js",
    "workspace/backups/full-export.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  return {
    c,
    stores,
    notes,
    local,
    calls,
    setAssessment(value) {
      assessment = value;
    },
    onTransaction(value) {
      transactionHook = value;
    },
    async capture() {
      let signature;
      const file = await c.snapshotInstallation({
        onSourceSignature: (value) => {
          signature = value;
        },
      });
      return { file, signature };
    },
  };
}
test("the full snapshot stamp matches the lightweight metadata read and retains only ordinary backup values", async () => {
  const f = fixture(),
    captured = await f.capture(),
    lightweight = await f.c.readBackupSourceSignature();
  assert.equal(captured.signature, lightweight);
  assert.deepEqual(
    JSON.parse(captured.signature).catalog,
    captured.file.stores.catalog,
  );
  assert.deepEqual(
    Array.from(captured.file.stores.backups, (row) => row.id),
    ["ordinary"],
  );
  assert.equal(captured.file.stores.drafts, undefined);
  assert.deepEqual(JSON.parse(captured.signature).keys.backups, [
    "before-operation",
    "ordinary",
  ]);
  assert.equal(
    f.calls.some(([name, method]) => name === "backups" && method === "getAll"),
    false,
  );
  assert.ok(
    f.calls.some(
      ([name, method]) => name === "backups" && method === "openCursor",
    ),
  );
});
for (const [name, change] of [
  [
    "active term grade revision",
    (f) => {
      f.stores.catalog[0].revision++;
      f.stores.records[1].value.marker++;
    },
  ],
  [
    "inactive term grade revision",
    (f) => {
      f.stores.catalog[1].revision++;
      f.stores.records.push({
        key: "second|class:class",
        workspace: "second",
        logical: "class:class",
        value: { marker: 2 },
      });
    },
  ],
  [
    "closed-term status",
    (f) => {
      f.stores.catalog[1].closed = true;
    },
  ],
  [
    "term creation",
    (f) => {
      f.stores.catalog.push({ id: "historic", year: "1404-1405", revision: 1 });
    },
  ],
  [
    "term deletion",
    (f) => {
      f.stores.catalog.pop();
    },
  ],
  [
    "history append",
    (f) => {
      f.stores.events.push({ id: 2 });
    },
  ],
  [
    "history deletion",
    (f) => {
      f.stores.events = [];
    },
  ],
  [
    "ordinary backup addition",
    (f) => {
      f.stores.backups.push({ id: "new-backup", db: {} });
    },
  ],
  [
    "full safety addition",
    (f) => {
      f.stores.backups.push({ id: "new-safety", full: {} });
    },
  ],
  [
    "backup deletion",
    (f) => {
      f.stores.backups = [];
    },
  ],
  [
    "report addition",
    (f) => {
      f.stores.reports.push({ id: "new-report" });
    },
  ],
  [
    "report deletion",
    (f) => {
      f.stores.reports = [];
    },
  ],
  [
    "undo deletion",
    (f) => {
      f.stores.undo = [];
    },
  ],
  [
    "current memory draft",
    (f) => {
      f.c.drafts.set("grade", draft("17"));
    },
  ],
  [
    "inactive term durable draft",
    (f) => {
      f.stores.drafts.push(draftRow("18", "second"));
    },
  ],
  [
    "local-only draft",
    (f) => {
      const row = draftRow("19");
      f.local.setItem(row.key, JSON.stringify(row));
    },
  ],
  [
    "assessment draft",
    (f) => {
      f.setAssessment(
        draftRow("16", "second", "self-assessment-class-lesson-final"),
      );
    },
  ],
  [
    "report note",
    (f) => {
      f.notes.second = {
        "second|annual|year:1405-1406;all|||management|summary":
          "Synthetic note",
      };
    },
  ],
  [
    "catalog recovery note",
    (f) => {
      f.stores.catalog[0].reportNotesRecovery = {
        "first|daily|2026-11-04|||management|summary":
          "Synthetic recovery note",
      };
    },
  ],
  [
    "sender identity",
    (f) => {
      f.stores.drafts.push(
        f.c.EduDeputyExportIdentity.row({
          version: 1,
          token: "sender-token",
          sender: { code: "TEACHER_1", name: "Synthetic teacher" },
          schools: [],
        }),
      );
    },
  ],
]) {
  test(
    "source fingerprint detects " +
      name +
      " and still matches the next actual snapshot",
    async () => {
      const f = fixture(),
        before = await f.c.readBackupSourceSignature();
      change(f);
      const after = await f.c.readBackupSourceSignature(),
        captured = await f.capture();
      assert.notEqual(after, before);
      assert.equal(captured.signature, after);
    },
  );
}
test("lightweight reads do not scan records or materialize history, report, undo, or backup payloads", async () => {
  const f = fixture();
  await f.c.readBackupSourceSignature();
  assert.deepEqual(
    f.calls.filter(([name]) => name === "records"),
    [["records", "get"]],
  );
  for (const name of ["events", "reports", "undo", "backups"])
    assert.deepEqual(
      f.calls.filter(([store]) => store === name),
      [[name, "getAllKeys"]],
    );
});
test("draft timestamps and device file-handle metadata alone do not make a saved source dirty", async () => {
  const f = fixture(),
    gradeRow = draftRow("17");
  f.stores.drafts.push(gradeRow, {
    key: "EduManager.singleFile",
    connectionId: "old",
    modified: 1,
    size: 20,
    savedAt: "old",
  });
  const before = await f.c.readBackupSourceSignature();
  gradeRow.updatedAt = "2099-01-01T00:00:00Z";
  Object.assign(f.stores.drafts[1], {
    connectionId: "new",
    modified: 2,
    size: 30,
    savedAt: "new",
  });
  assert.equal(await f.c.readBackupSourceSignature(), before);
  assert.equal((await f.capture()).signature, before);
});
test("the source stamp describes captured snapshot data, not a newer change made while the read is completing", async () => {
  const f = fixture();
  f.onTransaction(() => {
    f.onTransaction(null);
    f.stores.catalog[1].revision++;
  });
  const captured = await f.capture(),
    current = await f.c.readBackupSourceSignature();
  assert.equal(captured.file.stores.catalog[1].revision, 1);
  assert.equal(JSON.parse(captured.signature).catalog[1].revision, 1);
  assert.notEqual(current, captured.signature);
});
for (const [name, setup, code] of [
  [
    "unsupported current draft",
    (f) => f.c.drafts.set("grade", { kind: "future", value: "17" }),
    "GRADE_DRAFT_INVALID",
  ],
  [
    "unsupported durable draft",
    (f) =>
      f.stores.drafts.push({
        ...draftRow("17"),
        entries: [{ kind: "future", value: "17" }],
      }),
    "GRADE_DRAFT_INVALID",
  ],
  [
    "malformed local draft JSON",
    (f) => f.local.setItem(draftRow("17").key, "{broken"),
    "BACKUP_DRAFT_UNREADABLE",
  ],
  [
    "malformed sender identity",
    (f) =>
      f.stores.drafts.push({ key: f.c.EduDeputyExportIdentity.key, value: {} }),
    "DEPUTY_IDENTITY_INVALID",
  ],
]) {
  test(
    "lightweight dirty checking rejects " +
      name +
      " before declaring the source clean",
    async () => {
      const f = fixture();
      setup(f);
      await assert.rejects(
        f.c.readBackupSourceSignature(),
        (error) => error.code === code,
      );
    },
  );
}
test("report-note errors cannot be ignored by the lightweight clean check", async () => {
  const f = fixture();
  f.c.window.EduPeriodicReports.getDrafts = () => {
    throw Error("Synthetic corrupt note");
  };
  await assert.rejects(
    f.c.readBackupSourceSignature(),
    /Synthetic corrupt note/,
  );
});
test("a changed durable installation epoch rejects a lightweight signature even if catalog IDs match", async () => {
  const f = fixture();
  f.stores.records[0].value.token = "replacement";
  await assert.rejects(
    f.c.readBackupSourceSignature(),
    (error) => error.code === "INSTALLATION_CHANGED",
  );
});
test("a workspace change during a lightweight read cannot publish a source fingerprint", async () => {
  const f = fixture();
  f.onTransaction(() => {
    f.c.workspace = { id: "second", revision: 1 };
  });
  await assert.rejects(
    f.c.readBackupSourceSignature(),
    (error) => error.code === "BACKUP_CONTEXT_CHANGED",
  );
});
