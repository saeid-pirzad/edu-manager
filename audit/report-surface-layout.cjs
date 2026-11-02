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
        ".report-class-group,.report-student-row,.periodic-session,.report-session-students>li,.report-session-scores>li,.report-basis,.grade-report-section,.report-options,.report-assessment-stages,.report-modular-term,.report-modular-course",
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
            observed.noPageOverflow &&
            observed.noSurfaceOverflow &&
            observed.nestedFrames.length === 0 &&
            observed.readableSummary &&
            observed.controls,
          observed: { ...observed, screenshot },
        });
      }
    }
    await cdp("Emulation.setEmulatedMedia", { media: "print" });
    const printed = await evaluate(
      "(() => ({ title: !!document.querySelector('.periodic-document h2')?.textContent, body: !!document.querySelector('.periodic-session')?.textContent, controlsHidden: getComputedStyle(document.querySelector('.periodic-controls')).display === 'none', actionsHidden: getComputedStyle(document.querySelector('.periodic-export-actions')).display === 'none', definitionsVisible: getComputedStyle(document.querySelector('.report-basis-print')).display !== 'none', signatureVisible: getComputedStyle(document.querySelector('.report-signoff')).display !== 'none' }))()",
    );
    cases.push({
      id: "report-surface-print",
      name: "Report printing retains content, definitions and signatures while hiding editing/export controls",
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
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "report-surface-layout", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
