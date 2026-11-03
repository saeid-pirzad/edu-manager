"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
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
  globalThis.__reportSurfaceCleanup = () => restore(original);
  globalThis.__reportSurfaceIds = ids;
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
  goReports();
  const ids = globalThis.__reportSurfaceIds;
  if (view === "overview") {
    state.reportTab = "karnameh";
    karnamehFilter = { schoolId: ids.school, classId: ids.a, studentId: "" };
    render();
    await renderKarnamehTabReports();
  } else {
    state.reportTab = "daily";
    EduPeriodicReports.selectScope(ids.school);
    Object.assign(EduPeriodicReports.filters, {
      mode: "daily",
      date: "2026-11-02",
      detailLevel: "full",
    });
    render();
    if (view !== "hub") await EduPeriodicReports.generate();
  }
  if (view === "sessions")
    document
      .querySelectorAll(
        "details.report-class-group,details.report-session-disclosure",
      )
      .forEach((d) => (d.open = true));
  const selector = {
    hub: ".periodic-controls",
    overview: ".grade-report",
    daily: ".periodic-document",
    sessions: ".periodic-session",
  }[view];
  document.querySelector(selector)?.scrollIntoView({ block: "start" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  return selector;
}
function measure(selector) {
  const root = document.querySelector(selector),
    fullBorder = (element) => {
      const style = getComputedStyle(element);
      return ["Top", "Right", "Bottom", "Left"].every(
        (side) =>
          parseFloat(style["border" + side + "Width"]) > 0 &&
          style["border" + side + "Style"] !== "none",
      );
    },
    nested = [
      ...root.querySelectorAll(
        ".report-class-group,.report-student-row,.periodic-session,.report-session-students>li,.report-session-scores>li,.grade-report-section,.report-options,.report-assessment-stages,.report-modular-term,.report-modular-course",
      ),
    ].filter((element) => element.getClientRects().length),
    metrics = [...root.querySelectorAll(".periodic-summary span")],
    geometry = (element) => {
      const style = getComputedStyle(element),
        box = element.getBoundingClientRect();
      return {
        className: element.className,
        width: box.width,
        border: style.border,
        padding: style.padding,
        fontSize: style.fontSize,
      };
    };
  return {
    headingFits:
      !root.querySelector(".periodic-document-heading") ||
      root.querySelector(".periodic-document-heading").scrollWidth <=
        root.querySelector(".periodic-document-heading").clientWidth + 1,
    exportIcons: [
      ...root.querySelectorAll(".periodic-export-actions button"),
    ].every(
      (b) => !!b.querySelector("svg") && b.getBoundingClientRect().height >= 44,
    ),
    noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    noSurfaceOverflow: root.scrollWidth <= root.clientWidth + 1,
    nestedFrames: nested.filter(fullBorder).map(geometry),
    readableSummary: metrics.every(
      (element) => parseFloat(getComputedStyle(element).fontSize) >= 11,
    ),
    controls: [...root.querySelectorAll("input,select,textarea")]
      .filter(
        (element) =>
          element.type !== "checkbox" && element.getClientRects().length,
      )
      .every(
        (element) => parseFloat(getComputedStyle(element).borderTopWidth) > 0,
      ),
    surface: geometry(root),
    nested: nested.slice(0, 12).map(geometry),
  };
}

async function sessionColors() {
  EduPeriodicReports.filters.detailLevel = "summary";
  await EduPeriodicReports.generate();
  document
    .querySelectorAll(
      "details.report-class-group,details.report-session-disclosure",
    )
    .forEach((d) => (d.open = true));
  const metrics = [
    ...document.querySelectorAll(".report-session-counts .report-metric"),
  ];
  const groups = [...document.querySelectorAll(".report-session-counts")];
  const summary = {
    count: metrics.length,
    colors: new Set(metrics.map((n) => getComputedStyle(n).backgroundColor))
      .size,
    painted: metrics.every(
      (n) =>
        !["transparent", "rgba(0, 0, 0, 0)"].includes(
          getComputedStyle(n).backgroundColor,
        ),
    ),
    fits:
      groups.every((n) => n.scrollWidth <= n.clientWidth + 1) &&
      metrics.every((n) => n.scrollWidth <= n.clientWidth + 1),
    unknown: !!document.querySelector(
      ".report-session-counts .report-metric-unknown",
    ),
  };
  EduPeriodicReports.filters.detailLevel = "full";
  await EduPeriodicReports.generate();
  document
    .querySelectorAll(
      "details.report-class-group,details.report-session-disclosure",
    )
    .forEach((d) => (d.open = true));
  const badges = [...document.querySelectorAll(".report-session-attendance")];
  return {
    ...summary,
    badges: badges.length,
    badgesPainted: badges.every(
      (n) =>
        !["transparent", "rgba(0, 0, 0, 0)"].includes(
          getComputedStyle(n).backgroundColor,
        ),
    ),
    namesFit: [
      ...document.querySelectorAll(".report-session-student-heading"),
    ].every((n) => n.scrollWidth <= n.clientWidth + 1),
  };
}

function followupDisclosureCheck() {
  document
    .querySelectorAll(
      "details.report-class-group,details.report-session-disclosure",
    )
    .forEach((d) => (d.open = false));
  const groups = [
    ...document.querySelectorAll(".report-followup details.report-class-group"),
  ];
  const source = groups[0],
    peer = groups[1];
  const heading = source?.querySelector("summary");
  const initialClosed = groups.length > 1 && groups.every((g) => !g.open);
  const hidden = groups.every(
    (g) =>
      g.querySelector(".report-student-row")?.getClientRects().length === 0,
  );
  heading.click();
  const rows = [...source.querySelectorAll(".report-student-row")];
  const visible =
    rows.length > 0 && rows.every((n) => n.getClientRects().length > 0);
  const independent = source.open && !peer.open;
  const metricGroups = [...source.querySelectorAll(".report-student-metrics")];
  const metricsFit =
    metricGroups.every((g) => g.scrollWidth <= g.clientWidth + 1) &&
    [
      ...source.querySelectorAll(".report-student-metrics .report-metric"),
    ].every((n) => n.scrollWidth <= n.clientWidth + 1);
  const mobileMetrics =
    innerWidth > 900 ||
    (metricGroups.every(
      (g) =>
        getComputedStyle(g).gridTemplateColumns.split(" ").length === 6 &&
        new Set(
          [...g.children].map((n) => Math.round(n.getBoundingClientRect().top)),
        ).size === 1,
    ) &&
      [
        ...source.querySelectorAll(".report-student-metrics .report-metric"),
      ].every(
        (n) =>
          getComputedStyle(n).flexDirection === "column" &&
          parseFloat(getComputedStyle(n.querySelector("dd")).fontSize) >= 13,
      ));
  const sessionGroup = document.querySelector(
    "details.report-session-disclosure",
  );
  const standalone =
    document.querySelector(".report-followup").nextElementSibling ===
      sessionGroup && !sessionGroup.closest(".report-followup");
  const nestedClosed = !!sessionGroup && !sessionGroup.open;
  sessionGroup.querySelector("summary").click();
  const sessionsVisible = [
    ...sessionGroup.querySelectorAll(".periodic-session"),
  ].every((n) => n.getClientRects().length > 0);
  sessionGroup.querySelector("summary").click();
  peer.querySelector("summary").click();
  heading.click();
  const otherUnaffected = !source.open && peer.open;
  peer.querySelector("summary").click();
  const fit = groups.every((g) => g.scrollWidth <= g.clientWidth + 1);
  const count = heading.querySelector("p")?.textContent;
  const totalRows = document.querySelectorAll(
    ".report-followup .report-student-row",
  ).length;
  const printable = EduV24.preparePrint(
    document.querySelector("[data-periodic-print]"),
  );
  printable.style.setProperty("display", "block", "important");
  const printed = [...printable.querySelectorAll("details.report-class-group")];
  const nestedPrintComplete =
    [...printable.querySelectorAll("details.report-session-disclosure")].every(
      (g) => g.open,
    ) &&
    [...printable.querySelectorAll(".periodic-session")].every(
      (n) => n.getClientRects().length > 0,
    );
  const printComplete =
    printed.length === groups.length &&
    printed.every((g) => g.open) &&
    printable.querySelectorAll(".report-followup .report-student-row")
      .length === totalRows &&
    [
      ...printable.querySelectorAll(".report-followup .report-student-row"),
    ].every((n) => n.getClientRects().length > 0);
  printable.remove();
  document.getElementById("printPageStyle")?.remove();
  return {
    initialClosed,
    hidden,
    visible,
    fit,
    independent,
    metricsFit,
    mobileMetrics,
    nestedClosed,
    standalone,
    sessionsVisible,
    otherUnaffected,
    count,
    printComplete,
    nestedPrintComplete,
    sourceStillClosed: groups.every((g) => !g.open),
    outerNotCollapsible: !document.querySelector("details.report-followup"),
  };
}

async function run(env) {
  const { cdp, evaluate, cases } = env,
    previews = fs.mkdtempSync(path.join(os.tmpdir(), "edu-report-surfaces-"));
  await require("./browser-ready.cjs")(env);
  try {
    await evaluate("(" + setup.toString() + ")()");
    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      for (const view of ["hub", "overview", "daily", "sessions"]) {
        const selector = await evaluate(
            "(" + show.toString() + ")('" + view + "')",
          ),
          observed = await evaluate(
            "(" + measure.toString() + ")('" + selector + "')",
          );
        await evaluate(
          "document.querySelector(" +
            JSON.stringify(selector) +
            ')?.scrollIntoView({block:"start"})',
        );
        const shot = await cdp("Page.captureScreenshot", { format: "png" }),
          screenshot = path.join(previews, view + "-" + width + ".png");
        fs.writeFileSync(screenshot, Buffer.from(shot.data, "base64"));
        cases.push({
          id: "report-surface-" + view + "-" + width,
          name:
            "Flat readable report surface without overflow: " +
            view +
            " at " +
            width,
          pass:
            observed.headingFits &&
            observed.exportIcons &&
            observed.noPageOverflow &&
            observed.noSurfaceOverflow &&
            observed.nestedFrames.length === 0 &&
            observed.readableSummary &&
            observed.controls,
          observed: { ...observed, screenshot },
        });
      }
      const disclosure = await evaluate(
        "(" + followupDisclosureCheck.toString() + ")()",
      );
      cases.push({
        id: "followup-disclosure-" + width,
        name: "Each class opens independently while printing all students",
        pass: Object.values(disclosure).every(Boolean),
        observed: disclosure,
      });
      await evaluate(
        "document.querySelector('details.report-class-group').open=true; document.querySelector('.report-student-row').scrollIntoView({block:'center'})",
      );
      const followupShot = await cdp("Page.captureScreenshot", {
        format: "png",
      });
      fs.writeFileSync(
        path.join(previews, "followup-" + width + ".png"),
        Buffer.from(followupShot.data, "base64"),
      );
      const colors = await evaluate("(" + sessionColors.toString() + ")()");
      cases.push({
        id: "session-colors-" + width,
        name: "Session status colors and readable mobile rows",
        pass:
          colors.count > 0 &&
          colors.colors === 5 &&
          colors.painted &&
          colors.fits &&
          colors.unknown &&
          colors.badges > 0 &&
          colors.badgesPainted &&
          colors.namesFit,
        observed: colors,
      });
    }
    await cdp("Emulation.setEmulatedMedia", { media: "print" });
    const printed = await evaluate(
      "(() => ({ title: !!document.querySelector('.periodic-document h2')?.textContent, body: !!document.querySelector('.periodic-session')?.textContent, controlsHidden: getComputedStyle(document.querySelector('.periodic-controls')).display === 'none', actionsHidden: getComputedStyle(document.querySelector('.periodic-export-actions')).display === 'none', footerRemoved: !document.querySelector('.periodic-footer,.report-basis-print,.report-signoff') }))()",
    );
    cases.push({
      id: "report-surface-print",
      name: "Report printing retains content without basis, signature or footer lines",
      pass: Object.values(printed).every(Boolean),
      observed: printed,
    });
  } finally {
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    await cdp("Emulation.clearDeviceMetricsOverride");
    await evaluate("globalThis.__reportSurfaceCleanup?.()");
  }
}
module.exports = run;
module.exports.setup = setup;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "report-surface-layout", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
