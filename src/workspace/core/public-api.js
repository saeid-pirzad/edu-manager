async function prepareForUpdate() {
  assertWorkspaceReadable();
  const origin = { id: workspace.id, connection };
  const check = () => {
    assertWorkspaceReadable();
    if (workspace.id !== origin.id || connection !== origin.connection)
      throw Error(
        "اطلاعات هنگام آماده‌سازی به‌روزرسانی تغییر کرد؛ دوباره تلاش کنید.",
      );
  };
  for (;;) {
    check();
    await flushDrafts({ strict: true });
    const periodic = window.EduPeriodicReports;
    if (periodic?.hasPendingNotes?.()) {
      await periodic.retryNotes?.();
      check();
      if (periodic.hasPendingNotes())
        throw Error(
          "توضیحات گزارش هنوز ذخیره نشده است؛ پیش از به‌روزرسانی ذخیرهٔ آن را دوباره امتحان کنید.",
        );
    }
    const saves = writer,
      pendingDrafts = draftWriter,
      fileWrite = singleFileWriting;
    await saves;
    await pendingDrafts;
    if (fileWrite) await fileWrite;
    check();
    if (
      saves !== writer ||
      pendingDrafts !== draftWriter ||
      fileWrite !== singleFileWriting
    )
      continue;
    if (window.EduPeriodicReports?.hasPendingNotes?.()) continue;
    if (
      busy ||
      drafts.size ||
      assessmentContext.hasDrafts() ||
      draftWritesPending ||
      draftRecoveryFailed ||
      hasRecordEditorChanges()
    )
      throw Error(
        "ویرایش ذخیره‌نشده وجود دارد؛ پیش از به‌روزرسانی آن را ذخیره یا لغو کنید.",
      );
    return true;
  }
}
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
      l.gradeMode === "kardanesh" || l.gradingPolicy
        ? '<div class="card report-document grade-report"><button class="no-print" data-workspace-action="print">چاپ / PDF</button>' +
          (l.gradeMode === "kardanesh"
            ? termAssessmentReport(c, l)
            : courseUI.table(c, l)) +
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
    toggleAtt: toggleAttendanceV24,
    changeSessionDate: changeSessionDateV24,
    addManualSession: addManualSessionV24,
    deleteSession: deleteSessionV24,
    deleteAllSessions: deleteAllSessionsV24,
    saveSessionUnit: saveSessionUnitV24,
    updateSessionUnits: updateSessionUnitsV24,
    addSessionScore: addSessionScoreV24,
    removeSessionScore: removeSessionScoreV24,
    clickMasterCell: clickMasterV24,
    toggleActiveDay: toggleActiveDayV24,
    changePeriods: changePeriodsV24,
    saveWeekStartDate: saveWeekStartDateV24,
    saveMasterConfig: saveMasterConfigV24,
    clearMasterConfig: clearMasterConfigV24,
    startSessionFromMaster: startSessionFromMasterV24,
    exportBackup: exportFullBackup,
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
    discardDrafts,
    reviewDrafts,
    approveDrafts,
    asciiDigits,
    parseGrade,
    fraction,
    weightedKardanesh,
    finalText,
    getReportContext: () => ({
      ...academicYearNotesContext(),
      id: workspace?.id || "",
      revision: workspace?.revision || 0,
      pendingDrafts: drafts.size + assessmentContext.pending,
      closed: !!workspace?.closed,
      year: workspace?.year || "",
      term:
        { first: "اول", second: "دوم" }[
          workspace?.termKind || academicTermKind(workspace?.term || "")
        ] ||
        workspace?.term ||
        "",
      ready: ready && !periodLoading,
      blocked,
      retired: connectionRetired,
      resetting: resetBusy,
      saving: busy,
      authenticated: !db.settings.password || isAuthenticated,
    }),
    startTodaySession: startTodaySessionV24,
    openAcademicYear,
    refreshYearLessonSessions,
    openYearSession,
    prepareForUpdate,
    prepareReportSnapshot,
    renderAcademicKarnameh,
    openKarnamehStudent,
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
    openBackupShare,
    sharePreparedBackup,
    downloadPreparedBackup,
    downloadLastSafetyBackup,
    snapshotInstallation,
    validateFullBackup,
    previewFullBackup,
    restoreFullBackup,
    confirmImport,
    undoLast,
    openPeriods,
    switchPeriod: (id) => switchPeriod(id),
    openNewPeriod,
    finalizePeriod,
    reopenPeriod,
    showFrozenReport,
    printReport,
    copyReport: copyReportV24,
    preparePrint,
    commitCSV,
    saveStudent,
    refreshControlLocks: lockControls,
    recoverReportNotes: () =>
      workspace ? hydrateReportNotes(workspace) : true,
    canWriteReportNotes: () =>
      !periodLoading && !resetBusy && !connectionRetired,
    confirmWipe,
    saveDB: saveDBV24,
    bootstrap: bootstrapV24,
    test: {
      prepareLegacyPeriodFixture: () => {
        if (!globalThis.__EDU_TEST_MODE__) throw Error("فقط در حالت آزمون");
        // Old-format catalogs are synthetic compatibility fixtures, not a
        // second year-management interface available to application users.
        return showModal(
          "Synthetic legacy catalog fixture",
          '<input id="periodYear"><select id="periodTerm"><option>اول</option><option>دوم</option></select>',
        );
      },
      createLegacyPeriod: () => {
        if (!globalThis.__EDU_TEST_MODE__) throw Error("فقط در حالت آزمون");
        return createNewPeriod();
      },
      switchLegacyPeriod: (id) => {
        if (!globalThis.__EDU_TEST_MODE__) throw Error("فقط در حالت آزمون");
        return switchPeriod(id, legacyPeriodSwitchToken);
      },
      openLegacyPeriodDeletion: (id) => {
        if (!globalThis.__EDU_TEST_MODE__) throw Error("فقط در حالت آزمون");
        return openDeletePeriod(id);
      },
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
      importLegacyBackup: (event) => {
        if (!globalThis.__EDU_TEST_MODE__) throw Error("فقط در حالت آزمون");
        return handleImportV24(event, { replaceSystem: false });
      },
    },
  };
}
