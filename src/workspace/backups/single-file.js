// A device-only handle: drafts is structured-clone storage, excluded from JSON backups.
const singleFileKey = "EduManager.singleFile";
let singleFile = null,
  singleFileTimer = null,
  singleFileDebounce = null,
  singleFileWriting = null,
  singleFileFailure = false,
  singleFilePermissionNeeded = false,
  singleFileMessage = "ذخیره خودکار در فایل هنوز فعال نیست.";

function singleFileNoticeHtml(message = singleFileMessage) {
  const canRequest =
    singleFilePermissionNeeded &&
    window.showSaveFilePicker &&
    typeof singleFile?.handle?.requestPermission === "function";
  return (
    '<span class="single-file-message" role="status">' +
    esc(message) +
    "</span>" +
    (canRequest
      ? '<button type="button" class="single-file-permission-action" data-workspace-action="single-file-save">اجازه مجدد</button>'
      : "")
  );
}
function singleFileStatus(message, { permission = false } = {}) {
  singleFileMessage = message;
  singleFilePermissionNeeded = permission;
  const element = document.getElementById("singleFileStatus");
  if (element) element.innerHTML = singleFileNoticeHtml();
  const badge = document.getElementById("singleFileBadge");
  if (badge) {
    badge.innerHTML = singleFileNoticeHtml();
    badge.hidden = !singleFileFailure;
    const panel = document.querySelector("#app .workspace-bar");
    const destination = panel;
    if (destination && badge.parentElement !== destination)
      destination.append(badge);
  }
}
function singleFilePanel() {
  if (!window.showSaveFilePicker)
    return (
      '<section class="backup-automatic"><h3>ذخیره خودکار در یک فایل</h3><p>فایل را یک‌بار انتخاب کنید؛ برنامه هنگام باز بودن، همان فایل را به‌روز می‌کند.</p><p id="singleFileStatus" role="status">ذخیره خودکار در فایل در این محیط در دسترس نیست. این برنامه را در Chrome یا Edge باز کنید؛ پشتیبان دستی همچنان در دسترس است.</p><div class="row"><button data-workspace-action="single-file-choose" disabled>انتخاب فایل و فعال‌سازی</button></div>' +
      singleFileFallbackPanel(true) +
      "</section>"
    );
  return (
    '<section class="backup-automatic"><h3>ذخیره خودکار در یک فایل</h3><p>فایل را یک‌بار انتخاب کنید؛ برنامه هنگام باز بودن، همان فایل را به‌روز می‌کند.</p><div id="singleFileStatus" class="single-file-notice">' +
    singleFileNoticeHtml() +
    "</div>" +
    singleFileFallbackPanel(singleFileFailure) +
    '<div class="row"><button data-workspace-action="single-file-choose">انتخاب فایل و فعال‌سازی</button><button class="ghost" data-workspace-action="single-file-save">ذخیره اکنون / اجازه مجدد</button><button class="ghost" data-workspace-action="single-file-stop">توقف اتصال فایل</button></div></section>'
  );
}
function singleFileFallbackPanel(visible) {
  return (
    '<div id="singleFileFallback"' +
    (visible ? "" : " hidden") +
    "><p>ذخیره خودکار فایل فعال نیست. فایل خالی پشتیبان قابل بازیابی نیست. می‌توانید مجوز یا محل فایل را عوض کنید، از مرورگر دیگری مانند Chrome استفاده کنید، یا از دکمهٔ دریافت پشتیبان کامل در بالای همین پنجره استفاده کنید. دریافت دستی، ذخیره خودکار را فعال نمی‌کند.</p></div>"
  );
}
function showSingleFileFallback(visible) {
  singleFileFailure = visible;
  const element = document.getElementById("singleFileFallback");
  if (element) element.hidden = !visible;
}
async function persistSingleFile({
  replace = false,
  target = singleFile,
} = {}) {
  if (!ready || resetBusy || connectionRetired) return false;
  const sourceConnection = connection,
    sourceInstallation =
      typeof installationToken === "undefined" ? "" : installationToken,
    tx = sourceConnection.transaction(["records", "drafts"], "readwrite"),
    done = transactionDone(tx),
    store = tx.objectStore("drafts"),
    request = store.get(singleFileKey),
    epoch = tx
      .objectStore("records")
      .get(
        typeof RESET_RECORD_KEY === "undefined"
          ? "@installation-reset"
          : RESET_RECORD_KEY,
      );
  let changed = false,
    remaining = 2,
    failure;
  const persist = () => {
    if (--remaining) return;
    try {
      if (
        (epoch.result?.value?.token || "") !== sourceInstallation ||
        connection !== sourceConnection ||
        connectionRetired ||
        resetBusy
      ) {
        const error = Error(
          "اطلاعات سیستم در پنجرهٔ دیگری جایگزین شده است؛ اتصال فایل قدیمی تغییر نکرد.",
        );
        error.code = "INSTALLATION_CHANGED";
        throw error;
      }
      // A stale tab must never recreate a disconnected/replaced configuration.
      if (
        !replace &&
        (!request.result ||
          (request.result.connectionId || "") !== (target?.connectionId || ""))
      )
        return;
      if (singleFile === target && target)
        store.put({ key: singleFileKey, ...target });
      else if (!singleFile) store.delete(singleFileKey);
      else return;
      changed = true;
    } catch (error) {
      failure = error;
      try {
        tx.abort();
      } catch {}
    }
  };
  request.onsuccess = persist;
  epoch.onsuccess = persist;
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  return changed;
}
function singleFileChanged(message) {
  if (message.type !== "single-file-changed") return false;
  if (singleFile && (singleFile.connectionId || "") !== message.connectionId) {
    pauseSingleFile();
    singleFile = null;
    singleFileStatus(
      "اتصال فایل در پنجره دیگری متوقف یا عوض شد؛ برای ادامه دوباره فایل را انتخاب کنید.",
    );
  }
  return true;
}
async function singleFileCurrent(target) {
  if (fullRestoreBusy) return false;
  if (
    singleFile !== target ||
    !ready ||
    periodLoading ||
    blocked ||
    resetBusy ||
    connectionRetired
  )
    return false;
  const expectedInstallation =
    typeof installationToken === "undefined" ? "" : installationToken;
  const stored = await readRecord("drafts", singleFileKey),
    marker = await readRecord(
      "records",
      typeof RESET_RECORD_KEY === "undefined"
        ? "@installation-reset"
        : RESET_RECORD_KEY,
    );
  if ((marker?.value?.token || "") !== expectedInstallation) {
    const error = Error(
      "اطلاعات سیستم در پنجرهٔ دیگری جایگزین شده است؛ فایل قدیمی نوشته نشد. صفحه را دوباره بارگذاری کنید.",
    );
    error.code = "INSTALLATION_CHANGED";
    throw error;
  }
  if (!stored || (stored.connectionId || "") !== (target.connectionId || "")) {
    if (singleFile === target) {
      pauseSingleFile();
      singleFile = null;
      singleFileStatus(
        "اتصال فایل در پنجره دیگری متوقف یا عوض شد؛ دوباره فایل را انتخاب کنید.",
      );
    }
    return false;
  }
  return (
    singleFile === target &&
    ready &&
    !periodLoading &&
    !blocked &&
    !resetBusy &&
    !connectionRetired
  );
}
function failSingleFile(error) {
  pauseSingleFile();
  showSingleFileFallback(true);
  const denied =
    error?.name === "NotAllowedError" || error?.name === "SecurityError";
  const message =
    (denied
      ? "ذخیره خودکار متوقف است؛ مرورگر یا سیستم اجازه نوشتن فایل را نداد. از اجازه مجدد، انتخاب محل دیگر یا پشتیبان دستی استفاده کنید. جزئیات: "
      : "فایل خودکار به‌روز نشد: ") + (error?.message || String(error));
  singleFileStatus(message, { permission: denied });
  setStatus(message, "error");
  return false;
}
function pauseSingleFile() {
  clearInterval(singleFileTimer);
  clearTimeout(singleFileDebounce);
  singleFileTimer = singleFileDebounce = null;
}
function startSingleFile() {
  pauseSingleFile();
  singleFileTimer = setInterval(() => void syncSingleFile(), 30000);
}
function scheduleSingleFile() {
  // Snapshotting may itself flush drafts: never recursively schedule that flush.
  if (!singleFileTimer || singleFileWriting) return;
  clearTimeout(singleFileDebounce);
  singleFileDebounce = setTimeout(() => void syncSingleFile(), 2000);
}
async function restoreSingleFile() {
  try {
    singleFile = (await readRecord("drafts", singleFileKey)) || null;
    if (!singleFile) return;
    if (!singleFile.savedAt) {
      pauseSingleFile();
      showSingleFileFallback(true);
      singleFileStatus(
        "اولین ذخیره فایل تأیید نشده؛ ذخیره خودکار فعال نیست. «ذخیره اکنون / اجازه مجدد» را بزنید یا پشتیبان دستی بگیرید.",
      );
      return;
    }
    if (
      (await singleFile.handle.queryPermission({ mode: "readwrite" })) ===
      "granted"
    ) {
      if (await syncSingleFile()) startSingleFile();
    } else {
      pauseSingleFile();
      showSingleFileFallback(true);
      singleFileStatus("مجوز فایل نیاز به تأیید دارد.", { permission: true });
    }
  } catch (error) {
    failSingleFile(error);
  }
}
async function chooseSingleFile() {
  if (!ready || blocked || resetBusy || connectionRetired)
    throw Error("بانک آماده ذخیره فایل نیست.");
  let handle;
  try {
    // The picker must run directly in the click gesture, before snapshot awaits.
    handle = await window.showSaveFilePicker({
      suggestedName: "EduManager-data.json",
      excludeAcceptAllOption: true,
      types: [
        {
          description: "EduManager JSON",
          accept: { "application/json": [".json"] },
        },
      ],
    });
  } catch (error) {
    if (error.name === "AbortError") return;
    return failSingleFile(error);
  }
  if (!/\.json$/i.test(handle.name)) throw Error("فقط فایل JSON انتخاب کنید.");
  const file = await handle.getFile();
  if (
    file.size &&
    !confirm(
      "محتوای فایل انتخابی با همه اطلاعات فعلی برنامه جایگزین شود؟ برای بازیابی، انصراف دهید و «بازیابی از فایل» را بزنید.",
    )
  )
    return;
  pauseSingleFile();
  if (singleFileWriting) await singleFileWriting;
  if (!ready || resetBusy || connectionRetired) return;
  singleFile = {
    connectionId: uid(),
    handle,
    modified: file.lastModified,
    size: file.size,
    savedAt: "",
  };
  try {
    await persistSingleFile({ replace: true });
    broadcast({
      type: "single-file-changed",
      connectionId: singleFile.connectionId,
    });
    const saved = await syncSingleFile();
    if (saved) startSingleFile();
    return saved;
  } catch (error) {
    return failSingleFile(error);
  }
}
async function resumeSingleFile() {
  if (!singleFile) throw Error("ابتدا فایل JSON را انتخاب کنید.");
  const target = singleFile;
  try {
    // Permission request also needs the explicit click, not an automatic timer.
    if (
      (await target.handle.requestPermission({ mode: "readwrite" })) !==
      "granted"
    ) {
      pauseSingleFile();
      showSingleFileFallback(true);
      singleFileStatus("اجازه نوشتن داده نشد؛ فایل به‌روز نشده است.", {
        permission: true,
      });
      return false;
    }
    if (!(await singleFileCurrent(target))) return false;
    // An explicit save queues a fresh snapshot after any older write finishes.
    if (singleFileWriting && !(await singleFileWriting)) return false;
    if (!(await singleFileCurrent(target))) return false;
    pauseSingleFile();
    const saved = await syncSingleFile();
    if (saved) startSingleFile();
    return saved;
  } catch (error) {
    return failSingleFile(error);
  }
}
async function disableSingleFile() {
  const target = singleFile;
  pauseSingleFile();
  singleFile = null;
  try {
    if (await persistSingleFile({ target }))
      broadcast({ type: "single-file-changed", connectionId: null });
    if (singleFileWriting) await singleFileWriting;
    showSingleFileFallback(false);
    singleFileStatus("اتصال متوقف شد؛ فایل موجود حذف نشده است.");
  } catch (error) {
    singleFile = target;
    return failSingleFile(error);
  }
}
function syncSingleFile() {
  if (singleFileWriting) return singleFileWriting;
  if (
    !singleFile ||
    !ready ||
    periodLoading ||
    blocked ||
    resetBusy ||
    connectionRetired
  )
    return Promise.resolve(false);
  const target = singleFile;
  singleFileStatus("در حال ذخیره فایل: " + target.handle.name);
  const write = async () => {
    let stream;
    try {
      if (!(await singleFileCurrent(target))) return false;
      const snapshot = await snapshotInstallation();
      validateFullBackup(snapshot);
      const json = JSON.stringify(snapshot, null, 2);
      if (
        !ready ||
        blocked ||
        resetBusy ||
        connectionRetired ||
        singleFile !== target
      )
        return false;
      const file = await target.handle.getFile();
      if (file.lastModified !== target.modified || file.size !== target.size)
        throw Error(
          "فایل بیرون از این اتصال تغییر کرده؛ برای جلوگیری از بازنویسی، دوباره آن را انتخاب کنید.",
        );
      if (!(await singleFileCurrent(target))) return false;
      stream = await target.handle.createWritable();
      await stream.write(json);
      if (!(await singleFileCurrent(target))) {
        await stream.abort();
        return false;
      }
      await stream.close();
      stream = null;
      const saved = await target.handle.getFile();
      if (!saved.size)
        throw Error(
          "فایل پس از نوشتن خالی است؛ ذخیره تأیید نشد. پشتیبان دستی بگیرید.",
        );
      target.modified = saved.lastModified;
      target.size = saved.size;
      target.savedAt = snapshot.exportedAt;
      if (!(await persistSingleFile({ target }))) return false;
      recordFullBackupDelivery({
        kind: "automatic-file",
        exportedAt: snapshot.exportedAt,
        name: target.handle.name,
      });
      showSingleFileFallback(false);
      singleFileStatus(
        "ذخیره شد: " +
          target.handle.name +
          " — " +
          new Date(target.savedAt).toLocaleString("fa-IR"),
      );
      return true;
    } catch (error) {
      if (stream) await stream.abort().catch(() => {});
      if (error.code === "BACKUP_CONTEXT_CHANGED") {
        singleFileStatus(
          "ذخیره فایل پس از پایان جابه‌جایی دوباره بررسی می‌شود.",
        );
        return false;
      }
      return failSingleFile(error);
    }
  };
  // Serialize tabs on this origin; timestamp checks reject stale/external writers.
  singleFileWriting = Promise.resolve()
    .then(() =>
      navigator.locks
        ? navigator.locks.request("EduManager.singleFile", write)
        : write(),
    )
    .catch(failSingleFile)
    .finally(() => {
      singleFileWriting = null;
    });
  return singleFileWriting;
}
