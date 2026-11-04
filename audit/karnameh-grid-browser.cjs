"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");

async function setup() {
  const original = await EduV24.snapshotInstallation(),
    year = "1405-1406";
  const ids = {
    first: "grid_first",
    second: "grid_second",
    school: "grid_school",
    classroom: "grid_class",
  };
  const restore = async (content) => {
    closeModal();
    EduV24.previewFullBackup(content);
    document.getElementById("fullRestoreConfirmed").checked = true;
    await EduV24.restoreFullBackup();
    await EduV24.test.settle();
  };
  globalThis.__karnamehGridCleanup = () => restore(original);
  globalThis.__karnamehGridIds = ids;
  const fixture = structuredClone(original),
    names = [
      "یاسین هنرجوی آزمایشی",
      "آراد هنرجوی مصنوعی",
      "سعید پیرزاد آزمایشی",
      "بهرام هنرجوی نمونه",
      "محمدحسین هنرجوی آزمایشی",
      "احمدرضا نام مصنوعی",
    ];
  const students = Array.from({ length: 23 }, (_, index) => ({
    id: "grid_student_" + (index + 1),
    name: names[index % names.length] + " " + (index + 1),
    code: String(index + 1),
  }));
  globalThis.__karnamehSheetStudents = students;
  fixture.activeWorkspace = ids.second;
  fixture.gradeDrafts = [];
  fixture.reportDrafts = {};
  fixture.snapshotNotes = [];
  for (const store of Object.keys(fixture.stores)) fixture.stores[store] = [];
  for (const [id, term, kind] of [
    [ids.first, "اول", "first"],
    [ids.second, "دوم", "second"],
  ]) {
    const first = kind === "first";
    const dual = (lessonId, name, alternate = false) => ({
      id: lessonId,
      name,
      teacher: "دبیر مصنوعی آزمون",
      gradeMode: "kardanesh",
      poudmans: [],
      gradingPolicy: {
        ...EduPolicy.defaults("dual", year),
        code: lessonId,
        confirmed: true,
      },
      kardaneshScores: Object.fromEntries(
        students.map((student, index) => {
          let score = alternate
            ? {
                midtermPractical: first ? 17 : 19,
                midtermTheory: first ? 13 : 18,
                practical: first ? 17 : 19,
                theory: first ? 13 : 18,
              }
            : {
                midtermPractical: first ? 10 : 18,
                midtermTheory: first ? 20 : 16,
                practical: first ? 18 : 20,
                theory: first ? 14 : 18,
              };
          if (index === 1 && !alternate)
            score = {
              midtermPractical: 12,
              midtermTheory: 12,
              practical: 12,
              theory: 12,
            };
          if (index === 2 && !first && !alternate) delete score.midtermTheory;
          if (index === 3 && !alternate)
            score = {
              midtermPractical: 0,
              midtermTheory: 0,
              practical: 0,
              theory: 0,
            };
          return [student.id, score];
        }),
      ),
    });
    const lessons = [
      dual("grid_dual_one", "طراحی گرافیک رایانه‌ای"),
      dual("grid_dual_two", "ویرایش تصویر و نرم‌افزارهای کاربردی", true),
      {
        id: "grid_modular",
        name: "نصب و راه‌اندازی شبکه‌های رایانه‌ای",
        teacher: "دبیر مصنوعی آزمون",
        gradeMode: "standard",
        gradingPolicy: {
          ...EduPolicy.defaults("modular", year),
          code: "GRID-M",
          confirmed: true,
        },
        kardaneshScores: {},
        poudmans: [0, 1].map((index) => ({
          id: "grid_pod_" + index,
          name: index ? "پودمان دوم شبکه" : "پودمان اول شبکه",
          podScores: Object.fromEntries(
            students
              .filter((_, offset) => !(offset === 2 && index === 1))
              .map((student, offset) => [
                student.id,
                {
                  m: index ? 4 : 2,
                  c: offset === 1 && !index ? 1 : index ? 3 : 2,
                },
              ]),
          ),
          units: [
            {
              id: "grid_unit_" + index,
              name: "واحد کار آزمایشی " + (index + 1),
              unitScores: {},
            },
          ],
        })),
      },
    ];
    if (first) lessons[2].poudmans.reverse();
    const data = EduV24.normalizeDB({
      ...defaultDB(),
      settings: {
        ...db.settings,
        academicYear: year,
        academicTerm: term,
        password: "",
      },
      schools: [
        {
          id: ids.school,
          name: "هنرستان مصنوعی بررسی کارنامه",
          classes: [
            {
              id: ids.classroom,
              name: "یازدهم شبکه و گرافیک آزمایشی",
              students: structuredClone(students),
              archivedStudents: [],
              lessons,
            },
          ],
        },
      ],
      sessions: [],
      masterSchedule: {},
      migrationWarnings: [],
    });
    const { schools, ...meta } = data;
    delete meta.sessions;
    meta.layout = schools.map((school) => ({
      id: school.id,
      name: school.name,
      classes: school.classes.map((cls) => cls.id),
    }));
    fixture.stores.catalog.push({
      id,
      year,
      term,
      termKind: kind,
      closed: false,
      revision: 1,
      createdAt: "2026-11-03T10:00:00Z",
      updatedAt: "2026-11-03T10:00:00Z",
    });
    for (const [logical, value] of [
      ["meta", meta],
      ["class:" + ids.classroom, schools[0].classes[0]],
    ])
      fixture.stores.records.push({
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      });
  }
  await restore(fixture);
  closeModal();
  goReports();
  state.reportTab = "karnameh";
  karnamehFilter = {
    schoolId: ids.school,
    classId: ids.classroom,
    studentId: "",
  };
  render();
  await renderKarnamehTabReports();
  for (
    let attempt = 0;
    attempt < 150 && !document.querySelector(".karnameh-student-sheet");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 20));
  if (!document.querySelector(".karnameh-student-sheet"))
    throw Error("Individual student grade sheet did not render");
  return {
    ids,
    students: students.map((student) => ({
      id: student.id,
      name: student.name,
      code: student.code,
    })),
  };
}

