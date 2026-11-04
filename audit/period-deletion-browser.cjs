"use strict";
const { main } = require("./data-integrity.cjs");
async function deletionFlow() {
  const cases = [];
  const check = (id, pass, observed) =>
    cases.push({ id, name: id, pass: !!pass, observed });
  const wait = async (predicate) => {
    for (let i = 0; i < 150; i++) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error(
      "Deletion UI timeout after " +
        (cases.at(-1)?.id || "setup") +
        ": " +
        (document.getElementById("operationError")?.textContent || ""),
    );
  };
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("EduManagerProfessional");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const read = (name) =>
    new Promise((resolve, reject) => {
      const request = database.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const originalConfirm = window.confirm;
  try {
    closeModal();
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = "1420-1421";
    document.getElementById("periodTerm").value = "اول";
    await EduV24.test.createLegacyPeriod();
    const active = EduV24.getReportContext().id;
    const school = db.schools[0];
    const sourceClass = school.classes[0];
    const student = sourceClass.students[0];
    if (!student) throw Error("Membership browser fixture requires a student");
    const destinations = ["کپی", "انتقال"].map((label) => ({
      ...structuredClone(sourceClass),
      id: uid(),
      name: "مقصد آزمون " + label,
      students: [],
      archivedStudents: [],
      lessons: [],
    }));
    school.classes.push(...destinations);
    await saveDB({ action: "آماده‌سازی آزمون انتقال" });
    state.schoolId = school.id;
    state.classId = sourceClass.id;
    state.view = "class";
    render();
    const vocational = sourceClass.lessons.find(
      (lesson) =>
        lesson.gradeMode === "kardanesh" &&
        lesson.gradingPolicy?.subjectType !== "general",
    );
    if (!vocational)
      throw Error("Weighted grading fixture needs a vocational lesson");
    vocational.gradingPolicy = {
      ...EduPolicy.defaults("dual", "1420-1421"),
      ...vocational.gradingPolicy,
      dualConfigurable: true,
      practicalWeight: 60,
      theoryMin: 0,
      practicalMin: 0,
      passMin: 14,
    };
    vocational.kardaneshScores[student.id] = {
      midtermPractical: 10,
      midtermTheory: 20,
      practical: 18,
      theory: 12,
    };
    await saveDB({ action: "آماده‌سازی آزمون درصدهای کاردانش" });
    state.lessonId = vocational.id;
    state.view = "lesson";
    state.tab = "grades";
    render();
    await openBulkScoreModal(vocational.id);
    check(
      "DUAL_MIDTERM_WEIGHTED",
      document.querySelector(
        '#modalBody [data-assessment-final="' + student.id + '"]',
      ).textContent === "14.00",
    );
    const stages = [
      ...document.querySelectorAll(
        '#modalBody .assessment-term-navigation [data-workspace-action="assessment-stage"]',
      ),
    ];
    check(
      "DUAL_FOUR_STAGE_NAVIGATION",
      JSON.stringify(
        stages.map((button) => [button.dataset.term, button.dataset.stage]),
      ) ===
        JSON.stringify([
          ["اول", "midterm"],
          ["اول", "final"],
          ["دوم", "midterm"],
          ["دوم", "final"],
        ]) &&
        stages.filter(
          (button) => button.getAttribute("aria-pressed") === "true",
        ).length === 1,
    );
    document
      .querySelector(
        '#modalBody [data-workspace-action="assessment-stage"][data-term="اول"][data-stage="final"]',
      )
      .click();
    await wait(() =>
      document.querySelector(
        '#modalBody [data-assessment-final="' +
          student.id +
          '"][data-stage="final"]',
      ),
    );
    check(
      "DUAL_FINAL_WEIGHTED",
      document.querySelector(
        '#modalBody [data-assessment-final="' + student.id + '"]',
      ).textContent === "15.60",
    );
    const practicalInput = document.querySelector(
      '#modalBody [data-student="' + student.id + '"][data-field="practical"]',
    );
    practicalInput.value = "۱۹";
    practicalInput.dispatchEvent(new Event("input", { bubbles: true }));
    await EduV24.flushDrafts({ strict: true });
    check(
      "DUAL_PERSISTED_FROM_INPUT",
      vocational.kardaneshScores[student.id].practical === 19 &&
        EduV24.assessmentResult(vocational, student.id, "final").final ===
          16.2 &&
        EduV24.assessmentResult(vocational, student.id, "midterm").final === 14,
    );
    closeModal();
    state.view = "class";
    render();
    await openTransferModal(student.id);
    check(
      "MEMBERSHIP_GROUPED_DESTINATIONS",
      !!document.querySelector("#transferTarget optgroup"),
    );
    const membershipPanel = document.querySelector(".membership-editor");
    check(
      "MEMBERSHIP_NO_OVERFLOW",
      membershipPanel.scrollWidth <= membershipPanel.clientWidth + 1,
    );
    document.getElementById("transferTarget").value = destinations[0].id;
    const copyChoice = document.getElementById("membershipCopy");
    copyChoice.checked = true;
    copyChoice.dispatchEvent(new Event("change", { bubbles: true }));
    check(
      "MEMBERSHIP_COPY_LABEL",
      membershipPanel.querySelector('button[type="submit"]').textContent ===
        "کپی هنرجو",
    );
    membershipPanel.requestSubmit();
    await wait(
      () =>
        destinations[0].students.length === 1 &&
        !document.querySelector("#modal:not(.hidden) .membership-editor"),
    );
    check(
      "MEMBERSHIP_COPY_IDENTITY",
      destinations[0].students[0].id !== student.id &&
        sourceClass.students.some((item) => item.id === student.id),
    );
    await openTransferModal(student.id);
    document.getElementById("transferTarget").value = destinations[1].id;
    document.querySelector(".membership-editor").requestSubmit();
    await wait(
      () =>
        destinations[1].students.length === 1 &&
        !document.querySelector("#modal:not(.hidden) .membership-editor"),
    );
    check(
      "MEMBERSHIP_TRANSFER_IDENTITY",
      destinations[1].students[0].id === student.id &&
        !sourceClass.students.some((item) => item.id === student.id) &&
        sourceClass.archivedStudents.some((item) => item.id === student.id),
    );
    const schoolName = db.schools[0].name;
    db.schools[0].name = schoolName + " آزمون بازگردانی";
    await saveDB({ action: "آزمون مودال بازگردانی" });
    render();
    document.querySelector(".workspace-tools").open = true;
    document.querySelector('#app [data-workspace-action="undo"]').click();
    await wait(() => document.getElementById("undoPreview"));
    check(
      "UNDO_MODAL_PREVIEW",
      document
        .getElementById("undoPreview")
        .textContent.includes("آزمون مودال بازگردانی") &&
        db.schools[0].name !== schoolName,
    );
    const undoPanel = document.getElementById("undoPreview");
    check(
      "UNDO_MODAL_NO_OVERFLOW",
      undoPanel.scrollWidth <= undoPanel.clientWidth + 1,
    );
    let duplicatePrompt = false;
    window.confirm = () => {
      duplicatePrompt = true;
      return false;
    };
    document.querySelector('[data-workspace-action="confirm-undo"]').click();
    await wait(
      () =>
        db.schools[0].name === schoolName &&
        !document.querySelector("#modal:not(.hidden) #undoPreview"),
    );
    check(
      "UNDO_MODAL_APPLIES_ONCE",
      !duplicatePrompt && db.schools[0].name === schoolName,
    );
    document.querySelector('#app [data-workspace-action="undo"]').click();
    await wait(() =>
      document.querySelector("#modal:not(.hidden) #undoPreview"),
    );
    check(
      "UNDO_MODAL_EMPTY_STATE",
      !document.querySelector('[data-workspace-action="confirm-undo"]'),
    );
    closeModal();
    const reportClass = findClassById(sourceClass.id).classObj;
    const modular = {
      ...structuredClone(vocational),
      id: uid(),
      name: "درس پودمانی آزمون کارنامه",
      gradeMode: "standard",
      gradingPolicy: EduPolicy.defaults("modular", "1420-1421"),
      kardaneshScores: {},
      poudmans: [
        {
          id: uid(),
          name: "پودمان ثبت‌شده",
          units: [{ id: uid(), name: "واحد اول", unitScores: {} }],
          podScores: { [student.id]: { m: 4, c: 3 } },
        },
        {
          id: uid(),
          name: "پودمان ثبت‌نشده",
          units: [{ id: uid(), name: "واحد دوم", unitScores: {} }],
          podScores: {},
        },
      ],
    };
    reportClass.lessons.push(modular);
    while (reportClass.lessons.length < 6)
      reportClass.lessons.push({
        ...structuredClone(vocational),
        id: uid(),
        name: "درس آزمون کارنامه " + reportClass.lessons.length,
        kardaneshScores: {},
      });
    await saveDB({ action: "آزمون کارنامهٔ کلاس پردرس" });
    goReports();
    setReportTab("karnameh");
    await wait(() => document.getElementById("karnamehClass"));
    updateKarnamehFilter("schoolId", school.id);
    check(
      "KARNAMEH_CLASS_FIRST",
      document.getElementById("karnamehStudent").disabled,
    );
    updateKarnamehFilter("classId", sourceClass.id);
    await wait(() =>
      document.querySelector("#karnamehTabOutput .karnameh-report-heading"),
    );
    check(
      "KARNAMEH_OVERVIEW",
      document
        .getElementById("karnamehTabOutput")
        .textContent.includes(sourceClass.name),
    );
    const reportSelector = "#karnamehTabOutput .karnameh-student-sheet";
    await wait(() => document.querySelector(reportSelector));
    const firstStudentId = getSortedStudents(reportClass)[0]?.id;
    const selectedSheet = () => document.querySelector(reportSelector);
    check(
      "KARNAMEH_INDIVIDUAL_DEFAULT",
      firstStudentId &&
        selectedSheet().dataset.studentId === firstStudentId &&
        karnamehFilter.studentId === firstStudentId &&
        document.querySelectorAll(reportSelector).length === 1 &&
        !document.querySelector(".karnameh-overview"),
    );
    const tableRows = [
      ...selectedSheet().querySelectorAll("[data-karnameh-lesson-row]"),
    ];
    const modularLessons = reportClass.lessons.filter(
      (lesson) =>
        lesson.gradeMode !== "kardanesh" &&
        lesson.gradingPolicy?.method === "modular",
    );
    const moduleColumns = Math.max(
      0,
      ...modularLessons.map((lesson) => lesson.poudmans.length),
    );
    const expectedModularCells = (lesson) =>
      1 + lesson.poudmans.length * 3 + moduleColumns - lesson.poudmans.length;
    const sameFields = (row, lesson) =>
      JSON.stringify(
        [...row.querySelectorAll("[data-karnameh-field]")].map(
          (cell) => cell.dataset.karnamehField,
        ),
      ) ===
      JSON.stringify(
        Array.from({ length: lesson.poudmans.length }, () => [
          "continuous",
          "competency",
          "module-result",
        ]).flat(),
      );
    check(
      "KARNAMEH_MANY_LESSONS_SINGLE_ROWS",
      tableRows.length === reportClass.lessons.length &&
        new Set(tableRows.map((row) => row.dataset.karnamehLessonRow)).size ===
          reportClass.lessons.length &&
        tableRows.every((row) =>
          reportClass.lessons.some(
            (lesson) => lesson.id === row.dataset.karnamehLessonRow,
          ),
        ) &&
        tableRows
          .filter((row) => row.dataset.gradeMode === "kardanesh")
          .every((row) => row.cells.length === 13) &&
        tableRows
          .filter((row) => row.dataset.gradeMode === "modular")
          .every((row) => {
            const lesson = modularLessons.find(
              (item) => item.id === row.dataset.karnamehLessonRow,
            );
            return (
              lesson &&
              row.cells.length === expectedModularCells(lesson) &&
              [...row.cells].reduce(
                (total, cell) => total + cell.colSpan,
                0,
              ) ===
                1 + moduleColumns * 3 &&
              row.querySelectorAll(".karnameh-module-na").length ===
                moduleColumns - lesson.poudmans.length &&
              [...row.querySelectorAll(".karnameh-module-na")].every(
                (cell) =>
                  cell.colSpan === 3 &&
                  cell.textContent.trim() === "ندارد" &&
                  !cell.querySelector(".karnameh-sheet-value"),
              ) &&
              sameFields(row, lesson)
            );
          }),
      tableRows.map((row) => ({
        id: row.dataset.karnamehLessonRow,
        cells: row.cells.length,
      })),
    );
    const overviewOutput = document.getElementById("karnamehTabOutput");
    check(
      "KARNAMEH_MANY_LESSONS_NO_OVERFLOW",
      overviewOutput.scrollWidth <= overviewOutput.clientWidth + 1,
    );
    const navigation = selectedSheet().querySelector(
      ".karnameh-student-pagination",
    );
    const directButton = [...navigation.querySelectorAll("button")].find(
      (button) => !button.disabled,
    );
    if (!directButton)
      throw Error("Student navigation fixture requires at least two students");
    const chosenId = directButton.dataset.key;
    const returnDirection =
      directButton.dataset.karnamehNav === "next" ? "previous" : "next";
    directButton.click();
    await wait(() => selectedSheet()?.dataset.studentId === chosenId);
    check(
      "KARNAMEH_DIRECT_STUDENT_NAVIGATION",
      karnamehFilter.studentId === chosenId &&
        document.getElementById("karnamehStudent").value === chosenId &&
        document.querySelectorAll(reportSelector).length === 1,
    );
    selectedSheet()
      .querySelector('[data-karnameh-nav="' + returnDirection + '"]')
      .click();
    await wait(() => selectedSheet()?.dataset.studentId === firstStudentId);
    check(
      "KARNAMEH_RETURN_TO_SAME_CLASS",
      karnamehFilter.classId === sourceClass.id &&
        karnamehFilter.studentId === firstStudentId &&
        document.querySelectorAll(reportSelector).length === 1,
    );
    const filters = document.querySelector(".karnameh-controls");
    check(
      "KARNAMEH_FILTER_NO_OVERFLOW",
      filters.scrollWidth <= filters.clientWidth + 1,
    );
    const optionIds = [...document.getElementById("karnamehStudent").options]
      .map((option) => option.value)
      .filter(Boolean);
    check(
      "KARNAMEH_CLASS_SCOPED",
      optionIds.every((id) =>
        [...reportClass.students, ...reportClass.archivedStudents].some(
          (item) => item.id === id,
        ),
      ) && new Set(optionIds).size === optionIds.length,
    );
    updateKarnamehFilter("studentId", student.id);
    await wait(() => selectedSheet()?.dataset.studentId === student.id);
    const report = selectedSheet();
    check(
      "KARNAMEH_ARCHIVED_REPORT",
      report.querySelector("h3").textContent.trim() === student.name &&
        report.querySelector(".karnameh-archived-tag")?.textContent ===
          "بایگانی" &&
        reportClass.archivedStudents.some((item) => item.id === student.id),
    );
    const numeric = (text) => {
      const normalized = text
        .trim()
        .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
        .replace(/٫/g, ".");
      return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : null;
    };
    const values = (row) =>
      [...row.querySelectorAll(".karnameh-sheet-value")].map((cell) =>
        numeric(cell.textContent),
      );
    const same = (left, right) =>
      JSON.stringify(left) === JSON.stringify(right);
    const stageReport = report.querySelector(
      '[data-karnameh-lesson="' + vocational.id + '"]',
    );
    const modularReport = report.querySelector(
      '[data-karnameh-lesson="' + modular.id + '"]',
    );
    check(
      "KARNAMEH_PARTIAL_MODULAR_GRADES_VISIBLE",
      same(values(modularReport), [4, 3, 19, null, null, null]) &&
        modularReport.querySelector(".karnameh-module-name")?.textContent ===
          modular.poudmans[0].name &&
        [
          ...modularReport.querySelectorAll(
            '[data-karnameh-field="module-result"]',
          ),
        ]
          .map((cell) => cell.dataset.gradeComplete)
          .join(",") === "true,false",
      values(modularReport),
    );
    check(
      "KARNAMEH_MODULAR_IS_SINGLE_ANNUAL_COURSE",
      report.querySelectorAll('[data-karnameh-lesson="' + modular.id + '"]')
        .length === 1 &&
        report.querySelectorAll(
          '.karnameh-modular-table thead [scope="colgroup"]',
        ).length === 2 &&
        !report.querySelector(".report-modular-term"),
    );
    const originalPrintTest = globalThis.__EDU_PRINT_TEST__;
    try {
      globalThis.__EDU_PRINT_TEST__ = true;
      document.getElementById("printRoot")?.remove();
      report.querySelector('[data-workspace-action="print"]').click();
      await wait(() =>
        document.querySelector("#printRoot .karnameh-modular-table"),
      );
      const printed = document.querySelector(
        "#printRoot .karnameh-student-sheet",
      );
      const printedLesson = printed?.querySelector(
        '[data-karnameh-lesson="' + modular.id + '"]',
      );
      const printedAssessment = printed?.querySelector(
        '[data-karnameh-lesson="' + vocational.id + '"]',
      );
      check(
        "KARNAMEH_MODULAR_PRINT_HAS_SAME_GRADES",
        printed?.dataset.studentId === student.id &&
          document.querySelectorAll("#printRoot .karnameh-student-sheet")
            .length === 1 &&
          printedLesson &&
          same(values(printedLesson), [4, 3, 19, null, null, null]) &&
          printedAssessment &&
          same(values(printedAssessment), values(stageReport)) &&
          !printed.querySelector("button,select,.karnameh-student-pagination"),
      );
    } finally {
      if (originalPrintTest === undefined) delete globalThis.__EDU_PRINT_TEST__;
      else globalThis.__EDU_PRINT_TEST__ = originalPrintTest;
      document.getElementById("printRoot")?.remove();
      document.getElementById("printPageStyle")?.remove();
    }
    check(
      "DUAL_REPORT_COMPONENTS_MATCH_INPUT",
      same(values(stageReport).slice(3, 6), [19, 12, 16.2]),
      values(stageReport),
    );
    check(
      "DUAL_REPORT_STAGES_MATCH",
      same(values(stageReport).slice(0, 6), [10, 20, 14, 19, 12, 16.2]),
      values(stageReport),
    );
    check(
      "KARNAMEH_FOUR_STAGES_NO_FABRICATED_SECOND",
      values(stageReport).length === 12 &&
        values(stageReport)
          .slice(6)
          .every((value) => value === null),
    );
    check(
      "KARNAMEH_NO_OVERALL_AVERAGE_COLUMN",
      !report.querySelector(
        '[data-karnameh-group="annual"],[data-karnameh-stage="annual"],[data-karnameh-field="annual"]',
      ) &&
        ![...report.querySelectorAll("thead th")].some((cell) =>
          /سالانه|وضعیت تکمیل/.test(cell.textContent),
        ),
    );
    const gradeTable = stageReport.closest("table");
    const stageHeaders = [
      ...gradeTable.tHead.rows[0].querySelectorAll('[scope="colgroup"]'),
    ];
    check(
      "KARNAMEH_STAGE_HEADERS_SEPARATE_FROM_SCORES",
      gradeTable.tHead.rows.length === 2 &&
        same(
          stageHeaders.map((cell) => cell.textContent.trim()),
          ["میان‌ترم اول", "پایان‌ترم اول", "میان‌ترم دوم", "پایان‌ترم دوم"],
        ) &&
        stageHeaders.every((cell) => cell.colSpan === 3) &&
        gradeTable.tHead.rows[1].cells.length === 12,
    );
    check(
      "KARNAMEH_NO_GRADE_STATUS_EXPLANATIONS",
      !report.querySelector(".report-grade-status"),
    );
    check(
      "KARNAMEH_STAGE_COMPONENT_LABELS",
      same(
        [...gradeTable.tHead.rows[1].cells].map((cell) =>
          cell.textContent.trim(),
        ),
        Array.from({ length: 4 }, () => ["عملی", "نظری", "نتیجه"]).flat(),
      ),
    );
    const reportOutput = document.getElementById("karnamehTabOutput");
    check(
      "KARNAMEH_TABLE_CONTAINER_NO_OVERFLOW",
      reportOutput.scrollWidth <= reportOutput.clientWidth + 1,
    );
    const before = (await read("catalog")).map((row) => row.id);
    for (const viewport of [320, 768, 1024, 1366, 1920]) {
      const frame = document.createElement("iframe");
      frame.style.cssText =
        "position:fixed;top:0;left:0;width:" +
        viewport +
        "px;height:900px;visibility:hidden;border:0";
      const loaded = new Promise((resolve) => {
        frame.onload = resolve;
      });
      frame.srcdoc =
        '<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
        [...document.querySelectorAll('link[rel="stylesheet"]')]
          .map((link) => '<link rel="stylesheet" href="' + link.href + '">')
          .join("") +
        '</head><body><div id="app">' +
        reportOutput.innerHTML +
        "</div></body></html>";
      document.body.append(frame);
      try {
        await loaded;
        const doc = frame.contentDocument;
        await doc.fonts.ready;
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        const geometry = (selector) =>
          [...doc.querySelectorAll(selector + " tbody tr")].map((row) => {
            const table = row.closest("table"),
              scroll = table.closest(".karnameh-sheet-scroll"),
              outer = scroll.getBoundingClientRect(),
              sheet = row
                .closest(".karnameh-student-sheet")
                .getBoundingClientRect(),
              visible = [...row.cells].filter(
                (cell) =>
                  frame.contentWindow.getComputedStyle(cell).display !== "none",
              );
            const lesson = modularLessons.find(
                (item) => item.id === row.dataset.karnamehLessonRow,
              ),
              selectedModule = Number(
                (table.dataset.karnamehActiveGroup || "").replace(
                  "module-",
                  "",
                ),
              );
            return {
              lessonId: row.dataset.karnamehLessonRow,
              all: row.cells.length,
              expectedAll: lesson ? expectedModularCells(lesson) : 13,
              logicalColumns: [...row.cells].reduce(
                (total, cell) => total + cell.colSpan,
                0,
              ),
              visible: visible.length,
              expectedVisible: lesson
                ? viewport <= 1024
                  ? selectedModule < lesson.poudmans.length
                    ? 4
                    : 2
                  : expectedModularCells(lesson)
                : viewport <= 1024
                  ? 4
                  : 13,
              visibleGroups: [
                ...new Set(
                  visible.slice(1).map((cell) => cell.dataset.karnamehGroup),
                ),
              ],
              activeGroup: table.dataset.karnamehActiveGroup,
              native:
                frame.contentWindow.getComputedStyle(table).display === "table",
              fits: scroll.scrollWidth <= scroll.clientWidth + 1,
              contained:
                outer.left >= sheet.left - 1 && outer.right <= sheet.right + 1,
              readable: visible.every(
                (cell) => cell.getBoundingClientRect().width > 20,
              ),
            };
          });
        const compact = viewport <= 1024;
        const assessment = geometry(".karnameh-assessment-table");
        check(
          "KARNAMEH_COMPACT_ROWS_" + viewport,
          assessment.length > 0 &&
            assessment.every(
              (row) =>
                row.native &&
                row.contained &&
                row.readable &&
                row.all === 13 &&
                row.visible === (compact ? 4 : 13) &&
                (!compact || row.fits),
            ),
          assessment,
        );
        const modules = geometry(".karnameh-modular-table");
        check(
          "KARNAMEH_MODULAR_ROWS_FIT_" + viewport,
          modules.length === modularLessons.length &&
            new Set(modules.map((row) => row.lessonId)).size ===
              modularLessons.length &&
            modules.every(
              (row) =>
                row.native &&
                row.contained &&
                row.readable &&
                row.all === row.expectedAll &&
                row.logicalColumns === 1 + moduleColumns * 3 &&
                row.visible === row.expectedVisible &&
                (!compact ||
                  (row.fits && same(row.visibleGroups, [row.activeGroup]))),
            ),
          modules,
        );
      } finally {
        frame.remove();
      }
    }
    await EduV24.test.openLegacyPeriodDeletion(active);
    await wait(() => document.getElementById("periodDeletionConfirmed"));
    check(
      "DELETE_UI_PREVIEW",
      document.querySelector(".period-delete-stats") &&
        document.querySelector(".period-delete-transition"),
    );
    const width = document.querySelector(".period-delete");
    check("DELETE_UI_NO_OVERFLOW", width.scrollWidth <= width.clientWidth + 1);
    document.getElementById("periodDeletionConfirmed").checked = true;
    window.confirm = () => true;
    document
      .querySelector('[data-workspace-action="confirm-delete-period"]')
      .click();
    await wait(
      async () =>
        !(await read("catalog")).some((row) => row.id === active) &&
        EduV24.getReportContext().id !== active,
    );
    await wait(() => document.querySelector(".period-hub"));
    const after = await read("catalog");
    check(
      "DELETE_ACTIVE_TRANSITION",
      after.some((row) => row.id === EduV24.getReportContext().id) &&
        !EduV24.getReportContext().blocked,
    );
    check(
      "DELETE_OTHER_PERIODS_UNCHANGED",
      after.length === before.length - 1 &&
        before
          .filter((id) => id !== active)
          .every((id) => after.some((row) => row.id === id)),
    );
    check(
      "DELETE_SAFETY_PRESENT",
      (await read("backups")).some(
        (row) =>
          row.id.startsWith("before-period-delete-") &&
          row.full.stores.catalog.some((period) => period.id === active),
      ),
    );
    check(
      "DELETE_NO_ORPHAN_RECORDS",
      !(await read("records")).some((row) => row.workspace === active),
    );
    const exported = await EduV24.snapshotInstallation();
    EduV24.previewFullBackup(exported);
    check(
      "DELETE_EXPORT_VALID",
      !!document.getElementById("fullRestoreConfirmed"),
    );
  } catch (error) {
    check("DELETE_BROWSER_ERROR", false, error.message);
  } finally {
    window.confirm = originalConfirm;
    database.close();
  }
  return cases;
}
if (require.main === module)
  main({
    stage: "period-deletion",
    runExtra: async ({ cdp, evaluate, cases, delay }) => {
      await require("./browser-ready.cjs")({ cdp, evaluate, delay });
      await cdp("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 900,
        deviceScaleFactor: 1,
        mobile: true,
      });
      cases.push(...(await evaluate("(" + deletionFlow.toString() + ")()")));
    },
  }).catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
