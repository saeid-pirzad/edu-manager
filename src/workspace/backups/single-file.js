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

function renewQuestionBankFilePermission() {
  const service = globalThis.EduQuestionBankFileBackup?.service;
  if (
    !service?.supported() ||
    service.state().state !== "permission" ||
    document.querySelector(
      ".qb-confirm,.qb-backup-confirm,.qb-backup[aria-busy='true'],.qb-page[aria-busy='true']",
    )
  )
    return false;
  // No await before this call: retain the user's activation. Default approval
  // stays false, so this action cannot approve replacing a suspended file.
  const tab =
      typeof state !== "undefined" && state.backupTab === "bank"
        ? "bank"
        : "school",
    context = captureSingleFileAction({ tab, fileScoped: false });
  context.assertCurrent();
  return service.saveNow(undefined, { isCurrent: () => context.isCurrent() });
}
function announceSingleFileSuspension(target = singleFile) {
  pauseSingleFile();
  showSingleFileFallback(true);
  singleFileStatus(
    (target?.suspension === "restore-source"
      ? "اطلاعات بازیابی شد؛ ذخیرهٔ خودکار در فایل «" +
        target.handle.name +
        "» هنوز فعال نیست. "
      : target?.suspension === "restore"
        ? "پس از بازیابی، اتصال فایل متوقف است؛ فایل قبلی تغییر نکرده است. "
        : "کاهش غیرعادی اطلاعات شناسایی شد؛ برای حفظ نسخه قبلی، فایل نوشته نشد. ") +
      "برای جایگزینی آگاهانه، «ذخیره اکنون / اجازه مجدد» را بزنید یا فایل دیگری انتخاب کنید.",
  );
}
async function singleFileRestoreHash(text) {
  const bytes = new TextEncoder().encode(text);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function assertRestoredSingleFileText(target, file, check = () => {}) {
  if (!target.restoreSourceHash) return;
  const text = await file.text();
  check();
  const hash = await singleFileRestoreHash(text);
  check();
  if (hash !== target.restoreSourceHash)
    throw Error(
      "فایل بازیابی‌شده بیرون از برنامه تغییر کرده است؛ فایل نوشته نشد. دوباره آن را بازیابی یا فایل دیگری برای ذخیره انتخاب کنید.",
    );
}
async function continueRestoredSingleFile(target, permission) {
  const sourceConnection = connection,
    sourceInstallation = installationToken,
    sourceWorkspace = workspace.id;
  const current = () =>
    singleFile === target &&
    connection === sourceConnection &&
    installationToken === sourceInstallation &&
    workspace.id === sourceWorkspace &&
    ready &&
    !blocked &&
    !resetBusy &&
    !connectionRetired &&
    !periodLoading;
  const guard = () => {
    if (!current())
      throw Object.assign(
        Error("زمینهٔ ذخیره پس از بازیابی تغییر کرد؛ فایل نوشته نشد."),
        { code: "SINGLE_FILE_CONTEXT_CHANGED" },
      );
  };
  try {
    const granted = await permission;
    guard();
    if (!granted) {
      pauseSingleFile();
      singleFileStatus(
        "بازیابی انجام شد؛ ذخیرهٔ خودکار در فایل «" +
          target.handle.name +
          "» فعال نیست. «ذخیره اکنون» را برای دادن مجوز بزنید.",
        { permission: true },
      );
      setStatus(
        "اطلاعات بازیابی شد؛ ادامهٔ ذخیره در فایل جدید نیازمند مجوز است.",
        "pending",
      );
      return false;
    }
    const saved = await syncSingleFile({ resumeRestored: true, guard });
    guard();
    if (saved) {
      startSingleFile();
      setStatus(
        "بازیابی انجام شد؛ ادامهٔ ذخیره در فایل «" +
          target.handle.name +
          "» فعال است.",
        "saved",
      );
    } else {
      setStatus(
        "اطلاعات بازیابی شد؛ فایل جدید هنوز ذخیره نشده است. وضعیت ذخیرهٔ خودکار را بررسی کنید.",
        "pending",
      );
    }
    return saved;
  } catch (error) {
    if (current()) {
      failSingleFile(error);
      setStatus(
        "اطلاعات بازیابی شد؛ ذخیرهٔ فایل جدید انجام نشد. " + error.message,
        "pending",
      );
    }
    return false;
  }
}
async function persistSingleFile({
  replace = false,
  target = singleFile,
  expectedConnectionId,
  guard,
} = {}) {
  guard?.();
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
      guard?.();
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
      if (
        expectedConnectionId !== undefined &&
        (request.result?.connectionId || null) !== expectedConnectionId
      )
        throw Object.assign(
          Error(
            "اتصال فایل در پنجرهٔ دیگری تغییر کرده است؛ انتخاب قبلی جایگزین آن نشد.",
          ),
          { code: "SINGLE_FILE_CONNECTION_CHANGED" },
        );
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
async function singleFileCurrent(
  target,
  { acknowledged = false, resumeRestored = false } = {},
) {
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
  if (
    stored.suspension &&
    !acknowledged &&
    !(resumeRestored && stored.suspension === "restore-source")
  ) {
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
async function assertSingleFileDestination(file) {
  if (typeof file.name === "string") assertClassroomFileName(file.name);
  if (!file.size) return null;
  if (typeof file.text !== "function")
    throw Error("خواندن محتوای فایل انتخابی ممکن نیست؛ فایل تغییر نکرد.");
  const text = await file.text();
  let value;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw Error("محتوای فایل انتخابی JSON معتبر نیست؛ فایل تغییر نکرد.", {
      cause: error,
    });
  }
  if (value?.format === "classyar-question-bank")
    throw Error(
      "این فایل متعلق به بانک سؤال و طراحی آزمون است؛ برای ذخیرهٔ کلاس‌داری، فایل جداگانه‌ای انتخاب کنید. فایل تغییر نکرد.",
    );
  try {
    if (value?.format === "EduManager.FullBackup") {
      validateFullBackup(value);
      return value;
    }
    return legacyBackupReplacement(value);
  } catch (error) {
    throw Error(
      "این فایل پشتیبان معتبر کلاس‌داری نیست؛ فایل تغییر نکرد. " +
        (error?.message || String(error)),
      { cause: error },
    );
  }
}
function captureSingleFileAction({ tab = "school", fileScoped = true } = {}) {
  const sourceConnection = connection,
    sourceInstallation =
      typeof installationToken === "undefined" ? "" : installationToken,
    sourceFile = singleFile,
    sourceView = typeof state === "undefined" ? null : state.view,
    sourceHub =
      typeof backupHubSession === "undefined" ? null : backupHubSession,
    hubCurrent = sourceHub?.captureTab
      ? sourceHub.captureTab(tab)
      : () => !sourceHub || sourceHub.isCurrent(tab);
  const sameInstallation = () =>
    connection === sourceConnection &&
    (typeof installationToken === "undefined" ? "" : installationToken) ===
      sourceInstallation &&
    ready &&
    !resetBusy &&
    !connectionRetired;
  const isCurrent = (target = sourceFile) =>
    sameInstallation() &&
    !periodLoading &&
    !(typeof fullRestoreBusy !== "undefined" && fullRestoreBusy) &&
    (!fileScoped || singleFile === target) &&
    (typeof state === "undefined" ? null : state.view) === sourceView &&
    hubCurrent();
  const assertCurrent = (target = sourceFile) => {
    if (!isCurrent(target))
      throw Object.assign(
        Error(
          "صفحه، اطلاعات یا اتصال فایل تغییر کرده است؛ عملیات فایل را دوباره انجام دهید.",
        ),
        { code: "SINGLE_FILE_CONTEXT_CHANGED" },
      );
  };
  return { file: sourceFile, sameInstallation, isCurrent, assertCurrent };
}
async function chooseSingleFile() {
  if (singleFileChoosing) return false;
  if (!ready || blocked || resetBusy || connectionRetired)
    throw Error("بانک آماده ذخیره فایل نیست.");
  const context = captureSingleFileAction();
  context.assertCurrent();
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
      context.assertCurrent();
      if (error.name === "AbortError") return;
      return failSingleFile(error);
    }
    context.assertCurrent();
    assertClassroomFileName(handle.name);
    const file = await handle.getFile();
    context.assertCurrent();
    await assertSingleFileDestination(file);
    context.assertCurrent();
    if (
      file.size &&
      !confirm(
        "اطلاعات فعلی برنامه روی فایل انتخابی نوشته و محتوای قبلی فایل جایگزین شود؟ برای بازکردن اطلاعات این فایل، انصراف دهید و «بازیابی و ادامه کار» را بزنید.",
      )
    )
      return;
    context.assertCurrent();
    // The picker may already have created an empty file. Keep its number even
    // if the first write fails, so the next suggestion avoids that file.
    accepted = true;
    if (singleFileWriting) await singleFileWriting;
    context.assertCurrent();
    const hadFileTimer = !!singleFileTimer,
      previousNotice = {
        message: singleFileMessage,
        failure: singleFileFailure,
        permission: singleFilePermissionNeeded,
        saved: singleFileNoticeSaved,
      },
      target = {
        connectionId: uid(),
        handle,
        modified: file.lastModified,
        size: file.size,
        savedAt: "",
      };
    pauseSingleFile();
    singleFile = target;
    let persisted = false;
    try {
      persisted = await persistSingleFile({
        replace: true,
        target,
        expectedConnectionId: context.file?.connectionId || null,
        guard: () => context.assertCurrent(target),
      });
      context.assertCurrent(target);
      const saved = await syncSingleFile({
        guard: () => context.assertCurrent(target),
      });
      context.assertCurrent(target);
      broadcast({
        type: "single-file-changed",
        connectionId: target.connectionId,
      });
      if (saved) startSingleFile();
      return saved;
    } catch (error) {
      if (
        !persisted ||
        [
          "SINGLE_FILE_CONTEXT_CHANGED",
          "SINGLE_FILE_CONNECTION_CHANGED",
        ].includes(error.code)
      ) {
        if (context.sameInstallation() && singleFile === target) {
          singleFile = context.file;
          if (persisted)
            await persistSingleFile({
              replace: true,
              target: context.file,
              expectedConnectionId: target.connectionId,
            }).catch(() => {});
          singleFileMessage = previousNotice.message;
          singleFileFailure = previousNotice.failure;
          singleFilePermissionNeeded = previousNotice.permission;
          singleFileNoticeSaved = previousNotice.saved;
          if (
            hadFileTimer &&
            singleFile &&
            !blocked &&
            !error.fileCommitStarted
          )
            startSingleFile();
        }
        throw error;
      }
      return failSingleFile(error);
    }
  } finally {
    if (!accepted) reservation?.release();
    singleFileChoosing = false;
    paintSingleFileBanner();
  }
}
async function resumeSingleFile() {
  if (!singleFile) throw Error("ابتدا فایل JSON را انتخاب کنید.");
  const context = captureSingleFileAction();
  context.assertCurrent();
  const target = singleFile,
    hadFileTimer = !!singleFileTimer;
  try {
    // Preserve the click gesture for the permission prompt. A suspended mirror
    // also needs a separate, file-named replacement acknowledgement below.
    // Permission request also needs the explicit click, not an automatic timer.
    const permission = await target.handle.requestPermission({
      mode: "readwrite",
    });
    context.assertCurrent();
    if (permission !== "granted") {
      pauseSingleFile();
      showSingleFileFallback(true);
      singleFileStatus("اجازه نوشتن داده نشد؛ فایل به‌روز نشده است.", {
        permission: true,
      });
      return false;
    }
    if (!(await singleFileCurrent(target, { acknowledged: true })))
      return false;
    context.assertCurrent();
    // An explicit save queues a fresh snapshot after any older write finishes.
    if (singleFileWriting && !(await singleFileWriting)) return false;
    context.assertCurrent();
    if (!(await singleFileCurrent(target, { acknowledged: true })))
      return false;
    context.assertCurrent();
    const stored = await readRecord("drafts", singleFileKey);
    context.assertCurrent();
    const acknowledged = !!(target.suspension || stored?.suspension);
    if (
      acknowledged &&
      target.suspension !== "restore-source" &&
      !confirm(
        "فایل «" +
          target.handle.name +
          "» با اطلاعات فعلی مدرسه جایگزین شود؟ بانک سؤال و آزمون‌ها در فایل جدا هستند. نسخه قبلی این فایل از بین می‌رود. اگر به آن نیاز دارید، ابتدا یک کپی مستقل نگه دارید. برای حفظ فایل، انصراف دهید یا فایل دیگری انتخاب کنید.",
      )
    )
      return false;
    context.assertCurrent();
    pauseSingleFile();
    const saved = await syncSingleFile({
      acknowledged: acknowledged && target.suspension !== "restore-source",
      resumeRestored: target.suspension === "restore-source",
      guard: () => context.assertCurrent(),
    });
    context.assertCurrent();
    if (saved) startSingleFile();
    return saved;
  } catch (error) {
    if (!context.isCurrent() || error.code === "SINGLE_FILE_CONTEXT_CHANGED") {
      if (
        context.sameInstallation() &&
        singleFile === target &&
        hadFileTimer &&
        !blocked &&
        !error.fileCommitStarted
      )
        startSingleFile();
      if (error.fileCommitStarted) throw error;
      context.assertCurrent();
      throw error;
    }
    return failSingleFile(error);
  }
}
async function disableSingleFile() {
  const context = captureSingleFileAction();
  context.assertCurrent();
  const target = singleFile,
    hadFileTimer = !!singleFileTimer;
  pauseSingleFile();
  singleFile = null;
  try {
    if (
      await persistSingleFile({
        target,
        guard: () => context.assertCurrent(null),
      })
    )
      broadcast({ type: "single-file-changed", connectionId: null });
    if (singleFileWriting) await singleFileWriting;
    showSingleFileFallback(false);
    singleFileStatus("اتصال متوقف شد؛ فایل موجود حذف نشده است.");
  } catch (error) {
    const stale = !context.isCurrent(null);
    if (context.sameInstallation() && singleFile === null) {
      singleFile = target;
      if (hadFileTimer && singleFile && !blocked) startSingleFile();
    }
    if (stale) context.assertCurrent(null);
    if (error.code === "SINGLE_FILE_CONTEXT_CHANGED") throw error;
    return failSingleFile(error);
  }
}
function syncSingleFile({
  force = true,
  acknowledged = false,
  resumeRestored = false,
  guard,
} = {}) {
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
  const currentTarget = async () => {
    guard?.();
    const current = await singleFileCurrent(target, {
      acknowledged,
      resumeRestored,
    });
    guard?.();
    return current;
  };
  const write = async () => {
    let stream,
      closeStarted = false;
    const cancelled = (error) => {
      if (closeStarted)
        throw Object.assign(
          Error(
            "صفحه یا اطلاعات هنگام بستن فایل تغییر کرده است؛ بستن/نوشتن فایل شروع شده و ممکن است فایل تغییر کرده باشد. فایل را بررسی و برای ادامه دوباره انتخاب کنید.",
            { cause: error },
          ),
          { code: "SINGLE_FILE_CONTEXT_CHANGED", fileCommitStarted: true },
        );
      return false;
    };
    try {
      if (!(await currentTarget())) return false;
      assertClassroomFileName(target.handle.name);
      if (!force) {
        const signature = await readBackupSourceSignature();
        if (
          singleFileSavedSource?.target === target &&
          singleFileSavedSource.signature === signature
        ) {
          const current = await target.handle.getFile();
          if (typeof current.name === "string")
            assertClassroomFileName(current.name);
          if (
            current.lastModified !== target.modified ||
            current.size !== target.size
          )
            throw Error(
              "فایل بیرون از برنامه تغییر کرده است؛ برای ادامه، فایل را دوباره انتخاب کنید.",
            );
          if (target.restoreSourceHash)
            await assertRestoredSingleFileText(target, current, guard);
          return currentTarget();
        }
      }
      singleFileStatus("در حال ذخیره فایل: " + target.handle.name);
      let snapshotSignature = null;
      const snapshot = await snapshotInstallation({
        onSourceSignature: (signature) => {
          snapshotSignature = signature;
        },
      });
      guard?.();
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
      assertClassroomFileName(target.handle.name);
      const file = await target.handle.getFile();
      guard?.();
      if (typeof file.name === "string") assertClassroomFileName(file.name);
      if (file.lastModified !== target.modified || file.size !== target.size)
        throw Error(
          "فایل بیرون از این اتصال تغییر کرده؛ برای جلوگیری از بازنویسی، دوباره آن را انتخاب کنید.",
        );
      const previous = await assertSingleFileDestination(file);
      guard?.();
      let previousBaseline = target.contentBaseline;
      if (!previousBaseline && target.savedAt && previous) {
        // Upgrade an existing connection using its unchanged confirmed file,
        // never the possibly reduced in-memory source.
        previousBaseline = EduSingleFilePolicy.contentBaseline(previous);
      }
      const contentBaseline = EduSingleFilePolicy.contentBaseline(snapshot);
      if (
        !acknowledged &&
        EduSingleFilePolicy.sourceDropped(previousBaseline, contentBaseline)
      ) {
        target.suspension = "source-drop";
        target.contentBaseline = previousBaseline;
        await persistSingleFile({ target, guard });
        guard?.();
        announceSingleFileSuspension(target);
        return false;
      }
      if (!(await currentTarget())) return false;
      // The connection checks await IndexedDB. Recheck the already-inspected
      // file after them so an intervening external edit is never overwritten.
      assertClassroomFileName(target.handle.name);
      const current = await target.handle.getFile();
      guard?.();
      if (typeof current.name === "string")
        assertClassroomFileName(current.name);
      if (
        current.lastModified !== file.lastModified ||
        current.size !== file.size
      )
        throw Error(
          "فایل هنگام بررسی اتصال، بیرون از برنامه تغییر کرد؛ برای جلوگیری از بازنویسی، دوباره آن را انتخاب کنید.",
        );
      // The final re-read is after every asynchronous connection check.
      if (target.restoreSourceHash) {
        await assertRestoredSingleFileText(target, current, guard);
        if (!(await currentTarget())) return false;
        const finalFile = await target.handle.getFile();
        guard?.();
        assertClassroomFileName(target.handle.name);
        if (
          finalFile.lastModified !== current.lastModified ||
          finalFile.size !== current.size
        )
          throw Error("فایل هنگام آماده‌سازی ذخیره تغییر کرد؛ نوشته نشد.");
        await assertRestoredSingleFileText(target, finalFile, guard);
      }
      stream = await target.handle.createWritable();
      guard?.();
      await stream.write(json);
      if (!(await currentTarget())) {
        await stream.abort();
        return false;
      }
      // The file-system publication begins at close(). A view change after
      // this point cannot roll that external write back atomically with IDB.
      closeStarted = true;
      await stream.close();
      stream = null;
      const saved = await target.handle.getFile();
      if (!saved.size)
        throw Error(
          "فایل پس از نوشتن خالی است؛ ذخیره تأیید نشد. پشتیبان دستی بگیرید.",
        );
      if (typeof saved.name === "string") assertClassroomFileName(saved.name);
      if (typeof saved.text !== "function" || (await saved.text()) !== json)
        throw Error(
          "محتوای فایل پس از نوشتن با پشتیبان کامل مطابقت ندارد؛ ذخیره تأیید نشد. پشتیبان دستی بگیرید.",
        );
      guard?.();
      if (target.restoreSourceHash)
        target.restoreSourceHash = await singleFileRestoreHash(json);
      guard?.();
      target.modified = saved.lastModified;
      target.size = saved.size;
      target.savedAt = snapshot.exportedAt;
      target.contentBaseline = contentBaseline;
      delete target.suspension;
      if (!(await persistSingleFile({ target, guard }))) return false;
      guard?.();
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
      try {
        guard?.();
      } catch (contextError) {
        if (contextError.code === "SINGLE_FILE_CONTEXT_CHANGED")
          return cancelled(contextError);
        return failSingleFile(contextError);
      }
      if (error.code === "SINGLE_FILE_CONTEXT_CHANGED") return cancelled(error);
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
    .catch((error) => {
      if (error.code === "SINGLE_FILE_CONTEXT_CHANGED") throw error;
      return failSingleFile(error);
    })
    .finally(() => {
      singleFileWriting = null;
      paintSingleFileBanner();
      if (singleFileReschedule) {
        singleFileReschedule = false;
        scheduleSingleFile();
      }
    });
  return singleFileWriting;
}
