const validateFullBackup = EduFullBackupValidator.create({
  backupStores,
  assertSafeDataTree,
  isDataObject,
  isSafeRecordId,
  validateReportNotes,
  decodeWorkspaceRecords,
  validateFrozenReport,
  normalizeDB,
  validatedUndoCandidate,
  isSupportedGradeDraft,
});
let pendingFullBackup = null,
  fullRestoreBusy = false;
function previewFullBackup(value) {
  const periods = validateFullBackup(value);
  const opened = showModal(
    "بازیابی پشتیبان کامل",
    "<p>" +
      periods.length +
      " دوره به همراه تاریخچه و گزارش‌های بایگانی‌شده بازیابی می‌شود.</p>" +
      ((value.gradeDrafts || []).length
        ? "<p>" +
          value.gradeDrafts.reduce((n, row) => n + row.entries.length, 0) +
          " پیش‌نویس نمره هم همراه فایل است؛ پس از بازیابی فقط با بررسی شما اعمال می‌شود.</p>"
        : "") +
      "<p>دوره‌های فعلی حفظ می‌شوند؛ نسخه‌های بازیابی‌شده با شناسه مستقل اضافه می‌شوند.</p>" +
      '<button data-full-restore data-workspace-action="restore-full">افزودن همه دوره‌های بازیابی‌شده</button><p id="courseError" role="alert"></p>',
  );
  if (opened !== false) pendingFullBackup = value;
}
async function restoreFullBackup() {
  if (fullRestoreBusy)
    throw Error("بازیابی کامل در حال انجام است؛ تا پایان آن صبر کنید.");
  fullRestoreBusy = true;
  const button = document.querySelector("[data-full-restore]");
  if (button) setControlLock(button, "button-operation", true);
  try {
    if (!pendingFullBackup)
      throw Error("ابتدا فایل پشتیبان کامل را انتخاب کنید.");
    const source = pendingFullBackup;
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    const periods = validateFullBackup(source);
    const mapping = new Map(periods.map(({ period }) => [period.id, uid()]));
    const existing = await allFrom("catalog");
    const occupied = new Set(
      existing.map((p) => p.year + "|" + normalizedName(p.term)),
    );
    const rows = Object.fromEntries(backupStores.map((name) => [name, []]));
    for (const { period, data } of periods) {
      const id = mapping.get(period.id);
      let term = period.term;
      if (occupied.has(period.year + "|" + normalizedName(term)))
        term = recoveryPeriodTerm(term, id);
      occupied.add(period.year + "|" + normalizedName(term));
      data.settings.academicTerm = term;
      const reportNotes = {
        ...validateReportNotes(period.reportNotesRecovery, period.id),
        ...validateReportNotes(source.reportDrafts?.[period.id], period.id),
      };
      const reportNotesRecovery = Object.fromEntries(
        Object.entries(reportNotes).map(([key, text]) => [
          remapReportNoteKey(key, id, mapping),
          text,
        ]),
      );
      rows.catalog.push({
        ...period,
        id,
        term,
        termKind: period.termKind || academicTermKind(period.term),
        reportNotesRecovery,
      });
      for (const [logical, value] of collectRecords(data))
        rows.records.push({
          key: id + "|" + logical,
          workspace: id,
          logical,
          value,
        });
    }
    for (const name of ["events", "undo", "reports", "backups"])
      for (const original of source.stores[name]) {
        if (name === "backups" && original.full) continue;
        const row = clone(original);
        if (row.workspace != null) row.workspace = mapping.get(row.workspace);
        if (name === "events") delete row.id;
        else row.id = name === "undo" ? mapping.get(original.id) : uid();
        if (name === "undo") {
          const originalPeriod = source.stores.catalog.find(
            (p) => p.id === original.id,
          );
          const importedPeriod = rows.catalog.find((p) => p.id === row.id);
          for (const before of row.before || [])
            if (
              before.key === "meta" &&
              before.value?.settings?.academicYear === originalPeriod?.year &&
              before.value.settings.academicTerm === originalPeriod.term
            )
              before.value.settings.academicTerm = importedPeriod.term;
        }
        rows[name].push(row);
      }
    rows.drafts = (source.gradeDrafts || []).map((row) => ({
      ...clone(row),
      key:
        "Edu24.drafts." +
        mapping.get(row.workspace) +
        row.key.slice(("Edu24.drafts." + row.workspace).length),
      workspace: mapping.get(row.workspace),
      owner: "imported",
      entries: row.entries.map((item) => ({
        ...clone(item),
        review: true,
        error: "بازیابی از فایل؛ نیازمند بررسی",
      })),
    }));
    const restoredStores = [...backupStores, "drafts"];
    const tx = connection.transaction(restoredStores, "readwrite"),
      done = transactionDone(tx);
    for (const name of restoredStores)
      for (const row of rows[name]) tx.objectStore(name).add(row);
    await done;
    let reportNotesFailed = false;
    for (const [oldId, id] of mapping) {
      try {
        const saved = rows.catalog.find(
          (period) => period.id === id,
        ).reportNotesRecovery;
        if (window.EduPeriodicReports?.restoreDrafts) {
          if (!window.EduPeriodicReports.restoreDrafts(id, saved))
            throw Error("ذخیره معمول توضیحات کامل نشد.");
        } else
          localStorage.setItem(
            "EduManager.periodicDrafts." + id,
            JSON.stringify(saved),
          );
      } catch {
        reportNotesFailed = true;
        setStatus(
          "دوره‌ها بازیابی شدند؛ نسخه توضیحات در بانک داخلی محفوظ است. ذخیره توضیحات گزارش را دوباره امتحان کنید.",
          "error",
        );
      }
    }
    pendingFullBackup = null;
    await switchPeriod(mapping.get(source.activeWorkspace));
    const pendingGrades = (source.gradeDrafts || []).reduce(
      (n, row) => n + row.entries.length,
      0,
    );
    setStatus(
      periods.length +
        " دوره بازیابی شد." +
        (pendingGrades
          ? " " +
            pendingGrades +
            " پیش‌نویس نمره از بخش پیش‌نویس نشست‌های دیگر نیازمند بررسی است."
          : "") +
        (reportNotesFailed
          ? " نسخه توضیحات در بانک داخلی محفوظ است؛ ذخیره معمول آن‌ها نیاز به تلاش مجدد دارد."
          : ""),
      reportNotesFailed ? "error" : "saved",
    );
    return periods.length;
  } finally {
    fullRestoreBusy = false;
    if (button?.isConnected) setControlLock(button, "button-operation", false);
  }
}
