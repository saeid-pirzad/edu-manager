"use strict";

// Runs only against the isolated audit browser, with synthetic records. Every
// operation uses the installed form listeners or production persistence facade.
module.exports = async function academicYearSafety() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id: "ACADEMIC_YEAR_" + id, name, pass: !!pass, observed }),
    year = "1405-1406",
    start = "2026-09-23",
    end = "2027-09-22",
    beforeStart = "2026-09-22",
    afterEnd = "2027-09-23",
    ids = {
      period: "year_safety_period",
      school: "year_safety_school",
      classroom: "year_safety_class",
      lesson: "year_safety_lesson",
      student: "year_safety_student",
      legacy: "year_safety_legacy_session",
    },
    native = [],
    oldAlert = window.alert,
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 250; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Academic year UI timed out: " +
          (document.querySelector(".session-validation-alert p")?.textContent ||
            document.getElementById("operationError")?.textContent ||
            EduV24.test.getState().status?.message ||
            ""),
      );
    },
    stored = (snapshot) =>
      JSON.stringify(
        Object.fromEntries(
          ["catalog", "records", "events", "undo", "reports"].map((name) => [
            name,
            snapshot.stores[name],
          ]),
        ),
      ),
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
    },
    choose = async (value, name) => {
      closeModal();
      const input = document.getElementById("importFile"),
        transfer = new DataTransfer();
      transfer.items.add(
        new File([JSON.stringify(value)], name, { type: "application/json" }),
      );
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(() => input.value === "");
      return !!document.querySelector(
        "#modal:not(.hidden) #fullRestoreConfirmed",
      );
    },
    openLesson = () => {
      closeModal();
      goSchool(ids.school);
      goClass(ids.classroom);
      goLesson(ids.lesson);
    },
    createManual = async (date, period, blocked = false) => {
      openLesson();
      const form = document.querySelector(".session-create-form");
      form.elements.date.value = date;
      form.elements.period.value = String(period);
      // Dispatch submit as well as the real listener so a malicious or stale
      // control cannot rely only on a browser min/max constraint.
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await wait(() =>
        blocked
          ? !!form
              .closest(".session-create")
              .querySelector(".session-validation-alert")
          : !!document.querySelector("#modal:not(.hidden) #sessDate"),
      );
      await EduV24.test.settle();
    },
    editDate = async (sessionId, date, blocked = false) => {
      closeModal();
      openSessionModal(db.sessions.find((session) => session.id === sessionId));
      const tools = document.querySelector(".session-date-tools");
      tools.open = true;
      document.getElementById("sessDate").value = date;
      tools.querySelector('[data-legacy-click="sessions-dialog:1"]').click();
      await wait(() =>
        blocked
          ? !!tools.querySelector(".session-validation-alert")
          : db.sessions.find((session) => session.id === sessionId).date ===
            date,
      );
      await EduV24.test.settle();
    },
    canonical = (snapshot) => {
      const [{ period, data }] = EduV24.validateFullBackup(snapshot),
        lesson = data.schools[0].classes[0].lessons[0];
      return (
        period.year === year &&
        data.settings.academicYear === year &&
        lesson.courseInfo.year === year &&
        lesson.gradingPolicy.year === year
      );
    };
  let original = null;
  window.alert = (message) => native.push(String(message));
  try {
    closeModal();
    await EduV24.test.settle();
    original = await EduV24.snapshotInstallation();
    const data = EduV24.normalizeDB({
        schemaVersion: 26,
        settings: { academicYear: year, academicTerm: "اول", password: "" },
        masterSchedule: {},
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        periods: 6,
        sessions: [],
        schools: [
          {
            id: ids.school,
            name: "هنرستان آزمون بازه سال",
            classes: [
              {
                id: ids.classroom,
                name: "یازدهم شبکه آزمایشی",
                students: [
                  { id: ids.student, name: "هنرجوی مصنوعی آزمون", code: "1" },
                ],
                archivedStudents: [],
                lessons: [
                  {
                    id: ids.lesson,
                    name: "درس آزمون سال تحصیلی",
                    teacher: "دبیر آزمایشی",
                    periods: 2,
                    gradeMode: "kardanesh",
                    gradingPolicy: {
                      ...EduPolicy.defaults("dual", year),
                      code: "YEAR-SAFETY",
                      confirmed: true,
                    },
                    courseInfo: {
                      year,
                      grade: "11",
                      field: "شبکه",
                      code: "YEAR-SAFETY",
                      authority: "",
                      branch: "kardanesh",
                    },
                    poudmans: [],
                    kardaneshScores: {
                      [ids.student]: {
                        practical: 18,
                        theory: 12,
                        midtermPractical: 16,
                        midtermTheory: 14,
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
      makeFull = (source, catalogYear = source.settings.academicYear) => {
        const result = structuredClone(original),
          base = original.stores.catalog.find(
            (period) => period.id === original.activeWorkspace,
          );
        for (const name of Object.keys(result.stores)) result.stores[name] = [];
        result.activeWorkspace = ids.period;
        result.reportDrafts = {};
        result.gradeDrafts = [];
        result.snapshotNotes = [];
        result.stores.catalog.push({
          ...structuredClone(base),
          id: ids.period,
          year: catalogYear,
          term: "اول",
          termKind: "first",
          closed: false,
          revision: 1,
          reportNotesRecovery: {},
        });
        const { schools, sessions, ...meta } = structuredClone(source),
          rows = [
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
        result.stores.records = rows.map(([logical, value]) => ({
          key: ids.period + "|" + logical,
          workspace: ids.period,
          logical,
          value,
        }));
        return result;
      },
      fixture = makeFull(data);
    await seed(fixture);
    const bounds = EduAcademicYear.range(year);
    check(
      "01",
      "academic-year labels normalize Persian and Arabic digits with exact Mehr–Shahrivar bounds",
      EduAcademicYear.normalize("۱۴۰۵-۱۴۰۶") === year &&
        EduAcademicYear.normalize("١٤٠٥-١٤٠٦") === year &&
        bounds.start === start &&
        bounds.end === end,
      bounds,
    );
    check(
      "02",
      "Nowruz does not split the active academic year and Mehr starts the next year",
      ["2027-03-20", "2027-03-21", "2027-09-22"].every(
        (date) =>
          EduAcademicYear.current(new Date(date + "T12:00:00")) === year,
      ) &&
        EduAcademicYear.current(new Date("2027-09-23T12:00:00")) ===
          "1406-1407",
    );
    for (const [index, date] of [beforeStart, afterEnd].entries()) {
      const before = stored(await EduV24.snapshotInstallation());
      await createManual(date, 1, true);
      const alert = document.querySelector(
        ".session-create .session-validation-alert",
      );
      check(
        "0" + (index + 3),
        "manual session outside the academic year is blocked with a styled inline alert: " +
          date,
        stored(await EduV24.snapshotInstallation()) === before &&
          !!alert?.querySelector("svg") &&
          alert.getAttribute("role") === "alert" &&
          native.length === 0,
        { message: alert?.querySelector("p")?.textContent },
      );
    }
    await createManual(start, 1);
    const startId = db.sessions.find((session) => session.date === start)?.id;
    check(
      "05",
      "a manual session on the exact first day is persisted once",
      !!startId &&
        db.sessions.filter((session) => session.date === start).length === 1,
    );
    await createManual(end, 2);
    const endId = db.sessions.find((session) => session.date === end)?.id;
    check(
      "06",
      "a manual session on the exact last day is persisted once",
      !!endId &&
        db.sessions.filter((session) => session.date === end).length === 1,
    );
    const beforeEdit = stored(await EduV24.snapshotInstallation());
    await editDate(startId, beforeStart, true);
    check(
      "07",
      "session date editing cannot move an in-year record outside its academic year",
      db.sessions.find((session) => session.id === startId).date === start &&
        stored(await EduV24.snapshotInstallation()) === beforeEdit &&
        !!document.querySelector(
          ".session-date-tools .session-validation-alert svg",
        ),
    );
    closeModal();
    for (let day = 0; day < 7; day++)
      db.masterSchedule[day + "-2-all"] = {
        schoolId: ids.school,
        classId: ids.classroom,
        lessonId: ids.lesson,
      };
    await saveDB({ action: "تنظیم برنامه مصنوعی آزمون بازه" });
    for (const [index, date] of [beforeStart, afterEnd].entries()) {
      closeModal();
      goMaster();
      const day = getDayIdxFromDate(date);
      clickMasterCell(day, 2);
      document.getElementById("sessNewDate").value = date;
      const before = stored(await EduV24.snapshotInstallation());
      document
        .querySelector('[data-legacy-click="schedule-timetable:15"]')
        .click();
      await wait(
        () =>
          !!document.querySelector(
            ".session-start-panel .session-validation-alert",
          ),
      );
      await EduV24.test.settle();
      check(
        "0" + (index + 8),
        "scheduled session outside the academic year is blocked before writes: " +
          date,
        stored(await EduV24.snapshotInstallation()) === before &&
          native.length === 0 &&
          !!document.querySelector(
            ".session-start-panel .session-validation-alert svg",
          ),
      );
    }
    for (const [index, labels] of [
      ["۱۴۰۵-۱۴۰۶", "١٤٠٥-١٤٠٦"],
      ["١٤٠٥-١٤٠٦", "۱۴۰۵-۱۴۰۶"],
    ].entries()) {
      const legacyData = structuredClone(data);
      legacyData.settings.academicYear = labels[0];
      legacyData.schools[0].classes[0].lessons[0].gradingPolicy.year =
        labels[1];
      legacyData.schools[0].classes[0].lessons[0].courseInfo.year = labels[1];
      const sourceBefore = JSON.stringify(legacyData),
        normalized = EduV24.normalizeDB(legacyData);
      const hasPreview = await choose(
        {
          version: 25,
          period: { year: labels[1], term: "اول" },
          db: legacyData,
        },
        "synthetic-persian-year-" + index + ".json",
      );
      if (hasPreview) await approve();
      check(
        "1" + index,
        "legacy file input canonicalizes all equivalent year references without mutating its source: " +
          index,
        hasPreview &&
          JSON.stringify(legacyData) === sourceBefore &&
          normalized.settings.academicYear === year &&
          canonical(await EduV24.snapshotInstallation()) &&
          db.schools[0].classes[0].lessons[0].kardaneshScores[ids.student]
            .practical === 18,
      );
    }
    const fullData = structuredClone(data);
    fullData.settings.academicYear = "١٤٠٥-١٤٠٦";
    fullData.schools[0].classes[0].lessons[0].gradingPolicy.year = "۱۴۰۵-۱۴۰۶";
    fullData.schools[0].classes[0].lessons[0].courseInfo.year = "١٤٠٥-١٤٠٦";
    const full = makeFull(fullData, "۱۴۰۵-۱۴۰۶"),
      fullBefore = JSON.stringify(full);
    const validated = EduV24.validateFullBackup(full),
      fullPreview = await choose(full, "synthetic-full-year.json");
    if (fullPreview) await approve();
    check(
      "12",
      "complete restore canonicalizes catalog, metadata and course references without changing the selected object",
      fullPreview &&
        JSON.stringify(full) === fullBefore &&
        validated[0].period.year === year &&
        canonical(await EduV24.snapshotInstallation()),
    );
    for (const [index, format] of ["legacy", "full"].entries()) {
      const invalid = structuredClone(data);
      invalid.settings.academicYear = "1405-1407";
      const file =
          format === "legacy"
            ? { version: 25, db: invalid }
            : makeFull(invalid, "1405-1407"),
        before = stored(await EduV24.snapshotInstallation());
      const preview = await choose(
        file,
        "invalid-academic-year-" + format + ".json",
      );
      check(
        "1" + (index + 3),
        "invalid nonconsecutive year in " +
          format +
          " refuses a replacement preview and leaves all records unchanged",
        !preview && stored(await EduV24.snapshotInstallation()) === before,
        { message: EduV24.test.getState().status?.message },
      );
    }
    const historic = structuredClone(data),
      unrelatedWarning = "هشدار مستقل آزمون باید حفظ شود.";
    historic.migrationWarnings.push(unrelatedWarning);
    historic.sessions.push({
      id: ids.legacy,
      schoolId: ids.school,
      classId: ids.classroom,
      lessonId: ids.lesson,
      date: beforeStart,
      period: 3,
      poudmanId: null,
      unitId: null,
      roster: structuredClone(historic.schools[0].classes[0].students),
      attendance: { [ids.student]: "absent" },
      scores: [
        {
          studentId: ids.student,
          type: "classGrade",
          value: 17,
          note: "امتیاز تاریخی مصنوعی",
        },
      ],
    });
    const historicBefore = JSON.stringify(historic),
      historicPreview = await choose(
        { version: 25, db: historic },
        "synthetic-legacy-outside-year.json",
      );
    const previewWarning = document
      .getElementById("modalBody")
      .textContent.includes("خارج از سال تحصیلی");
    if (historicPreview) await approve();
    const warning = (db.migrationWarnings || []).filter((message) =>
      /سال تحصیلی|بازه/.test(message),
    );
    check(
      "15",
      "legacy out-of-year session history survives restore with a visible migration warning",
      historicPreview &&
        JSON.stringify(historic) === historicBefore &&
        db.sessions.find((session) => session.id === ids.legacy)?.date ===
          beforeStart &&
        warning.length > 0 &&
        previewWarning,
      { warnings: warning, previewWarning },
    );
    openLesson();
    openSessionModal(db.sessions.find((session) => session.id === ids.legacy));
    const sessionWarning = document
      .getElementById("modalBody")
      .textContent.includes("خارج از سال تحصیلی");
    document
      .querySelector(
        '.session-attendance-list [data-sid="' +
          ids.student +
          '"] button.present',
      )
      .click();
    await wait(
      () =>
        db.sessions.find((session) => session.id === ids.legacy)?.attendance[
          ids.student
        ] === "present",
    );
    await EduV24.test.settle();
    check(
      "16",
      "attendance corrections remain editable on a preserved legacy out-of-year session",
      db.sessions.find((session) => session.id === ids.legacy).date ===
        beforeStart &&
        db.sessions.find((session) => session.id === ids.legacy).attendance[
          ids.student
        ] === "present" &&
        EduV24.validateFullBackup(await EduV24.snapshotInstallation())
          .length === 1 &&
        sessionWarning,
    );
    const beforeHistoricEdit = stored(await EduV24.snapshotInstallation());
    await editDate(ids.legacy, afterEnd, true);
    check(
      "17",
      "legacy history cannot be moved to another out-of-year date",
      stored(await EduV24.snapshotInstallation()) === beforeHistoricEdit &&
        db.sessions.find((session) => session.id === ids.legacy).date ===
          beforeStart,
    );
    const historicForUndo = JSON.stringify(
      db.sessions.find((session) => session.id === ids.legacy),
    );
    await editDate(ids.legacy, start);
    const liveWarnings = [...db.migrationWarnings],
      correctedSnapshot = await EduV24.snapshotInstallation(),
      storedWarnings = correctedSnapshot.stores.records.find(
        (row) =>
          row.workspace === correctedSnapshot.activeWorkspace &&
          row.logical === "meta",
      ).value.migrationWarnings,
      warningsRefreshed = (warnings) =>
        warnings.includes(unrelatedWarning) &&
        !warnings.some((message) =>
          message.startsWith("جلسات خارج از سال تحصیلی:"),
        );
    check(
      "18",
      "correcting legacy session retains attendance and immediately refreshes live and stored warnings while preserving unrelated warnings",
      db.sessions.find((session) => session.id === ids.legacy).date === start &&
        db.sessions.find((session) => session.id === ids.legacy).attendance[
          ids.student
        ] === "present" &&
        warningsRefreshed(liveWarnings) &&
        warningsRefreshed(storedWarnings),
      { liveWarnings, storedWarnings },
    );
    closeModal();
    await EduV24.undoLast();
    await EduV24.test.settle();
    check(
      "20",
      "verified undo of a date correction restores the exact historical out-of-year session and warning",
      JSON.stringify(
        db.sessions.find((session) => session.id === ids.legacy),
      ) === historicForUndo &&
        db.migrationWarnings.includes(unrelatedWarning) &&
        db.migrationWarnings.some((message) =>
          message.startsWith("جلسات خارج از سال تحصیلی:"),
        ),
    );
    await deleteSession(ids.legacy);
    await EduV24.test.settle();
    const deletedSnapshot = await EduV24.snapshotInstallation(),
      deletionWarningsCleared =
        !db.sessions.some((session) => session.id === ids.legacy) &&
        warningsRefreshed(db.migrationWarnings) &&
        warningsRefreshed(
          deletedSnapshot.stores.records.find(
            (row) =>
              row.workspace === deletedSnapshot.activeWorkspace &&
              row.logical === "meta",
          ).value.migrationWarnings,
        );
    await EduV24.undoLast();
    await EduV24.test.settle();
    check(
      "21",
      "deleting legacy history refreshes warnings and verified undo restores its exact id, date, attendance and scores",
      deletionWarningsCleared &&
        JSON.stringify(
          db.sessions.find((session) => session.id === ids.legacy),
        ) === historicForUndo &&
        db.migrationWarnings.includes(unrelatedWarning) &&
        db.migrationWarnings.some((message) =>
          message.startsWith("جلسات خارج از سال تحصیلی:"),
        ),
      { deletionWarningsCleared },
    );
    closeModal();
    const beforeDirect = stored(await EduV24.snapshotInstallation());
    db.sessions.push({
      ...structuredClone(db.sessions[0]),
      id: "year_safety_illegal_direct",
      date: afterEnd,
      period: 4,
    });
    let rejected = false;
    try {
      await saveDB({ action: "باید خارج از بازه رد شود", keepUndo: false });
    } catch {
      rejected = true;
    }
    check(
      "19",
      "public saveDB with keepUndo:false still rejects a new out-of-year session and rolls back all writes",
      rejected &&
        stored(await EduV24.snapshotInstallation()) === beforeDirect &&
        !db.sessions.some(
          (session) => session.id === "year_safety_illegal_direct",
        ),
    );
  } catch (error) {
    check("99", "academic year browser flow completes", false, {
      error: error.message,
      stack: error.stack,
    });
  } finally {
    closeModal();
    if (original) {
      EduV24.previewFullBackup(original);
      await approve();
    }
    window.alert = oldAlert;
  }
  return cases;
};
