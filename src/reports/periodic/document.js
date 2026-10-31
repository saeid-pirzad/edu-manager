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
    '<section class="report-followup"><header class="report-followup-heading"><h3>پیگیری وضعیت هنرجویان</h3><p>به تفکیک کلاس · آمار حضور در جلسه‌های همین بازه</p></header>';
  for (const group of groups.values()) {
    h +=
      '<section class="report-class-group"><header class="report-class-heading"><span class="report-class-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18v13H3zM8 21h8M12 17v4M7 8h10M7 12h6"/></svg></span><div><h4>' +
      esc(group.name) +
      "</h4><p>" +
      num(group.students.length) +
      ' هنرجو با سابقهٔ جلسه در این بازه</p></div></header><ol class="report-student-list">';
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
          label +
          "</dt><dd>" +
          num(
            key === "present"
              ? (student.present || 0) + (student.late || 0)
              : (student[key] ?? 0),
          ) +
          "</dd></div>";
      h += "</dl></li>";
    }
    h += "</ol></section>";
  }
  return h + "</section>";
}

function sessionDetailsHtml(m, s) {
  const statuses = [
    ["present", "حاضر"],
    ["absent", "غایب"],
    ["leave", "مرخصی"],
    ["late", "تأخیر"],
    ["unknown", "تعیین‌نشده"],
  ];
  let html =
    '<section class="periodic-session"><header class="report-session-heading"><span class="report-session-date"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 11h16"/></svg>' +
    esc(faDate(s.date)) +
    '</span><span class="report-session-period">زنگ ' +
    num(s.period + 1) +
    '</span></header><div class="report-session-identity"><h4>' +
    esc(s.className) +
    '</h4><div class="report-session-lesson"><strong>' +
    esc(s.lessonName) +
    "</strong>" +
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
    html += '<ol class="report-session-students">';
    for (const p of participants) {
      const status = statuses.some(([key]) => key === p.attendance.status)
        ? p.attendance.status
        : "unknown";
      html +=
        '<li><div class="report-session-student-heading"><strong>' +
        esc(p.name) +
        '</strong><span class="report-session-attendance report-metric report-metric-' +
        status +
        '">' +
        esc(p.attendance.label) +
        (p.attendance.minutes == null
          ? ""
          : " · " + num(p.attendance.minutes) + " دقیقه") +
        "</span></div>";
      if (p.scores.length) {
        html += '<ul class="report-session-scores">';
        for (const score of p.scores)
          html +=
            "<li><span>" +
            esc(score.label) +
            "</span><strong>" +
            esc(score.value ?? "—") +
            "</strong>" +
            (score.note ? "<p>" + esc(score.note) + "</p>" : "") +
            "</li>";
        html += "</ul>";
      }
      html += "</li>";
    }
    html += "</ol>";
  }
  return html + "</section>";
}

function documentHtml(m) {
  let h =
    '<article class="card report-document periodic-document"><header class="periodic-document-heading"><span>' +
    (m.audience === "parent"
      ? "ویژه اولیا — اطلاعات یک هنرجو"
      : "ویژه مدیریت مدرسه — " +
        (m.detailLevel === "summary" ? "خلاصه مدیریتی" : "جزئیات کامل")) +
    "</span><h2>" +
    ("گزارش " + modeLabel(m.mode)) +
    "</h2><h3>" +
    esc(m.school.name) +
    "</h3><p>" +
    esc(faDate(m.start)) +
    " تا " +
    esc(faDate(m.end)) +
    " · سال تحصیلی " +
    esc(m.academicYear) +
    "</p>" +
    (m.class ? "<p>کلاس: " + esc(m.class.name) + "</p>" : "") +
    (m.student
      ? "<p><strong>هنرجو: " +
        esc(m.student.name) +
        "</strong> · کد: " +
        esc(m.student.code || "ثبت نشده") +
        "</p>"
      : "") +
    "<small>تهیه‌شده در " +
    esc(new Date(m.generatedAt).toLocaleString("fa-IR")) +
    "</small></header>";
  h += `<div class="periodic-export-actions no-print"><button class="success" data-deputy-copy data-legacy-click="reports-periodic-document:deputy">کپی برای معاون</button><button data-periodic-print data-legacy-click="reports-periodic-document:0">چاپ / PDF</button><button class="ghost" data-legacy-click="reports-periodic-document:1">فایل متن</button><button class="ghost" data-legacy-click="reports-periodic-document:2">فایل JSON</button></div>`;
  h +=
    '<section class="periodic-summary" aria-label="خلاصه آمار گزارش">' +
    [
      ["جلسه ثبت‌شده", m.summary.sessions, "sessions"],
      ["حاضر", (m.summary.present || 0) + (m.summary.late || 0), "present"],
      ["غایب", m.summary.absent, "absent"],
      ["مرخصی", m.summary.leave, "leave"],
      ["با تأخیر", m.summary.late, "late"],
      ["تعیین‌نشده", m.summary.unknown, "unknown"],
    ]
      .map(
        ([label, n, status]) =>
          '<div data-summary-status="' +
          status +
          '"><strong>' +
          num(n) +
          "</strong><span>" +
          label +
          "</span></div>",
      )
      .join("") +
    "</section>";
  if (!m.sessions.length)
    h +=
      '<div class="empty">در این بازه و محدوده، جلسه مرتبطی ثبت نشده است.</div>';
  if (m.audience === "management" && m.sessions.length) {
    h += studentFollowupHtml(m);
  }
  if (m.technicalGrades?.length) {
    h += "<section><h3>نمرات فنی به تفکیک نوبت و پودمان</h3>";
    for (const grade of m.technicalGrades) {
      h +=
        "<h4>" +
        esc(
          grade.studentName +
            " · " +
            grade.className +
            " · " +
            grade.lessonName +
            " · نوبت " +
            grade.term,
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
  if (m.annualGrades) {
    h +=
      '<section class="annual-grades"><h3>نمرات چهار مرحله سال</h3><p>درس عمومی در هر مرحله یک نمره دارد؛ در کاردانش هر مرحله عملی ۷۰٪ و تئوری ۳۰٪ است. نمره ثبت‌نشده، صفر نیست.</p><div class="assessment-students">';
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
  h += "<h3>جزئیات جلسات و ثبت‌ها</h3>";
  for (const s of m.sessions) h += sessionDetailsHtml(m, s);
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
  const definitions = m.definitions
    .map((d) => "<li>" + esc(d) + "</li>")
    .join("");
  h +=
    '<footer class="periodic-footer"><details class="report-basis no-print"><summary>مبنای گزارش<span aria-hidden="true">⌄</span></summary><ul>' +
    definitions +
    '</ul></details><div class="report-basis-print"><h4>مبنای گزارش</h4><ul>' +
    definitions +
    '</ul></div><div class="report-signoff"><div><span>تنظیم‌کننده</span>' +
    (m.author
      ? "<strong>" + esc(m.author) + "</strong>"
      : '<span class="report-signoff-line" aria-label="محل نام تنظیم‌کننده"></span>') +
    '</div><div><span>امضا</span><span class="report-signoff-line" aria-label="محل امضا"></span></div></div></footer></article>';
  return h;
}
