// One complete academic sheet per student; shared domain functions own all grades.
function karnamehSheetNumber(value) {
  return String(value).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
}
function karnamehReportStudents(c) {
  return getSortedStudents({
    students: [
      ...new Map(
        [...c.students, ...(c.archivedStudents || [])].map((student) => [
          student.id,
          student,
        ]),
      ).values(),
    ],
  });
}
function createKarnamehStudentNavigation(c, student) {
  const students = karnamehReportStudents(c);
  const index = students.findIndex((item) => item.id === student.id);
  const button = (target, label, direction) =>
    '<button type="button" class="ghost" data-karnameh-nav="' +
    direction +
    '" data-workspace-action="karnameh-student" data-class="' +
    esc(c.id) +
    '" data-key="' +
    esc(target?.id || "") +
    '"' +
    (!target ? " disabled" : "") +
    ">" +
    label +
    "</button>";
  return (
    '<nav class="karnameh-student-pagination no-print" aria-label="جابه‌جایی بین کارنامه هنرجویان">' +
    button(students[index - 1], "هنرجوی قبلی", "previous") +
    '<span class="karnameh-student-position">' +
    karnamehSheetNumber(index + 1) +
    " از " +
    karnamehSheetNumber(students.length) +
    " هنرجو</span>" +
    button(students[index + 1], "هنرجوی بعدی", "next") +
    "</nav>"
  );
}
function karnamehSheetCell(
  value,
  label,
  { result = null, annual = false, field = "", note = "" } = {},
) {
  const complete = result ? result.complete === true : Number.isFinite(value);
  const hasGrade = complete && Number.isFinite(result ? result.final : value);
  const failed = complete && result?.passed === false;
  const tone = !complete
    ? "pending"
    : failed
      ? "remedial"
      : annual && result?.passed === true
        ? "passed"
        : "complete";
  const status = !complete
    ? "تکمیل نشده"
    : failed
      ? "نیازمند جبران"
      : result?.passed === true
        ? "قبول"
        : "ثبت‌شده";
  const display = hasGrade
    ? karnamehSheetNumber(
        result ? finalText(result) : finalText({ final: value }),
      )
    : failed
      ? "جبران"
      : "—";
  return (
    '<td class="karnameh-sheet-score' +
    (annual ? " karnameh-sheet-annual" : "") +
    '" data-karnameh-field="' +
    esc(field) +
    '" data-grade-complete="' +
    complete +
    '">' +
    (note
      ? '<small class="karnameh-module-name">' + esc(note) + "</small>"
      : "") +
    '<span class="karnameh-sheet-value" data-grade-tone="' +
    tone +
    '" title="' +
    esc(label + " · " + status) +
    '" aria-label="' +
    esc(label + "؛ " + status + (hasGrade ? "؛ " + display : "")) +
    '">' +
    esc(display) +
    "</span>" +
    (annual
      ? '<small class="karnameh-result-status">' + esc(status) + "</small>"
      : "") +
    "</td>"
  );
}
function karnamehLessonName(lesson, index, note = "") {
  return (
    '<th scope="row" class="karnameh-lesson-name"><span class="karnameh-lesson-index">' +
    karnamehSheetNumber(index + 1) +
    '</span><span class="karnameh-lesson-title">' +
    esc(lesson.name) +
    (note ? "<small>" + esc(note) + "</small>" : "") +
    "</span></th>"
  );
}
function karnamehSheetSection(title, note, table) {
  return (
    '<section class="karnameh-subject-section"><header><h4>' +
    esc(title) +
    "</h4><small>" +
    esc(note) +
    '</small></header><div class="table-scroll karnameh-sheet-scroll" tabindex="0" role="region" aria-label="' +
    esc(title + "؛ برای دیدن تمام نمرات جدول را به طرفین حرکت دهید") +
    '">' +
    table +
    "</div></section>"
  );
}
function individualKarnameh(c, options = {}) {
  const student = options.student;
  if (!student)
    return (
      '<div class="card report-empty" role="status"><h3>کارنامه هنرجو</h3><p>' +
      (c.students.length
        ? "یک هنرجو انتخاب کنید."
        : "هنوز هنرجوی فعالی در این کلاس ثبت نشده است.") +
      "</p></div>"
    );
  const lessons = c.lessons || [],
    parts = options.parts || [],
    schoolId = options.schoolId;
  const assessmentLessons = lessons.filter(
    (lesson) => lesson.gradeMode === "kardanesh",
  );
  const academicRows = assessmentLessons.length
    ? new Map(
        annualGradeRows(parts, schoolId, c.id, student.id).map((row) => [
          row.lessonId,
          row,
        ]),
      )
    : new Map();
  const stages = [
    { term: "اول", stage: "midterm", label: "میان‌ترم اول" },
    { term: "اول", stage: "final", label: "پایان‌ترم اول" },
    { term: "دوم", stage: "midterm", label: "میان‌ترم دوم" },
    { term: "دوم", stage: "final", label: "پایان‌ترم دوم" },
  ];
  const assessmentTable = (items, general) => {
    const fields = general
      ? [["theory", "نمره"]]
      : [
          ["practical", "عملی"],
          ["theory", "نظری"],
          ["result", "نتیجه"],
        ];
    return (
      '<table class="karnameh-sheet-table ' +
      (general ? "karnameh-general-table" : "karnameh-assessment-table") +
      '" data-mobile-layout="table"><caption class="sr-only">' +
      esc((general ? "دروس عمومی" : "دروس کاردانش") + " · " + student.name) +
      '</caption><thead><tr><th scope="col" rowspan="2" class="karnameh-lesson-name">درس</th>' +
      stages
        .map(
          (stage) =>
            '<th scope="colgroup" colspan="' +
            fields.length +
            '" class="karnameh-stage-group"><span>' +
            esc(stage.label) +
            "</span></th>",
        )
        .join("") +
      '<th scope="col" rowspan="2" class="karnameh-sheet-annual">نتیجهٔ سالانه</th></tr><tr>' +
      stages
        .map(() =>
          fields
            .map(
              ([field, title]) =>
                '<th scope="col" data-karnameh-column="' +
                field +
                '">' +
                title +
                "</th>",
            )
            .join(""),
        )
        .join("") +
      "</tr></thead><tbody>" +
      items
        .map((lesson, index) => {
          const row = academicRows.get(lesson.id);
          const weights = assessmentWeights(lesson);
          const note = general
            ? "نمره مستقیم از ۲۰"
            : "عملی " +
              karnamehSheetNumber(weights.practical) +
              "٪ · نظری " +
              karnamehSheetNumber(weights.theory) +
              "٪";
          return (
            '<tr data-karnameh-lesson="' +
            esc(lesson.id) +
            '" data-karnameh-lesson-row="' +
            esc(lesson.id) +
            '" data-grade-mode="' +
            (general ? "general" : "kardanesh") +
            '">' +
            karnamehLessonName(lesson, index, note) +
            stages
              .map((stage) => {
                const component = row?.components.find(
                  (item) =>
                    item.term === stage.term && item.stage === stage.stage,
                );
                return fields
                  .map(([field, title]) =>
                    karnamehSheetCell(
                      field === "result" ? null : component?.[field],
                      lesson.name + " · " + stage.label + " · " + title,
                      {
                        field,
                        result:
                          field === "result"
                            ? component || { complete: false }
                            : null,
                      },
                    ),
                  )
                  .join("");
              })
              .join("") +
            karnamehSheetCell(null, lesson.name + " · نتیجهٔ سالانه", {
              result: row || { complete: false },
              annual: true,
              field: "annual",
            }) +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table>"
    );
  };
  let body = "";
  const vocational = assessmentLessons.filter(
    (lesson) => lesson.gradingPolicy?.subjectType !== "general",
  );
  const general = assessmentLessons.filter(
    (lesson) => lesson.gradingPolicy?.subjectType === "general",
  );
  if (vocational.length)
    body += karnamehSheetSection(
      "دروس کاردانش",
      "هر مرحله: عملی، نظری و نتیجهٔ وزنی · نتیجهٔ سالانه: میانگین برابر چهار مرحلهٔ کامل",
      assessmentTable(vocational, false),
    );
  if (general.length)
    body += karnamehSheetSection(
      "دروس عمومی",
      "نمرهٔ مستقیم هر مرحله از ۲۰ · نتیجهٔ سالانه پس از تکمیل هر چهار مرحله",
      assessmentTable(general, true),
    );
  const modular = lessons.filter(
    (lesson) =>
      lesson.gradeMode !== "kardanesh" &&
      lesson.gradingPolicy?.method === "modular",
  );
  if (modular.length) {
    const count = Math.max(...modular.map((lesson) => lesson.poudmans.length));
    const table =
      '<table class="karnameh-sheet-table karnameh-modular-table" data-mobile-layout="table"><caption class="sr-only">' +
      esc("دروس فنی پودمانی · " + student.name) +
      '</caption><thead><tr><th scope="col" rowspan="2" class="karnameh-lesson-name">درس</th>' +
      Array.from(
        { length: count },
        (_, index) =>
          '<th scope="colgroup" colspan="3" class="karnameh-stage-group"><span>پودمان ' +
          karnamehSheetNumber(index + 1) +
          "</span></th>",
      ).join("") +
      '<th scope="col" rowspan="2" class="karnameh-sheet-annual">نتیجهٔ سالانه</th></tr><tr>' +
      Array.from(
        { length: count },
        () =>
          '<th scope="col">مستمر</th><th scope="col">شایستگی</th><th scope="col">نتیجه</th>',
      ).join("") +
      "</tr></thead><tbody>" +
      modular
        .map((lesson, index) => {
          const merged = annualModularLesson(
            parts,
            schoolId,
            c.id,
            lesson,
            student.id,
          );
          const result = EduReportGrades.modular(merged, student.id);
          return (
            '<tr data-karnameh-lesson="' +
            esc(lesson.id) +
            '" data-karnameh-lesson-row="' +
            esc(lesson.id) +
            '" data-grade-mode="modular">' +
            karnamehLessonName(lesson, index, "ارزشیابی پودمانی سالانه") +
            Array.from({ length: count }, (_, position) => {
              const pod = lesson.poudmans[position];
              if (!pod)
                return (
                  '<td colspan="3" class="karnameh-module-na" aria-label="این درس پودمان ' +
                  karnamehSheetNumber(position + 1) +
                  ' ندارد">ندارد</td>'
                );
              const module = result.modules.find((item) => item.id === pod.id);
              const raw = ownScoreRecord(
                merged.poudmans.find((item) => item.id === pod.id)?.podScores,
                student.id,
              );
              const label = lesson.name + " · " + pod.name;
              return (
                karnamehSheetCell(raw.m, label + " · مستمر", {
                  field: "continuous",
                  note: pod.name,
                }) +
                karnamehSheetCell(raw.c, label + " · شایستگی", {
                  field: "competency",
                }) +
                karnamehSheetCell(null, label + " · نتیجه", {
                  result: module || { complete: false },
                  field: "module-result",
                })
              );
            }).join("") +
            karnamehSheetCell(null, lesson.name + " · نتیجهٔ سالانه", {
              result,
              annual: true,
              field: "annual",
            }) +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table>";
    body += karnamehSheetSection(
      "دروس فنی پودمانی",
      "نمرات پودمان‌ها سالانه‌اند؛ نتیجهٔ درس به تکمیل و قبولی همهٔ پودمان‌ها وابسته است.",
      table,
    );
  }
  const legacy = lessons.filter(
    (lesson) =>
      lesson.gradeMode !== "kardanesh" &&
      lesson.gradingPolicy?.method !== "modular",
  );
  if (legacy.length) {
    const rows = annualTechnicalRows(parts, schoolId, c.id, student.id);
    const table =
      '<table class="karnameh-sheet-table karnameh-legacy-table" data-mobile-layout="table"><caption class="sr-only">' +
      esc("سوابق نمرات واحدی · " + student.name) +
      '</caption><thead><tr><th rowspan="2" scope="col" class="karnameh-lesson-name">درس</th>' +
      '<th scope="col" class="karnameh-stage-group"><span>نوبت اول</span></th><th scope="col" class="karnameh-stage-group"><span>نوبت دوم</span></th></tr>' +
      '<tr><th scope="col">نمرات ثبت‌شده</th><th scope="col">نمرات ثبت‌شده</th></tr></thead><tbody>' +
      legacy
        .map(
          (lesson, index) =>
            '<tr data-karnameh-lesson="' +
            esc(lesson.id) +
            '" data-karnameh-lesson-row="' +
            esc(lesson.id) +
            '" data-grade-mode="legacy">' +
            karnamehLessonName(lesson, index) +
            ["اول", "دوم"]
              .map((term) => {
                const row = rows.find(
                  (item) => item.lessonId === lesson.id && item.term === term,
                );
                return (
                  '<td class="karnameh-legacy-cell"><span class="karnameh-legacy-result">نتیجه: ' +
                  (row?.complete && Number.isFinite(row.final)
                    ? esc(karnamehSheetNumber(finalText(row)))
                    : "—") +
                  "</span>" +
                  (row?.legacyUnits?.length
                    ? '<ul class="karnameh-unit-list">' +
                      row.legacyUnits
                        .map(
                          (unit) =>
                            "<li><strong>" +
                            esc(unit.moduleName + " / " + unit.unitName) +
                            "</strong><span>مستمر " +
                            (unit.mostamar == null
                              ? "—"
                              : esc(karnamehSheetNumber(unit.mostamar))) +
                            " · پایانی " +
                            (unit.payani == null
                              ? "—"
                              : esc(karnamehSheetNumber(unit.payani))) +
                            " · نتیجه " +
                            (unit.final == null
                              ? "—"
                              : esc(karnamehSheetNumber(unit.final))) +
                            "</span></li>",
                        )
                        .join("") +
                      "</ul>"
                    : "") +
                  "</td>"
                );
              })
              .join("") +
            "</tr>",
        )
        .join("") +
      "</tbody></table>";
    body += karnamehSheetSection(
      "سوابق نمرات واحدی",
      "نتیجهٔ هر نوبت و نمرات واقعی واحدها؛ بدون ساخت نمرهٔ سالانهٔ حدسی",
      table,
    );
  }
  const archived = !c.students.some((item) => item.id === student.id);
  return (
    '<article class="card report-document grade-report karnameh-student-sheet" data-student-id="' +
    esc(student.id) +
    '"><header class="karnameh-report-heading"><div><span class="karnameh-report-kind">کارنامهٔ فردی سال تحصیلی</span><h3>' +
    esc(student.name) +
    "</h3><p>" +
    esc(
      [options.schoolName, c.name, workspace.year].filter(Boolean).join(" · "),
    ) +
    '</p></div><div class="karnameh-report-actions no-print"><button type="button" data-workspace-action="print">چاپ / PDF</button></div></header>' +
    '<div class="karnameh-student-meta"><span>کد هنرجو: <strong>' +
    esc(
      student.code == null || student.code === ""
        ? "—"
        : karnamehSheetNumber(student.code),
    ) +
    "</strong></span><span>" +
    karnamehSheetNumber(lessons.length) +
    " درس</span>" +
    (archived ? '<span class="karnameh-archived-tag">بایگانی</span>' : "") +
    "</div>" +
    createKarnamehStudentNavigation(c, student) +
    (body
      ? '<p class="karnameh-sheet-hint no-print">برای دیدن همهٔ ستون‌های نمره، جدول را به طرفین حرکت دهید.</p>' +
        body
      : '<div class="report-empty" role="status">هنوز درسی در این کلاس تعریف نشده است.</div>') +
    '<p class="karnameh-sheet-note">«—» نمرهٔ ثبت‌نشده یا نتیجهٔ تکمیل‌نشده است؛ صفر، نمرهٔ ثبت‌شده است. نمرات جلسه و فعالیت از امتحان رسمی جدا هستند.</p></article>'
  );
}
