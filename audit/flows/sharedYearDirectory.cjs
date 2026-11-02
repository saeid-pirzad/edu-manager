"use strict";

// Runs only inside data-integrity's isolated browser and real IndexedDB.
module.exports = async function sharedYearDirectory() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    year = "1440-1441",
    sentinelYear = "1441-1442",
    ids = {
      school: "shared_year_school",
      classroom: "shared_year_class",
      student: "shared_year_student",
      lesson: "shared_year_dual",
    },
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const detail = [...document.querySelectorAll('[role="alert"]')]
        .map((element) => element.textContent.trim())
        .filter(Boolean)
        .join(" | ");
      throw Error("Shared academic-year directory UI timed out: " + detail);
    },
    classRecord = (snapshot, periodId) =>
      snapshot.stores.records.find(
        (row) =>
          row.workspace === periodId &&
          row.logical === "class:" + ids.classroom,
      )?.value,
    metaRecord = (snapshot, periodId) =>
      snapshot.stores.records.find(
        (row) => row.workspace === periodId && row.logical === "meta",
      )?.value,
    directory = (snapshot, periodId) =>
      JSON.stringify({
        layout: metaRecord(snapshot, periodId)?.layout,
        classes: snapshot.stores.records
          .filter(
            (row) =>
              row.workspace === periodId && row.logical.startsWith("class:"),
          )
          .map(({ value }) => ({
            id: value.id,
            name: value.name,
            students: value.students,
            archivedStudents: value.archivedStudents,
          })),
      }),
    sessionData = (snapshot, terms) =>
      JSON.stringify(
        snapshot.stores.records
          .filter(
            (row) =>
              terms.includes(row.workspace) &&
              row.logical.startsWith("session:"),
          )
          .map((row) => {
            const copy = structuredClone(row);
            delete copy.value.roster;
            return copy;
          }),
      ),
    writeFixture = async (rows, periods = []) => {
      const tx = EduV24.test
          .getConnection()
          .transaction(["records", "catalog"], "readwrite"),
        done = new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onabort = () =>
            reject(tx.error || Error("Shared-directory fixture write aborted"));
          tx.onerror = () => reject(tx.error);
        });
      for (const row of rows) tx.objectStore("records").put(row);
      for (const row of periods) tx.objectStore("catalog").put(row);
      await done;
    },
    stored = (snapshot) =>
      JSON.stringify({
        catalog: snapshot.stores.catalog,
        records: snapshot.stores.records,
        events: snapshot.stores.events,
        undo: snapshot.stores.undo,
      }),
    openClass = () => {
      closeModal();
      goSchool(ids.school);
      goClass(ids.classroom);
      setTab("students");
    },
    submit = (selector) => {
      const form = document.querySelector(selector);
      if (!form) throw Error("Shared directory form missing: " + selector);
      const details = form.closest("details");
      if (details) details.open = true;
      form.requestSubmit();
    },
    createPeriod = async (targetYear, term, firstId = "") => {
      closeModal();
      await EduV24.test.prepareLegacyPeriodFixture();
      document.getElementById("periodYear").value = targetYear;
      document.getElementById("periodTerm").value = term;
      await EduV24.test.createLegacyPeriod();
      return EduV24.getReportContext().id;
    },
    addStudentThroughForm = async (name, code, expectFailure = false) => {
      openClass();
      document.getElementById("studentCreateName").value = name;
      document.getElementById("studentCreateCode").value = code;
      submit('form[data-entity-create="student"]');
      await wait(
        () =>
          db.schools[0].classes[0].students.some((st) => st.code === code) ||
          document.getElementById("studentCreateError")?.textContent,
      );
      await wait(
        () =>
          !document.querySelector(
            'form[data-entity-create="student"][aria-busy="true"]',
          ),
      );
      await EduV24.test.settle().catch((error) => {
        if (!expectFailure) throw error;
      });
    };
  let original = null,
    originalPut = null;
  try {
    closeModal();
    await EduV24.test.settle();
    original = await EduV24.snapshotInstallation();
    const first = await createPeriod(year, "اول"),
      source = db.schools
        .flatMap((school) => school.classes)
        .flatMap((classroom) => classroom.lessons)
        .find(
          (lesson) =>
            lesson.gradeMode === "kardanesh" &&
            lesson.gradingPolicy?.subjectType !== "general",
        );
    if (!source) throw Error("A valid vocational dual lesson is required");
    const lesson = structuredClone(source);
    lesson.id = ids.lesson;
    lesson.kardaneshScores = {
      [ids.student]: {
        midtermPractical: 18,
        midtermTheory: 12,
        practical: 16,
        theory: 14,
      },
    };
    const student = { id: ids.student, name: "هنرجوی مشترک", code: "1" };
    db.schools = [
      {
        id: ids.school,
        name: "مدرسه مشترک سال",
        classes: [
          {
            id: ids.classroom,
            name: "کلاس مشترک سال",
            students: [student],
            archivedStudents: [],
            lessons: [lesson],
          },
        ],
      },
    ];
    db.masterSchedule = {};
    db.sessions = [
      {
        id: "shared_year_first_session",
        date: "2061-10-24",
        period: 0,
        schoolId: ids.school,
        classId: ids.classroom,
        lessonId: ids.lesson,
        poudmanId: null,
        unitId: null,
        roster: [structuredClone(student)],
        attendance: { [ids.student]: "leave" },
        scores: [],
      },
    ];
    await saveDB({ action: "آماده‌سازی آزمون فهرست مشترک سال" });
    await EduV24.finalizePeriod();
    if (!EduV24.getReportContext().closed)
      throw Error("Shared-directory fixture first term did not close");
    const second = await createPeriod(year, "دوم", first);
    const secondClass = db.schools[0].classes[0];
    secondClass.lessons[0].kardaneshScores[ids.student] = {
      midtermPractical: 20,
      midtermTheory: 18,
      practical: 19,
      theory: 17,
    };
    db.sessions = [
      {
        id: "shared_year_second_session",
        date: "2062-03-25",
        period: 1,
        schoolId: ids.school,
        classId: ids.classroom,
        lessonId: ids.lesson,
        poudmanId: null,
        unitId: null,
        roster: [structuredClone(student)],
        attendance: { [ids.student]: "present" },
        scores: [],
      },
    ];
    await saveDB({ action: "ثبت سوابق مستقل نوبت دوم برای آزمون" });
    const sentinel = await createPeriod(sentinelYear, "اول");
    const sentinelBefore = await EduV24.snapshotInstallation(),
      sentinelRows = stored({
        stores: Object.fromEntries(
          ["catalog", "records", "events", "undo"].map((name) => [
            name,
            sentinelBefore.stores[name].filter(
              (row) => row.workspace === sentinel || row.id === sentinel,
            ),
          ]),
        ),
      });
    const legacySessions = sentinelBefore.stores.records
        .filter(
          (row) =>
            [first, second].includes(row.workspace) &&
            row.logical.startsWith("session:"),
        )
        .map((row) => {
          const copy = structuredClone(row);
          delete copy.value.roster;
          return copy;
        }),
      legacyPeriods = sentinelBefore.stores.catalog
        .filter((row) => [first, second].includes(row.id))
        .map((row) => ({ ...row, revision: row.revision + 1 }));
    await writeFixture(legacySessions, legacyPeriods);
    await EduV24.switchPeriod(second);
    openClass();
    const baseline = await EduV24.snapshotInstallation(),
      frozen = JSON.stringify(
        baseline.stores.reports.filter((row) => row.workspace === first),
      ),
      histories = sessionData(baseline, [first, second]),
      lessonRows = [first, second].map((periodId) =>
        JSON.stringify(classRecord(baseline, periodId).lessons),
      );
    check(
      "SHARED_YEAR01",
      "the same academic year begins with one ordered directory and independent term grades",
      directory(baseline, first) === directory(baseline, second) &&
        lessonRows[0] !== lessonRows[1] &&
        baseline.stores.catalog.find((row) => row.id === first).closed,
    );

    await openEditStudentModal(ids.student);
    document.getElementById("editStudentName").value = "سعید پیرزاد";
    document.getElementById("editStudentCode").value = "101";
    submit("#studentEditor");
    await wait(
      () => !document.querySelector("#modal:not(.hidden) #studentEditor"),
    );
    await EduV24.test.settle();
    let snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR02",
      "real student-edit submission updates one identity in open and closed terms",
      [first, second].every((periodId) => {
        const st = classRecord(snapshot, periodId).students[0];
        return (
          st.id === ids.student &&
          st.name === "سعید پیرزاد" &&
          st.code === "101"
        );
      }),
    );

    check(
      "SHARED_YEAR13",
      "legacy sessions without stored rosters freeze the original identity in both terms before shared rename",
      legacySessions.length === 2 &&
        snapshot.stores.records
          .filter(
            (row) =>
              [first, second].includes(row.workspace) &&
              row.logical.startsWith("session:"),
          )
          .every(
            (row) =>
              row.value.roster?.length === 1 &&
              row.value.roster[0].id === student.id &&
              row.value.roster[0].name === student.name &&
              row.value.roster[0].code === student.code,
          ) &&
        sessionData(snapshot, [first, second]) === histories,
    );

    await addStudentThroughForm("هنرجوی تازه", "102");
    snapshot = await EduV24.snapshotInstallation();
    const added = classRecord(snapshot, second).students.find(
      (st) => st.code === "102",
    );
    check(
      "SHARED_YEAR03",
      "real add-student submission appends the same new enrollment ID in both terms",
      !!added &&
        [first, second].every(
          (periodId) =>
            classRecord(snapshot, periodId)
              .students.map((st) => st.id)
              .join() === [ids.student, added.id].join(),
        ),
    );
    if (!added) throw Error("Shared student addition did not complete");
    openClass();
    await deleteStudent(ids.student);
    submit('form[data-workspace-submit="save-membership"]');
    await wait(
      () =>
        !document.querySelector(
          '#modal:not(.hidden) form[data-workspace-submit="save-membership"]',
        ),
    );
    await EduV24.test.settle();
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR04",
      "archiving enrollment updates both terms while retaining its historical owner",
      [first, second].every((periodId) => {
        const cls = classRecord(snapshot, periodId);
        return (
          !cls.students.some((st) => st.id === ids.student) &&
          cls.archivedStudents.filter((st) => st.id === ids.student).length ===
            1
        );
      }),
    );
    await restoreStudent(ids.student);
    submit('form[data-workspace-submit="save-membership"]');
    await wait(
      () =>
        !document.querySelector(
          '#modal:not(.hidden) form[data-workspace-submit="save-membership"]',
        ),
    );
    await EduV24.test.settle();
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR05",
      "restore reactivates exactly one common enrollment without duplicating archived rows",
      [first, second].every((periodId) => {
        const cls = classRecord(snapshot, periodId);
        return (
          cls.students.map((st) => st.id).join() ===
            [added.id, ids.student].join() &&
          !cls.archivedStudents.some((st) => st.id === ids.student)
        );
      }),
    );

    for (const [kind, key, name] of [
      ["school", ids.school, "هنرستان مشترک اصلاح‌شده"],
      ["class", ids.classroom, "یازدهم شبکه مشترک"],
    ]) {
      await EduV24.openEntityEditor(kind, key, ids.school);
      document.getElementById("entityEditName").value = name;
      submit('form[data-workspace-submit="save-entity"]');
      await wait(
        () => !document.querySelector("#modal:not(.hidden) #entityEditName"),
      );
      await EduV24.test.settle();
    }
    goSchool(ids.school);
    document.getElementById("classCreateName").value = "کلاس جدید مشترک";
    submit('form[data-entity-create="class"]');
    await wait(() => db.schools[0].classes.length === 2);
    await EduV24.test.settle();
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR06",
      "real school/class edits and class creation preserve one matching year directory",
      directory(snapshot, first) === directory(snapshot, second) &&
        metaRecord(snapshot, first).layout[0].name ===
          "هنرستان مشترک اصلاح‌شده" &&
        classRecord(snapshot, first).name === "یازدهم شبکه مشترک" &&
        metaRecord(snapshot, first).layout[0].classes.length === 2,
    );
    check(
      "SHARED_YEAR07",
      "shared directory writes preserve term grades, historical attendance and frozen reports",
      [first, second].every(
        (periodId, index) =>
          JSON.stringify(classRecord(snapshot, periodId).lessons) ===
          lessonRows[index],
      ) &&
        sessionData(snapshot, [first, second]) === histories &&
        JSON.stringify(
          snapshot.stores.reports.filter((row) => row.workspace === first),
        ) === frozen &&
        snapshot.stores.catalog.find((row) => row.id === first).closed,
    );

    await addStudentThroughForm("هنرجوی موقت برای بازگردانی", "105");
    let undoError = "";
    try {
      await EduV24.undoLast();
    } catch (error) {
      undoError = error.message;
    }
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR14",
      "undo of a new enrollment with no historical references removes it from both term directories",
      !undoError &&
        directory(snapshot, first) === directory(snapshot, second) &&
        [first, second].every(
          (periodId) =>
            !classRecord(snapshot, periodId).students.some(
              (st) => st.code === "105",
            ),
        ),
      { undoError },
    );
    if (undoError) {
      // Continue other independent checks after recording the undo regression.
      const temporary = db.schools[0].classes[0].students.find(
        (st) => st.code === "105",
      );
      if (temporary) {
        await deleteStudent(temporary.id);
        submit('form[data-workspace-submit="save-membership"]');
        await wait(
          () =>
            !document.querySelector(
              '#modal:not(.hidden) form[data-workspace-submit="save-membership"]',
            ),
        );
        await EduV24.test.settle();
      }
    }

    const beforeFailure = await EduV24.snapshotInstallation();
    EduV24.test.failNextWrite();
    await addStudentThroughForm("نباید ثبت شود", "103", true);
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR08",
      "forced write failure restores the live roster and leaves both stored terms untouched",
      stored(snapshot) === stored(beforeFailure) &&
        !db.schools[0].classes[0].students.some((st) => st.code === "103") &&
        !!document.getElementById("studentCreateError")?.textContent,
    );

    let failedCompanion = false;
    originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (
        !failedCompanion &&
        this.name === "records" &&
        value.workspace === first &&
        value.logical === "class:" + ids.classroom &&
        value.value.students.some((st) => st.code === "104")
      ) {
        failedCompanion = true;
        throw new DOMException("Companion write failure", "QuotaExceededError");
      }
      return originalPut.call(this, value, ...args);
    };
    try {
      await addStudentThroughForm("نباید نیمه ثبت شود", "104", true);
    } finally {
      IDBObjectStore.prototype.put = originalPut;
      originalPut = null;
    }
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR09",
      "a failure in real companion IndexedDB writes rolls back source, companion, revisions and history",
      failedCompanion &&
        stored(snapshot) === stored(beforeFailure) &&
        !db.schools[0].classes[0].students.some((st) => st.code === "104"),
      { failedCompanion },
    );
    const sentinelAfter = stored({
      stores: Object.fromEntries(
        ["catalog", "records", "events", "undo"].map((name) => [
          name,
          snapshot.stores[name].filter(
            (row) => row.workspace === sentinel || row.id === sentinel,
          ),
        ]),
      ),
    });
    check(
      "SHARED_YEAR10",
      "same school/class/student IDs in another academic year remain byte-identical",
      sentinelAfter === sentinelRows,
    );
    for (let pass = 0; pass < 2; pass++) {
      await EduV24.switchPeriod(first);
      await EduV24.switchPeriod(second);
    }
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR11",
      "repeated term switches keep the same directory order without creating duplicate enrollment",
      directory(snapshot, first) === directory(snapshot, second) &&
        [first, second].every((periodId) => {
          const cls = classRecord(snapshot, periodId);
          return (
            cls.students.length === 2 &&
            new Set(cls.students.map((st) => st.id)).size === 2
          );
        }),
    );
    check(
      "SHARED_YEAR12",
      "one full-system file still validates after cross-term directory edits and failures",
      EduV24.validateFullBackup(snapshot).length ===
        snapshot.stores.catalog.length,
    );
    const beforeDelete = await EduV24.snapshotInstallation();
    openClass();
    await deleteClass(ids.classroom);
    document.getElementById("deleteEntityName").value =
      db.schools[0].classes[0].name;
    submit('form[data-workspace-submit="confirm-deletion"]');
    await wait(
      () =>
        document.getElementById("deleteEntityError")?.textContent ||
        !document.querySelector(
          '#modal:not(.hidden) form[data-workspace-submit="confirm-deletion"]',
        ),
    );
    await EduV24.test.settle().catch(() => {});
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR15",
      "deleting a common class is blocked when a companion term owns grades or attendance",
      stored(snapshot) === stored(beforeDelete) &&
        !!document.getElementById("deleteEntityError")?.textContent &&
        db.schools[0].classes.some((cls) => cls.id === ids.classroom),
    );
    closeModal();

    const emptyClassId = metaRecord(snapshot, second).layout[0].classes.find(
        (id) => id !== ids.classroom,
      ),
      peerEmptyClass = structuredClone(
        snapshot.stores.records.find(
          (row) =>
            row.workspace === first && row.logical === "class:" + emptyClassId,
        ),
      ),
      peerEmptyPeriod = {
        ...snapshot.stores.catalog.find((row) => row.id === first),
      },
      peerDefinition = structuredClone(classRecord(snapshot, first).lessons[0]);
    if (!peerEmptyClass) throw Error("Empty shared class fixture is missing");
    peerDefinition.id = "shared_year_peer_definition";
    peerDefinition.name = "تعریف درس ویژه نوبت اول";
    peerDefinition.kardaneshScores = {};
    peerEmptyClass.value.lessons = [peerDefinition];
    peerEmptyPeriod.revision++;
    await writeFixture([peerEmptyClass], [peerEmptyPeriod]);
    const beforeSuccessfulDelete = await EduV24.snapshotInstallation();
    openClass();
    await deleteClass(emptyClassId);
    document.getElementById("deleteEntityName").value =
      peerEmptyClass.value.name;
    submit('form[data-workspace-submit="confirm-deletion"]');
    await wait(
      () =>
        document.getElementById("deleteEntityError")?.textContent ||
        !document.querySelector(
          '#modal:not(.hidden) form[data-workspace-submit="confirm-deletion"]',
        ),
    );
    await EduV24.test.settle().catch(() => {});
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR17",
      "deleting an unused shared class removes it from every term without altering another class",
      [first, second].every(
        (periodId) =>
          !snapshot.stores.records.some(
            (row) =>
              row.workspace === periodId &&
              row.logical === "class:" + emptyClassId,
          ) &&
          !metaRecord(snapshot, periodId).layout[0].classes.includes(
            emptyClassId,
          ),
      ) &&
        directory(snapshot, first) === directory(snapshot, second) &&
        [first, second].every(
          (periodId, index) =>
            JSON.stringify(classRecord(snapshot, periodId).lessons) ===
            lessonRows[index],
        ),
    );
    const safetyRequest = EduV24.test
        .getConnection()
        .transaction("backups")
        .objectStore("backups")
        .getAll(),
      safetyBackups = await new Promise((resolve, reject) => {
        safetyRequest.onsuccess = () => resolve(safetyRequest.result);
        safetyRequest.onerror = () => reject(safetyRequest.error);
      }),
      deletionSafety = safetyBackups.find(
        (backup) =>
          backup.full &&
          backup.label === "پیش از حذف: " + peerEmptyClass.value.name &&
          stored(backup.full) === stored(beforeSuccessfulDelete),
      );
    let safetyValid = false;
    if (deletionSafety)
      safetyValid =
        EduV24.validateFullBackup(deletionSafety.full).length ===
        beforeSuccessfulDelete.stores.catalog.length;
    check(
      "SHARED_YEAR18",
      "shared-class deletion keeps a validated complete safety file including companion-only course definitions",
      safetyValid &&
        JSON.stringify(
          deletionSafety.full.stores.records.find(
            (row) =>
              row.workspace === first &&
              row.logical === "class:" + emptyClassId,
          )?.value,
        ) === JSON.stringify(peerEmptyClass.value) &&
        deletionSafety.full.stores.catalog.find((row) => row.id === first)
          .closed,
    );
    closeModal();
    const beforeDeleteUndo = await EduV24.snapshotInstallation();
    let deleteUndoRejected = false;
    try {
      await EduV24.undoLast();
    } catch {
      deleteUndoRejected = true;
    }
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR19",
      "shared-class deletion disables single-term undo and leaves full safety restore as the recovery path",
      deleteUndoRejected &&
        !snapshot.stores.undo.some((row) => [first, second].includes(row.id)) &&
        stored(snapshot) === stored(beforeDeleteUndo),
    );
    closeModal();

    const conflictClass = structuredClone(
        snapshot.stores.records.find(
          (row) =>
            row.workspace === first && row.logical === "class:" + ids.classroom,
        ),
      ),
      conflictPeriod = {
        ...snapshot.stores.catalog.find((row) => row.id === first),
      };
    conflictClass.value.students.find((st) => st.id === ids.student).name =
      "نام متعارض در سوابق قدیمی";
    conflictPeriod.revision++;
    await writeFixture([conflictClass], [conflictPeriod]);
    const beforeConflict = await EduV24.snapshotInstallation();
    openClass();
    await openEditStudentModal(ids.student);
    document.getElementById("editStudentName").value =
      "این ویرایش نباید ثبت شود";
    submit("#studentEditor");
    await wait(
      () =>
        document.getElementById("studentEditError")?.textContent ||
        !document.querySelector("#modal:not(.hidden) #studentEditor"),
    );
    await EduV24.test.settle().catch(() => {});
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_YEAR16",
      "conflicting legacy companion identity rejects a shared edit without partially changing either term",
      stored(snapshot) === stored(beforeConflict) &&
        !!document.getElementById("studentEditError")?.textContent &&
        db.schools[0].classes[0].students.find((st) => st.id === ids.student)
          .name === "سعید پیرزاد",
    );
  } catch (error) {
    check(
      "SHARED_YEAR99",
      "shared academic-year directory browser flow completed",
      false,
      {
        error: error.stack || error.message,
      },
    );
  } finally {
    if (originalPut) IDBObjectStore.prototype.put = originalPut;
    if (original) {
      try {
        closeModal();
        EduV24.previewFullBackup(original);
        document.getElementById("fullRestoreConfirmed").checked = true;
        await EduV24.restoreFullBackup();
      } catch (error) {
        check(
          "SHARED_YEAR_CLEANUP",
          "isolated browser fixture restores its starting installation",
          false,
          {
            error: error.stack || error.message,
          },
        );
      }
    }
    closeModal();
  }
  return cases;
};
