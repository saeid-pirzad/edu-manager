"use strict";

// Real form and IndexedDB regression; all records are synthetic and isolated.
module.exports = async function sharedYearCourses() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    year = "1450-1451",
    otherYear = "1451-1452",
    ids = {
      school: "shared_courses_school",
      classroom: "shared_courses_class",
      student: "shared_courses_student",
      dual: "shared_courses_dual",
      modular: "shared_courses_modular",
      pod: "shared_courses_pod",
      unit1: "shared_courses_unit1",
      unit2: "shared_courses_unit2",
    },
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 250; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Shared course UI timed out: " +
          [...document.querySelectorAll('[role="alert"]')]
            .map((el) => el.textContent.trim())
            .filter(Boolean)
            .join(" | "),
      );
    },
    classRow = (snapshot, period) =>
      snapshot.stores.records.find(
        (row) =>
          row.workspace === period && row.logical === "class:" + ids.classroom,
      ),
    course = (snapshot, period, id) =>
      classRow(snapshot, period)?.value.lessons.find(
        (lesson) => lesson.id === id,
      ),
    metaRow = (snapshot, period) =>
      snapshot.stores.records.find(
        (row) => row.workspace === period && row.logical === "meta",
      ),
    definitions = (snapshot, period) =>
      JSON.stringify(
        classRow(snapshot, period).value.lessons.map((lesson) => {
          const copy = structuredClone(lesson);
          delete copy.kardaneshScores;
          for (const pod of copy.poudmans || []) {
            delete pod.podScores;
            for (const unit of pod.units || []) delete unit.unitScores;
          }
          return copy;
        }),
      ),
    stored = (snapshot) =>
      JSON.stringify(
        Object.fromEntries(
          ["catalog", "records", "events", "undo", "reports"].map((name) => [
            name,
            snapshot.stores[name],
          ]),
        ),
      ),
    forPeriod = (snapshot, period) => ({
      stores: Object.fromEntries(
        ["catalog", "records", "events", "undo", "reports"].map((name) => [
          name,
          snapshot.stores[name].filter(
            (row) => row.workspace === period || row.id === period,
          ),
        ]),
      ),
    }),
    openClass = () => {
      closeModal();
      EduV24.course.cancelEditor();
      goSchool(ids.school);
      goClass(ids.classroom);
    },
    fill = (name, value) => {
      const input = document.getElementById("course_" + name);
      if (!input) throw Error("Missing course control: " + name);
      input.value = String(value);
      input.dispatchEvent(
        new Event(input.tagName === "SELECT" ? "change" : "input", {
          bubbles: true,
        }),
      );
    },
    submitCourse = async (expectFailure = false) => {
      const form = document.querySelector("#app #courseEditor");
      form.closest("details").open = true;
      form.requestSubmit();
      await wait(
        () =>
          (!form.isConnected ||
            document.getElementById("courseError")?.textContent) &&
          form.getAttribute("aria-busy") !== "true",
      );
      await EduV24.test.settle().catch((error) => {
        if (!expectFailure) throw error;
      });
    },
    editCourse = async (id, fields, expectFailure = false) => {
      openClass();
      await EduV24.course.open(id);
      for (const [name, value] of Object.entries(fields)) fill(name, value);
      await submitCourse(expectFailure);
    },
    addCourse = async (name) => {
      openClass();
      await EduV24.course.open();
      fill("name", name);
      fill("teacher", "دبیر آزمایشی");
      fill("periods", 2);
      await submitCourse();
      return db.schools[0].classes[0].lessons.find(
        (lesson) => lesson.name === name,
      )?.id;
    },
    removeCourse = async (id, expectFailure = false) => {
      openClass();
      const lesson = db.schools[0].classes[0].lessons.find((l) => l.id === id);
      await deleteLesson(id);
      document.getElementById("deleteEntityName").value = lesson.name;
      document
        .querySelector('form[data-workspace-submit="confirm-deletion"]')
        .requestSubmit();
      await wait(
        () =>
          document.getElementById("deleteEntityError")?.textContent ||
          !document.querySelector(
            '#modal:not(.hidden) form[data-workspace-submit="confirm-deletion"]',
          ),
      );
      await EduV24.test.settle().catch((error) => {
        if (!expectFailure) throw error;
      });
    },
    createPeriod = async (targetYear, term, first = "") => {
      closeModal();
      await EduV24.test.prepareLegacyPeriodFixture();
      document.getElementById("periodYear").value = targetYear;
      document.getElementById("periodTerm").value = term;
      await EduV24.test.createLegacyPeriod();
      return EduV24.getReportContext().id;
    },
    writeFixture = async (records, catalog) => {
      const tx = EduV24.test
          .getConnection()
          .transaction(["records", "catalog"], "readwrite"),
        done = new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onabort = () =>
            reject(tx.error || Error("Fixture transaction aborted"));
          tx.onerror = () => reject(tx.error);
        });
      for (const row of records) tx.objectStore("records").put(row);
      for (const row of catalog) tx.objectStore("catalog").put(row);
      await done;
    };
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
  let original = null,
    originalPut = null;
  try {
    closeModal();
    await EduV24.test.settle();
    original = await EduV24.snapshotInstallation();
    const first = await createPeriod(year, "اول"),
      policy = (method) => ({
        ...EduPolicy.defaults(method, year),
        confirmed: true,
        code: method === "dual" ? "SHARED-D" : "SHARED-M",
        ...(method === "modular" ? { unitCount: 2 } : {}),
      }),
      student = { id: ids.student, name: "هنرجوی آزمون سالانه", code: "1" },
      firstDual = {
        midtermPractical: 18,
        midtermTheory: 12,
        practical: 16,
        theory: 14,
      };
    Object.assign(
      db,
      EduV24.normalizeDB({
        ...db,
        settings: { ...db.settings, password: "" },
        masterSchedule: {},
        sessions: [
          {
            id: "shared_courses_first_session",
            schoolId: ids.school,
            classId: ids.classroom,
            lessonId: ids.dual,
            date: "2071-10-24",
            period: 0,
            poudmanId: null,
            unitId: null,
            roster: [student],
            attendance: { [ids.student]: "present" },
            scores: [],
          },
        ],
        schools: [
          {
            id: ids.school,
            name: "هنرستان آزمون درس سالانه",
            classes: [
              {
                id: ids.classroom,
                name: "یازدهم شبکه آزمایشی",
                students: [student],
                archivedStudents: [],
                lessons: [
                  {
                    id: ids.dual,
                    name: "درس نظری عملی اولیه",
                    teacher: "دبیر اولیه",
                    periodsPerWeek: 2,
                    gradeMode: "kardanesh",
                    gradingPolicy: policy("dual"),
                    kardaneshScores: { [ids.student]: firstDual },
                    poudmans: [],
                  },
                  {
                    id: ids.modular,
                    name: "درس پودمانی اولیه",
                    teacher: "دبیر پودمانی",
                    periodsPerWeek: 2,
                    gradeMode: "standard",
                    gradingPolicy: policy("modular"),
                    kardaneshScores: {},
                    poudmans: [
                      {
                        id: ids.pod,
                        name: "پودمان اول",
                        podScores: {},
                        units: [
                          { id: ids.unit1, name: "واحد اول", unitScores: {} },
                          { id: ids.unit2, name: "واحد دوم", unitScores: {} },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    for (const lesson of db.schools[0].classes[0].lessons)
      lesson.courseInfo = EduPolicy.identity(
        lesson,
        year,
        db.schools[0].classes[0],
      );
    for (const meeting of db.sessions) scheduleFixtureSession(meeting);
    await saveDB({ action: "ساخت داده آزمایشی دروس سالانه" });
    await EduV24.finalizePeriod();
    if (!EduV24.getReportContext().closed)
      throw Error("Synthetic first term did not close");
    const second = await createPeriod(year, "دوم", first),
      secondDual = {
        midtermPractical: 20,
        midtermTheory: 18,
        practical: 19,
        theory: 17,
      };
    db.schools[0].classes[0].lessons.find(
      (lesson) => lesson.id === ids.dual,
    ).kardaneshScores[ids.student] = secondDual;
    db.sessions = [
      {
        id: "shared_courses_second_session",
        schoolId: ids.school,
        classId: ids.classroom,
        lessonId: ids.dual,
        date: "2072-03-25",
        period: 1,
        poudmanId: null,
        unitId: null,
        roster: [structuredClone(student)],
        attendance: { [ids.student]: "leave" },
        scores: [],
      },
    ];
    for (const meeting of db.sessions) scheduleFixtureSession(meeting);
    await saveDB({ action: "ثبت نمرات مستقل نوبت دوم" });
    const sentinel = await createPeriod(otherYear, "اول"),
      sentinelSnapshot = await EduV24.snapshotInstallation(),
      untouchedOtherYear = stored(forPeriod(sentinelSnapshot, sentinel));
    // This is fixture setup across academic years, not application navigation.
    // Repeated first/second-term checks below retain the production facade.
    await EduV24.test.switchLegacyPeriod(second);
    const baseline = await EduV24.snapshotInstallation(),
      frozen = JSON.stringify(
        baseline.stores.reports.filter((report) => report.workspace === first),
      ),
      histories = JSON.stringify(
        baseline.stores.records.filter(
          (row) =>
            [first, second].includes(row.workspace) &&
            row.logical.startsWith("session:"),
        ),
      ),
      initialDualScores = [first, second].map((period) =>
        JSON.stringify(course(baseline, period, ids.dual).kardaneshScores),
      );
    check(
      "SHARED_COURSE01",
      "first and second term begin with common definitions and independent dual grades",
      definitions(baseline, first) === definitions(baseline, second) &&
        initialDualScores[0] !== initialDualScores[1],
    );

    const added = await addCourse("درس افزوده در نوبت دوم");
    let snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE02",
      "real late-course creation appends the same identity in both open and closed terms",
      !!added &&
        [first, second].every(
          (period) =>
            classRow(snapshot, period)
              .value.lessons.map((lesson) => lesson.id)
              .join() === [ids.dual, ids.modular, added].join() &&
            Object.keys(course(snapshot, period, added).kardaneshScores)
              .length === 0,
        ),
    );
    if (!added) throw Error("Late course creation did not complete");
    await editCourse(added, {
      name: "مهارت شبکه مشترک",
      teacher: "دبیر مشترک سال",
      periods: 3,
    });
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE03",
      "real course name teacher and weekly periods edits are shared across the year",
      [first, second].every((period) => {
        const lesson = course(snapshot, period, added);
        return (
          lesson?.name === "مهارت شبکه مشترک" &&
          lesson.teacher === "دبیر مشترک سال" &&
          lesson.periodsPerWeek === 3
        );
      }),
    );
    await editCourse(added, { practicalWeight: 60, passMin: 13 });
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE04",
      "ungraded policy edits are shared without copying term grade maps",
      [first, second].every((period) => {
        const lesson = course(snapshot, period, added);
        return (
          lesson.gradingPolicy.practicalWeight === 60 &&
          lesson.gradingPolicy.passMin === 13 &&
          Object.keys(lesson.kardaneshScores).length === 0
        );
      }),
    );
    await editCourse(ids.dual, {
      name: "درس نظری عملی سالانه",
      teacher: "دبیر مشترک درس نمره‌دار",
    });
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE05",
      "graded-course identity edits preserve each term's own dual scores",
      [first, second].every(
        (period, index) =>
          course(snapshot, period, ids.dual).name === "درس نظری عملی سالانه" &&
          JSON.stringify(course(snapshot, period, ids.dual).kardaneshScores) ===
            initialDualScores[index],
      ),
    );

    openClass();
    await EduV24.course.openNames(ids.modular);
    fill("pod_" + ids.pod, "پودمان طراحی شبکه");
    fill("unit_" + ids.unit1, "واحد طراحی مشترک");
    await submitCourse();
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE06",
      "real module and unit name edits keep the same shared structure identities",
      [first, second].every((period) => {
        const pod = course(snapshot, period, ids.modular).poudmans[0];
        return (
          pod.id === ids.pod &&
          pod.name === "پودمان طراحی شبکه" &&
          pod.units[0].id === ids.unit1 &&
          pod.units[0].name === "واحد طراحی مشترک"
        );
      }),
    );

    const peer = structuredClone(classRow(snapshot, first)),
      peerPeriod = {
        ...snapshot.stores.catalog.find((period) => period.id === first),
      };
    peer.value.lessons.find((lesson) => lesson.id === added).kardaneshScores[
      ids.student
    ] = {
      midtermPractical: 17,
      midtermTheory: 11,
      practical: 18,
      theory: 12,
    };
    peer.value.lessons.find(
      (lesson) => lesson.id === ids.modular,
    ).poudmans[0].units[1].unitScores[ids.student] = { m: 16, p: 15 };
    peerPeriod.revision++;
    await writeFixture([peer], [peerPeriod]);
    const beforePolicy = await EduV24.snapshotInstallation();
    openClass();
    await EduV24.course.open(added);
    check(
      "SHARED_COURSE16",
      "the real editor locks policy controls when grades exist only in another term",
      document.getElementById("course_practicalWeight").matches(":disabled") &&
        document.getElementById("course_passMin").matches(":disabled") &&
        !document.getElementById("course_name").matches(":disabled"),
    );
    openClass();
    const changedPolicy = db.schools[0].classes[0].lessons.find(
      (lesson) => lesson.id === added,
    ).gradingPolicy;
    changedPolicy.practicalWeight = 50;
    changedPolicy.revision++;
    let policyRejected = false;
    try {
      await saveDB({
        classId: ids.classroom,
        action: "آزمون حفاظت قواعد درس دارای نمره در نوبت دیگر",
      });
    } catch {
      policyRejected = true;
    }
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE07",
      "the real persistence boundary rejects policy changes with peer-only grades and rolls back all records",
      policyRejected && stored(snapshot) === stored(beforePolicy),
    );

    openClass();
    const beforeStructure = await EduV24.snapshotInstallation();
    db.schools[0].classes[0].lessons
      .find((lesson) => lesson.id === ids.modular)
      .poudmans[0].units.pop();
    let structuralRejected = false;
    try {
      await saveDB({
        classId: ids.classroom,
        action: "آزمون حفاظت از حذف واحد دارای سابقه",
      });
    } catch {
      structuralRejected = true;
    }
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE08",
      "the real commit boundary blocks structural unit removal when only a peer owns its history",
      structuralRejected &&
        stored(snapshot) === stored(beforeStructure) &&
        db.schools[0].classes[0].lessons.find(
          (lesson) => lesson.id === ids.modular,
        ).poudmans[0].units.length === 2,
    );
    const beforeDelete = await EduV24.snapshotInstallation();
    await removeCourse(added, true);
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE09",
      "real lesson deletion rejects peer-only grades and retains both complete records",
      !!document.getElementById("deleteEntityError")?.textContent &&
        stored(snapshot) === stored(beforeDelete),
    );

    const unused = await addCourse("درس بدون سابقه برای حذف");
    snapshot = await EduV24.snapshotInstallation();
    if (!unused) throw Error("Unused course fixture creation failed");
    db.masterSchedule["0-0-all"] = {
      schoolId: ids.school,
      classId: ids.classroom,
      lessonId: unused,
    };
    // A year's timetable is common to its terms; create both references through
    // the real annual writer rather than manufacturing a conflicting peer.
    db.masterSchedule["0-1-all"] = {
      schoolId: ids.school,
      classId: ids.classroom,
      lessonId: unused,
    };
    await saveDB({ action: "برنامه درس بدون سابقه" });
    await removeCourse(unused);
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE10",
      "deleting an unused lesson removes its definition and timetable references from both terms",
      [first, second].every(
        (period) =>
          !course(snapshot, period, unused) &&
          !Object.values(
            metaRow(snapshot, period).value.masterSchedule || {},
          ).some((slot) => slot.lessonId === unused),
      ),
    );

    const beforeFault = await EduV24.snapshotInstallation();
    let failedCompanion = false;
    originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (
        !failedCompanion &&
        this.name === "records" &&
        value.workspace === first &&
        value.logical === "class:" + ids.classroom &&
        value.value.lessons.some(
          (lesson) =>
            lesson.id === ids.dual &&
            lesson.teacher === "این تغییر نباید ثبت شود",
        )
      ) {
        failedCompanion = true;
        throw new DOMException(
          "Shared course peer write failure",
          "QuotaExceededError",
        );
      }
      return originalPut.call(this, value, ...args);
    };
    try {
      await editCourse(ids.dual, { teacher: "این تغییر نباید ثبت شود" }, true);
    } finally {
      IDBObjectStore.prototype.put = originalPut;
      originalPut = null;
    }
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE11",
      "a real companion IndexedDB write failure rolls back source peer revisions undo and events",
      failedCompanion && stored(snapshot) === stored(beforeFault),
      { failedCompanion },
    );
    check(
      "SHARED_COURSE12",
      "course operations preserve frozen reports attendance and independent original dual grades",
      [first, second].every(
        (period, index) =>
          JSON.stringify(course(snapshot, period, ids.dual).kardaneshScores) ===
          initialDualScores[index],
      ) &&
        JSON.stringify(
          snapshot.stores.reports.filter(
            (report) => report.workspace === first,
          ),
        ) === frozen &&
        JSON.stringify(
          snapshot.stores.records.filter(
            (row) =>
              [first, second].includes(row.workspace) &&
              row.logical.startsWith("session:"),
          ),
        ) === histories &&
        snapshot.stores.catalog.find((period) => period.id === first).closed,
    );
    check(
      "SHARED_COURSE13",
      "same course identities in another academic year remain unchanged",
      stored(forPeriod(snapshot, sentinel)) === untouchedOtherYear,
    );
    openClass();
    const beforeSwitches = await EduV24.snapshotInstallation();
    for (let repeat = 0; repeat < 2; repeat++) {
      await EduV24.switchPeriod(first);
      await EduV24.switchPeriod(second);
    }
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE14",
      "repeated term switching leaves one common ordered course definition without new writes or duplicates",
      definitions(snapshot, first) === definitions(snapshot, second) &&
        stored(snapshot) === stored(beforeSwitches) &&
        [first, second].every((period) => {
          const list = classRow(snapshot, period).value.lessons;
          return (
            list.length === 3 &&
            new Set(list.map((lesson) => lesson.id)).size === 3
          );
        }),
    );
    check(
      "SHARED_COURSE15",
      "full backup validates all common course definitions and independent histories",
      EduV24.validateFullBackup(snapshot).length ===
        snapshot.stores.catalog.length,
    );
    openClass();
    await EduV24.course.open();
    fill("name", "درس پودمانی بدون سابقه برای تغییر تعداد");
    fill("method", "modular");
    fill("podCount", 2);
    fill("unitCount", 1);
    await submitCourse();
    const countLessonId = db.schools[0].classes[0].lessons.find(
      (lesson) => lesson.name === "درس پودمانی بدون سابقه برای تغییر تعداد",
    )?.id;
    if (!countLessonId)
      throw Error("Count-editor course fixture was not created");
    snapshot = await EduV24.snapshotInstallation();
    const originalPods = course(snapshot, second, countLessonId).poudmans.map(
      (pod) => ({ id: pod.id, unit: pod.units[0].id }),
    );
    openClass();
    await EduV24.course.open(countLessonId);
    check(
      "SHARED_COURSE17",
      "an existing ungraded modular course exposes enabled module and uniform-unit count controls",
      !document.getElementById("courseAdvanced").hidden &&
        !document.getElementById("course_podCount").matches(":disabled") &&
        !document.getElementById("course_unitCount").matches(":disabled") &&
        document.getElementById("course_podCount").value === "2" &&
        document.getElementById("course_unitCount").value === "1",
    );
    fill("podCount", 3);
    fill("unitCount", 2);
    await submitCourse();
    const expanded = await EduV24.snapshotInstallation(),
      expandedCorrect =
        [first, second].every((period) => {
          const lesson = course(expanded, period, countLessonId),
            pods = lesson.poudmans,
            allIds = pods.flatMap((pod) => [
              pod.id,
              ...pod.units.map((unit) => unit.id),
            ]);
          return (
            pods.length === 3 &&
            pods.every(
              (pod) =>
                pod.units.length === 2 &&
                Object.keys(pod.podScores || {}).length === 0 &&
                pod.units.every(
                  (unit) => Object.keys(unit.unitScores || {}).length === 0,
                ),
            ) &&
            Object.keys(lesson.kardaneshScores || {}).length === 0 &&
            originalPods.every(
              (previous, index) =>
                pods[index].id === previous.id &&
                pods[index].units[0].id === previous.unit,
            ) &&
            new Set(allIds).size === allIds.length
          );
        }) &&
        JSON.stringify(course(expanded, first, countLessonId).poudmans) ===
          JSON.stringify(course(expanded, second, countLessonId).poudmans);
    await editCourse(countLessonId, { podCount: 2, unitCount: 1 });
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE18",
      "real count edits expand and shrink both terms while retaining existing IDs and empty score maps",
      expandedCorrect &&
        [first, second].every((period) => {
          const pods = course(snapshot, period, countLessonId).poudmans;
          return (
            pods.length === 2 &&
            originalPods.every(
              (previous, index) =>
                pods[index].id === previous.id &&
                pods[index].units.length === 1 &&
                pods[index].units[0].id === previous.unit &&
                Object.keys(pods[index].podScores || {}).length === 0 &&
                Object.keys(pods[index].units[0].unitScores || {}).length === 0,
            )
          );
        }),
    );
    const peerCountSession = {
        key: first + "|session:shared_courses_count_session",
        workspace: first,
        logical: "session:shared_courses_count_session",
        value: {
          id: "shared_courses_count_session",
          schoolId: ids.school,
          classId: ids.classroom,
          lessonId: countLessonId,
          date: "2072-04-01",
          period: 2,
          poudmanId: originalPods[0].id,
          unitId: originalPods[0].unit,
          roster: [structuredClone(student)],
          attendance: {},
          scores: [],
        },
      },
      peerCountPeriod = {
        ...snapshot.stores.catalog.find((period) => period.id === first),
      };
    peerCountPeriod.revision++;
    await writeFixture([peerCountSession], [peerCountPeriod]);
    const beforeCountBlock = await EduV24.snapshotInstallation();
    await editCourse(countLessonId, { podCount: 3, unitCount: 2 }, true);
    snapshot = await EduV24.snapshotInstallation();
    check(
      "SHARED_COURSE19",
      "the real count form blocks resizing when a session exists only in another term",
      document.getElementById("courseError")?.textContent.includes("جلسه") &&
        stored(snapshot) === stored(beforeCountBlock) &&
        EduV24.validateFullBackup(snapshot).length ===
          snapshot.stores.catalog.length,
    );
  } catch (error) {
    check(
      "SHARED_COURSE99",
      "shared annual course browser workflow completed",
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
        EduV24.course.cancelEditor();
        EduV24.previewFullBackup(original);
        document.getElementById("fullRestoreConfirmed").checked = true;
        await EduV24.restoreFullBackup();
        await EduV24.test.settle();
      } catch (error) {
        check(
          "SHARED_COURSE_CLEANUP",
          "course fixture restores its original installation",
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
