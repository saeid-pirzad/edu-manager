async function exportBackupV24() {
  const origin = workspace.id;
  const ensureSource = () => {
    if (
      !ready ||
      periodLoading ||
      resetBusy ||
      connectionRetired ||
      workspace.id !== origin
    )
      throw new Error(
        "ترم هنگام تهیه پشتیبان تغییر کرده است؛ دوباره تلاش کنید.",
      );
  };
  ensureSource();
  let excludedDrafts = 0;
  try {
    await flushDrafts({ strict: true });
  } catch (error) {
    excludedDrafts = drafts.size;
    setStatus(
      "پشتیبان از آخرین ثبت سالم تهیه می‌شود؛ ویرایش‌های ذخیره‌نشده داخل آن نیستند.",
      "error",
    );
  }
  await writer.catch(() => {});
  ensureSource();
  const snapshot = await readWorkspaceSnapshot(origin);
  ensureSource();
  const { period, data: durable } = snapshot;
  const content = {
      version: 25,
      exportedAt: new Date().toISOString(),
      excludedDrafts,
      period: { year: period.year, term: period.term },
      db: durable,
    },
    name = "Classyar-Classroom.json",
    json = JSON.stringify(content, null, 2);
  let confirmed = false;
  if (window.showSaveFilePicker) {
    let writable;
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: "پشتیبان مدرسه",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      assertClassroomFileName(handle.name);
      const before = await handle.getFile();
      await assertSingleFileDestination(before);
      const previousText = await before.text();
      // A legacy one-period export must never replace a complete installation.
      if (previousText && previousText !== json)
        throw Error("برای حفظ فایل قبلی، فایل تازه‌ای انتخاب کنید.");
      const current = await handle.getFile();
      assertClassroomFileName(current.name);
      if ((await current.text()) !== previousText)
        throw Error("فایل هنگام انتخاب تغییر کرد؛ نوشته نشد.");
      writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      writable = null;
      const file = await handle.getFile();
      if (!file.size || (await file.text()) !== json)
        throw new Error("محتوای فایل پس از نوشتن تأیید نشد.");
      confirmed = true;
    } catch (error) {
      if (writable) {
        try {
          await writable.abort();
        } catch (ignore) {}
      }
      if (error.name === "AbortError") return false;
      downloadJSON(content, name);
    }
  } else downloadJSON(content, name);
  try {
    localStorage.setItem(
      "Edu24.externalBackup." + origin,
      JSON.stringify({ date: todayISO(), confirmed }),
    );
  } catch (ignore) {}
  setStatus(
    confirmed
      ? "فایل پشتیبان مستقل ذخیره شد."
      : "دانلود پشتیبان درخواست شد؛ وجود فایل را بررسی کنید.",
    "saved",
  );
  render();
  return confirmed ? "confirmed" : "downloaded";
}

let backupHubSession = null;
let backupHubRequest = 0;
let backupHubImportOrigin = null;

function backupHubHtml() {
  return (
    '<div id="backupHub" class="backup-hub"><div class="backup-hub-tabs" role="tablist" aria-label="نوع اطلاعات پشتیبان"><button type="button" id="backupSchoolTab" role="tab" data-backup-tab="school" aria-controls="backupSchoolPanel" aria-selected="true">اطلاعات مدرسه</button><button type="button" id="backupBankTab" role="tab" data-backup-tab="bank" aria-controls="backupBankPanel" aria-selected="false" tabindex="-1">بانک سؤال و آزمون‌ها</button></div><section id="backupSchoolPanel" class="backup-hub-panel" role="tabpanel" aria-labelledby="backupSchoolTab" tabindex="0"><section class="backup-manual"><h4>پشتیبان دستی</h4><p>کلاس‌ها، هنرجویان، جلسات و نمرات؛ مستقل از بانک سؤال.</p><div class="backup-action-grid"><button type="button" data-workspace-action="export-full">دریافت فایل</button><button type="button" class="ghost backup-share-entry" data-workspace-action="prepare-share-backup">ارسال فایل</button><button type="button" class="ghost" data-workspace-action="choose-import">بازیابی فایل</button></div><p id="lastExternalBackupStatus" class="backup-delivery-status" role="status">' +
    esc(lastExternalBackupLabel()) +
    '</p><p class="backup-restore-help">فایل دریافتی، ارسالی (JSON یا TXT) و ذخیرهٔ خودکار همگی از «بازیابی فایل» قابل بازیابی‌اند.</p></section>' +
    singleFilePanel() +
    '<details class="backup-reset"><summary>حذف اطلاعات و فایل متصل</summary><p>اطلاعات مدرسه و فقط فایل خودکارِ متصل به مدرسه حذف می‌شوند. بانک سؤال و فایل‌های دیگر محفوظ‌اند. یک پشتیبان جداگانه نگه دارید.</p><button type="button" class="danger" data-workspace-action="open-wipe">بررسی و تأیید حذف</button></details></section><section id="backupBankPanel" class="backup-hub-panel" role="tabpanel" aria-labelledby="backupBankTab" tabindex="0" hidden inert></section></div>'
  );
}

