async function openPeriods() {
  const ensureCurrent = preserveAsyncTarget();
  await flushDrafts({ strict: true });
  ensureCurrent();
  const all = (await allFrom("catalog")).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  ensureCurrent();
  const reports = (await allFrom("reports")).filter(
    (r) => r.workspace === workspace.id,
  );
  ensureCurrent();
  const periodRows = all
    .map(
      (w) =>
        "<tr><td>" +
        esc(w.year + " / " + w.term) +
        "</td><td>" +
        (w.closed ? "بسته" : "در حال کار") +
        '</td><td><div class="period-row-actions"><button class="ghost" data-workspace-action="switch-period" data-key="' +
        esc(w.id) +
        '">' +
        (w.id === workspace.id ? "نوبت فعلی" : "بازکردن") +
        "</button>" +
        ((w.termKind || academicTermKind(w.term)) === "first" &&
        w.closed &&
        !all.some(
          (row) =>
            row.year === w.year &&
            (row.termKind || academicTermKind(row.term)) === "second",
        )
          ? '<button data-workspace-action="new-second-period" data-key="' +
            esc(w.id) +
            '">شروع نوبت دوم</button>'
          : "") +
        '<button type="button" class="ghost danger period-delete-button" aria-label="' +
        esc("حذف نوبت " + w.year + " / " + w.term) +
        '" data-workspace-action="delete-period" data-key="' +
        esc(w.id) +
        '"><span aria-hidden="true">' +
        EduIcons.html("trash") +
        "</span><span>حذف نوبت</span></button></div></td></tr>",
    )
    .join("");
  showModal(
    "نوبت‌های تحصیلی و کارنامه نهایی",
    '<div class="period-hub"><p class="period-intro">هر سال تحصیلی دو نوبت دارد. پس از بستن نوبت اول، نوبت دوم با همان کلاس‌ها و هنرجویان و بدون نمره‌های قبلی شروع می‌شود. پشتیبان‌گیری جدا از این روند است.</p><section class="period-list"><h4>نوبت‌های تحصیلی</h4><table><thead><tr><th>سال / نوبت</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>' +
      periodRows +
      '</tbody></table></section><section class="period-management"><h4>مدیریت نوبت فعلی</h4><div class="row period-actions"><button data-workspace-action="new-period">شروع سال تحصیلی / نوبت جدید</button>' +
      (workspace.closed
        ? '<button data-workspace-action="reopen-period">بازگشایی با ثبت در تاریخچه</button>'
        : '<button data-workspace-action="finalize-period">بستن دوره و ثبت کارنامه نهایی</button><button class="ghost" data-workspace-action="edit-period-label">اصلاح عنوان دوره</button>') +
      '</div></section><section class="period-reports"><h4>کارنامه‌های نهایی ثبت‌شده</h4>' +
      (reports.length
        ? ""
        : '<p class="period-intro">هنوز کارنامه نهایی برای این دوره ثبت نشده است.</p>') +
      reports
        .map(
          (r) =>
            '<div class="row period-report-row"><span>کارنامه ثابت ' +
            esc(new Date(r.at).toLocaleString("fa-IR")) +
            '</span><button class="ghost" data-workspace-action="frozen-report" data-key="' +
            esc(r.id) +
            '">مشاهده / چاپ</button></div>',
        )
        .join("") +
      '</section><p id="operationError" role="alert"></p></div>',
  );
}

let pendingPeriodDeletion = null,
  periodDeletionBusy = false;

function assertPeriodDeletable(rows, id) {
  const target = rows.find((row) => row.id === id);
  if (!target)
    throw Error("این نوبت دیگر وجود ندارد؛ فهرست را دوباره باز کنید.");
  if (rows.length <= 1)
    throw Error(
      "تنها نوبت سیستم قابل حذف نیست. برای شروع دوباره از پاک‌سازی اطلاعات سیستم استفاده کنید.",
    );
  if (
    (target.termKind || academicTermKind(target.term)) === "first" &&
    rows.some(
      (row) =>
        row.year === target.year &&
        (row.termKind || academicTermKind(row.term)) === "second",
    )
  )
    throw Error(
      "نوبت اول مبنای نوبت دوم همین سال است. ابتدا نوبت دوم را حذف کنید؛ حذف هر نوبت، گزارش سالانهٔ آن سال را ناقص می‌کند.",
    );
  return target;
}

