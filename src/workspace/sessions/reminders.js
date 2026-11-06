// A reminder is a review of the current timetable, not evidence of absence.
// Non-held decisions live in meta, never in the reportable session collection.
let attendanceReminderGeneration = 0,
  attendanceReminderDialog = null,
  attendanceReminderBusy = false;

function attendanceReminderOrigin() {
  const origin = {
    connection,
    installation: installationToken,
    workspaceId: workspace.id,
    data: db,
    view: state.view,
  };
  origin.assert = () => {
    assertWorkspaceReadable();
    if (
      connection !== origin.connection ||
      installationToken !== origin.installation ||
      workspace.id !== origin.workspaceId ||
      db !== origin.data ||
      state.view !== origin.view
    )
      throw Error(
        "اطلاعات یا صفحه تغییر کرده است؛ یادآورها را دوباره بررسی کنید.",
      );
  };
  return origin;
}

async function readAttendanceReminders({
  interactive = false,
  isCurrent = () => true,
} = {}) {
  assertWorkspaceReadable();
  const origin = attendanceReminderOrigin();
  const assertOrigin = origin.assert;
  origin.assert = () => {
    assertOrigin();
    if (!isCurrent())
      throw Error("صفحهٔ یادآورها تغییر کرده است؛ بررسی دوباره لازم است.");
  };
  if (interactive) await flushDrafts({ strict: true });
  // A rejected earlier write has already rolled back to durable data. Reading
  // must remain recoverable without requiring an unrelated successful edit.
  await writer.catch(() => {});
  origin.assert();
  const context = captureWorkspaceContext(),
    { periods, recordSets } = await readAnnualRecordSets(
      context,
      {},
      selectYearActivityPeriods,
    );
  origin.assert();
  const parts = periods.map((period, index) => ({
    period,
    data: decodeWorkspaceRecords(recordSets[index], { workspaceId: period.id })
      .data,
  }));
  for (const part of parts) {
    const password = part.data.settings.password;
    if (
      part.period.id !== workspace.id &&
      password &&
      !(isAuthenticated && password === db.settings.password)
    ) {
      if (!interactive)
        throw Error(
          "برای بررسی جلسات همهٔ سال، دسترسی به سوابق را تأیید کنید.",
        );
      const supplied = prompt("رمز دسترسی به سوابق ترم دیگر برای بررسی حضور:");
      if (supplied === null || !(await verifyPassword(supplied, password)))
        throw Error("دسترسی به سوابق تأیید نشد؛ یادآورها آماده نشدند.");
      origin.assert();
    }
  }
  const guarded = {
    ...context,
    yearScope: workspace.year,
    members: periods.map((period) => ({
      id: period.id,
      revision: period.revision,
    })),
  };
  await assertReportSnapshot(guarded);
  origin.assert();
  const model = EduAttendanceReminders.build(db, {
    year: workspace.year,
    today: todayISO(),
    workspaceId: workspace.id,
    parts,
  });
  model.notHeld = parts
    .flatMap((part) =>
      (part.data.notHeldSessions || []).map((marker) => {
        const school = db.schools.find((item) => item.id === marker.schoolId),
          classroom = school?.classes.find(
            (item) => item.id === marker.classId,
          ),
          lesson = classroom?.lessons.find(
            (item) => item.id === marker.lessonId,
          );
        return {
          ...marker,
          sourcePeriodId: part.period.id,
          active: part.period.id === workspace.id,
          closed: !!part.period.closed,
          schoolName: school?.name || "مدرسهٔ حذف‌شده",
          className: classroom?.name || "کلاس حذف‌شده",
          lessonName: lesson?.name || "درس حذف‌شده",
        };
      }),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);
  return { model, parts, context: guarded, origin, today: todayISO() };
}

async function assertAttendanceReminderSnapshot(snapshot) {
  snapshot.origin.assert();
  if (snapshot.today !== todayISO())
    throw Error("تاریخ روز عوض شده است؛ یادآورها را دوباره بررسی کنید.");
  await assertReportSnapshot(snapshot.context);
  snapshot.origin.assert();
}

