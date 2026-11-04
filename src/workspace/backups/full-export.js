// Portable drafts are never silently replaced by an older readable row.
function portableGradeDrafts(rows, periods, snapshotNotes = []) {
  const storedRows = [],
    ids = new Set(periods.map((period) => period.id));
  let keys;
  try {
    keys = Object.keys(localStorage);
  } catch (error) {
    snapshotNotes.push(
      "خواندن پیش‌نویس‌های محلی ممکن نشد؛ نسخه بانک و حافظه حفظ شد.",
    );
    keys = [];
  }
  for (const key of keys) {
    const match = /^Edu24\.drafts\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/.exec(
      key,
    );
    if (!match || !ids.has(match[1])) continue;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) storedRows.push({ key, value: JSON.parse(raw) });
    } catch (error) {
      throw Object.assign(
        Error(
          "یک پیش‌نویس نمره قابل خواندن نیست؛ پشتیبان کامل ساخته نشد. پیش‌نویس‌ها را بررسی کنید یا نسخه خام بگیرید.",
        ),
        { code: "BACKUP_DRAFT_UNREADABLE", cause: error },
      );
    }
  }
  return EduGradeDrafts.portableGradeDrafts(rows, periods, storedRows);
}
function currentBackupDrafts() {
  return {
    key: draftStorageKey(),
    workspace: workspace.id,
    owner: documentToken,
    generation: draftGeneration,
    entries: clone([...drafts.values()]),
    updatedAt: new Date().toISOString(),
  };
}
function backupReportDrafts(catalog) {
  const output = {};
  for (const period of catalog) {
    if (window.EduPeriodicReports?.getDrafts) {
      output[period.id] = window.EduPeriodicReports.getDrafts(
        period.id,
        period.reportNotesRecovery,
      );
    } else {
      const raw = localStorage.getItem(
        "EduManager.periodicDrafts." + period.id,
      );
      output[period.id] = raw === null ? {} : JSON.parse(raw);
    }
  }
  return output;
}
function backupExtraData(
  stores,
  snapshotNotes = [],
  currentDrafts = currentBackupDrafts(),
) {
  const assessmentDraft =
    typeof assessmentContext !== "undefined"
      ? assessmentContext.snapshot()
      : null;
  return {
    gradeDrafts: portableGradeDrafts(
      [
        ...stores.drafts,
        currentDrafts,
        ...(assessmentDraft ? [assessmentDraft] : []),
      ],
      stores.catalog,
      snapshotNotes,
    ),
    reportDrafts: backupReportDrafts(stores.catalog),
    deputyExportIdentity: EduDeputyExportIdentity.fromRows(stores.drafts),
  };
}
// Catalog revisions cover mutable records; the other portable stores have immutable IDs.
// Draft timestamps and the mirror's own handle metadata are deliberately not content changes.
function backupSourceSignature({
  catalog,
  keys,
  gradeDrafts,
  reportDrafts,
  deputyExportIdentity,
  activeWorkspace,
  installation,
}) {
  return JSON.stringify({
    installation,
    activeWorkspace,
    catalog,
    keys: Object.fromEntries(
      ["backups", "events", "reports", "undo"].map((name) => [
        name,
        [...keys[name]].sort(),
      ]),
    ),
    gradeDrafts: gradeDrafts
      .map(({ key, workspace, generation, entries }) => ({
        key,
        workspace,
        generation,
        entries,
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    reportDrafts,
    deputyExportIdentity: deputyExportIdentity || null,
  });
}
function scanPortableBackups(store) {
  return new Promise((resolve, reject) => {
    const rows = [],
      keys = [],
      request = store.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve({ rows, keys });
      keys.push(cursor.primaryKey);
      const row = cursor.value;
      if (!row.full) rows.push(row);
      cursor.continue();
    };
  });
}
async function readBackupSourceSignature() {
  const origin = workspace?.id,
    sourceConnection = connection,
    installation = installationToken;
  if (!ready || periodLoading || resetBusy || connectionRetired)
    throw Object.assign(Error("Backup source is changing"), {
      code: "BACKUP_CONTEXT_CHANGED",
    });
  const tx = sourceConnection.transaction(
      [...backupStores, "drafts"],
      "readonly",
    ),
    done = transactionDone(tx);
  const requests = [
    requestPromise(tx.objectStore("catalog").getAll()),
    requestPromise(tx.objectStore("drafts").getAll()),
    requestPromise(tx.objectStore("records").get(RESET_RECORD_KEY)),
    ...["backups", "events", "reports", "undo"].map((name) =>
      requestPromise(tx.objectStore(name).getAllKeys()),
    ),
  ];
  const [catalog, durableDrafts, marker, backups, events, reports, undo] =
    await Promise.all(requests);
  await done;
  if (
    workspace?.id !== origin ||
    connection !== sourceConnection ||
    installationToken !== installation ||
    periodLoading ||
    resetBusy ||
    connectionRetired
  )
    throw Object.assign(Error("Backup source changed"), {
      code: "BACKUP_CONTEXT_CHANGED",
    });
  if ((marker?.value?.token || "") !== installation)
    throw Object.assign(
      Error(
        "اطلاعات برنامه در پنجره دیگری جایگزین شده است؛ صفحه را بازخوانی کنید.",
      ),
      { code: "INSTALLATION_CHANGED" },
    );
  return backupSourceSignature({
    catalog,
    keys: { backups, events, reports, undo },
    ...backupExtraData({ catalog, drafts: durableDrafts }),
    activeWorkspace: origin,
    installation,
  });
}

async function snapshotInstallation({
  onDurableDrafts,
  onSourceSignature,
} = {}) {
  const origin = workspace?.id,
    sourceConnection = connection,
    sourceInstallation = installationToken;
  const check = () => {
    if (
      !ready ||
      periodLoading ||
      resetBusy ||
      connectionRetired ||
      workspace?.id !== origin ||
      connection !== sourceConnection ||
      installationToken !== sourceInstallation
    )
      throw Object.assign(
        Error(
          "بانک یا ترم هنگام تهیه پشتیبان آماده نیست؛ پس از پایان جابه‌جایی دوباره تلاش کنید.",
        ),
        {
          code:
            periodLoading || workspace?.id !== origin
              ? "BACKUP_CONTEXT_CHANGED"
              : "BACKUP_NOT_READY",
        },
      );
  };
  check();
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
  check();
  await storeDrafts().catch((error) =>
    snapshotNotes.push(
      "پیش‌نویس حافظه نیز در فایل قرار گرفت: " + error.message,
    ),
  );
  await draftWriter.catch(() => {});
  check();
  const activeWorkspace = workspace.id;
  const currentDrafts = currentBackupDrafts();
  const names = [...backupStores, "drafts"];
  const tx = connection.transaction(names, "readonly"),
    done = transactionDone(tx);
  const values = await Promise.all(
    names.map((name) =>
      name === "backups"
        ? scanPortableBackups(tx.objectStore(name))
        : requestPromise(tx.objectStore(name).getAll()),
    ),
  );
  await done;
  const backupRows = values[names.indexOf("backups")];
  const stores = Object.fromEntries(
    names.map((name, i) => [
      name,
      name === "backups" ? backupRows.rows : values[i],
    ]),
  );
  check();
  if (
    (stores.records.find((row) => row.key === RESET_RECORD_KEY)?.value?.token ||
      "") !== sourceInstallation
  )
    throw Error(
      "اطلاعات سیستم در پنجرهٔ دیگری جایگزین شده است؛ پشتیبان را دوباره تهیه کنید.",
    );
  // Restore compares the same durable draft rows inside its replacement lock.
  // The observer is internal metadata and is never serialized into a backup.
  onDurableDrafts?.(stores.drafts);
  // Never embed a full snapshot inside another full snapshot.
  stores.backups = stores.backups.filter((row) => !row.full);
  stores.records = stores.records.filter((row) => row.key !== RESET_RECORD_KEY);
  const { gradeDrafts, reportDrafts, deputyExportIdentity } = backupExtraData(
    stores,
    snapshotNotes,
    currentDrafts,
  );
  onSourceSignature?.(
    backupSourceSignature({
      catalog: stores.catalog,
      keys: {
        backups: backupRows.keys,
        ...Object.fromEntries(
          ["events", "reports", "undo"].map((name) => [
            name,
            stores[name].map((row) => row.id),
          ]),
        ),
      },
      gradeDrafts,
      reportDrafts,
      deputyExportIdentity,
      activeWorkspace,
      installation: sourceInstallation,
    }),
  );
  delete stores.drafts;
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
    ...(deputyExportIdentity ? { deputyExportIdentity } : {}),
  };
}
async function exportFullBackup() {
  const content = await snapshotInstallation();
  validateFullBackup(content);
  downloadJSON(content, "پشتیبان-کامل-" + todayISO() + ".json");
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