async function openBackups({ tab } = {}) {
  const request = ++backupHubRequest;
  const ensureCurrent = preserveAsyncTarget();
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  const previousContent = body.firstChild;
  const wasHidden = modal.classList.contains("hidden");
  const initialTab =
    tab === "school" || tab === "bank"
      ? tab
      : window.EduQuestionBankUI?.isPageActive?.()
        ? "bank"
        : "school";
  await writer.catch(() => {});
  ensureCurrent();
  // A delayed menu request must not replace a newer dialog or reopen a closed one.
  if (
    request !== backupHubRequest ||
    body.firstChild !== previousContent ||
    modal.classList.contains("hidden") !== wasHidden
  )
    return;
  if (showModal("پشتیبان و بازیابی", backupHubHtml()) === false) return;
  backupHubSession?.dispose();
  const root = document.getElementById("backupHub");
  const tabs = Array.from(root.querySelectorAll("[data-backup-tab]"));
  const panels = {
    school: document.getElementById("backupSchoolPanel"),
    bank: document.getElementById("backupBankPanel"),
  };
  let alive = true;
  let activeTab = "";
  let disposeBank = null;
  const isCurrent = (expectedTab) =>
    alive &&
    backupHubSession === session &&
    root.isConnected &&
    !modal.classList.contains("hidden") &&
    (!expectedTab || activeTab === expectedTab);
  const dispose = () => {
    if (!alive) return;
    alive = false;
    if (backupShareSession?.hub === session)
      closeBackupShare({ restoreFocus: false });
    disposeBank?.();
    disposeBank = null;
    observer.disconnect();
    root.removeEventListener("click", handleTabClick);
    root.removeEventListener("keydown", handleTabKeydown);
    if (backupHubSession === session) backupHubSession = null;
  };
  const selectTab = (next, focus = false) => {
    if (!isCurrent() || !panels[next]) return;
    if (next !== activeTab) {
      if (backupShareSession?.hub === session)
        closeBackupShare({ restoreFocus: false });
      disposeBank?.();
      disposeBank = null;
      panels.bank.replaceChildren();
      activeTab = next;
      for (const button of tabs) {
        const selected = button.dataset.backupTab === next;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
      }
      for (const [key, panel] of Object.entries(panels)) {
        panel.hidden = key !== next;
        panel.inert = key !== next;
      }
      if (next === "bank")
        disposeBank = window.EduQuestionBankBackupUI.mount(panels.bank, {
          isCurrent: () => isCurrent("bank"),
        });
      else paintSingleFileBanner();
    }
    if (focus)
      tabs.find((button) => button.dataset.backupTab === next)?.focus();
  };
  const handleTabClick = (event) => {
    const button = event.target.closest("[data-backup-tab]");
    if (button && root.contains(button)) selectTab(button.dataset.backupTab);
  };
  const handleTabKeydown = (event) => {
    if (!event.target.closest("[data-backup-tab]")) return;
    let next;
    if (event.key === "Home") next = "school";
    else if (event.key === "End") next = "bank";
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft")
      next = activeTab === "school" ? "bank" : "school";
    else return;
    event.preventDefault();
    selectTab(next, true);
  };
  const observer = new MutationObserver(() => {
    if (!isCurrent()) dispose();
  });
  const session = { isCurrent, dispose };
  backupHubSession = session;
  observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
  observer.observe(body, { childList: true });
  root.addEventListener("click", handleTabClick);
  root.addEventListener("keydown", handleTabKeydown);
  selectTab(initialTab);
}