async function refreshAttendanceReminders({ interactive = false } = {}) {
  const generation = ++attendanceReminderGeneration,
    region = document.getElementById("attendanceReminderRegion");
  if (!region || state.view !== "schools" || fileMode) return;
  const current = () =>
    region.isConnected &&
    generation === attendanceReminderGeneration &&
    state.view === "schools";
  try {
    // No day of a future academic year is past yet. Avoid unnecessary full
    // year reads, including requests from a render that has been replaced.
    if (EduAcademicYear.range(workspace.year).start >= todayISO()) {
      if (current()) region.innerHTML = "";
      return;
    }
    const snapshot = await readAttendanceReminders({
      interactive,
      isCurrent: current,
    });
    if (!current()) return;
    region.innerHTML = renderAttendanceReminders(snapshot.model);
    lockControls();
  } catch (error) {
    if (!current()) return;
    region.innerHTML =
      '<div class="attendance-reminder-notice"><span>' +
      esc(error.message) +
      '</span><button type="button" class="ghost" data-workspace-action="attendance-reminders-refresh">بررسی دوبارهٔ حضور</button></div>';
  }
}

async function openAttendanceRemindersList({ notHeld = false } = {}) {
  const previousModal = document.getElementById("modalBody").firstElementChild;
  const snapshot = await readAttendanceReminders({ interactive: true });
  if (document.getElementById("modalBody").firstElementChild !== previousModal)
    throw Error("پنجره تغییر کرده است؛ فهرست یادآورها را دوباره باز کنید.");
  if (
    showModal(
      notHeld ? "جلسات تشکیل‌نشده" : "حضورهای نیازمند بررسی",
      notHeld
        ? renderNotHeldRemindersHtml(snapshot.model.notHeld)
        : attendanceReminderListHtml(snapshot.model),
    ) === false
  )
    return false;
  attendanceReminderDialog = {
    snapshot,
    list: true,
    notHeld,
    root: document.getElementById("modalBody").firstElementChild,
  };
}

async function pageAttendanceReminders(button) {
  const dialog = currentAttendanceReminderDialog(),
    page = button.dataset.page;
  if (!dialog.list || !/^\d{1,4}$/.test(page))
    throw Error("صفحهٔ فهرست معتبر نیست.");
  await assertAttendanceReminderSnapshot(dialog.snapshot);
  if (currentAttendanceReminderDialog() !== dialog || !button.isConnected)
    throw Error("فهرست تغییر کرده است؛ دوباره آن را باز کنید.");
  if (
    showModal(
      dialog.notHeld ? "جلسات تشکیل‌نشده" : "حضورهای نیازمند بررسی",
      dialog.notHeld
        ? renderNotHeldRemindersHtml(
            dialog.snapshot.model.notHeld,
            Number(page),
          )
        : attendanceReminderListHtml(dialog.snapshot.model, Number(page)),
    ) === false
  )
    return false;
  attendanceReminderDialog = {
    ...dialog,
    root: document.getElementById("modalBody").firstElementChild,
  };
}

async function openAttendanceReminder(button) {
  const previousModal = document.getElementById("modalBody").firstElementChild,
    key = button.dataset.key,
    snapshot = await readAttendanceReminders({ interactive: true });
  if (
    !button.isConnected ||
    document.getElementById("modalBody").firstElementChild !== previousModal
  )
    throw Error("فهرست یادآورها تغییر کرد؛ مورد را دوباره انتخاب کنید.");
  const item = snapshot.model.items.find((row) => row.key === key);
  if (!item) {
    await refreshAttendanceReminders();
    throw Error("این یادآور دیگر نیاز به بررسی ندارد؛ فهرست به‌روز شد.");
  }
  if (
    showModal("بررسی حضور جلسه", attendanceReminderDialogHtml(item)) === false
  )
    return false;
  attendanceReminderDialog = {
    snapshot,
    item,
    root: document.getElementById("modalBody").firstElementChild,
  };
}

function currentAttendanceReminderDialog() {
  const dialog = attendanceReminderDialog;
  if (
    !dialog?.root?.isConnected ||
    document.getElementById("modal").classList.contains("hidden")
  )
    throw Error("پنجرهٔ بررسی تغییر کرده است؛ یادآور را دوباره باز کنید.");
  dialog.snapshot.origin.assert();
  return dialog;
}

