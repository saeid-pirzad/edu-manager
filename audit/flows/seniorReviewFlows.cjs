"use strict";

async function seniorReviewFlows() {
  const results = [],
    record = (id, name, pass, observed) =>
      results.push({ id, name, pass: !!pass, observed });
  const original = structuredClone(db),
    cloned = () => structuredClone(original);
  const lesson = (data) =>
    data.schools
      .find((s) => s.id === "school_a")
      .classes.find((c) => c.id === "class_a")
      .lessons.find((l) => l.id === "lesson_dual");
  const parts = (a, b) => [
    { period: { term: "اول" }, data: a },
    { period: { term: "دوم" }, data: b },
  ];
  try {
    const tiny = cloned();
    lesson(tiny).kardaneshScores.student_a = {
      practical: 1e-100,
      theory: 1e-100,
      midtermPractical: 1e-100,
      midtermTheory: 1e-100,
    };
    let accepted = false,
      grade;
    try {
      const normalized = EduV24.normalizeDB(tiny);
      accepted = true;
      grade = EduV24.annualGradeRows(
        parts(normalized, structuredClone(normalized)),
        "school_a",
        "class_a",
        "student_a",
      )[0];
    } catch (error) {
      record(
        "R01",
        "accepted imported grades produce a finite annual result",
        false,
        { error: error.message },
      );
    }
    if (accepted)
      record(
        "R01",
        "accepted imported grades produce a finite annual result",
        Number.isFinite(grade.final),
        {
          importAccepted: accepted,
          complete: grade.complete,
          annualFinal: String(grade.final),
          serializedFinal: JSON.parse(JSON.stringify(grade)).final,
        },
      );
    const edge = cloned();
    lesson(edge).kardaneshScores.student_a = {
      practical: 13.999999,
      theory: 14,
      midtermPractical: 13.999999,
      midtermTheory: 14,
    };
    const edgeRow = EduV24.annualGradeRows(
      parts(edge, structuredClone(edge)),
      "school_a",
      "class_a",
      "student_a",
    )[0];
    record(
      "R02",
      "rounded display does not turn a failing annual grade into a pass",
      edgeRow.passed === false && EduV24.finalText(edgeRow).includes("کمتر"),
      {
        final: edgeRow.final,
        passed: edgeRow.passed,
        display: EduV24.finalText(edgeRow),
      },
    );
    const legacy = cloned(),
      legacyLesson = legacy.schools[0].classes[0].lessons.find(
        (l) => l.id === "lesson_modular",
      );
    delete legacyLesson.gradingPolicy;
    for (const pod of legacyLesson.poudmans) delete pod.podScores;
    legacyLesson.poudmans[0].units[0].unitScores.student_a = { m: 18, p: 16 };
    const validLegacy = EduV24.normalizeDB(legacy);
    const technical = EduV24.annualTechnicalRows(
      parts(validLegacy, structuredClone(validLegacy)),
      "school_a",
      "class_a",
      "student_a",
    );
    const model = EduPeriodicReports.build(validLegacy, {
      mode: "annual",
      date: "2026-10-25",
      schoolId: "school_a",
      classId: "class_a",
      studentId: "student_a",
      audience: "parent",
      detailLevel: "summary",
    });
    model.technicalGrades = technical;
    const html = EduPeriodicReports.documentHtml(model),
      text = EduPeriodicReports.textReport(model);
    record(
      "R03",
      "legacy technical grade is present in annual display and text",
      technical.every(
        (row) =>
          row.final === null ||
          (html.includes(EduV24.finalText(row)) &&
            text.includes(EduV24.finalText(row))),
      ),
      {
        rows: technical.map((row) => ({
          term: row.term,
          final: row.final,
          modules: row.modules.length,
        })),
        has1680: html.includes("16.80"),
        textHas1680: text.includes("16.80"),
      },
    );
    const priorWorkspace = EduV24.getReportContext().id,
      backup = await EduV24.snapshotInstallation();
    const pair = ["اول", "دوم"].map((term) =>
      backup.stores.catalog.find(
        (period) => period.year === "1407-1408" && period.term === term,
      ),
    );
    if (pair.some((period) => !period))
      throw Error("Two-term fixture missing.");
    const pairIds = new Set(pair.map((period) => period.id));
    for (const [name, rows] of Object.entries(backup.stores))
      backup.stores[name] =
        name === "catalog"
          ? rows.filter((row) => pairIds.has(row.id))
          : rows.filter((row) => pairIds.has(row.workspace));
    backup.activeWorkspace = pair[1].id;
    backup.gradeDrafts = backup.gradeDrafts.filter((row) =>
      pairIds.has(row.workspace),
    );
    backup.reportDrafts = Object.fromEntries(
      Object.entries(backup.reportDrafts).filter(([id]) => pairIds.has(id)),
    );
    const beforeIds = new Set(
      (await EduV24.snapshotInstallation()).stores.catalog.map(
        (period) => period.id,
      ),
    );
    EduV24.previewFullBackup(backup);
    await EduV24.restoreFullBackup();
    const imported = await EduV24.listAnnualReportPeriods(),
      second = EduV24.getReportContext().id,
      first = imported.find(
        (period) => !beforeIds.has(period.id) && period.termKind === "first",
      );
    let annualError = "",
      annual;
    const originalPrompt = window.prompt;
    window.prompt = () => "annual-access";
    try {
      annual = await EduV24.prepareReportSnapshot({
        annual: true,
        periodIds: { first: first.id, second },
      });
    } catch (error) {
      annualError = error.message;
    } finally {
      window.prompt = originalPrompt;
    }
    record(
      "R04",
      "restored academic year can be selected for annual report",
      !annualError &&
        annual.parts[0].period.id === first.id &&
        annual.parts[1].period.id === second,
      {
        activeTerm: EduV24.test.getState().workspace.term,
        error: annualError,
        selected: annual?.parts.map((part) => part.period.id),
      },
    );
    await EduV24.switchPeriod(priorWorkspace);
    db = cloned();
    for (const school of db.schools)
      for (const c of school.classes)
        for (const l of c.lessons) {
          if (l.gradingPolicy) l.gradingPolicy.confirmed = true;
          if (l.gradeMode === "kardanesh") {
            for (const st of c.students)
              l.kardaneshScores[st.id] = { practical: 18, theory: 12 };
          } else
            for (const pod of l.poudmans)
              for (const st of c.students)
                pod.podScores[st.id] = { m: 2, c: 2 };
        }
    await saveDB();
    await EduV24.finalizePeriod();
    record(
      "R05",
      "period completeness requires midterm and final components",
      !EduV24.getReportContext().closed,
      {
        closed: EduV24.getReportContext().closed,
        midterm: EduV24.assessmentResult(
          db.schools[0].classes[0].lessons[0],
          "student_a",
          "midterm",
        ).final,
        final: EduV24.assessmentResult(
          db.schools[0].classes[0].lessons[0],
          "student_a",
          "final",
        ).final,
      },
    );
    if (EduV24.getReportContext().closed) await EduV24.reopenPeriod();
    closeModal();
    state.schoolId = "school_a";
    state.classId = "class_a";
    state.lessonId = "lesson_dual";
    showModal(
      "Audit invalid input",
      buildLessonGradesHtml(
        db.schools[0].classes[0],
        db.schools[0].classes[0].lessons[0],
      ),
    );
    const input = [...document.querySelectorAll("[data-grade]")].find(
      (x) =>
        x.dataset.student === "student_a" &&
        x.dataset.field === "midtermPractical",
    );
    input.value = "99";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    let backupError = "";
    try {
      await EduV24.snapshotInstallation();
    } catch (error) {
      backupError = error.message;
    }
    record(
      "R06",
      "durable backup remains available with invalid uncommitted grade",
      !backupError,
      { error: backupError, drafts: EduV24.getReportContext().pendingDrafts },
    );
    input.value = "18";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await EduV24.flushDrafts({ strict: true });
    closeModal();
    goSchool("school_a");
    goClass("class_a");
    goLesson("lesson_modular");
    const form = document.querySelector(".session-create-form");
    const existing = db.sessions.find((x) => x.lessonId === "lesson_dual");
    form.elements.date.value = existing.date;
    form.elements.period.value = String(existing.period + 1);
    const oldConfirm = window.confirm;
    let confirmation = "";
    window.confirm = (message) => {
      confirmation = message;
      return true;
    };
    await addManualSession(
      { preventDefault() {}, target: form },
      "lesson_modular",
    );
    window.confirm = oldConfirm;
    record(
      "R07",
      "starting a lesson cannot silently open another lesson's session",
      currentSessionId !== existing.id ||
        confirmation.includes(
          db.schools[0].classes[0].lessons.find((l) => l.id === "lesson_dual")
            .name,
        ),
      {
        requestedLesson: "lesson_modular",
        openedLesson: getSessionById(currentSessionId)?.lessonId,
        confirmation,
      },
    );
    closeModal();
    const before = db.sessions.find((x) => x.id === existing.id).scores.length;
    openSessionModal(getSessionById(existing.id));
    showSessionPanel("activity");
    const activityForm = document.querySelector(".session-entry-form");
    activityForm.elements.studentId.value = "student_a";
    activityForm.elements.type.value = "classGrade";
    activityForm.elements.value.value = "1000";
    activityForm.elements.note.value = "";
    let markError = "";
    try {
      await addSessionScore(
        { preventDefault() {}, target: activityForm },
        existing.id,
      );
    } catch (error) {
      markError = error.message;
    }
    record(
      "R08",
      "class-grade control distinguishes a 0-20 grade from activity points",
      !!markError || getSessionById(existing.id).scores.length === before,
      {
        error: markError,
        storedValue: getSessionById(existing.id).scores.at(-1)?.value,
        controlLabel: "نمره کلاسی (۰ تا ۲۰)",
      },
    );
    closeModal();
  } catch (error) {
    record("R99", "senior review flow completed", false, {
      error: error.stack || error.message,
    });
  }
  return results;
}

module.exports = seniorReviewFlows;
