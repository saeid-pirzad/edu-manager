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
  showModal(
    "دوره‌های تحصیلی و کارنامه نهایی",
    '<div class="period-hub"><p class="period-intro">هر دوره، کلاس‌ها، نمرات و جلسات مستقل دارد. بستن دوره فقط پس از تکمیل همه نمرات انجام می‌شود و نسخه ثابت کارنامه نگه داشته می‌شود.</p><section class="period-list"><h4>دوره‌های تحصیلی</h4><table><thead><tr><th>سال / نوبت</th><th>وضعیت</th><th>انتخاب دوره</th></tr></thead><tbody>' +
      all
        .map(
          (w) =>
            "<tr><td>" +
            esc(w.year + " / " + w.term) +
            "</td><td>" +
            (w.closed ? "بسته" : "باز") +
            '</td><td><button class="ghost" data-workspace-action="switch-period" data-key="' +
            esc(w.id) +
            '">' +
            (w.id === workspace.id ? "دوره فعلی" : "بازکردن") +
            "</button></td></tr>",
        )
        .join("") +
      '</tbody></table></section><section class="period-management"><h4>مدیریت دوره فعال</h4><div class="row period-actions"><button data-workspace-action="new-period">دوره جدید با فهرست فعلی و بدون نمره</button>' +
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

function openNewPeriod() {
  showModal(
    "دوره تحصیلی جدید",
    '<div class="period-create"><label>سال تحصیلی <input id="periodYear" value="' +
      esc(currentYearLabel()) +
      '"></label><label>نوبت <select id="periodTerm"><option>اول</option><option>دوم</option><option>تابستان</option></select></label><p>فهرست دانش‌آموزان فعال، دروس و تنظیم برنامه کپی می‌شود. نمرات، جلسات و بایگانی دوره قبلی منتقل نمی‌شوند.</p><button data-workspace-action="create-period">ایجاد دوره مستقل</button></div>',
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
    if (!["اول", "دوم", "تابستان"].includes(term))
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
    if (existing.some((x) => x.year === year && x.term === term))
      throw Error("این سال و نوبت قبلاً ساخته شده است.");
    const next = clone(db);
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
    });
    assertWorkspaceContext(context);
    await switchPeriod(created.id);
  } finally {
    newPeriodBusy = false;
  }
}
