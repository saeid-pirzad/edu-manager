"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");

function approvedButtonColors(button) {
  const rgb = (hex) => {
    const value =
      hex.length === 4
        ? [...hex.slice(1)].map((part) => part + part).join("")
        : hex.slice(1);
    return (
      "rgb(" +
      value
        .match(/../g)
        .map((part) => parseInt(part, 16))
        .join(", ") +
      ")"
    );
  };
  const roles = {
    primary: { solid: ["#fff", "#c0141b"], soft: ["#c0141b", "#fef0f0"] },
    neutral: { solid: ["#fff", "#58595b"], soft: ["#2d3440", "#f4f4f5"] },
    excel: { solid: ["#fff", "#19775c"], soft: ["#16664e", "#eaf6f0"] },
    info: { solid: ["#fff", "#1d5fb8"], soft: ["#1d4f91", "#edf4ff"] },
    secondary: { solid: ["#fff", "#7c5105"], soft: ["#7c5105", "#fffaed"] },
    danger: { solid: ["#fff", "#b42335"], soft: ["#9f2635", "#fff0f2"] },
  };
  if (!["solid", "soft"].includes(button.variant)) return false;
  if (button.colorRole === "agenda-schedule")
    return (
      button.tone === "settings" &&
      button.variant === "soft" &&
      button.color === rgb("#7c5105") &&
      button.background === rgb("#fff")
    );
  if (button.colorRole === "grade-clear")
    return (
      button.color === rgb("#5a6179") &&
      button.background === "rgba(0, 0, 0, 0)"
    );
  if (button.colorRole === "attendance-present")
    return button.color === rgb("#16664e") && button.background === rgb("#fff");
  if (button.colorRole === "attendance-absent")
    return button.color === rgb("#9f2635") && button.background === rgb("#fff");
  const family =
    { "backup-primary": "primary", "backup-secondary": "secondary" }[
      button.colorRole
    ] ||
    {
      create: "primary",
      save: "primary",
      download: "neutral",
      print: "neutral",
      navigate: "neutral",
      neutral: "neutral",
      excel: "excel",
      upload: "info",
      share: "info",
      copy: "info",
      edit: "secondary",
      settings: "secondary",
      report: "secondary",
      danger: "danger",
    }[button.tone];
  const expected = roles[family]?.[button.variant];
  return (
    !!expected &&
    button.color === rgb(expected[0]) &&
    button.background === rgb(expected[1])
  );
}

// Screen-reader labels are retained in the DOM but their clipped ink is not
// part of the visually centered button group. Never ignore ordinary text.
function isClippedAccessibleLabel(style, box) {
  return (
    ["absolute", "fixed"].includes(style.position) &&
    box.width <= 1 &&
    box.height <= 1 &&
    (["hidden", "clip"].includes(style.overflow) ||
      style.clipPath === "inset(50%)" ||
      String(style.clip || "").replace(/\s/g, "") === "rect(0px,0px,0px,0px)")
  );
}