function chooseBackupImport() {
  const visibleHub =
    document.getElementById("backupHub") &&
    !document.getElementById("modal").classList.contains("hidden");
  const session = visibleHub ? backupHubSession : null;
  if (visibleHub && !session?.isCurrent("school"))
    throw Error("برای بازیابی اطلاعات مدرسه، تب «اطلاعات مدرسه» را باز کنید.");
  const input = document.getElementById("importFile");
  backupHubImportOrigin?.cleanup();
  backupHubImportOrigin = session
    ? { isCurrent: () => session.isCurrent("school") }
    : null;
  if (backupHubImportOrigin) {
    const origin = backupHubImportOrigin;
    const cancel = () => {
      if (backupHubImportOrigin === origin) backupHubImportOrigin = null;
      origin.cleanup();
    };
    origin.cleanup = () => input.removeEventListener("cancel", cancel);
    input.addEventListener("cancel", cancel, { once: true });
  }
  input.click();
}

function previewImport(candidate, label) {
  const preview = {
    candidate,
    label,
    workspace: workspace?.id,
    revision: workspace?.revision,
    installation:
      typeof installationToken === "undefined" ? "" : installationToken,
  };
  const classes = candidate.schools.flatMap((s) => s.classes),
    students = classes.reduce((n, c) => n + c.students.length, 0);
  const opened = showModal(
    "پیش‌نمایش بازیابی",
    "<p>منبع: " +
      esc(label) +
      "</p><p>" +
      candidate.schools.length +
      " مدرسه، " +
      classes.length +
      " کلاس، " +
      students +
      " دانش‌آموز فعال، " +
      candidate.sessions.length +
      " جلسه.</p>" +
      (candidate.migrationWarnings?.length
        ? '<p role="alert">' +
          esc(candidate.migrationWarnings.join(" | ")) +
          "</p>"
        : "") +
      "<p>سال پشتیبان: " +
      esc(
        candidate.settings.academicYear +
          " / " +
          (candidate.settings.academicTerm || "نامشخص"),
      ) +
      "</p><p>این فایل اطلاعات نوبت " +
      esc(workspace.year + " / " + workspace.term) +
      ' را بازمی‌گرداند؛ نوبت جدید ساخته نمی‌شود. نمره‌های پودمانی مشترکِ همین سال نیز به‌روز می‌شوند؛ نمرات نوبتیِ دیگر و سایر سال‌ها تغییر نمی‌کنند.</p><button data-workspace-action="export-period">۱. ذخیره پشتیبان اطلاعات فعلی</button><p><label><input id="restoreExternalConfirmed" type="checkbox"> نسخه فعلی را در فایل مستقل ذخیره و بررسی کرده‌ام.</label></p><button data-mutating="1" data-workspace-action="confirm-import">۲. بازیابی اطلاعات همین نوبت</button><p id="operationError" role="alert"></p>',
  );
  if (opened !== false) pendingImport = preview;
}