async function openDeletePeriod(id) {
  if (periodDeletionBusy) throw Error("حذف نوبت در حال انجام است؛ صبر کنید.");
  const check = preserveAsyncTarget();
  await flushDrafts({ strict: true });
  check();
  const rows = await allFrom("catalog");
  check();
  let target;
  try {
    target = assertPeriodDeletable(rows, id, workspace.id);
  } catch (error) {
    pendingPeriodDeletion = null;
    showModal(
      "حذف نوبت تحصیلی",
      '<div class="full-restore period-delete"><section class="full-restore-warning"><h4>این نوبت فعلاً قابل حذف نیست</h4><p>' +
        esc(error.message) +
        '</p></section><button type="button" class="ghost" data-workspace-action="periods">بازگشت به نوبت‌ها</button></div>',
    );
    return;
  }
  const snapshot = await readWorkspaceSnapshot(id);
  check();
  if (target.revision !== snapshot.period.revision)
    throw Error("اطلاعات نوبت تغییر کرده است؛ دوباره تلاش کنید.");
  const data = snapshot.data;
  const classes = data.schools.flatMap((school) => school.classes);
  const students = classes.reduce(
    (sum, classroom) => sum + classroom.students.length,
    0,
  );
  const title = target.year + " / " + target.term;
  const opened = showModal(
    "حذف نوبت تحصیلی",
    '<div class="full-restore period-delete"><section class="period-delete-identity"><span>نوبت انتخاب‌شده برای حذف</span><h4>' +
      esc(title) +
      '</h4></section><div class="period-delete-stats"><div><strong>' +
      classes.length.toLocaleString("fa-IR") +
      "</strong><span>کلاس</span></div><div><strong>" +
      students.toLocaleString("fa-IR") +
      "</strong><span>هنرجو</span></div><div><strong>" +
      data.sessions.length.toLocaleString("fa-IR") +
      '</strong><span>جلسه</span></div></div><section class="full-restore-warning"><h4>چه چیزی حذف می‌شود؟</h4><p>اطلاعات این نوبت شامل فهرست‌ها، نمرات، حضور و غیاب، کارنامه‌ها و پیش‌نویس‌ها حذف می‌شود. اطلاعات سایر نوبت‌ها تغییر نمی‌کند.</p><p>گزارش سالانهٔ این سال ممکن است ناقص یا غیرقابل تهیه شود.</p></section>' +
      (id === workspace.id
        ? '<p class="period-delete-transition">این نوبت فعال است؛ پس از حذف، برنامه به یکی از نوبت‌های باقی‌مانده می‌رود.</p>'
        : "") +
      '<p class="full-restore-safety">پیش از حذف، نسخهٔ ایمنی ذخیره می‌شود. پشتیبان‌های قبلی باقی می‌مانند.</p>' +
      (data.settings.password
        ? '<label class="period-delete-password" for="periodDeletionPassword">رمز این نوبت<input type="password" id="periodDeletionPassword" autocomplete="current-password" placeholder="رمز نوبت انتخاب‌شده"></label>'
        : "") +
      '<label class="full-restore-confirm"><input type="checkbox" id="periodDeletionConfirmed"><span>حذف نوبت بالا و اطلاعات وابستهٔ آن را تأیید می‌کنم.</span></label><p id="operationError" role="alert"></p><div class="full-restore-actions"><button type="button" class="danger" data-workspace-action="confirm-delete-period">حذف نوبت انتخاب‌شده</button><button type="button" class="ghost" data-workspace-action="periods">انصراف</button></div></div>',
  );
  if (opened !== false)
    pendingPeriodDeletion = {
      id,
      revision: target.revision,
      origin: workspace.id,
      title,
    };
}