async function setup() {
  const original = await EduV24.snapshotInstallation(),
    year = "1405-1406",
    ids = {
      first: "surface_first",
      second: "surface_second",
      school: "surface_school",
      a: "surface_a",
      b: "surface_b",
    },
    restore = async (file) => {
      closeModal();
      EduV24.previewFullBackup(file);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
      await EduV24.test.settle();
    },
    fixture = structuredClone(original);
  globalThis.__buttonSurfaceCleanup = () => restore(original);
  globalThis.__buttonSurfaceIds = ids;
  fixture.activeWorkspace = ids.second;
  fixture.gradeDrafts = [];
  fixture.reportDrafts = {};
  fixture.snapshotNotes = [];
  for (const name of Object.keys(fixture.stores)) fixture.stores[name] = [];
  for (const [id, term, kind] of [
    [ids.first, "اول", "first"],
    [ids.second, "دوم", "second"],
  ]) {
    const classes = [ids.a, ids.b].map((classId, index) => ({
        id: classId,
        name: index ? "دوازدهم گرافیک آزمایشی" : "یازدهم شبکه آزمایشی",
        students: [1, 2, 3].map((number) => ({
          id: classId + "_student_" + number,
          name: [
            "محمدرضا هنرجوی مصنوعی",
            "سیدمحمدحسین دانش‌آموز نمونه",
            "علی هنرجوی آزمایشی",
          ][number - 1],
          code: String(number),
        })),
        archivedStudents: [],
        lessons: [
          {
            id: classId + "_lesson",
            name: index ? "طراحی گرافیک و تصویرسازی" : "نصب و راه‌اندازی شبکه",
            teacher: "دبیر مصنوعی آزمون",
            gradeMode: "kardanesh",
            poudmans: [],
            gradingPolicy: {
              ...EduPolicy.defaults("dual", year),
              code: "SURFACE-" + index,
              confirmed: true,
            },
            kardaneshScores: Object.fromEntries(
              [1, 2, 3].map((number) => [
                classId + "_student_" + number,
                {
                  practical: 18,
                  theory: 14,
                  midtermPractical: 16,
                  midtermTheory: 13,
                },
              ]),
            ),
          },
          {
            id: classId + "_modular",
            name: "\u062f\u0631\u0633 \u067e\u0648\u062f\u0645\u0627\u0646\u06cc \u0622\u0632\u0645\u0627\u06cc\u0634\u06cc",
            teacher:
              "\u062f\u0628\u06cc\u0631 \u0645\u0635\u0646\u0648\u0639\u06cc",
            gradeMode: "standard",
            gradingPolicy: {
              ...EduPolicy.defaults("modular", year),
              code: "SURFACE-M-" + index,
              confirmed: true,
            },
            kardaneshScores: {},
            poudmans: [
              {
                id: classId + "_pod",
                name: "\u067e\u0648\u062f\u0645\u0627\u0646 \u0627\u0648\u0644",
                podScores: Object.fromEntries(
                  [1, 2, 3].map((number) => [
                    classId + "_student_" + number,
                    { m: 3, c: 2 },
                  ]),
                ),
                units: [
                  {
                    id: classId + "_unit",
                    name: "\u0648\u0627\u062d\u062f \u0627\u0648\u0644",
                    unitScores: {},
                  },
                ],
              },
            ],
          },
        ],
      })),
      data = EduV24.normalizeDB({
        ...defaultDB(),
        settings: {
          ...db.settings,
          academicYear: year,
          academicTerm: term,
          password: "",
        },
        schools: [
          { id: ids.school, name: "هنرستان مصنوعی بررسی گزارش", classes },
        ],
        masterSchedule: {},
        migrationWarnings: [],
        sessions: classes.map((classroom, index) => ({
          id: id + "_session_" + index,
          schoolId: ids.school,
          classId: classroom.id,
          lessonId: classroom.lessons[0].id,
          date: id === ids.first ? "2026-11-01" : "2026-11-02",
          period: index,
          poudmanId: null,
          unitId: null,
          roster: structuredClone(classroom.students),
          attendance: Object.fromEntries(
            classroom.students.map((student, offset) => [
              student.id,
              ["present", "absent", "leave"][offset],
            ]),
          ),
          scores: [
            {
              studentId: classroom.students[0].id,
              type: "classGrade",
              value: 17,
              note: "انجام تمرین عملی و تکمیل فعالیت کلاس",
            },
            {
              studentId: classroom.students[1].id,
              type: "homework",
              value: 1,
              note: "تمرین جلسه برای پیگیری",
            },
          ],
        })),
      }),
      { schools, sessions, ...meta } = data;
    meta.layout = schools.map((school) => ({
      id: school.id,
      name: school.name,
      classes: school.classes.map((classroom) => classroom.id),
    }));
    fixture.stores.catalog.push({
      id,
      year,
      term,
      termKind: kind,
      closed: false,
      revision: 1,
      createdAt: "2026-11-02T00:00:00Z",
      updatedAt: "2026-11-02T00:00:00Z",
    });
    for (const [logical, value] of [
      ["meta", meta],
      ...schools[0].classes.map((classroom) => [
        "class:" + classroom.id,
        classroom,
      ]),
      ...sessions.map((session) => ["session:" + session.id, session]),
    ])
      fixture.stores.records.push({
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      });
  }
  await restore(fixture);
}

