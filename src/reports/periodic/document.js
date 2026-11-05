function studentFollowupHtml(m) {
  const groups = new Map();
  for (const student of m.students) {
    const key = student.classId || student.className;
    if (!groups.has(key))
      groups.set(key, { name: student.className, students: [] });
    groups.get(key).students.push(student);
  }
  const metrics = [
    ["sessions", "جلسه"],
    ["present", "حاضر"],
    ["absent", "غایب"],
    ["leave", "مرخصی"],
    ["late", "تأخیر"],
    ["unknown", "تعیین‌نشده"],
  ];
  let h =
    '<section class="report-followup"><header class="report-followup-heading"><h3>پیگیری وضعیت هنرجویان</h3><p>' +
    num(m.students.length) +
    " هنرجو · " +
    num(groups.size) +
    " کلاس · برای نمایش فهرست، نام کلاس را بزنید.</p></header>";
  for (const group of groups.values()) {
    h +=
      '<details class="report-class-group"><summary class="report-class-heading report-class-toggle"><span class="report-class-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18v13H3zM8 21h8M12 17v4M7 8h10M7 12h6"/></svg></span><div><h4>' +
      esc(group.name) +
      "</h4><p>" +
      num(group.students.length) +
      ' هنرجو با سابقهٔ جلسه در این بازه</p></div><svg class="report-class-chevron no-print" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary><div class="report-class-body"><ol class="report-student-list">';
    for (const student of group.students) {
      h +=
        '<li class="report-student-row"><div class="report-student-identity"><strong><bdi>' +
        esc(student.name) +
        "</bdi></strong>" +
        (student.code
          ? "<small>کد دانش‌آموزی: <bdi>" + esc(student.code) + "</bdi></small>"
          : "") +
        '</div><dl class="report-student-metrics">';
      for (const [key, label] of metrics)
        h +=
          '<div class="report-metric report-metric-' +
          key +
          '"><dt>' +
          (key === "unknown"
            ? '<span class="report-metric-long">تعیین‌نشده</span><span class="report-metric-short" title="تعیین‌نشده">نامشخص</span>'
            : label) +
          "</dt><dd>" +
          num(
            key === "present"
              ? (student.present || 0) + (student.late || 0)
              : (student[key] ?? 0),
          ) +
          "</dd></div>";
      h += "</dl></li>";
    }
    h += "</ol></div></details>";
  }
  return h + "</section>";
}

function sessionDisclosureHtml(m, sessions) {
  if (!sessions.length) return "";
  const ordered = [...sessions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.period - b.period ||
      String(a.id || "").localeCompare(String(b.id || "")),
  );
  const days = new Map();
  for (const session of ordered) {
    if (!days.has(session.date)) days.set(session.date, []);
    days.get(session.date).push(session);
  }
  let body = "";
  for (const [date, items] of days) {
    body +=
      '<section class="report-session-day"><header class="report-session-day-heading"><h4><time datetime="' +
      esc(date) +
      '">' +
      esc(faDate(date)) +
      "</time></h4><span>" +
      num(items.length) +
      " جلسه</span></header>" +
      items.map((s) => sessionDetailsHtml(m, s, { grouped: true })).join("") +
      "</section>";
  }
  return (
    '<details class="report-session-disclosure"' +
    (m.audience === "parent" ? " open" : "") +
    '><summary class="report-session-toggle"><span class="report-session-toggle-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 11h16M8 15h3M8 18h6"/></svg></span><span class="report-session-toggle-label"><strong>جزئیات جلسات و ثبت‌ها</strong><small>' +
    num(sessions.length) +
    ' جلسه</small></span><svg class="report-session-chevron no-print" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary><div class="report-session-body">' +
    body +
    "</div></details>"
  );
}

