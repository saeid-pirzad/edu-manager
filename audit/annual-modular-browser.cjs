"use strict";

const { main } = require("./data-integrity.cjs");

// Runs only inside data-integrity's isolated, synthetic browser profile.
async function annualModularFlow() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    previous = EduV24.getReportContext().id,
    year = "1430-1431",
    nextYear = "1431-1432",
    ids = {
      school: "annual_modular_school",
      classroom: "annual_modular_class",
      student: "annual_modular_student",
      modular: "annual_modular_lesson",
      dual: "annual_dual_lesson",
      firstModule: "annual_modular_pod_one",
      secondModule: "annual_modular_pod_two",
    },
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 160; attempt++) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw Error(
        "Annual modular UI timeout: " +
          (document.getElementById("operationError")?.textContent || ""),
      );
    },
    sourceClass = (snapshot, workspaceId) =>
      snapshot.stores.records.find(
        (row) =>
          row.workspace === workspaceId &&
          row.logical === "class:" + ids.classroom,
      )?.value,
    sourceLesson = (snapshot, workspaceId, lessonId) =>
      sourceClass(snapshot, workspaceId)?.lessons.find(
        (lesson) => lesson.id === lessonId,
      ),
    sameGrades = (actual, expected) =>
      Object.entries(expected).every(
        ([field, value]) => actual?.[field] === value,
      ),
    score = (snapshot, workspaceId, moduleId) =>
      sourceLesson(snapshot, workspaceId, ids.modular)?.poudmans.find(
        (pod) => pod.id === moduleId,
      )?.podScores[ids.student],
    moduleInput = (moduleId, field) =>
      document.querySelector(
        '[data-grade="1"][data-kind="pod"][data-pod="' +
          moduleId +
          '"][data-student="' +
          ids.student +
          '"][data-field="' +
          field +
          '"]',
      ),
    openGradebook = async () => {
      closeModal();
      goSchool(ids.school);
      goClass(ids.classroom);
      goLesson(ids.modular);
      setTab("grades");
      await wait(() => moduleInput(ids.secondModule, "m"));
      const picker = document.querySelector("[data-module-picker]");
      picker.value = ids.secondModule;
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    };
  try {
    closeModal();
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = year;
    document.getElementById("periodTerm").value = "اول";
    await EduV24.test.createLegacyPeriod();
    const first = EduV24.getReportContext().id,
      policy = (method) => ({
        ...EduPolicy.defaults(method, year),
        confirmed: true,
        code: method === "modular" ? "ANNUAL-M" : "ANNUAL-D",
      }),
      firstDual = {
        midtermPractical: 18,
        midtermTheory: 12,
        practical: 18,
        theory: 12,
      };
    Object.assign(
      db,
      EduV24.normalizeDB({
        ...db,
        settings: { ...db.settings, password: "" },
        sessions: [],
        masterSchedule: {},
        schools: [
          {
            id: ids.school,
            name: "مدرسهٔ آزمایشی پودمان سالانه",
            classes: [
              {
                id: ids.classroom,
                name: "کلاس آزمایشی پودمان سالانه",
                students: [
                  { id: ids.student, name: "هنرجوی آزمایشی", code: "A001" },
                ],
                archivedStudents: [],
                lessons: [
                  {
                    id: ids.modular,
                    name: "درس پودمانی سالانه",
                    gradeMode: "standard",
                    gradingPolicy: policy("modular"),
                    kardaneshScores: {},
                    poudmans: [
                      {
                        id: ids.firstModule,
                        name: "پودمان طراحی",
                        units: [
                          {
                            id: "annual_module_unit_one",
                            name: "واحد طراحی",
                            unitScores: {},
                          },
                        ],
                        podScores: { [ids.student]: { m: 0, c: 3 } },
                      },
                      {
                        id: ids.secondModule,
                        name: "پودمان اجرا",
                        units: [
                          {
                            id: "annual_module_unit_two",
                            name: "واحد اجرا",
                            unitScores: {},
                          },
                        ],
                        podScores: {},
                      },
                    ],
                  },
                  {
                    id: ids.dual,
                    name: "درس عملی و نظری نوبتی",
                    gradeMode: "kardanesh",
                    gradingPolicy: policy("dual"),
                    kardaneshScores: { [ids.student]: firstDual },
                    poudmans: [],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    await saveDB({ action: "آماده‌سازی آزمون پودمان سالانه" });
    let snapshot = await EduV24.snapshotInstallation();
    check(
      "ANNUAL_MODULE01",
      "a real first-term record preserves zero continuous grade and leaves the next module genuinely empty",
      score(snapshot, first, ids.firstModule)?.m === 0 &&
        score(snapshot, first, ids.firstModule)?.c === 3 &&
        !score(snapshot, first, ids.secondModule),
    );
    await EduV24.finalizePeriod();
    check(
      "ANNUAL_MODULE02",
      "first term closes with complete dual scores while its annual modules remain unfinished",
      EduV24.getReportContext().id === first &&
        EduV24.getReportContext().closed,
    );
    if (!EduV24.getReportContext().closed)
      throw Error("First term did not close with its annual module unfinished");
    snapshot = await EduV24.snapshotInstallation();
    const frozen = JSON.stringify(
      snapshot.stores.reports.filter((row) => row.workspace === first),
    );
    closeModal();
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = year;
    document.getElementById("periodTerm").value = "دوم";
    await EduV24.test.createLegacyPeriod();
    const second = EduV24.getReportContext().id;
    snapshot = await EduV24.snapshotInstallation();
    check(
      "ANNUAL_MODULE03",
      "starting second term continues the same module and student identities with the previous zero grade intact",
      second !== first &&
        EduV24.getReportContext().year === year &&
        score(snapshot, second, ids.firstModule)?.m === 0 &&
        score(snapshot, second, ids.firstModule)?.c === 3 &&
        !score(snapshot, second, ids.secondModule),
    );
    // Simulate an existing installation created before annual continuation:
    // first term owns a real zero grade, while the matching second-term copy
    // was left empty. Mutate only this synthetic fixture through real IDB.
    const rawDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open("EduManagerProfessional");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const migrationIds = snapshot.stores.catalog
      .map((row) => row.id)
      .sort()
      .join();
    try {
      const classRow = structuredClone(
          snapshot.stores.records.find(
            (row) =>
              row.workspace === second &&
              row.logical === "class:" + ids.classroom,
          ),
        ),
        periodRow = structuredClone(
          snapshot.stores.catalog.find((row) => row.id === second),
        );
      classRow.value.lessons
        .find((lesson) => lesson.id === ids.modular)
        .poudmans.find((pod) => pod.id === ids.firstModule).podScores = {};
      periodRow.revision++;
      const transaction = rawDatabase.transaction(
          ["catalog", "records"],
          "readwrite",
        ),
        completion = new Promise((resolve, reject) => {
          transaction.oncomplete = resolve;
          transaction.onabort = () =>
            reject(
              transaction.error ||
                Error("Migration fixture transaction aborted"),
            );
          transaction.onerror = () => reject(transaction.error);
        });
      transaction.objectStore("records").put(classRow);
      transaction.objectStore("catalog").put(periodRow);
      await completion;
    } finally {
      rawDatabase.close();
    }
    const beforeMigration = await EduV24.snapshotInstallation(),
      wasEmpty = !score(beforeMigration, second, ids.firstModule);
    await EduV24.switchPeriod(first);
    await EduV24.switchPeriod(second);
    snapshot = await EduV24.snapshotInstallation();
    EduV24.previewFullBackup(snapshot);
    const migrationBackupValid = !!document.getElementById(
      "fullRestoreConfirmed",
    );
    closeModal();
    check(
      "ANNUAL_MODULE03_MIGRATION",
      "loading a pre-existing empty second-term copy reconciles the annual zero grade without duplicating periods or rewriting frozen reports",
      wasEmpty &&
        migrationBackupValid &&
        [first, second].every(
          (id) =>
            score(snapshot, id, ids.firstModule)?.m === 0 &&
            score(snapshot, id, ids.firstModule)?.c === 3,
        ) &&
        snapshot.stores.catalog
          .map((row) => row.id)
          .sort()
          .join() === migrationIds &&
        frozen ===
          JSON.stringify(
            snapshot.stores.reports.filter((row) => row.workspace === first),
          ) &&
        snapshot.stores.catalog.find((row) => row.id === first).closed,
      { wasEmpty, migrationBackupValid },
    );
    check(
      "ANNUAL_MODULE04",
      "annual module continuation never carries first-term dual scores into second term",
      sameGrades(
        sourceLesson(snapshot, first, ids.dual).kardaneshScores[ids.student],
        firstDual,
      ) &&
        Object.keys(sourceLesson(snapshot, second, ids.dual).kardaneshScores)
          .length === 0,
    );
    await openGradebook();
    for (const [field, value] of [
      ["m", "۴"],
      ["c", "۲"],
    ]) {
      const input = moduleInput(ids.secondModule, field);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await EduV24.flushDrafts({ strict: true });
    snapshot = await EduV24.snapshotInstallation();
    check(
      "ANNUAL_MODULE05",
      "real module grade inputs persist second-module scores in both annual term records atomically",
      [first, second].every(
        (id) =>
          score(snapshot, id, ids.secondModule)?.m === 4 &&
          score(snapshot, id, ids.secondModule)?.c === 2,
      ),
      {
        first: score(snapshot, first, ids.secondModule),
        second: score(snapshot, second, ids.secondModule),
      },
    );
    check(
      "ANNUAL_MODULE06",
      "annual grade edits preserve the closed first term, its dual grades, and its already-frozen report",
      snapshot.stores.catalog.find((row) => row.id === first).closed &&
        sameGrades(
          sourceLesson(snapshot, first, ids.dual).kardaneshScores[ids.student],
          firstDual,
        ) &&
        Object.keys(sourceLesson(snapshot, second, ids.dual).kardaneshScores)
          .length === 0 &&
        frozen ===
          JSON.stringify(
            snapshot.stores.reports.filter((row) => row.workspace === first),
          ),
    );
    goReports();
    setReportTab("karnameh");
    updateKarnamehFilter("schoolId", ids.school);
    updateKarnamehFilter("classId", ids.classroom);
    updateKarnamehFilter("studentId", ids.student);
    const courseSelector =
      '.karnameh-year-document .karnameh-modular-table [data-karnameh-lesson="' +
      ids.modular +
      '"]';
    await wait(
      () =>
        document.querySelector(".karnameh-year-document")?.dataset.studentId ===
          ids.student && !!document.querySelector(courseSelector),
    );
    const course = document.querySelector(courseSelector),
      cells = [...course.querySelectorAll("td[data-karnameh-field]")],
      grade = (node) => {
        const value = node.textContent
          .trim()
          .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
        return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
      },
      values = cells.map((cell) =>
        grade(cell.querySelector(".karnameh-sheet-value")),
      ),
      fields = cells.map((cell) => cell.dataset.karnamehField),
      moduleNames = [...course.querySelectorAll(".karnameh-module-name")].map(
        (node) => node.textContent.trim(),
      );
    check(
      "ANNUAL_MODULE07",
      "karnameh renders each annual module once in a single lesson row without first-term/second-term subdivisions",
      document.querySelectorAll(
        ".karnameh-year-document .karnameh-modular-table [data-karnameh-lesson-row]",
      ).length === 1 &&
        cells.length === 6 &&
        JSON.stringify(fields) ===
          JSON.stringify([
            "continuous",
            "competency",
            "module-result",
            "continuous",
            "competency",
            "module-result",
          ]) &&
        JSON.stringify(moduleNames) ===
          JSON.stringify(["پودمان طراحی", "پودمان اجرا"]) &&
        !course.querySelector(".report-modular-term") &&
        !/نوبت|میان‌ترم|پایان‌ترم/.test(course.textContent) &&
        JSON.stringify(values) === JSON.stringify([0, 3, 15, 4, 2, 14]),
      { values, fields, moduleNames },
    );
    const aggregateSnapshot = await EduV24.prepareReportSnapshot({
        annual: true,
      }),
      aggregate = EduV24.annualTechnicalRows(
        aggregateSnapshot.parts,
        ids.school,
        ids.classroom,
        ids.student,
      ).find((row) => row.lessonId === ids.modular);
    check(
      "ANNUAL_MODULE08",
      "The domain retains its whole-year aggregate while the grade sheet has no annual display column",
      aggregate?.final === 14.5 &&
        aggregate.complete &&
        !course.querySelector("[data-karnameh-field=annual]") &&
        !document.querySelector(
          ".karnameh-year-document [data-karnameh-stage=annual]",
        ),
      { final: aggregate?.final, fields },
    );
    const backup = await EduV24.snapshotInstallation(),
      catalogIds = backup.stores.catalog
        .map((row) => row.id)
        .sort()
        .join();
    await openGradebook();
    for (const field of ["m", "c"]) {
      moduleInput(ids.secondModule, field)
        .parentElement.querySelector("[data-clear-grade]")
        .click();
      await EduV24.flushDrafts({ strict: true });
    }
    snapshot = await EduV24.snapshotInstallation();
    check(
      "ANNUAL_MODULE09",
      "clearing module cells through real grade controls clears the annual grade in both terms, not the other module",
      [first, second].every((id) => {
        const cleared = score(snapshot, id, ids.secondModule);
        return (
          cleared?.m == null &&
          cleared?.c == null &&
          score(snapshot, id, ids.firstModule)?.m === 0 &&
          score(snapshot, id, ids.firstModule)?.c === 3
        );
      }),
    );
    closeModal();
    EduV24.previewFullBackup(backup);
    document.getElementById("fullRestoreConfirmed").checked = true;
    await EduV24.restoreFullBackup();
    snapshot = await EduV24.snapshotInstallation();
    check(
      "ANNUAL_MODULE10",
      "full-system backup restore preserves original term identities and coherent annual module grades",
      snapshot.stores.catalog
        .map((row) => row.id)
        .sort()
        .join() === catalogIds &&
        EduV24.getReportContext().id === second &&
        [first, second].every(
          (id) =>
            score(snapshot, id, ids.secondModule)?.m === 4 &&
            score(snapshot, id, ids.secondModule)?.c === 2,
        ) &&
        snapshot.stores.catalog.find((row) => row.id === first).closed,
    );
    closeModal();
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = nextYear;
    document.getElementById("periodTerm").value = "اول";
    await EduV24.test.createLegacyPeriod();
    const nextFirst = EduV24.getReportContext().id;
    snapshot = await EduV24.snapshotInstallation();
    const nextLesson = sourceLesson(snapshot, nextFirst, ids.modular);
    check(
      "ANNUAL_MODULE11",
      "a new academic year retains course/module definitions but starts fresh annual grades",
      EduV24.getReportContext().year === nextYear &&
        nextLesson?.poudmans.length === 2 &&
        nextLesson.poudmans.every(
          (pod) => Object.keys(pod.podScores).length === 0,
        ) &&
        [first, second].every(
          (id) =>
            score(snapshot, id, ids.firstModule)?.m === 0 &&
            score(snapshot, id, ids.secondModule)?.m === 4,
        ),
    );
  } catch (error) {
    check(
      "ANNUAL_MODULE99",
      "annual modular browser lifecycle completed",
      false,
      {
        error: error.stack || error.message,
      },
    );
  } finally {
    closeModal();
    await EduV24.test.switchLegacyPeriod(previous);
  }
  return cases;
}

async function runExtra({ cdp, evaluate, cases }) {
  const current = await evaluate("globalThis.EduV24?.getReportContext?.()");
  if (!current?.ready || current.blocked) {
    await evaluate("globalThis.__annualModularAuditOldPage = true");
    await cdp("Page.reload", { ignoreCache: true });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        ready = await evaluate(
          "!globalThis.__annualModularAuditOldPage && !!globalThis.EduV24?.getReportContext?.().ready",
        );
        if (ready) break;
      } catch {
        /* Navigation can replace the execution context. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready)
      throw Error("Annual modular browser fixture did not finish reloading");
  }
  cases.push(...(await evaluate("(" + annualModularFlow.toString() + ")()")));
}

module.exports = runExtra;
if (require.main === module)
  main({ stage: "annual-modular-lifecycle", runExtra }).catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
