function portableGradeDrafts(rows, periods) {
  const storedRows = [];
  try {
    for (const key of Object.keys(localStorage).filter((key) =>
      key.startsWith("Edu24.drafts."),
    )) {
      try {
        storedRows.push({ key, value: JSON.parse(localStorage.getItem(key)) });
      } catch {}
    }
  } catch {}
  return EduGradeDrafts.portableGradeDrafts(rows, periods, storedRows);
}

async function snapshotInstallation() {
  if (!ready || resetBusy || connectionRetired)
    throw Error("بانک برای تهیه پشتیبان آماده نیست.");
  const snapshotNotes = [];
  try {
    await flushDrafts();
  } catch (error) {
    snapshotNotes.push(
      "ثبت نمرات ناتمام نشد؛ داده پایدار و پیش‌نویس‌ها جداگانه حفظ شدند: " +
        error.message,
    );
  }
  await writer.catch(() => {});
  await storeDrafts().catch((error) =>
    snapshotNotes.push(
      "پیش‌نویس حافظه نیز در فایل قرار گرفت: " + error.message,
    ),
  );
  await draftWriter.catch(() => {});
  const activeWorkspace = workspace.id;
  const currentDrafts = {
    key: draftStorageKey(),
    workspace: activeWorkspace,
    owner: documentToken,
    generation: draftGeneration,
    entries: clone([...drafts.values()]),
    updatedAt: new Date().toISOString(),
  };
  const names = [...backupStores, "drafts"];
  const tx = connection.transaction(names, "readonly"),
    done = transactionDone(tx);
  const values = await Promise.all(
    names.map((name) => requestPromise(tx.objectStore(name).getAll())),
  );
  await done;
  const stores = Object.fromEntries(names.map((name, i) => [name, values[i]]));
  // Never embed a full snapshot inside another full snapshot.
  stores.backups = stores.backups.filter((row) => !row.full);
  stores.records = stores.records.filter((row) => row.key !== RESET_RECORD_KEY);
  const gradeDrafts = portableGradeDrafts(
    [...stores.drafts, currentDrafts],
    stores.catalog,
  );
  delete stores.drafts;
  const reportDrafts = {};
  for (const period of stores.catalog) {
    if (window.EduPeriodicReports?.getDrafts) {
      reportDrafts[period.id] = window.EduPeriodicReports.getDrafts(
        period.id,
        period.reportNotesRecovery,
      );
      continue;
    }
    try {
      reportDrafts[period.id] = JSON.parse(
        localStorage.getItem("EduManager.periodicDrafts." + period.id) || "{}",
      );
    } catch {
      reportDrafts[period.id] = {};
    }
  }
  return {
    format: "EduManager.FullBackup",
    version: 2,
    schemaVersion: 26,
    exportedAt: new Date().toISOString(),
    activeWorkspace,
    snapshotNotes,
    stores,
    reportDrafts,
    gradeDrafts,
  };
}
async function exportFullBackup() {
  const content = await snapshotInstallation();
  downloadJSON(content, "پشتیبان-کامل-" + todayISO() + ".json");
  setStatus(
    "دانلود پشتیبان همه دوره‌ها درخواست شد" +
      (content.gradeDrafts.length
        ? "؛ پیش‌نویس‌های ناتمام هم جداگانه در فایل حفظ شدند"
        : "") +
      "؛ فایل را بیرون برنامه بررسی کنید.",
    "saved",
  );
  return content.stores.catalog.length;
}
async function automaticFullBackup() {
  if (!ready || blocked || automaticBackupBusy || document.hidden) return;
  automaticBackupBusy = true;
  try {
    const snapshot = await snapshotInstallation();
    const tx = connection.transaction("backups", "readwrite"),
      done = transactionDone(tx);
    tx.objectStore("backups").put({
      id: "automatic-full",
      workspace: null,
      at: snapshot.exportedAt,
      label: "خودکار کامل — هر ۲۰ دقیقه",
      full: snapshot,
    });
    await done;
  } catch (error) {
    setStatus("پشتیبان خودکار کامل ساخته نشد؛ " + error.message, "error");
  } finally {
    automaticBackupBusy = false;
  }
}
function startAutomaticBackups() {
  if (!automaticBackupTimer)
    automaticBackupTimer = setInterval(automaticFullBackup, 20 * 60 * 1000);
}