async function markAttendanceReminderNotHeld() {
  if (attendanceReminderBusy) return false;
  attendanceReminderBusy = true;
  try {
    const dialog = currentAttendanceReminderDialog();
    assertEntityWritable();
    if (dialog.item?.kind !== "missing")
      throw Error(
        "جلسهٔ دارای اطلاعات را نمی‌توان تشکیل‌نشده علامت زد؛ حضور آن را تکمیل کنید.",
      );
    await assertAttendanceReminderSnapshot(dialog.snapshot);
    if (currentAttendanceReminderDialog() !== dialog)
      throw Error("پنجرهٔ بررسی تغییر کرده است؛ دوباره تلاش کنید.");
    assertEntityWritable();
    const item = dialog.item;
    db.notHeldSessions = [
      ...(db.notHeldSessions || []),
      {
        id: uid(),
        schoolId: item.schoolId,
        classId: item.classId,
        lessonId: item.lessonId,
        date: item.date,
        period: item.period,
        recordedAt: new Date().toISOString(),
      },
    ];
    await saveDBV24({ action: "ثبت تشکیل‌نشدن جلسه" });
    if (dialog.root.isConnected && attendanceReminderDialog === dialog) {
      attendanceReminderDialog = null;
      closeModal();
      await refreshAttendanceReminders();
    }
    return true;
  } finally {
    attendanceReminderBusy = false;
  }
}

async function recordAttendanceReminder(button) {
  if (attendanceReminderBusy) return false;
  attendanceReminderBusy = true;
  try {
    const dialog = currentAttendanceReminderDialog();
    await assertAttendanceReminderSnapshot(dialog.snapshot);
    if (currentAttendanceReminderDialog() !== dialog)
      throw Error("پنجرهٔ بررسی تغییر کرده است؛ دوباره تلاش کنید.");
    const item = dialog.item;
    if (!item) throw Error("جلسه را از فهرست یادآورها انتخاب کنید.");
    if (item.kind !== "missing") {
      const target =
        item.kind === "conflict"
          ? item.sessions.find(
              (row) =>
                row.sessionId === button.dataset.session &&
                row.sourcePeriodId === button.dataset.workspace,
            )
          : item;
      if (!target) throw Error("جلسهٔ انتخاب‌شده معتبر نیست.");
      return await openYearSession(target.sourcePeriodId, target.sessionId);
    }
    assertEntityWritable();
    return await openScheduledSessionV24(item, () => {
      try {
        return (
          currentAttendanceReminderDialog() === dialog && item.date < todayISO()
        );
      } catch {
        return false;
      }
    });
  } finally {
    attendanceReminderBusy = false;
  }
}

async function restoreAttendanceReminder(button) {
  if (attendanceReminderBusy) return false;
  attendanceReminderBusy = true;
  try {
    const dialog = currentAttendanceReminderDialog();
    await assertAttendanceReminderSnapshot(dialog.snapshot);
    if (currentAttendanceReminderDialog() !== dialog || !button.isConnected)
      throw Error("فهرست جلسات تغییر کرد؛ دوباره آن را باز کنید.");
    const marker = dialog.snapshot.model.notHeld.find(
      (item) =>
        item.id === button.dataset.key &&
        item.sourcePeriodId === button.dataset.workspace,
    );
    if (!marker) throw Error("این مورد دیگر در فهرست نیست.");
    if (marker.sourcePeriodId !== workspace.id) {
      // The read above explicitly authorized every part. switchPeriod clears
      // login state; re-authorize only this exact, unchanged destination.
      const target = dialog.snapshot.parts.find(
        (part) => part.period.id === marker.sourcePeriodId,
      );
      if (!target) throw Error("سوابق این جلسه در دسترس نیست.");
      await switchPeriod(marker.sourcePeriodId);
      if (
        workspace.id !== marker.sourcePeriodId ||
        workspace.year !== target.period.year ||
        connection !== dialog.snapshot.origin.connection ||
        installationToken !== dialog.snapshot.origin.installation ||
        db.settings.password !== target.data.settings.password ||
        resetBusy ||
        periodLoading ||
        connectionRetired
      )
        throw Error("اطلاعات یا دسترسی مقصد تغییر کرده است؛ دوباره وارد شوید.");
      isAuthenticated = true;
      render();
      return await openAttendanceRemindersList({ notHeld: true });
    }
    assertEntityWritable();
    db.notHeldSessions = (db.notHeldSessions || []).filter(
      (item) => item.id !== marker.id,
    );
    await saveDBV24({ action: "بازگرداندن یادآور جلسه" });
    if (dialog.root.isConnected && attendanceReminderDialog === dialog) {
      await refreshAttendanceReminders();
      await openAttendanceRemindersList({ notHeld: true });
    }
    return true;
  } finally {
    attendanceReminderBusy = false;
  }
}
