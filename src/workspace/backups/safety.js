// One recovery route for the last destructive operation, not a version list.
// A safety file is historical data; it must never update the current-backup badge.
function safetyMetadata(row) {
  return {
    id: row.id,
    at: typeof row.at === "string" ? row.at : "",
    label:
      typeof row.label === "string" ? row.label.slice(0, 1000) : "عملیات قبلی",
  };
}
function newerSafety(a, b) {
  const time = (row) => Date.parse(row.at) || 0;
  return time(b) - time(a) || String(b.id).localeCompare(String(a.id));
}
function validatedSafetySnapshot(value) {
  if (value?.format !== "EduManager.FullBackup")
    throw Error(
      "نسخهٔ ایمنی آخرین عملیات پشتیبان کامل قابل بازیابی نیست؛ فایل خام نیازمند بررسی و ترمیم است. اطلاعات فعلی تغییر نکرده است.",
    );
  const snapshot = validateFullBackup.normalize(value);
  // Never recursively copy full safety snapshots into a downloaded/stored one.
  snapshot.stores.backups = snapshot.stores.backups.filter((row) => !row.full);
  return snapshot;
}
async function readLatestSafetyBackup() {
  const ensureCurrent = preserveAsyncTarget(),
    sourceConnection = connection,
    tx = sourceConnection.transaction("backups", "readonly"),
    done = transactionDone(tx);
  const scanned = new Promise((resolve, reject) => {
    let latest = null;
    const request = tx.objectStore("backups").openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      try {
        ensureCurrent();
        if (connection !== sourceConnection)
          throw Error(
            "اتصال اطلاعات تغییر کرده است؛ پشتیبان را دوباره باز کنید.",
          );
        const cursor = request.result;
        if (!cursor) return resolve(latest);
        const row = cursor.value;
        if (row?.full && isSafeRecordId(row.id)) {
          const metadata = safetyMetadata(row);
          if (!latest || newerSafety(metadata, latest) < 0) latest = metadata;
        }
        cursor.continue();
      } catch (error) {
        reject(error);
        try {
          tx.abort();
        } catch {}
      }
    };
  });
  const [metadata] = await Promise.all([scanned, done]);
  ensureCurrent();
  if (connection !== sourceConnection)
    throw Error("اتصال اطلاعات تغییر کرده است؛ پشتیبان را دوباره باز کنید.");
  return metadata;
}
async function putSafetySnapshot(
  value,
  label,
  { idPrefix = "before-operation-" } = {},
) {
  const ensureCurrent = preserveAsyncTarget(),
    sourceConnection = connection,
    sourceInstallation =
      typeof installationToken === "undefined" ? "" : installationToken,
    full = validatedSafetySnapshot(value),
    backup = {
      id: idPrefix + uid(),
      workspace: null,
      at: new Date().toISOString(),
      label,
      full,
    };
  ensureCurrent();
  const tx = sourceConnection.transaction(["records", "backups"], "readwrite"),
    done = transactionDone(tx),
    store = tx.objectStore("backups");
  let failure;
  const request = store.getAll(),
    epoch = tx
      .objectStore("records")
      .get(
        typeof RESET_RECORD_KEY === "undefined"
          ? "@installation-reset"
          : RESET_RECORD_KEY,
      );
  let remaining = 2;
  const save = () => {
    if (--remaining) return;
    try {
      ensureCurrent();
      if (connection !== sourceConnection)
        throw Error("اتصال اطلاعات تغییر کرده است؛ نسخهٔ ایمنی ثبت نشد.");
      if ((epoch.result?.value?.token || "") !== sourceInstallation) {
        const error = Error(
          "اطلاعات سیستم در پنجرهٔ دیگری جایگزین شده است؛ نسخهٔ ایمنی قدیمی ثبت نشد.",
        );
        error.code = "INSTALLATION_CHANGED";
        throw error;
      }
      const previous = request.result
        .filter((row) => row.full)
        .sort(newerSafety);
      for (const row of previous.slice(7)) store.delete(row.id);
      store.put(backup);
    } catch (error) {
      failure = error;
      try {
        tx.abort();
      } catch {}
    }
  };
  request.onsuccess = save;
  epoch.onsuccess = save;
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  return backup;
}
function safetyBackupPanel(metadata) {
  if (!metadata) return "";
  const date = new Date(metadata.at),
    label = Number.isFinite(date.getTime())
      ? date.toLocaleString("fa-IR")
      : "زمان نامشخص";
  return (
    '<details class="backup-help" id="lastSafetyBackup"><summary>نسخهٔ ایمنی آخرین عملیات</summary><p><strong>' +
    esc(metadata.label) +
    "</strong><br>" +
    esc(label) +
    '</p><p>این فایل وضعیت کامل پیش از عملیات بالاست، نه اطلاعات فعلی. برای بازگردانی، فایل را دریافت کنید و از «بازیابی از فایل» و تأیید جایگزینی استفاده کنید. نسخهٔ داخلی جای فایل مستقل شما را نمی‌گیرد.</p><button type="button" class="ghost" data-workspace-action="download-safety" data-key="' +
    esc(metadata.id) +
    '" data-safety-workspace="' +
    esc(workspace.id) +
    '">دریافت نسخهٔ ایمنی آخرین عملیات</button><p id="safetyBackupStatus" role="status"></p></details>'
  );
}
async function downloadLastSafetyBackup(button) {
  const ensureCurrent = preserveAsyncTarget(),
    sourceConnection = connection,
    id = button?.dataset?.key;
  const check = () => {
    ensureCurrent();
    if (
      connection !== sourceConnection ||
      button?.isConnected === false ||
      button?.dataset?.safetyWorkspace !== workspace.id ||
      !isSafeRecordId(id)
    )
      throw Error(
        "پنجرهٔ نسخهٔ ایمنی منقضی شده است؛ پشتیبان و بازیابی را دوباره باز کنید.",
      );
  };
  try {
    check();
    await writer.catch(() => {});
    check();
    const latest = await readLatestSafetyBackup();
    check();
    if (!latest || latest.id !== id)
      throw Error(
        "نسخهٔ ایمنی آخرین عملیات تغییر کرده است؛ پشتیبان و بازیابی را دوباره باز کنید. فایلی دریافت نشد.",
      );
    const saved = await readRecord("backups", id);
    check();
    if (!saved?.full || saved.id !== id)
      throw Error(
        "نسخهٔ ایمنی انتخاب‌شده دیگر موجود نیست؛ اطلاعات فعلی تغییر نکرده است.",
      );
    const snapshot = validatedSafetySnapshot(saved.full),
      current = await readLatestSafetyBackup();
    check();
    if (current?.id !== id)
      throw Error(
        "نسخهٔ ایمنی هنگام آماده‌سازی تغییر کرد؛ پشتیبان و بازیابی را دوباره باز کنید.",
      );
    downloadJSON(
      snapshot,
      "EduManager-safety-" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        ".json",
    );
    const message =
      "دانلود نسخهٔ ایمنی «" +
      latest.label +
      "» درخواست شد؛ این فایل وضعیت پیش از عملیات است، نه اطلاعات فعلی. فایل را بررسی کنید و برای بازگردانی از «بازیابی از فایل» استفاده کنید.";
    const statusElement = document.getElementById("safetyBackupStatus");
    if (statusElement) statusElement.textContent = message;
    setStatus(message, "saved");
    return true;
  } catch (error) {
    const statusElement = document.getElementById("safetyBackupStatus");
    if (statusElement)
      statusElement.textContent =
        "دریافت نسخهٔ ایمنی انجام نشد: " + error.message;
    throw error;
  }
}
