"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { main } = require("./data-integrity.cjs");
const { seedReminders } = require("./attendance-reminders-browser.cjs");

async function seedUnitKarnameh() {
  const fixture = await EduV24.snapshotInstallation();
  const students = ["reminder-student-a", "reminder-student-b"];
  const definitions = [
    ["طراحی و اجرا", [0, 3], [4.5, 3], [4, 2], [2, 3]],
    ["آماده‌سازی", [0, null], [null, null], [1, 2], [0, 3]],
    [
      "ارزیابی کیفیت، مستندسازی پروژه و ارائهٔ راهکارهای اصلاحی در محیط واقعی کار",
      [3, 2],
      [5, 2],
      [5, 3],
      [4.5, 3],
    ],
    ["عیب‌یابی و نگهداری", [1, 3], [5, 3], [0, 2], [3, 2]],
    ["تحویل و پشتیبانی پروژه", [2.5, 3], [4, 3], [5, 2], [0, null]],
  ];
  const expected = {};
  const lessons = [
    ["unit-karnameh-lesson", "ارزشیابی مستقل واحدهای کار"],
    [
      "unit-karnameh-peer-lesson",
      "مدیریت پروژه و تولید محتوای الکترونیکی برای محیط‌های آموزشی و کارگاهی",
    ],
  ].map(([id, name], lessonIndex) => {
    expected[id] = {};
    return {
      id,
      name,
      gradeMode: "standard",
      gradingPolicy: {
        ...EduPolicy.defaults("modular", EduAcademicYear.current()),
        version: 2,
        modularScope: "unit",
        unitCount: 2,
        confirmed: true,
        code: "UNIT-KARNAMEH-" + lessonIndex,
      },
      kardaneshScores: {},
      poudmans: definitions
        .slice(0, lessonIndex === 0 ? 5 : 2)
        .map(([label, ...scores], moduleIndex) => ({
          id: id + "-module-" + moduleIndex,
          name: "پودمان " + label,
          podScores: {},
          units: (lessonIndex === 1 && moduleIndex === 0 ? [0] : [0, 1]).map(
            (unitIndex) => {
              const unitId = id + "-unit-" + moduleIndex + "-" + unitIndex;
              const competencyScores = {};
              expected[id][unitId] = {};
              for (const [studentIndex, studentId] of students.entries()) {
                let [m, c] = scores[studentIndex * 2 + unitIndex];
                if (
                  lessonIndex === 1 &&
                  moduleIndex === 0 &&
                  studentIndex === 0
                )
                  [m, c] = unitIndex === 0 ? [1, 3] : [2, 2];
                if (m != null || c != null)
                  competencyScores[studentId] = {
                    ...(m != null ? { m } : {}),
                    ...(c != null ? { c } : {}),
                  };
                expected[id][unitId][studentId] = [
                  m,
                  c,
                  m != null && c != null ? m + c * 5 : null,
                ];
              }
              return {
                id: unitId,
                name:
                  moduleIndex === 2
                    ? "واحد کار " +
                      (unitIndex + 1) +
                      " · بررسی و مستندسازی فرایند تولید و ارائهٔ پروژه با رعایت استانداردهای حرفه‌ای"
                    : unitIndex === 0
                      ? "واحد کار طراحی اولیه"
                      : "واحد کار اجرای نهایی",
                unitScores: {},
                competencyScores,
              };
            },
          ),
        })),
    };
  });
  const modularGrades = {
    "reminder-student-a": [
      [0, 3, 15],
      [4.5, 3, 19.5],
    ],
    "reminder-student-b": [
      [5, 2, 15],
      [1, 3, 16],
    ],
  };
  lessons.push({
    id: "unit-karnameh-old-modular",
    name: "درس پودمانی با ثبت نمرهٔ پودمان",
    gradeMode: "standard",
    gradingPolicy: {
      ...EduPolicy.defaults("modular", EduAcademicYear.current()),
      version: 1,
      modularScope: "module",
      confirmed: true,
      code: "UNIT-KARNAMEH-OLD",
    },
    kardaneshScores: {},
    poudmans: [0, 1].map((position) => ({
      id: "old-module-" + position,
      name: "پودمان قدیمی " + (position + 1),
      podScores: Object.fromEntries(
        students.map((student) => [
          student,
          {
            m: modularGrades[student][position][0],
            c: modularGrades[student][position][1],
          },
        ]),
      ),
      units: [
        { id: "old-unit-" + position, name: "واحد آموزشی", unitScores: {} },
      ],
    })),
  });
  fixture.stores.records = fixture.stores.records.filter(
    (row) => !row.logical.startsWith("session:"),
  );
  for (const row of fixture.stores.records) {
    if (row.logical === "class:reminder-class")
      row.value.lessons = structuredClone(lessons);
    if (row.logical === "meta") {
      row.value.masterSchedule = {};
      row.value.notHeldSessions = [];
    }
  }
  closeModal();
  EduV24.previewFullBackup(fixture);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  EduV24.openKarnamehStudent("reminder-class", students[0]);
  return {
    students,
    expected,
    modularGrades,
    lessons: lessons
      .filter((lesson) => EduPolicy.unitBased(lesson.gradingPolicy))
      .map((lesson) => ({
        id: lesson.id,
        modules: lesson.poudmans.map((module) => ({
          id: module.id,
          name: module.name,
          units: module.units.map((unit) => ({ id: unit.id, name: unit.name })),
        })),
      })),
  };
}

