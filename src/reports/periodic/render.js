function render(mode) {
  initialize(mode);
  if (mode === "annual") setTimeout(loadAnnualPeriodChoices, 0);
  const f = filters,
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
    `</h3><p>هفتگی: شنبه تا جمعه. ماهانه: ماه شمسی. سالانه: مهر تا شهریور، نوبت اول و دوم سال تحصیلی فعال. گزارش اولیا فقط اطلاعات هنرجوی انتخاب‌شده را در بر می‌گیرد.</p><div class="periodic-control-grid"><label>مخاطب<select data-legacy-change="reports-periodic-render:0">` +
    option("management", "مدیریت مدرسه", f.audience) +
    option("parent", "اولیای یک هنرجو", f.audience) +
    "</select></label>" +
    (mode === "annual"
      ? '<div class="periodic-year-field"><span>سال تحصیلی</span><strong>' +
        esc(db.settings.academicYear) +
        "</strong></div>"
      : "<label>" +
        (mode === "weekly"
          ? "یک تاریخ از هفته"
          : mode === "monthly"
            ? "یک تاریخ از ماه شمسی"
            : "تاریخ گزارش") +
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
  if (mode === "annual") {
    for (const [field, id, label] of [
      ["annualFirstId", "annualFirstPeriod", "اطلاعات نوبت اول"],
      ["annualSecondId", "annualSecondPeriod", "اطلاعات نوبت دوم"],
    ])
      h +=
        `<label>${label}<select id="${id}" data-legacy-change="reports-periodic-render:4" data-legacy-change-arg2="${esc(field)}">` +
        option("", "انتخاب خودکار در صورت نبود ابهام", f[field]) +
        annualPeriodOptions(field)
          .map((row) =>
            option(row.id, row.term + (row.closed ? " · بسته" : ""), f[field]),
          )
          .join("") +
        "</select></label>";
  }
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
    '<label>نام تنظیم‌کننده (اختیاری)<input value="' +
    esc(f.author) +
    `" maxlength="200" data-legacy-input="reports-periodic-render:7"></label></div><label class="periodic-note-field">توضیحات این گزارش (اختیاری)<textarea rows="3" maxlength="` +
    Math.max(10000, readNote(noteKey(f)).length) +
    `" data-legacy-input="reports-periodic-render:8">` +
    esc(readNote(noteKey(f))) +
    '</textarea></label><div id="periodicNoteStatus">' +
    noteWarning() +
    `</div><button class="periodic-build" data-legacy-click="reports-periodic-render:9">تهیه گزارش ` +
    modeLabel(mode) +
    '</button><p id="periodicError" role="alert"></p></section><div id="periodicReportOutput">';
  h +=
    last && last.signature === reportSignature()
      ? documentHtml(last.model)
      : '<div class="card empty" role="status">' +
        (last
          ? "اطلاعات یا دوره تغییر کرده است؛ برای نمایش نتیجه معتبر، گزارش را دوباره تهیه کنید."
          : "محدوده و مخاطب را انتخاب کنید و «تهیه گزارش» را بزنید.") +
        "</div>";
  return h + "</div>";
}
