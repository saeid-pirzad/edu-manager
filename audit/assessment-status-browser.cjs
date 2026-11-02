"use strict";

// Actual delegated inputs and IndexedDB, with synthetic records only. The shared
// integrity runner provides an isolated profile; restore its initial installation.
async function assessmentStatusFlow() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    ids = {
      first: "assessment_status_first",
      second: "assessment_status_second",
      school: "assessment_status_school",
      classroom: "assessment_status_class",
      lesson: "assessment_status_lesson",
      student: "assessment_status_student",
    },
    year = "1486-1487",
    previousConfirm = window.confirm,
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw Error(
        "Assessment status UI timeout: " +
          EduV24.test.getState().status.message,
      );
    },
    restore = async (snapshot) => {
      closeModal();
      EduV24.previewFullBackup(snapshot);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
      await EduV24.test.settle();
    },
    storedGrades = (period) =>
      new Promise((resolve, reject) => {
        const request = EduV24.test
          .getConnection()
          .transaction("records")
          .objectStore("records")
          .get(period + "|class:" + ids.classroom);
        request.onsuccess = () =>
          resolve(request.result.value.lessons[0].kardaneshScores[ids.student]);
        request.onerror = () => reject(request.error);
      }),
    enter = (input, value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    field = (name) =>
      document.querySelector(
        '#app [data-assessment-context][data-student="' +
          ids.student +
          '"][data-field="' +
          name +
          '"]',
      ),
    note = (input) => input.parentElement.querySelector(".grade-note");
  let original;
  try {
    window.__assessmentStatusCases = cases;
    window.__assessmentStatusStep = "snapshot initial installation";
    closeModal();
    await EduV24.test.settle();
    original = await EduV24.snapshotInstallation();
    const fixture = structuredClone(original);
    fixture.activeWorkspace = ids.first;
    fixture.gradeDrafts = [];
    fixture.reportDrafts = { [ids.first]: {}, [ids.second]: {} };
    fixture.stores = {
      catalog: [],
      records: [],
      reports: [],
      events: [],
      undo: [],
      backups: [],
    };
    for (const [id, term, kind] of [
      [ids.first, "اول", "first"],
      [ids.second, "دوم", "second"],
    ]) {
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
              name: "Synthetic assessment school",
              classes: [
                {
                  id: ids.classroom,
                  name: "Synthetic assessment class",
                  students: [
                    { id: ids.student, name: "Synthetic assessment student" },
                  ],
                  archivedStudents: [],
                  lessons: [
                    {
                      id: ids.lesson,
                      name: "Synthetic assessment course",
                      gradeMode: "kardanesh",
                      gradingPolicy: EduPolicy.defaults("dual", year),
                      kardaneshScores: {
                        [ids.student]: {
                          midtermPractical: 10,
                          midtermTheory: 11,
                          practical: kind === "first" ? 12 : 13,
                          theory: kind === "first" ? 14 : 15,
                        },
                      },
                      poudmans: [],
                    },
                  ],
                },
              ],
            },
          ],
          sessions: [],
          masterSchedule: {},
          migrationWarnings: [],
        }),
        { schools, ...meta } = data;
      delete meta.sessions;
      meta.layout = [
        { id: ids.school, name: schools[0].name, classes: [ids.classroom] },
      ];
      fixture.stores.catalog.push({
        id,
        year,
        term,
        termKind: kind,
        revision: 1,
        closed: false,
        createdAt: "2026-11-02T00:00:00Z",
        updatedAt: "2026-11-02T00:00:00Z",
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
    window.confirm = () => true;
    window.__assessmentStatusStep = "restore synthetic first and second terms";
    await restore(fixture);
    goSchool(ids.school);
    goClass(ids.classroom);
    goLesson(ids.lesson);
    setTab("grades");
    for (const [index, period, term] of [
      [0, ids.first, "اول"],
      [1, ids.second, "دوم"],
    ]) {
      const prefix = "ASSESSSTATE" + index,
        sourceBefore = JSON.stringify(db);
      window.__assessmentStatusStep = "select " + period;
      document
        .querySelector(
          '#app [data-workspace-action="assessment-stage"][data-term="' +
            term +
            '"][data-stage="final"]',
        )
        .click();
      await wait(
        () =>
          field("theory") &&
          document.querySelector(
            '#app [data-term="' +
              term +
              '"][data-stage="final"][aria-pressed="true"]',
          ),
      );
      const practical = field("practical"),
        theory = field("theory"),
        row = theory.closest(".assessment-student"),
        before = await storedGrades(period);
      check(
        prefix + "A",
        "actual " +
          term +
          " stage selection leaves the active workspace unchanged",
        EduV24.getReportContext().id === ids.first &&
          JSON.stringify(db) === sourceBefore,
      );
      window.__assessmentStatusStep = "mixed invalid and zero " + period;
      enter(theory, "99");
      enter(practical, "0");
      await EduV24.flushDrafts();
      const mixed = await storedGrades(period);
      check(
        prefix + "B",
        "valid zero commits while the other assessment grade remains visibly invalid and unmodified",
        mixed.practical === 0 &&
          mixed.theory === before.theory &&
          EduV24.getReportContext().pendingDrafts === 1 &&
          theory.getAttribute("aria-invalid") === "true" &&
          note(theory).dataset.state === "error" &&
          /صفر و بیست/.test(note(theory).textContent) &&
          note(practical).dataset.state === "saved" &&
          row.dataset.editState === "error",
        { mixed, error: note(theory).textContent },
      );
      let reportError = "";
      try {
        await EduV24.prepareReportSnapshot();
      } catch (error) {
        reportError = error.message;
      }
      check(
        prefix + "C",
        "an invalid selected-assessment draft blocks report generation",
        !!reportError && EduV24.getReportContext().pendingDrafts === 1,
        { reportError },
      );
      enter(theory, "16");
      await EduV24.flushDrafts({ strict: true });
      check(
        prefix + "D",
        "correcting the invalid grade saves it and resets its error and pending states",
        (await storedGrades(period)).theory === 16 &&
          EduV24.getReportContext().pendingDrafts === 0 &&
          theory.getAttribute("aria-invalid") === "false" &&
          note(theory).dataset.state === "saved" &&
          row.dataset.editState === "saved",
      );
      window.__assessmentStatusStep =
        "clear while another grade invalid " + period;
      enter(practical, "99");
      theory.parentElement.querySelector("[data-clear-grade]").click();
      await EduV24.flushDrafts();
      const cleared = await storedGrades(period);
      check(
        prefix + "E",
        "clearing a paired grade preserves the remaining error and never invents a zero",
        !Object.hasOwn(cleared, "theory") &&
          cleared.practical === 0 &&
          EduV24.getReportContext().pendingDrafts === 1 &&
          theory.value === "" &&
          theory.getAttribute("aria-invalid") === "false" &&
          note(theory).dataset.state === "idle" &&
          note(practical).dataset.state === "error" &&
          row.dataset.editState === "error",
        { cleared },
      );
      enter(practical, "18");
      enter(theory, "17");
      await EduV24.flushDrafts({ strict: true });
      const completed = await storedGrades(period);
      check(
        prefix + "F",
        "repaired assessment saves both raw components without redirecting the active workspace",
        completed.practical === 18 &&
          completed.theory === 17 &&
          EduV24.getReportContext().id === ids.first &&
          EduV24.getReportContext().pendingDrafts === 0 &&
          row.dataset.editState === "saved" &&
          (index === 0 || JSON.stringify(db) === sourceBefore),
        { completed },
      );
    }
  } catch (error) {
    check("ASSESSSTATE99", "assessment state browser flow completed", false, {
      error: error.stack || error.message,
    });
  } finally {
    if (original) {
      state.view = "schools";
      window.__assessmentStatusStep = "restore starting installation";
      try {
        await restore(original);
        const initial = original.stores.catalog.find(
          (period) => period.id === original.activeWorkspace,
        );
        check(
          "ASSESSSTATE_RESTORE",
          "synthetic browser test restores the initial installation and active academic year",
          EduV24.getReportContext().id === original.activeWorkspace &&
            EduV24.getReportContext().year === initial.year,
        );
      } catch (error) {
        check("ASSESSSTATE98", "initial installation restored", false, {
          error: error.stack || error.message,
        });
      }
    }
    window.confirm = previousConfirm;
  }
  return cases;
}

async function run({ cdp, evaluate, cases, delay }) {
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  cases.push(
    ...(await evaluate("(" + assessmentStatusFlow.toString() + ")()")),
  );
}

module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "assessment-pending-error-save-status", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