function sessionDetailsHtml(m, s, { grouped = false } = {}) {
  const statuses = [
    ["present", "حاضر"],
    ["absent", "غایب"],
    ["leave", "مرخصی"],
    ["late", "تأخیر"],
    ["unknown", "تعیین‌نشده"],
  ];
  let html = grouped
    ? '<details class="periodic-session report-session-compact"><summary class="report-session-heading report-session-item-toggle"><span class="report-session-period">زنگ ' +
      num(s.period + 1) +
      '</span><span class="report-session-item-title"><strong>' +
      esc(s.className) +
      "</strong><small>" +
      esc(s.lessonName) +
      '</small></span><span class="report-session-item-date">' +
      esc(faDate(s.date)) +
      (s.academicTerm ? " · نوبت " + esc(s.academicTerm) : "") +
      '</span><svg class="report-session-item-chevron no-print" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg></summary><div class="report-session-content"><div class="report-session-identity">'
    : '<section class="periodic-session' +
      (grouped ? " report-session-compact" : "") +
      '"><header class="report-session-heading">' +
      (grouped
        ? '<span class="report-session-class">' + esc(s.className) + "</span>"
        : '<span class="report-session-date"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 11h16"/></svg>' +
          esc(faDate(s.date)) +
          (s.academicTerm ? " · نوبت " + esc(s.academicTerm) : "") +
          "</span>") +
      '<span class="report-session-period">زنگ ' +
      num(s.period + 1) +
      '</span></header><div class="report-session-identity"><h4>' +
      esc(s.className) +
      "</h4>";
  html +=
    '<div class="report-session-lesson">' +
    (grouped ? "" : "<strong>" + esc(s.lessonName) + "</strong>") +
    (s.moduleName
      ? "<small>" +
        esc(s.moduleName) +
        (s.unitName ? " / " + esc(s.unitName) : "") +
        "</small>"
      : s.unitName
        ? "<small>" + esc(s.unitName) + "</small>"
        : "") +
    "</div>" +
    (s.teacher
      ? '<p class="report-session-teacher">دبیر: <b>' +
        esc(s.teacher) +
        "</b></p>"
      : "") +
    "</div>";
  if (m.audience === "management" && m.detailLevel === "summary") {
    html += '<dl class="report-session-counts">';
    for (const [key, label] of statuses)
      html +=
        '<div class="report-metric report-metric-' +
        key +
        '"><dt>' +
        label +
        "</dt><dd>" +
        num(
          key === "present"
            ? (s.counts.present || 0) + (s.counts.late || 0)
            : s.counts[key],
        ) +
        "</dd></div>";
    html += "</dl>";
  }
  const participants = reportParticipants(m, s);
  if (participants.length) {
    html +=
      '<div class="report-session-table-wrap"><table class="report-session-table" data-mobile-layout="compact"><caption>حضور و فعالیت‌های ثبت‌شدهٔ هنرجویان</caption><colgroup><col class="report-session-name-col"><col class="report-session-status-col"><col></colgroup><thead><tr><th scope="col">هنرجو</th><th scope="col">حضور</th><th scope="col">نمره، امتیاز و تکلیف</th></tr></thead><tbody>';
    for (const p of participants) {
      const status = statuses.some(([key]) => key === p.attendance.status)
        ? p.attendance.status
        : "unknown";
      html +=
        '<tr><th scope="row" class="report-session-student-heading"><bdi>' +
        esc(p.name) +
        '</bdi></th><td><span class="report-session-attendance report-metric report-metric-' +
        status +
        '">' +
        esc(p.attendance.label) +
        (p.attendance.minutes == null
          ? ""
          : " · " + num(p.attendance.minutes) + " دقیقه") +
        "</span></td><td>";
      if (p.scores.length) {
        html += '<ul class="report-session-scores">';
        for (const score of p.scores)
          html +=
            '<li data-score-kind="' +
            (["positive", "negative", "homework"].includes(score.type)
              ? score.type
              : "grade") +
            '"><span>' +
            esc(score.label) +
            "</span><strong>" +
            esc(score.value ?? "—") +
            "</strong>" +
            (score.note
              ? '<span class="report-session-score-note">' +
                (m.audience === "parent" ? "توضیح / تذکر: " : "") +
                esc(score.note) +
                "</span>"
              : "") +
            "</li>";
        html += "</ul>";
      } else html += '<span class="report-session-no-score">—</span>';
      html += "</td></tr>";
    }
    html += "</tbody></table></div>";
  }
  return html + (grouped ? "</div></details>" : "</section>");
}

