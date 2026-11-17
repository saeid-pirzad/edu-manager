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
  { result = null, field = "", note = "", unitContext = null } = {},
) {
  const complete = result ? result.complete === true : Number.isFinite(value);
  const hasGrade = complete && Number.isFinite(result ? result.final : value);
  const failed = complete && result?.passed === false;
  const tone = !complete ? "pending" : failed ? "remedial" : "complete";
  const status = !complete
    ? "تکمیل نشده"
    : failed
      ? "نیازمند جبران"
      : result?.passed === true
        ? "قبول"
        : "ثبت‌شده";
  const display = hasGrade
    ? karnamehSheetNumber(
        result
          ? finalText(result)
          : Number(value.toFixed(2)) === value
            ? finalText({ final: value })
            : String(value),
      )
    : failed
      ? "جبران"
      : "—";
  return (
    '<td class="karnameh-sheet-score" data-karnameh-field="' +
    esc(field) +
    '" data-grade-complete="' +
    complete +
    '"' +
    (unitContext
      ? ' data-karnameh-module="' +
        esc(unitContext.moduleId) +
        '" data-karnameh-unit="' +
        esc(unitContext.unitId) +
        '" data-karnameh-unit-position="' +
        unitContext.position +
        '" data-karnameh-module-position="' +
        unitContext.modulePosition +
        '" data-karnameh-unit-index="' +
        unitContext.unitIndex +
        '"'
      : "") +
    ">" +
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
    "</span></td>"
  );
}
function karnamehLessonName(lesson, index, note = "", context = "") {
  return (
    '<th scope="row" class="karnameh-lesson-name"><span class="karnameh-lesson-index">' +
    karnamehSheetNumber(index + 1) +
    '</span><span class="karnameh-lesson-title">' +
    esc(lesson.name) +
    (note ? "<small>" + esc(note) + "</small>" : "") +
    "</span>" +
    context +
    "</th>"
  );
}
function karnamehSheetSection(title, table) {
  return (
    '<section class="karnameh-subject-section"><header class="karnameh-subject-header"><h4>' +
    esc(title) +
    '</h4></header><div class="table-scroll karnameh-sheet-scroll" tabindex="0" role="region" aria-label="' +
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
      "</tr><tr>" +
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
      assessmentTable(vocational, false),
    );
  if (general.length)
    body += karnamehSheetSection("دروس عمومی", assessmentTable(general, true));
  const modular = lessons.filter(
    (lesson) =>
      lesson.gradeMode !== "kardanesh" &&
      lesson.gradingPolicy?.method === "modular" &&
      !EduPolicy.unitBased(lesson.gradingPolicy),
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
      "</tr><tr>" +
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
            karnamehLessonName(lesson, index, "ارزشیابی پودمانی") +
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
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table>";
    body += karnamehSheetSection("دروس فنی پودمانی", table);
  }
  const unitBasedLessons = lessons.filter((lesson) =>
    EduPolicy.unitBased(lesson.gradingPolicy),
  );
  if (unitBasedLessons.length) {
    const unitLessons = unitBasedLessons.map((lesson) => {
      const merged = annualModularLesson(
        parts,
        schoolId,
        c.id,
        lesson,
        student.id,
      );
      return {
        lesson,
        modules: EduReportGrades.modular(merged, student.id).modules,
      };
    });
    const moduleCount = Math.max(
      ...unitLessons.map((item) => item.modules.length),
    );
    const slots = Array.from({ length: moduleCount }, (_, modulePosition) => {
      const unitCount = Math.max(
        ...unitLessons.map(
          (item) => item.modules[modulePosition]?.units.length || 0,
        ),
      );
      return Array.from({ length: unitCount }, (_, unitIndex) => ({
        modulePosition,
        unitIndex,
        key: "unit-" + modulePosition + "-" + unitIndex,
        label:
          "پودمان " +
          karnamehSheetNumber(modulePosition + 1) +
          " · واحد کار " +
          karnamehSheetNumber(unitIndex + 1),
      }));
    }).flat();
    const slotAttributes = (slot, position) =>
      ' data-karnameh-unit-position="' +
      position +
      '" data-karnameh-module-position="' +
      slot.modulePosition +
      '" data-karnameh-unit-index="' +
      slot.unitIndex +
      '"';
    const rows = unitLessons.map(
      ({ lesson, modules }, lessonIndex) =>
        '<tr data-karnameh-lesson="' +
        esc(lesson.id) +
        '" data-karnameh-lesson-row="' +
        esc(lesson.id) +
        '" data-grade-mode="modular-unit">' +
        karnamehLessonName(
          lesson,
          lessonIndex,
          "",
          slots
            .map((slot) => {
              const module = modules[slot.modulePosition];
              const unit = module?.units[slot.unitIndex];
              const moduleName =
                module?.name ||
                "پودمان " +
                  karnamehSheetNumber(slot.modulePosition + 1) +
                  " تعریف نشده است";
              const unitName = unit?.name || "واحد کار تعریف نشده است";
              return (
                '<small class="karnameh-unit-context no-print" data-karnameh-group="' +
                slot.key +
                '" title="' +
                esc(moduleName + " · " + unitName) +
                '"><span>' +
                esc(moduleName) +
                "</span><span>" +
                esc(unitName) +
                "</span></small>"
              );
            })
            .join(""),
        ) +
        slots
          .map((slot, position) => {
            const module = modules[slot.modulePosition];
            const unit = module?.units[slot.unitIndex];
            if (!unit)
              return (
                '<td colspan="3" class="karnameh-module-na" data-karnameh-unit-unavailable="true"' +
                slotAttributes(slot, position) +
                ' aria-label="' +
                esc(
                  lesson.name +
                    "؛ " +
                    slot.label +
                    "؛ " +
                    (module
                      ? module.name +
                        "، واحد کار " +
                        karnamehSheetNumber(slot.unitIndex + 1) +
                        " تعریف نشده است"
                      : "پودمان " +
                        karnamehSheetNumber(slot.modulePosition + 1) +
                        " تعریف نشده است"),
                ) +
                '">ندارد</td>'
              );
            const label = lesson.name + " · " + module.name + " · " + unit.name;
            const unitContext = {
              moduleId: module.id,
              unitId: unit.id,
              position,
              modulePosition: slot.modulePosition,
              unitIndex: slot.unitIndex,
            };
            return (
              karnamehSheetCell(unit.inputs.m, label + " · مستمر", {
                field: "continuous",
                unitContext,
              }) +
              karnamehSheetCell(unit.inputs.c, label + " · شایستگی", {
                field: "competency",
                unitContext,
              }) +
              karnamehSheetCell(null, label + " · نتیجه واحد کار", {
                result: unit,
                field: "unit-result",
                unitContext,
              })
            );
          })
          .join("") +
        "</tr>",
    );
    const table =
      '<table class="karnameh-sheet-table karnameh-unit-competency-table" data-mobile-layout="table" data-karnameh-unit-count="' +
      slots.length +
      '"><caption class="sr-only">' +
      esc("دروس واحد کار · نمرات مستقل واحدهای کار · " + student.name) +
      '</caption><thead><tr><th scope="col" rowspan="2" class="karnameh-lesson-name">درس</th>' +
      slots
        .map(
          (slot, position) =>
            '<th scope="colgroup" colspan="3" class="karnameh-stage-group"' +
            slotAttributes(slot, position) +
            "><span>" +
            esc(slot.label) +
            "</span></th>",
        )
        .join("") +
      "</tr><tr>" +
      Array.from(
        { length: slots.length },
        () =>
          '<th scope="col">مستمر</th><th scope="col">شایستگی</th><th scope="col">نتیجه</th>',
      ).join("") +
      "</tr></thead><tbody>" +
      rows.join("") +
      "</tbody></table>";
    body += karnamehSheetSection("دروس واحد کار", table);
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
    body += karnamehSheetSection("سوابق نمرات واحدی", table);
  }
  const archived = !c.students.some((item) => item.id === student.id);
  return (
    '<article class="card report-document grade-report karnameh-student-sheet" data-student-id="' +
    esc(student.id) +
    '" data-karnameh-school="' +
    esc(options.schoolName || "") +
    '" data-karnameh-class="' +
    esc(c.name || "") +
    '" data-karnameh-year="' +
    esc(karnamehSheetNumber(workspace.year || "")) +
    '" data-karnameh-code="' +
    esc(
      student.code == null || student.code === ""
        ? "—"
        : karnamehSheetNumber(student.code),
    ) +
    '"><header class="karnameh-report-heading"><div><span class="karnameh-report-kind">کارنامهٔ فردی سال تحصیلی</span><h3>' +
    esc(student.name) +
    "</h3><p>" +
    esc(
      [options.schoolName, c.name, workspace.year].filter(Boolean).join(" · "),
    ) +
    "</p></div>" +
    (options.embedded
      ? ""
      : '<div class="karnameh-report-actions no-print"><button type="button" data-workspace-action="print">چاپ / PDF</button></div>') +
    "</header>" +
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
    (options.embedded ? "" : createKarnamehStudentNavigation(c, student)) +
    (body
      ? body
      : '<div class="report-empty" role="status">هنوز درسی در این کلاس تعریف نشده است.</div>') +
    '<p class="karnameh-sheet-note">«—» نمرهٔ ثبت‌نشده یا نتیجهٔ تکمیل‌نشده است؛ صفر، نمرهٔ ثبت‌شده است. نمرات جلسه و فعالیت از امتحان رسمی جدا هستند.</p></article>'
  );
}

