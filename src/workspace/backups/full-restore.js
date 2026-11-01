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
  pendingFullBackupSignature = "",
  fullRestoreBusy = false;
function previewFullBackup(value, { sourceName = "", legacy = false } = {}) {
  if (fullRestoreBusy)
    throw Error("بازیابی کامل در حال انجام است؛ تا پایان آن صبر کنید.");
  const periods = validateFullBackup(value);
  const roleKey = ({ period }) => {
    const base = String(period.term).split(" — بازیابی ")[0];
    const role =
      period.termKind ||
      { اول: "first", دوم: "second", تابستان: "summer" }[base] ||
      base;
    return JSON.stringify([period.year, role]);
  };
  const duplicateTerms = new Set(periods.map(roleKey)).size !== periods.length;
  const date = new Date(value.exportedAt || "");
  const exportedAt = Number.isFinite(date.getTime())
    ? date.toLocaleString("fa-IR")
    : "در فایل ثبت نشده";
  const opened = showModal(
    "بازیابی کل اطلاعات سیستم",
    '<div class="full-restore"><section class="full-restore-file" aria-label="مشخصات پشتیبان"><h4>پشتیبان کامل سیستم</h4><dl><div><dt>زمان تهیه</dt><dd>' +
      esc(exportedAt) +
      "</dd></div><div><dt>اطلاعات موجود</dt><dd>" +
      periods.length.toLocaleString("fa-IR") +
      " نوبت، همراه نمرات، جلسات و کارنامه‌ها</dd></div>" +
      (sourceName
        ? "<div><dt>فایل انتخاب‌شده</dt><dd><bdi>" +
          esc(sourceName) +
          "</bdi></dd></div>"
        : "") +
      '</dl><div class="full-restore-periods"><strong>نوبت‌های موجود در خود فایل</strong><ul>' +
      periods
        .map(
          ({ period }) =>
            "<li><bdi>" +
            esc(period.year + " / " + period.term) +
            "</bdi></li>",
        )
        .join("") +
      "</ul></div></section>" +
      (legacy
        ? '<p class="full-restore-safety">این فایل با قالب قدیمی ذخیره شده و فقط اطلاعات نوبت درج‌شده در بالا را دارد. پس از تأیید، تمام سال‌ها و نوبت‌های فعلی حذف می‌شوند و فقط محتوای همین فایل باقی می‌ماند.</p>'
        : "") +
      (duplicateTerms
        ? '<p class="full-restore-warning" role="status">خود فایل چند ورودی با یک سال و نوبت مشابه دارد. بازیابی، همین ورودی‌های داخل فایل را نگه می‌دارد؛ برنامه آن‌ها را ادغام یا حذف نمی‌کند.</p>'
        : "") +
      '<section class="full-restore-warning"><h4>اطلاعات فعلی جایگزین می‌شود</h4><p>کل اطلاعات سیستم به وضعیت این فایل برمی‌گردد؛ اطلاعات فایل با داده‌های فعلی ادغام نمی‌شود.</p><p>نوبت جدید یا تکراری ساخته نمی‌شود و وضعیت باز یا بستهٔ نوبت‌ها مطابق فایل خواهد بود.</p></section><p class="full-restore-safety">پیش از جایگزینی، یک نسخهٔ ایمنی از اطلاعات فعلی داخل برنامه ذخیره می‌شود.</p><label class="full-restore-confirm" for="fullRestoreConfirmed"><input type="checkbox" id="fullRestoreConfirmed"><span>می‌دانم کل اطلاعات فعلی با محتوای این فایل جایگزین می‌شود.</span></label><p id="operationError" role="alert"></p><div class="full-restore-actions"><button type="button" class="danger" data-full-restore data-workspace-action="restore-full">تأیید و بازیابی کل اطلاعات</button><button type="button" class="ghost" data-workspace-action="close">انصراف</button></div></div>',
  );
  if (opened !== false) {
    pendingFullBackup = value;
    pendingFullBackupSignature = JSON.stringify(value);
  }
}
function restoreCatalogSignature(rows) {
  return JSON.stringify(
    rows
      .map((row) => [row.id, row.revision, row.year, row.term, row.closed])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}
async function snapshotBeforeSystemRestore() {
  if (ready) return snapshotInstallation();
  // Recovery must also work when damaged records prevented normal startup.
  const names = [...backupStores, "drafts"];
  const tx = connection.transaction(names, "readonly"),
    done = transactionDone(tx);
  const values = await Promise.all(
    names.map((name) => requestPromise(tx.objectStore(name).getAll())),
  );
  await done;
  return {
    format: "EduManager.RawRecovery",
    exportedAt: new Date().toISOString(),
    stores: Object.fromEntries(
      names.map((name, index) => [name, values[index]]),
    ),
  };
}
async function restoreFullBackup() {
  if (fullRestoreBusy) throw Error("بازیابی کامل در حال انجام است؛ صبر کنید.");
  if (!pendingFullBackup)
    throw Error("ابتدا فایل پشتیبان کامل را انتخاب کنید.");
  if (!document.getElementById("fullRestoreConfirmed")?.checked)
    throw Error("ابتدا جایگزینی کل اطلاعات با فایل انتخاب‌شده را تأیید کنید.");
  if (fileMode)
    throw Error("بازیابی را در نسخه نصب‌شده یا نشانی HTTPS انجام دهید.");
  if (ready) assertWorkspaceReadable();
  else if (!connection || connectionRetired || resetBusy)
    throw Error("برای اتصال امن به بانک، صفحه را دوباره بارگذاری کنید.");
  const source = pendingFullBackup,
    origin = captureWorkspaceContext();
  if (
    !confirm(
      "کل اطلاعات سیستم به وضعیت این فایل برگردد؟ نوبت جدید ساخته نمی‌شود.",
    )
  )
    return false;
  fullRestoreBusy = true;
  const hadFileTimer = !!singleFileTimer;
  pauseSingleFile();
  let committedRestore = false,
    ownsLoading = false;
  const check = () => {
    if (
      resetBusy ||
      connectionRetired ||
      (workspace?.id || "") !== origin.id ||
      pendingFullBackup !== source ||
      JSON.stringify(source) !== pendingFullBackupSignature
    )
      throw Error(
        "بانک، نوبت یا فایل انتخاب‌شده تغییر کرده است؛ پیش‌نمایش را دوباره باز کنید.",
      );
  };
  try {
    if (singleFileWriting) await singleFileWriting;
    const periods = validateFullBackup(source);
    const safety = await snapshotBeforeSystemRestore();
    await draftWriter.catch(() => {});
    check();
    if (periodLoading || busy)
      throw Error(
        "ثبت یا جابه‌جایی اطلاعات در حال انجام است؛ دوباره تلاش کنید.",
      );
    periodLoading = true;
    ownsLoading = true;
    lockControls();
    const rows = Object.fromEntries(
      [...backupStores, "drafts"].map((name) => [name, []]),
    );
    const previous = new Map(safety.stores.catalog.map((row) => [row.id, row]));
    for (const { period, data } of periods) {
      const liveRevision = previous.get(period.id)?.revision;
      const revision =
        Math.max(
          period.revision,
          Number.isSafeInteger(liveRevision) ? liveRevision : 0,
        ) + 1;
      if (!Number.isSafeInteger(revision))
        throw Error("شماره نسخه اطلاعات قابل بازیابی نیست.");
      const notes = {
        ...validateReportNotes(period.reportNotesRecovery, period.id),
        ...validateReportNotes(source.reportDrafts?.[period.id], period.id),
      };
      const restored = { ...period, revision, reportNotesRecovery: notes };
      delete restored.reportSource;
      rows.catalog.push(restored);
      for (const [logical, value] of collectRecords(data))
        rows.records.push({
          key: period.id + "|" + logical,
          workspace: period.id,
          logical,
          value,
        });
    }
    for (const name of ["events", "undo", "reports", "backups"])
      rows[name] = source.stores[name]
        .filter((row) => name !== "backups" || !row.full)
        .map((row) => clone(row));
    // Undo entries from the saved state remain tied to their restored revision.
    for (const undo of rows.undo) {
      const restored = rows.catalog.find((row) => row.id === undo.id);
      const saved = source.stores.catalog.find((row) => row.id === undo.id);
      if (
        restored &&
        undo.revision != null &&
        undo.revision === saved?.revision
      )
        undo.revision = restored.revision;
    }
    rows.drafts = (source.gradeDrafts || []).map((row) => ({
      ...clone(row),
      owner: "imported",
      entries: row.entries.map((item) => ({
        ...clone(item),
        review: true,
        error: "بازیابی از فایل؛ نیازمند بررسی",
      })),
    }));
    rows.backups.push({
      id: "before-full-restore-" + uid(),
      workspace: null,
      at: new Date().toISOString(),
      label: "پیش از بازیابی کل سیستم",
      full: safety,
    });
    const marker = {
      key: RESET_RECORD_KEY,
      workspace: null,
      logical: "installation-reset",
      value: { token: uid(), phase: "cleanup", at: new Date().toISOString() },
    };
    rows.records.push(marker);
    const names = [...backupStores, "drafts"];
    const tx = connection.transaction(names, "readwrite"),
      done = transactionDone(tx);
    let failure;
    const abort = (error) => {
      failure = error;
      try {
        tx.abort();
      } catch {}
    };
    try {
      const request = tx.objectStore("catalog").getAll();
      request.onsuccess = () => {
        try {
          check();
          if (
            restoreCatalogSignature(request.result) !==
            restoreCatalogSignature(safety.stores.catalog)
          )
            throw Error(
              "اطلاعات سیستم در پنجره دیگری تغییر کرده است؛ پیش از بازیابی دوباره بررسی کنید.",
            );
          for (const name of names) tx.objectStore(name).clear();
          for (const name of names)
            for (const row of rows[name]) tx.objectStore(name).add(row);
          // Device file handles are not backup data; keep this device's connection.
          if (singleFile)
            tx.objectStore("drafts").put({ key: singleFileKey, ...singleFile });
        } catch (error) {
          abort(error);
        }
      };
    } catch (error) {
      abort(error);
    }
    try {
      await done;
    } catch (error) {
      throw failure || error;
    }
    committedRestore = true;
    installationToken = marker.value.token;
    broadcast({ type: "installation-restored" });
    await completeResetCleanup(connection, marker);
    window.EduPeriodicReports?.resetDrafts();
    const annual = globalThis.EduAnnualModules
      ? await synchronizeAnnualForRead(source.activeWorkspace)
      : null;
    const loaded = await readWorkspaceSnapshot(source.activeWorkspace);
    workspace = loaded.period;
    db = loaded.data;
    committed = loaded.records;
    // All previous writes were drained before replacement. A restored
    // installation starts a new write generation, including after a failed
    // operation in the overwritten installation.
    writeFailureGeneration++;
    writer = Promise.resolve();
    drafts.clear();
    draftGeneration++;
    draftRecoveryFailed = false;
    blocked = false;
    ready = true;
    storageBlocked = false;
    isAuthenticated = false;
    state = {
      view: "schools",
      schoolId: null,
      classId: null,
      lessonId: null,
      tab: "students",
      reportTab: "comprehensive",
    };
    rememberPeriod(workspace.id);
    await loadDrafts();
    pendingFullBackup = null;
    pendingFullBackupSignature = "";
    periodLoading = false;
    ownsLoading = false;
    let notesSaved = true;
    for (const period of rows.catalog)
      if (!hydrateReportNotes(period)) notesSaved = false;
    closeModal();
    render();
    setStatus(
      "کل اطلاعات فایل بازیابی شد؛ هیچ نوبت تکراری ساخته نشد. پشتیبان وضعیت قبلی در برنامه محفوظ است." +
        (notesSaved
          ? ""
          : " توضیحات گزارش در بانک محفوظ‌اند؛ ذخیره موقت آن‌ها نیازمند تلاش مجدد است."),
      notesSaved ? "saved" : "pending",
    );
    for (const change of annual?.changed || [])
      broadcast({ ...change, annualModular: true });
    if (annual?.conflicts.length)
      setStatus(
        "بازیابی انجام شد؛ اختلاف اطلاعات قدیمی حفظ شد: " +
          annual.conflicts[0].message,
        "error",
      );
    return periods.length;
  } catch (error) {
    if (committedRestore) {
      blocked = true;
      ready = false;
      resetScreen(
        "اطلاعات فایل بازیابی شده است؛ تکمیل بازخوانی نیاز به بارگذاری مجدد دارد. " +
          error.message,
      );
    }
    throw error;
  } finally {
    if (ownsLoading) periodLoading = false;
    fullRestoreBusy = false;
    if (hadFileTimer && singleFile && ready && !blocked && !connectionRetired)
      startSingleFile();
    lockControls();
  }
}
