function openReportScope(schoolId = "", classId = "", tab = "daily") {
  window.EduPeriodicReports?.selectScope(schoolId, classId);
  globalFilter = {
    ...globalFilter,
    date: "",
    schoolId,
    classId,
    lessonId: "",
    studentId: "",
    period: "",
  };
  lessonReportFilter = { schoolId, classId, lessonId: "" };
  karnamehFilter = { schoolId, classId, studentId: "" };
  state.view = "reports";
  state.reportTab = tab;
  render();
}
function filterDashboardEntities(input) {
  const root = input.closest(".dashboard-directory"),
    q = input.value.replace(/ي/g, "ی").replace(/ك/g, "ک").trim();
  let count = 0;
  for (const item of root.querySelectorAll(".dashboard-entity")) {
    item.hidden = !item.dataset.name
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .includes(q);
    if (!item.hidden) count++;
  }
  const message = root.querySelector(".dashboard-search-result");
  message.hidden = !q;
  message.textContent = count
    ? count.toLocaleString("fa-IR") + " مورد پیدا شد"
    : "موردی با این نام پیدا نشد.";
}

function dashboardStats(classes, schoolCount) {
  const values = [
    schoolCount,
    classes.length,
    classes.reduce((n, c) => n + c.students.length, 0),
  ];
  const labels = ["مدرسه", "کلاس", "هنرجو"];
  const icons = [
    "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 9h1M15 9h1M8 12h1M15 12h1",
    "M3 4h18v12H3zM8 21h8M12 16v5M7 8h10M7 12h5",
    "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M5 21v-3a7 7 0 0 1 14 0v3M18 4a3 3 0 0 1 0 6M21 20v-3a5 5 0 0 0-2-4",
  ];
  return (
    '<section class="ui-stats dashboard-metrics" aria-label="نمای کلی">' +
    values
      .map(
        (n, i) =>
          '<div class="ui-stat metric-' +
          ["school", "class", "student"][i] +
          '"><span class="metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' +
          icons[i] +
          '"/></svg></span><strong>' +
          n.toLocaleString("fa-IR") +
          '</strong><span class="metric-label">' +
          labels[i] +
          "</span></div>",
      )
      .join("") +
    "</section>"
  );
}

function workflowIcon(name) {
  const paths = {
    school:
      "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 9h1M15 9h1M8 12h1M15 12h1",
    classroom: "M3 4h18v13H3zM8 21h8M12 17v4M7 8h10M7 12h6",
    report: "M4 3v18h17M8 17v-5M13 17V8M18 17V5",
  };
  return (
    '<svg class="workflow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' +
    paths[name] +
    '"/></svg>'
  );
}
function dashboardDirectory(items, kind, schoolId = "") {
  const isSchool = kind === "schools",
    name = isSchool ? "مدرسه‌ها" : "کلاس‌ها";
  let h =
    '<section class="card dashboard-directory"><header class="dashboard-section-heading"><div><h3>' +
    name +
    ' <span class="lesson-count">' +
    items.length.toLocaleString("fa-IR") +
    "</span></h3><p>" +
    (isSchool
      ? "مدیریت مدرسه‌ها و ورود به کلاس‌ها"
      : "مدیریت کلاس‌های همین مدرسه") +
    "</p></div></header>";
  if (items.length >= 4)
    h +=
      '<label class="dashboard-search no-print"><span>جست‌وجو در ' +
      name +
      '</span><input type="search" placeholder="نام ' +
      (isSchool ? "مدرسه" : "کلاس") +
      `…" data-legacy-input="ui-dashboard:0"></label>`;
  h +=
    '<p class="dashboard-search-result no-print" role="status" hidden></p><div class="dashboard-entities">';
  if (!items.length)
    h +=
      '<div class="empty"><strong>هنوز ' +
      (isSchool ? "مدرسه‌ای" : "کلاسی") +
      " اضافه نشده</strong><p>از فرم افزودن، اولین " +
      (isSchool ? "مدرسه" : "کلاس") +
      " را تعریف کنید.</p></div>";
  for (const item of items) {
    const id = esc(item.id),
      classes = isSchool ? item.classes : [item],
      students = classes.reduce((n, c) => n + c.students.length, 0);
    const meta = isSchool
      ? classes.length.toLocaleString("fa-IR") +
        " کلاس · " +
        students.toLocaleString("fa-IR") +
        " هنرجو"
      : students.toLocaleString("fa-IR") +
        " هنرجو · " +
        (item.lessons || []).length.toLocaleString("fa-IR") +
        " درس";
    h +=
      `<article class="dashboard-entity" data-name="${esc(item.name)}"><div class="dashboard-entity-info"><span class="dashboard-entity-symbol" aria-hidden="true">${workflowIcon(isSchool ? "school" : "classroom")}</span><div><h4>${esc(item.name)}</h4><p>${meta}</p></div></div><div class="dashboard-entity-actions no-print"><button data-legacy-click="dashboard-open" data-kind="${isSchool ? "school" : "class"}" data-key="${id}">${isSchool ? "ورود به مدرسه" : "مدیریت کلاس"} ←</button><details class="dashboard-entity-more"><summary id="entity-menu-${isSchool ? "school" : "class"}-${id}" aria-label="عملیات بیشتر برای ${esc(item.name)}">بیشتر</summary><div><button class="ghost" data-mutating="1" data-legacy-click="ui-dashboard:4" data-legacy-click-arg15="${esc(isSchool ? "school" : "class")}" data-legacy-click-arg16="${esc(id)}" data-legacy-click-arg17="${esc(isSchool ? "" : esc(schoolId))}">ویرایش مشخصات</button><button class="danger" data-legacy-click="dashboard-delete" data-kind="${isSchool ? "school" : "class"}" data-key="${id}">حذف ` +
      (isSchool ? "مدرسه" : "کلاس") +
      "</button></div></details></div></article>";
  }
  return h + "</div></section>";
}

