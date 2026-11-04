"use strict";
module.exports = async function academicBackupLifecycle() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed });
  const previous = EduV24.getReportContext().id;
  const scheduleFixtureSession = (meeting) => {
    const day = (new Date(meeting.date + "T00:00:00Z").getUTCDay() + 1) % 7;
    db.periods = Math.max(db.periods || 6, meeting.period + 1);
    db.activeDays = [
      ...new Set([...(db.activeDays || [0, 1, 2, 3, 4, 5]), day]),
    ].sort((a, b) => a - b);
    for (const parity of ["odd", "even"])
      delete db.masterSchedule[day + "-" + meeting.period + "-" + parity];
    db.masterSchedule[day + "-" + meeting.period + "-all"] = {
      schoolId: meeting.schoolId,
      classId: meeting.classId,
      lessonId: meeting.lessonId,
    };
  };
  try {
    closeModal();
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = "1416-1417";
    document.getElementById("periodTerm").value = "اول";
    await EduV24.test.createLegacyPeriod();
    const first = EduV24.getReportContext().id;
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = "1416-1417";
    document.getElementById("periodTerm").value = "دوم";
    let premature = false;
    try {
      await EduV24.test.createLegacyPeriod();
    } catch {
      premature = true;
    }
    check(
      "ACADEMIC01",
      "second term cannot start while first term is open",
      premature && EduV24.getReportContext().id === first,
    );
    closeModal();
    const school = db.schools[0],
      classroom = school.classes[0];
    const lesson = classroom.lessons.find(
      (item) =>
        item.gradeMode === "kardanesh" &&
        item.gradingPolicy?.subjectType !== "general",
    );
    if (!lesson)
      throw Error("Lifecycle fixture needs a vocational dual lesson");
    db.schools = [school];
    school.classes = [classroom];
    classroom.students = classroom.students.slice(0, 1);
    classroom.archivedStudents = [];
    classroom.lessons = [lesson];
    const student = classroom.students[0];
    lesson.kardaneshScores = {
      [student.id]: {
        midtermPractical: 18,
        midtermTheory: 12,
        practical: 18,
        theory: 12,
      },
    };
    const session = (id, date, attendance) => ({
      id,
      date,
      period: 0,
      schoolId: school.id,
      classId: classroom.id,
      lessonId: lesson.id,
      poudmanId: null,
      unitId: null,
      roster: structuredClone(classroom.students),
      attendance: { [student.id]: attendance },
      scores: [],
    });
    db.sessions = [session("academic-first", "2037-10-24", "present")];
    scheduleFixtureSession(db.sessions[0]);
    await saveDB();
    const firstGrade = EduV24.assessmentResult(lesson, student.id).final;
    await EduV24.finalizePeriod();
    check(
      "ACADEMIC02",
      "closing first term freezes its grade and retains the original term",
      EduV24.getReportContext().id === first &&
        EduV24.getReportContext().closed,
    );
    closeModal();
    await EduV24.openNewPeriod(first);
    check(
      "ACADEMIC03",
      "the next-term action fixes the second term and current year without editable year or term fields",
      document
        .getElementById("secondTermStart")
        ?.textContent.includes("1416-1417") &&
        !document.getElementById("periodYear") &&
        !document.getElementById("periodTerm"),
    );
    document
      .querySelector('#secondTermStart [data-workspace-action="create-period"]')
      .click();
    for (
      let attempt = 0;
      attempt < 200 &&
      (EduV24.getReportContext().id === first ||
        !EduV24.getReportContext().ready);
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    if (
      EduV24.getReportContext().id === first ||
      !EduV24.getReportContext().ready
    )
      throw Error("The fixed second-term action did not finish loading");
    const second = EduV24.getReportContext().id,
      secondClass = db.schools[0].classes[0],
      secondLesson = secondClass.lessons[0];
    check(
      "ACADEMIC04",
      "second term continues the first-term roster and lessons without carrying grades or sessions",
      second !== first &&
        secondClass.id === classroom.id &&
        secondClass.students[0].id === student.id &&
        secondLesson.id === lesson.id &&
        Object.keys(secondLesson.kardaneshScores).length === 0 &&
        db.sessions.length === 0,
    );
    secondLesson.kardaneshScores[student.id] = {
      midtermPractical: 20,
      midtermTheory: 20,
      practical: 20,
      theory: 20,
    };
    db.sessions = [session("academic-second", "2038-03-25", "late:10")];
    scheduleFixtureSession(db.sessions[0]);
    await saveDB();
    const before = await EduV24.snapshotInstallation();
    const again = await EduV24.snapshotInstallation();
    check(
      "ACADEMIC05",
      "repeated system backups never create terms or change term identities or states",
      JSON.stringify(before.stores.catalog) ===
        JSON.stringify(again.stores.catalog) &&
        before.stores.catalog.filter((row) => row.year === "1416-1417")
          .length === 2,
    );
    const ids = before.stores.catalog
      .map((row) => row.id)
      .sort()
      .join();
    const name = secondClass.name;
    secondClass.name = "تغییر پس از پشتیبان چرخه سال";
    await saveDB();
    const confirmRestore = async () => {
      EduV24.previewFullBackup(before);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
    };
    await confirmRestore();
    const restored = await EduV24.snapshotInstallation();
    check(
      "ACADEMIC06",
      "system restore retains saved period IDs, first closed/second open states and restores saved data",
      restored.stores.catalog
        .map((row) => row.id)
        .sort()
        .join() === ids &&
        restored.stores.catalog.find((row) => row.id === first).closed &&
        !restored.stores.catalog.find((row) => row.id === second).closed &&
        EduV24.getReportContext().id === second &&
        db.schools[0].classes[0].name === name,
    );
    const request = EduV24.test
      .getConnection()
      .transaction("backups")
      .objectStore("backups")
      .getAll();
    const backups = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    check(
      "ACADEMIC07",
      "pre-restore safety backup preserves data being replaced",
      backups.some(
        (row) =>
          row.full &&
          row.label === "پیش از بازیابی کل سیستم" &&
          JSON.stringify(row.full).includes("تغییر پس از پشتیبان چرخه سال"),
      ),
    );
    await confirmRestore();
    const repeated = await EduV24.snapshotInstallation();
    check(
      "ACADEMIC08",
      "restoring the same file repeatedly never duplicates terms or renames them",
      repeated.stores.catalog
        .map((row) => row.id)
        .sort()
        .join() === ids &&
        repeated.stores.catalog
          .filter((row) => row.year === "1416-1417")
          .every((row) => ["اول", "دوم"].includes(row.term)),
    );
    const snapshot = await EduV24.prepareReportSnapshot({ annual: true });
    const grades = EduV24.annualGradeRows(
      snapshot.parts,
      school.id,
      classroom.id,
      student.id,
    );
    check(
      "ACADEMIC09",
      "annual evaluation still combines both original terms and all four stages after restore",
      snapshot.parts[0].period.id === first &&
        snapshot.parts[1].period.id === second &&
        grades[0].complete &&
        Math.abs(grades[0].final - (firstGrade + 20) / 2) < 1e-8,
    );
    goReports();
    setReportTab("karnameh");
    updateKarnamehFilter("schoolId", school.id);
    updateKarnamehFilter("classId", classroom.id);
    updateKarnamehFilter("studentId", student.id);
    for (
      let attempt = 0;
      attempt < 200 &&
      document.querySelectorAll(
        ".karnameh-year-document .report-assessment-stages .report-stage-values strong",
      ).length !== 4;
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 25));
    const displayed = [
      ...document.querySelectorAll(
        ".karnameh-year-document .report-assessment-stages .report-stage-values strong",
      ),
    ].map((element) => element.textContent);
    check(
      "ACADEMIC10",
      "karnameh displays distinct weighted grades from both original terms without an overall-average column",
      displayed.length === 4 &&
        displayed[0] === firstGrade.toFixed(2) &&
        displayed[1] === firstGrade.toFixed(2) &&
        displayed[2] === "20.00" &&
        displayed[3] === "20.00" &&
        !document.querySelector(".karnameh-year-document .report-average-cell"),
      { displayed },
    );
    const originalPrintTest = window.__EDU_PRINT_TEST__;
    try {
      window.__EDU_PRINT_TEST__ = true;
      for (const mode of ["daily", "weekly", "monthly"]) {
        goReports();
        setReportTab(mode);
        EduPeriodicReports.selectScope(school.id, classroom.id);
        EduPeriodicReports.set("date", "2037-10-24");
        const model = await EduPeriodicReports.generate();
        check(
          "TERM_SCOPE_" + mode,
          "only the selected term supplies sessions in " + mode + " reports",
          model?.summary.sessions === 0 &&
            model.academicTerm === "دوم" &&
            model.periods.length === 1 &&
            model.periods[0].id === second &&
            document
              .querySelector(".periodic-controls")
              ?.textContent.includes("فقط از ترم انتخاب‌شده") &&
            EduPeriodicReports.documentHtml(model).includes("ترم دوم") &&
            EduPeriodicReports.textReport(model).includes("ترم: دوم") &&
            EduPeriodicReports.deputyReport(model).includes("ترم: دوم") &&
            JSON.parse(JSON.stringify(model)).academicTerm === "دوم",
        );
        const printed = await EduPeriodicReports.output("print");
        check(
          "TERM_SCOPE_PRINT_" + mode,
          "print/PDF retains the selected term even for an empty " +
            mode +
            " reports",
          printed &&
            document
              .getElementById("printRoot")
              ?.textContent.includes("ترم دوم"),
        );
      }
    } finally {
      window.__EDU_PRINT_TEST__ = originalPrintTest;
      document.getElementById("printRoot")?.remove();
      document.getElementById("printPageStyle")?.remove();
    }
  } catch (error) {
    check("ACADEMIC99", "academic-year and backup lifecycle completed", false, {
      error: error.stack || error.message,
    });
  } finally {
    closeModal();
    await EduV24.test.switchLegacyPeriod(previous);
  }
  return cases;
};