function periodicReportHeadingHtml(m) {
  const persianDigits = (value) =>
    String(value).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  const audience = m.audience === "parent" ? "ویژه اولیا" : "مدیریت مدرسه";
  const detail =
    m.audience === "parent"
      ? "گزارش کامل عملکرد هنرجو"
      : m.detailLevel === "summary"
        ? "خلاصه مدیریتی"
        : "جزئیات کامل";
  const rangeText =
    m.start === m.end
      ? faDate(m.start)
      : faDate(m.start) + " تا " + faDate(m.end);
  const preparedDate = new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tehran",
  }).format(new Date(m.generatedAt));
  const preparedTime = new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tehran",
  }).format(new Date(m.generatedAt));
  return (
    '<header class="periodic-document-heading" data-report-audience="' +
    esc(m.audience) +
    '"><div class="report-heading-tags"><span class="report-audience-tag">' +
    audience +
    '</span><span class="report-detail-tag">' +
    detail +
    '</span></div><div class="report-heading-identity"><span class="report-heading-symbol" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/></svg></span><div><h2>گزارش ' +
    esc(modeLabel(m.mode)) +
    "</h2><h3>" +
    esc(m.school.name) +
    '</h3></div></div><div class="report-heading-date"><svg width="20" height="20" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 11h16"/></svg><span><small>' +
    (m.start === m.end ? "تاریخ گزارش" : "بازه گزارش") +
    "</small><strong><bdi>" +
    esc(rangeText) +
    '</bdi></strong></span></div><div class="report-heading-context"><span aria-label="سال تحصیلی"><bdi>' +
    esc(persianDigits(m.academicYear)) +
    "</bdi></span>" +
    (m.academicTerm
      ? "<span>" + esc("ترم " + m.academicTerm) + "</span>"
      : "") +
    "</div>" +
    (m.class
      ? '<p class="report-heading-scope">کلاس: <bdi>' +
        esc(m.class.name) +
        "</bdi></p>"
      : "") +
    (m.student
      ? '<p class="report-heading-scope">هنرجو: <strong><bdi>' +
        esc(m.student.name) +
        "</bdi></strong> · کد: <bdi>" +
        esc(m.student.code || "ثبت نشده") +
        "</bdi></p>"
      : "") +
    '<p class="report-heading-prepared">تهیه: <time datetime="' +
    esc(m.generatedAt) +
    '">' +
    esc(preparedDate) +
    " · " +
    esc(preparedTime) +
    "</time></p></header>"
  );
}

