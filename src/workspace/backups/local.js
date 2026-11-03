function handleError(error) {
  setStatus(error.message || String(error), "error");
  const el = document.getElementById("operationError");
  if (el) el.textContent = status.message;
  else {
    const modal = document.getElementById("modal");
    const host =
      modal && !modal.classList.contains("hidden")
        ? modal.querySelector(".session-start-panel,.session-date-tools")
        : document.querySelector("#app .session-create");
    if (host && typeof showSessionFormError === "function")
      showSessionFormError(host, error);
    else alert(status.message);
  }
}

async function putBackup(data, label, workspaceId = workspace?.id) {
  const sourceConnection = connection,
    sourceInstallation =
      typeof installationToken === "undefined" ? "" : installationToken,
    backup = {
      id: uid(),
      workspace: workspaceId,
      at: new Date().toISOString(),
      label,
      db: clone(data),
    },
    tx = sourceConnection.transaction(
      ["records", "catalog", "backups"],
      "readwrite",
    ),
    done = transactionDone(tx),
    store = tx.objectStore("backups"),
    current = store.getAll(),
    epoch = tx
      .objectStore("records")
      .get(
        typeof RESET_RECORD_KEY === "undefined"
          ? "@installation-reset"
          : RESET_RECORD_KEY,
      ),
    owner =
      workspaceId == null ? null : tx.objectStore("catalog").get(workspaceId);
  let remaining = owner ? 3 : 2,
    failure;
  const save = () => {
    if (--remaining) return;
    try {
      if (
        (epoch.result?.value?.token || "") !== sourceInstallation ||
        connection !== sourceConnection ||
        connectionRetired ||
        resetBusy
      ) {
        const error = Error(
          "اطلاعات سیستم در پنجرهٔ دیگری جایگزین شده است؛ پشتیبان قدیمی ثبت نشد.",
        );
        error.code = "INSTALLATION_CHANGED";
        throw error;
      }
      if (owner && owner.result?.id !== workspaceId)
        throw Error("نوبت این پشتیبان دیگر موجود نیست؛ پشتیبان قدیمی ثبت نشد.");
      const all = current.result
        .filter(
          (row) =>
            row.id !== backup.id &&
            !row.full &&
            row.workspace === workspaceId &&
            !String(row.label ?? "").includes("انتقال"),
        )
        .sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
      store.put(backup);
      const retained = String(label ?? "").includes("انتقال") ? 8 : 7;
      for (const row of all.slice(retained)) store.delete(row.id);
    } catch (error) {
      failure = error;
      try {
        tx.abort();
      } catch {}
    }
  };
  current.onsuccess = save;
  epoch.onsuccess = save;
  if (owner) owner.onsuccess = save;
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  return backup;
}
const FULL_BACKUP_DELIVERY_KEY = "Edu24.fullBackupDelivery";
function recordFullBackupDelivery({ kind, exportedAt, name = "" }) {
  if (
    !["download-requested", "share-handed-off", "automatic-file"].includes(
      kind,
    ) ||
    !Number.isFinite(Date.parse(exportedAt))
  )
    return false;
  try {
    localStorage.setItem(
      FULL_BACKUP_DELIVERY_KEY,
      JSON.stringify({
        version: 1,
        scope: "installation",
        kind,
        exportedAt,
        deliveredAt: new Date().toISOString(),
        name,
      }),
    );
    if (typeof document !== "undefined") {
      const label = document.getElementById("lastExternalBackupStatus");
      if (label) label.textContent = lastExternalBackupLabel();
    }
    return true;
  } catch {
    // Delivery already happened; unavailable UI metadata must not fail it.
    return false;
  }
}
function lastExternalBackupLabel() {
  let item;
  try {
    item = JSON.parse(localStorage.getItem(FULL_BACKUP_DELIVERY_KEY) || "null");
  } catch (ignore) {}
  const labels = {
    "download-requested": "دانلود پشتیبان کامل درخواست شد؛ فایل را بررسی کنید",
    "share-handed-off":
      "پشتیبان کامل به اشتراک‌گذاری سپرده شد؛ ارسال نهایی را بررسی کنید",
    "automatic-file": "نوشتن پشتیبان کامل در فایل خودکار تأیید شد",
  };
  if (
    item?.version !== 1 ||
    item.scope !== "installation" ||
    !Object.hasOwn(labels, item.kind) ||
    !Number.isFinite(Date.parse(item.exportedAt))
  )
    return "هنوز دریافت یا ذخیرهٔ پشتیبان کامل ثبت نشده است";
  return (
    new Date(item.exportedAt).toLocaleString("fa-IR") +
    " · " +
    labels[item.kind]
  );
}

function downloadJSON(value, name, { compact = false } = {}) {
  downloadLocalFile(
    new Blob([JSON.stringify(value, null, compact ? 0 : 2)], {
      type: "application/json;charset=utf-8",
    }),
    name,
  );
}

// One transaction captures a consistent installation snapshot.
const backupStores = [
  "records",
  "catalog",
  "events",
  "backups",
  "undo",
  "reports",
];
