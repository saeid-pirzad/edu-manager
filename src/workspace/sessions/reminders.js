// A reminder is a review of the current timetable, not evidence of absence.
// Non-held decisions live in meta, never in the reportable session collection.
let attendanceReminderGeneration = 0,
  attendanceReminderDialog = null,
  attendanceReminderBusy = false,
  attendanceReminderClockInstalled = false,
  attendanceReminderClockDate = null;

function checkAttendanceReminderDay() {
  if (
    document.visibilityState !== "visible" ||
    !ready ||
    busy ||
    drafts.size ||
    assessmentContext.hasDrafts() ||
    state.view !== "schools" ||
    !document.getElementById("attendanceReminderRegion")?.isConnected ||
    document.getElementById("modal")?.classList.contains("hidden") === false
  )
    return;
  try {
    assertWorkspaceReadable();
  } catch {
    return;
  }
  if (attendanceReminderClockDate !== todayISO())
    return refreshAttendanceReminders();
}

function installAttendanceReminderClock() {
  if (attendanceReminderClockInstalled) return;
  attendanceReminderClockInstalled = true;
  attendanceReminderClockDate ??= todayISO();
  // This cheap local-day check does not scan records on an unchanged day.
  // Browsers may throttle timers; focus and visibility also catch up on return.
  setInterval(checkAttendanceReminderDay, 60_000);
  window.addEventListener("focus", checkAttendanceReminderDay);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible")
      void refreshAttendanceReminders();
  });
}

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
  attendanceReminderClockDate = todayISO();
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
  return showAttendanceReminderFromSnapshot(snapshot, item);
}

