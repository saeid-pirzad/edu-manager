"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const key = "Edu24.drafts.first.tab.document";
const grade = (value) => ({
  kind: "k",
  classId: "class",
  lid: "lesson",
  sid: "student",
  field: "theory",
  value,
  review: true,
});
function fixture(entries, local = {}) {
  const stores = {
    catalog: [{ id: "first" }],
    records: [],
    events: [],
    undo: [],
    reports: [],
    backups: [],
    drafts: [],
  };
  const storage = Object.assign(Object.create(null), local);
  Object.defineProperty(storage, "getItem", {
    value(name) {
      return Object.hasOwn(this, name) ? this[name] : null;
    },
  });
  const c = vm.createContext({
    structuredClone,
    workspace: { id: "first" },
    ready: true,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    installationToken: "",
    RESET_RECORD_KEY: "@installation-reset",
    writer: Promise.resolve(),
    draftWriter: Promise.resolve(),
    flushDrafts: async () => {
      throw Error("Review required");
    },
    storeDrafts: async () => {},
    draftStorageKey: () => key,
    documentToken: "document",
    draftGeneration: 3,
    drafts: new Map(entries.map((entry, index) => [index, entry])),
    clone: structuredClone,
    backupStores: [
      "records",
      "catalog",
      "events",
      "backups",
      "undo",
      "reports",
    ],
    localStorage: storage,
    window: { EduPeriodicReports: { getDrafts: () => ({}) } },
    EduDeputyExportIdentity: { fromRows: () => null },
    requestPromise: (request) => Promise.resolve(request),
    transactionDone: () => Promise.resolve(),
    connection: {
      transaction: () => ({
        objectStore: (name) => ({
          getAll: () => structuredClone(stores[name]),
          openCursor() {
            const request = {};
            let index = 0;
            const dispatch = () =>
              queueMicrotask(() => {
                const value = stores[name][index++];
                request.result = value
                  ? {
                      value: structuredClone(value),
                      primaryKey: value.id,
                      continue: dispatch,
                    }
                  : null;
                request.onsuccess?.();
              });
            dispatch();
            return request;
          },
        }),
      }),
    },
  });
  for (const file of [
    "domain/grade-drafts.js",
    "workspace/backups/full-export.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  return { c, stores, storage };
}
test("a failed grade flush still exports every safe raw draft claimed by snapshot notes", async () => {
  const long = "۹".repeat(101),
    f = fixture([grade("17"), { ...grade(long), sid: "student2" }]);
  const file = await f.c.snapshotInstallation();
  assert.equal(file.gradeDrafts.length, 1);
  assert.deepEqual(
    file.gradeDrafts[0].entries.map((entry) => entry.value),
    ["17", long],
  );
  assert.ok(
    file.snapshotNotes.some((note) =>
      note.includes("پیش‌نویس‌ها جداگانه حفظ شدند"),
    ),
  );
});
test("failed local and durable draft persistence does not omit long in-memory input from a backup", async () => {
  const long = "x".repeat(1000),
    f = fixture([grade(long)]);
  f.c.storeDrafts = async () => {
    throw Error("Draft store unavailable");
  };
  const file = await f.c.snapshotInstallation();
  assert.equal(file.gradeDrafts[0].entries[0].value, long);
  assert.ok(
    file.snapshotNotes.some((note) =>
      note.includes("پیش‌نویس حافظه نیز در فایل قرار گرفت"),
    ),
  );
});
test("an unsupported current draft fails the snapshot instead of returning success notes without its data", async () => {
  const f = fixture([{ ...grade("17"), kind: "future" }]);
  await assert.rejects(
    f.c.snapshotInstallation(),
    (error) => error.code === "GRADE_DRAFT_INVALID",
  );
  assert.equal(f.c.drafts.size, 1);
});
test("malformed local JSON in this installation fails backup before an older readable draft can replace it", async () => {
  const f = fixture([], { [key]: "{broken" });
  f.stores.drafts = [
    {
      key,
      workspace: "first",
      generation: 1,
      entries: [grade("10")],
      updatedAt: "",
    },
  ];
  await assert.rejects(
    f.c.snapshotInstallation(),
    (error) => error.code === "BACKUP_DRAFT_UNREADABLE",
  );
  assert.equal(f.storage.getItem(key), "{broken");
});
test("corrupt drafts from a different installation workspace do not block this complete backup", async () => {
  const f = fixture([grade("17")], {
    "Edu24.drafts.foreign.tab.document": "{broken",
  });
  const file = await f.c.snapshotInstallation();
  assert.equal(file.gradeDrafts[0].entries[0].value, "17");
});
