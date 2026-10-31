"use strict";
module.exports = async function academicBackupLifecycle() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed });
  const previous = EduV24.getReportContext().id;
  try {
    closeModal();
    await EduV24.openNewPeriod();
    document.getElementById("periodYear").value = "1416-1417";
    document.getElementById("periodTerm").value = "اول";
    await EduV24.createNewPeriod();
    const first = EduV24.getReportContext().id;
    await EduV24.openNewPeriod();
    document.getElementById("periodYear").value = "1416-1417";
    document.getElementById("periodTerm").value = "دوم";
    let premature = false;
    try {
      await EduV24.createNewPeriod();
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
      "the next-term action selects second term of the same year",
      document.getElementById("periodYear").value === "1416-1417" &&
        document.getElementById("periodTerm").value === "دوم",
    );
    await EduV24.createNewPeriod();
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
  } catch (error) {
    check("ACADEMIC99", "academic-year and backup lifecycle completed", false, {
      error: error.stack || error.message,
    });
  } finally {
    closeModal();
    await EduV24.switchPeriod(previous);
  }
  return cases;
};
