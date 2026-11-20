function reportReviewHtml(m) {
  const attendance = root.EduReportCompleteness.build(m),
    academic = root.EduReportAcademicSummary.build(m);
  if (
    !m.sessions.length &&
    !academic.rows.length &&
    !academic.totals.unconfiguredRecords &&
    !academic.totals.excludedLegacyRecords
  )
    return "";
  const incompleteSessions =
    attendance.partialSessions + attendance.unrecordedSessions;
  let html =
    '<details class="report-review"><summary><strong>وضعیت ثبت و پیگیری</strong><span class="report-review-badges"><span>ثبت حضور: ' +
    (attendance.completionRate === null
      ? "بدون داده"
      : num(attendance.completionRate) + "٪") +
    "</span>" +
    (academic.rows.length
      ? '<span class="' +
        (academic.totals.needsCompensation ? "report-review-attention" : "") +
        '">نیازمند جبران: ' +
        num(academic.totals.needsCompensation) +
        " ارزشیابی</span>"
      : "") +
    '</span></summary><div class="report-review-body">';
  if (m.sessions.length) {
    html +=
      '<h4>کامل‌بودن ثبت حضور در بازهٔ گزارش</h4><dl class="report-review-metrics"><div><dt>ثبت‌شده / کل نفرـجلسه</dt><dd>' +
      num(attendance.recorded) +
      " / " +
      num(attendance.expected) +
      "</dd></div><div><dt>حضور تعیین‌نشده</dt><dd>" +
      num(attendance.unknown) +
      "</dd></div><div><dt>جلسه با حضور ناتمام</dt><dd>" +
      num(incompleteSessions) +
      "</dd></div></dl>" +
      '<p class="periodic-method">ثبت حضور شامل حاضر، تأخیر، غایب و مرخصی است. این درصد، میزان تکمیل ثبت است؛ نرخ حضور نیست. فقط جلسات ثبت‌شده بررسی می‌شوند.</p>';
    if (attendance.emptyRosterSessions)
      html +=
        '<p class="report-review-attention">' +
        num(attendance.emptyRosterSessions) +
        " جلسه فاقد مشاهدهٔ حضور است؛ کامل فرض نشده و در درصد محاسبه نمی‌شود.</p>";
    if (attendance.followup.length)
      html +=
        '<p class="report-review-followup">' +
        num(attendance.followup.length) +
        (m.audience === "parent"
          ? " هنرجو با سابقهٔ غیبت، تأخیر یا حضور تعیین‌نشده در این بازه؛ جزئیات در جمع‌بندی عملکرد و جلسات آمده است."
          : " هنرجو با سابقهٔ غیبت، تأخیر یا حضور تعیین‌نشده در این بازه؛ جزئیات را در «پیگیری وضعیت هنرجویان» ببینید.") +
        "</p>";
  }
  if (academic.rows.length) {
    html +=
      '<h4>تکمیل ارزشیابی و موارد نیازمند جبران</h4><p class="periodic-method">وضعیت فعلی نمرات رسمی سال در زمان تهیهٔ گزارش؛ هر ردیف، ارزشیابی هنرجویان همان درس، پودمان یا واحد کار است. ناقص به معنی مردودی نیست. درصد قبولی فقط از نتایج کامل و دارای معیار قبولی محاسبه می‌شود.</p><div class="report-review-table-wrap table-scroll" tabindex="0" role="region" aria-label="خلاصهٔ ارزشیابی"><table class="report-review-table" data-mobile-layout="compact"><caption>پوشش ثبت و نتیجهٔ ارزشیابی‌ها</caption><thead><tr><th scope="col">درس / ارزشیابی</th><th scope="col">کامل / کل</th><th scope="col">ناقص</th><th scope="col">قبول</th><th scope="col">جبران</th><th scope="col">بدون معیار</th><th scope="col">قبولی</th></tr></thead><tbody>';
    for (const row of academic.rows) {
      const context = [row.className, row.moduleName, row.unitName].filter(
        Boolean,
      );
      html +=
        '<tr><th scope="row"><bdi>' +
        esc(row.lessonName) +
        "</bdi><small>" +
        esc(context.join(" · ")) +
        "</small></th><td>" +
        num(row.complete) +
        " / " +
        num(row.assessments) +
        "</td><td>" +
        num(row.incomplete) +
        '</td><td class="report-review-passed">' +
        num(row.passed) +
        '</td><td class="' +
        (row.needsCompensation ? "report-review-attention" : "") +
        '">' +
        num(row.needsCompensation) +
        "</td><td>" +
        num(row.unclassified) +
        "</td><td>" +
        (row.passRate === null ? "—" : num(row.passRate) + "٪") +
        "</td></tr>";
    }
    html +=
      '</tbody></table></div><p class="periodic-method">نتیجهٔ کامل بدون معیار قبولی در شمار قبول یا جبران نیست؛ واحدهای کار مستقل‌اند و میانگین یا نتیجهٔ تجمیعی برای پودمان ساخته نمی‌شود.</p>';
    if (academic.followup.length) {
      html +=
        '<details class="report-review-learners"><summary>فهرست تکمیل ارزشیابی و جبران <span>' +
        num(academic.followup.length) +
        " مورد</span></summary><ul>";
      for (const row of academic.followup)
        html +=
          "<li><strong><bdi>" +
          esc(row.studentName) +
          '</bdi></strong><span class="' +
          (row.status === "needsCompensation"
            ? "report-review-attention"
            : "") +
          '">' +
          (row.status === "incomplete" ? "نمره ناقص" : "نیازمند جبران") +
          "</span><small>" +
          esc(
            [row.className, row.lessonName, row.moduleName, row.unitName]
              .filter(Boolean)
              .join(" · "),
          ) +
          (row.studentCode
            ? " · کد: <bdi>" + esc(row.studentCode) + "</bdi>"
            : "") +
          "</small></li>";
      html += "</ul></details>";
    }
  }
  if (academic.totals.unconfiguredRecords)
    html +=
      '<p class="report-review-attention">' +
      num(academic.totals.unconfiguredRecords) +
      " پروندهٔ ارزشیابی فاقد ساختار پودمان یا واحد کار است؛ کامل فرض نشده است. تنظیمات درس را بررسی کنید.</p>";
  if (academic.totals.excludedLegacyRecords)
    html +=
      '<p class="periodic-method">سوابق روش قدیمی واحدی، نمرهٔ رسمی پودمان نیستند و در این خلاصهٔ رسمی شمارش نمی‌شوند.</p>';
  return html + "</div></details>";
}