async function confirmDeletePeriod() {
  if (periodDeletionBusy) throw Error("حذف نوبت در حال انجام است؛ صبر کنید.");
  const preview = pendingPeriodDeletion;
  if (!preview || !document.getElementById("periodDeletionConfirmed")?.checked)
    throw Error("ابتدا هشدارها را بخوانید و حذف همین نوبت را تأیید کنید.");
  let ownsLoading = false,
    deleted = false;
  const check = () => {
    if (!ownsLoading) assertWorkspaceReadable();
    else if (!ready || blocked || connectionRetired)
      throw Error("اتصال برنامه تغییر کرده است؛ حذف انجام نشد.");
    if (
      fullRestoreBusy ||
      resetBusy ||
      (periodLoading && !ownsLoading) ||
      pendingPeriodDeletion !== preview ||
      workspace.id !== preview.origin
    )
      throw Error(
        "وضعیت برنامه تغییر کرده است؛ پنجرهٔ حذف را دوباره باز کنید.",
      );
  };
  check();
  periodDeletionBusy = true;
  try {
    const target = await readWorkspaceSnapshot(preview.id);
    check();
    if (target.period.revision !== preview.revision)
      throw Error(
        "اطلاعات نوبت تغییر کرده است؛ پنجرهٔ حذف را دوباره باز کنید.",
      );
    if (target.data.settings.password) {
      const password = document.getElementById("periodDeletionPassword")?.value;
      if (!password)
        throw Error("رمز نوبت انتخاب‌شده را وارد کنید؛ حذف انجام نشده است.");
      if (!(await verifyPassword(password, target.data.settings.password)))
        throw Error("رمز نوبت درست نیست؛ حذف انجام نشد.");
      check();
    }
    if (
      !confirm(
        "نوبت «" +
          preview.title +
          "» و تمام اطلاعات وابستهٔ آن حذف شود؟ اطلاعات سایر نوبت‌ها باقی می‌ماند.",
      )
    )
      return;
    const safety = await snapshotInstallation();
    check();
    const remaining = safety.stores.catalog.filter(
      (row) => row.id !== preview.id,
    );
    const next =
      remaining.find(
        (row) =>
          row.year === target.period.year &&
          (row.termKind || academicTermKind(row.term)) === "first",
      ) || remaining[0];
    if (!next) throw Error("تنها نوبت سیستم قابل حذف نیست.");
    periodLoading = true;
    ownsLoading = true;
    lockControls();
    const names = [...backupStores, "drafts"];
    const tx = connection.transaction(names, "readwrite"),
      done = transactionDone(tx);
    let failure;
    const request = tx.objectStore("catalog").getAll();
    request.onsuccess = () => {
      try {
        check();
        const row = assertPeriodDeletable(
          request.result,
          preview.id,
          workspace.id,
        );
        if (
          row.revision !== preview.revision ||
          restoreCatalogSignature(request.result) !==
            restoreCatalogSignature(safety.stores.catalog)
        )
          throw Error(
            "اطلاعات در پنجرهٔ دیگری تغییر کرده است؛ حذف انجام نشد. دوباره تلاش کنید.",
          );
        tx.objectStore("backups").put({
          id: "before-period-delete-" + uid(),
          workspace: null,
          at: new Date().toISOString(),
          label: "پیش از حذف نوبت " + preview.title,
          full: safety,
        });
        tx.objectStore("catalog").delete(preview.id);
        for (const name of names.filter((name) => name !== "catalog")) {
          const cursor = tx.objectStore(name).openCursor();
          cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry) return;
            if (
              entry.value.workspace === preview.id ||
              (name === "undo" && entry.value.id === preview.id)
            ) {
              if (name === "backups")
                entry.update({
                  ...entry.value,
                  workspace: null,
                  deletedPeriod: preview.title,
                });
              else entry.delete();
            }
            entry.continue();
          };
        }
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    try {
      await done;
    } catch (error) {
      throw failure || error;
    }
    pendingPeriodDeletion = null;
    deleted = true;
    // Other tabs must not write their now-deleted workspace back into the catalog.
    broadcast({ type: "period-deleted", workspace: preview.id });
    try {
      localStorage.removeItem("EduManager.periodicDrafts." + preview.id);
      for (const key of Object.keys(localStorage))
        if (key.startsWith("Edu24.drafts." + preview.id + "."))
          localStorage.removeItem(key);
    } catch {}
    if (workspace.id === preview.id) {
      clearTimeout(draftTimer);
      drafts.clear();
      draftGeneration++;
      await switchPeriod(next.id);
    }
    periodLoading = false;
    ownsLoading = false;
    scheduleSingleFile();
    setStatus(
      "نوبت " +
        preview.title +
        " حذف شد؛ پشتیبان ایمنی در بخش پشتیبان و بازیابی محفوظ است.",
      "saved",
    );
    await openPeriods();
  } catch (error) {
    if (deleted && workspace.id === preview.id) {
      ready = false;
      blocked = true;
      resetScreen(
        "نوبت حذف شد و پشتیبان ایمنی محفوظ است؛ برای ورود به نوبت باقی‌مانده، برنامه را دوباره بارگذاری کنید.",
      );
    }
    throw error;
  } finally {
    if (ownsLoading) periodLoading = false;
    periodDeletionBusy = false;
    lockControls();
  }
}

