"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");

// Runs only in data-integrity's disposable browser profile. It replaces the
// clipboard delivery with a spy and restores its synthetic installation.
async function setup() {
  const original = await EduV24.snapshotInstallation(),
    clipboard = copyToClipboard,
    output = EduPeriodicReports.output,
    year = "1405-1406",
    workspace = "deputy_action_first",
    ids = {
      school: "deputy_school",
      otherSchool: "deputy_other_school",
      a: "deputy_class_a",
      b: "deputy_class_b",
    },
    restore = async (file) => {
      closeModal();
      EduV24.previewFullBackup(file);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
      await EduV24.test.settle();
    },
    fixture = structuredClone(original),
    makeClass = (id, name) => ({
      id,
      name,
      students: ["present", "absent", "late", "leave", "unknown"].map(
        (status, index) => ({
          id: id + "_" + status,
          name: id + "_PRIVATE_" + status,
          code: String(index + 1),
        }),
      ),
      archivedStudents: [],
      lessons: [
        {
          id: id + "_lesson",
          name: id + "_LESSON",
          teacher: "DEPUTY_TEACHER",
          gradeMode: "kardanesh",
          poudmans: [],
          kardaneshScores: {},
          gradingPolicy: {
            ...EduPolicy.defaults("dual", year),
            code: "DEPUTY-" + id,
            confirmed: true,
          },
        },
      ],
    }),
    schools = [
      {
        id: ids.school,
        name: "هنرستان مصنوعی آزمون معاون",
        classes: [
          makeClass(ids.a, "کلاس اول آزمایشی"),
          makeClass(ids.b, "کلاس دوم آزمایشی"),
        ],
      },
      {
        id: ids.otherSchool,
        name: "مدرسه خارج از محدوده",
        classes: [makeClass("deputy_outside", "کلاس خارج از محدوده")],
      },
    ],
    sessions = schools.flatMap((school) =>
      school.classes.map((classroom, index) => ({
        id: classroom.id + "_session",
        schoolId: school.id,
        classId: classroom.id,
        lessonId: classroom.lessons[0].id,
        date: "2026-11-02",
        period: school.id === ids.otherSchool ? 2 : index,
        poudmanId: null,
        unitId: null,
        roster: structuredClone(classroom.students),
        attendance: Object.fromEntries(
          classroom.students
            .filter((student) => !student.id.endsWith("_unknown"))
            .map((student) => [
              student.id,
              student.id.endsWith("_late")
                ? "late:10"
                : student.id.split("_").at(-1),
            ]),
        ),
        scores: [
          {
            studentId: classroom.students[1].id,
            type: "homework",
            value: 1,
            note: "DEPUTY_PRIVATE_HOMEWORK",
          },
        ],
      })),
    ),
    later = structuredClone(sessions[0]);
  later.id += "_later";
  later.date = "2026-11-03";
  sessions.push(later);
  const data = EduV24.normalizeDB({
      ...defaultDB(),
      settings: {
        ...db.settings,
        academicYear: year,
        academicTerm: "اول",
        password: "",
      },
      schools,
      sessions,
      masterSchedule: {},
      migrationWarnings: [],
    }),
    {
      schools: normalizedSchools,
      sessions: normalizedSessions,
      ...meta
    } = data;
  meta.layout = normalizedSchools.map((school) => ({
    id: school.id,
    name: school.name,
    classes: school.classes.map((classroom) => classroom.id),
  }));
  fixture.activeWorkspace = workspace;
  fixture.gradeDrafts = [];
  fixture.reportDrafts = {};
  fixture.snapshotNotes = [];
  for (const name of Object.keys(fixture.stores)) fixture.stores[name] = [];
  fixture.stores.catalog.push({
    id: workspace,
    year,
    term: "اول",
    termKind: "first",
    closed: false,
    revision: 1,
    createdAt: "2026-11-02T00:00:00Z",
    updatedAt: "2026-11-02T00:00:00Z",
  });
  for (const [logical, value] of [
    ["meta", meta],
    ...normalizedSchools.flatMap((school) =>
      school.classes.map((classroom) => ["class:" + classroom.id, classroom]),
    ),
    ...normalizedSessions.map((session) => ["session:" + session.id, session]),
  ])
    fixture.stores.records.push({
      key: workspace + "|" + logical,
      workspace,
      logical,
      value,
    });
  await restore(fixture);
  globalThis.__deputyAction = { ids, copied: [], results: [] };
  copyToClipboard = (text, button, html) => {
    globalThis.__deputyAction.copied.push({
      text,
      html,
      route: button?.getAttribute("data-legacy-click"),
    });
  };
  EduPeriodicReports.output = (...args) =>
    Promise.resolve(output(...args)).then((result) => {
      globalThis.__deputyAction.results.push(result);
      return result;
    });
  globalThis.__deputyAction.cleanup = async () => {
    copyToClipboard = clipboard;
    EduPeriodicReports.output = output;
    await restore(original);
  };
}

