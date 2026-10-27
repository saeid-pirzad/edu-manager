// A device-only handle: drafts is structured-clone storage, excluded from JSON backups.
const singleFileKey = "EduManager.singleFile";
let singleFile = null,
  singleFileTimer = null,
  singleFileDebounce = null,
  singleFileWriting = null,
  singleFileFailure = false,
  singleFileMessage = "ذخیره خودکار در فایل هنوز فعال نیست.";

function singleFileStatus(message) {
  singleFileMessage = message;
  const element = document.getElementById("singleFileStatus");
  if (element) element.textContent = message;
  const badge = document.getElementById("singleFileBadge");
  if (badge) {
    badge.textContent = message;
    const panel = document.querySelector("#app .workspace-bar");
    const destination = singleFileFailure
      ? panel
      : document.querySelector("#app .workspace-tool-actions");
    if (destination && badge.parentElement !== destination)
      destination.append(badge);
  }
}
function singleFilePanel() {
  if (!window.showSaveFilePicker)
    return (
      "<p>ذخیره خودکار در فایل در این محیط در دسترس نیست. برای فایل خودکار از مرورگر سازگار مانند Chrome استفاده کنید؛ پشتیبان دستی همچنان در دسترس است.</p>" +
      singleFileFallbackPanel(true)
    );
  return (
    '<section class="backup-automatic"><h3>ذخیره خودکار در یک فایل</h3><p>فایل را یک‌بار انتخاب کنید؛ برنامه هنگام باز بودن، همان فایل را به‌روز می‌کند.</p><p id="singleFileStatus" role="status">' +
    esc(singleFileMessage) +
    "</p>" +
    singleFileFallbackPanel(singleFileFailure) +
    '<div class="row"><button data-workspace-action="single-file-choose">انتخاب فایل و فعال‌سازی</button><button class="ghost" data-workspace-action="single-file-save">ذخیره اکنون / اجازه مجدد</button><button class="ghost" data-workspace-action="single-file-stop">توقف اتصال فایل</button></div><details class="backup-help"><summary>راهنما و محدودیت‌های ذخیره خودکار</summary><p>تغییرات ثبت‌شده پس از حدود ۲ ثانیه و سایر تغییرات هر ۳۰ ثانیه بررسی می‌شوند؛ زمان‌بندی در پس‌زمینه ممکن است به تأخیر بیفتد. قبل از خروج «ذخیره اکنون» را بزنید و تأیید را ببینید. با برنامه بسته یا دستگاه خاموش، نوشتن انجام نمی‌شود.</p><p>فایل را می‌توانید کنار پروژه یا در پوشه دلخواه انتخاب کنید. ساخت فایل یا بازشدن پنجره انتخاب، تأیید ذخیره نیست؛ فعال‌سازی فقط بعد از اولین نوشتن موفق انجام می‌شود. بازیابی با گزینه «بازیابی از فایل» است؛ ویرایش دستی فایل خودکار وارد برنامه نمی‌شود.</p></details></section>'
  );
}
function singleFileFallbackPanel(visible) {
  return (
    '<div id="singleFileFallback"' +
    (visible ? "" : " hidden") +
    '><p>ذخیره خودکار فایل فعال نیست. فایل خالی پشتیبان قابل بازیابی نیست. می‌توانید مجوز یا محل فایل را عوض کنید، از مرورگر دیگری مانند Chrome استفاده کنید، یا پشتیبان کامل را دستی دریافت کنید. دریافت دستی، ذخیره خودکار را فعال نمی‌کند.</p><button class="ghost" data-workspace-action="export-full">دریافت دستی پشتیبان کامل</button></div>'
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
  const tx = connection.transaction("drafts", "readwrite"),
    done = transactionDone(tx);
  const store = tx.objectStore("drafts");
  let changed = false;
  const request = store.get(singleFileKey);
  request.onsuccess = () => {
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
  };
  await done;
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
  if (
    singleFile !== target ||
    !ready ||
    periodLoading ||
    blocked ||
    resetBusy ||
    connectionRetired
  )
    return false;
  const stored = await readRecord("drafts", singleFileKey);
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
  singleFileStatus(message);
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
    } else
      singleFileStatus(
        "مجوز فایل نیاز به تأیید دارد؛ «ذخیره اکنون / اجازه مجدد» را بزنید.",
      );
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
      singleFileStatus("اجازه نوشتن داده نشد؛ فایل به‌روز نشده است.");
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
