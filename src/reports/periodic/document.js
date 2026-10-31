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
  h += `<div class="periodic-export-actions no-print"><button data-periodic-print data-legacy-click="reports-periodic-document:0">چاپ / PDF</button><button class="ghost" data-legacy-click="reports-periodic-document:1">فایل متن</button><button class="ghost" data-legacy-click="reports-periodic-document:2">فایل JSON</button></div>`;
  h +=
    '<section class="periodic-summary">' +
    [
      ["جلسه ثبت‌شده", m.summary.sessions],
      ["حاضر", m.summary.present],
      ["غایب", m.summary.absent],
      ["مرخصی", m.summary.leave],
      ["با تأخیر", m.summary.late],
      ["تعیین‌نشده", m.summary.unknown],
    ]
      .map(
        ([label, n]) =>
          "<div><strong>" +
          num(n) +
          "</strong><span>" +
          label +
          "</span></div>",
      )
      .join("") +
    '</section><p class="periodic-method">واحد آمار حضور: نفرـجلسه. نرخ حضور از موارد تعیین‌شده، به‌جز مرخصی: ' +
    (m.summary.attendanceRate === null
      ? "قابل محاسبه نیست"
      : num(m.summary.attendanceRate) + "٪") +
    ". نمرات زیر، ثبت‌های همین بازه‌اند و نمره نهایی درس نیستند.</p>";
  if (!m.sessions.length)
    h +=
      '<div class="empty">در این بازه و محدوده، جلسه مرتبطی ثبت نشده است.</div>';
  h +=
    "<h3>مرور " +
    (m.mode === "weekly"
      ? "روزهای هفته"
      : ["monthly", "annual"].includes(m.mode) && m.detailLevel === "summary"
        ? "روزهای دارای جلسه"
        : "روز") +
    "</h3>" +
    table(
      ["تاریخ", "جلسه", "حاضر / غایب / تأخیر / مرخصی", "تعیین‌نشده"],
      displayedDays(m).map((d) => [
        faDate(d.date),
        num(d.sessions),
        num(d.present) +
          " / " +
          num(d.absent) +
          " / " +
          num(d.late) +
          " / " +
          num(d.leave),
        num(d.unknown),
      ]),
    );
  if (m.audience === "management" && m.sessions.length) {
    h +=
      "<h3>جمع‌بندی کلاس‌ها و درس‌ها</h3>" +
      table(
        [
          "کلاس / درس",
          "جلسه",
          "حاضر / غایب / تأخیر / مرخصی",
          "تعیین‌نشده",
          "ثبت نمره و فعالیت",
        ],
        m.lessons.map((l) => [
          l.className + " / " + l.lessonName,
          num(l.sessions),
          num(l.present) +
            " / " +
            num(l.absent) +
            " / " +
            num(l.late) +
            " / " +
            num(l.leave),
          num(l.unknown),
          num(l.markCount),
        ]),
      );
    h +=
      "<h3>پیگیری وضعیت هنرجویان</h3>" +
      table(
        [
          m.class ? "هنرجو" : "هنرجو / کلاس",
          "جلسه",
          "حاضر",
          "غایب",
          "مرخصی",
          "تأخیر",
          "تعیین‌نشده",
        ],
        m.students.map((st) => [
          st.name + (m.class ? "" : " / " + st.className),
          num(st.sessions),
          num(st.present),
          num(st.absent),
          num(st.leave),
          num(st.late),
          num(st.unknown),
        ]),
        "student-summary",
      );
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
  if (m.audience === "management" && m.detailLevel === "summary")
    h +=
      '<p class="periodic-method">نمایش خلاصه: آمار همه هنرجویان و همه ثبت‌های فعالیت حفظ شده است؛ برای ریز حضور هر هنرجو در هر جلسه، نمایش «جزئیات کامل» را انتخاب کنید. فایل JSON جزئیات کامل همین محدوده را دارد.</p>';
  for (const s of m.sessions) {
    h +=
      '<section class="periodic-session"><h4>' +
      esc(faDate(s.date)) +
      " · زنگ " +
      num(s.period + 1) +
      " · " +
      esc(s.className) +
      "</h4><p>" +
      esc(s.lessonName) +
      (s.moduleName ? " · " + esc(s.moduleName) : "") +
      (s.unitName ? " / " + esc(s.unitName) : "") +
      (s.teacher ? " · دبیر: " + esc(s.teacher) : "") +
      "</p>";
    if (m.audience === "management" && m.detailLevel === "summary")
      h +=
        '<p class="periodic-method">حاضر: ' +
        num(s.counts.present) +
        " · غایب: " +
        num(s.counts.absent) +
        " · مرخصی: " +
        num(s.counts.leave) +
        " · تأخیر: " +
        num(s.counts.late) +
        " · تعیین‌نشده: " +
        num(s.counts.unknown) +
        "</p>";
    h += table(
      ["هنرجو", "وضعیت حضور", "نمره، تکلیف و فعالیت ثبت‌شده"],
      reportParticipants(m, s).map((p) => [
        p.name,
        p.attendance.label +
          (p.attendance.minutes === null
            ? ""
            : " · " + num(p.attendance.minutes) + " دقیقه"),
        p.scores.length
          ? p.scores
              .map(
                (sc) =>
                  sc.label +
                  ": " +
                  (sc.value ?? "—") +
                  (sc.note ? " — " + sc.note : ""),
              )
              .join("\n")
          : "ثبت نشده",
      ]),
    );
    h += "</section>";
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
  h +=
    '<footer class="periodic-footer"><h4>مبنای گزارش</h4><ul>' +
    m.definitions.map((d) => "<li>" + esc(d) + "</li>").join("") +
    "</ul><p>تنظیم‌کننده: " +
    esc(m.author || "........................") +
    "<br>امضا: ........................</p></footer></article>";
  return h;
}