function hydrateReportNotes(period) {
  if (
    !period.reportNotesRecovery ||
    !Object.keys(period.reportNotesRecovery).length
  )
    return true;
  const saved = window.EduPeriodicReports?.restoreDrafts(
    period.id,
    period.reportNotesRecovery,
  );
  if (saved === false)
    setStatus(
      "اطلاعات خوانده شد؛ توضیحات بازیابی‌شده در بانک داخلی محفوظ است. ذخیره توضیحات را از صفحه گزارش دوباره امتحان کنید.",
      "error",
    );
  return saved !== false;
}
let periodSwitchBusy = false;
async function switchPeriod(id) {
  if (periodSwitchBusy)
    throw Error("جابه‌جایی دوره در حال انجام است؛ صبر کنید.");
  periodSwitchBusy = true;
  try {
    if (id === workspace.id) {
      closeModal();
      return;
    }
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    periodLoading = true;
    lockControls();
    const loaded = await readWorkspaceSnapshot(id);
    if (!ready || resetBusy || connectionRetired)
      throw Error(
        "بانک هنگام جابه‌جایی تغییر کرد؛ صفحه را دوباره بارگذاری کنید.",
      );
    workspace = loaded.period;
    db = loaded.data;
    committed = loaded.records;
    blocked = false;
    storageBlocked = false;
    drafts.clear();
    isAuthenticated = false;
    state = {
      view: "schools",
      schoolId: null,
      classId: null,
      lessonId: null,
      tab: "students",
      reportTab: "comprehensive",
    };
    rememberPeriod(id);
    hydrateReportNotes(workspace);
    await loadDrafts();
    periodLoading = false;
    closeModal();
    render();
    await recoverDrafts();
  } finally {
    periodLoading = false;
    periodSwitchBusy = false;
    lockControls();
  }
}

async function openNewPeriod(firstId = "") {
  const expected = captureWorkspaceContext(),
    rows = await allFrom("catalog");
  assertWorkspaceContext(expected);
  const first = firstId
    ? rows.find((row) => row.id === firstId)
    : rows.find(
        (row) =>
          row.year === workspace.year &&
          (row.termKind || academicTermKind(row.term)) === "first" &&
          row.closed &&
          !rows.some(
            (other) =>
              other.year === row.year &&
              (other.termKind || academicTermKind(other.term)) === "second",
          ),
      );
  if (
    firstId &&
    (!first ||
      !first.closed ||
      (first.termKind || academicTermKind(first.term)) !== "first")
  )
    throw Error("ابتدا نوبت اول را ببندید.");
  const nextYear =
    workspace.closed &&
    (workspace.termKind || academicTermKind(workspace.term)) === "second"
      ? Number(workspace.year.slice(0, 4)) +
        1 +
        "-" +
        (Number(workspace.year.slice(5)) + 1)
      : currentYearLabel();
  showModal(
    "شروع نوبت تحصیلی",
    '<div class="period-create"><label>سال تحصیلی <input id="periodYear" value="' +
      esc(first?.year || nextYear) +
      '"></label><label>نوبت <select id="periodTerm"><option' +
      (!first ? " selected" : "") +
      ">اول</option><option" +
      (first ? " selected" : "") +
      '>دوم</option></select></label><p>نوبت دوم فقط پس از بسته‌شدن نوبت اول همان سال شروع می‌شود. کلاس‌ها، هنرجویان و درس‌ها ادامه پیدا می‌کنند؛ نمرات و جلسات هر نوبت جدا می‌مانند.</p><button data-workspace-action="create-period">شروع نوبت</button></div>',
  );
}

