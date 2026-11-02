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
      old: "year_editor_old_first",
      school: "year_editor_school",
      classroom: "year_editor_class",
      lesson: "year_editor_lesson",
      student: "year_editor_student",
    },
    oldYear = "1461-1462",
    newYear = "1462-1463",
    futureYear = "1463-1464",
    wait = async (predicate) => {
      for (let n = 0; n < 250; n++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Year editor timed out: " +
          (document.getElementById("academicYearError")?.textContent ||
            EduV24.test.getState().status?.message ||
            ""),
      );
    },
    openYear = async () => {
      closeModal();
      const button = document.querySelector(
        '#app [data-workspace-action="periods"]',
      );
      for (
        let parent = button.parentElement;
        parent;
        parent = parent.parentElement
      )
        if (parent.tagName === "DETAILS") parent.open = true;
      button.click();
      await wait(
        () =>
          !!document.querySelector("#modal:not(.hidden) .academic-year-hub"),
      );
    },
    submit = async (value) => {
      const input = document.getElementById("newAcademicYear"),
        form = input.form;
      form.closest("details").open = true;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      form.requestSubmit();
      await wait(
        () =>
          (!form.isConnected || form.getAttribute("aria-busy") !== "true") &&
          (!!document.getElementById("academicYearError")?.textContent ||
            document.getElementById("modal").classList.contains("hidden")),
      );
      await EduV24.test.settle();
    };
  const original = await EduV24.snapshotInstallation(),
    fixture = structuredClone(original),
    data = EduV24.normalizeDB({
      ...defaultDB(),
      settings: {
        ...db.settings,
        academicYear: oldYear,
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
                    ...EduPolicy.defaults("dual", oldYear),
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
          date: EduAcademicYear.range(oldYear).start,
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
  for (const name of Object.keys(fixture.stores)) fixture.stores[name] = [];
  fixture.activeWorkspace = ids.old;
  fixture.reportDrafts = {};
  fixture.gradeDrafts = [];
  fixture.snapshotNotes = [];
  meta.layout = schools.map((school) => ({
    id: school.id,
    name: school.name,
    classes: school.classes.map((c) => c.id),
  }));
  fixture.stores.catalog.push({
    id: ids.old,
    year: oldYear,
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
      key: ids.old + "|" + logical,
      workspace: ids.old,
      logical,
      value,
    });
  closeModal();
  EduV24.previewFullBackup(fixture);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  await EduV24.test.settle();
  const before = await EduV24.snapshotInstallation(),
    oldRecords = JSON.stringify(
      before.stores.records.filter((row) => row.workspace === ids.old),
    );
  await openYear();
  check(
    "01",
    "the actual year navigation opens the year hub and empty-year creation form",
    document
      .querySelector(".academic-year-hub")
      ?.textContent.includes("سال فعال") &&
      !!document.querySelector(
        'form[data-workspace-submit="create-academic-year"]',
      ),
  );
  await submit("۱۴۶۲–۱۴۶۳");
  const createdId = EduV24.getReportContext().id,
    after = await EduV24.snapshotInstallation();
  check(
    "02",
    "creating a new year starts with an empty school, roster, course, schedule and session directory",
    EduV24.getReportContext().year === newYear &&
      createdId !== ids.old &&
      db.schools.length === 0 &&
      db.sessions.length === 0 &&
      Object.keys(db.masterSchedule).length === 0 &&
      after.stores.records.filter((row) => row.workspace === createdId)
        .length === 1,
  );
  check(
    "03",
    "new-year creation retains every prior-year class, grade and attendance record exactly",
    JSON.stringify(
      after.stores.records.filter((row) => row.workspace === ids.old),
    ) === oldRecords && after.stores.catalog.some((row) => row.id === ids.old),
  );
  await openYear();
  const beforeDuplicate = JSON.stringify(
    (await EduV24.snapshotInstallation()).stores,
  );
  await submit(newYear);
  check(
    "04",
    "the actual form rejects an existing year without adding or modifying records",
    /قبلاً/.test(document.getElementById("academicYearError").textContent) &&
      JSON.stringify((await EduV24.snapshotInstallation()).stores) ===
        beforeDuplicate,
  );
  closeModal();
  await openYear();
  const connection = EduV24.test.getConnection(),
    other = await new Promise((resolve, reject) => {
      const request = indexedDB.open(connection.name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }),
    originalTransaction = connection.transaction;
  let injected = false,
    peerDone = Promise.resolve();
  try {
    connection.transaction = function (names, mode, ...rest) {
      if (
        !injected &&
        mode === "readwrite" &&
        Array.isArray(names) &&
        names.includes("catalog") &&
        names.includes("records")
      ) {
        injected = true;
        const peerData = EduV24.normalizeDB({
            ...defaultDB(),
            settings: {
              ...db.settings,
              academicYear: futureYear,
              academicTerm: "اول",
              password: "",
            },
          }),
          peerMeta = { ...peerData };
        delete peerMeta.schools;
        delete peerMeta.sessions;
        peerMeta.layout = [];
        const tx = other.transaction(["catalog", "records"], "readwrite");
        peerDone = new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        tx.objectStore("catalog").put({
          id: "year_editor_concurrent",
          year: futureYear,
          term: "اول",
          termKind: "first",
          closed: false,
          revision: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        tx.objectStore("records").put({
          key: "year_editor_concurrent|meta",
          workspace: "year_editor_concurrent",
          logical: "meta",
          value: peerMeta,
        });
      }
      return originalTransaction.call(this, names, mode, ...rest);
    };
    await submit(futureYear);
    await peerDone;
  } finally {
    connection.transaction = originalTransaction;
    other.close();
  }
  const raced = await EduV24.snapshotInstallation();
  check(
    "05",
    "a concurrent real IndexedDB year insertion is rejected atomically after form preflight",
    injected &&
      raced.stores.catalog.filter((row) => row.year === futureYear).length ===
        1 &&
      raced.stores.catalog.some((row) => row.id === "year_editor_concurrent") &&
      EduV24.getReportContext().id === createdId &&
      /پنجره/.test(document.getElementById("academicYearError").textContent),
  );
  closeModal();
  return {
    cases,
    info: { ids, oldYear, newYear, futureYear, createdId, oldRecords },
  };
}
async function afterReload(info) {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id: "YEAR_EDITOR_" + id, name, pass: !!pass, observed }),
    { ids, oldYear, newYear, createdId, oldRecords } = info,
    wait = async (predicate) => {
      for (let n = 0; n < 250; n++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Year stage editor timed out: " +
          EduV24.test.getState().status?.message,
      );
    },
    openYear = async () => {
      closeModal();
      const button = document.querySelector(
        '#app [data-workspace-action="periods"]',
      );
      for (
        let parent = button.parentElement;
        parent;
        parent = parent.parentElement
      )
        if (parent.tagName === "DETAILS") parent.open = true;
      button.click();
      await wait(
        () =>
          !!document.querySelector("#modal:not(.hidden) .academic-year-hub"),
      );
    };
  check(
    "06",
    "the selected year anchor survives reload even when a newer year was concurrently added",
    EduV24.getReportContext().year === newYear &&
      EduV24.getReportContext().id === createdId &&
      db.schools.length === 0,
  );
  await openYear();
  document
    .querySelector(
      '[data-workspace-action="open-academic-year"][data-key="' +
        ids.old +
        '"]',
    )
    .click();
  await wait(
    () =>
      EduV24.getReportContext().id === ids.old &&
      EduV24.getReportContext().ready &&
      document.getElementById("modal").classList.contains("hidden"),
  );
  let saved = await EduV24.snapshotInstallation();
  check(
    "07",
    "opening a stored year through its real UI returns the original school and exact historical records",
    EduV24.getReportContext().year === oldYear &&
      db.schools[0].id === ids.school &&
      JSON.stringify(
        saved.stores.records.filter((row) => row.workspace === ids.old),
      ) === oldRecords,
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
  saved = await EduV24.snapshotInstallation();
  const second = saved.stores.catalog.find(
    (row) => row.year === oldYear && row.termKind === "second",
  );
  check(
    "08",
    "selecting an uncreated second-term assessment creates its storage without switching the global year context",
    !!second &&
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
        row.workspace === ids.old && row.logical === "class:" + ids.classroom,
    ).value,
    secondClass = saved.stores.records.find(
      (row) =>
        row.workspace === second.id && row.logical === "class:" + ids.classroom,
    ).value;
  check(
    "09",
    "a grade in the selected assessment persists in its own term without replacing the active context or first-term grade",
    EduV24.getReportContext().id === origin.id &&
      firstClass.lessons[0].kardaneshScores[ids.student].midtermPractical ===
        16 &&
      secondClass.lessons[0].kardaneshScores[ids.student].midtermPractical ===
        19,
  );
  const files = [],
    oldDownload = downloadLocalFile;
  try {
    downloadLocalFile = (blob) => {
      files.push(blob);
    };
    await EduV24.exportFullBackup();
  } finally {
    downloadLocalFile = oldDownload;
  }
  const exported = JSON.parse(await files[0].text()),
    decoded = EduV24.validateFullBackup(exported);
  check(
    "10",
    "the actual complete backup retains both old assessment terms and all newly created years",
    decoded.length === 4 &&
      decoded.filter((part) => part.period.year === oldYear).length === 2 &&
      decoded.some(
        (part) =>
          part.period.year === newYear && part.data.schools.length === 0,
      ) &&
      decoded.some((part) => part.period.id === "year_editor_concurrent") &&
      exported.stores.records.some(
        (row) =>
          row.workspace === ids.old &&
          row.logical === "session:year_editor_history",
      ),
  );
  const closed = await EduV24.snapshotInstallation();
  closed.stores.catalog.find((row) => row.id === ids.old).closed = true;
  closed.activeWorkspace = ids.old;
  closeModal();
  EduV24.previewFullBackup(closed);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  await EduV24.test.settle();
  await openYear();
  const continuation = [
    ...document.querySelectorAll(
      '[data-workspace-action="open-academic-year"]',
    ),
  ].find((button) => button.textContent.includes("ادامهٔ ثبت روزانه"));
  const preservedUntilClick = EduV24.getReportContext().id === ids.old;
  if (continuation) {
    continuation.click();
    await wait(
      () =>
        EduV24.getReportContext().id === second.id &&
        EduV24.getReportContext().ready,
    );
  }
  check(
    "11",
    "closed-term restoration preserves active identity and explicit continuation opens the existing writable term of the same year",
    preservedUntilClick &&
      !!continuation &&
      EduV24.getReportContext().id === second.id &&
      EduV24.getReportContext().year === oldYear &&
      !EduV24.getReportContext().closed &&
      (await EduV24.snapshotInstallation()).stores.catalog.filter(
        (row) => row.year === oldYear,
      ).length === 2,
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
    .main({ stage: "year-editor-ui", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