function sheetState() {
  const report = document.querySelector(".karnameh-student-sheet"),
    normalize = (text) =>
      text
        .trim()
        .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
        .replace(/٫/g, "."),
    rows = (selector) =>
      [...report.querySelectorAll(selector + " tbody tr")].map((row) => ({
        lesson: row
          .querySelector(".karnameh-lesson-title")
          .firstChild.textContent.trim(),
        id: row.dataset.karnamehLessonRow,
        cells: [...row.children].slice(1).map((cell) => {
          const text = normalize(
              cell.querySelector(".karnameh-sheet-value").textContent,
            ),
            match = text.match(/^-?\d+(?:\.\d+)?/);
          return {
            text,
            value: match ? Number(match[0]) : null,
            note:
              cell.querySelector(".karnameh-module-name")?.textContent.trim() ||
              "",
            complete: cell.dataset.gradeComplete,
            tone: cell.querySelector(".karnameh-sheet-value").dataset.gradeTone,
          };
        }),
      })),
    select = document.getElementById("karnamehStudent");
  return {
    selected: select.value,
    selection: karnamehFilter.studentId,
    renderedStudent: report.dataset.studentId,
    options: [...select.options]
      .filter((option) => option.value)
      .map((option) => option.value),
    title: report.querySelector("h2,h3").textContent.trim(),
    assessment: rows(".karnameh-assessment-table"),
    modular: rows(".karnameh-modular-table"),
    assessmentGroups: [
      ...report.querySelectorAll(
        ".karnameh-assessment-table thead [scope=colgroup]",
      ),
    ].map((cell) => ({ text: cell.textContent.trim(), span: cell.colSpan })),
    modularGroups: [
      ...report.querySelectorAll(
        ".karnameh-modular-table thead [scope=colgroup]",
      ),
    ].map((cell) => ({ text: cell.textContent.trim(), span: cell.colSpan })),
    assessmentHeadRows: report.querySelectorAll(
      ".karnameh-assessment-table thead tr",
    ).length,
    modularHeadRows: report.querySelectorAll(".karnameh-modular-table thead tr")
      .length,
    previousDisabled: report.querySelector('[data-karnameh-nav="previous"]')
      .disabled,
    nextDisabled: report.querySelector('[data-karnameh-nav="next"]').disabled,
    position: report
      .querySelector(".karnameh-student-position")
      .textContent.trim(),
    singleStudent:
      document.querySelectorAll(".karnameh-student-sheet").length === 1 &&
      report.dataset.studentId === karnamehFilter.studentId &&
      !document.querySelector(
        ".karnameh-grid-report,[data-karnameh-student-row],[data-karnameh-page-size]",
      ),
  };
}
async function selectStudent(kind, number) {
  const id = "grid_student_" + number;
  if (kind === "select") {
    const select = document.getElementById("karnamehStudent");
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    const control = document.querySelector(
      '.karnameh-student-pagination [data-karnameh-nav="' + kind + '"]',
    );
    if (!control || control.disabled)
      throw Error("Student navigation unavailable: " + kind);
    control.click();
  }
  for (let attempt = 0; attempt < 150; attempt++) {
    const report = document.querySelector(".karnameh-student-sheet"),
      expected = globalThis.__karnamehSheetStudents[number - 1];
    if (
      report &&
      document.getElementById("karnamehStudent").value === id &&
      report.querySelector("h2,h3").textContent.trim() === expected.name
    ) {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error("Student selection did not settle to " + id);
}
async function lastBoundary() {
  const button = document.querySelector(
    '.karnameh-student-pagination [data-karnameh-nav="next"]',
  );
  button.click();
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  return {
    disabled: button.disabled,
    unchanged:
      karnamehFilter.studentId === "grid_student_23" &&
      document.getElementById("karnamehStudent").value === "grid_student_23",
  };
}
async function geometry() {
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const report = document.querySelector(".karnameh-student-sheet"),
    tables = [];
  for (const table of report.querySelectorAll("table.karnameh-sheet-table")) {
    const scroll = table.closest(".table-scroll"),
      row = table.querySelector("tbody tr"),
      first = row.firstElementChild,
      original = scroll.scrollLeft,
      before = first.getBoundingClientRect().right;
    const overflows = scroll.scrollWidth > scroll.clientWidth + 1;
    if (overflows) {
      scroll.scrollLeft = -Math.min(
        240,
        scroll.scrollWidth - scroll.clientWidth,
      );
      if (scroll.scrollLeft === original)
        scroll.scrollLeft = Math.min(
          240,
          scroll.scrollWidth - scroll.clientWidth,
        );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const moved = scroll.scrollLeft !== original;
    tables.push({
      kind: table.classList.contains("karnameh-assessment-table")
        ? "assessment"
        : "modular",
      contained:
        scroll.getBoundingClientRect().width <= report.clientWidth + 1 &&
        scroll.getBoundingClientRect().left >=
          report.getBoundingClientRect().left - 1,
      native:
        getComputedStyle(table).display === "table" &&
        getComputedStyle(row).display === "table-row" &&
        getComputedStyle(first).display === "table-cell",
      scrollable: !overflows || moved,
      sticky:
        getComputedStyle(first).position === "sticky" &&
        Math.abs(before - first.getBoundingClientRect().right) < 1,
      readable: [...row.children].every(
        (cell) => parseFloat(getComputedStyle(cell).fontSize) >= 11,
      ),
      rowWidths: [...table.querySelectorAll("tbody tr")].map(
        (item) => item.children.length,
      ),
      wrapperWidth: scroll.clientWidth,
      tableWidth: scroll.scrollWidth,
      lessonWidth: first.getBoundingClientRect().width,
    });
    scroll.scrollLeft = original;
  }
  return {
    pageFits:
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
    reportFits: report.scrollWidth <= report.clientWidth + 1,
    tables,
    touchControls: [
      ...report.querySelectorAll(".karnameh-student-pagination button"),
    ].every((control) => control.getBoundingClientRect().height >= 44),
  };
}
async function printCheck() {
  const report = document.querySelector(".karnameh-student-sheet"),
    sentinel = document.createElement("tr");
  sentinel.hidden = true;
  sentinel.dataset.auditHiddenRow = "true";
  sentinel.innerHTML = '<td colspan="14">این ردیف پنهان نباید چاپ شود</td>';
  report.querySelector(".karnameh-assessment-table tbody").append(sentinel);
  globalThis.__EDU_PRINT_TEST__ = true;
  report.querySelector('[data-workspace-action="print"]').click();
  for (
    let attempt = 0;
    attempt < 150 &&
    !document.querySelector("#printRoot .karnameh-student-sheet");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 15));
  window.dispatchEvent(new Event("beforeprint"));
  const root = document.getElementById("printRoot"),
    clone = root?.querySelector(".karnameh-student-sheet");
  if (!clone)
    throw Error(
      "Authorized individual report printing did not preserve its snapshot context",
    );
  return {
    oneStudent:
      root.querySelectorAll(".karnameh-student-sheet").length === 1 &&
      clone.querySelector("h2,h3").textContent.trim() ===
        globalThis.__karnamehSheetStudents[11].name,
    twoAssessmentRows:
      clone.querySelectorAll(
        ".karnameh-assessment-table tbody tr:not([data-audit-hidden-row])",
      ).length === 2,
    oneModularRow:
      clone.querySelectorAll(".karnameh-modular-table tbody tr").length === 1,
    unrelatedStillHidden:
      clone.querySelector("[data-audit-hidden-row]")?.hidden === true,
    controlsRemoved: !root.querySelector(
      "button,select,.karnameh-student-pagination",
    ),
    sourceSelectionUnchanged:
      karnamehFilter.studentId === "grid_student_12" &&
      document.getElementById("karnamehStudent").value === "grid_student_12",
    contextAuthorized: clone.classList.contains("karnameh-year-document"),
  };
}
function printGeometry() {
  const root = document.getElementById("printRoot"),
    tables = [...root.querySelectorAll("table.karnameh-sheet-table")];
  return {
    twoNativeTables:
      tables.length === 2 &&
      tables.every((table) => getComputedStyle(table).display === "table"),
    unrelatedNotPrinted:
      getComputedStyle(root.querySelector("[data-audit-hidden-row]"))
        .display === "none",
    threeCourseRows:
      tables
        .flatMap((table) => [
          ...table.querySelectorAll("tbody tr:not([data-audit-hidden-row])"),
        ])
        .filter((row) => getComputedStyle(row).display !== "none").length === 3,
    namesNotSticky: tables.every(
      (table) =>
        getComputedStyle(table.querySelector("tbody tr").firstElementChild)
          .position !== "sticky",
    ),
  };
}
async function stalePrintCheck() {
  document.getElementById("printRoot")?.remove();
  const connection = EduV24.test.getConnection(),
    id = globalThis.__karnamehGridIds.first,
    original = await new Promise((resolve, reject) => {
      const tx = connection.transaction("catalog"),
        request = tx.objectStore("catalog").get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const write = (content) =>
    new Promise((resolve, reject) => {
      const tx = connection.transaction("catalog", "readwrite");
      tx.objectStore("catalog").put(content);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  await write({ ...original, revision: original.revision + 1 });
  document
    .querySelector('.karnameh-student-sheet [data-workspace-action="print"]')
    .click();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const rejected = !document.querySelector(
    "#printRoot .karnameh-student-sheet",
  );
  await write(original);
  return {
    otherTermChangeRejected: rejected,
    selectionUnchanged: karnamehFilter.studentId === "grid_student_12",
  };
}
async function run(env) {
  const { cdp, evaluate, cases } = env,
    previews = fs.mkdtempSync(path.join(os.tmpdir(), "edu-karnameh-student-"));
  const call = async (fn, ...args) =>
    evaluate(
      "(" +
        fn.toString() +
        ")(" +
        args.map((value) => JSON.stringify(value)).join(",") +
        ")",
    );
  const check = (id, name, pass, observed) =>
    cases.push({ id: "KAR_SHEET_" + id, name, pass: !!pass, observed });
  const numbers = (row) => row.cells.map((cell) => cell.value);
  const same = (actual, expected) =>
    JSON.stringify(actual) === JSON.stringify(expected);
  const shot = async (name, full = false) => {
    const screenshot = path.join(previews, name + ".png"),
      params = { format: "png" };
    if (full) {
      const layout = await cdp("Page.getLayoutMetrics");
      params.captureBeyondViewport = true;
      params.clip = {
        x: 0,
        y: 0,
        width: layout.cssContentSize.width,
        height: Math.min(layout.cssContentSize.height, 6000),
        scale: 1,
      };
    }
    const result = await cdp("Page.captureScreenshot", params);
    fs.writeFileSync(screenshot, Buffer.from(result.data, "base64"));
    return screenshot;
  };
  await require("./browser-ready.cjs")(env);
  try {
    const fixture = await call(setup);
    let current = await call(sheetState);
    check(
      "DEFAULT",
      "Opening a class selects only its first registered student",
      current.selected === "grid_student_1" &&
        current.selection === "grid_student_1" &&
        current.title === fixture.students[0].name &&
        current.previousDisabled &&
        !current.nextDisabled &&
        current.renderedStudent === "grid_student_1" &&
        current.singleStudent,
      current,
    );
    check(
      "ORDER",
      "Student dropdown preserves registration order rather than alphabetic names",
      same(
        current.options,
        fixture.students.map((student) => student.id),
      ),
      current.options,
    );
    check(
      "COURSE_ROWS",
      "Each course occupies one row in its own assessment model",
      current.assessment.length === 2 &&
        current.modular.length === 1 &&
        same(
          current.assessment.map((row) => row.id),
          ["grid_dual_one", "grid_dual_two"],
        ) &&
        current.modular[0].id === "grid_modular" &&
        current.assessment[0].lesson === "طراحی گرافیک رایانه‌ای" &&
        current.assessment[1].lesson ===
          "ویرایش تصویر و نرم‌افزارهای کاربردی" &&
        current.modular[0].lesson === "نصب و راه‌اندازی شبکه‌های رایانه‌ای" &&
        current.assessment.every((row) => row.cells.length === 13) &&
        current.modular[0].cells.length === 7,
      { assessment: current.assessment, modular: current.modular },
    );
    check(
      "HEADERS",
      "Assessment columns group four independent stages and modules keep separate raw-score groups",
      current.assessmentHeadRows === 2 &&
        current.modularHeadRows === 2 &&
        current.assessmentGroups.length === 4 &&
        current.assessmentGroups.every((group) => group.span === 3) &&
        current.modularGroups.length === 2 &&
        current.modularGroups.every((group) => group.span === 3),
      { assessment: current.assessmentGroups, modular: current.modularGroups },
    );
    check(
      "RAW_GRADES",
      "The full student table retains practical/theory values and four equally weighted stage results",
      same(
        numbers(current.assessment[0]),
        [10, 20, 13, 18, 14, 16.8, 18, 16, 17.4, 20, 18, 19.4, 16.65],
      ) &&
        same(
          numbers(current.assessment[1]),
          [17, 13, 15.8, 17, 13, 15.8, 19, 18, 18.7, 19, 18, 18.7, 17.25],
        ),
      current.assessment,
    );
    check(
      "MODULE_IDENTITY",
      "Module raw and annual results remain aligned by identity across reversed term order",
      current.modular[0].cells[0].note === "پودمان اول شبکه" &&
        current.modular[0].cells[3].note === "پودمان دوم شبکه" &&
        same(numbers(current.modular[0]), [2, 2, 12, 4, 3, 19, 15.5]),
      current.modular,
    );
    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      await evaluate(
        "document.querySelector('.karnameh-student-sheet').scrollIntoView({block:'start'});window.scrollBy(0,-90)",
      );
      const measured = await call(geometry),
        screenshot = await shot("student-sheet-" + width);
      check(
        "LAYOUT_" + width,
        "Both native student tables fit and keep their lesson column stable at " +
          width,
        measured.pageFits &&
          measured.reportFits &&
          measured.touchControls &&
          measured.tables.length === 2 &&
          measured.tables.every(
            (table) =>
              table.contained &&
              table.native &&
              table.scrollable &&
              table.sticky &&
              table.readable,
          ) &&
          same(measured.tables[0].rowWidths, [14, 14]) &&
          same(measured.tables[1].rowWidths, [8]),
        { ...measured, screenshot },
      );
    }
    await call(selectStudent, "next", 2);
    current = await call(sheetState);
    check(
      "NEXT",
      "Next student follows registration order and shows that student's grades",
      current.selected === "grid_student_2" &&
        current.title === fixture.students[1].name &&
        numbers(current.assessment[0]).every((value) => value === 12) &&
        current.singleStudent,
      current,
    );
    await call(selectStudent, "previous", 1);
    current = await call(sheetState);
    check(
      "PREVIOUS",
      "Previous returns to the first student without a class-wide ledger",
      current.selected === "grid_student_1" &&
        current.previousDisabled &&
        numbers(current.assessment[0])[12] === 16.65 &&
        current.singleStudent,
      current,
    );
    await call(selectStudent, "select", 3);
    current = await call(sheetState);
    check(
      "MISSING",
      "Missing input remains missing in its stage and annual result",
      numbers(current.assessment[0])[6] === 18 &&
        numbers(current.assessment[0])[7] === null &&
        numbers(current.assessment[0])[8] === null &&
        numbers(current.assessment[0])[12] === null &&
        same(numbers(current.modular[0]), [2, 2, 12, null, null, null, null]),
      current,
    );
    await call(selectStudent, "next", 4);
    current = await call(sheetState);
    check(
      "ZERO",
      "Recorded zero grades stay numeric zero instead of becoming missing",
      numbers(current.assessment[0]).length === 13 &&
        numbers(current.assessment[0]).every((value) => value === 0),
      current.assessment[0],
    );
    await call(selectStudent, "select", 23);
    current = await call(sheetState);
    const boundary = await call(lastBoundary);
    check(
      "LAST",
      "The final registered student has a disabled next boundary",
      current.selected === "grid_student_23" &&
        current.title === fixture.students[22].name &&
        current.nextDisabled &&
        !current.previousDisabled &&
        boundary.disabled &&
        boundary.unchanged &&
        current.singleStudent,
      { ...current, boundary },
    );
    await call(selectStudent, "previous", 22);
    current = await call(sheetState);
    check(
      "LAST_PREVIOUS",
      "Previous from the last student selects number twenty-two",
      current.selected === "grid_student_22" &&
        current.title === fixture.students[21].name,
      current,
    );
    await call(selectStudent, "select", 12);
    current = await call(sheetState);
    check(
      "DROPDOWN",
      "Choosing a student directly updates the sole complete grade sheet",
      current.selected === "grid_student_12" &&
        current.selection === "grid_student_12" &&
        current.renderedStudent === "grid_student_12" &&
        current.title === fixture.students[11].name &&
        current.singleStudent &&
        numbers(current.assessment[0])[12] === 16.65,
      current,
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await call(geometry);
    const detailsShot = await shot("student-12-full-390", true);
    check(
      "DETAIL_PREVIEW",
      "The selected student's full raw-grade sheet was captured",
      true,
      { screenshot: detailsShot },
    );
    const printed = await call(printCheck);
    check(
      "PRINT_ONE",
      "Printing includes only the selected student's complete courses and preserves unrelated hidden rows",
      Object.values(printed).every(Boolean),
      printed,
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1123,
      height: 794,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp("Emulation.setEmulatedMedia", { media: "print" });
    await evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    const printObserved = await call(printGeometry),
      printShot = await shot("print-student-12", true);
    check(
      "PRINT_CSS",
      "Print styling retains both native grade matrices and the selected student's three courses",
      Object.values(printObserved).every(Boolean),
      { ...printObserved, screenshot: printShot },
    );
    const pdf = await cdp("Page.printToPDF", {
        preferCSSPageSize: true,
        printBackground: true,
      }),
      pdfPath = path.join(previews, "print-student-12.pdf");
    const pdfBuffer = Buffer.from(pdf.data, "base64");
    fs.writeFileSync(pdfPath, pdfBuffer);
    check(
      "PRINT_PDF",
      "The selected student report prints on one A4 landscape page",
      pdfBuffer.toString("latin1").startsWith("%PDF-") &&
        (pdfBuffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || [])
          .length === 1,
      {
        path: pdfPath,
        bytes: pdfBuffer.length,
        pages: (pdfBuffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || [])
          .length,
      },
    );
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    const stale = await call(stalePrintCheck);
    check(
      "PRINT_CONTEXT",
      "The actual individual print action rejects a changed other-term snapshot",
      Object.values(stale).every(Boolean),
      stale,
    );
    check(
      "PREVIEWS",
      "Actual student-sheet browser previews were captured",
      true,
      { directory: previews },
    );
  } finally {
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    await cdp("Emulation.clearDeviceMetricsOverride");
    await evaluate(
      "document.getElementById('printRoot')?.remove();document.getElementById('printPageStyle')?.remove();delete globalThis.__EDU_PRINT_TEST__;globalThis.__karnamehGridCleanup?.()",
    );
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "individual-student-grade-sheet", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
