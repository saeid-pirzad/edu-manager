"use strict";

async function backupMatrix() {
  db = EduV24.normalizeDB(auditFixture);
  await saveDB({ action: "ایجاد داده ساختگی آزمون ممیزی" });
  const base = await EduV24.snapshotInstallation();
  const period = base.stores.catalog.find((p) => p.id === base.activeWorkspace);
  const results = [];
  const test = (id, name, expected, mutate) => {
    const value = structuredClone(base);
    let accepted = false,
      error = "";
    try {
      mutate(value);
      EduV24.validateFullBackup(value);
      accepted = true;
    } catch (e) {
      error = e.message;
    }
    results.push({
      id,
      name,
      expected,
      observed: accepted ? "accept" : "reject",
      pass: accepted === (expected === "accept"),
      ...(error ? { error } : {}),
    });
  };
  const record = (v, logical) =>
    v.stores.records.find(
      (r) => r.workspace === period.id && r.logical === logical,
    );
  const badUndo = (v, before) => {
    v.stores.undo = [
      {
        id: period.id,
        workspace: period.id,
        revision: period.revision,
        action: "بازگردانی آزمایشی",
        before,
      },
    ];
  };
  test("B01", "valid installation backup", "accept", () => {});
  test("B02", "missing meta record", "reject", (v) => {
    v.stores.records = v.stores.records.filter(
      (r) => !(r.workspace === period.id && r.logical === "meta"),
    );
  });
  test("B03", "duplicate logical record", "reject", (v) =>
    v.stores.records.push(structuredClone(record(v, "meta"))),
  );
  test("B04", "missing referenced class", "reject", (v) => {
    v.stores.records = v.stores.records.filter(
      (r) => !(r.workspace === period.id && r.logical === "class:class_a"),
    );
  });
  test("B05", "orphan class record", "reject", (v) => {
    const value = {
      id: "orphan_class",
      name: "کلاس جاافتاده از چیدمان",
      students: [{ id: "orphan_student", name: "هنرجوی جاافتاده" }],
      archivedStudents: [],
      lessons: [],
    };
    v.stores.records.push({
      key: period.id + "|class:orphan_class",
      workspace: period.id,
      logical: "class:orphan_class",
      value,
    });
  });
  test("B06", "unknown logical record type", "reject", (v) =>
    v.stores.records.push({
      key: period.id + "|unknown:x",
      workspace: period.id,
      logical: "unknown:x",
      value: { name: "داده ناشناخته" },
    }),
  );
  test("B07", "class record key/value identifier mismatch", "reject", (v) => {
    const r = record(v, "class:class_b");
    r.value.id = "class_changed";
  });
  test("B08", "null-owner data record", "reject", (v) =>
    v.stores.records.push({
      key: "orphan|class:extra",
      workspace: null,
      logical: "class:extra",
      value: {},
    }),
  );
  test(
    "B09",
    "unknown active workspace",
    "reject",
    (v) => (v.activeWorkspace = "missing"),
  );
  test("B10", "missing undo before array", "reject", (v) => {
    badUndo(v, []);
    delete v.stores.undo[0].before;
  });
  test("B11", "undo removes mandatory meta", "reject", (v) =>
    badUndo(v, [{ key: "meta", value: null }]),
  );
  test("B12", "undo refers to unknown logical record type", "reject", (v) =>
    badUndo(v, [{ key: "unknown:x", value: {} }]),
  );
  test("B13", "undo would orphan a session", "reject", (v) =>
    badUndo(v, [{ key: "class:class_a", value: null }]),
  );
  test("B14", "undo revision is invalid", "reject", (v) => {
    badUndo(v, []);
    v.stores.undo[0].revision = "invalid";
  });
  test("B15", "duplicate undo store key", "reject", (v) => {
    badUndo(v, []);
    v.stores.undo.push(structuredClone(v.stores.undo[0]));
  });
  test("B16", "frozen report has malformed classes", "reject", (v) =>
    v.stores.reports.push({
      id: "report_bad",
      workspace: period.id,
      year: period.year,
      term: period.term,
      at: "2026-10-24T00:00:00.000Z",
      classes: [null],
    }),
  );
  test(
    "B17",
    "metadata label mismatch",
    "reject",
    (v) => (record(v, "meta").value.settings.academicTerm = "different"),
  );
  test("B18", "record references nonexistent workspace", "reject", (v) =>
    v.stores.records.push({
      key: "missing|meta",
      workspace: "missing",
      logical: "meta",
      value: {},
    }),
  );
  test("B19", "valid undo candidate", "accept", (v) => {
    const c = structuredClone(record(v, "class:class_a").value);
    c.name = "نام قبلی کلاس";
    badUndo(v, [{ key: "class:class_a", value: c }]);
  });
  test("B20", "supported version-one full backup", "accept", (v) => {
    v.version = 1;
    delete v.gradeDrafts;
  });
  test(
    "B21",
    "unknown future full-backup schema",
    "reject",
    (v) => (v.schemaVersion = 999),
  );
  test("B22", "duplicate catalog period identifier", "reject", (v) =>
    v.stores.catalog.push(structuredClone(v.stores.catalog[0])),
  );
  window.auditInstallation = base;
  return results;
}

module.exports = backupMatrix;
