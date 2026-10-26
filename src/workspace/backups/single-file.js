// A device-only handle: drafts is structured-clone storage, excluded from JSON backups.
const singleFileKey = "EduManager.singleFile";
let singleFile = null,
  singleFileTimer = null,
  singleFileDebounce = null,
  singleFileWriting = null,
  singleFileMessage = "ذخیره خودکار در فایل هنوز فعال نیست.";

function singleFileStatus(message) {
  singleFileMessage = message;
  const element = document.getElementById("singleFileStatus");
  if (element) element.textContent = message;
  const badge = document.getElementById("singleFileBadge");
  if (badge) badge.textContent = message;
}
function singleFilePanel() {
  if (!window.showSaveFilePicker)
    return "<p>ذخیره خودکار در فایل در این مرورگر پشتیبانی نمی‌شود؛ از Chrome یا Edge دسکتاپ استفاده کنید. دریافت دستی پشتیبان همچنان ممکن است.</p>";
  return (
    '<section><h3>یک فایل JSON ثابت</h3><p>همه دوره‌ها و داده‌ها در همان فایل به‌روز می‌شوند؛ فایل جدید ساخته نمی‌شود. هنگام باز بودن برنامه، تغییرات ثبت‌شده پس از حدود ۲ ثانیه و سایر تغییرات حداکثر هر ۳۰ ثانیه بررسی می‌شوند. پیش از بستن برنامه «ذخیره اکنون» را بزنید و تأیید را ببینید.</p><p id="singleFileStatus" role="status">' +
    esc(singleFileMessage) +
    '</p><div class="row"><button data-workspace-action="single-file-choose">انتخاب فایل و فعال‌سازی</button><button class="ghost" data-workspace-action="single-file-save">ذخیره اکنون / اجازه مجدد</button><button class="ghost" data-workspace-action="single-file-stop">توقف اتصال فایل</button></div><p>فایل را می‌توانید کنار پروژه یا در پوشه دلخواه خود انتخاب کنید. بازیابی با گزینه «بازیابی از فایل» است؛ ویرایش دستی فایل خودکار وارد برنامه نمی‌شود.</p></section>'
  );
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
    !blocked &&
    !resetBusy &&
    !connectionRetired
  );
}
function failSingleFile(error) {
  pauseSingleFile();
  const message =
    "فایل خودکار به‌روز نشد: " + (error?.message || String(error));
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
    if (
      (await singleFile.handle.queryPermission({ mode: "readwrite" })) ===
      "granted"
    ) {
      startSingleFile();
      singleFileStatus("اتصال فایل فعال: " + singleFile.handle.name);
      scheduleSingleFile();
    } else
      singleFileStatus(
        "مجوز فایل نیاز به تأیید دارد؛ «ذخیره اکنون / اجازه مجدد» را بزنید.",
      );
  } catch (error) {
    pauseSingleFile();
    singleFileStatus(
      "اتصال فایل بازیابی نشد؛ دوباره فایل را انتخاب کنید. " + error.message,
    );
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
    throw error;
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
    startSingleFile();
    await syncSingleFile();
  } catch (error) {
    pauseSingleFile();
    singleFileStatus("اتصال فایل ذخیره نشد: " + error.message);
    throw error;
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
      singleFileStatus("اجازه نوشتن داده نشد؛ فایل به‌روز نشده است.");
      return false;
    }
    if (!(await singleFileCurrent(target))) return false;
    // An explicit save queues a fresh snapshot after any older write finishes.
    if (singleFileWriting && !(await singleFileWriting)) return false;
    if (!(await singleFileCurrent(target))) return false;
    startSingleFile();
    return await syncSingleFile();
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
  if (!singleFile || !ready || blocked || resetBusy || connectionRetired)
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
      target.modified = saved.lastModified;
      target.size = saved.size;
      target.savedAt = snapshot.exportedAt;
      if (!(await persistSingleFile({ target }))) return false;
      singleFileStatus(
        "ذخیره شد: " +
          target.handle.name +
          " — " +
          new Date(target.savedAt).toLocaleString("fa-IR"),
      );
      return true;
    } catch (error) {
      if (stream) await stream.abort().catch(() => {});
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