// Dashboard data stays separate from its markup and never mutates grades.
let dashboardWorkCache = null;
function dashboardWorkModel(date = todayISO()) {
  const scope = globalThis.EduV24?.getReportContext();
  const cacheKey = scope ? JSON.stringify([date, scope]) : null;
  if (cacheKey && dashboardWorkCache?.key === cacheKey)
    return dashboardWorkCache.model;
  const todaySessions = db.sessions.filter((session) => session.date === date);
  const classes = new Map(
    db.schools.flatMap((school) =>
      school.classes.map((c) => [c.id, { school, c }]),
    ),
  );
  const attendance = [];
  for (const session of todaySessions) {
    const c = classes.get(session.classId)?.c;
    if (!c) continue;
    const members = session.roster || c.students;
    const unknown = members.filter(
      (student) =>
        !/^(present|absent|late(?::\d+)?)$/.test(
          session.attendance?.[student.id] || "",
        ),
    ).length;
    if (unknown) attendance.push({ session, unknown, className: c.name });
  }
  const grading = {
    incomplete: 0,
    remedial: 0,
    unconfirmed: 0,
    errors: 0,
    firstIncompleteClassId: "",
    firstRemedialClassId: "",
  };
  for (const { c } of classes.values())
    for (const lesson of c.lessons || []) {
      if (!lesson.gradingPolicy?.confirmed) grading.unconfirmed++;
      for (const student of c.students) {
        try {
          const result = calcStudentLesson(c, lesson, student.id);
          if (result.passed === false) {
            grading.remedial++;
            grading.firstRemedialClassId ||= c.id;
          } else if (result.complete === false || result.final == null) {
            grading.incomplete++;
            grading.firstIncompleteClassId ||= c.id;
          }
        } catch {
          grading.errors++;
        }
      }
    }
  const planned = [],
    day = getDayIdxFromDate(date);
  if ((db.activeDays || []).includes(day))
    for (let period = 0; period < (db.periods || 6); period++) {
      const entry = getMasterEntry(day, period, date);
      if (!entry) continue;
      const found = classes.get(entry.classId);
      const lesson = found?.c.lessons.find((l) => l.id === entry.lessonId);
      if (!found || !lesson) continue;
      planned.push({
        period,
        day,
        className: found.c.name,
        schoolName: found.school.name,
        lessonName: lesson.name,
        session:
          todaySessions.find(
            (s) =>
              s.classId === entry.classId &&
              s.lessonId === entry.lessonId &&
              s.period === period,
          ) || null,
      });
    }
  const model = {
    date,
    attendance,
    grading,
    planned,
    sessions: todaySessions.length,
    closed: !!scope?.closed,
  };
  if (cacheKey) dashboardWorkCache = { key: cacheKey, model };
  return model;
}
function dashboardEnsureToday(date) {
  if (date === todayISO()) return true;
  dashboardWorkCache = null;
  render();
  alert(
    "تاریخ روز تغییر کرده است؛ میز کار به‌روز شد. جلسه امروز را دوباره انتخاب کنید.",
  );
  return false;
}
function dashboardStartSession(day, period, date) {
  if (dashboardEnsureToday(date)) clickMasterCell(day, period);
}
function dashboardOpenSession(id) {
  const session = db.sessions.find((s) => s.id === id);
  if (session && dashboardEnsureToday(session.date)) openSessionModal(session);
}
function dashboardReviewGrades(classId) {
  const found = findClassById(classId);
  if (!found) return;
  state.schoolId = found.school.id;
  goClass(classId);
}
function dashboardDailyReport() {
  openReportScope("", "", "daily");
  EduPeriodicReports.set("date", todayISO());
}
function renderDashboardWork() {
  if (!db.schools.some((school) => school.classes.length)) return "";
  const model = dashboardWorkModel(),
    fa = (n) => n.toLocaleString("fa-IR");
  const pendingPeople = model.attendance.reduce(
    (n, item) => n + item.unknown,
    0,
  );
  let html =
    '<section class="dashboard-work no-print" aria-labelledby="dashboardWorkTitle">' +
    '<header class="dashboard-work-heading"><div><p class="eyebrow">میز کار روزانه</p><h2 id="dashboardWorkTitle">امروز چه کاری داریم؟</h2><p>' +
    esc(faDate(model.date)) +
    " · " +
    fa(model.sessions) +
    " جلسه ثبت‌شده</p></div>" +
    `<button class="ghost" data-legacy-click="ui-dashboard:2">گزارش روزانه</button></header>`;
  html += '<div class="dashboard-tasks">';
  const tasks = [
    {
      count: pendingPeople,
      label: "حضور‌وغیاب تعیین‌نشده",
      detail: "نفرـجلسه در جلسات امروز",
      tone: "amber",
      action: model.attendance.length ? "session" : "",
      key: model.attendance[0]?.session.id || "",
      button: "تکمیل حضور‌وغیاب",
    },
    {
      count: model.grading.incomplete,
      label: "نمره ناتمام",
      detail: "هنرجوـدرس در دوره جاری",
      tone: "indigo",
      action: model.grading.firstIncompleteClassId ? "grades" : "",
      key: model.grading.firstIncompleteClassId,
      button: "بررسی دروس",
    },
    {
      count: model.grading.remedial,
      label: "نیازمند جبران",
      detail: "هنرجوـدرس؛ جدا از نمره ناقص",
      tone: "rose",
      action: model.grading.firstRemedialClassId ? "grades" : "",
      key: model.grading.firstRemedialClassId,
      button: "بررسی نتیجه‌ها",
    },
  ];
  for (const task of tasks)
    html +=
      '<article class="dashboard-task task-' +
      task.tone +
      '"><strong>' +
      fa(task.count) +
      "</strong><h3>" +
      task.label +
      "</h3><p>" +
      task.detail +
      "</p>" +
      (task.count && task.action
        ? '<button class="ghost" data-legacy-click="dashboard-task" data-task="' +
          task.action +
          '" data-key="' +
          esc(task.key) +
          '">' +
          task.button +
          "</button>"
        : '<span class="dashboard-task-clear">موردی برای پیگیری نیست</span>') +
      "</article>";
  html += "</div>";
  if (model.grading.unconfirmed || model.grading.errors)
    html +=
      '<p class="dashboard-work-notice" role="status">' +
      (model.grading.unconfirmed
        ? fa(model.grading.unconfirmed) +
          " درس با قواعد تأییدنشده یا قدیمی؛ پیش از ارائه کارنامه، تنظیمات درس را بررسی کنید. "
        : "") +
      (model.grading.errors
        ? fa(model.grading.errors) +
          " نتیجه قابل محاسبه نیست و نیاز به بررسی دارد."
        : "") +
      "</p>";
  html +=
    '<section class="dashboard-agenda" aria-labelledby="dashboardAgendaTitle"><h3 id="dashboardAgendaTitle">برنامه امروز</h3>';
  if (!model.planned.length)
    html += `<p class="muted">برای امروز زنگی در برنامه هفتگی تعریف نشده است. نبود جلسه به معنی غیبت هنرجو نیست.</p><button class="ghost" data-legacy-click="ui-dashboard:3">مشاهده برنامه هفتگی</button>`;
  else
    for (const item of model.planned)
      html +=
        '<article class="dashboard-agenda-row"><span class="dashboard-period">' +
        esc(getPeriodName(item.period)) +
        "</span><div><h4>" +
        esc(item.lessonName) +
        "</h4><p>" +
        esc(item.schoolName + " · " + item.className) +
        '</p></div><button class="' +
        (item.session ? "ghost" : "") +
        '" data-legacy-click="dashboard-agenda" data-session="' +
        esc(item.session?.id || "") +
        '" data-day="' +
        esc(item.day) +
        '" data-period="' +
        esc(item.period) +
        '" data-date="' +
        esc(model.date) +
        '"' +
        (model.closed && !item.session ? " disabled" : "") +
        ">" +
        (item.session
          ? "مشاهده جلسه"
          : model.closed
            ? "دوره بسته است"
            : "ثبت جلسه") +
        "</button></article>";
  return html + "</section></section>";
}
