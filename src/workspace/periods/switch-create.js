async function openPeriods({ notice = "" } = {}) {
  const ensureCurrent = preserveAsyncTarget(),
    sourceConnection = connection;
  await flushDrafts({ strict: true });
  await writer.catch(() => {});
  ensureCurrent();
  if (connection !== sourceConnection)
    throw Error("اتصال اطلاعات تغییر کرده است؛ ترم‌ها را دوباره باز کنید.");
  const context = captureWorkspaceContext(),
    year = workspace.year,
    all = (await allFrom("catalog")).filter((period) => period.year === year);
  assertWorkspaceContext(context);
  const reports = (await allFrom("reports")).filter(
    (r) => r.workspace === workspace.id,
  );
  assertWorkspaceContext(context);
  if (connection !== sourceConnection)
    throw Error("اتصال اطلاعات تغییر کرده است؛ ترم‌ها را دوباره باز کنید.");
  const entries = (kind) =>
      all.filter(
        (row) => (row.termKind || academicTermKind(row.term)) === kind,
      ),
    first = entries("first"),
    second = entries("second"),
    ambiguous = first.length > 1 || second.length > 1,
    unsupported = all.some(
      (row) =>
        !["first", "second"].includes(
          row.termKind || academicTermKind(row.term),
        ),
    ),
    periodRows = [
      { kind: "first", label: "ترم اول", rows: first },
      { kind: "second", label: "ترم دوم", rows: second },
    ]
      .map(({ kind, label, rows }) => {
        const period = rows.length === 1 ? rows[0] : null,
          canStart =
            kind === "second" &&
            !second.length &&
            first.length === 1 &&
            first[0].closed &&
            !ambiguous &&
            !unsupported;
        return (
          "<tr><td>" +
          label +
          "</td><td>" +
          (rows.length > 1
            ? "نیازمند بررسی اطلاعات قبلی"
            : period
              ? period.closed
                ? "بسته"
                : "در حال کار"
              : "شروع‌نشده") +
          '</td><td><div class="period-row-actions">' +
          (period
            ? '<button class="ghost" data-workspace-action="switch-period" data-key="' +
              esc(period.id) +
              '"' +
              (period.id === workspace.id
                ? ' disabled aria-current="true"'
                : "") +
              ">" +
              (period.id === workspace.id ? "ترم فعلی" : "ورود به " + label) +
              "</button>"
            : canStart
              ? '<button data-workspace-action="new-second-period" data-key="' +
                esc(first[0].id) +
                '">شروع ترم دوم</button>'
              : '<span class="muted">' +
                (kind === "second" &&
                !second.length &&
                !ambiguous &&
                !unsupported
                  ? "پس از بستن ترم اول"
                  : "—") +
                "</span>") +
          "</div></td></tr>"
        );
      })
      .join("");
  const activeKind = workspace.termKind || academicTermKind(workspace.term),
    activeLabel = { first: "ترم اول", second: "ترم دوم" }[activeKind],
    warning =
      ambiguous || unsupported
        ? '<p class="period-intro" role="alert">اطلاعات قدیمی این سال، ترم نامشخص یا ثبت تکراری دارد. هیچ اطلاعاتی حذف نشده است؛ پیش از شروع ترم دوم، اطلاعات معتبر را بازیابی کنید.</p>'
        : "";
  showModal(
    "سال تحصیلی و دو ترم",
    '<div class="period-hub"><p class="period-intro">سال تحصیلی: ' +
      esc(year) +
      '</p><p class="period-intro">مدرسه‌ها، کلاس‌ها، هنرجویان و درس‌ها در ترم اول و دوم مشترک‌اند؛ نمرات ترمی و جلسات جدا ثبت می‌شوند و نمرات پودمانی در کل سال ادامه دارند.</p>' +
      (notice
        ? '<p class="period-intro" role="status">' +
          esc(String(notice)) +
          "</p>"
        : "") +
      warning +
      '<section class="period-list"><h4>ترم اول و دوم</h4><table><thead><tr><th>ترم</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>' +
      periodRows +
      "</tbody></table></section>" +
      (activeLabel
        ? '<section class="period-management"><h4>' +
          activeLabel +
          '</h4><div class="row period-actions">' +
          (workspace.closed
            ? '<button data-workspace-action="reopen-period">بازگشایی ' +
              activeLabel +
              "</button>"
            : '<button data-workspace-action="finalize-period">بستن ' +
              activeLabel +
              " و ثبت کارنامه نهایی</button>") +
          "</div></section>"
        : "") +
      '<section class="period-reports"><h4>کارنامه‌های نهایی ' +
      (activeLabel || "ثبت‌شده") +
      "</h4>" +
      (reports.length
        ? ""
        : '<p class="period-intro">هنوز کارنامه نهایی برای این ترم ثبت نشده است.</p>') +
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
              (name === "undo" &&
                (entry.value.id === preview.id ||
                  entry.value.recoveredPeers?.some(
                    (peer) => peer.id === preview.id,
                  )))
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
      await switchPeriod(
        next.id,
        globalThis.__EDU_TEST_MODE__ ? legacyPeriodSwitchToken : null,
      );
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
const legacyPeriodSwitchToken = Symbol("legacy-period-fixture");
let periodSwitchBusy = false;
async function switchPeriod(id, permission = null) {
  if (periodSwitchBusy)
    throw Error("جابه‌جایی ترم در حال انجام است؛ صبر کنید.");
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
    const year = workspace.year,
      checkYear = (target) => {
        if (target.year !== year && permission !== legacyPeriodSwitchToken)
          throw Error(
            "این اطلاعات متعلق به سال تحصیلی فعال نیست؛ انتخاب و ایجاد سال‌های دیگر در برنامه وجود ندارد. سوابق قدیمی در پشتیبان کامل محفوظ‌اند.",
          );
      };
    let loaded = await readWorkspaceSnapshot(id);
    checkYear(loaded.period);
    const annual = globalThis.EduAnnualModules
      ? await synchronizeAnnualForRead(id)
      : null;
    if (annual) loaded = await readWorkspaceSnapshot(id);
    checkYear(loaded.period);
    if (!ready || resetBusy || connectionRetired)
      throw Error(
        "بانک هنگام جابه‌جایی تغییر کرد؛ صفحه را دوباره بارگذاری کنید.",
      );
    await assessmentContext.dispose({ abandon: true });
    // Authentication belongs to the installed workspace, never its predecessor.
    // Revoke it synchronously before publishing protected destination data.
    isAuthenticated = false;
    workspace = loaded.period;
    db = loaded.data;
    committed = loaded.records;
    await synchronizeYearNotesScope();
    blocked = false;
    storageBlocked = false;
    drafts.clear();
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
    for (const change of annual?.changed || [])
      broadcast({ ...change, annualModular: true });
    if (annual?.changed.length) scheduleSingleFile();
    if (annual?.conflicts.length)
      setStatus(
        "اطلاعات قدیمی این سال نیاز به بررسی دارد: " +
          annual.conflicts[0].message,
        "error",
      );
  } finally {
    periodLoading = false;
    periodSwitchBusy = false;
    lockControls();
  }
}

let secondTermDialog = null,
  secondTermDialogGeneration = 0;
async function openNewPeriod(firstId = "") {
  const generation = ++secondTermDialogGeneration,
    ensureCurrent = preserveAsyncTarget(),
    sourceConnection = connection;
  secondTermDialog = null;
  await flushDrafts({ strict: true });
  await writer.catch(() => {});
  ensureCurrent();
  const expected = captureWorkspaceContext(),
    rows = await allFrom("catalog");
  assertWorkspaceContext(expected);
  if (
    connection !== sourceConnection ||
    generation !== secondTermDialogGeneration
  )
    throw Error("اطلاعات تغییر کرده است؛ شروع ترم دوم را دوباره باز کنید.");
  const year = workspace.year,
    first = validateAcademicTransition(rows, year, "دوم");
  if (
    (firstId && first.id !== firstId) ||
    rows.some(
      (row) =>
        row.year === year &&
        !["first", "second"].includes(
          row.termKind || academicTermKind(row.term),
        ),
    )
  )
    throw Error(
      "ترم اول همین سال به‌طور یکتا مشخص نیست؛ اطلاعات قبلی را بررسی کنید.",
    );
  const opened = showModal(
    "شروع ترم دوم",
    '<div class="period-create" id="secondTermStart"><div class="record-editor-context"><h4>ترم دوم</h4><p>سال تحصیلی: ' +
      esc(year) +
      '</p></div><p>مدرسه‌ها، کلاس‌ها، هنرجویان و درس‌های ترم اول ادامه پیدا می‌کنند. نمرات ترمی و جلسات خالی شروع می‌شوند؛ نمرات پودمانی سال حفظ می‌شوند.</p><div class="row period-actions"><button data-workspace-action="create-period">شروع ترم دوم</button><button class="ghost" data-workspace-action="periods">انصراف</button></div></div>',
  );
  if (opened !== false)
    secondTermDialog = {
      ...expected,
      year,
      firstId: first.id,
      firstRevision: first.revision,
      connection: sourceConnection,
      node: document.getElementById("secondTermStart"),
    };
}

let newPeriodBusy = false;
async function createNewPeriod({ fromDialog = false } = {}) {
  if (!fromDialog && !globalThis.__EDU_TEST_MODE__)
    throw Error("ساخت سال تحصیلی دیگر در برنامه پشتیبانی نمی‌شود.");
  if (newPeriodBusy) throw Error("شروع نوبت در حال انجام است؛ صبر کنید.");
  newPeriodBusy = true;
  try {
    const ensureCurrent = preserveAsyncTarget(),
      dialog = fromDialog ? secondTermDialog : null,
      checkDialog = () => {
        if (!fromDialog) return;
        if (
          !dialog ||
          secondTermDialog !== dialog ||
          connection !== dialog.connection ||
          workspace.id !== dialog.id ||
          workspace.revision !== dialog.revision ||
          workspace.year !== dialog.year ||
          !dialog.node ||
          dialog.node.isConnected === false ||
          document.getElementById("modal")?.classList.contains("hidden") ||
          document.getElementById("secondTermStart") !== dialog.node
        )
          throw Error(
            "پنجرهٔ شروع نوبت دوم معتبر نیست؛ آن را دوباره باز کنید.",
          );
      };
    checkDialog();
    if (fileMode)
      throw Error(
        "این عملیات را در نسخه نصب‌شده برنامه یا نشانی HTTPS آن انجام دهید.",
      );
    const year = EduAcademicYear.normalize(
        fromDialog ? dialog.year : document.getElementById("periodYear").value,
      ),
      term = fromDialog ? "دوم" : document.getElementById("periodTerm").value;
    if (!["اول", "دوم"].includes(term))
      throw Error("نوبت انتخاب‌شده معتبر نیست.");
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    ensureCurrent();
    checkDialog();
    const context = captureWorkspaceContext();
    const existing = await allFrom("catalog");
    assertWorkspaceContext(context);
    checkDialog();
    const first = validateAcademicTransition(existing, year, term);
    if (
      fromDialog &&
      (first?.id !== dialog.firstId || first?.revision !== dialog.firstRevision)
    )
      throw Error(
        "نوبت اول تغییر کرده است؛ پنجرهٔ شروع نوبت دوم را دوباره باز کنید.",
      );
    let source = db,
      sourcePeriod = { id: context.id, revision: context.revision };
    if (first) {
      const snapshot = await readWorkspaceSnapshot(first.id);
      assertWorkspaceContext(context);
      checkDialog();
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
        checkDialog();
      }
      source = snapshot.data;
      sourcePeriod = {
        id: snapshot.period.id,
        revision: snapshot.period.revision,
      };
    }
    const next = clone(source);
    next.sessions = [];
    next.migrationWarnings = [];
    next.settings.academicYear = year;
    next.settings.academicTerm = term;
    for (const school of next.schools)
      for (const c of school.classes) {
        if (!first || first.year !== year) c.archivedStudents = [];
        const students = new Set(
          [...c.students, ...(c.archivedStudents || [])].map(
            (student) => student.id,
          ),
        );
        for (const l of c.lessons) {
          l.kardaneshScores = {};
          // A new term shares the exact annual definition. Descriptive
          // corrections must not reinitialize a historical grading policy.
          if (first?.year !== year) {
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
          }
          // Formal modules are annual; legacy unit grades remain term-scoped.
          for (const p of l.poudmans)
            p.podScores =
              first?.year === year && l.gradingPolicy?.method === "modular"
                ? Object.fromEntries(
                    Object.entries(p.podScores || {}).filter(([studentId]) =>
                      students.has(studentId),
                    ),
                  )
                : {};
          for (const p of l.poudmans)
            for (const u of p.units) u.unitScores = {};
        }
      }
    checkDialog();
    const created = await installWorkspace(normalizeDB(next), {
      year,
      term,
      requireSequence: true,
      firstRevision: first?.revision,
      source: sourcePeriod,
    });
    assertWorkspaceContext(context);
    if (fromDialog && secondTermDialog === dialog) secondTermDialog = null;
    await switchPeriod(created.id, fromDialog ? null : legacyPeriodSwitchToken);
  } finally {
    newPeriodBusy = false;
  }
}
