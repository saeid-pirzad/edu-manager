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
      "Deletion UI timeout: " +
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
    await EduV24.openNewPeriod();
    document.getElementById("periodYear").value = "1420-1421";
    document.getElementById("periodTerm").value = "اول";
    await EduV24.createNewPeriod();
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
    check(
      "DUAL_NAVIGATION_SEPARATE",
      !!document.querySelector("#modalBody .assessment-term-navigation") &&
        document.querySelectorAll(
          "#modalBody .assessment-stage-navigation button",
        ).length === 2,
    );
    document
      .querySelector(
        '#modalBody .assessment-stage-navigation [data-stage="final"]',
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
    await wait(() =>
      document.querySelector('.karnameh-overview[data-ui-layout="cards"]'),
    );
    check(
      "KARNAMEH_WIDE_TABLE_MOBILE_CARDS",
      document.querySelector(".karnameh-overview thead tr").cells.length > 6,
    );
    const overviewOutput = document.getElementById("karnamehTabOutput");
    check(
      "KARNAMEH_MANY_LESSONS_NO_OVERFLOW",
      overviewOutput.scrollWidth <= overviewOutput.clientWidth + 1,
    );
    const directButton = document.querySelector(
      '.karnameh-overview [data-workspace-action="karnameh-student"]',
    );
    if (directButton) {
      const chosenId = directButton.dataset.key;
      directButton.click();
      await wait(() => document.querySelector(".karnameh-year-document h2"));
      check(
        "KARNAMEH_DIRECT_STUDENT_NAVIGATION",
        karnamehFilter.studentId === chosenId,
      );
      document
        .querySelector(
          '.karnameh-report-actions [data-workspace-action="karnameh-student"]',
        )
        .click();
      await wait(() => document.querySelector(".karnameh-overview"));
      check(
        "KARNAMEH_RETURN_TO_SAME_CLASS",
        karnamehFilter.classId === sourceClass.id && !karnamehFilter.studentId,
      );
    }
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
        [...sourceClass.students, ...sourceClass.archivedStudents].some(
          (item) => item.id === id,
        ),
      ) && new Set(optionIds).size === optionIds.length,
    );
    updateKarnamehFilter("studentId", student.id);
    await wait(() => document.querySelector("#karnamehTabOutput h2"));
    check(
      "KARNAMEH_ARCHIVED_REPORT",
      document
        .querySelector("#karnamehTabOutput h2")
        .textContent.includes(student.name),
    );
    const gradeTable = document.querySelector(".karnameh-year-document table");
    const lessonIndex = [...gradeTable.tHead.rows[0].cells].findIndex(
      (cell) => cell.textContent === vocational.name,
    );
    const stageReport = gradeTable.tBodies[0].rows[0].cells[lessonIndex];
    const modularIndex = [...gradeTable.tHead.rows[0].cells].findIndex(
      (cell) => cell.textContent === modular.name,
    );
    const modularReport = gradeTable.tBodies[0].rows[0].cells[modularIndex];
    const moduleRows = [
      ...modularReport.querySelectorAll(".report-module-row"),
    ];
    check(
      "KARNAMEH_PARTIAL_MODULAR_GRADES_VISIBLE",
      moduleRows.length === 2 &&
        moduleRows[0].querySelectorAll("b")[0].textContent === "4" &&
        moduleRows[0].querySelectorAll("b")[1].textContent === "3" &&
        moduleRows[0].querySelector("strong").textContent === "19.00" &&
        moduleRows[1].querySelector("strong").textContent === "—" &&
        modularReport.querySelector(".report-modular-final strong")
          .textContent === "—",
    );
    check(
      "KARNAMEH_MODULAR_IS_SINGLE_ANNUAL_COURSE",
      modularReport.querySelectorAll(".report-modular-course").length === 1 &&
        !modularReport.querySelector(".report-modular-term"),
    );
    const originalPrint = window.print;
    try {
      window.print = () => {};
      document.getElementById("printRoot")?.remove();
      document
        .querySelector(
          '.karnameh-year-document [data-workspace-action="print"]',
        )
        .click();
      await wait(() => document.querySelector("#printRoot .report-module-row"));
      const printedLesson = [
        ...document.querySelectorAll("#printRoot [data-report-lesson]"),
      ].find((cell) => cell.dataset.reportLesson === modular.name);
      check(
        "KARNAMEH_MODULAR_PRINT_HAS_SAME_GRADES",
        printedLesson?.querySelectorAll(".report-module-row").length === 2 &&
          printedLesson.querySelector(".report-module-row strong")
            .textContent === "19.00",
      );
    } finally {
      window.print = originalPrint;
      document.getElementById("printRoot")?.remove();
    }
    const stageBlocks = [
      ...stageReport.querySelectorAll(".report-lesson-stage"),
    ];
    check(
      "DUAL_REPORT_COMPONENTS_MATCH_INPUT",
      stageBlocks[1].querySelectorAll(".report-stage-values b")[0]
        .textContent === "19" &&
        stageBlocks[1].querySelectorAll(".report-stage-values b")[1]
          .textContent === "12" &&
        stageBlocks[1].querySelector(".report-stage-values strong")
          .textContent === "16.20",
    );
    check(
      "DUAL_REPORT_STAGES_MATCH",
      stageReport.textContent.includes("14.00") &&
        stageReport.textContent.includes("16.20"),
    );
    check(
      "KARNAMEH_FOUR_STAGES_NO_FABRICATED_SECOND",
      stageBlocks.length === 4 &&
        stageBlocks
          .slice(2)
          .every(
            (block) =>
              block.querySelector(".report-stage-values strong").textContent ===
              "—",
          ),
    );
    check(
      "KARNAMEH_NO_OVERALL_AVERAGE_COLUMN",
      ![...gradeTable.tHead.rows[0].cells].some((cell) =>
        cell.textContent.includes("وضعیت تکمیل"),
      ),
    );
    check(
      "KARNAMEH_MOBILE_STAGE_TITLES_SEPARATE_FROM_SCORES",
      stageBlocks.every((block) => {
        const title = block.querySelector(".report-stage-title");
        const scores = block.querySelector(".report-stage-values");
        const heading = title?.getBoundingClientRect();
        const values = scores?.getBoundingClientRect();
        return (
          heading &&
          values &&
          heading.width > 0 &&
          (heading.bottom <= values.top + 1 ||
            values.right <= heading.left + 1) &&
          title.scrollWidth <= title.clientWidth + 1
        );
      }),
      stageBlocks.map((block) => {
        const title = block.querySelector(".report-stage-title");
        const scores = block.querySelector(".report-stage-values");
        const rect = (element) => {
          const r = element.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, width: r.width };
        };
        return {
          title: rect(title),
          scores: rect(scores),
          scroll: title.scrollWidth,
          client: title.clientWidth,
          columns: getComputedStyle(block).gridTemplateColumns,
        };
      }),
    );
    await wait(() =>
      document.querySelector(
        "#karnamehTabOutput .grade-report-table[data-ui-layout]",
      ),
    );
    check(
      "KARNAMEH_NO_GRADE_STATUS_EXPLANATIONS",
      !document.querySelector("#karnamehTabOutput .report-grade-status"),
    );
    check(
      "KARNAMEH_STAGE_COMPONENT_LABELS",
      stageBlocks.every(
        (block) =>
          block
            .querySelector(".report-stage-values")
            .textContent.includes("عملی") &&
          block
            .querySelector(".report-stage-values")
            .textContent.includes("نظری"),
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
      frame.style.cssText = `position:fixed;top:0;left:0;width:${viewport}px;height:900px;visibility:hidden;border:0`;
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
        const blocks = [...doc.querySelectorAll(".report-lesson-stage")];
        check(
          "KARNAMEH_COMPACT_ROWS_" + viewport,
          blocks.length > 0 &&
            blocks.every((block) => {
              const title = block
                .querySelector(".report-stage-title")
                .getBoundingClientRect();
              const values = block
                .querySelector(".report-stage-values")
                .getBoundingClientRect();
              return (
                values.right <= title.left + 1 &&
                values.width > 0 &&
                block.scrollWidth <= block.clientWidth + 1
              );
            }) &&
            [...doc.querySelectorAll(".report-mobile-score-heading")].every(
              (heading) => heading.getBoundingClientRect().height > 0,
            ),
        );
        const modules = [...doc.querySelectorAll(".report-module-row")];
        check(
          "KARNAMEH_MODULAR_ROWS_FIT_" + viewport,
          modules.length > 0 &&
            modules.every((row) => {
              const title = row
                .querySelector(".report-module-title")
                .getBoundingClientRect();
              const scores = row
                .querySelector(".report-stage-values")
                .getBoundingClientRect();
              return (
                scores.width > 0 &&
                scores.right <= title.left + 1 &&
                row.scrollWidth <= row.clientWidth + 1
              );
            }),
        );
      } finally {
        frame.remove();
      }
    }
    await EduV24.openPeriods();
    document
      .querySelector(
        '[data-workspace-action="delete-period"][data-key="' + active + '"]',
      )
      .click();
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
    runExtra: async ({ cdp, evaluate, cases }) => {
      await cdp("Page.reload", { ignoreCache: true });
      for (let i = 0; i < 150; i++) {
        if (await evaluate("!!globalThis.EduV24?.getReportContext?.().ready"))
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
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