let backupImportReading = false;
async function handleImportV24(
  e,
  { fullSystemOnly = false, replaceSystem = true } = {},
) {
  const file = e.target.files[0];
  const uiOrigin = backupHubImportOrigin;
  uiOrigin?.cleanup();
  backupHubImportOrigin = null;
  if (!file) return;
  if (backupImportReading) {
    e.target.value = "";
    handleError(new Error("خواندن فایل پشتیبان در حال انجام است؛ صبر کنید."));
    return;
  }
  if (replaceSystem && fullRestoreBusy) {
    e.target.value = "";
    handleError(
      Error("بازیابی اطلاعات مدرسه در حال انجام است؛ تا پایان آن صبر کنید."),
    );
    return;
  }
  if (replaceSystem) {
    pendingFullBackup = null;
    pendingFullBackupSignature = "";
    pendingImport = null;
  }
  backupImportReading = true;
  const startedReady = ready;
  const origin = workspace?.id;
  let expectedConnection = connection;
  const ensureDestination = () => {
    if (uiOrigin && !uiOrigin.isCurrent())
      throw Error(
        "پنجرهٔ بازیابی بسته یا عوض شده است؛ فایل را دوباره انتخاب کنید.",
      );
    if (
      ready !== startedReady ||
      workspace?.id !== origin ||
      resetBusy ||
      periodLoading ||
      (startedReady && connectionRetired) ||
      (replaceSystem && connection !== expectedConnection)
    )
      throw Error(
        "مقصد بازیابی هنگام خواندن فایل تغییر کرد؛ فایل را دوباره انتخاب کنید.",
      );
  };
  const previewReplacement = async (value, details) => {
    if (!ready && (!connection || connectionRetired)) {
      // Validate before opening even a recovery connection. No catalog or
      // data writes happen until the complete replacement is confirmed.
      validateFullBackup(value);
      const opened = await openDatabase();
      try {
        ensureDestination();
      } catch (error) {
        opened.close();
        throw error;
      }
      expectedConnection = opened;
      connection = opened;
      connectionRetired = false;
    }
    ensureDestination();
    previewFullBackup(value, details);
  };
  try {
    ensureDestination();
    assertClassroomFileName(file.name, { allowText: true });
    // Full exports grow with the installation. Do not make our own large
    // backups unrestorable; ask before allocating memory, without writing data.
    if (
      file.size > 100 * 1024 * 1024 &&
      !confirm(
        "حجم این فایل پشتیبان حدود " +
          Math.ceil(file.size / 1048576).toLocaleString("fa-IR") +
          " مگابایت است. خواندن آن ممکن است زمان‌بر باشد و حافظهٔ زیادی مصرف کند؛ روی دستگاه کم‌حافظه از رایانه استفاده کنید.\nفقط فایل مورداعتماد خودتان را باز کنید. خواندن و بررسی فایل ادامه پیدا کند؟ تا تأیید نهایی بازیابی، اطلاعات فعلی تغییر نمی‌کند.",
      )
    )
      return;
    ensureDestination();
    const parsed = JSON.parse(await file.text());
    ensureDestination();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw Error("ساختار فایل پشتیبان معتبر نیست.");
    if (parsed.format === "EduManager.FullBackup") {
      if (replaceSystem)
        await previewReplacement(parsed, { sourceName: file.name });
      else previewFullBackup(parsed);
      return;
    }
    if (replaceSystem) {
      const replacement = legacyBackupReplacement(parsed);
      await previewReplacement(replacement, {
        sourceName: file.name,
        legacy: true,
      });
      return;
    }
    // Retained only for internal compatibility and its regression tests.
    if (fullSystemOnly)
      throw Error(
        "این فایل پشتیبان کامل مدرسه نیست. فایل کامل شامل اطلاعات سال تحصیلی، هر دو ترم، مدرسه‌ها، کلاس‌ها و هنرجویان را انتخاب کنید؛ اطلاعات فعلی تغییر نکرده است.",
      );
    if (
      parsed.version !== undefined &&
      (!Number.isInteger(parsed.version) ||
        parsed.version > 26 ||
        parsed.version < 1)
    )
      throw Error("نسخه پشتیبان پشتیبانی نمی‌شود.");
    const source = parsed.db || parsed;
    if (source.schemaVersion > 26)
      throw Error("نسخه ساختار جدیدتر پشتیبانی نمی‌شود.");
    const candidate = normalizeDB(source, {
      legacy: (source.schemaVersion ?? parsed.version ?? 23) < 24,
    });
    if (!ready) {
      if (!connection) {
        const opened = await openDatabase();
        try {
          ensureDestination();
          if (connection && connection !== opened)
            throw Error("اتصال بانک هنگام بازیابی تغییر کرده است.");
        } catch (error) {
          if (connection !== opened) opened.close();
          throw error;
        }
        connection = opened;
      }
      ensureDestination();
      const recoveryConnection = connection;
      const ensureRecovery = () => {
        ensureDestination();
        if (connection !== recoveryConnection)
          throw Error("اتصال بانک هنگام بازیابی تغییر کرده است.");
      };
      const created = await installWorkspace(candidate, {
        id: uid(),
        year: candidate.settings.academicYear,
        term: candidate.settings.academicTerm,
      });
      ensureRecovery();
      const loaded = await readWorkspace(created.id);
      ensureRecovery();
      workspace = created;
      db = loaded.data;
      committed = loaded.records;
      ready = true;
      blocked = false;
      storageBlocked = false;
      isAuthenticated = false;
      rememberPeriod(workspace.id);
      render();
      return;
    }
    await flushDrafts({ strict: true });
    ensureDestination();
    previewImport(candidate, file.name);
  } catch (error) {
    handleError(error);
  } finally {
    backupImportReading = false;
    e.target.value = "";
  }
}

