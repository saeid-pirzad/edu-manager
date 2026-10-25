"use strict";

async function malformedFrozenReport() {
  const backup = structuredClone(auditInstallation),
    original = backup.activeWorkspace;
  const period = backup.stores.catalog.find((p) => p.id === original);
  backup.stores.undo = [];
  backup.stores.reports = [
    {
      id: "malformed_report",
      workspace: original,
      year: period.year,
      term: period.term,
      at: "2026-10-24T00:00:00.000Z",
      classes: [null],
    },
  ];
  try {
    EduV24.validateFullBackup(backup);
  } catch (e) {
    return {
      id: "I02",
      name: "malformed frozen report must be rejected",
      pass: true,
      rejectedAt: "validation",
      error: e.message,
    };
  }
  let restored = false,
    viewError = "",
    error = "";
  try {
    EduV24.previewFullBackup(backup);
    await EduV24.restoreFullBackup();
    restored = true;
    const id = EduV24.getReportContext().id,
      connection = EduV24.test.getConnection();
    const reports = await new Promise((resolve, reject) => {
      const request = connection
        .transaction("reports", "readonly")
        .objectStore("reports")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const report = reports.find((row) => row.workspace === id);
    if (!report) throw Error("Restored report not found");
    try {
      await EduV24.showFrozenReport(report.id);
    } catch (e) {
      viewError = e.message;
    }
  } catch (e) {
    error = e.message;
  }
  return {
    id: "I02",
    name: "malformed frozen report must be rejected",
    pass: false,
    validatorAccepted: true,
    restored,
    viewError,
    ...(error ? { error } : {}),
  };
}

module.exports = malformedFrozenReport;
