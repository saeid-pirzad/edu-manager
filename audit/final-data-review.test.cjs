"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function directorySave({ correctedTerm = "اول" } = {}) {
  const context = vm.createContext({
    structuredClone,
    IDBKeyRange: { bound: (lower, upper) => ({ lower, upper }) },
  });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/data-boundary.js",
    "domain/revision.js",
    "domain/academic-year-directory.js",
    "domain/academic-year-courses.js",
    "domain/history-changes.js",
    "data/commit-plan.js",
    "data/workspace-records.js",
    "data/academic-directory-transaction.js",
    "data/record-transaction.js",
    "validation/undo.js",
    "validation/full-backup.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      context,
    );
  const codec = context.EduWorkspaceRecords.create({
      clone: structuredClone,
      normalizeDB: (data) => data,
      isDataObject: (value) =>
        value !== null && typeof value === "object" && !Array.isArray(value),
      isSafeRecordId: (value) => /^[A-Za-z0-9_-]+$/.test(value),
    }),
    workspace = {
      id: "first",
      year: "1405-1406",
      term: "اول",
      termKind: "first",
      revision: 1,
      closed: false,
      createdAt: "2026-11-20T10:00:00.000Z",
    },
    data = {
      settings: { academicYear: workspace.year, academicTerm: workspace.term },
      schools: [
        {
          id: "school",
          name: "مدرسه",
          classes: [
            {
              id: "class",
              name: "نام قبلی",
              students: [],
              archivedStudents: [],
              lessons: [],
            },
          ],
        },
      ],
      sessions: [],
    },
    original = codec.collectRecords(data),
    stores = {
      catalog: new Map([[workspace.id, structuredClone(workspace)]]),
      records: new Map(
        [...original].map(([logical, value]) => [
          workspace.id + "|" + logical,
          {
            key: workspace.id + "|" + logical,
            workspace: workspace.id,
            logical,
            value: structuredClone(value),
          },
        ]),
      ),
      events: new Map(),
      undo: new Map(),
    };
  let done;
  const connection = {
    transaction() {
      const staged = structuredClone(stores);
      let complete,
        fail,
        pending = 0,
        aborted = false;
      done = new Promise((resolve, reject) => {
        complete = resolve;
        fail = reject;
      });
      const read = (name, key, range) => {
        const request = {};
        pending++;
        queueMicrotask(() => {
          if (aborted) return;
          request.result = structuredClone(
            key === undefined
              ? [...staged[name].values()].filter(
                  (row) =>
                    !range || (row.key >= range.lower && row.key < range.upper),
                )
              : staged[name].get(key),
          );
          request.onsuccess?.();
          pending--;
          if (!pending && !aborted) {
            Object.assign(stores, staged);
            complete();
          }
        });
        return request;
      };
      return {
        abort() {
          aborted = true;
          fail(Error("aborted"));
        },
        objectStore(name) {
          return {
            get: (key) => read(name, key),
            getAll: (range) => read(name, undefined, range),
            put: (row) =>
              staged[name].set(
                name === "records" ? row.key : row.id,
                structuredClone(row),
              ),
            add: (row) =>
              staged[name].set(staged[name].size + 1, structuredClone(row)),
            delete: (key) => staged[name].delete(key),
          };
        },
      };
    },
  };
  context.EduDataStoreRuntime = { transactionDone: () => done };
  const validateBackup = context.EduFullBackupValidator.create({
    backupStores: [
      "catalog",
      "records",
      "events",
      "undo",
      "reports",
      "backups",
    ],
    assertSafeDataTree: context.assertSafeDataTree,
    isDataObject: context.isDataObject,
    isSafeRecordId: context.isSafeRecordId,
    validateReportNotes() {},
    decodeWorkspaceRecords: codec.decodeWorkspaceRecords,
    validateFrozenReport: () =>
      assert.fail("No frozen reports in this fixture"),
    normalizeDB: (value) => value,
    validatedUndoCandidate: (undo, records, period) =>
      context.EduUndoValidator.validate(undo, records, period, {
        assertSafeDataTree: context.assertSafeDataTree,
        isDataObject: context.isDataObject,
        isSafeRecordId: context.isSafeRecordId,
        clone: structuredClone,
        ...codec,
      }),
    isSupportedGradeDraft: () => assert.fail("No drafts in this fixture"),
  });
  data.schools[0].classes[0].name = "نام اصلاح‌شده";
  data.settings.academicTerm = correctedTerm;
  const records = codec.collectRecords(data),
    durable = new Map(
      [...stores.records.values()].map((row) => [
        row.logical,
        JSON.stringify(row.value),
      ]),
    ),
    plan = context.EduRecordCommitPlan.create(records, durable);
  return {
    data,
    records,
    stores,
    validateBackup: () =>
      validateBackup({
        format: "EduManager.FullBackup",
        version: 2,
        schemaVersion: 26,
        activeWorkspace: workspace.id,
        gradeDrafts: [],
        stores: {
          ...Object.fromEntries(
            Object.entries(stores).map(([name, rows]) => [
              name,
              [...rows.values()],
            ]),
          ),
          reports: [],
          backups: [],
        },
      }),
    save: () =>
      context.EduRecordTransaction.commit({
        connection,
        workspace,
        records,
        ...plan,
        action: "اصلاح نام کلاس",
        keepUndo: true,
        normalizedName: String,
        academicTermKind: () => "first",
        decodeRecords: codec.decodeWorkspaceRecords,
        historicalRoster: () => [],
      }),
  };
}

for (const field of ["academicTerm", "academicYear"])
  test(`pending shared-directory save keeps ${field} in its original record snapshot`, async () => {
    const fixture = directorySave(),
      pending = fixture.save();
    fixture.data.settings[field] =
      field === "academicTerm" ? "ویرایش هنوز ذخیره‌نشده" : "1406-1407";
    const catalog = await pending,
      meta = fixture.stores.records.get("first|meta").value;
    assert.doesNotThrow(fixture.validateBackup);
    assert.equal(catalog.year, meta.settings.academicYear);
    assert.equal(catalog.term, meta.settings.academicTerm);
    assert.equal(catalog.year, "1405-1406");
    assert.equal(catalog.term, "اول");
    assert.equal(
      fixture.stores.records.get("first|class:class").value.name,
      "نام اصلاح‌شده",
    );
  });

test("shared-directory label correction commits its captured meta despite later map replacement", async () => {
  const fixture = directorySave({ correctedTerm: "عنوان اصلاح‌شده" }),
    pending = fixture.save();
  fixture.records.set("meta", {
    settings: { academicYear: "1406-1407", academicTerm: "ویرایش بعدی" },
  });
  const catalog = await pending,
    meta = fixture.stores.records.get("first|meta").value;
  assert.doesNotThrow(fixture.validateBackup);
  assert.equal(catalog.year, "1405-1406");
  assert.equal(catalog.term, "عنوان اصلاح‌شده");
  assert.equal(catalog.term, meta.settings.academicTerm);
  assert.equal(catalog.revision, 2);
});
