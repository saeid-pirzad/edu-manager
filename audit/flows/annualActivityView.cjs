"use strict";
module.exports = async function annualActivityView() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id: "YEAR_ACTIVITY_" + id, name, pass: !!pass, observed }),
    ids = {
      first: "annual_activity_first",
      second: "annual_activity_second",
      school: "annual_activity_school",
      a: "annual_activity_a",
      b: "annual_activity_b",
      lesson: "annual_activity_lesson",
      otherLesson: "annual_activity_other",
      s1: "annual_activity_student1",
      s2: "annual_activity_student2",
      old: "annual_activity_first_session",
      oldLater: "annual_activity_first_later",
      recent: "annual_activity_second_session",
    },
    year = "1405-1406",
    date = "2026-11-01",
    wait = async (predicate) => {
      for (let n = 0; n < 250; n++) {
        if (predicate()) return;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw Error(
        "Annual activity UI timeout: " +
          (document.querySelector(".year-session-notice p")?.textContent ||
            document.getElementById("periodicError")?.textContent ||
            EduV24.test.getState().status?.message ||
            ""),
      );
    },
    restore = async (file) => {
      closeModal();
      EduV24.previewFullBackup(file);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
      await EduV24.test.settle();
    },
    session = (snapshot, period, id) =>
      snapshot.stores.records.find(
        (row) => row.workspace === period && row.logical === "session:" + id,
      )?.value,
    store = (snapshot) =>
      JSON.stringify(
        Object.fromEntries(
          ["catalog", "records", "events", "undo", "reports"].map((name) => [
            name,
            snapshot.stores[name],
          ]),
        ),
      ),
    openLesson = async () => {
      closeModal();
      goSchool(ids.school);
      goClass(ids.a);
      goLesson(ids.lesson);
      await wait(
        () =>
          document.querySelector(".session-directory")?.dataset.yearScope ===
          year,
      );
    },
    report = async (mode, audience = "management", targetDate = date) => {
      closeModal();
      goReports();
      state.reportTab = mode;
      EduPeriodicReports.selectScope(ids.school, ids.a);
      Object.assign(EduPeriodicReports.filters, {
        mode,
        date: targetDate,
        audience,
        studentId: audience === "parent" ? ids.s1 : "",
        detailLevel: "full",
      });
      render();
      return await EduPeriodicReports.generate();
    };
  let original = null;
  try {
    await EduV24.test.settle();
    original = await EduV24.snapshotInstallation();
    const fixture = structuredClone(original),
      students = [
        { id: ids.s1, name: "هنرجوی مصنوعی اول", code: "1" },
        { id: ids.s2, name: "هنرجوی مصنوعی دوم", code: "2" },
      ];
    fixture.activeWorkspace = ids.second;
    fixture.gradeDrafts = [];
    fixture.reportDrafts = {};
    fixture.snapshotNotes = [];
    for (const name of Object.keys(fixture.stores)) fixture.stores[name] = [];
    for (const [id, term, kind] of [
      [ids.first, "اول", "first"],
      [ids.second, "دوم", "second"],
    ]) {
      const offset = id === ids.first ? 0 : 2,
        makeMeeting = (sessionId, targetDate, period, attendance) => ({
          id: sessionId,
          schoolId: ids.school,
          classId: ids.a,
          lessonId: ids.lesson,
          date: targetDate,
          period,
          poudmanId: null,
          unitId: null,
          roster: structuredClone(students),
          attendance,
          scores: [
            {
              studentId: ids.s1,
              type: "classGrade",
              value: 17,
              note: "فعالیت مصنوعی",
            },
          ],
        }),
        data = EduV24.normalizeDB({
          ...defaultDB(),
          settings: {
            ...db.settings,
            academicYear: year,
            academicTerm: term,
            password: "",
          },
          schools: [
            {
              id: ids.school,
              name: "هنرستان مصنوعی فعالیت سالانه",
              classes: [
                {
                  id: ids.a,
                  name: "یازدهم شبکه آزمایشی",
                  students: structuredClone(students),
                  archivedStudents: [],
                  lessons: [
                    {
                      id: ids.lesson,
                      name: "مهارت شبکه سالانه",
                      teacher: "دبیر آزمایشی",
                      gradeMode: "kardanesh",
                      poudmans: [],
                      gradingPolicy: {
                        ...EduPolicy.defaults("dual", year),
                        confirmed: true,
                        code: "YEAR-ACTIVITY",
                      },
                      kardaneshScores: {
                        [ids.s1]: {
                          midtermPractical: 16 + offset,
                          midtermTheory: 12 + offset,
                          practical: 18 + offset,
                          theory: 14 + offset,
                        },
                      },
                    },
                  ],
                },
                {
                  id: ids.b,
                  name: "کلاس دیگر مصنوعی",
                  students: [],
                  archivedStudents: [],
                  lessons: [
                    {
                      id: ids.otherLesson,
                      name: "درس دیگر مصنوعی",
                      gradeMode: "kardanesh",
                      poudmans: [],
                      gradingPolicy: EduPolicy.defaults("dual", year),
                      kardaneshScores: {},
                    },
                  ],
                },
              ],
            },
          ],
          masterSchedule: {},
          migrationWarnings: [],
          sessions:
            id === ids.first
              ? [
                  makeMeeting(ids.old, date, 0, {
                    [ids.s1]: "absent",
                    [ids.s2]: "late:7",
                  }),
                  makeMeeting(ids.oldLater, date, 2, {
                    [ids.s1]: "absent",
                    [ids.s2]: "leave",
                  }),
                ]
              : [
                  makeMeeting(ids.recent, "2026-11-02", 1, {
                    [ids.s1]: "late:5",
                    [ids.s2]: "present",
                  }),
                ],
        }),
        { schools, sessions, ...meta } = data;
      meta.layout = schools.map((school) => ({
        id: school.id,
        name: school.name,
        classes: school.classes.map((c) => c.id),
      }));
      fixture.stores.catalog.push({
        id,
        year,
        term,
        termKind: kind,
        closed: false,
        revision: 1,
        createdAt: "2026-11-02T00:00:00Z",
        updatedAt: "2026-11-02T00:00:00Z",
      });
      for (const [logical, value] of [
        ["meta", meta],
        ...schools[0].classes.map((c) => ["class:" + c.id, c]),
        ...sessions.map((s) => ["session:" + s.id, s]),
      ])
        fixture.stores.records.push({
          key: id + "|" + logical,
          workspace: id,
          logical,
          value,
        });
    }
    await restore(fixture);
    await openLesson();
    let buttons = [
      ...document.querySelectorAll(".session-directory .session-open"),
    ];
    check(
      "01",
      "the lesson directory shows all three stored sessions across the academic year",
      buttons.length === 3 &&
        document
          .querySelector(".session-directory")
          .textContent.includes("همهٔ جلسات"),
    );
    check(
      "02",
      "annual session list preserves descending date and bell order",
      buttons.length === 3 &&
        buttons[0].getAttribute("data-legacy-click-arg0") === ids.recent &&
        buttons[1].dataset.key === ids.oldLater &&
        buttons[2].dataset.key === ids.old,
    );
    const beforeOwner = await EduV24.snapshotInstallation(),
      peerBefore = JSON.stringify(session(beforeOwner, ids.second, ids.recent));
    document
      .querySelector(
        '.session-open[data-workspace="' +
          ids.first +
          '"][data-key="' +
          ids.old +
          '"]',
      )
      .click();
    await wait(
      () =>
        EduV24.getReportContext().id === ids.first &&
        currentSessionId === ids.old &&
        !!document.querySelector("#modal:not(.hidden) #sessDate"),
    );
    check(
      "03",
      "opening a historical card navigates to its owning record without copying or minting sessions",
      EduV24.getReportContext().id === ids.first &&
        currentSessionId === ids.old &&
        (await EduV24.snapshotInstallation()).stores.records.filter((row) =>
          row.logical.startsWith("session:"),
        ).length === 3,
    );
    document
      .querySelector('.att-btns[data-sid="' + ids.s1 + '"] .present')
      .click();
    await wait(
      () =>
        db.sessions.find((s) => s.id === ids.old).attendance[ids.s1] ===
        "present",
    );
    await EduV24.test.settle();
    let saved = await EduV24.snapshotInstallation();
    check(
      "04",
      "historical attendance correction writes only the original term session",
      session(saved, ids.first, ids.old).attendance[ids.s1] === "present" &&
        JSON.stringify(session(saved, ids.second, ids.recent)) === peerBefore,
    );
    const form = document.querySelector(".session-entry-form");
    form.elements.studentId.value = ids.s1;
    form.elements.type.value = "positive";
    form.elements.value.value = "1";
    form.elements.note.value = "پیگیری فعالیت سالانه";
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await wait(
      () => db.sessions.find((s) => s.id === ids.old).scores.length === 2,
    );
    await EduV24.test.settle();
    saved = await EduV24.snapshotInstallation();
    check(
      "05",
      "historical class activity remains attached to the original session and peer activity is unchanged",
      session(saved, ids.first, ids.old).scores.some(
        (score) => score.type === "positive",
      ) &&
        JSON.stringify(session(saved, ids.second, ids.recent)) === peerBefore,
    );
    await EduV24.switchPeriod(ids.second);
    const secondDaily = await report("daily"),
      secondWeek = await report("weekly"),
      secondMonth = await report("monthly");
    await EduV24.switchPeriod(ids.first);
    const firstDaily = await report("daily"),
      firstWeek = await report("weekly"),
      firstMonth = await report("monthly");
    check(
      "06",
      "daily reports read only the selected term, including a genuinely empty second-term day",
      secondDaily?.summary.sessions === 0 &&
        secondDaily.academicTerm === "دوم" &&
        firstDaily?.summary.sessions === 2 &&
        firstDaily.academicTerm === "اول" &&
        secondDaily.periods.length === 1 &&
        secondDaily.periods[0].id === ids.second &&
        firstDaily.periods[0].id === ids.first,
    );
    check(
      "07",
      "weekly and monthly reports preserve distinct term attendance and activity totals",
      secondWeek?.summary.sessions === 1 &&
        secondMonth?.summary.sessions === 1 &&
        firstWeek?.summary.sessions === 2 &&
        firstMonth?.summary.sessions === 2 &&
        secondWeek.summary.recordedMarks === 1 &&
        firstWeek.summary.recordedMarks === 3,
    );
    await EduV24.switchPeriod(ids.second);
    const parent = await report("daily", "parent", "2026-11-02");
    check(
      "08",
      "parent attendance is current-term/student-only while its clearly labeled annual grades retain both terms",
      parent?.summary.sessions === 1 &&
        parent.academicTerm === "دوم" &&
        parent.summary.absent === 0 &&
        parent.summary.present === 0 &&
        parent.summary.late === 1 &&
        parent.periods.length === 1 &&
        parent.periods[0].id === ids.second &&
        parent.gradePeriods.length === 2 &&
        parent.annualGrades.some(
          (grade) => grade.complete && grade.components.length === 4,
        ) &&
        parent.definitions.some((text) =>
          text.includes("فقط مربوط به ترم انتخاب‌شده"),
        ) &&
        parent.sessions.every((s) =>
          s.participants.every((st) => st.studentId === ids.s1),
        ) &&
        !EduPeriodicReports.textReport(parent).includes(students[1].name),
    );
    const completeAnnual = await report("annual");
    check(
      "14",
      "annual reporting still combines both original terms and all four grade stages",
      completeAnnual?.summary.sessions === 3 &&
        completeAnnual.academicTerm === "اول و دوم" &&
        completeAnnual.periods.length === 2 &&
        completeAnnual.annualGrades.some(
          (grade) => grade.complete && grade.components.length === 4,
        ),
    );
    await report("daily");
    EduPeriodicReports.note("یادداشت فقط ترم دوم");
    await EduV24.switchPeriod(ids.first);
    const firstNote = await report("daily");
    EduPeriodicReports.note("یادداشت فقط ترم اول");
    await EduV24.switchPeriod(ids.second);
    const secondNote = await report("daily");
    check(
      "15",
      "date-filtered report notes stay with their owning term across real switches",
      !firstNote.note.includes("یادداشت فقط ترم دوم") &&
        secondNote.note === "یادداشت فقط ترم دوم" &&
        !secondNote.note.includes("یادداشت فقط ترم اول"),
    );
    const partial = structuredClone(fixture);
    partial.activeWorkspace = ids.first;
    partial.stores.catalog = partial.stores.catalog.filter(
      (row) => row.id === ids.first,
    );
    partial.stores.records = partial.stores.records.filter(
      (row) => row.workspace === ids.first,
    );
    await restore(partial);
    const annual = await report("annual");
    check(
      "09",
      "a first-only year can produce a partial annual report without inventing second-term grades",
      annual?.summary.sessions === 2 &&
        annual.periods.length === 1 &&
        annual.annualGrades.length > 0 &&
        annual.annualGrades.every(
          (grade) => !grade.complete && grade.final === null,
        ),
      { error: document.getElementById("periodicError")?.textContent },
    );
    await openLesson();
    check(
      "10",
      "the annual lesson directory works before the second term starts",
      document.querySelectorAll(".session-directory .session-open").length ===
        2 && !document.querySelector(".year-session-notice"),
    );
    await restore(fixture);
    closeModal();
    // This requested class is on the current timetable; a historical meeting in
    // the other term still owns the teacher's same date and bell.
    const conflictDay = (new Date(date + "T00:00:00Z").getUTCDay() + 1) % 7;
    db.activeDays = [
      ...new Set([...(db.activeDays || [0, 1, 2, 3, 4, 5]), conflictDay]),
    ].sort((a, b) => a - b);
    db.masterSchedule[conflictDay + "-0-all"] = {
      schoolId: ids.school,
      classId: ids.b,
      lessonId: ids.otherLesson,
    };
    await saveDB({
      action: "برنامه مصنوعی برای آزمون تداخل جلسه با نوبت دیگر",
    });
    goSchool(ids.school);
    goClass(ids.b);
    goLesson(ids.otherLesson);
    const creation = document.querySelector(".session-create-form");
    creation.elements.date.value = date;
    creation.elements.date.dispatchEvent(
      new Event("change", { bubbles: true }),
    );
    creation.elements.period.value = "1";
    const beforeConflict = store(await EduV24.snapshotInstallation());
    let conflict = "";
    try {
      await addManualSession(
        { preventDefault() {}, target: creation },
        ids.otherLesson,
      );
    } catch (error) {
      conflict = error.message;
    }
    check(
      "11",
      "a different class cannot claim another term's occupied teacher date and bell",
      /تداخل جلسه/.test(conflict) &&
        store(await EduV24.snapshotInstallation()) === beforeConflict,
      { conflict },
    );
    await restore(fixture);
    closeModal();
    const connection = EduV24.test.getConnection(),
      hold = connection.transaction("records", "readwrite"),
      storeObject = hold.objectStore("records");
    let blocking = true;
    const done = new Promise((yes, no) => {
      hold.oncomplete = yes;
      hold.onerror = () => no(hold.error);
      hold.onabort = () => no(hold.error);
    });
    function keep() {
      const request = storeObject.get("synthetic-update-hold");
      request.onsuccess = () => {
        if (blocking) keep();
      };
    }
    keep();
    db.sessions[0].attendance[ids.s1] = "leave";
    const write = saveDB({
      sessionId: ids.recent,
      action: "Synthetic pending attendance",
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    let barrierDone = false;
    const barrier = EduV24.prepareForUpdate().then(() => {
      barrierDone = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const waited = !barrierDone && EduV24.getReportContext().saving > 0;
    blocking = false;
    await done;
    await write;
    await barrier;
    saved = await EduV24.snapshotInstallation();
    check(
      "12",
      "the update barrier waits for an ordinary real IndexedDB write before permitting activation",
      waited &&
        barrierDone &&
        session(saved, ids.second, ids.recent).attendance[ids.s1] === "leave",
    );
    const decoded = EduV24.validateFullBackup(saved),
      scores = decoded.map(
        (part) =>
          part.data.schools[0].classes[0].lessons[0].kardaneshScores[ids.s1],
      );
    check(
      "13",
      "year-wide views preserve separate term grades and a complete valid full backup",
      decoded.length === 2 &&
        scores.some((score) => score.practical === 18) &&
        scores.some((score) => score.practical === 20) &&
        saved.stores.records.filter((row) => row.logical.startsWith("session:"))
          .length === 3,
    );
  } catch (error) {
    check("99", "annual activity UI flow completes", false, {
      error: error.message,
      stack: error.stack,
    });
  } finally {
    closeModal();
    if (original) await restore(original);
  }
  return cases;
};
