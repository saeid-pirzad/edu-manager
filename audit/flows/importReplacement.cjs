"use strict";

// Exercises the installed input listener and public runtime facade in an
// isolated synthetic browser. It never calls the private legacy importer.
module.exports = async function importReplacement() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 250; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Import replacement timed out: " +
          (document.getElementById("operationError")?.textContent ||
            EduV24.test.getState().status?.message ||
            ""),
      );
    },
    stored = (snapshot) =>
      JSON.stringify({
        catalog: snapshot.stores.catalog,
        records: snapshot.stores.records,
        events: snapshot.stores.events,
        undo: snapshot.stores.undo,
        reports: snapshot.stores.reports,
      }),
    choose = async (value, name) => {
      const input = document.getElementById("importFile"),
        transfer = new DataTransfer();
      transfer.items.add(
        new File(
          [typeof value === "string" ? value : JSON.stringify(value)],
          name,
          { type: "application/json" },
        ),
      );
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(() => input.value === "");
      return !!document.querySelector(
        "#modal:not(.hidden) #fullRestoreConfirmed",
      );
    },
    approve = async () => {
      document.getElementById("fullRestoreConfirmed").checked = true;
      document.querySelector('[data-workspace-action="restore-full"]').click();
      await wait(
        () =>
          EduV24.getReportContext().ready &&
          document.getElementById("modal").classList.contains("hidden"),
      );
      await EduV24.test.settle();
    },
    seed = async (snapshot) => {
      closeModal();
      EduV24.previewFullBackup(snapshot);
      await approve();
    };
  let original = null;
  try {
    closeModal();
    await EduV24.test.settle();
    original = await EduV24.snapshotInstallation();
    const basePeriod = original.stores.catalog.find(
        (period) => period.id === original.activeWorkspace,
      ),
      baseData = EduV24.validateFullBackup(original).find(
        ({ period }) => period.id === original.activeWorkspace,
      ).data;
    if (!baseData.schools.length)
      throw Error("Import replacement needs a synthetic school fixture");
    const incomingData = structuredClone(baseData);
    incomingData.settings.password = "";
    incomingData.settings.academicTerm = "اول";
    incomingData.schools[0].name = "هنرستان بازیابی از فایل اصلی";
    const expectedData = EduV24.normalizeDB(incomingData),
      makeFull = (data, prefix, terms) => {
        const result = structuredClone(original);
        for (const name of Object.keys(result.stores)) result.stores[name] = [];
        result.reportDrafts = {};
        result.gradeDrafts = [];
        result.snapshotNotes = [];
        for (const [index, term] of terms.entries()) {
          const id = prefix + "-" + index,
            copy = structuredClone(data);
          copy.settings.academicTerm = term;
          result.stores.catalog.push({
            ...structuredClone(basePeriod),
            id,
            year: copy.settings.academicYear,
            term,
            termKind: ["first", "second", "summer"][index],
            closed: index < terms.length - 1,
            revision: 1,
            reportNotesRecovery: {},
          });
          const { schools, sessions, ...meta } = copy,
            records = [
              [
                "meta",
                {
                  ...meta,
                  layout: schools.map((school) => ({
                    id: school.id,
                    name: school.name,
                    classes: school.classes.map((cls) => cls.id),
                  })),
                },
              ],
              ...schools.flatMap((school) =>
                school.classes.map((cls) => ["class:" + cls.id, cls]),
              ),
              ...sessions.map((session) => ["session:" + session.id, session]),
            ];
          for (const [logical, value] of records)
            result.stores.records.push({
              key: id + "|" + logical,
              workspace: id,
              logical,
              value,
            });
          result.activeWorkspace = id;
        }
        EduV24.validateFullBackup(result);
        return result;
      },
      oldData = structuredClone(expectedData);
    oldData.schools[0].name = "اطلاعات فعلی که باید کامل جایگزین شود";
    const oldInstallation = makeFull(oldData, "import-old", [
        "اول",
        "دوم",
        "تابستان",
      ]),
      fullFile = makeFull(expectedData, "import-saved", ["اول"]),
      legacyData = { ...structuredClone(expectedData), schemaVersion: 25 },
      legacyFile = {
        version: 25,
        exportedAt: new Date().toISOString(),
        period: {
          year: legacyData.settings.academicYear,
          term: legacyData.settings.academicTerm,
        },
        db: legacyData,
      };
    for (const [format, file] of [
      ["LEGACY", legacyFile],
      ["FULL", fullFile],
    ]) {
      const prefix = "IMPORT_REPLACE_" + format;
      await seed(oldInstallation);
      const before = await EduV24.snapshotInstallation(),
        oldIds = new Set(before.stores.catalog.map((period) => period.id));
      const hasPreview = await choose(file, "restore-" + format + ".json");
      check(
        prefix + "01",
        "actual file-input change opens a complete replacement preview for " +
          format,
        hasPreview &&
          !!document.querySelector("[data-full-restore]") &&
          !document.getElementById("restoreExternalConfirmed") &&
          !document.querySelector('[data-workspace-action="confirm-import"]'),
        {
          error: hasPreview
            ? ""
            : EduV24.test.getState().status?.message ||
              "No full restore preview",
        },
      );
      if (!hasPreview) continue;
      check(
        prefix + "02",
        "choosing " + format + " changes no stored data before confirmation",
        stored(await EduV24.snapshotInstallation()) === stored(before),
      );
      document.querySelector('[data-workspace-action="close"]').click();
      check(
        prefix + "03",
        "cancelling " + format + " leaves every current term untouched",
        stored(await EduV24.snapshotInstallation()) === stored(before) &&
          document.getElementById("modal").classList.contains("hidden"),
      );
      await choose(file, "restore-" + format + ".json");
      document.querySelector('[data-workspace-action="restore-full"]').click();
      await wait(() => document.getElementById("operationError")?.textContent);
      check(
        prefix + "04",
        "unchecked replacement confirmation rejects " +
          format +
          " without writes",
        stored(await EduV24.snapshotInstallation()) === stored(before),
      );
      await approve();
      let after = await EduV24.snapshotInstallation(),
        restored = EduV24.validateFullBackup(after);
      check(
        prefix + "05",
        "confirmed " +
          format +
          " replaces all old terms and records with exactly the file data",
        after.stores.catalog.length === 1 &&
          !after.stores.catalog.some((period) => oldIds.has(period.id)) &&
          restored.length === 1 &&
          JSON.stringify(restored[0].data) === JSON.stringify(expectedData) &&
          after.stores.records.every(
            (row) => row.workspace === after.activeWorkspace,
          ) &&
          after.stores.catalog[0].term === "اول" &&
          !after.stores.catalog[0].term.includes("بازیابی") &&
          (format !== "FULL" ||
            after.stores.catalog[0].id === fullFile.activeWorkspace),
        {
          periods: after.stores.catalog.map(({ id, term }) => ({ id, term })),
        },
      );
      const request = EduV24.test
          .getConnection()
          .transaction("backups")
          .objectStore("backups")
          .getAll(),
        safetyBackups = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      check(
        prefix + "06",
        format +
          " replacement retains a complete safety copy of all overwritten terms",
        safetyBackups.some(
          (backup) => backup.full && stored(backup.full) === stored(before),
        ),
      );
      await choose(file, "restore-" + format + ".json");
      await approve();
      after = await EduV24.snapshotInstallation();
      restored = EduV24.validateFullBackup(after);
      check(
        prefix + "07",
        "repeating " +
          format +
          " imports never appends a recovered or duplicate term",
        after.stores.catalog.length === 1 &&
          restored.length === 1 &&
          JSON.stringify(restored[0].data) === JSON.stringify(expectedData) &&
          after.stores.catalog[0].term === "اول" &&
          !after.stores.catalog[0].term.includes("بازیابی") &&
          (format !== "FULL" ||
            after.stores.catalog[0].id === fullFile.activeWorkspace),
      );
    }
    const duplicateFile = makeFull(expectedData, "import-duplicate", [
        "اول",
        "اول — بازیابی قبلی",
      ]),
      dualClass = expectedData.schools
        .flatMap((school) => school.classes)
        .find(
          (cls) =>
            cls.students.length &&
            cls.lessons.some(
              (lesson) =>
                lesson.gradeMode === "kardanesh" &&
                lesson.gradingPolicy?.subjectType !== "general",
            ),
        );
    if (!dualClass)
      throw Error("Duplicate-file fixture needs a vocational dual class");
    const dualLesson = dualClass.lessons.find(
        (lesson) =>
          lesson.gradeMode === "kardanesh" &&
          lesson.gradingPolicy?.subjectType !== "general",
      ),
      duplicateStudent = dualClass.students[0].id;
    for (const [index, period] of duplicateFile.stores.catalog.entries()) {
      period.termKind = "first";
      const cls = duplicateFile.stores.records.find(
          (row) =>
            row.workspace === period.id &&
            row.logical === "class:" + dualClass.id,
        ).value,
        lesson = cls.lessons.find((value) => value.id === dualLesson.id);
      lesson.kardaneshScores[duplicateStudent] = {
        practical: index ? 19 : 12,
        theory: index ? 17 : 10,
        midtermPractical: index ? 18 : 13,
        midtermTheory: index ? 16 : 11,
      };
    }
    const duplicateProjection = (value) =>
        EduV24.validateFullBackup(value)
          .map(({ period, data }) => ({
            id: period.id,
            term: period.term,
            data,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      expectedDuplicates = JSON.stringify(duplicateProjection(duplicateFile));
    await seed(oldInstallation);
    const beforeDuplicate = await EduV24.snapshotInstallation(),
      duplicatePreview = await choose(
        duplicateFile,
        "saved-with-two-first-terms.json",
      ),
      displayedPeriods = [
        ...document.querySelectorAll(
          "#modal:not(.hidden) .full-restore-periods li",
        ),
      ].map((element) => element.textContent);
    check(
      "IMPORT_REPLACE_DUPLICATE01",
      "replacement preview lists both original file entries and warns about duplicate first-term roles",
      duplicatePreview &&
        displayedPeriods.length === 2 &&
        duplicateFile.stores.catalog.every((period) =>
          displayedPeriods.includes(period.year + " / " + period.term),
        ) &&
        !!document.querySelector(
          '#modal:not(.hidden) .full-restore-warning[role="status"]',
        ) &&
        stored(await EduV24.snapshotInstallation()) === stored(beforeDuplicate),
      { displayedPeriods },
    );
    if (duplicatePreview) {
      await approve();
      const afterDuplicate = await EduV24.snapshotInstallation(),
        duplicateIds = duplicateFile.stores.catalog
          .map((period) => period.id)
          .sort();
      check(
        "IMPORT_REPLACE_DUPLICATE02",
        "a file containing two original first-term entries keeps exactly their saved IDs and independent grades after replacement",
        afterDuplicate.stores.catalog.length === 2 &&
          JSON.stringify(
            afterDuplicate.stores.catalog.map((period) => period.id).sort(),
          ) === JSON.stringify(duplicateIds) &&
          JSON.stringify(duplicateProjection(afterDuplicate)) ===
            expectedDuplicates &&
          !afterDuplicate.stores.catalog.some((period) =>
            beforeDuplicate.stores.catalog.some((old) => old.id === period.id),
          ),
        {
          periods: afterDuplicate.stores.catalog.map(({ id, term }) => ({
            id,
            term,
          })),
        },
      );
    }

    const beforeInvalid = await EduV24.snapshotInstallation();
    closeModal();
    const invalidPreview = await choose("{invalid-json", "broken-backup.json");
    check(
      "IMPORT_REPLACE_INVALID",
      "invalid file-input JSON never creates or replaces a term",
      !invalidPreview &&
        stored(await EduV24.snapshotInstallation()) === stored(beforeInvalid),
    );
  } catch (error) {
    check(
      "IMPORT_REPLACE99",
      "real file-input replacement workflow completed",
      false,
      { error: error.stack || error.message },
    );
  } finally {
    if (original) {
      try {
        await seed(original);
      } catch (error) {
        check(
          "IMPORT_REPLACE_CLEANUP",
          "isolated file-import fixture restores its original installation",
          false,
          { error: error.stack || error.message },
        );
      }
    }
    closeModal();
  }
  return cases;
};
