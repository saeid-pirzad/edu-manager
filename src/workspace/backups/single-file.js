// A device-only handle: drafts is structured-clone storage, excluded from JSON backups.
const singleFileKey = "EduManager.singleFile";
const SINGLE_FILE_POLL_MS = 30000,
  SINGLE_FILE_DEBOUNCE_MS = 2000;
let singleFileSavedSource = null,
  singleFileReschedule = false,
  singleFileChoosing = false;
let singleFile = null,
  singleFileTimer = null,
  singleFileDebounce = null,
  singleFileWriting = null,
  singleFileFailure = false,
  singleFilePermissionNeeded = false,
  singleFileNoticeSaved = false,
  singleFileMessage = "ذخیره خودکار در فایل هنوز فعال نیست.";

function singleFileBannerHtml() {
  const name = singleFile?.handle?.name,
    date = singleFile?.savedAt ? new Date(singleFile.savedAt) : null,
    saved = date && Number.isFinite(date.getTime()),
    needsReview =
      singleFileFailure ||
      singleFilePermissionNeeded ||
      !!singleFile?.suspension;
  if (!name)
    return '<span class="schools-file-meta">فایل پشتیبان انتخاب نشده</span>';
  return (
    '<bdi class="schools-file-name" dir="auto" title="' +
    esc(name) +
    '">' +
    esc(name) +
    '</bdi><span class="schools-file-meta">' +
    (saved
      ? 'آخرین ذخیره: <time datetime="' +
        esc(date.toISOString()) +
        '">' +
        esc(
          date.toLocaleString("fa-IR-u-ca-persian", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
        ) +
        "</time>"
      : "هنوز ذخیره نشده") +
    (needsReview ? " · نیاز به بررسی" : "") +
    "</span>"
  );
}
function paintSingleFileBanner() {
  const element = document.getElementById("welcomeFileSummary");
  if (!element) return;
  const html = singleFileBannerHtml();
  if (element.innerHTML !== html) element.innerHTML = html;
}
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
function singleFileStatus(message, { permission = false, saved = false } = {}) {
  singleFileMessage = message;
  singleFilePermissionNeeded = permission;
  singleFileNoticeSaved = saved;
  paintSingleFileBanner();
  const element = document.getElementById("singleFileStatus");
  if (element) {
    element.innerHTML = singleFileNoticeHtml();
    element.hidden = saved;
  }
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
    '<section class="backup-automatic"><h3>ذخیره خودکار در یک فایل</h3><p>فایل را یک‌بار انتخاب کنید؛ برنامه هنگام باز بودن، همان فایل را به‌روز می‌کند.</p><div id="singleFileStatus" class="single-file-notice"' +
    (singleFileNoticeSaved ? " hidden" : "") +
    ">" +
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
// Counts contain no names or grades. The last successfully published counts
// survive reloads and detect a whole-data wipe or unusually large loss.
function singleFileContentBaseline(snapshot) {
  const counts = {
    version: 1,
    records: 0,
    schools: 0,
    students: 0,
    lessons: 0,
    grades: 0,
    attendance: 0,
    activities: 0,
  };
  const populatedScores = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? 1 : 0;
    if (typeof value === "string") return value.trim() ? 1 : 0;
    if (!value || typeof value !== "object") return 0;
    return Object.values(value).reduce(
      (total, item) => total + populatedScores(item),
      0,
    );
  };
  const scores = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (["kardaneshScores", "podScores", "unitScores"].includes(key))
        counts.grades += populatedScores(item);
      else if (item && typeof item === "object") scores(item);
    }
  };
  for (const row of snapshot.stores?.records || []) {
    if (row.logical === "meta") {
      counts.schools += row.value?.layout?.length || 0;
      continue;
    }
    counts.records++;
    if (row.logical?.startsWith("class:")) {
      counts.students +=
        (row.value?.students?.length || 0) +
        (row.value?.archivedStudents?.length || 0);
      counts.lessons += row.value?.lessons?.length || 0;
      scores(row.value);
    } else if (row.logical?.startsWith("session:")) {
      counts.activities += row.value?.scores?.length || 0;
      counts.attendance += Object.values(row.value?.attendance || {}).filter(
        (value) => value !== null && value !== undefined && value !== "",
      ).length;
    }
  }
  return counts;
}
function singleFileSourceDropped(previous, current) {
  if (previous?.version !== 1) return false;
  const keys = Object.keys(current).filter((key) => key !== "version");
  if (
    keys.some((key) => previous[key] > 0) &&
    keys.every((key) => current[key] === 0)
  )
    return true;
  const educational = [
    "students",
    "lessons",
    "grades",
    "attendance",
    "activities",
  ];
  if (
    educational.some((key) => previous[key] > 0) &&
    educational.every((key) => current[key] === 0)
  )
    return true;
  return keys.some(
    (key) =>
      previous[key] >= 10 &&
      previous[key] - current[key] >= 10 &&
      current[key] <= previous[key] / 2,
  );
}
function announceSingleFileSuspension(target = singleFile) {
  pauseSingleFile();
  showSingleFileFallback(true);
  singleFileStatus(
    (target?.suspension === "restore"
      ? "پس از بازیابی، اتصال فایل متوقف است؛ فایل قبلی تغییر نکرده است. "
      : "کاهش غیرعادی اطلاعات شناسایی شد؛ برای حفظ نسخه قبلی، فایل نوشته نشد. ") +
      "برای جایگزینی آگاهانه، «ذخیره اکنون / اجازه مجدد» را بزنید یا فایل دیگری انتخاب کنید.",
  );
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
async function singleFileCurrent(target, { acknowledged = false } = {}) {
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
  if (stored.suspension && !acknowledged) {
    target.suspension = stored.suspension;
    announceSingleFileSuspension(target);
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
  singleFileTimer = setInterval(
    () => void syncSingleFile({ force: false }),
    SINGLE_FILE_POLL_MS,
  );
}
function scheduleSingleFile() {
  if (!singleFileTimer) return;
  if (singleFileWriting) {
    singleFileReschedule = true;
    return;
  }
  clearTimeout(singleFileDebounce);
  singleFileDebounce = setTimeout(
    () => void syncSingleFile({ force: false }),
    SINGLE_FILE_DEBOUNCE_MS,
  );
}
async function restoreSingleFile() {
  try {
    singleFile = (await readRecord("drafts", singleFileKey)) || null;
    paintSingleFileBanner();
    if (!singleFile) return;
    if (singleFile.suspension) {
      announceSingleFileSuspension();
      return;
    }
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
  if (singleFileChoosing) return false;
  if (!ready || blocked || resetBusy || connectionRetired)
    throw Error("بانک آماده ذخیره فایل نیست.");
  singleFileChoosing = true;
  let reservation,
    accepted = false;
  try {
    let handle;
    try {
      reservation = reserveSingleFileName();
      // Name reservation is synchronous: keep the picker in the click gesture.
      handle = await window.showSaveFilePicker({
        suggestedName: reservation.name,
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
    if (!/\.json$/i.test(handle.name))
      throw Error("فقط فایل JSON انتخاب کنید.");
    const file = await handle.getFile();
    if (
      file.size &&
      !confirm(
        "محتوای فایل انتخابی با همه اطلاعات فعلی برنامه جایگزین شود؟ برای بازیابی، انصراف دهید و «بازیابی از فایل» را بزنید.",
      )
    )
      return;
    // The picker may already have created an empty file. Keep its number even
    // if the first write fails, so the next suggestion avoids that file.
    accepted = true;
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
  } finally {
    if (!accepted) reservation?.release();
    singleFileChoosing = false;
  }
}
async function resumeSingleFile() {
  if (!singleFile) throw Error("ابتدا فایل JSON را انتخاب کنید.");
  const target = singleFile;
  try {
    // Preserve the click gesture for the permission prompt. A suspended mirror
    // also needs a separate, file-named replacement acknowledgement below.
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
    if (!(await singleFileCurrent(target, { acknowledged: true })))
      return false;
    // An explicit save queues a fresh snapshot after any older write finishes.
    if (singleFileWriting && !(await singleFileWriting)) return false;
    if (!(await singleFileCurrent(target, { acknowledged: true })))
      return false;
    const stored = await readRecord("drafts", singleFileKey);
    const acknowledged = !!(target.suspension || stored?.suspension);
    if (
      acknowledged &&
      !confirm(
        "فایل «" +
          target.handle.name +
          "» با همه اطلاعات فعلی برنامه جایگزین شود؟ نسخه قبلی این فایل از بین می‌رود. اگر به آن نیاز دارید، ابتدا یک کپی مستقل نگه دارید. برای حفظ فایل، انصراف دهید یا فایل دیگری انتخاب کنید.",
      )
    )
      return false;
    pauseSingleFile();
    const saved = await syncSingleFile({ acknowledged });
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
function syncSingleFile({ force = true, acknowledged = false } = {}) {
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
  const write = async () => {
    let stream;
    try {
      if (!(await singleFileCurrent(target, { acknowledged }))) return false;
      if (!force) {
        const signature = await readBackupSourceSignature();
        if (
          singleFileSavedSource?.target === target &&
          singleFileSavedSource.signature === signature
        ) {
          const current = await target.handle.getFile();
          if (
            current.lastModified !== target.modified ||
            current.size !== target.size
          )
            throw Error(
              "فایل بیرون از برنامه تغییر کرده است؛ برای ادامه، فایل را دوباره انتخاب کنید.",
            );
          return singleFileCurrent(target, { acknowledged });
        }
      }
      singleFileStatus("در حال ذخیره فایل: " + target.handle.name);
      let snapshotSignature = null;
      const snapshot = await snapshotInstallation({
        onSourceSignature: (signature) => {
          snapshotSignature = signature;
        },
      });
      validateFullBackup(snapshot);
      const json = JSON.stringify(snapshot);
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
      let previousBaseline = target.contentBaseline;
      if (
        !previousBaseline &&
        target.savedAt &&
        file.size &&
        typeof file.text === "function"
      ) {
        // Upgrade an existing connection using its unchanged confirmed file,
        // never the possibly reduced in-memory source.
        const previous = JSON.parse(await file.text());
        validateFullBackup(previous);
        previousBaseline = singleFileContentBaseline(previous);
      }
      const contentBaseline = singleFileContentBaseline(snapshot);
      if (
        !acknowledged &&
        singleFileSourceDropped(previousBaseline, contentBaseline)
      ) {
        target.suspension = "source-drop";
        target.contentBaseline = previousBaseline;
        await persistSingleFile({ target });
        announceSingleFileSuspension(target);
        return false;
      }
      if (!(await singleFileCurrent(target, { acknowledged }))) return false;
      stream = await target.handle.createWritable();
      await stream.write(json);
      if (!(await singleFileCurrent(target, { acknowledged }))) {
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
      target.contentBaseline = contentBaseline;
      delete target.suspension;
      if (!(await persistSingleFile({ target }))) return false;
      singleFileSavedSource =
        snapshotSignature === null
          ? null
          : { target, signature: snapshotSignature };
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
        { saved: true },
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
      if (singleFileReschedule) {
        singleFileReschedule = false;
        scheduleSingleFile();
      }
    });
  return singleFileWriting;
}