async function show(view) {
  closeModal();
  const ids = globalThis.__buttonSurfaceIds;
  goSchool(ids.school);
  goClass(ids.a);
  const classroom = getClassObj(ids.school, ids.a);
  if (view === "schools") {
    goSchools();
    document.querySelector(".entity-quick-create").open = true;
  } else if (view === "school") {
    goSchool(ids.school);
    document.querySelector(".entity-quick-create").open = true;
  } else if (view === "class") {
    document.querySelector(".lesson-create").open = true;
  } else if (view === "students") {
    setTab("students");
    document.querySelector(".student-add").open = true;
    document.querySelector(".student-import").open = true;
  } else if (view === "lesson" || view === "grades" || view === "modular") {
    goLesson(classroom.lessons[view === "modular" ? 1 : 0].id);
    document.querySelector(".session-create")?.setAttribute("open", "");
    if (view === "grades" || view === "modular") {
      setTab("grades");
      for (
        let attempt = 0;
        attempt < 100 &&
        !document.querySelector("#lessonGradesArea [data-grade]");
        attempt++
      )
        await new Promise((resolve) => setTimeout(resolve, 10));
      for (const stage of document.querySelectorAll(".assessment-stage"))
        stage.open = true;
    }
  } else if (view === "session" || view === "activity") {
    openSessionModal(db.sessions.find((row) => row.classId === ids.a));
    showSessionPanel(view === "activity" ? "activity" : "attendance");
  } else if (view === "reports") {
    goReports();
    state.reportTab = "daily";
    EduPeriodicReports.selectScope(ids.school);
    Object.assign(EduPeriodicReports.filters, {
      mode: "daily",
      date: "2026-11-02",
      detailLevel: "full",
    });
    render();
    await EduPeriodicReports.generate();
  } else if (view === "schedule") {
    goMaster();
  } else if (view === "backups") {
    await EduV24.openBackups();
  } else if (view === "settings") {
    await openSettingsModal();
  }
  scrollTo(0, 0);
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}
function measure(isClippedAccessibleLabel) {
  const visible = (element) => {
    const box = element.getBoundingClientRect(),
      style = getComputedStyle(element);
    if (
      !box.width ||
      !box.height ||
      style.visibility === "hidden" ||
      style.display === "none" ||
      element.closest("[hidden]")
    )
      return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      if (
        isClippedAccessibleLabel(
          getComputedStyle(parent),
          parent.getBoundingClientRect(),
        )
      )
        return false;
      if (
        parent.tagName === "DETAILS" &&
        !parent.open &&
        !parent.querySelector(":scope > summary")?.contains(element)
      )
        return false;
    }
    return (
      !element.checkVisibility ||
      element.checkVisibility({
        contentVisibilityAuto: true,
        opacityProperty: true,
        visibilityProperty: true,
      })
    );
  };
  const modal = document.getElementById("modal"),
    modalOpen = modal && !modal.classList.contains("hidden");
  const scope = modalOpen ? modal : document;
  const rows = [...scope.querySelectorAll("button")]
    .filter(visible)
    .map((button) => {
      const box = button.getBoundingClientRect(),
        style = getComputedStyle(button);
      const rects = [];
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (
          !node.textContent.trim() ||
          node.parentElement.closest("svg,.ui-button-label") ||
          !visible(node.parentElement)
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        rects.push(...range.getClientRects());
      }
      const icons = [...button.querySelectorAll("svg")].filter(visible);
      // A tab icon occupies its complete flex item, not only the smaller SVG
      // painted inside it. Otherwise the existing 32px/19px icon geometry
      // invents a 3.25px center offset despite a correctly centered group.
      rects.push(
        ...icons.map((icon) => {
          const wrapper = icon.closest(".control-icon,.classroom-tab-icon");
          return (
            wrapper && button.contains(wrapper) ? wrapper : icon
          ).getBoundingClientRect();
        }),
      );
      // Wrapped labels are flex items: their allocated box, not the varying ink
      // width of each Persian line, belongs in the centered content group.
      rects.push(
        ...[...button.querySelectorAll(".ui-button-label")]
          .filter(visible)
          .map((label) => label.getBoundingClientRect()),
      );
      const union = rects.length
        ? {
            left: Math.min(...rects.map((rect) => rect.left)),
            right: Math.max(...rects.map((rect) => rect.right)),
            top: Math.min(...rects.map((rect) => rect.top)),
            bottom: Math.max(...rects.map((rect) => rect.bottom)),
          }
        : null;
      const dx = union
        ? (union.left + union.right - box.left - box.right) / 2
        : null;
      const dy = union
        ? (union.top + union.bottom - box.top - box.bottom) / 2
        : null;
      return {
        label: (button.getAttribute("aria-label") || button.textContent)
          .trim()
          .replace(/\s+/g, " "),
        text: button.textContent.trim().replace(/\s+/g, " "),
        id: button.id,
        classes: button.className,
        action:
          button.dataset.workspaceAction ||
          button.dataset.legacyClick ||
          button.dataset.headerAction ||
          "",
        width: box.width,
        height: box.height,
        dx,
        dy,
        font: style.fontSize,
        color: style.color,
        background: style.backgroundColor,
        display: style.display,
        justify: style.justifyContent,
        align: style.alignItems,
        disabled: button.disabled,
        selected:
          button.getAttribute("aria-pressed") === "true" ||
          button.classList.contains("active"),
        clipped: button.scrollWidth > button.clientWidth + 1,
        coreAction: button.classList.contains("ui-button-flat"),
        compact: button.classList.contains("ui-button-compact"),
        modularCompact: !!button.closest(".module-simple"),
        compactInsideInput:
          !button.matches(".grade-clear") ||
          (() => {
            const input = button
                .closest(".grade-editor")
                ?.querySelector("input"),
              field = input?.getBoundingClientRect();
            return (
              !!field &&
              box.left >= field.left - 1 &&
              box.right <= field.right + 1 &&
              box.top >= field.top - 1 &&
              box.bottom <= field.bottom + 1
            );
          })(),
        tone: button.dataset.uiTone || "",
        variant: button.dataset.uiVariant || "",
        colorRole: button.matches(".grade-clear")
          ? "grade-clear"
          : button.matches(".session-attendance-bulk .success")
            ? "attendance-present"
            : button.matches(".session-attendance-bulk .danger")
              ? "attendance-absent"
              : button.matches(
                    '#app .today-agenda > .today-agenda-heading > button[data-legacy-click="ui-dashboard:3"]',
                  )
                ? "agenda-schedule"
                : button.matches(
                      '#modalBody .backup-hub button:is([data-workspace-action="export-full"],[data-workspace-action="single-file-choose"],[data-workspace-action="choose-import"])',
                    )
                  ? "backup-primary"
                  : button.matches(
                        '#modalBody .backup-hub button:is([data-workspace-action="prepare-share-backup"],[data-workspace-action="single-file-save"])',
                      )
                    ? "backup-secondary"
                    : "action",
        needsIcon: button.matches(
          ".tabs button,.csv-import-actions button,.week-add,.periodic-export-actions button,.session-workspace-footer button,.backup-action-grid button,.backup-automatic button,.modal-header button",
        ),
        icons: icons.map((icon) => ({
          width: icon.getBoundingClientRect().width,
          height: icon.getBoundingClientRect().height,
          color: getComputedStyle(icon).color,
          transform: getComputedStyle(icon).transform,
          viewBox: icon.getAttribute("viewBox"),
        })),
      };
    });
  const dialog = modalOpen
    ? modal.querySelector(".modal-dialog")?.getBoundingClientRect()
    : null;
  return {
    noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    modalFits: !dialog || (dialog.left >= -1 && dialog.right <= innerWidth + 1),
    viewport: {
      scrollX,
      width: innerWidth,
      client: document.documentElement.clientWidth,
      visual: visualViewport?.width,
      dialog: dialog?.toJSON(),
    },
    buttons: rows,
  };
}
async function stateChecks() {
  const root = document.querySelector(".session-workspace"),
    attendance = root.querySelector('[data-session-tab="attendance"]'),
    activity = root.querySelector('[data-session-tab="activity"]'),
    signature = (button) => {
      const style = getComputedStyle(button);
      return [style.color, style.backgroundColor, style.borderColor].join("|");
    };
  const initial =
    attendance.getAttribute("aria-pressed") === "true" &&
    activity.getAttribute("aria-pressed") === "false";
  const distinct = signature(attendance) !== signature(activity);
  activity.click();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const changed =
    activity.getAttribute("aria-pressed") === "true" &&
    attendance.getAttribute("aria-pressed") === "false" &&
    !root.querySelector('[data-session-panel="activity"]').hidden &&
    root.querySelector('[data-session-panel="attendance"]').hidden;
  attendance.click();
  const copy = root.querySelector(".session-workspace-footer button");
  const originalDisabled = copy.disabled;
  let fired = 0;
  const capture = (event) => {
    fired++;
    event.stopImmediatePropagation();
  };
  copy.addEventListener("click", capture, true);
  copy.disabled = true;
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  copy.click();
  const disabled =
    copy.disabled && fired === 0 && getComputedStyle(copy).cursor !== "pointer";
  copy.disabled = originalDisabled;
  copy.removeEventListener("click", capture, true);
  const originalNodes = [...copy.childNodes];
  showSuccessCopy(copy);
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const successColor = getComputedStyle(copy)
    .color.match(/\d+/g)
    .slice(0, 3)
    .map(Number);
  const copyFeedback =
    copy.dataset.copyState === "done" &&
    copy.querySelectorAll("svg").length === 1 &&
    successColor[1] > successColor[0] &&
    successColor[1] > successColor[2];
  await new Promise((resolve) => setTimeout(resolve, 2100));
  const copyRestored =
    !copy.dataset.copyState &&
    originalNodes.length === copy.childNodes.length &&
    originalNodes.every((node, index) => node === copy.childNodes[index]);
  return {
    initial,
    distinct,
    changed,
    restored: attendance.getAttribute("aria-pressed") === "true",
    disabled,
    copyFeedback,
    copyRestored,
  };
}

