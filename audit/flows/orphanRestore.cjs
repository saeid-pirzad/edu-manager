"use strict";

async function orphanRestore() {
  const backup = structuredClone(auditInstallation);
  const original = backup.activeWorkspace;
  backup.stores.undo = [];
  backup.stores.records.push({
    key: original + "|class:orphan_class",
    workspace: original,
    logical: "class:orphan_class",
    value: {
      id: "orphan_class",
      name: "کلاس جاافتاده",
      students: [{ id: "orphan_student", name: "هنرجوی جاافتاده" }],
      archivedStudents: [],
      lessons: [],
    },
  });
  try {
    EduV24.validateFullBackup(backup);
  } catch (e) {
    return {
      id: "I01",
      name: "orphan class must be rejected by import validation",
      pass: true,
      rejectedAt: "validation",
      error: e.message,
    };
  }
  let accepted = false,
    error = "",
    missingAfterRestore = false;
  try {
    EduV24.previewFullBackup(backup);
    await EduV24.restoreFullBackup();
    accepted = true;
    missingAfterRestore = !db.schools.some((s) =>
      s.classes.some((c) => c.id === "orphan_class"),
    );
  } catch (e) {
    error = e.message;
  }
  return {
    id: "I01",
    name: "orphan class must not disappear in successful restore",
    pass: !accepted,
    accepted,
    missingAfterRestore,
    ...(error ? { error } : {}),
  };
}

module.exports = orphanRestore;
