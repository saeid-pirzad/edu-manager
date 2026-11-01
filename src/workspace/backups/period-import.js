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
        "دوره هنگام تهیه پشتیبان تغییر کرده است؛ دوباره تلاش کنید.",
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
    name =
      "مدرسه-" + period.year + "-" + period.term + "-" + todayISO() + ".json";
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
      writable = await handle.createWritable();
      await writable.write(JSON.stringify(content, null, 2));
      await writable.close();
      writable = null;
      const file = await handle.getFile();
      if (!file.size) throw new Error("فایل پشتیبان خالی است.");
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

async function openBackups() {
  const ensureCurrent = preserveAsyncTarget();
  await writer.catch(() => {});
  ensureCurrent();
  let estimate = "";
  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate();
    ensureCurrent();
    estimate =
      "مصرف تقریبی فضای این مبدا: " +
      Math.round((e.usage || 0) / 1048576) +
      " مگابایت از " +
      Math.round((e.quota || 0) / 1048576) +
      " مگابایت.";
  }
  showModal(
    "پشتیبان و بازیابی",
    '<div class="backup-hub"><section class="backup-manual"><h4>فایل پشتیبان شما</h4><p>یک فایل پشتیبان برای کل سیستم: سال‌های تحصیلی، ترم اول و دوم، مدرسه‌ها، کلاس‌ها، هنرجویان، نمرات و حضور‌وغیاب. برای هر ترم فایل جدا لازم نیست. بازیابی، کل اطلاعات فعلی را با محتوای فایل جایگزین می‌کند.</p><div class="backup-action-grid"><button data-workspace-action="export-full">دریافت پشتیبان کامل</button><button class="ghost backup-share-entry" data-workspace-action="prepare-share-backup">اشتراک‌گذاری پشتیبان کامل</button><button class="ghost" data-workspace-action="choose-import">بازیابی از فایل</button></div><p class="muted">' +
      esc(lastExternalBackupLabel()) +
      "</p></section>" +
      singleFilePanel() +
      '<details class="backup-help"><summary>فضای ذخیره‌سازی مرورگر</summary><p>' +
      esc(estimate) +
      '</p></details><details class="backup-reset"><summary>پاک‌سازی اطلاعات سیستم</summary><p>برای شروع دوباره، همه اطلاعات برنامه در همین مرورگر حذف می‌شود. این کار بازیابی فایل نیست؛ پیش از ادامه پشتیبان کامل دریافت کنید. فایل‌های ذخیره‌شده روی دستگاه حذف نمی‌شوند.</p><button type="button" class="danger" data-workspace-action="open-wipe">بررسی و تأیید پاک‌سازی</button></details></div>',
  );
}

function previewImport(candidate, label) {
  const preview = {
    candidate,
    label,
    workspace: workspace?.id,
    revision: workspace?.revision,
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
  if (!file) return;
  if (backupImportReading) {
    e.target.value = "";
    handleError(new Error("خواندن فایل پشتیبان در حال انجام است؛ صبر کنید."));
    return;
  }
  if (replaceSystem && fullRestoreBusy) {
    e.target.value = "";
    handleError(
      Error("بازیابی کل اطلاعات در حال انجام است؛ تا پایان آن صبر کنید."),
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
    if (file.size > 100 * 1024 * 1024)
      throw Error("حداکثر حجم فایل پشتیبان صد مگابایت است.");
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
        "این فایل پشتیبان کامل سیستم نیست. فایل کامل شامل اطلاعات سال‌های تحصیلی، ترم‌ها، مدرسه‌ها، کلاس‌ها و هنرجویان را انتخاب کنید؛ اطلاعات فعلی تغییر نکرده است.",
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
    const preview = pendingImport;
    const context = { id: preview.workspace, revision: preview.revision };
    const check = (write = false) => {
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
        "این فایل متعلق به نوبت فعلی نیست؛ همان سال و نوبت را باز کنید یا از پشتیبان کامل سیستم استفاده کنید.",
      );
    if (!document.getElementById("restoreExternalConfirmed").checked) {
      handleError(
        Error("ابتدا نسخه مستقل را ذخیره و وجود فایل را تأیید کنید."),
      );
      return;
    }
    if (workspace.closed)
      throw Error(
        "دوره بسته است؛ برای بازیابی در آن ابتدا دوره را بازگشایی کنید.",
      );
    if (!confirm("اطلاعات این دوره با نسخه پیش‌نمایش جایگزین شود؟")) return;
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    check(true);
    const candidate = normalizeDB(preview.candidate);
    candidate.settings.academicYear = workspace.year;
    candidate.settings.academicTerm = workspace.term;
    validateV24(candidate);
    try {
      await putBackup(db, "پیش از بازیابی");
    } catch (error) {
      setStatus(
        "پشتیبان داخلی جا نشد؛ نسخه مستقلِ تأییدشده مسیر بازیابی است.",
        "pending",
      );
    }
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