let periodImportBusy = false;
async function confirmImport() {
  if (periodImportBusy)
    throw Error("بازیابی در حال انجام است؛ تا پایان آن صبر کنید.");
  periodImportBusy = true;
  try {
    if (fileMode)
      throw Error(
        "این عملیات را در نسخه نصب‌شده برنامه یا نشانی HTTPS آن انجام دهید.",
      );
    if (!pendingImport || pendingImport.workspace !== workspace.id)
      throw Error("پیش‌نمایش بازیابی منقضی شده است.");
    const preview = pendingImport,
      expectedInstallation = preview.installation ?? "";
    const context = { id: preview.workspace, revision: preview.revision };
    const check = (write = false) => {
      if (
        (typeof installationToken === "undefined" ? "" : installationToken) !==
        expectedInstallation
      )
        throw Object.assign(
          Error(
            "اطلاعات جایگزین شده است؛ پیش‌نمایش پشتیبان را دوباره باز کنید.",
          ),
          { code: "INSTALLATION_CHANGED" },
        );
      assertWorkspaceContext(context, { write });
      if (pendingImport !== preview)
        throw Error("پیش‌نمایش بازیابی تغییر کرده است؛ دوباره بررسی کنید.");
    };
    check();
    const savedKind = academicTermKind(preview.candidate.settings.academicTerm);
    const targetKind = workspace.termKind || academicTermKind(workspace.term);
    if (
      preview.candidate.settings.academicYear !== workspace.year ||
      (savedKind && targetKind
        ? savedKind !== targetKind
        : normalizedName(preview.candidate.settings.academicTerm) !==
          normalizedName(workspace.term))
    )
      throw Error(
        "این فایل متعلق به نوبت فعلی نیست؛ همان سال و نوبت را باز کنید یا از پشتیبان کامل مدرسه استفاده کنید.",
      );
    if (!document.getElementById("restoreExternalConfirmed").checked) {
      handleError(
        Error("ابتدا نسخه مستقل را ذخیره و وجود فایل را تأیید کنید."),
      );
      return;
    }
    if (workspace.closed)
      throw Error(
        "ترم بسته است؛ برای بازیابی در آن ابتدا ترم را بازگشایی کنید.",
      );
    if (!confirm("اطلاعات این ترم با نسخه پیش‌نمایش جایگزین شود؟")) return;
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    check(true);
    const candidate = normalizeDB(preview.candidate);
    candidate.settings.academicYear = workspace.year;
    candidate.settings.academicTerm = workspace.term;
    validateV24(candidate);
    check(true);
    busy++;
    paintStatus();
    const sourceConnection = connection;
    const isCurrentTarget = () =>
      workspace?.id === context.id &&
      connection === sourceConnection &&
      !periodLoading &&
      !resetBusy &&
      !connectionRetired;
    const operation = (async () => {
      let installed = false;
      try {
        const changed = await commitRecords(collectRecords(candidate), {
          expectedInstallation,
          action: "بازیابی پشتیبان: " + preview.label,
          replace: true,
          keepUndo: false,
        });
        // The write belongs to its source period even if another operation has
        // since retired the connection or selected a different period.
        if (
          !isCurrentTarget() ||
          workspace.revision !== context.revision + (changed ? 1 : 0)
        )
          return true;
        db = candidate;
        installed = true;
        drafts.clear();
        storeDrafts();
        pendingImport = null;
        isAuthenticated = false;
        state = {
          view: "schools",
          schoolId: null,
          classId: null,
          lessonId: null,
          tab: "students",
          reportTab: "comprehensive",
        };
        closeModal();
        scheduleSingleFile();
        setStatus("بازیابی تراکنشی انجام شد.", "saved");
        return true;
      } catch (error) {
        if (isCurrentTarget()) handleError(error);
        throw error;
      } finally {
        busy--;
        if (installed && isCurrentTarget()) render();
        else paintStatus();
      }
    })();
    // Period switching, backups and subsequent edits must await the complete
    // restore, including its in-memory update, not just the preceding save.
    writer = operation;
    await operation;
  } finally {
    periodImportBusy = false;
  }
}
