"use strict";

async function postFixFlows() {
  const cases = [],
    record = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed });
  const readAll = (store) =>
    new Promise((resolve, reject) => {
      const q = EduV24.test
        .getConnection()
        .transaction(store)
        .objectStore(store)
        .getAll();
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
  const put = async (store, value) =>
    new Promise((resolve, reject) => {
      const tx = EduV24.test.getConnection().transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  try {
    closeModal();
    const tiny = structuredClone(db),
      tinyLesson = tiny.schools[0].classes[0].lessons[0];
    for (const value of [1e-100, Number.MIN_VALUE]) {
      tinyLesson.kardaneshScores.student_a = {
        practical: value,
        theory: value,
        midtermPractical: value,
        midtermTheory: value,
      };
      const normalized = EduV24.normalizeDB(tiny),
        rows = EduV24.annualGradeRows(
          [
            { period: { term: "اول" }, data: normalized },
            { period: { term: "دوم" }, data: structuredClone(normalized) },
          ],
          "school_a",
          "class_a",
          "student_a",
        );
      record(
        value === Number.MIN_VALUE ? "P02" : "P01",
        "tiny imported grade retains its finite annual value",
        rows[0].final === value &&
          JSON.parse(JSON.stringify(rows[0])).final === value,
        { value, annual: rows[0].final },
      );
    }
    const session = db.sessions.find((s) => s.lessonId === "lesson_dual");
    openSessionModal(session);
    showSessionPanel("activity");
    for (const value of ["0", "20"]) {
      const form = document.querySelector(".session-entry-form");
      form.elements.studentId.value = "student_a";
      form.elements.type.value = "classGrade";
      form.elements.value.value = value;
      form.elements.note.value = "class grade boundary";
      await addSessionScore({ preventDefault() {}, target: form }, session.id);
      record(
        value === "0" ? "P03" : "P04",
        "class-grade endpoint persists without changing official grade",
        getSessionById(session.id).scores.some(
          (score) =>
            score.type === "classGrade" && score.value === Number(value),
        ) &&
          EduV24.assessmentResult(
            db.schools[0].classes[0].lessons[0],
            "student_a",
            "final",
          ).final === 16.2,
      );
    }
    const form = document.querySelector(".session-entry-form");
    form.elements.studentId.value = "student_a";
    form.elements.type.value = "activity";
    form.elements.value.value = "1000";
    form.elements.note.value = "legacy-compatible points";
    await addSessionScore({ preventDefault() {}, target: form }, session.id);
    record(
      "P05",
      "activity points remain distinct and keep their previous range",
      getSessionById(session.id).scores.some(
        (score) => score.type === "activity" && score.value === 1000,
      ),
    );
    const corrupt = structuredClone(db);
    corrupt.sessions[0].scores.push({
      studentId: "student_a",
      type: "classGrade",
      value: 1000,
      note: "",
    });
    let rejected = false;
    try {
      EduV24.normalizeDB(corrupt);
    } catch {
      rejected = true;
    }
    record("P06", "import cannot bypass the class-grade limit", rejected);
    const legacy = structuredClone(db);
    legacy.schemaVersion = 25;
    for (const row of legacy.sessions)
      row.scores = row.scores.filter((score) => score.type !== "classGrade");
    const migrated = EduV24.normalizeDB(legacy);
    record(
      "P07",
      "schema 25 keeps activity semantics during migration to 26",
      migrated.schemaVersion === 26 &&
        migrated.sessions.some((row) =>
          row.scores.some(
            (score) => score.type === "activity" && score.value === 1000,
          ),
        ),
    );
    const daily = EduPeriodicReports.build(db, {
      mode: "daily",
      date: session.date,
      schoolId: "school_a",
      classId: "class_a",
      studentId: "student_a",
      audience: "parent",
      detailLevel: "full",
    });
    record(
      "P08",
      "periodic and copied session reports label class grades",
      daily.sessions.some((row) =>
        row.marks.some(
          (mark) => mark.type === "classGrade" && mark.label === "نمره کلاسی",
        ),
      ) &&
        generateSessionReportText(
          getSessionById(session.id),
          db.schools[0].classes[0],
          db.schools[0].classes[0].lessons[0],
        ).includes("نمره کلاسی"),
    );
    closeModal();
    for (const school of db.schools)
      for (const c of school.classes)
        for (const l of c.lessons) {
          if (l.gradingPolicy) l.gradingPolicy.confirmed = true;
          for (const student of c.students)
            if (l.gradeMode === "kardanesh")
              l.kardaneshScores[student.id] = {
                practical: 18,
                theory: 12,
                midtermPractical: 18,
                midtermTheory: 12,
              };
            else
              for (const pod of l.poudmans)
                pod.podScores[student.id] = { m: 2, c: 2 };
        }
    await saveDB();
    const periodId = EduV24.getReportContext().id,
      beforeReports = (await readAll("reports")).filter(
        (row) => row.workspace === periodId,
      ).length;
    const closes = await Promise.allSettled([
      EduV24.finalizePeriod(),
      EduV24.finalizePeriod(),
    ]);
    const frozenRows = (await readAll("reports")).filter(
      (row) => row.workspace === periodId,
    );
    record(
      "P09",
      "concurrent term closing issues exactly one frozen report",
      EduV24.getReportContext().closed &&
        frozenRows.length === beforeReports + 1,
      {
        fulfilled: closes.filter((item) => item.status === "fulfilled").length,
        issued: frozenRows.length - beforeReports,
      },
    );
    const frozen = frozenRows.at(-1),
      frozenGrade = frozen.classes[0].students[0].lessons[0];
    record(
      "P10",
      "frozen report preserves both raw assessment pairs",
      frozenGrade.assessments?.version === 1 &&
        frozenGrade.assessments.midterm.final === 16.2 &&
        frozenGrade.assessments.final.final === 16.2,
    );
    await EduV24.showFrozenReport(frozen.id);
    record(
      "P11",
      "both assessments are visible in the frozen report",
      document.getElementById("modalBody").textContent.includes("میان‌ترم") &&
        !document.getElementById("modalBody").textContent.includes("undefined"),
    );
    const historical = structuredClone(frozen);
    historical.id = "legacy_report_without_assessments";
    for (const c of historical.classes)
      for (const st of c.students)
        for (const l of st.lessons) delete l.assessments;
    await put("reports", historical);
    await EduV24.showFrozenReport(historical.id);
    record(
      "P12",
      "historical frozen report remains readable without fabricated midterm",
      document
        .getElementById("modalBody")
        .textContent.includes("ثبت نشده در نسخه قدیمی"),
    );
    const badBackup = await EduV24.snapshotInstallation(),
      badFrozen = badBackup.stores.reports.find((row) => row.id === frozen.id);
    badFrozen.classes[0].students[0].lessons[0].assessments.midterm.practical = 99;
    let badRejected = false;
    try {
      EduV24.validateFullBackup(badBackup);
    } catch {
      badRejected = true;
    }
    record(
      "P13",
      "malformed frozen midterm cannot enter a full restore",
      badRejected,
    );
    closeModal();
    await EduV24.reopenPeriod();
    closeModal();
    const immutableBefore = JSON.stringify(
      (await readAll("reports")).find((row) => row.id === frozen.id),
    );
    db.schools[0].classes[0].lessons[0].kardaneshScores.student_a.midtermPractical = 19;
    await saveDB();
    record(
      "P14",
      "editing reopened term never rewrites its previous frozen assessments",
      JSON.stringify(
        (await readAll("reports")).find((row) => row.id === frozen.id),
      ) === immutableBefore,
    );
    db.schools[0].classes[0].lessons[0].kardaneshScores.student_a.midtermPractical = 18;
    await saveDB();
    const firstId = EduV24.getReportContext().id,
      year = EduV24.test.getState().workspace.year;
    await EduV24.openNewPeriod();
    document.getElementById("periodYear").value = year;
    document.getElementById("periodTerm").value = "دوم";
    await EduV24.createNewPeriod();
    const secondId = EduV24.getReportContext().id;
    for (const school of db.schools)
      for (const c of school.classes)
        for (const l of c.lessons)
          if (l.gradeMode === "kardanesh")
            for (const st of c.students)
              l.kardaneshScores[st.id] = {
                practical: 18,
                theory: 12,
                midtermPractical: 18,
                midtermTheory: 12,
              };
    await saveDB();
    const pair = { first: firstId, second: secondId };
    let wrongPair = false;
    try {
      await EduV24.prepareReportSnapshot({
        annual: true,
        periodIds: { first: firstId, second: firstId },
      });
    } catch {
      wrongPair = true;
    }
    record(
      "P15",
      "annual report refuses the same period in both roles",
      wrongPair,
    );
    let swapped = false;
    try {
      await EduV24.prepareReportSnapshot({
        annual: true,
        periodIds: { first: secondId, second: firstId },
      });
    } catch {
      swapped = true;
    }
    record(
      "P16",
      "known first/second roles cannot be swapped by a dropdown",
      swapped,
    );
    const otherYear = (await EduV24.snapshotInstallation()).stores.catalog.find(
      (row) => row.year !== year,
    );
    let crossYear = false;
    try {
      await EduV24.prepareReportSnapshot({
        annual: true,
        periodIds: { first: firstId, second: otherYear.id },
      });
    } catch {
      crossYear = true;
    }
    record("P17", "annual pair cannot cross academic years", crossYear);
    state.view = "reports";
    state.reportTab = "annual";
    EduPeriodicReports.selectScope("school_a", "class_a");
    render();
    await new Promise((resolve) => setTimeout(resolve, 80));
    let select = document.getElementById("annualFirstPeriod");
    select.value = firstId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    select = document.getElementById("annualSecondPeriod");
    select.value = secondId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    const annual = await EduPeriodicReports.generate();
    record(
      "P18",
      "annual dropdowns generate a report from the selected actual pair",
      annual?.periods[0].id === firstId &&
        annual.periods[1].id === secondId &&
        annual.annualGrades.find((row) => row.studentId === "student_a")
          .final === 16.2,
    );
    const annualNote = "یادداشت جفت نوبت برای بازیابی";
    EduPeriodicReports.note(annualNote);
    await EduV24.switchPeriod(firstId);
    closeModal();
    state.schoolId = "school_a";
    state.classId = "class_a";
    state.lessonId = "lesson_dual";
    showModal(
      "Pending grade",
      buildLessonGradesHtml(
        db.schools[0].classes[0],
        db.schools[0].classes[0].lessons[0],
      ),
    );
    let input = [...document.querySelectorAll("[data-grade]")].find(
      (node) =>
        node.dataset.student === "student_a" &&
        node.dataset.field === "midtermPractical",
    );
    input.value = "99";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const pendingBackup = await EduV24.snapshotInstallation();
    EduV24.validateFullBackup(pendingBackup);
    record(
      "P19",
      "backup contains invalid draft separately from valid durable grade",
      pendingBackup.gradeDrafts.some(
        (row) =>
          row.workspace === firstId &&
          row.entries.some(
            (item) =>
              item.sid === "student_a" &&
              item.field === "midtermPractical" &&
              item.value === "99",
          ),
      ) &&
        pendingBackup.stores.records.some(
          (row) =>
            row.workspace === firstId &&
            row.value?.lessons?.some(
              (l) => l.kardaneshScores?.student_a?.midtermPractical === 18,
            ),
        ),
    );
    record(
      "P20",
      "backup format declares schema 26",
      pendingBackup.schemaVersion === 26,
    );
    input.value = "18";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await EduV24.flushDrafts({ strict: true });
    closeModal();
    const ids = new Set([firstId, secondId]);
    for (const [name, rows] of Object.entries(pendingBackup.stores))
      pendingBackup.stores[name] =
        name === "catalog"
          ? rows.filter((row) => ids.has(row.id))
          : rows.filter((row) => ids.has(row.workspace));
    pendingBackup.activeWorkspace = firstId;
    pendingBackup.gradeDrafts = pendingBackup.gradeDrafts.filter((row) =>
      ids.has(row.workspace),
    );
    pendingBackup.reportDrafts = Object.fromEntries(
      Object.entries(pendingBackup.reportDrafts).filter(([id]) => ids.has(id)),
    );
    const priorIds = new Set((await readAll("catalog")).map((row) => row.id));
    EduV24.previewFullBackup(pendingBackup);
    await EduV24.restoreFullBackup();
    const newFirst = EduV24.getReportContext().id,
      newSecond = (await EduV24.listAnnualReportPeriods()).find(
        (row) => !priorIds.has(row.id) && row.termKind === "second",
      ).id;
    record(
      "P21",
      "restored invalid draft stays review-only and never becomes a grade",
      EduV24.test
        .getState()
        .drafts.some((item) => item.value === "99" && item.review) &&
        db.schools[0].classes[0].lessons[0].kardaneshScores.student_a
          .midtermPractical === 18,
    );
    const notes = EduPeriodicReports.getDrafts(newSecond);
    record(
      "P22",
      "annual note remaps both selected workspace references during restore",
      Object.entries(notes).some(
        ([key, value]) =>
          key.includes("academic-year:" + newFirst + ":" + newSecond) &&
          value === annualNote,
      ),
    );
    await EduV24.discardDrafts();
    await EduV24.switchPeriod(newSecond);
    state.view = "reports";
    state.reportTab = "annual";
    EduPeriodicReports.selectScope("school_a", "class_a");
    render();
    EduPeriodicReports.set("annualFirstId", newFirst);
    EduPeriodicReports.set("annualSecondId", newSecond);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const restoredAnnual = await EduPeriodicReports.generate();
    record(
      "P23",
      "restored two-term report preserves average and pair-specific note",
      restoredAnnual?.annualGrades.find((row) => row.studentId === "student_a")
        .final === 16.2 && restoredAnnual.note === annualNote,
    );
  } catch (error) {
    record("P99", "post-fix regression flow completed", false, {
      error: error.stack || error.message,
    });
  }
  return cases;
}

module.exports = postFixFlows;