async function measureTable({ scopeSelector = "#karnamehTabOutput" } = {}) {
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const scope = document.querySelector(scopeSelector);
  const tables = [...scope.querySelectorAll(".karnameh-unit-competency-table")];
  if (!tables.length)
    throw Error("Shared independent work-unit report table is missing");
  const shown = (cell) => {
    const style = getComputedStyle(cell),
      box = cell.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      box.width > 0 &&
      box.height > 0
    );
  };
  const value = (cell) => {
    const text = cell
      .querySelector(".karnameh-sheet-value")
      .textContent.trim()
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
    return text === "—" || text === "جبران" ? null : Number(text);
  };
  const styleOf = (element, properties) => {
    if (!element) return null;
    const style = getComputedStyle(element);
    return properties.map((property) => style[property]);
  };
  const signature = (table) => {
    const section = table.closest(".karnameh-subject-section"),
      lesson = table.querySelector("thead .karnameh-lesson-name"),
      score = [...table.querySelectorAll(".karnameh-sheet-value")].find(shown),
      group = [...table.querySelectorAll("th.karnameh-stage-group")].find(
        shown,
      ),
      subhead = [...(table.tHead.rows[1]?.cells || [])].find(shown),
      button = section.querySelector("[data-karnameh-stage]");
    return {
      lessonRatio:
        lesson.getBoundingClientRect().width /
        table.getBoundingClientRect().width,
      lesson: styleOf(lesson, ["fontSize", "fontWeight", "padding"]),
      group: styleOf(group, ["fontSize", "fontWeight", "padding"]),
      subhead: styleOf(subhead, ["fontSize", "fontWeight", "padding"]),
      score: styleOf(score, ["fontSize", "padding"]),
      button: styleOf(button, [
        "fontSize",
        "lineHeight",
        "minHeight",
        "borderRadius",
      ]),
    };
  };
  const compact = matchMedia("screen and (max-width: 1024px)").matches;
  return {
    compact,
    printed: matchMedia("print").matches,
    tables: tables.map((table) => {
      const report = table.closest(".karnameh-student-sheet"),
        section = table.closest(".karnameh-subject-section"),
        scroll = table.closest(".karnameh-sheet-scroll"),
        heads = [...table.tHead.rows[0].cells],
        subheads = [...(table.tHead.rows[1]?.cells || [])],
        leaves = [heads[0], ...subheads],
        rows = [...table.tBodies[0].rows],
        buttons = [...section.querySelectorAll("[data-karnameh-stage]")],
        moduleButtons = [
          ...section.querySelectorAll(
            "[data-karnameh-unit-module]:not([data-karnameh-stage])",
          ),
        ],
        controlRows = [...section.querySelectorAll(".karnameh-unit-stage-row")],
        buttonBoxes = [...moduleButtons, ...buttons].map((button) =>
          button.getBoundingClientRect(),
        ),
        count = Number(table.dataset.karnamehUnitCount),
        start = Math.max(0, Number(table.dataset.karnamehUnitStart || 1) - 1),
        end = Number(table.dataset.karnamehUnitEnd || count),
        values = [...table.querySelectorAll(".karnameh-sheet-value")],
        oldModular = report.querySelector(".karnameh-modular-table"),
        unitStyle = signature(table),
        modularStyle = oldModular && signature(oldModular),
        slots = heads.slice(1).map((head, offset) => ({
          position: start + offset,
          moduleIndex: Number(head.dataset.karnamehModulePosition),
          unitIndex: Number(head.dataset.karnamehUnitIndex),
          key: head.dataset.karnamehGroup,
        }));
      const noHorizontalOverflow = scroll.scrollWidth <= scroll.clientWidth + 1;
      let horizontalAccess = noHorizontalOverflow;
      if (!noHorizontalOverflow) {
        const initial = scroll.scrollLeft;
        scroll.scrollLeft = -scroll.scrollWidth;
        const negative = Math.abs(scroll.scrollLeft);
        scroll.scrollLeft = scroll.scrollWidth;
        const positive = Math.abs(scroll.scrollLeft);
        scroll.scrollLeft = initial;
        const frame = scroll.getBoundingClientRect(),
          container = section.getBoundingClientRect();
        horizontalAccess =
          ["auto", "scroll"].includes(getComputedStyle(scroll).overflowX) &&
          scroll.tabIndex >= 0 &&
          scroll.getAttribute("role") === "region" &&
          !!scroll.getAttribute("aria-label")?.trim() &&
          Math.max(negative, positive) >=
            scroll.scrollWidth - scroll.clientWidth - 1 &&
          frame.left >= container.left - 1 &&
          frame.right <= container.right + 1;
      }
      return {
        student: report.dataset.studentId,
        activeGroup: table.dataset.karnamehActiveGroup,
        kind: section.dataset.karnamehGroupSet,
        slotCount: count,
        rangeStart: start,
        rangeEnd: end,
        moduleStart: Number(table.dataset.karnamehModuleStart),
        moduleEnd: Number(table.dataset.karnamehModuleEnd),
        rangeTitle: section.querySelector("h4")?.textContent.trim(),
        slots,
        groupedColumns:
          table.tHead.rows.length === 2 &&
          heads.length === count + 1 &&
          heads[0].rowSpan === 2 &&
          heads[0].textContent.trim() === "درس" &&
          heads
            .slice(1)
            .every(
              (head, position) =>
                head.colSpan === 3 &&
                Number(head.dataset.karnamehUnitPosition) ===
                  start + position &&
                head.dataset.karnamehGroup ===
                  "unit-" +
                    slots[position].moduleIndex +
                    "-" +
                    slots[position].unitIndex &&
                head.textContent
                  .trim()
                  .replace(/[۰-۹]/g, (digit) =>
                    String(digit.charCodeAt(0) - 1776),
                  ) ===
                  "پودمان " +
                    (slots[position].moduleIndex + 1) +
                    " · واحد کار " +
                    (slots[position].unitIndex + 1),
            ) &&
          subheads.length === count * 3 &&
          subheads.every(
            (head, index) =>
              head.textContent.trim() ===
              ["مستمر", "شایستگی", "نتیجه"][index % 3],
          ) &&
          rows.every(
            (row) =>
              [...row.cells].reduce((sum, cell) => sum + cell.colSpan, 0) ===
              1 + count * 3,
          ),
        headerVisible:
          getComputedStyle(table.tHead).display !== "none" &&
          shown(heads[0]) &&
          heads.slice(1).filter(shown).length === (compact ? 1 : count) &&
          subheads.filter(shown).length === (compact ? 3 : count * 3),
        bodyVisible:
          rows.length > 0 &&
          rows.every(
            (row) =>
              shown(row) &&
              [...row.cells]
                .filter(shown)
                .reduce((sum, cell) => sum + cell.colSpan, 0) ===
                (compact ? 4 : 1 + count * 3),
          ),
        aligned: rows.every((row) => {
          let start = 0;
          return [...row.cells].every((cell) => {
            const box = cell.getBoundingClientRect(),
              span = leaves
                .slice(start, start + cell.colSpan)
                .filter(shown)
                .map((head) => head.getBoundingClientRect());
            start += cell.colSpan;
            if (!shown(cell)) return span.length === 0;
            return (
              span.length === cell.colSpan &&
              Math.abs(box.left - Math.min(...span.map((head) => head.left))) <=
                1 &&
              Math.abs(
                box.right - Math.max(...span.map((head) => head.right)),
              ) <= 1
            );
          });
        }),
        noHorizontalOverflow,
        horizontalAccess:
          horizontalAccess && section.scrollWidth <= section.clientWidth + 1,
        rows: rows.map((row) => ({
          lesson: row.dataset.karnamehLesson,
          visible: shown(row),
          contexts: [...row.querySelectorAll(".karnameh-unit-context")].map(
            (context) => ({
              key: context.dataset.karnamehGroup,
              visible: shown(context),
              text: context.textContent.trim(),
              noPrint: context.classList.contains("no-print"),
            }),
          ),
          groups: slots.map(({ position, moduleIndex, unitIndex, key }) => {
            const cells = [...row.cells]
              .slice(1)
              .filter((cell) => cell.dataset.karnamehGroup === key);
            const grades = cells.filter((cell) => cell.dataset.karnamehField);
            return {
              position,
              moduleIndex,
              unitIndex,
              key,
              unit: grades[0]?.dataset.karnamehUnit,
              module: grades[0]?.dataset.karnamehModule,
              unavailable: grades.length === 0,
              visible: cells.length > 0 && cells.every(shown),
              text: cells.map((cell) => cell.textContent.trim()).join(" "),
              labels: grades.map((cell) =>
                cell
                  .querySelector(".karnameh-sheet-value")
                  .getAttribute("aria-label"),
              ),
              values: grades.map(value),
              fields: grades.map((cell) => cell.dataset.karnamehField),
              sameIdentity: grades.every(
                (cell) =>
                  cell.dataset.karnamehUnit ===
                    grades[0].dataset.karnamehUnit &&
                  cell.dataset.karnamehModule ===
                    grades[0].dataset.karnamehModule &&
                  Number(cell.dataset.karnamehUnitPosition) === position &&
                  Number(cell.dataset.karnamehModulePosition) === moduleIndex &&
                  Number(cell.dataset.karnamehUnitIndex) === unitIndex,
              ),
              hasGradeAttributes: cells.some(
                (cell) =>
                  cell.hasAttribute("data-grade-complete") ||
                  cell.hasAttribute("data-karnameh-field") ||
                  cell.hasAttribute("data-karnameh-unit") ||
                  cell.hasAttribute("data-karnameh-module"),
              ),
            };
          }),
        })),
        buttons: buttons.map((button) => ({
          stage: button.dataset.karnamehStage,
          pressed: button.getAttribute("aria-pressed") === "true",
          visible: shown(button),
          text: button.textContent.trim(),
          label: button.getAttribute("aria-label"),
          title: button.getAttribute("title"),
          moduleIndex: Number(button.dataset.karnamehUnitModule),
          unitIndex: Number(button.dataset.karnamehUnitIndex),
        })),
        moduleButtons: moduleButtons.map((button) => ({
          moduleIndex: Number(button.dataset.karnamehUnitModule),
          pressed: button.getAttribute("aria-pressed") === "true",
          visible: shown(button),
          text: button.textContent.trim(),
          label: button.getAttribute("aria-label"),
          title: button.getAttribute("title"),
        })),
        controlRowLabels: controlRows.map((row) =>
          row.querySelector(".karnameh-unit-stage-label")?.textContent.trim(),
        ),
        numberedButtonsFit:
          !compact ||
          (controlRows.length === 2 &&
            controlRows.every((row) => {
              const options = row.querySelector(".karnameh-stage-options"),
                optionsBox = options?.getBoundingClientRect(),
                visibleButtons = [...row.querySelectorAll("button")].filter(
                  shown,
                ),
                boxes = visibleButtons.map((button) =>
                  button.getBoundingClientRect(),
                );
              return (
                !!options &&
                visibleButtons.length > 0 &&
                options.scrollWidth <= options.clientWidth + 1 &&
                Math.max(...boxes.map((box) => box.width)) -
                  Math.min(...boxes.map((box) => box.width)) <=
                  1 &&
                visibleButtons.every((button, index) => {
                  const box = boxes[index];
                  return (
                    button.scrollWidth <= button.clientWidth + 1 &&
                    box.left >= optionsBox.left - 1 &&
                    box.right <= optionsBox.right + 1 &&
                    Math.abs(box.top - boxes[0].top) <= 1 &&
                    Math.abs(box.height - boxes[0].height) <= 1
                  );
                })
              );
            })),
        noPerLessonPickers: !report.querySelector(
          "[data-karnameh-module-picker]",
        ),
        noHiddenAttributes: rows.every((row) => !row.hidden),
        scoreWeightStatesCorrect:
          !matchMedia("screen").matches ||
          values.every(
            (span) =>
              getComputedStyle(span).fontWeight ===
              (span.dataset.gradeTone === "pending" ? "400" : "600"),
          ),
        gradeNumbersReadable: values.filter(shown).every((span) => {
          const range = document.createRange();
          range.selectNodeContents(span);
          const fragments = [...range.getClientRects()],
            cell = span.closest("td").getBoundingClientRect();
          return (
            fragments.length === 1 &&
            fragments[0].left >= cell.left - 1 &&
            fragments[0].right <= cell.right + 1
          );
        }),
        modularPatternMatch:
          !compact ||
          (!!modularStyle &&
            Math.abs(unitStyle.lessonRatio - modularStyle.lessonRatio) < 0.02 &&
            ["lesson", "group", "subhead", "score", "button"].every(
              (part) =>
                JSON.stringify(unitStyle[part]) ===
                JSON.stringify(modularStyle[part]),
            )),
        noAggregate:
          !table.querySelector(
            '[data-karnameh-field="annual"],[data-karnameh-field="module-result"],[data-course-final],[data-pod-final]',
          ) && !/میانگین|نهایی درس/.test(report.textContent),
        geometry: {
          height: table.getBoundingClientRect().height,
          table: table.getBoundingClientRect().width,
          scroll: scroll.clientWidth,
          content: scroll.scrollWidth,
          heads: heads.map((head) =>
            Math.round(head.getBoundingClientRect().width),
          ),
          unitStyle,
          modularStyle,
          scoreWeights: values.map((span) => ({
            tone: span.dataset.gradeTone,
            weight: getComputedStyle(span).fontWeight,
          })),
          buttons: buttonBoxes.map((box) => ({
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          })),
          options: controlRows.map((row) => {
            const options = row.querySelector(".karnameh-stage-options");
            return { width: options.clientWidth, content: options.scrollWidth };
          }),
        },
      };
    }),
    noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    noPrintControls: !scope.querySelector(
      "button,select,.karnameh-stage-switcher,.karnameh-student-pagination",
    ),
  };
}

