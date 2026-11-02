"use strict";

// Node-side wrapper: navigation is polled outside the browser execution
// context. All writes target the enclosing runner's synthetic Edge profile.
async function prepareSingleYearFixture() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    ids = {
      first: "single_year_first",
      old: "single_year_old",
      future: "single_year_future",
      summer: "single_year_summer",
      school: "single_year_school",
      classroom: "single_year_class",
      student: "single_year_student",
      lesson: "single_year_lesson",
    },
    year = "1490-1491",
    oldYear = "1489-1490",
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Single-year UI timed out: " +
          (document.getElementById("operationError")?.textContent ||
            EduV24.test.getState().status.message),
      );
    },
    hub = () => document.querySelector(".period-hub"),
    restore = async (snapshot) => {
      closeModal();
      EduV24.previewFullBackup(snapshot);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
      await EduV24.test.settle();
    };
  let original = null;
  try {
    closeModal();
    await EduV24.test.settle();
    original = await EduV24.snapshotInstallation();
    const fixture = structuredClone(original);
    fixture.activeWorkspace = ids.first;
    fixture.gradeDrafts = [];
    fixture.snapshotNotes = [];
    for (const [id, targetYear, term, kind] of [
      [ids.first, year, "اول", "first"],
      [ids.old, oldYear, "اول", "first"],
      [ids.summer, oldYear, "تابستان", "summer"],
      [ids.future, "1491-1492", "اول", "first"],
    ]) {
      const data = EduV24.normalizeDB({
          schemaVersion: 26,
          settings: {
            ...db.settings,
            password: "",
            academicYear: targetYear,
            academicTerm: term,
          },
          schools: [
            {
              id: ids.school,
              name: "مدرسهٔ آزمایشی سال واحد",
              classes: [
                {
                  id: ids.classroom,
                  name: "کلاس آزمایشی سال واحد",
                  students: [
                    { id: ids.student, name: "هنرجوی آزمایشی", code: "001" },
                  ],
                  archivedStudents: [],
                  lessons: [
                    {
                      id: ids.lesson,
                      name: "درس آزمایشی نوبت‌ها",
                      gradeMode: "kardanesh",
                      gradingPolicy: EduPolicy.defaults("dual", targetYear),
                      kardaneshScores: {
                        [ids.student]: {
                          midtermPractical: 18,
                          midtermTheory: 16,
                          practical: 19,
                          theory: 17,
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
        { schools, sessions, ...meta } = data;
      fixture.stores.catalog.push({
        id,
        year: targetYear,
        term,
        termKind: kind,
        revision: 1,
        closed: false,
        createdAt:
          id === ids.old ? "2099-01-01T00:00:00Z" : "2026-11-02T00:00:00Z",
        updatedAt: "2026-11-02T00:00:00Z",
      });
      meta.layout = [
        { id: ids.school, name: schools[0].name, classes: [ids.classroom] },
      ];
      for (const [logical, value] of [
        ["meta", meta],
        ["class:" + ids.classroom, schools[0].classes[0]],
        ...sessions.map((session) => ["session:" + session.id, session]),
      ])
        fixture.stores.records.push({
          key: id + "|" + logical,
          workspace: id,
          logical,
          value,
        });
      fixture.reportDrafts[id] = {};
    }
    await restore(fixture);
    check(
      "SINGLE_YEAR01",
      "restoring a legacy multiyear file anchors its explicit active year without deleting unrelated records",
      localStorage.getItem("Edu24.academicYear") === year &&
        EduV24.getReportContext().id === ids.first &&
        (await EduV24.snapshotInstallation()).stores.catalog.some(
          (period) => period.id === ids.summer,
        ),
    );
    await EduV24.openPeriods();
    const initialHub = hub();
    check(
      "SINGLE_YEAR02",
      "the real term hub has exactly two fixed slots and no independent year, rename or delete controls",
      initialHub.querySelectorAll("tbody tr").length === 2 &&
        initialHub.textContent.includes("ترم اول") &&
        initialHub.textContent.includes("ترم دوم") &&
        !initialHub.querySelector(
          '[data-workspace-action="new-period"],[data-workspace-action="delete-period"],[data-workspace-action="edit-period-label"],#periodYear,#periodTerm',
        ) &&
        !initialHub.textContent.includes(oldYear) &&
        !initialHub.textContent.includes("1491-1492"),
    );
    let earlyStartError = "";
    try {
      await EduV24.openNewPeriod(ids.first);
    } catch (error) {
      earlyStartError = error.message;
    }
    check(
      "SINGLE_YEAR03",
      "a second term cannot start while the first term is still open",
      !!earlyStartError &&
        EduV24.getReportContext().id === ids.first &&
        !(await EduV24.snapshotInstallation()).stores.catalog.some(
          (period) => period.year === year && period.termKind === "second",
        ),
    );
    closeModal();
    await EduV24.finalizePeriod();
    check(
      "SINGLE_YEAR04",
      "closing the complete first term retains its identity and enables only its own second-term start",
      EduV24.getReportContext().id === ids.first &&
        EduV24.getReportContext().closed,
    );
    await EduV24.openPeriods();
    const start = hub().querySelector(
      '[data-workspace-action="new-second-period"]',
    );
    if (!start)
      throw Error("The closed first term did not expose second-term start");
    check(
      "SINGLE_YEAR05",
      "the second-term start action is bound to the sole first term of the current year",
      start.dataset.key === ids.first &&
        hub().querySelectorAll('[data-workspace-action="new-second-period"]')
          .length === 1,
    );
    start.click();
    await wait(() =>
      document.querySelector("#modal:not(.hidden) #secondTermStart"),
    );
    check(
      "SINGLE_YEAR06",
      "the second-term confirmation has fixed context and no year or term selectors",
      document.getElementById("secondTermStart").textContent.includes(year) &&
        !document.querySelector("#periodYear,#periodTerm"),
    );
    // Legacy fields injected into the DOM cannot redirect the approved dialog.
    const injectedYear = document.createElement("input"),
      injectedTerm = document.createElement("input");
    injectedYear.id = "periodYear";
    injectedYear.value = "1498-1499";
    injectedTerm.id = "periodTerm";
    injectedTerm.value = "اول";
    document
      .getElementById("secondTermStart")
      .append(injectedYear, injectedTerm);
    document.querySelector('[data-workspace-action="create-period"]').click();
    await wait(
      () =>
        EduV24.getReportContext().id !== ids.first &&
        EduV24.getReportContext().ready &&
        !document.querySelector("#modal:not(.hidden) #secondTermStart"),
    );
    await EduV24.test.settle();
    const second = EduV24.getReportContext().id,
      afterStart = await EduV24.snapshotInstallation();
    check(
      "SINGLE_YEAR07",
      "starting from the real confirmation ignores unrelated legacy fields and creates only the same year's second term",
      EduV24.getReportContext().year === year &&
        afterStart.stores.catalog.find((period) => period.id === second)
          .termKind === "second" &&
        !afterStart.stores.catalog.some(
          (period) => period.year === "1498-1499",
        ) &&
        afterStart.stores.catalog.filter((period) => period.year === year)
          .length === 2,
    );
    check(
      "SINGLE_YEAR08",
      "term-specific grades start empty while the shared annual school and student identities continue",
      db.schools[0].id === ids.school &&
        db.schools[0].classes[0].students[0].id === ids.student &&
        Object.keys(db.schools[0].classes[0].lessons[0].kardaneshScores)
          .length === 0 &&
        db.sessions.length === 0,
    );
    localStorage.setItem("Edu24.academicYear", oldYear);
    await restore(afterStart);
    check(
      "SINGLE_YEAR09",
      "full restoration re-anchors to the file's active year after preference cleanup, not the overwritten installation",
      localStorage.getItem("Edu24.academicYear") === year &&
        EduV24.getReportContext().id === second,
    );
    const preserved = await EduV24.snapshotInstallation(),
      otherRecords = JSON.stringify(
        preserved.stores.records.filter((row) =>
          [ids.old, ids.future, ids.summer].includes(row.workspace),
        ),
      );
    // Deliberately stale tab preferences simulate another tab's remembered
    // legacy year. The installation anchor must win on the following reload.
    localStorage.setItem("Edu24.activePeriod", ids.old);
    sessionStorage.setItem("Edu24.activePeriod", ids.old);
    return { cases, original, expected: { year, second, ids, otherRecords } };
  } catch (error) {
    check(
      "SINGLE_YEAR99",
      "single-year real UI setup and transition complete",
      false,
      { error: error.stack || error.message },
    );
    return { cases, original };
  }
}

async function checkSingleYearReload(expected) {
  const cases = [],
    check = (id, name, pass) => cases.push({ id, name, pass: !!pass }),
    context = EduV24.getReportContext(),
    snapshot = await EduV24.snapshotInstallation();
  check(
    "SINGLE_YEAR10",
    "a real page reload ignores stale unrelated-year tab preferences and reopens the anchored second term",
    context.year === expected.year &&
      context.id === expected.second &&
      localStorage.getItem("Edu24.academicYear") === expected.year,
  );
  await EduV24.openPeriods();
  const panel = document.querySelector(".period-hub");
  check(
    "SINGLE_YEAR11",
    "after reload the actual hub still exposes only first and second slots of the anchored year",
    panel.querySelectorAll("tbody tr").length === 2 &&
      [
        ...panel.querySelectorAll('[data-workspace-action="switch-period"]'),
      ].every((button) =>
        [expected.ids.first, expected.second].includes(button.dataset.key),
      ),
  );
  check(
    "SINGLE_YEAR12",
    "all unrelated-year and summer records survive restore and reload byte-for-byte in full backup data",
    JSON.stringify(
      snapshot.stores.records.filter((row) =>
        [expected.ids.old, expected.ids.future, expected.ids.summer].includes(
          row.workspace,
        ),
      ),
    ) === expected.otherRecords,
  );
  closeModal();
  return cases;
}

async function simulateInterruptedYearCleanup(expected) {
  const database = EduV24.test.getConnection(),
    marker = await new Promise((resolve, reject) => {
      const tx = database.transaction("records", "readwrite"),
        store = tx.objectStore("records"),
        request = store.get("@installation-reset");
      let saved;
      tx.oncomplete = () => resolve(saved);
      tx.onabort = tx.onerror = () =>
        reject(tx.error || Error("Synthetic cleanup marker write failed"));
      request.onsuccess = () => {
        saved = structuredClone(request.result);
        saved.value.phase = "cleanup";
        store.put(saved);
      };
    });
  localStorage.removeItem("Edu24.academicYear");
  localStorage.setItem("Edu24.activePeriod", expected.ids.old);
  sessionStorage.setItem("Edu24.activePeriod", expected.ids.old);
  return [
    {
      id: "SINGLE_YEAR13",
      name: "the actual committed installation marker durably retains the restored active year and term identity",
      pass:
        marker.value.academicYear === expected.year &&
        marker.value.activeWorkspace === expected.second,
    },
  ];
}

async function checkInterruptedYearCleanup(expected) {
  const cases = [],
    context = EduV24.getReportContext(),
    marker = await new Promise((resolve, reject) => {
      const request = EduV24.test
        .getConnection()
        .transaction("records", "readonly")
        .objectStore("records")
        .get("@installation-reset");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  cases.push({
    id: "SINGLE_YEAR14",
    name: "reload resumes interrupted cleanup and recovers the durable restored year instead of a newer unrelated year",
    pass:
      marker.value.phase === "complete" &&
      context.year === expected.year &&
      context.id === expected.second &&
      localStorage.getItem("Edu24.academicYear") === expected.year,
  });
  await EduV24.openPeriods();
  document
    .querySelector(
      '[data-workspace-action="switch-period"][data-key="' +
        expected.ids.first +
        '"]',
    )
    .click();
  for (let attempt = 0; attempt < 200; attempt++) {
    if (
      EduV24.getReportContext().id === expected.ids.first &&
      EduV24.getReportContext().ready
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  closeModal();
  return cases;
}

module.exports = async function run({
  cdp,
  evaluate,
  cases,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const prepared = await evaluate(
    "(" + prepareSingleYearFixture.toString() + ")()",
  );
  cases.push(...prepared.cases);
  const reload = () =>
    require("../browser-ready.cjs")({ cdp, evaluate, delay });
  try {
    if (!prepared.expected) return;
    await reload();
    cases.push(
      ...(await evaluate(
        "(" +
          checkSingleYearReload.toString() +
          ")(" +
          JSON.stringify(prepared.expected) +
          ")",
      )),
    );
    cases.push(
      ...(await evaluate(
        "(" +
          simulateInterruptedYearCleanup.toString() +
          ")(" +
          JSON.stringify(prepared.expected) +
          ")",
      )),
    );
    await reload();
    cases.push(
      ...(await evaluate(
        "(" +
          checkInterruptedYearCleanup.toString() +
          ")(" +
          JSON.stringify(prepared.expected) +
          ")",
      )),
    );
    await reload();
    const finalContext = await evaluate("EduV24.getReportContext()");
    cases.push({
      id: "SINGLE_YEAR15",
      name: "a later explicit first-term choice survives reload and is not overridden by the older restore marker",
      pass:
        finalContext.id === prepared.expected.ids.first &&
        finalContext.year === prepared.expected.year,
    });
  } catch (error) {
    cases.push({
      id: "SINGLE_YEAR_RELOAD",
      name: "the real browser reload preserves the selected single academic year",
      pass: false,
      observed: { error: error.stack || error.message },
    });
  } finally {
    if (prepared.original)
      try {
        await evaluate(
          "(async (original) => { closeModal(); EduV24.previewFullBackup(original); document.getElementById('fullRestoreConfirmed').checked = true; await EduV24.restoreFullBackup(); closeModal(); }) (" +
            JSON.stringify(prepared.original) +
            ")",
        );
      } catch (error) {
        cases.push({
          id: "SINGLE_YEAR_CLEANUP",
          name: "the isolated single-year fixture restores its starting installation",
          pass: false,
          observed: { error: error.stack || error.message },
        });
      }
  }
};
