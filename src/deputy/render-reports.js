// Private deputy bundle fragment; assembled inside the deputy scope.

function statusPill(participant) {
  return (
    '<span class="ed-attendance ed-' +
    participant.status +
    '"><i aria-hidden="true"></i>' +
    esc(labels[participant.status]) +
    (participant.minutes !== null
      ? " · " + fa(participant.minutes) + " دقیقه"
      : "") +
    "</span>"
  );
}

function sessionCard(session) {
  const people = reportParticipants(session, session.classInfo);
  const lesson = session.classInfo?.lessons.find(
    (l) => l.id === session.lessonId,
  );
  const scoreLabels = {
    mostamar: "مستمر",
    payani: "پایانی",
    positive: "مثبت",
    negative: "منفی",
    homework: "تکلیف",
    classGrade: "نمرهٔ کلاسی",
    activity: "فعالیت",
  };
  return (
    '<details class="ed-session"><summary><span><strong>' +
    esc(date(session.date)) +
    " · زنگ " +
    fa(session.period + 1) +
    "</strong><small>" +
    esc(
      (session.classInfo?.name || "کلاس حذف‌شده") +
        " · " +
        (lesson?.name || "درس حذف‌شده"),
    ) +
    '</small></span><span class="ed-badge">' +
    esc(labels[session.termKind]) +
    "</span>" +
    icon("arrow", "ed-disclosure-icon") +
    '</summary><div class="ed-session-body"><p class="ed-hint">دبیر: ' +
    esc(lesson?.teacher || "—") +
    '</p><div class="ed-participants">' +
    people
      .map(
        (person) =>
          '<div class="ed-participant"><div><strong>' +
          esc(person.name) +
          "</strong>" +
          (person.code ? "<small>کد: " + esc(person.code) + "</small>" : "") +
          "</div>" +
          statusPill(person) +
          (person.scores.length
            ? '<div class="ed-activities">' +
              person.scores
                .map(
                  (score) =>
                    "<span>" +
                    esc(scoreLabels[score.type] || score.type) +
                    ": " +
                    esc(number(score.value)) +
                    (score.note ? " · " + esc(score.note) : "") +
                    "</span>",
                )
                .join("") +
              "</div>"
            : "") +
          "</div>",
      )
      .join("") +
    "</div></div></details>"
  );
}

function gradeValue(label, value) {
  return (
    "<span><small>" +
    esc(label) +
    "</small><strong>" +
    esc(number(value)) +
    "</strong></span>"
  );
}

function gradeCard(row) {
  const modular = row.kind === "modular";
  const stages = (row.stages || []).filter(
    (stage) => state.term === "all" || stage.termKind === state.term,
  );
  return (
    '<article class="ed-grade ed-grade-' +
    esc(row.kind) +
    '"><h4>' +
    esc(row.studentName) +
    (row.archived ? "<small>بایگانی</small>" : "") +
    "</h4>" +
    (modular
      ? '<span class="ed-badge">پودمانی · کل سال</span><div class="ed-grade-stages">' +
        (row.modules || [])
          .map(
            (module) =>
              '<div class="ed-grade-stage"><strong>' +
              esc(module.name) +
              '</strong><div class="ed-grade-values">' +
              gradeValue("مستمر", module.m) +
              gradeValue("شایستگی", module.c) +
              gradeValue("نتیجه", module.final) +
              "</div></div>",
          )
          .join("") +
        "</div>"
      : '<div class="ed-grade-stages">' +
        stages
          .map(
            (stage) =>
              '<div class="ed-grade-stage"><strong>' +
              esc(
                labels[stage.termKind] +
                  " · " +
                  (stage.stage === "midterm" ? "میان‌ترم" : "پایان‌ترم"),
              ) +
              '</strong><div class="ed-grade-values">' +
              (row.kind === "general"
                ? gradeValue("نمره", stage.final)
                : gradeValue("عملی", stage.practical) +
                  gradeValue("نظری", stage.theory) +
                  gradeValue("نتیجه", stage.final)) +
              "</div></div>",
          )
          .join("") +
        "</div>") +
    (row.kind === "legacy" ? legacyGradeUnits(row) : "") +
    "</article>"
  );
}

function legacyGradeUnits(row) {
  const units = (row.units || []).filter(
    (unit) => state.term === "all" || unit.termKind === state.term,
  );
  return (
    '<p class="ed-hint">نمرات خام ساختار قدیمی؛ این مقادیر نمرهٔ نهایی رسمی درس نیستند.</p><div class="ed-grade-stages">' +
    units
      .map(
        (unit) =>
          '<div class="ed-grade-stage"><strong>' +
          esc(
            labels[unit.termKind] +
              " · " +
              unit.poudmanName +
              " · " +
              unit.unitName,
          ) +
          '</strong><div class="ed-grade-values">' +
          gradeValue("مستمر", unit.m) +
          gradeValue("پایانی", unit.p) +
          "</div></div>",
      )
      .join("") +
    "</div>" +
    (!units.length
      ? '<p class="ed-hint">در این محدوده نمرهٔ خامی ثبت نشده است؛ فعالیت‌های جلسه در جزئیات جلسات قابل مشاهده‌اند.</p>'
      : "")
  );
}

