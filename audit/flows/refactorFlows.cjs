"use strict";

async function refactorFlows() {
  const results = [];
  const record = (id, name, pass, details = {}) =>
    results.push({ id, name, pass: !!pass, ...details });
  const readAll = (store) =>
    new Promise((resolve, reject) => {
      const request = EduV24.test
        .getConnection()
        .transaction(store, "readonly")
        .objectStore(store)
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const changeStore = (store, action) =>
    new Promise((resolve, reject) => {
      const tx = EduV24.test.getConnection().transaction(store, "readwrite");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      action(tx.objectStore(store));
    });
  const currentClass = () => db.schools[0].classes[0];
  try {
    const descriptors = new Map(
      ["practical", "theory", "m", "c"].map((key) => [
        key,
        Object.getOwnPropertyDescriptor(Object.prototype, key),
      ]),
    );
    let inherited;
    try {
      for (const [key, value] of [
        ["practical", 18],
        ["theory", 18],
        ["m", 2],
        ["c", 2],
      ])
        Object.defineProperty(Object.prototype, key, {
          value,
          configurable: true,
          writable: true,
        });
      const c = currentClass();
      inherited = {
        dual: calcStudentLesson(c, c.lessons[0], "student_b").final,
        modular: calcStudentLesson(c, c.lessons[1], "student_b").final,
      };
    } finally {
      for (const [key, descriptor] of descriptors)
        descriptor
          ? Object.defineProperty(Object.prototype, key, descriptor)
          : delete Object.prototype[key];
    }
    record(
      "F01",
      "inherited properties do not become unentered grades",
      inherited.dual === null && inherited.modular === null,
      inherited,
    );
    state.schoolId = "school_a";
    state.classId = "class_a";
    state.lessonId = currentClass().lessons[0].id;
    showModal(
      "ثبت نمره آزمایشی",
      buildLessonGradesHtml(currentClass(), currentClass().lessons[0]),
    );
    const finalStage = document.querySelector(
      '#modalBody [data-workspace-action="assessment-stage"][data-stage="final"][data-term="' +
        EduV24.getReportContext().term +
        '"]',
    );
    finalStage.click();
    for (
      let attempt = 0;
      attempt < 100 &&
      !document.querySelector(
        '#modalBody [data-grade][data-field="practical"]',
      );
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    for (const [field, value] of [
      ["practical", "18"],
      ["theory", "12"],
    ]) {
      const input = [
        ...document.querySelectorAll("#modalBody [data-grade]"),
      ].find(
        (x) => x.dataset.student === "student_b" && x.dataset.field === field,
      );
      if (!input) throw Error("Grade input missing: " + field);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await EduV24.flushDrafts({ strict: true });
    }
    record(
      "F02",
      "native grade inputs persist a valid weighted result",
      calcStudentLesson(currentClass(), currentClass().lessons[0], "student_b")
        .final === 16.2,
    );
    const beforeUndo = EduV24.getReportContext().revision;
    const undoResults = await Promise.all([
      EduV24.undoLast(),
      EduV24.undoLast(),
    ]);
    const grade = currentClass().lessons[0].kardaneshScores.student_b;
    record(
      "F03",
      "concurrent undo executes once and preserves previous component",
      undoResults.filter(Boolean).length === 1 &&
        EduV24.getReportContext().revision === beforeUndo + 1 &&
        grade.practical === 18 &&
        grade.theory == null,
      { undoResults },
    );
    const context = EduV24.getReportContext();
    const recordsBefore = JSON.stringify(await readAll("records")),
      catalogBefore = JSON.stringify(await readAll("catalog"));
    await changeStore("undo", (store) =>
      store.put({
        id: context.id,
        revision: context.revision,
        action: "بازگردانی خراب آزمایشی",
        before: [{ key: "meta", value: null }],
      }),
    );
    let rejectedUndo = "";
    try {
      await EduV24.undoLast();
    } catch (error) {
      rejectedUndo = error.message;
    }
    record(
      "F04",
      "invalid durable undo cannot change records or catalog",
      !!rejectedUndo &&
        JSON.stringify(await readAll("records")) === recordsBefore &&
        JSON.stringify(await readAll("catalog")) === catalogBefore,
      { error: rejectedUndo },
    );
    await changeStore("undo", (store) => store.delete(context.id));
    const initialName = currentClass().name;
    currentClass().name = "نام موقت برای آزمون بازگردانی";
    await saveDB({ classId: "class_a", action: "ویرایش نام ساختگی" });
    await EduV24.undoLast();
    record(
      "F05",
      "writer accepts a valid save and undo after rejected undo",
      currentClass().name === initialName,
    );
    currentClass().name = "نام محفوظ در خطای نوشتن";
    await saveDB({ classId: "class_a", action: "آزمون شکست بازگردانی" });
    const stable = JSON.stringify(await readAll("records")),
      stableRevision = EduV24.getReportContext().revision;
    EduV24.test.failNextWrite();
    let writeError = "";
    try {
      await EduV24.undoLast();
    } catch (error) {
      writeError = error.message;
    }
    record(
      "F06",
      "failed undo write keeps durable data and revision",
      !!writeError &&
        stable === JSON.stringify(await readAll("records")) &&
        stableRevision === EduV24.getReportContext().revision,
      { error: writeError },
    );
    await EduV24.undoLast();
    record(
      "F07",
      "undo can be retried after failed write",
      currentClass().name === initialName,
    );
    currentClass().name = "نام انتقالی با بازگردانی معتبر";
    await saveDB({ classId: "class_a", action: "آزمون حمل بازگردانی" });
    const versionOne = await EduV24.snapshotInstallation(),
      previousWorkspace = EduV24.getReportContext().id;
    versionOne.version = 1;
    delete versionOne.gradeDrafts;
    EduV24.previewFullBackup(versionOne);
    await EduV24.restoreFullBackup();
    await EduV24.undoLast();
    record(
      "F08",
      "version-one full restore preserves executable undo and record ownership",
      EduV24.getReportContext().id !== previousWorkspace &&
        currentClass().name === initialName,
    );
    for (const school of db.schools)
      for (const c of school.classes)
        for (const l of c.lessons)
          if (l.gradeMode === "kardanesh") {
            for (const student of c.students)
              l.kardaneshScores[student.id] = {
                practical: 18,
                theory: 12,
                midtermPractical: 18,
                midtermTheory: 12,
              };
          } else {
            for (const pod of l.poudmans)
              for (const student of c.students)
                pod.podScores[student.id] = { m: 2, c: 2 };
          }
    await saveDB({ action: "تکمیل نمرات ساختگی برای کارنامه" });
    await EduV24.finalizePeriod();
    const frozen = (await readAll("reports")).find(
      (row) => row.workspace === EduV24.getReportContext().id,
    );
    if (!frozen) throw Error("A valid period did not create a frozen report");
    await EduV24.showFrozenReport(frozen.id);
    record(
      "F09",
      "valid dual/modular final report is issued and displayed",
      EduV24.getReportContext().closed &&
        !document
          .getElementById("modalBody")
          .textContent.includes("undefined") &&
        document.getElementById("modalBody").textContent.includes("16.20"),
    );
    const unsafeText = '<img src=x onerror="window.__auditUnsafeReport=true">';
    const literal = structuredClone(frozen);
    literal.id = "literal_reason_report";
    literal.classes[0].students[0].lessons[0].reason = unsafeText;
    await changeStore("reports", (store) => store.put(literal));
    window.__auditUnsafeReport = false;
    await EduV24.showFrozenReport(literal.id);
    await new Promise((resolve) => setTimeout(resolve, 60));
    record(
      "F10",
      "frozen report reason is rendered as text and cannot execute markup",
      !window.__auditUnsafeReport &&
        !document.querySelector("#modalBody img") &&
        document.getElementById("modalBody").textContent.includes(unsafeText),
    );
    const versionTwo = await EduV24.snapshotInstallation();
    EduV24.validateFullBackup(versionTwo);
    const source = EduV24.getReportContext().id;
    EduV24.previewFullBackup(versionTwo);
    await EduV24.restoreFullBackup();
    const restored = (await readAll("reports")).find(
      (row) =>
        row.workspace === EduV24.getReportContext().id &&
        row.classes[0].students[0].lessons[0].reason !== unsafeText,
    );
    if (!restored)
      throw Error("Valid frozen report did not survive full restore");
    await EduV24.showFrozenReport(restored.id);
    record(
      "F11",
      "version-two restore preserves closed period and frozen historical snapshot",
      EduV24.getReportContext().id !== source &&
        EduV24.getReportContext().closed &&
        JSON.stringify(restored.classes) === JSON.stringify(frozen.classes),
    );
  } catch (error) {
    record("F99", "refactor integration flow completed", false, {
      error: error.stack || error.message,
    });
  }
  return results;
}

module.exports = refactorFlows;
