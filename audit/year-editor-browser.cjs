"use strict";
async function restore(file) {
  closeModal();
  EduV24.previewFullBackup(file);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  await EduV24.test.settle();
}
async function beforeReload() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id: "YEAR_EDITOR_" + id, name, pass: !!pass, observed }),
    ids = {
      first: "year_editor_first",
      historical: "year_editor_historical",
      future: "year_editor_future",
      school: "year_editor_school",
      classroom: "year_editor_class",
      lesson: "year_editor_lesson",
      student: "year_editor_student",
    },
    year = "1461-1462",
    historicalYear = "1460-1461",
    futureYear = "1463-1464",
    original = await EduV24.snapshotInstallation(),
    fixture = structuredClone(original);
  for (const name of Object.keys(fixture.stores)) fixture.stores[name] = [];
  fixture.activeWorkspace = ids.first;
  fixture.reportDrafts = {};
  fixture.gradeDrafts = [];
  fixture.snapshotNotes = [];
  for (const [id, academicYear] of [
    [ids.historical, historicalYear],
    [ids.first, year],
    [ids.future, futureYear],
  ]) {
    const data = EduV24.normalizeDB({
        ...defaultDB(),
        settings: {
          ...db.settings,
          academicYear,
          academicTerm: "اول",
          password: "",
        },
        schools: [
          {
            id: ids.school,
            name: "هنرستان مصنوعی سال تحصیلی",
            classes: [
              {
                id: ids.classroom,
                name: "یازدهم شبکه مصنوعی",
                students: [
                  { id: ids.student, name: "هنرجوی مصنوعی سال", code: "1" },
                ],
                archivedStudents: [],
                lessons: [
                  {
                    id: ids.lesson,
                    name: "مهارت سالانه مصنوعی",
                    gradeMode: "kardanesh",
                    poudmans: [],
                    gradingPolicy: {
                      ...EduPolicy.defaults("dual", academicYear),
                      confirmed: true,
                      code: "YEAR-EDITOR",
                    },
                    kardaneshScores: {
                      [ids.student]: {
                        midtermPractical: 16,
                        midtermTheory: 12,
                        practical: 18,
                        theory: 14,
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
        masterSchedule: {},
        migrationWarnings: [],
        sessions: [
          {
            id: "year_editor_history",
            schoolId: ids.school,
            classId: ids.classroom,
            lessonId: ids.lesson,
            date: EduAcademicYear.range(academicYear).start,
            period: 0,
            poudmanId: null,
            unitId: null,
            roster: [{ id: ids.student, name: "هنرجوی مصنوعی سال", code: "1" }],
            attendance: { [ids.student]: "leave" },
            scores: [{ studentId: ids.student, type: "classGrade", value: 17 }],
          },
        ],
      }),
      { schools, sessions, ...meta } = data;
    meta.layout = schools.map((school) => ({
      id: school.id,
      name: school.name,
      classes: school.classes.map((c) => c.id),
    }));
    fixture.stores.catalog.push({
      id,
      year: academicYear,
      term: "اول",
      termKind: "first",
      closed: false,
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    for (const [logical, value] of [
      ["meta", meta],
      ["class:" + ids.classroom, schools[0].classes[0]],
      ...sessions.map((s) => ["session:" + s.id, s]),
    ])
      fixture.stores.records.push({
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      });
  }
  closeModal();
  EduV24.previewFullBackup(fixture);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  await EduV24.test.settle();
  const before = await EduV24.snapshotInstallation(),
    historicalRecords = JSON.stringify(
      before.stores.records.filter((row) =>
        [ids.historical, ids.future].includes(row.workspace),
      ),
    ),
    unchanged = () =>
      EduV24.snapshotInstallation().then(
        (file) => JSON.stringify(file.stores) === JSON.stringify(before.stores),
      );
  await EduV24.openAcademicYear();
  const hub = document.querySelector("#modal:not(.hidden) .academic-year-hub");
  check(
    "01",
    "the year hub displays only the restored active year, without create/select-other-year controls",
    !!hub &&
      hub.textContent.includes(year) &&
      !hub.textContent.includes(historicalYear) &&
      !hub.textContent.includes(futureYear) &&
      !hub.querySelector('[data-workspace-submit="create-academic-year"]') &&
      !hub.querySelector('[data-workspace-action="open-academic-year"]') &&
      typeof EduV24.createAcademicYear === "undefined" &&
      typeof EduV24.openStoredAcademicYear === "undefined" &&
      (await unchanged()),
  );
  let rejected = 0;
  for (const options of [undefined, { allowOtherYear: true }, true])
    try {
      await EduV24.switchPeriod(ids.future, options);
    } catch (error) {
      if (/سال تحصیلی فعال/.test(error.message)) rejected++;
    }
  check(
    "02",
    "the ordinary public switch rejects another year and ignores forged legacy permissions even in audit mode",
    rejected === 3 &&
      EduV24.getReportContext().id === ids.first &&
      (await unchanged()),
  );
  const testMode = window.__EDU_TEST_MODE__;
  let gated = 0;
  try {
    window.__EDU_TEST_MODE__ = false;
    for (const operation of [
      () => EduV24.test.createLegacyPeriod(),
      () => EduV24.test.switchLegacyPeriod(ids.future),
    ])
      try {
        await operation();
      } catch (error) {
        if (/فقط در حالت آزمون/.test(error.message)) gated++;
      }
  } finally {
    window.__EDU_TEST_MODE__ = testMode;
  }
  check(
    "03",
    "synthetic legacy creation and navigation remain unavailable outside explicitly enabled test mode",
    gated === 2 && (await unchanged()),
  );
  closeModal();
  return { cases, info: { ids, year, historicalRecords } };
}
async function afterReload(info) {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id: "YEAR_EDITOR_" + id, name, pass: !!pass, observed }),
    { ids, year, historicalRecords } = info,
    wait = async (predicate) => {
      for (let n = 0; n < 250; n++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Single-year editor timed out: " +
          EduV24.test.getState().status?.message,
      );
    },
    historical = (snapshot) =>
      JSON.stringify(
        snapshot.stores.records.filter((row) =>
          [ids.historical, ids.future].includes(row.workspace),
        ),
      );
  check(
    "04",
    "reload preserves the explicitly restored year rather than choosing a newer unrelated year, retaining historical records",
    EduV24.getReportContext().year === year &&
      EduV24.getReportContext().id === ids.first &&
      historical(await EduV24.snapshotInstallation()) === historicalRecords,
  );
  goSchool(ids.school);
  goClass(ids.classroom);
  goLesson(ids.lesson);
  setTab("grades");
  const origin = EduV24.getReportContext();
  document
    .querySelector(
      '[data-workspace-action="assessment-stage"][data-term="دوم"][data-stage="midterm"]',
    )
    .click();
  await wait(
    () =>
      document
        .querySelector(
          '[data-workspace-action="assessment-stage"][data-term="دوم"][data-stage="midterm"]',
        )
        .getAttribute("aria-pressed") === "true" &&
      !!document.querySelector(
        '[data-assessment-context][data-field="midtermPractical"]',
      ),
  );
  let saved = await EduV24.snapshotInstallation();
  const second = saved.stores.catalog.find(
    (row) => row.year === year && row.termKind === "second",
  );
  check(
    "05",
    "second-term assessment remains accessible while first term is open, without switching the active context or copying sessions",
    !!second &&
      !origin.closed &&
      EduV24.getReportContext().id === origin.id &&
      EduV24.getReportContext().year === origin.year &&
      db.sessions.length === 1 &&
      saved.stores.records.filter(
        (row) =>
          row.workspace === second.id && row.logical.startsWith("session:"),
      ).length === 0,
  );
  const input = document.querySelector(
    '[data-assessment-context][data-field="midtermPractical"]',
  );
  input.value = "19";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await EduV24.flushDrafts({ strict: true });
  await EduV24.test.settle();
  saved = await EduV24.snapshotInstallation();
  const firstClass = saved.stores.records.find(
      (row) =>
        row.workspace === ids.first && row.logical === "class:" + ids.classroom,
    ).value,
    secondClass = saved.stores.records.find(
      (row) =>
        row.workspace === second.id && row.logical === "class:" + ids.classroom,
    ).value;
  check(
    "06",
    "selected-stage grades persist only in their own term, preserving the active context, first-term grade and unrelated years",
    EduV24.getReportContext().id === origin.id &&
      firstClass.lessons[0].kardaneshScores[ids.student].midtermPractical ===
        16 &&
      secondClass.lessons[0].kardaneshScores[ids.student].midtermPractical ===
        19 &&
      historical(saved) === historicalRecords,
  );
  const files = [],
    oldDownload = downloadLocalFile;
  try {
    downloadLocalFile = (blob) => files.push(blob);
    await EduV24.exportFullBackup();
  } finally {
    downloadLocalFile = oldDownload;
  }
  const exported = JSON.parse(await files[0].text()),
    decoded = EduV24.validateFullBackup(exported);
  check(
    "07",
    "the actual full backup retains both current-year terms and untouched historical/future legacy records without exposing year management",
    decoded.length === 4 &&
      decoded.filter((part) => part.period.year === year).length === 2 &&
      decoded.some((part) => part.period.id === ids.historical) &&
      decoded.some((part) => part.period.id === ids.future) &&
      historical(exported) === historicalRecords,
  );
  closeModal();
  EduV24.previewFullBackup(exported);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  await EduV24.test.settle();
  saved = await EduV24.snapshotInstallation();
  check(
    "08",
    "full export/restore preserves the explicit active year, both assessment terms and every unrelated historical record",
    EduV24.getReportContext().id === ids.first &&
      EduV24.getReportContext().year === year &&
      saved.stores.catalog.length === 4 &&
      historical(saved) === historicalRecords &&
      saved.stores.records.find(
        (row) =>
          row.workspace === second.id &&
          row.logical === "class:" + ids.classroom,
      ).value.lessons[0].kardaneshScores[ids.student].midtermPractical === 19,
  );
  const closed = await EduV24.snapshotInstallation();
  closed.stores.catalog.find((row) => row.id === ids.first).closed = true;
  closed.activeWorkspace = ids.first;
  closeModal();
  EduV24.previewFullBackup(closed);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  await EduV24.test.settle();
  await EduV24.openAcademicYear();
  const continuation = [
    ...document.querySelectorAll('[data-workspace-action="switch-period"]'),
  ].find((button) => button.textContent.includes("ادامهٔ ثبت روزانه"));
  const preservedUntilClick = EduV24.getReportContext().id === ids.first;
  if (continuation) {
    continuation.click();
    await wait(
      () =>
        EduV24.getReportContext().id === second.id &&
        EduV24.getReportContext().ready,
    );
  }
  check(
    "09",
    "same-year continuation stays usable after closed-term restoration without offering any other academic year",
    preservedUntilClick &&
      !!continuation &&
      EduV24.getReportContext().id === second.id &&
      EduV24.getReportContext().year === year &&
      !EduV24.getReportContext().closed &&
      historical(await EduV24.snapshotInstallation()) === historicalRecords,
  );
  return cases;
}
async function run(env) {
  await require("./browser-ready.cjs")(env);
  const original = await env.evaluate("EduV24.snapshotInstallation()");
  try {
    const result = await env.evaluate("(" + beforeReload.toString() + ")()");
    env.cases.push(...result.cases);
    await require("./browser-ready.cjs")(env);
    env.cases.push(
      ...(await env.evaluate(
        "(" + afterReload.toString() + ")(" + JSON.stringify(result.info) + ")",
      )),
    );
  } finally {
    await env.evaluate(
      "(" + restore.toString() + ")(" + JSON.stringify(original) + ")",
    );
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "single-academic-year-ui", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
