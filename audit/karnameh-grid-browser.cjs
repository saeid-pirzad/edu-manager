"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { detectRepeatedTableHeaders } = require("./report-header-raster.cjs");

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
    activeGroups: [
      ...report.querySelectorAll("table.karnameh-sheet-table"),
    ].map((table) => table.dataset.karnamehActiveGroup),
    activeOptionsVisible: [
      ...report.querySelectorAll(".karnameh-stage-options [aria-pressed=true]"),
    ]
      .filter((button) => button.getBoundingClientRect().height > 0)
      .every((button) => {
        const bar = button.parentElement.getBoundingClientRect(),
          rect = button.getBoundingClientRect();
        return rect.left >= bar.left - 1 && rect.right <= bar.right + 1;
      }),
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
async function optionBarMetrics(options) {
  const buttons = [...options.querySelectorAll("button")].filter(
    (button) => button.getBoundingClientRect().height > 0,
  );
  if (!buttons.length)
    return {
      buttons: 0,
      rows: 0,
      equalWidths: true,
      textFits: true,
      lastReachable: true,
      contained: true,
      touchTargets: true,
      width: 0,
    };
  const original = options.scrollLeft,
    widths = buttons.map((button) => button.getBoundingClientRect().width),
    topRows = new Set(
      buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
    ),
    bounds = () => {
      const rect = options.getBoundingClientRect();
      return {
        left: rect.left + options.clientLeft,
        right: rect.left + options.clientLeft + options.clientWidth,
      };
    },
    inside = (button) => {
      const rect = button.getBoundingClientRect(),
        bar = bounds();
      return rect.left >= bar.left - 1 && rect.right <= bar.right + 1;
    },
    last = buttons.at(-1),
    initiallyVisible = inside(last);
  const textFits = buttons.every((button) => {
    const range = document.createRange();
    range.selectNodeContents(button);
    const lines = [...range.getClientRects()].filter((rect) => rect.width > 0),
      rect = button.getBoundingClientRect(),
      style = getComputedStyle(button),
      left =
        rect.left +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.paddingLeft),
      right =
        rect.right -
        parseFloat(style.borderRightWidth) -
        parseFloat(style.paddingRight);
    return (
      new Set(lines.map((line) => Math.round(line.top))).size === 1 &&
      lines.every((line) => line.left >= left - 1 && line.right <= right + 1)
    );
  });
  try {
    options.scrollLeft = -(options.scrollWidth - options.clientWidth);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (!inside(last)) {
      options.scrollLeft = options.scrollWidth - options.clientWidth;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const lastReachable =
      inside(last) &&
      (initiallyVisible || Math.abs(options.scrollLeft - original) > 0);
    const rect = options.getBoundingClientRect(),
      parent = options.closest("header").getBoundingClientRect();
    return {
      buttons: buttons.length,
      rows: topRows.size,
      equalWidths: Math.max(...widths) - Math.min(...widths) <= 1,
      minimumWidth: Math.min(...widths),
      maximumWidth: Math.max(...widths),
      textFits,
      lastReachable,
      contained: rect.left >= parent.left - 1 && rect.right <= parent.right + 1,
      touchTargets: buttons.every(
        (button) => button.getBoundingClientRect().height >= 34,
      ),
      width: options.clientWidth,
      contentWidth: options.scrollWidth,
    };
  } finally {
    options.scrollLeft = original;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}
async function rerenderSheet() {
  render();
  await renderKarnamehTabReports();
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

async function geometry() {
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const report = document.querySelector(".karnameh-student-sheet"),
    compact = matchMedia("(max-width:1024px)").matches,
    tables = [];
  for (const table of report.querySelectorAll("table.karnameh-sheet-table")) {
    const scroll = table.closest(".table-scroll"),
      rows = [...table.querySelectorAll("tbody tr")],
      row = rows[0],
      first = row.firstElementChild,
      original = scroll.scrollLeft,
      before = first.getBoundingClientRect().right,
      overflows = scroll.scrollWidth > scroll.clientWidth + 1;
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
    const visible = (element) => getComputedStyle(element).display !== "none",
      stageControls = table
        .closest(".karnameh-subject-section")
        .querySelector(".karnameh-stage-switcher"),
      sectionHeader = table
        .closest(".karnameh-subject-section")
        .querySelector(":scope > header"),
      sectionTitle = sectionHeader.querySelector("h4");
    const optionMetrics = await globalThis.__karnamehOptionMetrics(
      stageControls.querySelector(".karnameh-stage-options"),
    );
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
      horizontalMode: compact
        ? !overflows
        : !overflows || scroll.scrollLeft !== original,
      stableLesson:
        compact ||
        (getComputedStyle(first).position === "sticky" &&
          Math.abs(before - first.getBoundingClientRect().right) < 1),
      readable: [...row.children]
        .filter(visible)
        .every((cell) => parseFloat(getComputedStyle(cell).fontSize) >= 11),
      rowWidths: rows.map((item) => item.children.length),
      visibleWidths: rows.map(
        (item) => [...item.children].filter(visible).length,
      ),
      sectionTitleInsideBox:
        !!sectionTitle && sectionHeader.contains(stageControls),
      sectionTitleVisible:
        !!sectionTitle &&
        visible(sectionTitle) &&
        sectionTitle.getBoundingClientRect().height > 0,
      headerDescriptionRemoved: !sectionHeader.querySelector("p,small"),
      stageControlsVisible: !!stageControls && visible(stageControls),
      stageButtonRows: optionMetrics.rows,
      optionMetrics,
      noTechnicalAnnualOption:
        !table.classList.contains("karnameh-modular-table") ||
        !stageControls.querySelector('[data-karnameh-stage="annual"]'),
      moduleOptionsFit:
        !table.classList.contains("karnameh-modular-table") ||
        !compact ||
        optionMetrics.contentWidth <= optionMetrics.width + 1,
      wrapperWidth: scroll.clientWidth,
      tableWidth: scroll.scrollWidth,
      lessonWidth: first.getBoundingClientRect().width,
    });
    scroll.scrollLeft = original;
  }
  return {
    compact,
    pageFits:
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
    reportFits: report.scrollWidth <= report.clientWidth + 1,
    noAnnualUI: !report.querySelector(
      "[data-karnameh-field=annual],[data-karnameh-group=annual],[data-karnameh-stage=annual],.karnameh-sheet-annual",
    ),
    guidanceRemoved:
      !report.textContent.includes("مرحله یا پودمان را انتخاب کنید") &&
      !report.textContent.includes("هر مرحله:") &&
      !report.textContent.includes("نمرات پودمان‌ها سالانه‌اند"),
    tables,
    touchControls: [
      ...report.querySelectorAll(
        ".karnameh-student-pagination button,.karnameh-stage-options button",
      ),
    ]
      .filter(
        (control) =>
          getComputedStyle(control).display !== "none" &&
          control.getBoundingClientRect().height > 0,
      )
      .every(
        (control) =>
          control.getBoundingClientRect().height >=
          (control.closest(".karnameh-stage-options") ? 34 : 44),
      ),
  };
}
async function fiveModuleOptions() {
  const section = document
      .querySelector(".karnameh-modular-table")
      .closest(".karnameh-subject-section"),
    clone = section.querySelector(":scope > header").cloneNode(true),
    options = clone.querySelector(".karnameh-stage-options"),
    template = options.querySelector("button").cloneNode(true);
  options.replaceChildren();
  for (let index = 0; index < 5; index++) {
    const button = template.cloneNode(true);
    button.textContent =
      "پودمان " +
      String(index + 1).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
    button.dataset.karnamehStage = "module-" + index;
    button.setAttribute("aria-pressed", String(index === 0));
    options.append(button);
  }
  section.querySelector(".karnameh-sheet-scroll").before(clone);
  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return await globalThis.__karnamehOptionMetrics(options);
  } finally {
    clone.remove();
  }
}
async function chooseStage(kind, group) {
  const report = document.querySelector(".karnameh-student-sheet"),
    table = report.querySelector(".karnameh-" + kind + "-table"),
    section = table.closest(".karnameh-subject-section"),
    button = section.querySelector(
      '[data-workspace-action="karnameh-stage"][data-karnameh-stage="' +
        group +
        '"]',
    ),
    student = report.dataset.studentId;
  if (!button) throw Error("Missing stage control " + kind + ":" + group);
  button.focus({ preventScroll: true });
  button.click();
  for (let attempt = 0; attempt < 150; attempt++) {
    if (
      button.getAttribute("aria-pressed") === "true" &&
      table.dataset.karnamehActiveGroup === group
    ) {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const visible = (cell) => getComputedStyle(cell).display !== "none";
      const number = (cell) => {
        const text = cell
          .querySelector(".karnameh-sheet-value")
          .textContent.trim()
          .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
        return text === "—" || text === "جبران" ? null : Number(text);
      };
      return {
        sameReport:
          report === document.querySelector(".karnameh-student-sheet"),
        sameStudent:
          report.dataset.studentId === student &&
          karnamehFilter.studentId === student,
        focusPreserved: document.activeElement === button,
        activeVisible: (() => {
          const bar = button.parentElement.getBoundingClientRect(),
            rect = button.getBoundingClientRect();
          return rect.left >= bar.left - 1 && rect.right <= bar.right + 1;
        })(),
        onlyOnePressed:
          section.querySelectorAll(
            '.karnameh-stage-options [aria-pressed="true"]',
          ).length === 1,
        group,
        values: [...table.querySelectorAll("tbody tr")].map((row) =>
          [...row.querySelectorAll("td")].filter(visible).map(number),
        ),
        visibleWidths: [...table.querySelectorAll("tbody tr")].map(
          (row) => [...row.children].filter(visible).length,
        ),
        noHorizontal:
          table.closest(".table-scroll").scrollWidth <=
          table.closest(".table-scroll").clientWidth + 1,
        allGroupsInDOM: [
          ...new Set(
            [...table.querySelectorAll("[data-karnameh-group]")].map(
              (cell) => cell.dataset.karnamehGroup,
            ),
          ),
        ],
        noHiddenAttributes: !table.querySelector(
          "[data-karnameh-group][hidden]",
        ),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw Error("Stage control did not settle to " + kind + ":" + group);
}

async function printCheck() {
  const report = document.querySelector(".karnameh-student-sheet"),
    sentinel = document.createElement("tr");
  sentinel.hidden = true;
  sentinel.dataset.auditHiddenRow = "true";
  sentinel.innerHTML = '<td colspan="13">این ردیف پنهان نباید چاپ شود</td>';
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
    allThirteenAssessmentColumns: [
      ...root.querySelectorAll(
        ".karnameh-assessment-table tbody tr:not([data-audit-hidden-row])",
      ),
    ].every(
      (row) =>
        [...row.children].filter(
          (cell) => getComputedStyle(cell).display !== "none",
        ).length === 13,
    ),
    allSevenModularColumns: [
      ...root.querySelectorAll(".karnameh-modular-table tbody tr"),
    ].every(
      (row) =>
        [...row.children].filter(
          (cell) => getComputedStyle(cell).display !== "none",
        ).length === 7,
    ),
    stageControlsRemoved: !root.querySelector(".karnameh-stage-switcher"),
    noAnnualUI: !root.querySelector(
      "[data-karnameh-field=annual],[data-karnameh-group=annual],[data-karnameh-stage=annual],.karnameh-sheet-annual",
    ),
    sectionTitlesPrinted:
      [...root.querySelectorAll(".karnameh-subject-section > header h4")]
        .map((title) => title.textContent.trim())
        .join("|") === "دروس کاردانش|دروس فنی پودمانی" &&
      [...root.querySelectorAll(".karnameh-subject-section > header h4")].every(
        (title) =>
          getComputedStyle(title).display !== "none" &&
          title.getBoundingClientRect().height > 0,
      ),
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
function printDesign() {
  const root = document.getElementById("printRoot"),
    table = root.querySelector("table.karnameh-sheet-table"),
    values = [...root.querySelectorAll(".karnameh-sheet-value")],
    lessonCells = [...root.querySelectorAll("tbody .karnameh-lesson-name")],
    scoreCells = [...root.querySelectorAll("td[data-karnameh-field]")],
    fonts = values.map(
      (value) => parseFloat(getComputedStyle(value).fontSize) * 0.75,
    ),
    widths = lessonCells.map(
      (cell) => cell.getBoundingClientRect().width * 0.75,
    );
  const valueFits = (value) => {
    const range = document.createRange();
    range.selectNodeContents(value);
    const cell = value.closest("td"),
      box = cell.getBoundingClientRect(),
      style = getComputedStyle(cell),
      left = box.left + parseFloat(style.borderLeftWidth),
      right = box.right - parseFloat(style.borderRightWidth);
    return [...range.getClientRects()].every(
      (rect) => rect.left >= left - 1 && rect.right <= right + 1,
    );
  };
  const minimumFont = Math.min(...fonts),
    minimumLessonWidth = Math.min(...widths),
    headingSpace =
      table.getBoundingClientRect().top - root.getBoundingClientRect().top,
    longValues = values.filter((value) =>
      value.textContent.includes("کمتر از"),
    );
  return {
    singleHeader:
      root.querySelectorAll(".karnameh-print-header").length === 1 &&
      !root.querySelector(
        ":scope > header,.karnameh-report-heading,.karnameh-student-meta,h1",
      ),
    completeIdentity:
      root.querySelectorAll(".karnameh-print-context dd").length === 3 &&
      !!root.querySelector(".karnameh-print-header h2") &&
      root.querySelector(".karnameh-print-header").textContent.includes("۱۲"),
    readableScores: minimumFont >= 9,
    sufficientLessonWidth: minimumLessonWidth >= 125,
    compactHeader: headingSpace <= 220,
    centeredScores: scoreCells.every(
      (cell) => getComputedStyle(cell).textAlign === "center",
    ),
    separatedHeaders: [...root.querySelectorAll("thead th")].every(
      (cell) => parseFloat(getComputedStyle(cell).borderBottomWidth) > 0,
    ),
    repeatedHeaders: [...root.querySelectorAll("thead")].every(
      (head) =>
        getComputedStyle(head).display === "table-header-group" &&
        getComputedStyle(head).breakInside === "avoid",
    ),
    rowsStayTogether: [
      ...root.querySelectorAll("tbody tr:not([data-audit-hidden-row])"),
    ].every((row) => getComputedStyle(row).breakInside === "avoid"),
    valueTextFits: values.every(valueFits),
    whitePaper:
      getComputedStyle(document.body).backgroundColor === "rgb(255, 255, 255)",
    minimumScorePoints: minimumFont,
    minimumLessonPoints: minimumLessonWidth,
    headerSpacePixels: headingSpace,
    longValueCount: longValues.length,
    longValueText: longValues[0]?.textContent.trim() || "",
  };
}
async function preparePdfVariant(kind) {
  const ids = globalThis.__karnamehGridIds;
  globalThis.__karnamehPdfBase ||= await EduV24.snapshotInstallation();
  const fixture = structuredClone(globalThis.__karnamehPdfBase);
  for (const record of fixture.stores.records.filter(
    (record) => record.logical === "class:" + ids.classroom,
  )) {
    const dual = record.value.lessons.find(
        (lesson) => lesson.gradeMode === "kardanesh",
      ),
      modular = record.value.lessons.find(
        (lesson) => lesson.gradingPolicy?.method === "modular",
      );
    if (kind === "modular") record.value.lessons = [modular];
    else if (kind === "general") {
      const lesson = structuredClone(dual);
      lesson.id = "grid_pdf_general";
      lesson.name = "درس عمومی نمونه برای بررسی خوانایی کارنامه";
      lesson.gradingPolicy = {
        ...lesson.gradingPolicy,
        subjectType: "general",
        code: "PDF-GENERAL",
      };
      record.value.lessons = [lesson];
    } else {
      record.value.lessons = [
        ...Array.from({ length: 20 }, (_, index) => {
          const lesson = structuredClone(dual);
          lesson.id = "grid_pdf_stress_" + index;
          lesson.name =
            "درس آزمایشی طراحی و آماده‌سازی محتوای آموزشی شماره " + (index + 1);
          lesson.gradingPolicy.code = "PDF-STRESS-" + index;
          lesson.kardaneshScores.grid_student_12 = {
            midtermPractical: 13.999,
            midtermTheory: 13.999,
            practical: 13.999,
            theory: 13.999,
          };
          return lesson;
        }),
        modular,
      ];
    }
  }
  closeModal();
  EduV24.previewFullBackup(fixture);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  await EduV24.test.settle();
  closeModal();
  goReports();
  state.reportTab = "karnameh";
  karnamehFilter = {
    schoolId: ids.school,
    classId: ids.classroom,
    studentId: "grid_student_12",
  };
  render();
  await renderKarnamehTabReports();
  for (
    let attempt = 0;
    attempt < 150 && !document.querySelector(".karnameh-student-sheet");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 20));
  const report = document.querySelector(".karnameh-student-sheet");
  globalThis.__EDU_PRINT_TEST__ = true;
  report.querySelector('[data-workspace-action="print"]').click();
  for (
    let attempt = 0;
    attempt < 150 &&
    !document.querySelector("#printRoot .karnameh-student-sheet");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 20));
  if (!document.querySelector("#printRoot .karnameh-student-sheet"))
    throw Error("PDF variant did not prepare: " + kind);
  return {
    kind,
    lessons: document.querySelectorAll("#printRoot tbody tr").length,
    student: document.querySelector("#printRoot .karnameh-student-sheet")
      .dataset.studentId,
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
  const sourceReport = document.querySelector(".karnameh-student-sheet"),
    table = sourceReport.querySelector(".karnameh-assessment-table"),
    groupBefore = table.dataset.karnamehActiveGroup,
    nextGroup =
      groupBefore === "first-midterm" ? "first-final" : "first-midterm";
  sourceReport
    .querySelector(
      '[data-workspace-action="karnameh-stage"][data-karnameh-stage="' +
        nextGroup +
        '"]',
    )
    .click();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const staleStageRejected =
    table.dataset.karnamehActiveGroup === groupBefore &&
    document.querySelector(".karnameh-student-sheet") === sourceReport;
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
    staleStageRejected,
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
        x: layout.cssContentSize.x || 0,
        y: layout.cssContentSize.y || 0,
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
  await evaluate(
    "globalThis.__karnamehOptionMetrics=(" + optionBarMetrics.toString() + ")",
  );
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
        current.assessment.every((row) => row.cells.length === 12) &&
        current.modular[0].cells.length === 6,
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
      "The full student table retains practical/theory values and four independent weighted stage results",
      same(
        numbers(current.assessment[0]),
        [10, 20, 13, 18, 14, 16.8, 18, 16, 17.4, 20, 18, 19.4],
      ) &&
        same(
          numbers(current.assessment[1]),
          [17, 13, 15.8, 17, 13, 15.8, 19, 18, 18.7, 19, 18, 18.7],
        ),
      current.assessment,
    );
    check(
      "MODULE_IDENTITY",
      "Module raw inputs and results remain aligned by identity across reversed term order",
      current.modular[0].cells[0].note === "پودمان اول شبکه" &&
        current.modular[0].cells[3].note === "پودمان دوم شبکه" &&
        same(numbers(current.modular[0]), [2, 2, 12, 4, 3, 19]),
      current.modular,
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await call(chooseStage, "assessment", "first-midterm");
    await call(chooseStage, "modular", "module-0");
    for (const width of [320, 390, 768, 1024, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      await evaluate(
        "document.querySelector('.karnameh-student-sheet').scrollIntoView({block:'start'});window.scrollBy(0,-90)",
      );
      if (width <= 1024) {
        const extra = await call(fiveModuleOptions);
        check(
          "FIVE_MODULE_OPTIONS_" + width,
          "Five equal module choices fit one row without annual or scrolling at " +
            width,
          extra.buttons === 5 &&
            extra.contentWidth <= extra.width + 1 &&
            extra.rows === 1 &&
            extra.equalWidths &&
            extra.textFits &&
            extra.lastReachable &&
            extra.contained &&
            extra.touchTargets,
          extra,
        );
      }
      const measured = await call(geometry),
        screenshot = await shot("student-sheet-" + width);
      check(
        "LAYOUT_" + width,
        "Both native student tables fit and keep their lesson column stable at " +
          width,
        measured.pageFits &&
          measured.reportFits &&
          measured.guidanceRemoved &&
          measured.noAnnualUI &&
          measured.touchControls &&
          measured.tables.length === 2 &&
          measured.tables.every(
            (table) =>
              table.contained &&
              table.native &&
              table.horizontalMode &&
              table.stableLesson &&
              table.readable &&
              table.sectionTitleInsideBox &&
              table.sectionTitleVisible &&
              table.headerDescriptionRemoved,
          ) &&
          same(measured.tables[0].rowWidths, [13, 13]) &&
          same(measured.tables[1].rowWidths, [7]) &&
          same(
            measured.tables[0].visibleWidths,
            width <= 1024 ? [4, 4] : [13, 13],
          ) &&
          same(measured.tables[1].visibleWidths, width <= 1024 ? [4] : [7]) &&
          measured.tables.every(
            (table) =>
              table.stageControlsVisible === width <= 1024 &&
              (width <= 1024
                ? table.stageButtonRows === 1 &&
                  table.optionMetrics.equalWidths &&
                  table.optionMetrics.textFits &&
                  table.optionMetrics.lastReachable &&
                  table.optionMetrics.contained &&
                  table.noTechnicalAnnualOption &&
                  table.moduleOptionsFit
                : table.stageButtonRows === 0),
          ),
        { ...measured, screenshot },
      );
    }

    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const assessmentStages = [
      [
        "first-midterm",
        [
          [10, 20, 13],
          [17, 13, 15.8],
        ],
      ],
      [
        "first-final",
        [
          [18, 14, 16.8],
          [17, 13, 15.8],
        ],
      ],
      [
        "second-midterm",
        [
          [18, 16, 17.4],
          [19, 18, 18.7],
        ],
      ],
      [
        "second-final",
        [
          [20, 18, 19.4],
          [19, 18, 18.7],
        ],
      ],
    ];
    for (const [key, expected] of assessmentStages) {
      const view = await call(chooseStage, "assessment", key);
      check(
        "STAGE_" + key,
        "Selected assessment stage shows only its exact raw scores: " + key,
        view.sameReport &&
          view.sameStudent &&
          view.onlyOnePressed &&
          view.focusPreserved &&
          view.activeVisible &&
          view.noHiddenAttributes &&
          view.noHorizontal &&
          same(view.values, expected) &&
          view.allGroupsInDOM.length === 4 &&
          view.visibleWidths.every((size) => size === 4),
        view,
      );
    }
    for (const [key, expected] of [
      ["module-0", [[2, 2, 12]]],
      ["module-1", [[4, 3, 19]]],
    ]) {
      const view = await call(chooseStage, "modular", key);
      check(
        "MODULE_" + key,
        "Selected module preserves its three raw grades: " + key,
        view.sameReport &&
          view.sameStudent &&
          view.onlyOnePressed &&
          view.focusPreserved &&
          view.activeVisible &&
          view.noHiddenAttributes &&
          view.noHorizontal &&
          same(view.values, expected) &&
          view.allGroupsInDOM.length === 2 &&
          view.visibleWidths.every((size) => size === 4),
        view,
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
    const changedStudentVisible =
      current.activeOptionsVisible &&
      same(current.activeGroups, ["second-final", "module-1"]);
    await call(rerenderSheet);
    current = await call(sheetState);
    check(
      "ACTIVE_OPTION_RESTORE",
      "The selected stage remains visible after changing student and rendering again",
      changedStudentVisible &&
        current.activeOptionsVisible &&
        same(current.activeGroups, ["second-final", "module-1"]) &&
        current.selected === "grid_student_2",
      current,
    );
    await call(selectStudent, "previous", 1);
    current = await call(sheetState);
    check(
      "PREVIOUS",
      "Previous returns to the first student without a class-wide ledger",
      current.selected === "grid_student_1" &&
        current.previousDisabled &&
        numbers(current.assessment[0])[11] === 19.4 &&
        current.singleStudent,
      current,
    );
    await call(selectStudent, "select", 3);
    current = await call(sheetState);
    check(
      "MISSING",
      "Missing input remains missing in its own stage result",
      numbers(current.assessment[0])[6] === 18 &&
        numbers(current.assessment[0])[7] === null &&
        numbers(current.assessment[0])[8] === null &&
        same(numbers(current.modular[0]), [2, 2, 12, null, null, null]),
      current,
    );
    await call(selectStudent, "next", 4);
    current = await call(sheetState);
    check(
      "ZERO",
      "Recorded zero grades stay numeric zero instead of becoming missing",
      numbers(current.assessment[0]).length === 12 &&
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
        numbers(current.assessment[0])[11] === 19.4,
      current,
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await call(chooseStage, "assessment", "first-midterm");
    await call(chooseStage, "modular", "module-0");
    await call(geometry);
    const detailsShot = await shot("student-12-full-390", true);
    check(
      "DETAIL_PREVIEW",
      "The selected student's full raw-grade sheet was captured",
      true,
      { screenshot: detailsShot },
    );

    const printStage = await call(chooseStage, "assessment", "second-midterm"),
      printModule = await call(chooseStage, "modular", "module-1");
    check(
      "PRINT_STAGE_SELECTION",
      "Printing starts from a compact noninitial stage and the second module",
      printStage.sameReport &&
        printStage.sameStudent &&
        same(printStage.values, [
          [18, 16, 17.4],
          [19, 18, 18.7],
        ]) &&
        printModule.sameReport &&
        printModule.sameStudent &&
        same(printModule.values, [[4, 3, 19]]),
      { assessment: printStage, modular: printModule },
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
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    const stale = await call(stalePrintCheck);
    check(
      "PRINT_CONTEXT",
      "The actual individual print action rejects a changed other-term snapshot",
      Object.values(stale).every(Boolean),
      stale,
    );

    for (const kind of ["modular", "general", "stress"]) {
      await call(preparePdfVariant, kind);
      await cdp("Emulation.setDeviceMetricsOverride", {
        width: kind === "stress" ? 1123 : 794,
        height: kind === "stress" ? 794 : 1123,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp("Emulation.setEmulatedMedia", { media: "print" });
      await evaluate(
        "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
      );
      const design = await call(printDesign);
      const designKeys = [
        "singleHeader",
        "completeIdentity",
        "readableScores",
        "sufficientLessonWidth",
        "compactHeader",
        "centeredScores",
        "separatedHeaders",
        "repeatedHeaders",
        "rowsStayTogether",
        "valueTextFits",
        "whitePaper",
      ];
      check(
        "PRINT_DESIGN_" + kind,
        "Real " +
          kind +
          " PDF layout keeps typography, identity and cell boundaries readable",
        designKeys.every((key) => design[key]) &&
          (kind !== "stress" || design.longValueCount >= 80),
        design,
      );
      const output = await cdp("Page.printToPDF", {
          preferCSSPageSize: true,
          printBackground: true,
        }),
        filename = path.join(previews, "print-" + kind + ".pdf"),
        bytes = Buffer.from(output.data, "base64");
      fs.writeFileSync(filename, bytes);
      const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) || [])
        .length;
      check(
        "PRINT_PAGES_" + kind,
        "Real " + kind + " report uses the expected paper and pagination",
        kind === "stress" ? pages >= 2 && pages <= 5 : pages === 1,
        { path: filename, pages },
      );
      if (process.platform === "win32") {
        const raster = require("./pdf-raster.cjs").rasterizePdf(
          filename,
          path.join(previews, "raster-" + kind),
        );
        const safeMargins = raster.pages.every(
          (page) =>
            page.ink.inkPixels > 1000 &&
            ["leftMargin", "rightMargin", "topMargin", "bottomMargin"].every(
              (key) => page.ink[key] >= 20,
            ),
        );
        const landscape =
          raster.pages[0].widthPoints > raster.pages[0].heightPoints;
        check(
          "PRINT_RASTER_" + kind,
          "Native PDF raster preserves full page margins and paper orientation",
          safeMargins && landscape === (kind === "stress"),
          raster,
        );
        if (kind === "stress") {
          const headers = raster.pages.slice(1).map((page) => ({
            file: page.file,
            ...detectRepeatedTableHeaders(page.ink),
          }));
          check(
            "PRINT_REPEATED_HEADERS",
            "The native raster repeats the two-tier table header on continuation pages",
            headers.every((page) => page.twoHeaderRows),
            headers,
          );
        }
      }
      await cdp("Emulation.setEmulatedMedia", { media: "" });
    }
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
      "document.getElementById('printRoot')?.remove();document.getElementById('printPageStyle')?.remove();delete globalThis.__EDU_PRINT_TEST__;delete globalThis.__karnamehOptionMetrics;delete globalThis.__karnamehPdfBase;globalThis.__karnamehGridCleanup?.()",
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
