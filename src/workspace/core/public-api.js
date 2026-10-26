function installRuntimeAPI() {
  EduRuntimeAPI.install({
    openSettingsModal: openSettingsV24,
    saveSettings: saveSettingsV24,
    sessionStudent: (c, x, id) =>
      sessionRoster(c, x).find((st) => st.id === id) || getStudentObj(c, id),
    knownStudentCode: (c, code, exclude) =>
      knownStudents(c).some((st) => st.code === code && st.id !== exclude),
    downloadRawRecovery: rawRecoveryV24,
    openLessonConfig: courseUI.open,
    saveLessonConfig: courseUI.save,
    addLesson: courseUI.add,
    gradeStatus: policyStatus,
    buildLessonGradesHtml: (c, l) =>
      l.gradeMode === "kardanesh"
        ? buildKardaneshEditor(c, l)
        : l.gradingPolicy
          ? courseUI.table(c, l, null, true)
          : old.buildLessonGradesHtml(c, l),
    renderLessonStudents: (c, l) =>
      l.gradingPolicy ? courseUI.table(c, l) : old.renderLessonStudents(c, l),
    buildLessonReportHtml: (c, l) =>
      l.gradingPolicy
        ? '<div class="card"><button class="no-print" data-workspace-action="print">چاپ / PDF</button>' +
          courseUI.table(c, l) +
          "</div>"
        : old.buildLessonReportHtml(c, l),
    defaultDB: v24DefaultDB,
    prepareDB: normalizeDB,
    validateDB: validateV24,
    saveDB: saveDBV24,
    render: renderV24,
    calcStudentLesson: calcV24,
    buildKardaneshGradesHtml: buildKardaneshEditor,
    buildKardaneshSummaryHtml: buildKardaneshSummary,
    openBulkScoreModal: openBulkV24,
    setAllAttendance: setAllAttendanceV24,
    saveSessionUnit: saveSessionUnitV24,
    updateSessionUnits: updateSessionUnitsV24,
    addSessionScore: addSessionScoreV24,
    clickMasterCell: clickMasterV24,
    exportBackup: exportBackupV24,
    handleImport: handleImportV24,
    handleExcelImport: csvImportV24,
    downloadExcelTemplate: downloadCSVTemplate,
    openTransferModal: (id) => openMembership("transfer", id),
    deleteStudent: (id) => openMembership("archive", id),
    restoreStudent: (id) => openMembership("restore", id),
    doTransfer: (id, copy) =>
      membershipContext?.studentId === id
        ? saveMembership(copy ? "copy" : "")
        : undefined,
    deleteSchool: (id) => openDeletion("school", id),
    deleteClass: (id) => openDeletion("class", id),
    deleteLesson: (id) => openDeletion("lesson", id),
    addSchool: (event) => createEntityV24(event, "school"),
    addClass: (event) => createEntityV24(event, "class"),
    addStudent: addStudentV24,
    openEditStudentModal: editStudentV24,
    buildArchiveHtml: buildArchiveV24,
    buildOverviewKarnamehHtml: overviewV24,
    buildDetailedKarnamehHtml: detailedV24,
    generateParentReportText: parentReportV24,
    wipeAllData: wipeAllV24,
    showModal: showModalV24,
    checkPassword: loginV24,
  });
  window.EduV24 = {
    course: courseUI,
    openEntityEditor,
    saveEntityEditor,
    confirmDeletion,
    saveMembership,
    openOtherDrafts,
    adoptDrafts,
    showHistoryEvent,
    downloadHistoryEvent,
    discardDrafts,
    reviewDrafts,
    approveDrafts,
    asciiDigits,
    parseGrade,
    fraction,
    weightedKardanesh,
    finalText,
    getReportContext: () => ({
      id: workspace?.id || "",
      revision: workspace?.revision || 0,
      pendingDrafts: drafts.size,
      closed: !!workspace?.closed,
      year: workspace?.year || "",
      term: workspace?.term || "",
      ready,
      blocked,
      retired: connectionRetired,
      resetting: resetBusy,
      saving: busy,
      authenticated: !db.settings.password || isAuthenticated,
    }),
    prepareReportSnapshot,
    listAnnualReportPeriods,
    assessmentResult,
    annualGradeRows,
    annualTechnicalRows,
    assertReportSnapshot,
    normalizeDB,
    validateV24,
    averageLabel,
    csvPlan,
    gradeInput,
    clearGrade,
    flushDrafts,
    openBackups,
    exportFullBackup,
    snapshotInstallation,
    validateFullBackup,
    previewFullBackup,
    restoreFullBackup,
    automaticFullBackup,
    downloadInternalBackup,
    previewInternalBackup,
    confirmImport,
    openHistory: openHistoryV24,
    undoLast,
    openPeriods,
    switchPeriod,
    openNewPeriod,
    createNewPeriod,
    editPeriodLabel,
    savePeriodLabel,
    finalizePeriod,
    reopenPeriod,
    showFrozenReport,
    printReport,
    preparePrint,
    commitCSV,
    saveStudent,
    refreshControlLocks: lockControls,
    recoverReportNotes: () =>
      workspace ? hydrateReportNotes(workspace) : true,
    canWriteReportNotes: () => !resetBusy && !connectionRetired,
    confirmWipe,
    saveDB: saveDBV24,
    bootstrap: bootstrapV24,
    test: {
      getState: () => ({
        db,
        ready,
        workspace,
        blocked,
        busy,
        status,
        drafts: [...drafts.values()],
      }),
      settle: async () => {
        await flushDrafts();
        await writer;
        await draftWriter;
      },
      failNextWrite: () => {
        if (!globalThis.__EDU_TEST_MODE__) throw Error("فقط در حالت آزمون");
        failNextWrite = true;
      },
      getConnection: () => connection,
    },
  };
}