let newPeriodBusy = false;
async function createNewPeriod() {
  if (newPeriodBusy) throw Error("ساخت دوره در حال انجام است؛ صبر کنید.");
  newPeriodBusy = true;
  try {
    const ensureCurrent = preserveAsyncTarget();
    if (fileMode)
      throw Error(
        "این عملیات را در نسخه نصب‌شده برنامه یا نشانی HTTPS آن انجام دهید.",
      );
    const year = asciiDigits(document.getElementById("periodYear").value),
      term = document.getElementById("periodTerm").value;
    if (!["اول", "دوم"].includes(term))
      throw Error("نوبت انتخاب‌شده معتبر نیست.");
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    ensureCurrent();
    const context = captureWorkspaceContext();
    if (
      !/^\d{4}-\d{4}$/.test(year) ||
      Number(year.slice(5)) - Number(year.slice(0, 4)) !== 1
    )
      throw Error("سال را مانند 1405-1406 وارد کنید.");
    const existing = await allFrom("catalog");
    assertWorkspaceContext(context);
    const first = validateAcademicTransition(existing, year, term);
    let source = db;
    if (first) {
      const snapshot = await readWorkspaceSnapshot(first.id);
      assertWorkspaceContext(context);
      if (
        snapshot.period.revision !== first.revision ||
        !snapshot.period.closed
      )
        throw Error("نوبت اول تغییر کرده است؛ فرم را دوباره باز کنید.");
      if (first.id !== workspace.id && snapshot.data.settings.password) {
        const supplied = prompt("رمز نوبت اول برای شروع نوبت دوم:");
        if (
          supplied === null ||
          !(await verifyPassword(supplied, snapshot.data.settings.password))
        )
          throw Error("دسترسی به نوبت اول تأیید نشد.");
        assertWorkspaceContext(context);
      }
      source = snapshot.data;
    }
    const next = clone(source);
    next.sessions = [];
    next.migrationWarnings = [];
    next.settings.academicYear = year;
    next.settings.academicTerm = term;
    for (const school of next.schools)
      for (const c of school.classes) {
        c.archivedStudents = [];
        for (const l of c.lessons) {
          l.kardaneshScores = {};
          const info = EduPolicy.identity(l, year);
          if (l.gradingPolicy) {
            const changedYear = l.gradingPolicy.year !== year;
            const changedIdentity = Object.entries(info).some(
              ([key, value]) => l.gradingPolicy[key] !== value,
            );
            Object.assign(l.gradingPolicy, info);
            if (changedYear || changedIdentity) {
              l.gradingPolicy.confirmed = false;
              l.gradingPolicy.revision = 1;
            }
            if (changedYear) {
              l.gradingPolicy.circularNumber = "";
              l.gradingPolicy.circularDate = "";
              l.gradingPolicy.reference = "";
            }
          }
          if (l.courseInfo || l.gradingPolicy) l.courseInfo = info;
          for (const p of l.poudmans) p.podScores = {};
          for (const p of l.poudmans)
            for (const u of p.units) u.unitScores = {};
        }
      }
    const created = await installWorkspace(normalizeDB(next), {
      year,
      term,
      requireSequence: true,
      firstRevision: first?.revision,
    });
    assertWorkspaceContext(context);
    await switchPeriod(created.id);
  } finally {
    newPeriodBusy = false;
  }
}