function documentHtml(m, gradeHtml = "") {
  let h =
    '<article class="card report-document periodic-document">' +
    periodicReportHeadingHtml(m);
  h += `<div class="periodic-export-actions no-print" aria-label="دریافت گزارش"><button type="button" data-periodic-print data-legacy-click="reports-periodic-document:0"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 17H4V9h16v8h-2"/><path d="M6 14h12v7H6zM17 12h.01"/></svg><span>چاپ / PDF</span></button><button type="button" class="ghost" data-periodic-excel data-legacy-click="reports-periodic-document:xlsx" title="فایل اکسل با برگه‌های جدا؛ مطابق محدوده همین گزارش"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 12l5 6m0-6-5 6M16 12h1m-1 3h1m-1 3h1"/></svg><span>دریافت اکسل</span></button><button type="button" class="ghost" data-periodic-excel-share data-legacy-click="reports-periodic-document:xlsx-share" title="ارسال فایل اکسل با پیام‌رسان‌های دستگاه"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg><span>اشتراک‌گذاری اکسل</span></button><button class="ghost" data-legacy-click="reports-periodic-document:1"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/></svg><span>فایل متن</span></button><button class="ghost" data-legacy-click="reports-periodic-document:2"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H6v5l-2 3 2 3v5h2M16 4h2v5l2 3-2 3v5h-2M10 9h.01M10 15h.01M14 9l-2 6"/></svg><span>فایل JSON</span></button></div><p id="periodicExportStatus" class="muted no-print" role="status" aria-live="polite"></p>`;
  if (!m.sessions.length)
    h +=
      '<div class="empty">در این بازه و محدوده، جلسه مرتبطی ثبت نشده است.</div>';
  if (m.audience === "management" && m.sessions.length) {
    h += studentFollowupHtml(m);
  }
  if (m.audience === "parent") {
    h +=
      '<section class="report-parent-performance"><h3>جمع‌بندی عملکرد هنرجو در بازهٔ گزارش</h3><p class="periodic-method">آمار حضور بر مبنای جلسه است. تعداد ثبت‌ها، مجموع امتیاز یا نمره نیست؛ جزئیات هر ثبت در ادامه آمده است.</p><table class="report-session-table" data-mobile-layout="compact"><caption>جمع‌بندی عملکرد هنرجو</caption><thead><tr><th scope="col">موضوع</th><th scope="col">وضعیت ثبت</th></tr></thead><tbody>';
    for (const [label, value] of parentPerformanceRows(m))
      h +=
        '<tr><th scope="row">' +
        esc(label) +
        "</th><td>" +
        esc(value) +
        "</td></tr>";
    h += "</tbody></table></section>";
    if (m.annualGrades?.length || m.technicalGrades?.length)
      h +=
        '<p class="periodic-method">حضور و فعالیت‌ها فقط مربوط به بازه و ترم گزارش‌اند؛ بخش نمرات سال، وضعیت فعلی نمرات همین هنرجو در کل سال تحصیلی را نشان می‌دهد.</p>';
  }
  h += sessionDisclosureHtml(m, m.sessions);
  if (gradeHtml)
    h +=
      '<section class="periodic-karnameh"><h3>کارنامهٔ نمرات</h3>' +
      gradeHtml +
      "</section>";
  if (!gradeHtml && m.technicalGrades?.length) {
    h += "<section><h3>نمرات فنی و پودمانی</h3>";
    for (const grade of m.technicalGrades) {
      h +=
        "<h4>" +
        esc(
          grade.studentName +
            " · " +
            grade.className +
            " · " +
            grade.lessonName +
            (grade.method === "modular"
              ? " · سالانه"
              : " · نوبت " + grade.term),
        ) +
        "</h4><p>" +
        (grade.method === "legacy-unit"
          ? "روش قدیمی؛ نتیجه زیر نمره رسمی پودمان نیست: "
          : "نتیجه درس: ") +
        esc(root.EduV24.finalText(grade)) +
        (grade.complete ? "" : " — ناقص") +
        "</p>";
      if (grade.method === "legacy-unit")
        h += table(
          ["پودمان / واحد", "مستمر", "پایانی", "نمره ترکیبی"],
          (grade.legacyUnits || []).map((unit) => [
            unit.moduleName + " / " + unit.unitName,
            unit.mostamar ?? "—",
            unit.payani ?? "—",
            root.EduV24.finalText(unit),
          ]),
        );
      else
        h += table(
          ["پودمان", "نمره", "وضعیت"],
          grade.modules.map((module) => [
            module.name,
            root.EduV24.finalText(module),
            module.complete
              ? module.passed
                ? "قبول"
                : "نیازمند جبران"
              : "ناقص",
          ]),
        );
    }
    h += "</section>";
  }
  if (!gradeHtml && m.annualGrades) {
    h +=
      '<section class="annual-grades"><h3>نمرات چهار مرحله سال</h3><p>هر مرحله طبق تنظیمات همان نوبت محاسبه می‌شود؛ نهایی سالانه میانگین برابر چهار مرحله است. نمره ثبت‌نشده، صفر نیست.</p><div class="assessment-students">';
    for (const grade of m.annualGrades) {
      h +=
        '<article class="assessment-student"><h4>' +
        esc(grade.studentName) +
        "</h4><p>" +
        esc(grade.className + " · " + grade.lessonName) +
        '</p><div class="annual-grade-components">';
      for (const item of grade.components)
        h +=
          "<span>" +
          (item.stage === "midterm" ? "میان‌ترم " : "پایان‌ترم ") +
          esc(item.term) +
          ": <strong>" +
          esc(root.EduV24.finalText(item)) +
          "</strong><br>" +
          (grade.general
            ? "نمره " + esc(item.theory ?? "—")
            : "عملی " +
              esc(item.practical ?? "—") +
              " · تئوری " +
              esc(item.theory ?? "—")) +
          "</span>";
      h +=
        "</div><p>نهایی سالانه: <strong>" +
        esc(root.EduV24.finalText(grade)) +
        "</strong> · " +
        (grade.complete
          ? grade.general
            ? "تکمیل"
            : grade.passed
              ? "قبول"
              : "نیازمند جبران"
          : "ناقص؛ هر چهار نمره لازم است") +
        "</p></article>";
    }
    h += "</div></section>";
  }
  if (m.currentGrades.length)
    h +=
      '<h3>آخرین وضعیت تجمعی نمرات درس‌ها</h3><p class="periodic-method">این بخش وضعیت فعلی درس است، محدود به بازه گزارش نیست و ممکن است نمرات خارج از این بازه را شامل شود.</p>' +
      table(
        ["درس", "عملی فعلی", "نظری فعلی", "نهایی فعلی", "وضعیت", "قواعد"],
        m.currentGrades.map((g) => [
          g.lessonName,
          g.method === "dual" ? num(g.practical) : "—",
          g.method === "dual" ? num(g.theory) : "—",
          g.final,
          g.status,
          g.policy,
        ]),
      );
  if (m.currentGrades.some((g) => g.modules?.length))
    h +=
      "<h3>جزئیات تجمعی پودمان‌ها</h3>" +
      table(
        ["درس / پودمان", "مستمر", "شایستگی", "نمره پودمان", "وضعیت و دلیل"],
        m.currentGrades.flatMap((g) =>
          (g.modules || []).map((p) => [
            g.lessonName + " / " + p.name,
            num(p.continuous),
            num(p.competency),
            num(p.final),
            p.reason || (p.passed ? "احراز شده" : "نیازمند بررسی"),
          ]),
        ),
      );
  if (m.note)
    h +=
      '<h3>توضیحات تنظیم‌کننده</h3><p class="periodic-note">' +
      esc(m.note) +
      "</p>";
  if (m.warnings.length)
    h +=
      '<aside class="periodic-warnings"><strong>موارد نیازمند بررسی</strong><ul>' +
      m.warnings.map((w) => "<li>" + esc(w) + "</li>").join("") +
      "</ul></aside>";
  h += "</article>";
  return h;
}
