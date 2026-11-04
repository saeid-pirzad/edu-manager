"use strict";

// Synthetic data only, inside data-integrity's temporary browser profile.
// Exercise the real finalize/restore/archive/print paths and restore the starting
// installation so this runner can also join the complete workflow review.
async function frozenModularReports() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    year = "1476-1477",
    student = { id: "frozen_active", name: "هنرجوی فعال آزمون کارنامه" },
    archived = { id: "frozen_archived", name: "هنرجوی بایگانی آزمون کارنامه" },
    ids = {
      school: "frozen_school",
      classroom: "frozen_class",
      lesson: "frozen_modular",
    },
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw Error(
        "Frozen modular report UI timed out: " +
          EduV24.test.getState().status.message,
      );
    },
    restore = async (snapshot) => {
      closeModal();
      EduV24.previewFullBackup(snapshot);
      document.getElementById("fullRestoreConfirmed").checked = true;
      document.querySelector('[data-workspace-action="restore-full"]').click();
      await wait(
        () =>
          EduV24.getReportContext().ready &&
          document.getElementById("modal").classList.contains("hidden"),
      );
      await EduV24.test.settle();
    },
    moduleRows = (root) =>
      [...root.querySelectorAll("[data-module-id]")].map((row) => ({
        name: row.querySelector(".report-module-title").textContent,
        inputs: [...row.querySelectorAll("b")].map(
          (input) => input.textContent,
        ),
        final: row.querySelector("strong").textContent,
      }));
  let original = null;
  const previousPrompt = window.prompt,
    previousPrintTest = window.__EDU_PRINT_TEST__;
  try {
    window.__frozenAuditCases = cases;
    window.__frozenAuditStep = "snapshot original";
    closeModal();
    await EduV24.test.settle();
    original = await EduV24.snapshotInstallation();
    window.__frozenAuditStep = "create first term";
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = year;
    document.getElementById("periodTerm").value = "اول";
    await EduV24.test.createLegacyPeriod();
    const first = EduV24.getReportContext().id,
      dual = {
        id: "frozen_dual",
        name: "درس نظری و عملی آزمون",
        gradeMode: "kardanesh",
        gradingPolicy: EduPolicy.defaults("dual", year),
        poudmans: [],
        kardaneshScores: {
          [student.id]: {
            midtermPractical: 20,
            midtermTheory: 20,
            practical: 20,
            theory: 20,
          },
          [archived.id]: {
            midtermPractical: 10,
            midtermTheory: 10,
            practical: 12,
            theory: 12,
          },
        },
      },
      inputs = [{ m: 3.5, c: 3 }, { m: 0, c: 2 }, { m: 1.5 }, {}],
      modular = {
        id: ids.lesson,
        name: "درس پودمانی آزمون ثابت",
        gradeMode: "standard",
        gradingPolicy: EduPolicy.defaults("modular", year),
        kardaneshScores: {},
        poudmans: inputs.map((grade, index) => ({
          id: "frozen_module_" + index,
          name: "پودمان آزمون " + index,
          podScores: { [student.id]: grade },
          units: [
            {
              id: "frozen_unit_" + index,
              name: "واحد آزمون " + index,
              unitScores: {},
              applyOptions: {},
            },
          ],
        })),
      };
    db.schools = [
      {
        id: ids.school,
        name: "مدرسه آزمون کارنامه ثابت",
        classes: [
          {
            id: ids.classroom,
            name: "کلاس آزمون کارنامه",
            students: [student],
            archivedStudents: [archived],
            lessons: [dual, modular],
          },
        ],
      },
    ];
    db.sessions = [];
    db.masterSchedule = {};
    await saveDB({ action: "Synthetic frozen module report fixture" });
    window.__frozenAuditStep = "finalize first term";
    await EduV24.finalizePeriod();
    let snapshot = await EduV24.snapshotInstallation();
    const frozen = snapshot.stores.reports.find(
      (report) => report.workspace === first,
    );
    if (!frozen) throw Error("The first term did not produce a frozen report");
    const saved = frozen.classes[0].students[0].lessons.find(
        (lesson) => lesson.id === ids.lesson,
      ),
      expectedInputs = [
        { m: 3.5, c: 3 },
        { m: 0, c: 2 },
        { m: 1.5, c: null },
        { m: null, c: null },
      ];
    check(
      "FROZEN01",
      "real first-term closing retains exact detached complete, zero, partial and empty module inputs",
      EduV24.getReportContext().closed &&
        JSON.stringify(saved.modules.map((module) => module.inputs)) ===
          JSON.stringify(expectedInputs),
      { modules: saved.modules },
    );
    await EduV24.showFrozenReport(frozen.id);
    window.__frozenAuditStep = "print frozen modules";
    const modal = document.getElementById("modalBody"),
      displayed = moduleRows(modal);
    check(
      "FROZEN02",
      "frozen UI shows every module even when the annual course is unfinished",
      displayed.length === 4 &&
        displayed[0].final === "18.50" &&
        displayed[1].final === "10.00" &&
        displayed[1].inputs[0] === "0" &&
        displayed[2].inputs[0] === "1.5" &&
        displayed[2].final === "—" &&
        displayed[3].inputs.every((value) => value === "—"),
      { displayed },
    );
    window.__EDU_PRINT_TEST__ = true;
    const printed = await EduV24.printReport(
        modal.querySelector('[data-workspace-action="print"]'),
      ),
      printRows = moduleRows(document.getElementById("printRoot"));
    check(
      "FROZEN03",
      "PDF print source preserves the same frozen module components and results",
      printed && JSON.stringify(printRows) === JSON.stringify(displayed),
      { printRows },
    );
    document.getElementById("printRoot")?.remove();
    const old = structuredClone(frozen);
    old.id = "frozen_result_only_legacy";
    for (const lesson of old.classes[0].students[0].lessons)
      for (const module of lesson.modules || []) delete module.inputs;
    snapshot.stores.reports.push(old);
    window.__frozenAuditStep = "restore old and new snapshots";
    await restore(snapshot);
    await EduV24.showFrozenReport(old.id);
    const oldRows = moduleRows(document.getElementById("modalBody"));
    check(
      "FROZEN04",
      "old result-only reports survive full-backup restore and display results without invented inputs",
      oldRows.length === 4 &&
        oldRows[0].final === "18.50" &&
        oldRows[1].final === "10.00" &&
        oldRows.every((row) => row.inputs.every((value) => value === "—")),
      { oldRows },
    );
    const roundTrip = await EduV24.snapshotInstallation();
    check(
      "FROZEN05",
      "full-backup round-trip preserves new raw inputs and leaves old reports result-only",
      JSON.stringify(
        roundTrip.stores.reports
          .find((report) => report.id === frozen.id)
          .classes[0].students[0].lessons.find(
            (lesson) => lesson.id === ids.lesson,
          )
          .modules.map((module) => module.inputs),
      ) === JSON.stringify(expectedInputs) &&
        roundTrip.stores.reports
          .find((report) => report.id === old.id)
          .classes[0].students[0].lessons.find(
            (lesson) => lesson.id === ids.lesson,
          )
          .modules.every((module) => !Object.hasOwn(module, "inputs")),
    );
    closeModal();
    window.__frozenAuditStep = "create second term";
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = year;
    document.getElementById("periodTerm").value = "دوم";
    await EduV24.test.createLegacyPeriod();
    const second = EduV24.getReportContext().id;
    db.schools[0].classes[0].lessons.find(
      (lesson) => lesson.id === dual.id,
    ).kardaneshScores[archived.id] = {
      midtermPractical: 18,
      midtermTheory: 18,
      practical: 20,
      theory: 20,
    };
    db.schools[0].classes[0].lessons.find(
      (lesson) => lesson.id === modular.id,
    ).poudmans[0].podScores[student.id] = { m: 5, c: 3 };
    await saveDB({
      action: "Synthetic annual progress and distinct archived term grades",
    });
    window.__frozenAuditStep = "open archived annual report";
    snapshot = await EduV24.snapshotInstallation();
    window.__frozenAuditStep = "restore protected first term";
    check(
      "FROZEN06",
      "later annual module updates cannot rewrite the frozen first-term inputs or results",
      JSON.stringify(
        snapshot.stores.reports.find((report) => report.id === frozen.id),
      ) ===
        JSON.stringify(
          roundTrip.stores.reports.find((report) => report.id === frozen.id),
        ),
    );
    closeModal();
    goSchool(ids.school);
    goClass(ids.classroom);
    setTab("students");
    document
      .querySelector(
        '.student-archive [data-workspace-action="archived-report"]',
      )
      .click();
    await wait(() =>
      document.querySelector("#karnamehTabOutput .karnameh-year-document"),
    );
    const archiveReport = document.getElementById("karnamehTabOutput"),
      archiveSheet = archiveReport.querySelector(".karnameh-student-sheet"),
      stageResults = [
        ...archiveReport.querySelectorAll(
          '.karnameh-assessment-table [data-karnameh-field="result"] .karnameh-sheet-value',
        ),
      ].map((cell) =>
        Number(
          cell.textContent
            .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
            .trim(),
        ),
      ),
      archiveModuleCells = [
        ...archiveReport.querySelectorAll(
          '.karnameh-modular-table :is([data-karnameh-field="continuous"], [data-karnameh-field="competency"], [data-karnameh-field="module-result"]) .karnameh-sheet-value',
        ),
      ].map((cell) => cell.textContent.trim());
    check(
      "FROZEN07",
      "actual archive button opens the common year-wide report with both stages of both terms",
      state.view === "reports" &&
        state.reportTab === "karnameh" &&
        document.getElementById("modal").classList.contains("hidden") &&
        JSON.stringify(stageResults) === JSON.stringify([10, 12, 18, 20]),
      { stageResults },
    );
    check(
      "FROZEN08",
      "archive report does not expose another student's annual module grades",
      archiveSheet?.dataset.studentId === archived.id &&
        archiveModuleCells.length === 12 &&
        archiveModuleCells.every((value) => value === "—") &&
        !archiveSheet.textContent.includes(student.name),
      { studentId: archiveSheet?.dataset.studentId, archiveModuleCells },
    );
    snapshot = await EduV24.snapshotInstallation();
    snapshot.stores.records.find(
      (row) => row.workspace === first && row.logical === "meta",
    ).value.settings.password = "synthetic-first-term-password";
    snapshot.activeWorkspace = second;
    await restore(snapshot);
    window.prompt = () => null;
    window.__frozenAuditStep = "cancel protected archive report";
    goSchool(ids.school);
    goClass(ids.classroom);
    setTab("students");
    document
      .querySelector(
        '.student-archive [data-workspace-action="archived-report"]',
      )
      .click();
    await wait(() =>
      document.querySelector('#karnamehTabOutput [role="alert"]'),
    );
    check(
      "FROZEN09",
      "archive route respects cancellation of access to the protected other term",
      !document.querySelector("#karnamehTabOutput .karnameh-year-document") &&
        document
          .getElementById("karnamehTabOutput")
          .textContent.includes("دسترسی به نوبت دیگر تأیید نشد"),
    );
    window.prompt = () => "synthetic-first-term-password";
    window.__frozenAuditStep = "authenticate protected archive report";
    render();
    await wait(() =>
      document.querySelector("#karnamehTabOutput .karnameh-year-document"),
    );
    check(
      "FROZEN10",
      "archive year-wide report remains available after correct other-term authentication",
      [
        ...document.querySelectorAll(
          '#karnamehTabOutput .karnameh-assessment-table [data-karnameh-field="result"] .karnameh-sheet-value',
        ),
      ]
        .map((cell) =>
          Number(
            cell.textContent
              .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
              .trim(),
          ),
        )
        .join(",") === "10,12,18,20",
    );
  } catch (error) {
    check(
      "FROZEN99",
      "frozen module and archived annual report flow completed",
      false,
      { error: error.stack || error.message },
    );
  } finally {
    if (previousPrintTest === undefined) delete window.__EDU_PRINT_TEST__;
    else window.__EDU_PRINT_TEST__ = previousPrintTest;
    document.getElementById("printRoot")?.remove();
    if (original) {
      window.prompt = () => null;
      state.view = "schools";
      window.__frozenAuditStep = "restore original installation";
      try {
        await restore(original);
      } catch (error) {
        check("FROZEN98", "synthetic starting installation restored", false, {
          error: error.stack || error.message,
        });
      }
    }
    window.prompt = previousPrompt;
  }
  return cases;
}

async function run({ cdp, evaluate, cases, delay }) {
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  try {
    cases.push(
      ...(await evaluate("(" + frozenModularReports.toString() + ")()")),
    );
  } catch (error) {
    try {
      await cdp("Page.handleJavaScriptDialog", { accept: false });
    } catch {}
    const observed = await evaluate(
      "({step:window.__frozenAuditStep,cases:window.__frozenAuditCases,context:EduV24.getReportContext(),modal:document.getElementById('modalBody')?.textContent,app:document.getElementById('app')?.textContent?.slice(0,1500)})",
    );
    cases.push({
      id: "FROZEN_TIMEOUT",
      name: "frozen module browser probe completed",
      pass: false,
      observed: { error: error.message, ...observed },
    });
  }
}

module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "frozen-modular-and-archived-year-reports", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