async function run(env) {
  const { cdp, evaluate, cases, delay } = env;
  await require("./browser-ready.cjs")(env);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "edu-button-controls-"));
  const observations = [];
  await evaluate("(" + setup.toString() + ")()");
  try {
    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      for (const view of (
        process.env.EDU_BUTTON_VIEWS ||
        "schools,school,class,students,lesson,grades,modular,session,activity,reports,schedule,backups,settings"
      ).split(",")) {
        await evaluate(
          "(" + show.toString() + ")(" + JSON.stringify(view) + ")",
        );
        // Earlier interaction flows may leave the real pointer over a newly
        // rendered action. This contract measures normal color roles; hover
        // is exercised explicitly by theme-browser rather than accidentally.
        await cdp("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: 0,
          y: 0,
          buttons: 0,
        });
        await delay(220);
        const result = await evaluate(
          "(" +
            measure.toString() +
            ")(" +
            isClippedAccessibleLabel.toString() +
            ")",
        );
        observations.push({ width, view, ...result });
        if (view === "session" && !process.env.EDU_BUTTON_AUDIT_BASELINE) {
          const states = await evaluate("(" + stateChecks.toString() + ")()");
          cases.push({
            id: "BUTTON-STATES-" + width,
            name:
              "Selected session panel and native disabled action remain meaningful at " +
              width +
              "px",
            pass: Object.values(states).every(Boolean),
            observed: states,
          });
        }
        const metrics = await cdp("Page.getLayoutMetrics");
        const modalOpen = await evaluate(
          '!document.getElementById("modal").classList.contains("hidden")',
        );
        const shot = await cdp(
          "Page.captureScreenshot",
          modalOpen
            ? { format: "png", fromSurface: true }
            : {
                format: "png",
                captureBeyondViewport: true,
                clip: {
                  x: metrics.cssLayoutViewport.pageX,
                  y: 0,
                  width,
                  height: Math.min(
                    2200,
                    Math.max(900, metrics.cssContentSize.height),
                  ),
                  scale: 1,
                },
              },
        );
        fs.writeFileSync(
          path.join(output, view + "-" + width + ".png"),
          Buffer.from(shot.data, "base64"),
        );
        const record = (key, pass, observed) =>
          cases.push({
            id: "BUTTON-" + key + "-" + view + "-" + width,
            name: key + " on " + view + " at " + width + "px",
            pass: !!pass,
            observed,
          });
        record(
          "OVERFLOW",
          result.noOverflow && result.modalFits,
          result.viewport,
        );
        record(
          "LABELS",
          result.buttons.length > 0 &&
            result.buttons.every((button) => button.label),
          result.buttons.filter((button) => !button.label),
        );
        if (
          (view === "grades" || view === "modular") &&
          !process.env.EDU_BUTTON_AUDIT_BASELINE
        ) {
          const compact = result.buttons.filter((button) => button.compact);
          record(
            "COMPACT",
            compact.length > 0 &&
              compact.every(
                (button) =>
                  button.compactInsideInput &&
                  button.width >= (button.modularCompact ? 19.5 : 31.5) &&
                  button.height >= (button.modularCompact ? 27.5 : 31.5) &&
                  Math.abs(button.dx) <= 3 &&
                  Math.abs(button.dy) <= 3 &&
                  button.icons.length === 1,
              ),
            compact,
          );
        }
        if (!process.env.EDU_BUTTON_AUDIT_BASELINE) {
          const targets = result.buttons.filter(
            (button) => button.coreAction && !button.compact,
          );
          record(
            "CENTER",
            targets.length > 0 &&
              targets.every(
                (button) =>
                  Math.abs(button.dx) <= 3 && Math.abs(button.dy) <= 3,
              ),
            targets.filter(
              (button) => Math.abs(button.dx) > 3 || Math.abs(button.dy) > 3,
            ),
          );
          record(
            "TOUCH",
            targets.every(
              (button) => button.height >= 43.5 && button.width >= 43.5,
            ),
            targets.filter(
              (button) => button.height < 43.5 || button.width < 43.5,
            ),
          );
          const toned = result.buttons.filter((button) => button.tone);
          record(
            "COLOR",
            toned.length > 0 && toned.every(approvedButtonColors),
            toned.map((button) => ({
              label: button.label,
              tone: button.tone,
              variant: button.variant,
              role: button.colorRole,
              color: button.color,
              background: button.background,
            })),
          );
          const iconTargets = result.buttons.filter(
            (button) => button.needsIcon,
          );
          record(
            "ICONS",
            iconTargets.every(
              (button) =>
                button.icons.length === 1 &&
                !button.clipped &&
                !/\p{Extended_Pictographic}/u.test(button.text) &&
                button.icons.every(
                  (icon) =>
                    icon.width >= 14 &&
                    Math.abs(icon.width - icon.height) <= 1 &&
                    icon.transform === "none",
                ),
            ),
            iconTargets,
          );
        }
      }
    }
  } finally {
    await evaluate("closeModal();globalThis.__buttonSurfaceCleanup()");
  }
  fs.writeFileSync(
    path.join(output, "observations.json"),
    JSON.stringify(observations, null, 2) + "\n",
  );
  console.log("Button audit artifacts: " + output);
}
module.exports = { run, approvedButtonColors, isClippedAccessibleLabel };
if (require.main === module)
  require("./data-integrity.cjs").main({
    stage: "button-controls",
    runExtra: run,
  });
