async function rawRecoveryV24() {
  let legacy = null;
  const notes = [];
  try {
    legacy = localStorage.getItem(STORAGE_KEY);
  } catch {
    notes.push("خواندن حافظهٔ نسخهٔ قدیمی در دسترس نبود.");
  }
  if (!connection) {
    if (legacy === null)
      throw Error(
        "بانک محلی در دسترس نیست؛ فایل پشتیبان مستقل را بازیابی کنید.",
      );
    downloadLocalFile(
      new Blob([legacy], { type: "application/json" }),
      "school-legacy-raw-recovery.json",
    );
    return;
  }
  const sourceConnection = connection,
    check = () => {
      if (connection !== sourceConnection || connectionRetired || resetBusy)
        throw Error(
          "اتصال بانک هنگام تهیهٔ نسخهٔ خام تغییر کرد؛ فایلی دریافت نشد.",
        );
    };
  check();
  const names = EduDataStoreSchema.stores.map((store) => store.name),
    tx = sourceConnection.transaction(names, "readonly"),
    done = transactionDone(tx),
    [values] = await Promise.all([
      Promise.all(
        names.map((name) => requestPromise(tx.objectStore(name).getAll())),
      ),
      done,
    ]);
  check();
  const stores = Object.fromEntries(
      names.map((name, index) => [name, values[index]]),
    ),
    pending = [stores],
    seen = new WeakSet();
  // File connections are device configuration, including those in old raw safety copies.
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current.drafts))
      current.drafts = current.drafts.filter(
        (row) => row?.key !== "EduManager.singleFile",
      );
    for (const row of Array.isArray(current.backups) ? current.backups : [])
      if (row?.full?.stores) pending.push(row.full.stores);
  }
  const localRecovery = {};
  try {
    for (const key of Object.keys(localStorage))
      if (
        key.startsWith("Edu24.drafts.") ||
        key.startsWith("EduManager.periodicDrafts.")
      )
        localRecovery[key] = localStorage.getItem(key);
  } catch {
    notes.push("خواندن همهٔ پیش‌نویس‌های حافظهٔ مرورگر کامل نشد.");
  }
  check();
  downloadJSON(
    {
      format: "EduManager.RawRecovery",
      version: 24,
      recoveryDump: true,
      exportedAt: new Date().toISOString(),
      catalog: stores.catalog,
      records: stores.records,
      stores,
      ...(legacy !== null ? { legacyRaw: legacy } : {}),
      localRecovery,
      recoveryNotes: notes,
    },
    "school-indexeddb-raw-recovery.json",
  );
  setStatus(
    "نسخهٔ خامِ همهٔ اطلاعات برای بررسی و ترمیم دریافت شد؛ این فایل پشتیبان معمولی قابل ورود مستقیم نیست.",
    "saved",
  );
}