function gradeReports(packet) {
  const rows = root.EduDeputyExchange.gradeRows(packet).filter(
    (row) =>
      (!state.classId || row.classId === state.classId) &&
      (!state.studentId || row.studentId === state.studentId),
  );
  const groups = new Map();
  for (const row of rows) {
    const key = row.classId + "|" + row.lessonId;
    if (!groups.has(key)) groups.set(key, { row, rows: [] });
    groups.get(key).rows.push(row);
  }
  return (
    '<section class="ed-panel"><h2>کارنامه و نمرات دریافتی</h2><p class="ed-hint">نمرات رسمی از اطلاعات درس محاسبه می‌شوند؛ بازهٔ تاریخ بالا فقط جلسات را محدود می‌کند. پودمانی مستقل از ترم و سالانه است. «—» یعنی نمرهٔ کامل ثبت نشده، نه صفر.</p>' +
    ([...groups.values()]
      .map(
        (group) =>
          '<details class="ed-lesson"><summary><span><strong>' +
          esc(group.row.lessonName) +
          "</strong><small>" +
          esc(
            group.row.className +
              " · " +
              (group.row.teacher || packet.sender.name),
          ) +
          '</small></span><span class="ed-badge">' +
          fa(group.rows.length) +
          " هنرجو</span>" +
          icon("arrow", "ed-disclosure-icon") +
          '</summary><div class="ed-grade-list">' +
          group.rows.map(gradeCard).join("") +
          "</div></details>",
      )
      .join("") ||
      empty(
        "نمره‌ای برای نمایش نیست",
        "اطلاعات درس‌ها و نمرات از فایل دبیر خوانده می‌شود.",
      )) +
    "</section>"
  );
}

function reports() {
  const row = selected();
  if (!row)
    return (
      sourceControls() +
      (state.reportTargetMissing
        ? '<p class="ed-warning">' + esc(state.reportTargetMissing) + "</p>"
        : empty(
            "پرونده‌ای انتخاب نشده",
            "از بخش دریافت اطلاعات، فایل دبیر را وارد کنید یا محدودهٔ پرونده‌ها را تغییر دهید.",
          ))
    );
  const packet = row.packet;
  const invalidRange = reportDateError() || state.reportTargetMissing;
  return (
    sourceControls() +
    '<section class="ed-panel ed-report-filters"><div class="ed-section-heading"><h2>گزارش حضور و جلسات</h2>' +
    action(
      "print",
      "چاپ / PDF",
      invalidRange ? "disabled" : "",
      "ed-secondary",
    ) +
    '</div><div class="ed-filters">' +
    field(
      "ترم",
      select(
        "deputyTerm",
        packet.periods
          .map((p) => option(p.termKind, labels[p.termKind], state.term))
          .join("") + option("all", labels.all, state.term),
      ),
    ) +
    field(
      "کلاس",
      select(
        "deputyClass",
        option("", "همهٔ کلاس‌های این پرونده", state.classId) +
          (state.classId &&
          !classes(packet).some((item) => item.id === state.classId)
            ? option(
                state.classId,
                "کلاس انتخاب‌شده دیگر موجود نیست",
                state.classId,
              )
            : "") +
          classes(packet)
            .map((c) => option(c.id, c.name, state.classId))
            .join(""),
      ),
    ) +
    field(
      "هنرجو",
      '<select id="deputyStudent" ' +
        (!state.classId ? "disabled" : "") +
        ">" +
        option(
          "",
          state.classId
            ? "همهٔ هنرجویان این کلاس"
            : "ابتدا کلاس را انتخاب کنید",
          state.studentId,
        ) +
        (state.studentId &&
        !reportStudents(packet).some(
          (student) => student.id === state.studentId,
        )
          ? option(
              state.studentId,
              "هنرجوی انتخاب‌شده دیگر موجود نیست",
              state.studentId,
            )
          : "") +
        reportStudents(packet)
          .map((student) =>
            option(
              student.id,
              student.name +
                (student.code ? " · " + student.code : "") +
                (student.archived
                  ? " · بایگانی"
                  : student.historical
                    ? " · سابقهٔ جلسه"
                    : ""),
              state.studentId,
            ),
          )
          .join("") +
        "</select>",
      !state.classId
        ? "برای گزارش هنرجو، ابتدا کلاس را انتخاب کنید."
        : "شناسهٔ هنرجو فقط در همین کلاس و پرونده معتبر است.",
    ) +
    dateFilter("from", "از تاریخ") +
    dateFilter("to", "تا تاریخ") +
    "</div></section>" +
    '<div id="deputyReportOutput">' +
    reportOutput(packet) +
    "</div>"
  );
}

