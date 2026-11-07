function render(mode) {
  initialize(mode);
  if (mode === "annual") setTimeout(loadAnnualPeriodChoices, 0);
  const f = filters,
    prepared = last && last.signature === reportSignature(),
    school = db.schools.find((s) => s.id === f.schoolId),
    c = school?.classes.find((c) => c.id === f.classId);
  const people = new Map(
    [...(c?.students || []), ...(c?.archivedStudents || [])].map((st) => [
      st.id,
      st,
    ]),
  );
  if (c)
    for (const x of db.sessions.filter(
      (x) => x.schoolId === school.id && x.classId === c.id,
    ))
      for (const st of x.roster || [])
        if (!people.has(st.id)) people.set(st.id, st);
  const option = (value, label, chosen) =>
    '<option value="' +
    esc(value) +
    '" ' +
    (value === chosen ? "selected" : "") +
    ">" +
    esc(label) +
    "</option>";
  let h =
    '<section class="card periodic-controls no-print"><h3>تهیه گزارش ' +
    modeLabel(mode) +
    '</h3><p class="periodic-scope-note"><span class="periodic-scope-full">' +
    (mode === "annual"
      ? "گزارش سالانه از ترم اول و دوم همین سال تحصیلی تهیه می‌شود. "
      : "جلسات و فعالیت‌های گزارش فقط از ترم انتخاب‌شده، در بازهٔ انتخابی خوانده می‌شوند. ") +
    `گزارش اولیا فقط اطلاعات هنرجوی انتخاب‌شده را در بر می‌گیرد.</span><span class="periodic-scope-compact">${mode === "annual" ? "هر دو ترم همین سال تحصیلی؛ اولیا فقط هنرجوی انتخاب‌شده." : "فقط ترم و بازهٔ انتخابی؛ اولیا فقط هنرجوی انتخاب‌شده."}</span></p><div class="periodic-control-grid"><label>مخاطب<select data-legacy-change="reports-periodic-render:0">` +
    option("management", "مدیریت مدرسه", f.audience) +
    option("parent", "اولیای یک هنرجو", f.audience) +
    "</select></label>" +
    (mode === "annual"
      ? '<div class="periodic-year-field"><span>سال تحصیلی</span><strong>' +
        esc(db.settings.academicYear) +
        "</strong></div>"
      : mode === "weekly"
        ? '<label>از تاریخ<input type="date" value="' +
          esc(f.startDate) +
          '" data-legacy-change="reports-periodic-render:4" data-legacy-change-arg2="startDate"></label><label>تا تاریخ<input type="date" min="' +
          esc(f.startDate) +
          '" value="' +
          esc(f.endDate) +
          '" data-legacy-change="reports-periodic-render:4" data-legacy-change-arg2="endDate"></label>'
        : "<label>" +
          (mode === "monthly" ? "یک تاریخ از ماه گزارش" : "تاریخ گزارش") +
          '<input type="date" value="' +
          esc(f.date) +
          '" data-legacy-change="reports-periodic-render:1"></label>') +
    `<label>مدرسه<select data-legacy-change="reports-periodic-render:2">` +
    option("", "انتخاب مدرسه", f.schoolId) +
    db.schools.map((s) => option(s.id, s.name, f.schoolId)).join("") +
    `</select></label><label>کلاس<select data-legacy-change="reports-periodic-render:3">` +
    option(
      "",
      f.audience === "parent" ? "انتخاب کلاس" : "همه کلاس‌های این مدرسه",
      f.classId,
    ) +
    (school?.classes || [])
      .map((c) => option(c.id, c.name, f.classId))
      .join("") +
    "</select></label>";
  if (mode === "annual")
    h +=
      '<div class="periodic-year-field"><span id="annualSourceStatus">اطلاعات ترم اول و دوم همین سال به‌صورت خودکار خوانده می‌شوند.</span><button type="button" class="ghost" data-workspace-action="periods">سال تحصیلی و دو ترم</button></div>';
  if (f.audience === "parent")
    h +=
      `<label>هنرجو<select data-legacy-change="reports-periodic-render:5">` +
      option("", "انتخاب هنرجو", f.studentId) +
      [...people.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "fa"))
        .map((st) =>
          option(
            st.id,
            st.name + (st.code ? " — " + st.code : ""),
            f.studentId,
          ),
        )
        .join("") +
      "</select></label>";
  if (f.audience === "management")
    h +=
      `<label>سطح جزئیات<select data-legacy-change="reports-periodic-render:6"><option value="summary" ` +
      (f.detailLevel === "summary" ? "selected" : "") +
      '>خلاصه مدیریتی و فعالیت‌ها</option><option value="full" ' +
      (f.detailLevel === "full" ? "selected" : "") +
      ">جزئیات کامل حضور هر جلسه</option></select></label>";
  h +=
    '</div><div id="periodicNoteStatus">' +
    noteWarning() +
    `</div><div class="periodic-primary-actions"><button type="button" class="periodic-build" ${busy ? "disabled" : ""} data-legacy-click="reports-periodic-render:9">تهیه گزارش ` +
    modeLabel(mode) +
    '</button><button type="button" class="success periodic-deputy" data-deputy-copy' +
    (busy || !prepared ? " disabled" : "") +
    ' data-legacy-click="reports-periodic-document:deputy">کپی برای معاون</button></div><p id="periodicError" role="alert"></p></section><div id="periodicReportOutput">';
  h += prepared
    ? documentHtml(last.model, last.gradeHtml)
    : '<div class="card empty" role="status">' +
      (last
        ? "اطلاعات یا ترم تغییر کرده است؛ برای نمایش نتیجه معتبر، گزارش را دوباره تهیه کنید."
        : "محدوده و مخاطب را انتخاب کنید و «تهیه گزارش» را بزنید.") +
      "</div>";
  if (prepared && last.gradeHtml) {
    const preparedReport = last;
    setTimeout(() => initializeReportKarnameh(preparedReport), 0);
  }
  return h + "</div>";
}
