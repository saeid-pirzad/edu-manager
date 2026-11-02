"use strict";

async function annualChecks() {
  const cases = [],
    record = (id, name, pass, extra = {}) =>
      cases.push({ id, name, pass: !!pass, ...extra });
  const previous = EduV24.getReportContext().id;
  try {
    if (!["اول", "دوم"].includes(EduV24.test.getState().workspace.term)) {
      let denied = false;
      try {
        await EduV24.prepareReportSnapshot({ annual: true });
      } catch (error) {
        denied = /بازیابی|چند نسخه|مبهم/.test(error.message);
      }
      record(
        "Y12",
        "restored alias cannot silently report another canonical period",
        denied,
      );
    }
    closeModal();
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = "1407-1408";
    document.getElementById("periodTerm").value = "اول";
    await EduV24.test.createLegacyPeriod();
    const first = EduV24.getReportContext().id;
    db.schools[0].classes[0].lessons[0].teacher = "دبیر نوبت اول";
    db.sessions = [
      {
        id: "annual_session",
        schoolId: "school_a",
        classId: "class_a",
        lessonId: "lesson_dual",
        date: "2028-10-25",
        period: 0,
        poudmanId: null,
        unitId: null,
        roster: structuredClone(db.schools[0].classes[0].students),
        attendance: { student_a: "present" },
        scores: [
          {
            studentId: "student_a",
            type: "positive",
            value: 1,
            note: "first term",
          },
        ],
      },
    ];
    db.schools[0].classes[0].lessons[0].kardaneshScores.student_a = {
      midtermPractical: 10,
      midtermTheory: 20,
      practical: 20,
      theory: 0,
    };
    await saveDB();
    let missing = false;
    try {
      await EduV24.prepareReportSnapshot({ annual: true });
    } catch (error) {
      missing = error.message.includes("هر دو");
    }
    record("Y01", "annual report refuses a missing second term", missing);
    for (const school of db.schools)
      for (const classroom of school.classes)
        for (const lesson of classroom.lessons) {
          for (const student of classroom.students) {
            if (lesson.gradeMode === "kardanesh")
              lesson.kardaneshScores[student.id] = {
                practical: 18,
                theory: 12,
                midtermPractical: 18,
                midtermTheory: 12,
                ...lesson.kardaneshScores[student.id],
              };
            else
              for (const pod of lesson.poudmans) {
                pod.podScores[student.id] = {
                  m: 2,
                  c: 2,
                  ...pod.podScores[student.id],
                };
                for (const unit of pod.units)
                  unit.unitScores[student.id] = {
                    m: 18,
                    p: 18,
                    ...unit.unitScores[student.id],
                  };
              }
          }
        }
    await saveDB();
    await EduV24.finalizePeriod();
    if (!EduV24.getReportContext().closed)
      throw Error("First term must close before the second starts");
    closeModal();
    await EduV24.test.prepareLegacyPeriodFixture();
    document.getElementById("periodYear").value = "1407-1408";
    document.getElementById("periodTerm").value = "دوم";
    await EduV24.test.createLegacyPeriod();
    db.schools[0].classes[0].lessons[0].teacher = "دبیر نوبت دوم";
    db.sessions = [
      {
        id: "annual_session",
        schoolId: "school_a",
        classId: "class_a",
        lessonId: "lesson_dual",
        date: "2029-03-25",
        period: 0,
        poudmanId: null,
        unitId: null,
        roster: structuredClone(db.schools[0].classes[0].students),
        attendance: { student_a: "absent" },
        scores: [
          {
            studentId: "student_a",
            type: "negative",
            value: 1,
            note: "second term",
          },
        ],
      },
    ];
    db.schools[0].classes[0].lessons[0].kardaneshScores.student_a = {
      midtermPractical: 18,
      midtermTheory: 12,
      practical: 20,
      theory: 20,
    };
    await saveDB();
    const snapshot = await EduV24.prepareReportSnapshot({ annual: true });
    record(
      "Y02",
      "annual snapshot includes both terms and distinct session identities",
      snapshot.parts.length === 2 &&
        snapshot.data.sessions.length === 2 &&
        new Set(snapshot.data.sessions.map((x) => x.id)).size === 2,
    );
    EduPeriodicReports.render("annual");
    EduPeriodicReports.selectScope("school_a", "class_a");
    const model = await EduPeriodicReports.generate();
    record(
      "Y13",
      "annual sessions use shared current course teacher while preserving their source term in exports",
      model?.sessions[0].teacher === "دبیر نوبت دوم" &&
        model?.sessions[1].teacher === "دبیر نوبت دوم" &&
        model.sessions[0].academicTerm === "اول" &&
        model.sessions[1].academicTerm === "دوم" &&
        model.sessions[0].sourcePeriodId === first &&
        EduPeriodicReports.documentHtml(model).includes("نوبت اول") &&
        EduPeriodicReports.textReport(model).includes("نوبت دوم") &&
        EduPeriodicReports.deputyReport(model).includes("نوبت: اول"),
    );
    const installation = await EduV24.snapshotInstallation();
    record(
      "Y15",
      "shared teacher edits preserve the original teacher in the closed term frozen report",
      installation.stores.reports
        .filter((report) => report.workspace === first)
        .some((report) =>
          report.classes.some((classroom) =>
            classroom.students.some((student) =>
              student.lessons.some(
                (lesson) =>
                  lesson.id === "lesson_dual" &&
                  lesson.teacher === "دبیر نوبت اول",
              ),
            ),
          ),
        ),
    );
    record(
      "Y03",
      "annual report combines both terms within academic year",
      model?.summary.sessions === 2 &&
        model.periods.length === 2 &&
        model.summary.present === 1 &&
        model.summary.absent === 1,
    );
    record(
      "Y11",
      "annual summary skips empty calendar rows while JSON retains all days",
      !EduPeriodicReports.documentHtml(model).includes(faDate("2028-09-23")) &&
        model.days.some((day) => day.date === "2028-09-23"),
    );
    record(
      "Y04",
      "annual report enumerates complete academic year",
      model?.start === "2028-09-22" &&
        model.end === "2029-09-21" &&
        model.days.length === 365,
      { start: model?.start, end: model?.end, days: model?.days.length },
    );
    EduPeriodicReports.set("audience", "parent");
    EduPeriodicReports.set("studentId", "student_a");
    const parent = await EduPeriodicReports.generate();
    record(
      "Y14",
      "annual presentation does not misstate all custom policies as fixed 70/30",
      !EduPeriodicReports.documentHtml(parent).includes("۷۰٪") &&
        !parent.definitions.some((text) => text.includes("۷۰٪")),
    );
    record(
      "Y10",
      "annual report shows one shared modular course for the selected student",
      parent?.technicalGrades.length === 1 &&
        parent.technicalGrades.every(
          (row) =>
            row.studentId === "student_a" &&
            row.modules.length === 1 &&
            row.term === "سالانه",
        ) &&
        EduPeriodicReports.textReport(parent).includes("پودمان"),
    );
    record(
      "Y09",
      "annual report displays and exports four assessments and equal average",
      parent?.annualGrades.length === 1 &&
        parent.annualGrades[0].final === 15.8 &&
        EduPeriodicReports.textReport(parent).includes("15.80") &&
        EduPeriodicReports.documentHtml(parent).includes("15.80"),
    );
    record(
      "Y05",
      "annual parent report isolates selected student",
      parent?.students.length === 1 &&
        parent.students[0].studentId === "student_a" &&
        parent.sessions.every((s) =>
          s.participants.every((st) => st.studentId === "student_a"),
        ),
    );
    const connection = EduV24.test.getConnection();
    const read = (id) =>
      new Promise((resolve, reject) => {
        const q = connection
          .transaction("catalog")
          .objectStore("catalog")
          .get(id);
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
    const write = (value) =>
      new Promise((resolve, reject) => {
        const tx = connection.transaction("catalog", "readwrite");
        tx.objectStore("catalog").put(value);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    const original = await read(first);
    await write({ ...original, revision: original.revision + 1 });
    let conflict = false;
    try {
      await EduV24.assertReportSnapshot(snapshot.context);
    } catch {
      conflict = true;
    }
    record("Y06", "annual output guard detects change in other term", conflict);
    await write(original);
    const second = EduV24.getReportContext().id;
    await EduV24.switchPeriod(first);
    await EduV24.reopenPeriod();
    closeModal();
    await openSettingsModal();
    document.getElementById("newPass").value = "annual-access";
    await saveSettings();
    await EduV24.switchPeriod(second);
    const oldPrompt = window.prompt;
    window.prompt = () => null;
    let denied = false;
    try {
      await EduV24.prepareReportSnapshot({ annual: true });
    } catch {
      denied = true;
    }
    record(
      "Y07",
      "protected other term cannot be read without its password",
      denied,
    );
    window.prompt = () => "annual-access";
    const authorized = await EduV24.prepareReportSnapshot({ annual: true });
    window.prompt = oldPrompt;
    record(
      "Y08",
      "correct other-term password permits annual snapshot",
      authorized.parts.length === 2,
    );
  } catch (error) {
    record("Y99", "annual flow completed", false, {
      error: error.stack || error.message,
    });
  } finally {
    closeModal();
    await EduV24.switchPeriod(previous);
  }
  return cases;
}

module.exports = annualChecks;