function refreshDateReport(fieldName) {
  const output = document.getElementById("deputyReportOutput");
  const row = selected();
  if (!output || !row) {
    render();
    return;
  }
  // Keep the actual filters, focused input and pointer-down targets connected.
  // Native change may occur between mousedown and click or during Tab navigation.
  output.innerHTML = reportOutput(row.packet);
  syncDeputyDateProxy(fieldName);
  const rangeError = reportDateError();
  for (const [field, id] of [
    ["from", "deputyFrom"],
    ["to", "deputyTo"],
  ]) {
    const input = document.getElementById(id);
    const proxy = document.getElementById(id + "-shamsi");
    const hint = document.getElementById(id + "Hint");
    const error = state.dateErrors[field] || rangeError;
    input?.setAttribute?.("aria-invalid", String(Boolean(error)));
    proxy?.setAttribute?.("aria-invalid", String(Boolean(error)));
    if (hint) {
      hint.textContent = error || "شمسی · خالی: بدون محدودیت";
      hint.classList?.toggle("ed-date-error", Boolean(error));
    }
  }
  const printButton = host.querySelector?.('[data-deputy-action="print"]');
  if (printButton)
    printButton.disabled = Boolean(rangeError || state.reportTargetMissing);
  const status = document.getElementById("deputyMessage");
  if (status) {
    status.textContent = state.status;
    status.classList?.toggle("ed-status-error", state.error);
  }
}

function reportOutput(packet) {
  const invalidRange = reportDateError() || state.reportTargetMissing;
  const targetStudent = reportStudents(packet).find(
    (student) => student.id === state.studentId,
  );
  const targetClass = classes(packet).find((item) => item.id === state.classId);
  const studentHeading = targetStudent
    ? '<p class="ed-selected-student">هنرجو: <strong>' +
      esc(targetStudent.name) +
      "</strong>" +
      (targetStudent.code
        ? ' · کد: <bdi dir="ltr">' + esc(targetStudent.code) + "</bdi>"
        : "") +
      " · کلاس: " +
      esc(targetClass?.name || "—") +
      "</p>"
    : "";
  const all = sessions(packet);
  const totals = { present: 0, absent: 0, late: 0, leave: 0, unknown: 0 };
  for (const session of all)
    for (const person of reportParticipants(session, session.classInfo))
      totals[person.status]++;
  return invalidRange
    ? '<p class="ed-warning">' + esc(invalidRange) + "</p>"
    : '<div id="deputyPrintable" class="ed-printable"><header class="ed-print-heading"><h1>' +
        (targetStudent ? "گزارش هنرجو" : "گزارش کارتابل معاون") +
        "</h1>" +
        studentHeading +
        "<p>" +
        esc(identity(packet)) +
        "</p><p>" +
        esc(labels[state.term]) +
        " · بازه: " +
        esc(state.from ? date(state.from) : "ابتدا") +
        " تا " +
        esc(state.to ? date(state.to) : "انتها") +
        '</p></header><section class="ed-panel"><div class="ed-section-heading"><h2>' +
        esc(packet.school.name) +
        '</h2><span class="ed-badge">' +
        esc(labels[state.term]) +
        "</span></div>" +
        studentHeading +
        '<p class="ed-hint">منبع: ' +
        esc(packet.sender.name) +
        ' · کد دبیر: <bdi dir="ltr">' +
        esc(packet.sender.code) +
        '</bdi> · کد مدرسه: <bdi dir="ltr">' +
        esc(packet.school.code) +
        "</bdi> · آخرین فایل: " +
        esc(date(packet.exportedAt)) +
        '</p><div class="ed-metrics">' +
        countCard("جلسه", all.length) +
        countCard(
          "حاضر، شامل تأخیر",
          totals.present + totals.late,
          "ed-green",
        ) +
        countCard("غایب", totals.absent, "ed-red") +
        countCard("تأخیر، از حاضرین", totals.late, "ed-orange") +
        countCard("مرخصی", totals.leave, "ed-purple") +
        countCard("تعیین‌نشده", totals.unknown) +
        '</div><p class="ed-hint">واحد آمار «ثبت حضور هنرجو در جلسه» است؛ حضور یا غیبت در دو زنگ، دو مشاهده است نه دو هنرجوی متفاوت. مرخصی و تعیین‌نشده غیبت محسوب نمی‌شوند.</p></section><section class="ed-panel"><h2>جزئیات جلسات</h2>' +
        (all.map(sessionCard).join("") ||
          empty(
            "جلسه‌ای در این محدوده نیست",
            "ترم، کلاس و بازهٔ تاریخ را بررسی کنید.",
          )) +
        "</section>" +
        gradeReports(packet) +
        "</div>";
}