// Compact screens select one grade group; every original cell remains printable.
const karnamehStageControllers = new WeakMap();
let karnamehStageSelection = {
  scope: "",
  assessment: "first-midterm",
  modular: "module-0",
  unit: "unit-0-0",
  legacy: "first-term",
};

function karnamehStagePreference(schoolId, classId) {
  const scope = JSON.stringify([
    workspace.id,
    workspace.year,
    schoolId,
    classId,
  ]);
  if (karnamehStageSelection.scope !== scope)
    karnamehStageSelection = {
      scope,
      assessment: "first-midterm",
      modular: "module-0",
      unit: "unit-0-0",
      legacy: "first-term",
    };
  return karnamehStageSelection;
}
function karnamehTableStageGroups(table) {
  if (
    table.classList.contains("karnameh-assessment-table") ||
    table.classList.contains("karnameh-general-table")
  ) {
    const width = table.classList.contains("karnameh-general-table") ? 1 : 3;
    return [
      { key: "first-midterm", label: "میان‌ترم اول", width },
      { key: "first-final", label: "پایان‌ترم اول", width },
      { key: "second-midterm", label: "میان‌ترم دوم", width },
      { key: "second-final", label: "پایان‌ترم دوم", width },
    ];
  }
  if (table.classList.contains("karnameh-modular-table")) {
    const count = Math.max(0, table.tHead.rows[0].cells.length - 1);
    return Array.from({ length: count }, (_, index) => ({
      key: "module-" + index,
      label: "پودمان " + karnamehSheetNumber(index + 1),
      width: 3,
    }));
  }
  if (table.classList.contains("karnameh-unit-competency-table")) {
    return [...table.tHead.rows[0].cells].slice(1).map((header) => {
      const modulePosition = Number(header.dataset.karnamehModulePosition);
      const unitIndex = Number(header.dataset.karnamehUnitIndex);
      return {
        key: "unit-" + modulePosition + "-" + unitIndex,
        label:
          "پودمان " +
          karnamehSheetNumber(modulePosition + 1) +
          " · واحد کار " +
          karnamehSheetNumber(unitIndex + 1),
        shortLabel: karnamehSheetNumber(unitIndex + 1),
        modulePosition,
        unitIndex,
        width: 3,
      };
    });
  }
  if (table.classList.contains("karnameh-legacy-table"))
    return [
      { key: "first-term", label: "نوبت اول", width: 1 },
      { key: "second-term", label: "نوبت دوم", width: 1 },
    ];
  return [];
}
function karnamehTableStageOptions(table) {
  return karnamehTableStageGroups(table);
}
function applyKarnamehStage(report, kind, selected) {
  for (const section of report.querySelectorAll(".karnameh-subject-section")) {
    if (section.dataset.karnamehGroupSet !== kind) continue;
    const buttons = [...section.querySelectorAll("[data-karnameh-stage]")],
      selectedButton =
        buttons.find((button) => button.dataset.karnamehStage === selected) ||
        buttons.find(
          (button) =>
            button.dataset.karnamehStage ===
            section.dataset.karnamehActiveGroup,
        ) ||
        buttons[0];
    if (!selectedButton) continue;
    const activeStage = selectedButton.dataset.karnamehStage;
    const activeModule = selectedButton.dataset.karnamehUnitModule;
    section.dataset.karnamehActiveGroup = activeStage;
    section.querySelector("table").dataset.karnamehActiveGroup = activeStage;
    for (const cell of section.querySelectorAll("[data-karnameh-group]"))
      cell.toggleAttribute(
        "data-karnameh-group-active",
        cell.dataset.karnamehGroup === activeStage,
      );
    for (const button of buttons) {
      const active = button.dataset.karnamehStage === activeStage;
      if (kind === "unit")
        button.hidden = button.dataset.karnamehUnitModule !== activeModule;
      button.setAttribute("aria-pressed", String(active));
      const options = button.parentElement;
      if (active && options && options.scrollWidth > options.clientWidth) {
        const frame = options.getBoundingClientRect(),
          bounds = button.getBoundingClientRect();
        if (bounds.left < frame.left + 4)
          options.scrollLeft += bounds.left - frame.left - 4;
        else if (bounds.right > frame.right - 4)
          options.scrollLeft += bounds.right - frame.right + 4;
      }
    }
    if (kind === "unit")
      for (const button of section.querySelectorAll(
        "[data-karnameh-unit-module]:not([data-karnameh-stage])",
      ))
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.karnamehUnitModule === activeModule),
        );
    const scroll = section.querySelector(".karnameh-sheet-scroll");
    if (scroll) scroll.scrollLeft = 0;
  }
}
function initKarnamehStageControls(
  report,
  { schoolId, classId, validate = null },
) {
  const preference = validate
    ? {
        assessment: "first-midterm",
        modular: "module-0",
        unit: "unit-0-0",
        legacy: "first-term",
      }
    : karnamehStagePreference(schoolId, classId);
  for (const section of report.querySelectorAll(".karnameh-subject-section")) {
    const table = section.querySelector("table.karnameh-sheet-table");
    if (!table) continue;
    const groups = karnamehTableStageGroups(table),
      options = karnamehTableStageOptions(table);
    if (!options.length) continue;
    const kind = table.classList.contains("karnameh-modular-table")
      ? "modular"
      : table.classList.contains("karnameh-unit-competency-table")
        ? "unit"
        : table.classList.contains("karnameh-legacy-table")
          ? "legacy"
          : "assessment";
    section.dataset.karnamehGroupSet = kind;
    const selected = options.some((group) => group.key === preference[kind])
      ? preference[kind]
      : options[0].key;
    preference[kind] = selected;
    const headers = [...table.tHead.rows[0].cells].slice(1);
    headers.forEach((cell, index) => {
      cell.dataset.karnamehGroup = groups[index].key;
    });
    const subGroups = groups.flatMap((group, index) =>
      headers[index].rowSpan === 1 ? Array(group.width).fill(group.key) : [],
    );
    [...(table.tHead.rows[1]?.cells || [])].forEach((cell, index) => {
      cell.dataset.karnamehGroup = subGroups[index];
    });
    const columns = groups.flatMap((group) =>
      Array(group.width).fill(group.key),
    );
    for (const body of table.tBodies)
      for (const row of body.rows) {
        let position = 0;
        for (const cell of [...row.cells].slice(1)) {
          cell.dataset.karnamehGroup = columns[position];
          position += cell.colSpan;
        }
      }
    if (!section.querySelector(".karnameh-stage-switcher")) {
      const stageButtons = options
        .map(
          (group) =>
            '<button type="button" data-workspace-action="karnameh-stage" data-karnameh-stage="' +
            group.key +
            '" aria-pressed="' +
            (group.key === selected) +
            '"' +
            (kind === "unit"
              ? ' data-karnameh-unit-module="' +
                group.modulePosition +
                '" data-karnameh-unit-index="' +
                group.unitIndex +
                '"'
              : "") +
            (group.shortLabel
              ? ' aria-label="' +
                esc(group.label) +
                '" title="' +
                esc(group.label) +
                '"'
              : "") +
            ">" +
            esc(group.shortLabel || group.label) +
            "</button>",
        )
        .join("");
      const controls =
        kind === "unit"
          ? '<div class="karnameh-stage-switcher karnameh-unit-stage-switcher no-print">' +
            '<div class="karnameh-unit-stage-row"><span class="karnameh-unit-stage-label">پودمان</span>' +
            '<div class="karnameh-stage-options" role="group" aria-label="انتخاب پودمان واحدهای کار">' +
            [...new Set(options.map((group) => group.modulePosition))]
              .map(
                (modulePosition) =>
                  '<button type="button" data-workspace-action="karnameh-stage" data-karnameh-unit-module="' +
                  modulePosition +
                  '" aria-label="پودمان ' +
                  karnamehSheetNumber(modulePosition + 1) +
                  '" title="پودمان ' +
                  karnamehSheetNumber(modulePosition + 1) +
                  '">' +
                  karnamehSheetNumber(modulePosition + 1) +
                  "</button>",
              )
              .join("") +
            '</div></div><div class="karnameh-unit-stage-row"><span class="karnameh-unit-stage-label">واحد کار</span>' +
            '<div class="karnameh-stage-options" role="group" aria-label="انتخاب واحد کار پودمان">' +
            stageButtons +
            "</div></div></div>"
          : '<div class="karnameh-stage-switcher no-print"><div class="karnameh-stage-options" role="group" aria-label="' +
            (kind === "modular"
              ? "انتخاب پودمان"
              : kind === "unit"
                ? "انتخاب واحد کار"
                : "انتخاب مرحلهٔ کارنامه") +
            '">' +
            stageButtons +
            "</div></div>";
      section
        .querySelector(".karnameh-subject-header")
        .insertAdjacentHTML("beforeend", controls);
    }
    applyKarnamehStage(report, kind, selected);
  }
  const controller = {
    validate,
    scope: preference.scope,
    workspaceId: workspace.id,
    workspaceYear: workspace.year,
    schoolId,
    classId,
    studentId: report.dataset.studentId,
    requests: {},
  };
  karnamehStageControllers.set(report, controller);
  report.dataset.karnamehCompactReady = "true";
}
async function selectKarnamehStage(button) {
  const report = button.closest(".karnameh-student-sheet");
  const controller = karnamehStageControllers.get(report);
  const section = button.closest(".karnameh-subject-section");
  const kind = section?.dataset.karnamehGroupSet;
  let selected = button.dataset.karnamehStage;
  const current = () =>
    !!controller &&
    !!section &&
    karnamehStageControllers.get(report) === controller &&
    report.isConnected &&
    button.isConnected &&
    report.contains(section) &&
    workspace.year === controller.workspaceYear &&
    (controller.validate
      ? controller.validate()
      : document.getElementById("karnamehTabOutput")?.contains(report) &&
        workspace.id === controller.workspaceId &&
        state.view === "reports" &&
        state.reportTab === "karnameh" &&
        karnamehFilter.classId === controller.classId &&
        karnamehFilter.studentId === controller.studentId &&
        (!karnamehFilter.schoolId ||
          karnamehFilter.schoolId === controller.schoolId) &&
        karnamehStageSelection.scope === controller.scope);
  if (
    !current() ||
    !["assessment", "modular", "unit", "legacy"].includes(kind) ||
    button.disabled ||
    !section.querySelector(".karnameh-stage-switcher")?.contains(button)
  )
    return;
  const options = karnamehTableStageOptions(section.querySelector("table"));
  if (kind === "unit") {
    if (selected) {
      const group = options.find((option) => option.key === selected);
      if (
        button.hidden ||
        !group ||
        button.dataset.karnamehUnitModule !== String(group.modulePosition) ||
        button.dataset.karnamehUnitIndex !== String(group.unitIndex)
      )
        return;
    } else {
      const moduleOptions = options.filter(
        (group) =>
          String(group.modulePosition) === button.dataset.karnamehUnitModule,
      );
      const active = options.find(
        (group) => group.key === section.dataset.karnamehActiveGroup,
      );
      const target =
        moduleOptions.find((group) => group.unitIndex === active?.unitIndex) ||
        moduleOptions[0];
      if (!target) return;
      selected = target.key;
    }
  }
  if (!options.some((group) => group.key === selected)) return;
  const request = (controller.requests[kind] =
    (controller.requests[kind] || 0) + 1);
  // A click on the current group also cancels a slower request for another group.
  if (section.dataset.karnamehActiveGroup === selected) return;
  const context = karnamehSnapshots.get(report);
  if (!context) return;
  try {
    await assertReportSnapshot(context);
  } catch (error) {
    if (current() && controller.requests[kind] === request) throw error;
    return;
  }
  if (!current() || controller.requests[kind] !== request) return;
  if (!controller.validate) karnamehStageSelection[kind] = selected;
  applyKarnamehStage(report, kind, selected);
}
