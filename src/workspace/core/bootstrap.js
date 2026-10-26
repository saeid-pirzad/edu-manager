async function bootstrapV24() {
  document.getElementById("app").innerHTML =
    '<div class="card" role="status">در حال خواندن امن اطلاعات…</div>';
  try {
    await claimTab();
    connection = await openDatabase();
    connectionRetired = false;
    const resetMarker = await readRecord("records", RESET_RECORD_KEY);
    installationToken = resetMarker?.value?.token || "";
    if (!resetMarker)
      try {
        installationToken = localStorage.getItem(RESET_EPOCH_KEY) || "";
      } catch {}
    if (resetMarker?.value?.phase === "cleanup") {
      try {
        await completeResetCleanup(connection, resetMarker);
        await claimTab();
      } catch (error) {
        forgetInstallation();
        resetScreen(
          "حذف بانک انجام شده است؛ پاک‌سازی حافظه مرورگر هنوز کامل نشده است. برای ادامه، دوباره بارگذاری کنید. " +
            error.message,
        );
        return;
      }
    }
    let periods = await allFrom("catalog");
    if (!periods.length) {
      const raw = resetMarker ? null : localStorage.getItem(STORAGE_KEY);
      let data;
      if (raw) {
        const original = JSON.parse(raw);
        data = normalizeDB(original, { legacy: true });
        data.settings.academicTerm =
          original.settings?.academicTerm || "سوابق پیشین";
        await putBackup(original, "انتقال نسخه قبلی", null);
      } else data = v24DefaultDB();
      const initialId = resetMarker
        ? "reset-" + resetMarker.value.token
        : "initial";
      let created;
      try {
        created = await installWorkspace(data, {
          id: initialId,
          year: data.settings.academicYear,
          term: data.settings.academicTerm,
        });
      } catch (error) {
        created = await readRecord("catalog", initialId);
        if (!created) throw error;
      }
      periods = [created];
      const check = await readWorkspace(created.id);
      if (!check.data) throw Error("بازخوانی انتقال تأیید نشد.");
      if (raw) {
        localStorage.removeItem(STORAGE_KEY);
        storageSnapshot = null;
      }
    }
    const preferred = preferredPeriod();
    workspace =
      periods.find((x) => x.id === preferred) ||
      periods.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const loaded = await readWorkspace(workspace.id);
    db = loaded.data;
    committed = loaded.records;
    storageBlocked = false;
    storageProblem = "";

    try {
      rememberPeriod(workspace.id);
    } catch (ignore) {}
    setStatus("اطلاعات ذخیره‌شده خوانده شد.", "saved");
    hydrateReportNotes(workspace);
    await loadDrafts();
    ready = true;
    render();
    await recoverDrafts();
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    await ensureDailyBackup();
    startAutomaticBackups();
  } catch (error) {
    blocked = true;
    storageBlocked = true;
    storageProblem = error.message;
    document.getElementById("app").innerHTML =
      '<div class="card" role="alert"><h2>خواندن اطلاعات انجام نشد</h2><p>' +
      esc(error.message) +
      '</p><button data-workspace-action="raw-recovery">دریافت نسخه قبلی</button><button data-workspace-action="choose-import">بازیابی پشتیبان سالم</button></div>';
  }
}