async function chooseUnit({ position, studentId, scopeSelector }) {
  const scope = document.querySelector(scopeSelector || "#karnamehTabOutput"),
    report = scope.querySelector(
      '.karnameh-student-sheet[data-student-id="' + studentId + '"]',
    ),
    table = report.querySelector(".karnameh-unit-competency-table"),
    section = table.closest(".karnameh-subject-section"),
    head = table.querySelector(
      'thead [data-karnameh-unit-position="' + position + '"]',
    ),
    key = head?.dataset.karnamehGroup,
    moduleIndex = head?.dataset.karnamehModulePosition,
    button = section.querySelector('[data-karnameh-stage="' + key + '"]');
  if (!button) throw Error("Missing shared work-unit stage button");
  const before = [...table.tBodies[0].rows].map((row) => row.textContent);
  const moduleButton = section.querySelector(
    '[data-karnameh-unit-module="' +
      moduleIndex +
      '"]:not([data-karnameh-stage])',
  );
  if (moduleButton.getAttribute("aria-pressed") !== "true") {
    moduleButton.click();
    for (let attempt = 0; attempt < 150; attempt++) {
      if (
        moduleButton.getAttribute("aria-pressed") === "true" &&
        !button.hidden
      )
        break;
      if (attempt === 149)
        throw Error("Module navigation did not expose its work-unit buttons");
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
  button.focus({ preventScroll: true });
  button.click();
  for (let attempt = 0; attempt < 150; attempt++) {
    const active = [...table.querySelectorAll("[data-karnameh-group-active]")];
    if (
      button.getAttribute("aria-pressed") === "true" &&
      table.dataset.karnamehActiveGroup === key &&
      active.length &&
      active.every((cell) => cell.dataset.karnamehGroup === key)
    )
      return {
        sameReport: report.isConnected && table.isConnected,
        focusPreserved:
          !button.getBoundingClientRect().height ||
          document.activeElement === button,
        sameValues:
          JSON.stringify(before) ===
          JSON.stringify(
            [...table.tBodies[0].rows].map((row) => row.textContent),
          ),
      };
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw Error("Unit stage button did not settle to ordinal " + position);
}

async function chooseModule({ moduleIndex, studentId, scopeSelector }) {
  const scope = document.querySelector(scopeSelector || "#karnamehTabOutput"),
    report = scope.querySelector(
      '.karnameh-student-sheet[data-student-id="' + studentId + '"]',
    ),
    table = report.querySelector(".karnameh-unit-competency-table"),
    button = table
      .closest(".karnameh-subject-section")
      .querySelector(
        '[data-karnameh-unit-module="' +
          moduleIndex +
          '"]:not([data-karnameh-stage])',
      );
  button.focus({ preventScroll: true });
  button.click();
  for (let attempt = 0; attempt < 150; attempt++) {
    if (button.getAttribute("aria-pressed") === "true")
      return table.dataset.karnamehActiveGroup;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw Error("Module hierarchy button did not settle");
}

async function oldModuleState({ position } = {}) {
  const report = document.querySelector(
      "#karnamehTabOutput .karnameh-student-sheet",
    ),
    table = report.querySelector(".karnameh-modular-table"),
    unitTable = report.querySelector(".karnameh-unit-competency-table"),
    unitBefore = unitTable.dataset.karnamehActiveGroup,
    gradesBefore = unitTable.textContent;
  if (position != null) {
    const button = table
      .closest(".karnameh-subject-section")
      .querySelector('[data-karnameh-stage="module-' + position + '"]');
    button.click();
    for (let attempt = 0; attempt < 150; attempt++) {
      if (
        table.dataset.karnamehActiveGroup === "module-" + position &&
        button.getAttribute("aria-pressed") === "true"
      )
        break;
      if (attempt === 149) throw Error("Old modular navigation did not settle");
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
  return {
    active: table.dataset.karnamehActiveGroup,
    unitUnchanged:
      unitBefore === unitTable.dataset.karnamehActiveGroup &&
      gradesBefore === unitTable.textContent,
    values: [...table.querySelectorAll("tbody td[data-karnameh-field]")]
      .filter((cell) => getComputedStyle(cell).display !== "none")
      .map((cell) => {
        const text = cell
          .querySelector(".karnameh-sheet-value")
          .textContent.trim()
          .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
        return text === "—" || text === "جبران" ? null : Number(text);
      }),
  };
}

async function run({ cdp, evaluate, cases, delay }) {
  const page = (fn, arg) =>
    evaluate("(" + fn.toString() + ")(" + JSON.stringify(arg ?? {}) + ")");
  const check = (id, pass, observed) =>
    cases.push({ id: "UNIT_KARNAMEH_" + id, name: id, pass: !!pass, observed });
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const original = await evaluate("EduV24.snapshotInstallation()");
  try {
    await evaluate("(" + seedReminders.toString() + ")()");
    const fixture = await page(seedUnitKarnameh);
    const unitSlots = (lesson) =>
      lesson.modules.flatMap((module) =>
        module.units.map((unit) => ({
          ...unit,
          moduleId: module.id,
          moduleName: module.name,
        })),
      );
    const moduleCount = Math.max(
      ...fixture.lessons.map((lesson) => lesson.modules.length),
    );
    const slots = Array.from({ length: moduleCount }, (_, moduleIndex) => {
      const unitCount = Math.max(
        ...fixture.lessons.map(
          (lesson) => lesson.modules[moduleIndex]?.units.length || 0,
        ),
      );
      return Array.from({ length: unitCount }, (_, unitIndex) => ({
        moduleIndex,
        unitIndex,
        key: "unit-" + moduleIndex + "-" + unitIndex,
      }));
    }).flat();
    const maxSlots = slots.length;
    const printRanges = [];
    let printStart = 0;
    for (let end = 1; end <= maxSlots; end++) {
      const atModuleEnd =
          end === maxSlots ||
          slots[end - 1].moduleIndex !== slots[end].moduleIndex,
        nextModuleCount =
          atModuleEnd && end < maxSlots
            ? slots.filter(
                (slot) => slot.moduleIndex === slots[end].moduleIndex,
              ).length
            : 0;
      if (
        atModuleEnd &&
        (end === maxSlots || end - printStart + nextModuleCount > 5)
      ) {
        printRanges.push([printStart, end]);
        printStart = end;
      }
    }
    const actualUnits = fixture.lessons.reduce(
      (sum, lesson) => sum + unitSlots(lesson).length,
      0,
    );
    const waitForReport = async (student) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (
          await page((studentId) => {
            const report = document.querySelector(
              '#karnamehTabOutput .karnameh-student-sheet[data-student-id="' +
                studentId +
                '"]',
            );
            return (
              report?.dataset.karnamehCompactReady === "true" &&
              report.querySelectorAll(".karnameh-unit-competency-table")
                .length === 1
            );
          }, student)
        )
          return;
        await delay(30);
      }
      throw Error("Individual shared unit-based karnameh did not render");
    };
    await waitForReport(fixture.students[0]);
    const recordsBefore = await evaluate(
      "EduV24.snapshotInstallation().then(backup => JSON.stringify(backup.stores.records.filter(row => row.logical === 'class:reminder-class')))",
    );
    const matchesGrades = (observed) => {
      const students = new Map();
      for (const table of observed.tables) {
        if (
          !fixture.students.includes(table.student) ||
          table.rows.length !== fixture.lessons.length ||
          !equal(
            table.rows.map((row) => row.lesson),
            fixture.lessons.map((lesson) => lesson.id),
          ) ||
          table.rangeEnd - table.rangeStart !== table.slotCount ||
          (observed.printed &&
            (table.slotCount > 5 ||
              table.moduleStart !== slots[table.rangeStart].moduleIndex + 1 ||
              table.moduleEnd !== slots[table.rangeEnd - 1].moduleIndex + 1 ||
              !equal(
                table.rangeTitle
                  ?.replace(/[۰-۹]/g, (digit) =>
                    String(digit.charCodeAt(0) - 1776),
                  )
                  .match(/[0-9]+/g)
                  ?.map(Number),
                table.moduleStart === table.moduleEnd
                  ? [table.moduleStart]
                  : [table.moduleStart, table.moduleEnd],
              )))
        )
          return false;
        if (!students.has(table.student))
          students.set(table.student, {
            seen: new Set(),
            ranges: [],
            actualUnits: 0,
            gradeCells: 0,
          });
        const student = students.get(table.student);
        student.ranges.push([table.rangeStart, table.rangeEnd]);
        for (const row of table.rows) {
          const lesson = fixture.lessons.find((item) => item.id === row.lesson);
          if (!lesson || !row.visible || row.groups.length !== table.slotCount)
            return false;
          for (const group of row.groups) {
            const position = group.position;
            if (
              !Number.isInteger(position) ||
              position < table.rangeStart ||
              position >= table.rangeEnd
            )
              return false;
            const key = lesson.id + ":" + position;
            if (student.seen.has(key)) return false;
            student.seen.add(key);
            const pair = slots[position],
              module = lesson.modules[pair.moduleIndex],
              unit = module?.units[pair.unitIndex];
            if (
              group.moduleIndex !== pair.moduleIndex ||
              group.unitIndex !== pair.unitIndex ||
              group.key !== pair.key
            )
              return false;
            if (!unit) {
              if (
                !group.unavailable ||
                group.unit ||
                group.hasGradeAttributes ||
                group.values.length ||
                !group.text.includes("ندارد")
              )
                return false;
              continue;
            }
            if (
              group.unavailable ||
              !group.sameIdentity ||
              group.unit !== unit.id ||
              group.module !== module.id ||
              group.labels.length !== 3 ||
              !group.labels.every(
                (label) =>
                  label?.includes(unit.name) && label.includes(module.name),
              ) ||
              !equal(group.fields, [
                "continuous",
                "competency",
                "unit-result",
              ]) ||
              !equal(
                group.values,
                fixture.expected[lesson.id]?.[unit.id]?.[table.student],
              )
            )
              return false;
            student.actualUnits++;
            student.gradeCells += group.values.length;
          }
        }
      }
      const ranges = observed.printed ? printRanges : [[0, maxSlots]];
      return (
        students.size > 0 &&
        [...students.values()].every(
          (student) =>
            student.seen.size === fixture.lessons.length * maxSlots &&
            student.actualUnits === actualUnits &&
            student.gradeCells === actualUnits * 3 &&
            equal(
              student.ranges.sort((a, b) => a[0] - b[0]),
              ranges,
            ),
        )
      );
    };
    const matchesSelection = (observed, selected) =>
      observed.tables.every((table) => {
        const position =
          typeof selected === "number"
            ? selected
            : (selected[table.student] ?? 0);
        const pair = slots[position],
          fa = (number) =>
            String(number).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
        return (
          table.kind === "unit" &&
          table.slotCount === maxSlots &&
          table.activeGroup === pair.key &&
          equal(
            table.rows.map((row) => row.lesson),
            fixture.lessons.map((lesson) => lesson.id),
          ) &&
          table.rows.every((row) => {
            const lesson = fixture.lessons.find(
                (item) => item.id === row.lesson,
              ),
              module = lesson.modules[pair.moduleIndex],
              unit = module?.units[pair.unitIndex],
              visibleContexts = row.contexts.filter(
                (context) => context.visible,
              );
            return (
              row.groups.every(
                (group) =>
                  group.visible ===
                  (!observed.compact || group.position === position),
              ) &&
              (observed.compact && unit
                ? visibleContexts.length === 1 &&
                  visibleContexts[0].key === pair.key &&
                  visibleContexts[0].noPrint &&
                  visibleContexts[0].text.includes(module.name) &&
                  visibleContexts[0].text.includes(unit.name)
                : visibleContexts.every(
                    (context) => observed.compact && context.key === pair.key,
                  ))
            );
          }) &&
          equal(
            table.buttons.map((button) => button.stage),
            slots.map((slot) => slot.key),
          ) &&
          table.buttons.every((button, index) => {
            const slot = slots[index],
              ordinal = fa(slot.unitIndex + 1);
            return (
              button.moduleIndex === slot.moduleIndex &&
              button.unitIndex === slot.unitIndex &&
              button.visible ===
                (observed.compact && slot.moduleIndex === pair.moduleIndex) &&
              button.text === ordinal &&
              button.label ===
                "پودمان " +
                  fa(slot.moduleIndex + 1) +
                  " · واحد کار " +
                  ordinal &&
              button.title === button.label
            );
          }) &&
          table.moduleButtons.length === moduleCount &&
          table.moduleButtons.every(
            (button, index) =>
              button.moduleIndex === index &&
              button.visible === observed.compact &&
              button.text === fa(index + 1) &&
              button.label === "پودمان " + fa(index + 1) &&
              button.title === "پودمان " + fa(index + 1) &&
              button.pressed === (index === pair.moduleIndex),
          ) &&
          equal(table.controlRowLabels, ["پودمان", "واحد کار"]) &&
          table.buttons.filter((button) => button.pressed).length === 1 &&
          table.buttons.find((button) => button.pressed)?.stage === pair.key
        );
      });
    const change = async (position, options = {}) => {
      const observed = await page(chooseUnit, {
        position,
        studentId: options.student || fixture.students[0],
        scopeSelector: options.scopeSelector,
      });
      check(
        "CHANGE_" + options.label + "_" + position,
        Object.values(observed).every(Boolean),
        observed,
      );
    };
    const fits = (observed) =>
      observed.noPageOverflow &&
      observed.tables.every(
        (table) =>
          table.groupedColumns &&
          table.headerVisible &&
          table.bodyVisible &&
          table.aligned &&
          table.horizontalAccess &&
          table.numberedButtonsFit &&
          table.noPerLessonPickers &&
          table.modularPatternMatch &&
          table.scoreWeightStatesCorrect &&
          table.noAggregate &&
          table.noHiddenAttributes,
      );
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 700,
      });
      await delay(80);
      for (let position = 0; position < maxSlots; position++) {
        await change(position, { label: width });
        const observed = await page(measureTable);
        check(
          "SHARED_TABLE_" + width + "_UNIT_" + position,
          observed.tables.length === 1 &&
            fits(observed) &&
            matchesSelection(observed, position) &&
            matchesGrades(observed),
          observed,
        );
        if (position === 1 || position === 2) {
          const peer = observed.tables[0]?.rows.find(
              (row) => row.lesson === fixture.lessons[1].id,
            ),
            group = peer?.groups.find((item) => item.position === position),
            nextUnit = fixture.lessons[1].modules[1].units[0];
          check(
            "IRREGULAR_MODULE_BOUNDARY_" + width + "_" + position,
            position === 1
              ? group?.unavailable &&
                  !group.hasGradeAttributes &&
                  group.text.includes("ندارد")
              : !group?.unavailable &&
                  group.unit === nextUnit.id &&
                  equal(
                    group.values,
                    fixture.expected[fixture.lessons[1].id][nextUnit.id][
                      fixture.students[0]
                    ],
                  ),
            group,
          );
        }
      }
      if (width <= 1024) {
        await page(oldModuleState, { position: 0 });
        const oldChanged = await page(oldModuleState, { position: 1 });
        check(
          "OLD_MODULE_DOES_NOT_CHANGE_UNIT_" + width,
          oldChanged.unitUnchanged &&
            oldChanged.active === "module-1" &&
            equal(
              oldChanged.values,
              fixture.modularGrades[fixture.students[0]][1],
            ) &&
            matchesSelection(await page(measureTable), maxSlots - 1),
          oldChanged,
        );
        await change(2, { label: "OLD_MODULE_ISOLATION_" + width });
        const afterUnit = await page(oldModuleState);
        check(
          "UNIT_DOES_NOT_CHANGE_OLD_MODULE_" + width,
          afterUnit.active === "module-1" &&
            equal(
              afterUnit.values,
              fixture.modularGrades[fixture.students[0]][1],
            ) &&
            matchesGrades(await page(measureTable)),
          afterUnit,
        );
      }
      if (width === 390) {
        await evaluate(
          "document.querySelector('.karnameh-unit-competency-table').closest('.karnameh-subject-section').scrollIntoView({block:'start'})",
        );
        await delay(80);
        const shot = await cdp("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
        const directory = path.join(__dirname, "../.cache/modular-unit");
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(
          path.join(directory, "karnameh-390.png"),
          Buffer.from(shot.data, "base64"),
        );
      }
    }
    // A real mouse click exercises delegated stage navigation.
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(80);
    await change(0, { label: "POINTER_PREPARATION" });
    await page(() => {
      const button = document
        .querySelector("#karnamehTabOutput .karnameh-unit-competency-table")
        .closest(".karnameh-subject-section")
        .querySelector('[data-karnameh-stage="unit-0-1"]');
      button.scrollIntoView({ block: "center", inline: "center" });
    });
    const point = await page(() => {
      const box = document
        .querySelector('#karnamehTabOutput [data-karnameh-stage="unit-0-1"]')
        .getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await cdp("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await delay(180);
    let observed = await page(measureTable);
    check(
      "POINTER_STAGE_SELECTION",
      matchesSelection(observed, 1) && matchesGrades(observed),
      observed,
    );
    const retainedPair = await page(chooseModule, {
      moduleIndex: 1,
      studentId: fixture.students[0],
    });
    observed = await page(measureTable);
    check(
      "MODULE_CHANGE_RETAINS_WITHIN_MODULE_UNIT",
      retainedPair === "unit-1-1" &&
        matchesSelection(observed, 3) &&
        matchesGrades(observed),
      observed,
    );
    // Space activates an actual focused button, without a synthetic click.
    await page(() =>
      document
        .querySelector('#karnamehTabOutput [data-karnameh-stage="unit-1-0"]')
        .focus({ preventScroll: true }),
    );
    for (const type of ["keyDown", "keyUp"])
      await cdp("Input.dispatchKeyEvent", {
        type,
        key: " ",
        code: "Space",
        windowsVirtualKeyCode: 32,
      });
    await delay(180);
    observed = await page(measureTable);
    check(
      "KEYBOARD_STAGE_SELECTION",
      matchesSelection(observed, 2) && matchesGrades(observed),
      observed,
    );
    // The module/unit pair persists across pupils; each pupil keeps their own grades.
    for (const student of [fixture.students[1], fixture.students[0]]) {
      await page((studentId) => {
        const select = document.getElementById("karnamehStudent");
        select.value = studentId;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, student);
      await waitForReport(student);
      observed = await page(measureTable);
      check(
        "STUDENT_SWITCH_" + student,
        observed.tables.length === 1 &&
          observed.tables[0].student === student &&
          matchesSelection(observed, 2) &&
          matchesGrades(observed),
        observed,
      );
    }
    await change(maxSlots - 1, { label: "PRINT_SELECTION" });
    const printAndMeasure = async (embedded = false) => {
      const viewport = await page(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      await page(async (isEmbedded) => {
        globalThis.__EDU_PRINT_TEST__ = true;
        document
          .querySelector(
            isEmbedded
              ? "[data-periodic-print]"
              : '#karnamehTabOutput .karnameh-student-sheet [data-workspace-action="print"]',
          )
          .click();
        for (let attempt = 0; attempt < 150; attempt++) {
          if (
            document.querySelector("#printRoot .karnameh-unit-competency-table")
          ) {
            window.dispatchEvent(new Event("beforeprint"));
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        throw Error(
          "Authorized shared unit karnameh print root was not created",
        );
      }, embedded);
      await cdp("Emulation.setEmulatedMedia", { media: "print" });
      await cdp("Emulation.setDeviceMetricsOverride", {
        width: 1123,
        height: 794,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const printed = await page(measureTable, { scopeSelector: "#printRoot" });
      check(
        embedded ? "EMBEDDED_PRINT_ALL_UNITS" : "PRINT_PREVIEW_ALL_UNITS",
        printed.tables.length === printRanges.length * (embedded ? 2 : 1) &&
          printed.noPrintControls &&
          matchesGrades(printed) &&
          printed.tables.every(
            (table) =>
              table.groupedColumns &&
              table.slotCount <= 5 &&
              table.headerVisible &&
              table.bodyVisible &&
              table.aligned &&
              table.noHorizontalOverflow &&
              table.gradeNumbersReadable &&
              table.noAggregate &&
              table.rows.every(
                (row) =>
                  row.visible && row.groups.every((group) => group.visible),
              ),
          ),
        printed,
      );
      await page(() =>
        document
          .querySelector("#printRoot .karnameh-unit-competency-table")
          .scrollIntoView({ block: "center" }),
      );
      const shot = await cdp("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      const directory = path.join(__dirname, "../.cache/modular-unit");
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(
          directory,
          embedded
            ? "karnameh-unit-print-embedded.png"
            : "karnameh-unit-print.png",
        ),
        Buffer.from(shot.data, "base64"),
      );
      const pdf = await cdp("Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: true,
      });
      fs.writeFileSync(
        path.join(
          directory,
          embedded
            ? "karnameh-unit-print-embedded.pdf"
            : "karnameh-unit-print.pdf",
        ),
        Buffer.from(pdf.data, "base64"),
      );
      check(
        embedded ? "EMBEDDED_PRINT_PDF" : "PRINT_PDF",
        typeof pdf.data === "string" && pdf.data.length > 1000,
        { bytes: Buffer.from(pdf.data, "base64").length },
      );
      await cdp("Emulation.setEmulatedMedia", { media: "screen" });
      await cdp("Emulation.setDeviceMetricsOverride", {
        ...viewport,
        deviceScaleFactor: 1,
        mobile: viewport.width < 700,
      });
      await page(() => {
        window.dispatchEvent(new Event("afterprint"));
        document.getElementById("printRoot")?.remove();
        document.getElementById("printPageStyle")?.remove();
      });
    };
    await printAndMeasure();
    observed = await page(measureTable);
    check(
      "PRINT_PRESERVES_SCREEN_SELECTION",
      matchesSelection(observed, maxSlots - 1) && matchesGrades(observed),
      observed,
    );
    await page(async () => {
      goReports();
      EduPeriodicReports.selectScope("reminder-school", "reminder-class");
      setReportTab("annual");
      EduPeriodicReports.set("audience", "management");
      const model = await EduPeriodicReports.generate();
      if (!model)
        throw Error(document.getElementById("periodicError")?.textContent);
    });
    const embeddedScope = ".periodic-karnameh";
    observed = await page(measureTable, { scopeSelector: embeddedScope });
    check(
      "EMBEDDED_REPORT_DEFAULTS",
      observed.tables.length === 2 &&
        matchesSelection(observed, 0) &&
        matchesGrades(observed),
      observed,
    );
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 700,
      });
      await change(maxSlots - 1, {
        scopeSelector: embeddedScope,
        label: "EMBEDDED_" + width,
      });
      observed = await page(measureTable, { scopeSelector: embeddedScope });
      check(
        "EMBEDDED_INDEPENDENT_STUDENTS_" + width,
        observed.tables.length === 2 &&
          fits(observed) &&
          matchesGrades(observed) &&
          matchesSelection(observed, {
            [fixture.students[0]]: maxSlots - 1,
            [fixture.students[1]]: 0,
          }),
        observed,
      );
    }
    await printAndMeasure(true);
    const recordsAfter = await evaluate(
      "EduV24.snapshotInstallation().then(backup => JSON.stringify(backup.stores.records.filter(row => row.logical === 'class:reminder-class')))",
    );
    check("VIEW_AND_PRINT_DO_NOT_WRITE_GRADES", recordsBefore === recordsAfter);
  } finally {
    await cdp("Emulation.setEmulatedMedia", { media: "screen" });
    await cdp("Emulation.clearDeviceMetricsOverride");
    await page(async (backup) => {
      window.dispatchEvent(new Event("afterprint"));
      document.getElementById("printRoot")?.remove();
      document.getElementById("printPageStyle")?.remove();
      delete globalThis.__EDU_PRINT_TEST__;
      closeModal();
      EduV24.previewFullBackup(backup);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
    }, original);
  }
}
if (require.main === module)
  main({ stage: "modular-unit-karnameh-layout", runExtra: run }).catch(
    (error) => {
      console.error(error);
      process.exitCode = 2;
    },
  );
module.exports = { run };
