// Explicit command dispatch: tokens are data, never code or global function names.
function installWorkspaceActions() {
  const commands = new Map([
    ["assessment-stage", (button) => openAssessmentStage(button)],
    ["switch-period", (button) => switchPeriod(button.dataset.key)],
    ["frozen-report", (button) => showFrozenReport(button.dataset.key)],
    ["download-backup", (button) => downloadInternalBackup(button.dataset.key)],
    ["preview-backup", (button) => previewInternalBackup(button.dataset.key)],
    ["adopt-drafts", (button) => adoptDrafts(button.dataset.key)],
    ["approve-drafts", () => approveDrafts()],
    ["archived-report", (button) => showArchivedKarnameh(button.dataset.key)],
    ["edit-student", (button) => openEditStudentModal(button.dataset.key)],
    ["restore-student", (button) => restoreStudent(button.dataset.key)],
    ["copy-membership", () => saveMembership("copy")],
    ["history-more", (button) => openHistoryV24(integer(button.dataset.limit))],
    [
      "history-event",
      (button) =>
        showHistoryEvent(
          integer(button.dataset.key),
          integer(button.dataset.limit || "100"),
        ),
    ],
    [
      "download-event",
      (button) => downloadHistoryEvent(integer(button.dataset.key)),
    ],
    [
      "unfiltered-session",
      (button) => {
        const day = integer(button.dataset.day),
          period = integer(button.dataset.period);
        state.masterFilter = null;
        closeModal();
        return clickMasterCell(day, period);
      },
    ],
    ["periods", () => openPeriods()],
    ["history", () => openHistoryV24()],
    ["backups", () => openBackups()],
    ["open-wipe", () => wipeAllV24()],
    ["discard-drafts", () => discardDrafts()],
    ["review-drafts", () => reviewDrafts()],
    ["other-drafts", () => openOtherDrafts()],
    ["new-period", () => openNewPeriod()],
    ["create-period", () => createNewPeriod()],
    ["reopen-period", () => reopenPeriod()],
    ["finalize-period", () => finalizePeriod()],
    ["edit-period-label", () => editPeriodLabel()],
    ["export-period", () => exportBackupV24()],
    ["export-full", () => exportFullBackup()],
    ["prepare-share-backup", () => openBackupShare()],
    ["share-backup-file", (button) => sharePreparedBackup(button)],
    ["download-share-backup", () => downloadPreparedBackup()],
    ["single-file-choose", () => chooseSingleFile()],
    ["single-file-save", () => resumeSingleFile()],
    ["single-file-stop", () => disableSingleFile()],
    ["restore-full", () => restoreFullBackup()],
    ["confirm-import", () => confirmImport()],
    ["undo", () => undoLast()],
    ["raw-recovery", () => rawRecoveryV24()],
    ["choose-import", () => document.getElementById("importFile").click()],
    ["print", (button) => printReport(button)],
    ["close", () => closeModal()],
    ["reload", () => location.reload()],
  ]);
  function integer(value) {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw Error("پارامتر عملیات نامعتبر است.");
    return Number(value);
  }
  const submissions = new Map([
    ["save-membership", () => saveMembership()],
    ["save-student", () => saveStudent()],
    ["save-entity", () => saveEntityEditor()],
    ["commit-csv", () => commitCSV()],
    ["confirm-deletion", () => confirmDeletion()],
    ["confirm-wipe", () => confirmWipe()],
  ]);
  const allowed = (element) =>
    element &&
    !element.matches(":disabled") &&
    !element.closest("[inert]") &&
    element.closest("#app,#modalBody");
  const run = (handler, element) => {
    try {
      void Promise.resolve(handler(element)).catch(handleError);
    } catch (error) {
      handleError(error);
    }
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("button[data-workspace-action]");
    if (!allowed(button)) return;
    const handler = commands.get(button.dataset.workspaceAction);
    if (handler) run(handler, button);
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!form.matches?.("form[data-workspace-submit]")) return;
    event.preventDefault();
    if (!allowed(form)) return;
    const handler = submissions.get(form.dataset.workspaceSubmit);
    if (handler) run(handler, form);
  });
}
