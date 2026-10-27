"use strict";
module.exports = async function businessConsistency() {
  const cases = [];
  const check = (id, name, pass) => cases.push({ id, name, pass: !!pass });
  const origin = EduV24.getReportContext().id;
  try {
    closeModal();
    EduV24.openNewPeriod();
    document.getElementById("periodYear").value = "1415-1416";
    document.getElementById("periodTerm").value = "اول";
    await EduV24.createNewPeriod();
    const isolated = EduV24.getReportContext().id;
    const school = db.schools[0],
      classroom = school.classes[0];
    db.schools = [school];
    school.classes = [classroom];
    classroom.lessons = [];
    classroom.students = classroom.students.slice(0, 1);
    classroom.archivedStudents = [];
    db.sessions = [];
    db.masterSchedule = {};
    await saveDB({ action: "isolated business consistency fixture" });
    goSchool(school.id);
    goClass(classroom.id);
    await EduV24.course.open("", {
      id: uid(),
      name: "آزمون یکپارچگی ضرایب",
      teacher: "",
      periodsPerWeek: 2,
      gradeMode: "kardanesh",
      poudmans: [],
      kardaneshScores: {},
      gradingPolicy: {
        ...EduPolicy.defaults("dual", "1415-1416"),
        dualConfigurable: true,
        practicalWeight: 60,
        passMin: 12,
      },
    });
    await EduV24.course.save();
    const lesson = classroom.lessons[0],
      student = classroom.students[0];
    goLesson(lesson.id);
    setTab("grades");
    for (const stage of ["midterm", "final"]) {
      document
        .querySelector(
          '#app [data-workspace-action="assessment-stage"][data-term="اول"][data-stage="' +
            stage +
            '"]',
        )
        .click();
      const field = stage === "midterm" ? "midtermPractical" : "practical";
      for (
        let attempt = 0;
        attempt < 100 &&
        !document.querySelector('#app [data-field="' + field + '"]');
        attempt++
      )
        await new Promise((resolve) => setTimeout(resolve, 10));
      for (const [component, value] of [
        [field, "20"],
        [stage === "midterm" ? "midtermTheory" : "theory", "0"],
      ]) {
        const input = document.querySelector(
          '#app [data-grade][data-student="' +
            student.id +
            '"][data-field="' +
            component +
            '"]',
        );
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await EduV24.flushDrafts({ strict: true });
      }
    }
    check(
      "BIZ01",
      "configured 60/40 grade entered through native controls is 12 and passes at 12",
      EduV24.assessmentResult(lesson, student.id).final === 12 &&
        EduV24.assessmentResult(lesson, student.id).passed === true &&
        document.querySelector("[data-assessment-final]").textContent ===
          "12.00",
    );
    await EduV24.finalizePeriod();
    check(
      "BIZ02",
      "complete new course finalizes without a removed confirmation checkbox",
      EduV24.getReportContext().closed &&
        lesson.gradingPolicy.confirmed === false,
    );
    const backup = await EduV24.snapshotInstallation();
    for (const name of Object.keys(backup.stores))
      backup.stores[name] = backup.stores[name].filter((row) =>
        name === "catalog"
          ? row.id === isolated
          : name === "undo"
            ? row.id === isolated
            : row.workspace === isolated,
      );
    backup.reportDrafts = { [isolated]: backup.reportDrafts[isolated] || {} };
    backup.gradeDrafts = backup.gradeDrafts.filter(
      (row) => row.workspace === isolated,
    );
    EduV24.validateFullBackup(backup);
    check(
      "BIZ03",
      "custom-policy frozen report survives full-backup validation",
      backup.stores.reports.length === 1 &&
        backup.stores.reports[0].classes[0].students[0].lessons[0].final === 12,
    );
    EduV24.previewFullBackup(backup);
    await EduV24.restoreFullBackup();
    const exported = await EduV24.snapshotInstallation();
    const report = exported.stores.reports.find(
      (row) => row.workspace === exported.activeWorkspace,
    );
    await EduV24.showFrozenReport(report.id);
    check(
      "BIZ04",
      "restore and historical report preserve custom grades, thresholds and closed state",
      EduV24.getReportContext().closed &&
        report.classes[0].students[0].lessons[0].assessments.final.threshold ===
          12 &&
        document.getElementById("modalBody").textContent.includes("12.00"),
    );
  } catch (error) {
    cases.push({
      id: "BIZ99",
      name: "custom grading lifecycle completes",
      pass: false,
      error: error.stack || String(error),
    });
  } finally {
    closeModal();
    await EduV24.switchPeriod(origin);
    closeModal();
  }
  return cases;
};
