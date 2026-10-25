"use strict";

async function contextFlows() {
  const cases = [],
    record = (id, name, pass, details = {}) =>
      cases.push({ id, name, pass: !!pass, ...details });
  const context = () => EduV24.getReportContext();
  const rows = (store) =>
    new Promise((resolve, reject) => {
      const q = EduV24.test
        .getConnection()
        .transaction(store)
        .objectStore(store)
        .getAll();
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
  try {
    closeModal();
    await EduV24.reopenPeriod();
    closeModal();
    const gradingClass = db.schools[0].classes[0],
      gradingLesson = gradingClass.lessons[0];
    const oldFinal = EduV24.assessmentResult(
      gradingLesson,
      "student_b",
      "final",
    ).final;
    const oldMidtermTheory =
      gradingLesson.kardaneshScores.student_b?.midtermTheory ?? null;
    state.schoolId = "school_a";
    state.classId = "class_a";
    state.lessonId = gradingLesson.id;
    showModal(
      "Midterm test",
      buildLessonGradesHtml(gradingClass, gradingLesson),
    );
    document.querySelector(".assessment-stage").open = true;
    for (const [field, value] of [
      ["midtermPractical", "16"],
      ["midtermTheory", "20"],
    ]) {
      const input = [...document.querySelectorAll("[data-grade]")].find(
        (x) => x.dataset.student === "student_b" && x.dataset.field === field,
      );
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await EduV24.flushDrafts({ strict: true });
    }
    record(
      "G12",
      "native midterm inputs persist independent weighted result",
      EduV24.assessmentResult(gradingLesson, "student_b", "midterm").final ===
        17.2 &&
        EduV24.assessmentResult(gradingLesson, "student_b", "final").final ===
          oldFinal,
    );
    record(
      "G13",
      "midterm result refreshes in visible editor",
      [...document.querySelectorAll("[data-assessment-final]")].find(
        (x) =>
          x.dataset.assessmentFinal === "student_b" &&
          x.dataset.stage === "midterm",
      )?.textContent === "17.20",
    );
    await EduV24.undoLast();
    const currentLesson = db.schools[0].classes[0].lessons[0];
    record(
      "G14",
      "midterm undo preserves final components",
      (currentLesson.kardaneshScores.student_b.midtermTheory ?? null) ===
        oldMidtermTheory &&
        currentLesson.kardaneshScores.student_b.midtermPractical === 16 &&
        EduV24.assessmentResult(currentLesson, "student_b", "final").final ===
          oldFinal,
    );
    closeModal();
    await openSettingsModal();
    closeModal();
    const gradeBackup = await EduV24.snapshotInstallation();
    EduV24.validateFullBackup(gradeBackup);
    record(
      "G15",
      "full backup retains midterm components",
      gradeBackup.stores.records.some((row) =>
        row.value?.lessons?.some(
          (lesson) =>
            lesson.kardaneshScores?.student_b?.midtermPractical === 16,
        ),
      ),
    );
    EduV24.previewFullBackup(gradeBackup);
    await EduV24.restoreFullBackup();
    record(
      "G16",
      "full restore preserves midterm and prior final scores",
      db.schools[0].classes[0].lessons[0].kardaneshScores.student_b
        .midtermPractical === 16 &&
        EduV24.assessmentResult(
          db.schools[0].classes[0].lessons[0],
          "student_b",
          "final",
        ).final === oldFinal,
    );
    const session = db.sessions[0];
    closeModal();
    openSessionModal(session);
    const absent = document.querySelector(
      ".att-btns[data-sid=student_a] .absent",
    );
    await toggleAtt(absent, "absent");
    record(
      "J01",
      "attendance action saves from simplified session",
      getSessionById(session.id).attendance.student_a === "absent",
    );
    showSessionPanel("activity");
    const sessionForm = document.querySelector(".session-entry-form");
    sessionForm.elements.studentId.value = "student_a";
    sessionForm.elements.type.value = "classGrade";
    sessionForm.elements.value.value = "18";
    sessionForm.elements.note.value = "session workflow test";
    await addSessionScore(
      { preventDefault() {}, target: sessionForm },
      session.id,
    );
    record(
      "J02",
      "activity form saves class mark and keeps active panel",
      getSessionById(session.id).scores.some(
        (score) =>
          score.studentId === "student_a" &&
          score.type === "classGrade" &&
          score.value === 18,
      ) && !document.querySelector("[data-session-panel=activity]").hidden,
    );
    closeModal();
    await openSettingsModal();
    const revision = context().revision;
    record(
      "C01",
      "settings no-op does not create a revision",
      (await saveSettings()) && context().revision === revision,
    );
    await openSettingsModal();
    document.getElementById("newPass").value = "private-test-secret";
    document.getElementById("removePassword").checked = true;
    record(
      "C02",
      "contradictory password settings rejected with form retained",
      !(await saveSettings()) &&
        !db.settings.password &&
        !!document.querySelector("#settingsError").textContent,
    );
    document.getElementById("removePassword").checked = false;
    record(
      "C03",
      "password not exposed in form baseline",
      !document
        .getElementById("settingsEditor")
        .dataset.savedState?.includes("private-test-secret"),
    );
    record(
      "C04",
      "real password hash persists and verifies",
      (await saveSettings()) &&
        (await verifyPassword("private-test-secret", db.settings.password)),
    );
    await openSettingsModal();
    document.getElementById("removePassword").checked = true;
    record(
      "C05",
      "password removal persists",
      (await saveSettings()) && !db.settings.password,
    );
    await openSettingsModal();
    document.getElementById("newPass").value = "retry-secret";
    EduV24.test.failNextWrite();
    const failed = await saveSettings();
    record(
      "C06",
      "failed settings write retains retryable form and durable password",
      !failed &&
        document.getElementById("newPass")?.value === "retry-secret" &&
        !(await rows("records")).find(
          (x) => x.workspace === context().id && x.key === "meta",
        )?.value.settings.password,
    );
    record(
      "C07",
      "settings retry persists intended password",
      (await saveSettings()) &&
        (await verifyPassword("retry-secret", db.settings.password)),
    );
    await openSettingsModal();
    document.getElementById("removePassword").checked = true;
    await saveSettings();
    const original = hashPassword;
    await openSettingsModal();
    document.getElementById("newPass").value = "race-secret";
    hashPassword = () =>
      new Promise((resolve) => (window.__releaseHash = resolve));
    const saving = saveSettings();
    for (let i = 0; i < 100 && !window.__releaseHash; i++)
      await new Promise((r) => setTimeout(r, 5));
    closeModal();
    record(
      "C08",
      "busy settings form cannot be closed",
      !document.getElementById("modal").classList.contains("hidden"),
    );
    db.schools[0].name += " race";
    await saveDB();
    window.__releaseHash("should-never-be-written");
    const raced = await saving;
    hashPassword = original;
    delete window.__releaseHash;
    record(
      "C09",
      "revision change during hashing rejects save without changing password",
      !raced &&
        !db.settings.password &&
        !!document.getElementById("settingsError").textContent,
    );
    document.getElementById("newPass").value = "";
    closeModal();

    const activeId = context().id,
      other = (await rows("catalog")).find((x) => x.id !== activeId);
    if (!other) throw Error("Second period fixture missing");
    await openSettingsModal();
    document.getElementById("newPass").value = "wrong-period-secret";
    hashPassword = () =>
      new Promise((resolve) => (window.__releaseHash = resolve));
    const switchingSave = saveSettings();
    for (let i = 0; i < 100 && !window.__releaseHash; i++)
      await new Promise((r) => setTimeout(r, 5));
    const beforeCatalog = JSON.stringify(
      (await rows("records")).filter((x) => x.key === "meta"),
    );
    await EduV24.switchPeriod(other.id);
    window.__releaseHash("must-not-write");
    const switchResult = await switchingSave;
    hashPassword = original;
    delete window.__releaseHash;
    record(
      "C16",
      "period switch during hashing leaves both periods unchanged",
      !switchResult &&
        JSON.stringify(
          (await rows("records")).filter((x) => x.key === "meta"),
        ) === beforeCatalog,
    );
    document.getElementById("newPass").value = "";
    closeModal();
    await EduV24.switchPeriod(activeId);
    const reports = EduPeriodicReports;
    reports.render("daily");
    reports.selectScope("school_a", "class_a");
    reports.set("date", "2026-10-24");
    const daily = await reports.generate();
    record(
      "C17",
      "daily report generated from durable snapshot",
      !!daily && reports.getLast() === daily,
    );
    reports.render("weekly");
    record(
      "C18",
      "weekly report generated from durable snapshot",
      !!(await reports.generate()),
    );
    reports.set("audience", "parent");
    reports.set("studentId", "student_a");
    const parent = await reports.generate();
    record(
      "C19",
      "parent report includes current student grades",
      parent?.audience === "parent" && parent.currentGrades.length === 2,
    );
    const prepare = EduV24.prepareReportSnapshot;
    let release;
    EduV24.prepareReportSnapshot = async () => {
      const data = await prepare();
      await new Promise((resolve) => (release = resolve));
      return data;
    };
    const pendingReport = reports.generate();
    for (let i = 0; i < 100 && !release; i++)
      await new Promise((r) => setTimeout(r, 5));
    reports.author("changed during preparation");
    release();
    const changed = await pendingReport;
    EduV24.prepareReportSnapshot = prepare;
    record(
      "C20",
      "changing report text during preparation discards obsolete output",
      changed === null && reports.getLast() === null,
    );

    const snap = await EduV24.prepareReportSnapshot();
    record(
      "C10",
      "report snapshot matches current durable workspace",
      snap.context.id === context().id &&
        snap.context.revision === context().revision &&
        snap.data.schools[0].name === db.schools[0].name,
    );
    snap.data.schools[0].name = "detached snapshot";
    record(
      "C11",
      "report snapshot mutations cannot change live data",
      db.schools[0].name !== "detached snapshot",
    );
    db.schools[0].name += " newer";
    await saveDB();
    let stale = false;
    try {
      await EduV24.assertReportSnapshot(snap.context);
    } catch {
      stale = true;
    }
    record("C12", "report snapshot rejected after local commit", stale);
    const current = await EduV24.prepareReportSnapshot();
    await new Promise((resolve, reject) => {
      const tx = EduV24.test
          .getConnection()
          .transaction("catalog", "readwrite"),
        s = tx.objectStore("catalog"),
        q = s.get(current.context.id);
      q.onsuccess = () =>
        s.put({ ...q.result, revision: q.result.revision + 1 });
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    let remote = false;
    try {
      await EduV24.assertReportSnapshot(current.context);
    } catch {
      remote = true;
    }
    record(
      "C13",
      "catalog revision conflict detected without BroadcastChannel",
      remote && context().blocked,
    );
    let denied = false;
    try {
      await EduV24.prepareReportSnapshot();
    } catch {
      denied = true;
    }
    record("C14", "blocked tab cannot prepare another report", denied);
    let prints = 0;
    const originalPrint = window.print;
    window.print = () => prints++;
    const printed = await EduV24.printReport();
    window.print = originalPrint;
    record(
      "C15",
      "blocked tab cannot print",
      printed === false && prints === 0,
    );

    let downloads = 0;
    const originalDownload = downloadLocalFile;
    downloadLocalFile = () => downloads++;
    const json = await EduPeriodicReports.output("json"),
      txt = await EduPeriodicReports.output("txt");
    downloadLocalFile = originalDownload;
    record(
      "C21",
      "blocked tab cannot export daily or weekly files",
      json === false && txt === false && downloads === 0,
    );
  } catch (error) {
    record("C99", "context flow completed", false, {
      error: error.stack || error.message,
    });
  }
  return cases;
}

module.exports = contextFlows;
