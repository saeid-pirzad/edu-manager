// Explicit command dispatch: tokens are data, never code or global function names.
function installWorkspaceActions() {
  const commands = new Map([
    ["year-sessions", () => refreshYearLessonSessions({ interactive: true })],
    [
      "year-session",
      (button) => openYearSession(button.dataset.workspace, button.dataset.key),
    ],
    ["apply-academic-schedule", () => applyAcademicScheduleV24()],
    ["assessment-stage", (button) => openAssessmentStage(button)],
    [
      "karnameh-student",
      (button) => openKarnamehStudent(button.dataset.class, button.dataset.key),
    ],
    ["switch-period", (button) => switchPeriod(button.dataset.key)],
    ["frozen-report", (button) => showFrozenReport(button.dataset.key)],
    ["adopt-drafts", (button) => adoptDrafts(button.dataset.key)],
    ["approve-drafts", () => approveDrafts()],
    ["archived-report", (button) => showArchivedKarnameh(button.dataset.key)],
    ["edit-student", (button) => openEditStudentModal(button.dataset.key)],
    ["restore-student", (button) => restoreStudent(button.dataset.key)],
    ["copy-membership", () => saveMembership("copy")],
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
    ["periods", () => openAcademicYear()],
    ["term-records", () => openPeriods()],
    ["backups", () => openBackups()],
    ["deputy-export", (button) => openDeputyExport(button.dataset.school)],
    ["export-deputy-packet", () => exportDeputyPacket()],
    ["open-wipe", () => wipeAllV24()],
    ["discard-drafts", () => discardDrafts()],
    ["review-drafts", () => reviewDrafts()],
    ["other-drafts", () => openOtherDrafts()],
    ["create-period", () => createNewPeriod({ fromDialog: true })],
    ["reopen-period", () => reopenPeriod()],
    ["finalize-period", () => finalizePeriod()],
    ["new-second-period", (button) => openNewPeriod(button.dataset.key)],
    ["export-period", () => exportFullBackup()],
    ["export-full", () => exportFullBackup()],
    ["prepare-share-backup", () => openBackupShare()],
    ["share-backup-file", (button) => sharePreparedBackup(button)],
    ["download-share-backup", () => downloadPreparedBackup()],
    ["download-safety", (button) => downloadLastSafetyBackup(button)],
    ["single-file-choose", () => chooseSingleFile()],
    ["single-file-save", () => resumeSingleFile()],
    ["single-file-stop", () => disableSingleFile()],
    ["restore-full", () => restoreFullBackup()],
    ["confirm-import", () => confirmImport()],
    ["undo", () => openUndoModal()],
    ["confirm-undo", () => confirmUndo()],
    ["raw-recovery", () => rawRecoveryV24()],
    ["choose-import", () => document.getElementById("importFile").click()],
    [
      "print",
      (button) =>
        printReport(button, {
          context: karnamehSnapshots.get(
            button.closest(".karnameh-year-document"),
          ),
        }),
    ],
    ["close", () => closeModal()],
    ["reload", () => location.reload()],
  ]);
  if (globalThis.__EDU_TEST_MODE__) {
    commands.set("delete-period", (button) =>
      openDeletePeriod(button.dataset.key),
    );
    commands.set("confirm-delete-period", () => confirmDeletePeriod());
  }
  function integer(value) {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw Error("پارامتر عملیات نامعتبر است.");
    return Number(value);
  }
  const submissions = new Map([
    ["prepare-deputy-packet", () => prepareDeputyPacket()],
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
