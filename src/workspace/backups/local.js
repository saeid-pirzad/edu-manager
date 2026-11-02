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
  const backup = {
    id: uid(),
    workspace: workspaceId,
    at: new Date().toISOString(),
    label,
    db: clone(data),
  };
  const tx = connection.transaction("backups", "readwrite"),
    done = transactionDone(tx);
  tx.objectStore("backups").put(backup);
  await done;
  const all = (await allFrom("backups"))
    .filter((x) => x.workspace === workspaceId && !x.label.includes("انتقال"))
    .sort((a, b) => b.at.localeCompare(a.at));
  if (all.length > 8) {
    const cleanup = connection.transaction("backups", "readwrite"),
      finished = transactionDone(cleanup);
    all.slice(8).forEach((x) => cleanup.objectStore("backups").delete(x.id));
    await finished;
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
