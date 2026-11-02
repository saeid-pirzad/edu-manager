"use strict";
module.exports = async function annualBackupRoundtrip() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    original = await EduV24.snapshotInstallation(),
    oldDownload = downloadLocalFile,
    oldPicker = window.showSaveFilePicker,
    files = [],
    year = "1450-1451",
    firstId = "annual-backup-first",
    archiveId = "annual-backup-archive",
    note = "گزارش کامل کلاس؛ حضور، مرخصی و تکلیف محفوظ بماند.",
    clone = structuredClone;
  let directory,
    handle,
    fileConnected = false;
  const wait = async (predicate) => {
    for (let attempt = 0; attempt < 250; attempt++) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error("Annual complete-backup action timed out");
  };
  const click = (action) => {
    const button = document.querySelector(
      '[data-workspace-action="' + action + '"]',
    );
    if (!button) throw Error("Missing action: " + action);
    button.click();
  };
  const restore = async (value) => {
    closeModal();
    EduV24.previewFullBackup(value);
    document.getElementById("fullRestoreConfirmed").checked = true;
    await EduV24.restoreFullBackup();
  };
  const day = (label, offset) => {
    const date = new Date(EduAcademicYear.range(label).start + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const parts = (value) =>
    EduV24.validateFullBackup(value).sort((a, b) =>
      a.period.id.localeCompare(b.period.id),
    );
  const dataOf = (value, id) =>
    parts(value).find((part) => part.period.id === id)?.data;
  const logical = (value) =>
    JSON.stringify({
      parts: parts(value).map(({ period, data }) => ({
        id: period.id,
        year: period.year,
        term: period.term,
        closed: period.closed,
        data,
      })),
      reports: value.stores.reports,
      events: value.stores.events,
      notes: value.reportDrafts,
    });
  // Between delivery routes there is no domain edit, so every stored value
  // must match; exportedAt is intentionally the only discarded top-level value.
  const delivered = (value) => {
    const copy = clone(value);
    delete copy.exportedAt;
    return JSON.stringify(copy);
  };
  try {
    const seed = {
      format: "EduManager.FullBackup",
      version: 2,
      schemaVersion: 26,
      exportedAt: new Date().toISOString(),
      activeWorkspace: firstId,
      stores: {
        catalog: [],
        records: [],
        events: [],
        backups: [],
        undo: [],
        reports: [],
      },
      reportDrafts: {},
      gradeDrafts: [],
    };
    const collect = EduWorkspaceRecords.create({ clone }).collectRecords;
    for (const [id, label] of [
      [firstId, year],
      [archiveId, "1449-1450"],
    ]) {
      const value = {
        schemaVersion: 26,
        settings: { academicYear: label, academicTerm: "اول", password: "" },
        schools: [
          {
            id: "school_a",
            name: "مدرسه آزمون فایل سالانه",
            classes: [
              {
                id: "class_a",
                name: "کلاس سالانه",
                students: [
                  { id: "student_a", name: "هنرجوی اول", code: "1" },
                  { id: "student_b", name: "هنرجوی دوم", code: "2" },
                ],
                archivedStudents: [],
                lessons: [
                  {
                    id: "lesson_dual",
                    name: "درس عملی و نظری",
                    gradeMode: "kardanesh",
                    gradingPolicy: {
                      ...EduPolicy.defaults("dual", label),
                      confirmed: true,
                      code: "ANNUAL-TEST",
                    },
                    kardaneshScores: {},
                    poudmans: [],
                  },
                  {
                    id: "lesson_modular",
                    name: "درس پودمانی",
                    gradeMode: "standard",
                    gradingPolicy: {
                      ...EduPolicy.defaults("modular", label),
                      confirmed: true,
                      code: "ANNUAL-TEST",
                    },
                    kardaneshScores: {},
                    poudmans: [
                      {
                        id: "pod_a",
                        name: "پودمان اول",
                        podScores: { student_a: { m: 0, c: 2 } },
                        units: [
                          { id: "unit_a", name: "واحد اول", unitScores: {} },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        masterSchedule: {
          "0-0-all": {
            schoolId: "school_a",
            classId: "class_a",
            lessonId: "lesson_dual",
          },
        },
        sessions: [],
      };
      value.settings.academicYear = label;
      value.settings.academicTerm = "اول";
      value.settings.password = "";
      for (const school of value.schools)
        for (const classroom of school.classes)
          for (const lesson of classroom.lessons) {
            if (lesson.gradingPolicy) lesson.gradingPolicy.year = label;
            if (lesson.courseInfo) lesson.courseInfo.year = label;
          }
      const classroom = value.schools[0].classes[0],
        dual = classroom.lessons.find((lesson) => lesson.id === "lesson_dual");
      dual.kardaneshScores = {
        student_a: {
          midtermPractical: 0,
          midtermTheory: 20,
          practical: 18,
          theory: 12,
        },
        student_b: {
          midtermPractical: 14,
          midtermTheory: null,
          practical: null,
          theory: null,
        },
      };
      value.sessions = [0, 1, 2].map((index) => ({
        id: id + "-session-" + index,
        schoolId: value.schools[0].id,
        classId: classroom.id,
        lessonId: dual.id,
        date: day(label, 5 + index),
        period: index,
        poudmanId: null,
        unitId: null,
        roster: clone(classroom.students),
        attendance: {
          student_a: ["present", "leave", "late:7"][index],
          student_b: ["absent", "present", "leave"][index],
        },
        scores: [
          {
            studentId: "student_a",
            type: "activity",
            value: index,
            note: "تکلیف و فعالیت جلسه " + index,
          },
        ],
      }));
      const data = EduV24.normalizeDB(value),
        key = [
          id,
          "daily",
          day(label, 5),
          "school_a",
          "class_a",
          "management",
          "",
        ].join("|");
      seed.stores.catalog.push({
        id,
        year: label,
        term: "اول",
        termKind: "first",
        revision: 1,
        closed: false,
        createdAt: seed.exportedAt,
        updatedAt: seed.exportedAt,
        reportNotesRecovery: { [key]: note + " " + label },
      });
      seed.reportDrafts[id] = { [key]: note + " " + label };
      for (const [logical, item] of collect(data))
        seed.stores.records.push({
          key: id + "|" + logical,
          workspace: id,
          logical,
          value: item,
        });
    }
    const event = {
      workspace: firstId,
      at: seed.exportedAt,
      revision: 1,
      changes: [],
    };
    seed.stores.events = [
      { ...event, action: "Legacy history without explicit key" },
      { ...event, id: 1, action: "Explicit historical key retained" },
    ];
    await restore(seed);
    const partial = await EduV24.snapshotInstallation();
    check(
      "ANNUAL_BACKUP01",
      "A partial academic year exports first-term grades and complete archived-year data in one file",
      partial.stores.catalog.filter((row) => row.year === year).length === 1 &&
        partial.stores.catalog.some((row) => row.id === archiveId) &&
        dataOf(partial, firstId).schools[0].classes[0].lessons[0]
          .kardaneshScores.student_a.midtermPractical === 0 &&
        dataOf(partial, archiveId).sessions.length === 3,
    );
    check(
      "ANNUAL_BACKUP02",
      "Mixed legacy history without IDs and explicit key 1 restore without collision or dropped rows",
      partial.stores.events.length === 2 &&
        partial.stores.events.some(
          (row) =>
            row.id === 1 && row.action === "Explicit historical key retained",
        ) &&
        partial.stores.events.some(
          (row) => row.action === "Legacy history without explicit key",
        ),
    );
    const sourceId = EduV24.getReportContext().id;
    goSchool("school_a");
    goClass("class_a");
    goLesson("lesson_dual");
    showModal(
      "Grade stage backup fixture",
      buildLessonGradesHtml(
        db.schools[0].classes[0],
        db.schools[0].classes[0].lessons[0],
      ),
    );
    const button = document.querySelector(
      '[data-workspace-action="assessment-stage"][data-term="دوم"][data-stage="midterm"]',
    );
    if (!button) throw Error("Second-term assessment stage is missing");
    button.click();
    await wait(() =>
      document.querySelector(
        '#modalBody [data-assessment-context][data-field="midtermPractical"]',
      ),
    );
    const input = document.querySelector(
      '#modalBody [data-assessment-context][data-student="student_a"][data-field="midtermPractical"]',
    );
    if (!input) throw Error("Target-stage practical field is missing");
    input.value = "19";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    downloadLocalFile = (blob) => {
      void blob.text().then((text) => files.push(JSON.parse(text)));
    };
    await EduV24.exportFullBackup();
    await wait(() => files.length === 1);
    const full = files[0],
      sameYear = parts(full).filter(({ period }) => period.year === year),
      second = sameYear.find(({ period }) => period.termKind === "second");
    check(
      "ANNUAL_BACKUP03",
      "Immediate export flushes the browsed second-term stage into its own grade storage without switching session context",
      EduV24.getReportContext().id === sourceId &&
        sameYear.length === 2 &&
        second?.data.schools[0].classes[0].lessons[0].kardaneshScores.student_a
          ?.midtermPractical === 19 &&
        dataOf(full, firstId).schools[0].classes[0].lessons[0].kardaneshScores
          .student_a.midtermPractical === 0 &&
        dataOf(full, firstId).sessions.length === 3,
    );
    closeModal();
    await wipeAllData();
    const wipeExport = document.querySelector(".wipe-export");
    if (!wipeExport)
      throw Error("Destructive-operation backup download is missing");
    wipeExport.click();
    await wait(() => files.length === 2);
    closeModal();
    await exportBackup();
    await wait(() => files.length === 3);
    check(
      "ANNUAL_BACKUP04",
      "Backup hub, delete-all safety download and runtime export deliver the same coherent file for every year and stage",
      delivered(files[0]) === delivered(files[1]) &&
        delivered(files[0]) === delivered(files[2]),
      {
        terms: full.stores.catalog.length,
        notes: full.snapshotNotes,
        drafts: full.gradeDrafts,
      },
    );
    directory = await navigator.storage.getDirectory();
    handle = await directory.getFileHandle(
      "annual-complete-backup-regression.json",
      { create: true },
    );
    window.showSaveFilePicker = async () => handle;
    await EduV24.openBackups();
    click("single-file-choose");
    fileConnected = true;
    await wait(() =>
      document
        .getElementById("singleFileStatus")
        ?.textContent.startsWith("ذخیره شد:"),
    );
    const automatic = JSON.parse(await (await handle.getFile()).text());
    check(
      "ANNUAL_BACKUP05",
      "The automatic overwrite file contains exactly the same complete annual data as all manual routes",
      delivered(automatic) === delivered(full) && !automatic.stores.drafts,
    );

    const lastGoodFile = await (await handle.getFile()).text(),
      corruptConnection = EduV24.test.getConnection(),
      corruptTx = corruptConnection.transaction("reports", "readwrite"),
      corruptDone = EduDataStoreRuntime.transactionDone(corruptTx);
    corruptTx.objectStore("reports").put({
      id: "annual-corrupt-report",
      workspace: firstId,
      year,
      term: "اول",
      at: new Date().toISOString(),
      classes: [null],
    });
    await corruptDone;
    let corruptDownloadRejected = false;
    const downloadCount = files.length;
    try {
      await EduV24.exportFullBackup();
    } catch {
      corruptDownloadRejected = true;
    }
    click("single-file-save");
    await wait(() =>
      document
        .getElementById("singleFileStatus")
        ?.textContent.includes("فایل خودکار به‌روز نشد"),
    );
    check(
      "ANNUAL_BACKUP_BAD_DELIVERY",
      "A damaged historical report blocks manual success and cannot replace the last healthy automatic backup",
      corruptDownloadRejected &&
        files.length === downloadCount &&
        (await (await handle.getFile()).text()) === lastGoodFile,
    );
    await downloadRawRecovery();
    await wait(() => files.length === downloadCount + 1);
    check(
      "ANNUAL_BACKUP_RAW_RECOVERY",
      "Raw recovery remains available when ordinary complete-backup delivery is refused",
      files[files.length - 1].recoveryDump === true &&
        Array.isArray(files[files.length - 1].records) &&
        files[files.length - 1].stores.reports.some(
          (row) => row.id === "annual-corrupt-report",
        ),
    );
    const repairTx = corruptConnection.transaction("reports", "readwrite"),
      repairDone = EduDataStoreRuntime.transactionDone(repairTx);
    repairTx.objectStore("reports").delete("annual-corrupt-report");
    await repairDone;
    click("single-file-save");
    await wait(() =>
      document
        .getElementById("singleFileStatus")
        ?.textContent.startsWith("ذخیره شد:"),
    );

    click("single-file-stop");
    await wait(() =>
      document
        .getElementById("singleFileStatus")
        ?.textContent.includes("اتصال متوقف شد"),
    );
    fileConnected = false;
    closeModal();
    db.schools[0].classes[0].name = "Temporary change after full backup";
    await saveDB();
    await restore(full);
    const restored = await EduV24.snapshotInstallation(),
      expected = logical(full);
    check(
      "ANNUAL_BACKUP06",
      "Replacement restore reinstates every year's grades, exact session attendance and score notes, report notes and historical events",
      logical(restored) === expected &&
        dataOf(restored, firstId).sessions[1].attendance.student_a ===
          "leave" &&
        dataOf(restored, firstId).sessions[2].attendance.student_a ===
          "late:7" &&
        JSON.stringify(restored.reportDrafts).includes(note),
    );
    await restore(full);
    const repeated = await EduV24.snapshotInstallation();
    check(
      "ANNUAL_BACKUP07",
      "Repeating the same complete-file restore never creates or renames a year, term, student or assessment stage",
      logical(repeated) === expected &&
        repeated.stores.catalog.length === full.stores.catalog.length &&
        repeated.stores.catalog.every((row) =>
          full.stores.catalog.some((old) => old.id === row.id),
        ),
    );

    const beforeSchedule = await EduV24.snapshotInstallation(),
      histories = (value) =>
        JSON.stringify(
          value.stores.records.filter((row) => row.logical !== "meta"),
        ),
      schedule = (value, id) =>
        EduAcademicYearDirectory.scheduleProjection(dataOf(value, id));
    db.periods = 7;
    db.activeDays = [0, 2, 4];
    db.settings.weekStartDate = day(year, 7);
    db.masterSchedule["1-1-all"] = {
      schoolId: "school_a",
      classId: "class_a",
      lessonId: "lesson_dual",
    };
    await saveDB({ action: "Synthetic annual schedule edit" });
    const scheduled = await EduV24.snapshotInstallation();
    check(
      "ANNUAL_SCHEDULE01",
      "One schedule edit synchronizes all four annual settings across term storage without changing any history or another year",
      JSON.stringify(schedule(scheduled, firstId)) ===
        JSON.stringify(schedule(scheduled, second.period.id)) &&
        histories(scheduled) === histories(beforeSchedule) &&
        JSON.stringify(dataOf(scheduled, archiveId)) ===
          JSON.stringify(dataOf(beforeSchedule, archiveId)),
    );
    const beforeFailure = await EduV24.snapshotInstallation(),
      storePrototype = IDBObjectStore.prototype,
      oldPut = storePrototype.put;
    let failed = false;
    try {
      storePrototype.put = function (row, ...args) {
        if (
          this.name === "records" &&
          row?.workspace === second.period.id &&
          row?.logical === "meta"
        )
          throw new DOMException(
            "Synthetic peer schedule write failed",
            "QuotaExceededError",
          );
        return oldPut.call(this, row, ...args);
      };
      db.periods = 8;
      try {
        await saveDB({ action: "Synthetic failed peer schedule edit" });
      } catch {
        failed = true;
      }
    } finally {
      storePrototype.put = oldPut;
    }
    const afterFailure = await EduV24.snapshotInstallation();
    check(
      "ANNUAL_SCHEDULE02",
      "A peer metadata write failure rolls back schedules, revisions, undo and events for the whole year",
      failed &&
        logical(afterFailure) === logical(beforeFailure) &&
        JSON.stringify(afterFailure.stores.catalog) ===
          JSON.stringify(beforeFailure.stores.catalog) &&
        JSON.stringify(afterFailure.stores.undo) ===
          JSON.stringify(beforeFailure.stores.undo),
    );
    const connection = EduV24.test.getConnection(),
      legacyTx = connection.transaction("records", "readwrite"),
      legacyDone = EduDataStoreRuntime.transactionDone(legacyTx),
      request = legacyTx.objectStore("records").get(second.period.id + "|meta");
    request.onsuccess = () => {
      const row = request.result;
      row.value.activeDays = [1, 3];
      legacyTx.objectStore("records").put(row);
    };
    await legacyDone;
    const conflicted = await EduV24.snapshotInstallation();
    let conflictBlocked = false;
    db.periods = 9;
    try {
      await saveDB({ action: "Synthetic unresolved legacy schedule edit" });
    } catch (error) {
      conflictBlocked = error.code === "ACADEMIC_SCHEDULE_CONFLICT";
    }
    check(
      "ANNUAL_SCHEDULE03",
      "An independent legacy schedule is preserved and blocks silent overwrite by an unrelated annual edit",
      conflictBlocked &&
        logical(await EduV24.snapshotInstallation()) === logical(conflicted),
    );
    closeModal();
    state.view = "master";
    render();
    click("apply-academic-schedule");
    await wait(async () => {
      const current = await EduV24.snapshotInstallation();
      return (
        JSON.stringify(schedule(current, firstId)) ===
        JSON.stringify(schedule(current, second.period.id))
      );
    });
    const resolved = await EduV24.snapshotInstallation();
    const backupRequest = connection
      .transaction("backups")
      .objectStore("backups")
      .getAll();
    const safety = await new Promise((resolve, reject) => {
      backupRequest.onsuccess = () => resolve(backupRequest.result);
      backupRequest.onerror = () => reject(backupRequest.error);
    });
    check(
      "ANNUAL_SCHEDULE04",
      "Explicit annual schedule resolution retains the complete differing previous state in a safety backup",
      histories(resolved) === histories(conflicted) &&
        JSON.stringify(dataOf(resolved, archiveId)) ===
          JSON.stringify(dataOf(conflicted, archiveId)) &&
        safety.some(
          (row) =>
            row.full &&
            row.label === "پیش از یکسان‌سازی برنامهٔ سال تحصیلی" &&
            JSON.stringify(schedule(row.full, second.period.id).activeDays) ===
              JSON.stringify([1, 3]),
        ),
    );
    goSchool("school_a");
    goClass("class_a");
    goLesson("lesson_dual");
    showModal(
      "Pending grade fallback",
      buildLessonGradesHtml(
        db.schools[0].classes[0],
        db.schools[0].classes[0].lessons[0],
      ),
    );
    const secondButton = document.querySelector(
      '#modalBody [data-workspace-action="assessment-stage"][data-term="دوم"][data-stage="midterm"]',
    );
    secondButton.click();
    await wait(() =>
      document.querySelector(
        '#modalBody [data-assessment-context][data-student="student_a"][data-field="midtermPractical"]',
      ),
    );
    const pendingInput = document.querySelector(
        '#modalBody [data-assessment-context][data-student="student_a"][data-field="midtermPractical"]',
      ),
      oldSet = Storage.prototype.setItem,
      oldTransaction = IDBDatabase.prototype.transaction;
    let memoryOnly;
    try {
      Storage.prototype.setItem = function (key, ...args) {
        if (String(key).startsWith("Edu24.drafts."))
          throw new DOMException(
            "Synthetic local draft write denied",
            "QuotaExceededError",
          );
        return oldSet.call(this, key, ...args);
      };
      IDBDatabase.prototype.transaction = function (names, mode, ...args) {
        if (
          mode === "readwrite" &&
          (names === "drafts" ||
            (Array.isArray(names) &&
              names.length === 1 &&
              names[0] === "drafts"))
        )
          throw new DOMException(
            "Synthetic durable draft write denied",
            "QuotaExceededError",
          );
        return oldTransaction.call(this, names, mode, ...args);
      };
      pendingInput.value = "99";
      pendingInput.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      memoryOnly = await EduV24.snapshotInstallation();
    } finally {
      Storage.prototype.setItem = oldSet;
      IDBDatabase.prototype.transaction = oldTransaction;
    }
    check(
      "ANNUAL_BACKUP08",
      "A pending target-stage grade remains inside the one complete file even when both draft storage layers fail",
      memoryOnly.gradeDrafts.some(
        (row) =>
          row.workspace === second.period.id &&
          row.entries.some(
            (item) =>
              item.classId === "class_a" &&
              item.lid === "lesson_dual" &&
              item.sid === "student_a" &&
              item.field === "midtermPractical" &&
              item.value === "99",
          ),
      ) &&
        dataOf(memoryOnly, second.period.id).schools[0].classes[0].lessons[0]
          .kardaneshScores.student_a.midtermPractical === 19,
    );
    pendingInput.value = "19";
    pendingInput.dispatchEvent(new Event("input", { bubbles: true }));
    await EduV24.flushDrafts({ strict: true });

    goReports();
    setReportTab("daily");
    const noteFilters = {
      mode: "daily",
      date: day(year, 5),
      schoolId: "school_a",
      classId: "class_a",
      audience: "management",
      studentId: "",
    };
    Object.assign(EduPeriodicReports.filters, noteFilters);
    const oldNoteKey = [
        firstId,
        "daily",
        day(year, 5),
        "school_a",
        "class_a",
        "management",
        "",
      ].join("|"),
      annualNoteKey = [
        firstId,
        "daily",
        "year:" + year + ";" + day(year, 5),
        "school_a",
        "class_a",
        "management",
        "",
      ].join("|"),
      oldAlias = EduPeriodicReports.getDrafts(firstId)[oldNoteKey];
    if (!oldAlias) throw Error("Legacy report note fixture is missing");
    if (!EduPeriodicReports.note(""))
      throw Error("Report clear did not persist");
    const clearFile = await EduV24.snapshotInstallation();
    await restore(clearFile);
    goReports();
    setReportTab("daily");
    Object.assign(EduPeriodicReports.filters, noteFilters);
    const cleared = await EduPeriodicReports.generate(),
      clearDrafts = EduPeriodicReports.getDrafts(firstId);
    check(
      "ANNUAL_BACKUP_NOTE_CLEAR",
      "Complete-file restore retains an intentional annual report-note clear without reviving or deleting legacy note aliases",
      cleared?.note === "" &&
        clearDrafts[annualNoteKey] === "" &&
        clearDrafts[oldNoteKey] === oldAlias &&
        Object.keys(clearDrafts).some(
          (key) =>
            key.includes("year:" + year + ";") &&
            key.endsWith(";ack=1|school_a|class_a|management|"),
        ),
    );
    const editedNote = "گزارش ویرایش‌شدهٔ سال، بدون برگشت متن پیشین";
    if (!EduPeriodicReports.note(editedNote))
      throw Error("Report edit did not persist");
    const editFile = await EduV24.snapshotInstallation();
    await restore(editFile);
    goReports();
    setReportTab("daily");
    Object.assign(EduPeriodicReports.filters, noteFilters);
    const edited = await EduPeriodicReports.generate();
    check(
      "ANNUAL_BACKUP_NOTE_EDIT",
      "Restoring an edited annual note presents exactly the edited text while retaining its original legacy alias",
      edited?.note === editedNote &&
        EduPeriodicReports.getDrafts(firstId)[oldNoteKey] === oldAlias,
    );
  } catch (error) {
    check(
      "ANNUAL_BACKUP99",
      "Complete annual backup roundtrip finished",
      false,
      { error: error.stack || error.message },
    );
  } finally {
    if (fileConnected) {
      try {
        closeModal();
        await EduV24.openBackups();
        click("single-file-stop");
        await wait(() =>
          document
            .getElementById("singleFileStatus")
            ?.textContent.includes("اتصال متوقف شد"),
        );
      } catch {}
    }
    downloadLocalFile = oldDownload;
    window.showSaveFilePicker = oldPicker;
    closeModal();
    if (directory && handle)
      await directory.removeEntry(handle.name).catch(() => {});
    await restore(original);
  }
  return cases;
};