function showAttendanceReminderFromSnapshot(snapshot, item) {
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

function assertEmptyAttendanceReminderTarget(dialog) {
  const item = dialog.item,
    session = db.sessions.find((row) => row.id === item?.sessionId);
  if (
    item?.kind !== "empty" ||
    item.sourcePeriodId !== workspace.id ||
    !EduAttendanceReminders.isEmptySession(session) ||
    session.date !== item.date ||
    session.period !== item.period ||
    session.schoolId !== item.schoolId ||
    session.classId !== item.classId ||
    session.lessonId !== item.lessonId ||
    item.date >= todayISO()
  )
    throw Error(
      "جلسه دیگر کاملاً خالی نیست یا مشخصات آن تغییر کرده است؛ اطلاعاتی حذف نشد. یادآور را دوباره بررسی کنید.",
    );
  const physicalSessions = dialog.snapshot.parts.flatMap((part) =>
    (part.period.id === workspace.id ? db : part.data).sessions.filter(
      (row) => row.date === item.date && row.period === item.period,
    ),
  );
  if (physicalSessions.length !== 1)
    throw Error(
      "برای این تاریخ و زنگ، جلسهٔ دیگری وجود دارد؛ ابتدا تداخل جلسات را بررسی کنید.",
    );
  return session;
}

async function openEmptyReminderOwner(dialog) {
  const item = dialog.item,
    target = dialog.snapshot.parts.find(
      (part) => part.period.id === item.sourcePeriodId,
    );
  if (!target)
    throw Error("سوابق این جلسه در دسترس نیست؛ یادآورها را دوباره باز کنید.");
  // The interactive year read already verified this exact owner's password.
  // Switch for a fresh review; never write to another term using an old dialog.
  await switchPeriod(item.sourcePeriodId);
  if (
    workspace.id !== target.period.id ||
    workspace.year !== target.period.year ||
    workspace.revision !== target.period.revision ||
    !!workspace.closed !== !!target.period.closed ||
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
  const previousModal = document.getElementById("modalBody").firstElementChild,
    snapshot = await readAttendanceReminders({ interactive: true });
  if (document.getElementById("modalBody").firstElementChild !== previousModal)
    throw Error("پنجره تغییر کرده است؛ جلسه را دوباره از فهرست انتخاب کنید.");
  const live = snapshot.model.items.find(
    (row) =>
      row.key === item.key &&
      row.sessionId === item.sessionId &&
      row.sourcePeriodId === target.period.id &&
      row.kind === "empty",
  );
  if (!live)
    throw Error(
      "وضعیت این جلسه تغییر کرده است؛ یادآورها را دوباره بررسی کنید.",
    );
  return showAttendanceReminderFromSnapshot(snapshot, live);
}

async function markAttendanceReminderNotHeld() {
  if (attendanceReminderBusy) return false;
  attendanceReminderBusy = true;
  try {
    const dialog = currentAttendanceReminderDialog();
    if (!["missing", "empty"].includes(dialog.item?.kind))
      throw Error(
        "جلسهٔ دارای اطلاعات را نمی‌توان تشکیل‌نشده علامت زد؛ حضور آن را تکمیل کنید.",
      );
    await assertAttendanceReminderSnapshot(dialog.snapshot);
    if (currentAttendanceReminderDialog() !== dialog)
      throw Error("پنجرهٔ بررسی تغییر کرده است؛ دوباره تلاش کنید.");
    const item = dialog.item;
    if (item.kind === "empty" && item.sourcePeriodId !== workspace.id)
      return await openEmptyReminderOwner(dialog);
    assertEntityWritable();
    let empty = null;
    if (item.kind === "empty") {
      empty = assertEmptyAttendanceReminderTarget(dialog);
      if (
        !confirm(
          "این جلسه فقط باز شده و هیچ حضور، نمره یا فعالیتی در آن ثبت نشده است. فقط همین رکورد خالی حذف و وضعیت «برگزار نشده» ذخیره شود؟ هیچ غیبتی برای هنرجویان ثبت نمی‌شود.",
        )
      )
        return false;
      await flushDrafts({ strict: true });
      await writer.catch(() => {});
      await assertAttendanceReminderSnapshot(dialog.snapshot);
      if (currentAttendanceReminderDialog() !== dialog)
        throw Error("پنجرهٔ بررسی تغییر کرده است؛ دوباره تلاش کنید.");
      assertEntityWritable();
      if (assertEmptyAttendanceReminderTarget(dialog) !== empty)
        throw Error(
          "رکورد جلسه هنگام تأیید تغییر کرده است؛ اطلاعاتی حذف نشد. دوباره بررسی کنید.",
        );
    }
    const matchesMarker = (marker) =>
      marker.date === item.date &&
      marker.period === item.period &&
      marker.schoolId === item.schoolId &&
      marker.classId === item.classId &&
      marker.lessonId === item.lessonId;
    const alreadyMarked = dialog.snapshot.parts.some((part) =>
      (
        (part.period.id === workspace.id ? db : part.data).notHeldSessions || []
      ).some(matchesMarker),
    );
    const previousData = db,
      previousWorkspace = workspace,
      previousRevision = workspace.revision,
      previousSessions = db.sessions,
      hadPreviousMarkers = Object.hasOwn(db, "notHeldSessions"),
      previousMarkers = db.notHeldSessions;
    // One full replacement plan commits removal and marker together. A scoped
    // session-only save would leave the old empty record in IndexedDB.
    if (empty) db.sessions = db.sessions.filter((row) => row !== empty);
    if (!alreadyMarked)
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
    const plannedSessions = db.sessions,
      plannedMarkers = db.notHeldSessions,
      sessionEntries = [...plannedSessions],
      markerEntries = [...(plannedMarkers || [])],
      unchangedEntries = (rows, entries) =>
        (rows || []).length === entries.length &&
        (rows || []).every((row, index) => row === entries[index]);
    try {
      await saveDBV24({ action: "ثبت تشکیل‌نشدن جلسه" });
    } catch (error) {
      // A failed durable re-read must not leave an uncommitted deletion in
      // memory. Never overwrite a successful reload, a published commit or
      // later changes while recovering only this operation's array swaps.
      if (
        empty &&
        db === previousData &&
        workspace === previousWorkspace &&
        workspace.revision === previousRevision &&
        workspace.id === item.sourcePeriodId &&
        connection === dialog.snapshot.origin.connection &&
        installationToken === dialog.snapshot.origin.installation &&
        db.sessions === plannedSessions &&
        db.notHeldSessions === plannedMarkers &&
        unchangedEntries(plannedSessions, sessionEntries) &&
        unchangedEntries(plannedMarkers, markerEntries)
      ) {
        db.sessions = previousSessions;
        if (hadPreviousMarkers) db.notHeldSessions = previousMarkers;
        else delete db.notHeldSessions;
        attendanceReminderDialog = null;
        try {
          render();
        } catch {
          // Keep the original save error even if repainting also fails.
        }
      }
      throw error;
    }
    if (empty && currentSessionId === empty.id) currentSessionId = null;
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
