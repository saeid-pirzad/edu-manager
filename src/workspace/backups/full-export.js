// Composition only: this adapter supplies live workspace ports to a service
// that owns snapshot preparation and source-signature calculation.
const installationBackup = EduInstallationBackup({
  getState: () => ({
    workspaceId: workspace?.id,
    connection,
    installation: installationToken,
    ready,
    periodLoading,
    resetBusy,
    connectionRetired,
  }),
  storage: {
    local: () => localStorage,
    storeNames: () => backupStores,
    resetRecordKey: () => RESET_RECORD_KEY,
    request: (request) => requestPromise(request),
    done: (transaction) => transactionDone(transaction),
  },
  drafts: {
    current: () => ({
      key: draftStorageKey(),
      workspace: workspace.id,
      owner: documentToken,
      generation: draftGeneration,
      entries: clone([...drafts.values()]),
      updatedAt: new Date().toISOString(),
    }),
    assessment: () =>
      typeof assessmentContext === "undefined"
        ? null
        : assessmentContext.snapshot(),
    portable: (...args) => EduGradeDrafts.portableGradeDrafts(...args),
    flush: () => flushDrafts(),
    persist: () => storeDrafts(),
    writes: () => writer,
    pending: () => draftWriter,
  },
  reports: {
    drafts: () =>
      window.EduPeriodicReports?.getDrafts?.bind(window.EduPeriodicReports),
  },
  identity: (rows) => EduDeputyExportIdentity.fromRows(rows),
});
function snapshotInstallation(options) {
  return installationBackup.snapshot(options);
}
function readBackupSourceSignature() {
  return installationBackup.signature();
}
async function exportFullBackup() {
  const content = await snapshotInstallation();
  validateFullBackup(content);
  downloadJSON(content, "Classyar-Classroom.json");
  recordFullBackupDelivery({
    kind: "download-requested",
    exportedAt: content.exportedAt,
  });
  setStatus(
    "دانلود پشتیبان کامل سیستم درخواست شد" +
      (content.gradeDrafts.length
        ? "؛ پیش‌نویس‌های ناتمام هم جداگانه در فایل حفظ شدند"
        : "") +
      "؛ فایل را بیرون برنامه بررسی کنید.",
    "saved",
  );
  return content.stores.catalog.length;
}