function show(mode) {
  closeModal();
  goReports();
  state.reportTab = mode;
  EduPeriodicReports.selectScope(globalThis.__deputyAction.ids.school);
  Object.assign(EduPeriodicReports.filters, {
    mode,
    date: "2026-11-02",
    audience: "management",
    detailLevel: "summary",
  });
  render();
  return measure();
}
function measure() {
  const copies = [...document.querySelectorAll("[data-deputy-copy]")],
    button = copies[0],
    box = button?.getBoundingClientRect();
  return {
    count: copies.length,
    visible:
      !!box &&
      box.width > 0 &&
      box.height >= 44 &&
      getComputedStyle(button).visibility !== "hidden",
    persistent: !!button?.closest(".periodic-controls"),
    enabled: !!button && !button.disabled,
    noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    noButtonClipping: !!button && button.scrollWidth <= button.clientWidth + 1,
  };
}
async function clickCopy() {
  const test = globalThis.__deputyAction,
    before = test.results.length,
    button = document.querySelector("[data-deputy-copy]");
  if (!button || button.disabled) throw Error("Deputy copy action unavailable");
  button.click();
  const disabledWhilePreparing = button.disabled;
  for (let i = 0; i < 200 && test.results.length === before; i++)
    await new Promise((resolve) => setTimeout(resolve, 25));
  if (test.results.length === before)
    throw Error("Actual deputy action did not settle");
  return {
    result: test.results.at(-1),
    delivery: test.copied.at(-1),
    disabledWhilePreparing,
    after: measure(),
  };
}
async function run(env) {
  const { cdp, evaluate, cases } = env,
    screenshots = fs.mkdtempSync(path.join(os.tmpdir(), "edu-deputy-action-")),
    check = (id, name, pass, observed) =>
      cases.push({ id, name, pass: !!pass, observed });
  await require("./browser-ready.cjs")(env);
  for (let attempt = 0; attempt < 150; attempt++) {
    if (
      await evaluate(
        "typeof globalThis.EduPeriodicReports?.output === 'function'",
      )
    )
      break;
    if (attempt === 149)
      throw Error(
        "Periodic report API did not become ready: " +
          JSON.stringify(await evaluate("globalThis.__eduStartupErrors || []")),
      );
    await env.delay(100);
  }
  try {
    await evaluate("(" + setup.toString() + ")()");
    await evaluate(
      "globalThis.__measureDeputy = " +
        measure.toString() +
        ";globalThis.measure = globalThis.__measureDeputy",
    );
    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      for (const mode of ["daily", "weekly", "monthly", "annual"]) {
        const observed = await evaluate(
          "(" + show.toString() + ")(" + JSON.stringify(mode) + ")",
        );
        check(
          "deputy-action-visible-" + width + "-" + mode,
          "One persistent usable deputy action before generating " +
            mode +
            " at " +
            width,
          observed.count === 1 &&
            observed.visible &&
            observed.persistent &&
            observed.enabled &&
            observed.noPageOverflow &&
            observed.noButtonClipping,
          observed,
        );
        if (mode === "daily") {
          await evaluate(
            "document.querySelector('[data-deputy-copy]').scrollIntoView({block:'center'})",
          );
          const shot = await cdp("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(
            path.join(screenshots, "deputy-" + width + ".png"),
            Buffer.from(shot.data, "base64"),
          );
        }
      }
    }
    await evaluate("(" + show.toString() + ")('daily')");
    const copied = await evaluate("(" + clickCopy.toString() + ")()"),
      text = copied.delivery?.text || "";
    check(
      "deputy-action-copy",
      "Actual persistent deputy button builds a current compact report with rich copy and no present names or grades",
      copied.result &&
        copied.disabledWhilePreparing &&
        copied.after.count === 1 &&
        text.includes("deputy_class_a_PRIVATE_absent") &&
        text.includes("deputy_class_b_PRIVATE_leave") &&
        text.includes("deputy_class_a_PRIVATE_late (۱۰ دقیقه)") &&
        !text.includes("_PRIVATE_present") &&
        !text.includes("deputy_outside") &&
        !text.includes("DEPUTY_PRIVATE_HOMEWORK") &&
        copied.delivery.html?.includes("<strong>مرخصی</strong>"),
      copied,
    );
    const invalidated = await evaluate(
      "(() => { EduPeriodicReports.invalidate('Synthetic stale report'); return measure(); })()",
    );
    check(
      "deputy-action-invalidated",
      "Invalidating the report leaves the deputy action visible and usable",
      invalidated.count === 1 &&
        invalidated.visible &&
        invalidated.enabled &&
        invalidated.persistent,
      invalidated,
    );
    await evaluate("EduPeriodicReports.set('date','2026-11-03')");
    const changedDate = await evaluate("(" + clickCopy.toString() + ")()"),
      changedDatePass = await evaluate(
        "(() => { const text = __deputyAction.copied.at(-1).text; return text.includes(faDate('2026-11-03')) && !text.includes(faDate('2026-11-02')) && !text.includes('deputy_class_b_PRIVATE_'); })()",
      );
    check(
      "deputy-action-date",
      "Deputy action uses changed date rather than the previous prepared report",
      changedDate.result && changedDatePass,
      changedDate,
    );
    await evaluate(
      "EduPeriodicReports.set('date','2026-11-02');EduPeriodicReports.set('classId',__deputyAction.ids.a)",
    );
    const changedClass = await evaluate("(" + clickCopy.toString() + ")()"),
      classText = changedClass.delivery?.text || "";
    check(
      "deputy-action-class",
      "Deputy action respects the newly selected class",
      changedClass.result &&
        classText.includes("deputy_class_a_PRIVATE_absent") &&
        !classText.includes("deputy_class_b_PRIVATE_"),
      changedClass,
    );
    await evaluate(
      "EduPeriodicReports.set('audience','parent');EduPeriodicReports.set('studentId',__deputyAction.ids.a+'_absent')",
    );
    const parent = await evaluate("(" + clickCopy.toString() + ")()"),
      parentText = parent.delivery?.text || "";
    check(
      "deputy-action-parent",
      "Parent-scoped deputy copy contains only the selected student's attendance",
      parent.result &&
        parentText.includes("deputy_class_a_PRIVATE_absent") &&
        !["present", "late", "leave", "unknown"].some((status) =>
          parentText.includes("_PRIVATE_" + status),
        ) &&
        !parentText.includes("deputy_class_b_PRIVATE_") &&
        !parentText.includes("DEPUTY_PRIVATE_HOMEWORK"),
      parent,
    );
    check(
      "deputy-action-screenshots",
      "Deputy action screenshots captured across four viewports",
      true,
      { screenshots },
    );
  } finally {
    await cdp("Emulation.clearDeviceMetricsOverride");
    await evaluate("globalThis.__deputyAction?.cleanup?.()");
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "persistent-deputy-report-action", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
