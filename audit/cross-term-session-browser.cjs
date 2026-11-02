"use strict";

// Real IndexedDB regression in data-integrity's isolated, synthetic profile.
// The wrapper restores its starting installation after a fresh reload.
async function crossTermSessionFlow() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    ids = {
      first: "slot_guard_first",
      second: "slot_guard_second",
      school: "slot_guard_school",
      classroom: "slot_guard_class",
      lesson: "slot_guard_lesson",
      student: "slot_guard_student",
    },
    year = "1482-1483",
    date = EduAcademicYear.range(year).start,
    tomorrow = new Date(new Date(date + "T12:00:00Z").getTime() + 86400000)
      .toISOString()
      .slice(0, 10),
    restore = async (snapshot) => {
      closeModal();
      EduV24.previewFullBackup(snapshot);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
      await EduV24.test.settle();
    },
    lessonPage = () => {
      closeModal();
      goSchool(ids.school);
      goClass(ids.classroom);
      goLesson(ids.lesson);
      setTab("sessions");
    },
    create = async (targetDate) => {
      lessonPage();
      const form = document.querySelector(".session-create-form");
      form.elements.date.value = targetDate;
      form.elements.period.value = "1";
      return addManualSession(
        { preventDefault() {}, target: form },
        ids.lesson,
      );
    },
    sessions = (snapshot, period) =>
      snapshot.stores.records.filter(
        (row) => row.workspace === period && row.logical.startsWith("session:"),
      ),
    makeSession = (id, targetDate = date) => ({
      id,
      schoolId: ids.school,
      classId: ids.classroom,
      lessonId: ids.lesson,
      date: targetDate,
      period: 0,
      poudmanId: null,
      unitId: null,
      roster: [{ id: ids.student, name: "Synthetic student", code: "001" }],
      attendance: { [ids.student]: "absent" },
      scores: [],
    });
  try {
    const fixture = await EduV24.snapshotInstallation();
    fixture.activeWorkspace = ids.second;
    fixture.gradeDrafts = [];
    fixture.reportDrafts = { [ids.first]: {}, [ids.second]: {} };
    fixture.stores = {
      catalog: [],
      records: [],
      reports: [],
      events: [],
      undo: [],
      backups: [],
    };
    for (const [id, term, kind] of [
      [ids.first, "اول", "first"],
      [ids.second, "دوم", "second"],
    ]) {
      const data = EduV24.normalizeDB({
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
              name: "Synthetic slot school",
              classes: [
                {
                  id: ids.classroom,
                  name: "Synthetic slot class",
                  students: [
                    { id: ids.student, name: "Synthetic student", code: "001" },
                  ],
                  archivedStudents: [],
                  lessons: [
                    {
                      id: ids.lesson,
                      name: "Synthetic slot lesson",
                      gradeMode: "kardanesh",
                      gradingPolicy: EduPolicy.defaults("dual", year),
                      kardaneshScores: {},
                      poudmans: [],
                    },
                  ],
                },
              ],
            },
          ],
          sessions: id === ids.first ? [makeSession("existing_first")] : [],
          masterSchedule: {},
          migrationWarnings: [],
        }),
        { schools, sessions: meetings, ...meta } = data;
      meta.layout = [
        { id: ids.school, name: schools[0].name, classes: [ids.classroom] },
      ];
      fixture.stores.catalog.push({
        id,
        year,
        term,
        termKind: kind,
        revision: 1,
        closed: false,
        createdAt: "2026-11-02T00:00:00Z",
        updatedAt: "2026-11-02T00:00:00Z",
      });
      for (const [logical, value] of [
        ["meta", meta],
        ["class:" + ids.classroom, schools[0].classes[0]],
        ...meetings.map((session) => ["session:" + session.id, session]),
      ])
        fixture.stores.records.push({
          key: id + "|" + logical,
          workspace: id,
          logical,
          value,
        });
    }
    await restore(fixture);
    let error = "";
    try {
      await create(date);
    } catch (failure) {
      error = failure.message;
    }
    let saved = await EduV24.snapshotInstallation();
    check(
      "SLOT01",
      "manual entry cannot create a duplicate class/date/bell in the other term",
      /تداخل جلسه/.test(error) &&
        sessions(saved, ids.second).length === 0 &&
        sessions(saved, ids.first).length === 1,
      { error },
    );

    const day = getDayIdxFromDate(date);
    db.masterSchedule[day + "-0-all"] = {
      schoolId: ids.school,
      classId: ids.classroom,
      lessonId: ids.lesson,
    };
    await saveDB({ action: "Synthetic schedule slot" });
    goMaster(ids.classroom);
    clickMasterCell(day, 0);
    document.getElementById("sessNewDate").value = date;
    error = "";
    try {
      await startSessionFromMaster(day, 0);
    } catch (failure) {
      error = failure.message;
    }
    saved = await EduV24.snapshotInstallation();
    check(
      "SLOT02",
      "weekly schedule entry cannot bypass the cross-term guard",
      /تداخل جلسه/.test(error) && sessions(saved, ids.second).length === 0,
      { error },
    );

    closeModal();
    await create(tomorrow);
    const currentId = db.sessions[0].id;
    document.getElementById("sessDate").value = date;
    error = "";
    try {
      await changeSessionDate(currentId);
    } catch (failure) {
      error = failure.message;
    }
    saved = await EduV24.snapshotInstallation();
    check(
      "SLOT03",
      "moving a valid session into the other term's occupied slot rolls back its date",
      /تداخل جلسه/.test(error) &&
        sessions(saved, ids.second)[0].value.date === tomorrow,
      { error },
    );

    // A supported old backup may contain an overlap. Reading or correcting its
    // attendance must not require deleting either historical record.
    const legacy = structuredClone(fixture),
      meeting = makeSession("legacy_second");
    legacy.stores.records.push({
      key: ids.second + "|session:" + meeting.id,
      workspace: ids.second,
      logical: "session:" + meeting.id,
      value: meeting,
    });
    await restore(legacy);
    openSessionModal(db.sessions[0]);
    await toggleAtt(document.querySelector(".att-btns .present"), "present");
    saved = await EduV24.snapshotInstallation();
    check(
      "SLOT04",
      "existing legacy overlap remains readable and its attendance can be corrected",
      sessions(saved, ids.second)[0].value.attendance[ids.student] ===
        "present" && sessions(saved, ids.first).length === 1,
    );
    document.getElementById("sessDate").value = tomorrow;
    await changeSessionDate(meeting.id);
    closeModal();
    await EduV24.undoLast();
    saved = await EduV24.snapshotInstallation();
    check(
      "SLOT05",
      "validated exact undo can restore the historical overlap without dropping attendance or the peer session",
      sessions(saved, ids.second)[0].value.date === date &&
        sessions(saved, ids.second)[0].value.attendance[ids.student] ===
          "present" &&
        sessions(saved, ids.first).length === 1,
    );

    // Race the persistence boundary on real IndexedDB. A read-only preflight
    // cannot satisfy this: both writers start against the same empty slot.
    closeModal();
    const raceDate = new Date(
        new Date(date + "T12:00:00Z").getTime() + 172800000,
      )
        .toISOString()
        .slice(0, 10),
      beforeRace = await EduV24.snapshotInstallation(),
      commit = (periodId, sessionId) => {
        const period = beforeRace.stores.catalog.find(
            (row) => row.id === periodId,
          ),
          records = new Map(
            beforeRace.stores.records
              .filter((row) => row.workspace === periodId)
              .map((row) => [row.logical, row.value]),
          ),
          current = makeSession(sessionId, raceDate);
        return EduRecordTransaction.commit({
          connection: EduV24.test.getConnection(),
          workspace: period,
          records,
          changed: [["session:" + sessionId, JSON.stringify(current)]],
          before: [{ key: "session:" + sessionId, value: null }],
          removed: [],
          changes: [],
          action: "Synthetic simultaneous session",
          keepUndo: false,
          normalizedName: String,
          academicTermKind: (term) => (term === "اول" ? "first" : "second"),
        });
      },
      results = await Promise.allSettled([
        commit(ids.first, "race_first"),
        commit(ids.second, "race_second"),
      ]),
      tx = EduV24.test
        .getConnection()
        .transaction(["records", "events"], "readonly"),
      rows = await new Promise((resolve, reject) => {
        const request = tx.objectStore("records").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    check(
      "SLOT06",
      "real simultaneous term transactions commit exactly one physical slot",
      results.filter((result) => result.status === "fulfilled").length === 1 &&
        results.some(
          (result) =>
            result.status === "rejected" &&
            result.reason.code === "ACADEMIC_SESSION_SLOT_CONFLICT",
        ) &&
        rows.filter(
          (row) =>
            row.logical.startsWith("session:") && row.value.date === raceDate,
        ).length === 1,
      {
        results: results.map((result) => ({
          status: result.status,
          code: result.reason?.code,
        })),
      },
    );
  } catch (error) {
    check("SLOT99", "cross-term session regression completed", false, {
      error: error.stack || error.message,
    });
  }
  return cases;
}

async function run({ cdp, evaluate, cases, delay }) {
  const reloadReady = require("./browser-ready.cjs"),
    env = { cdp, evaluate, delay };
  await reloadReady(env);
  const original = await evaluate("EduV24.snapshotInstallation()");
  try {
    cases.push(
      ...(await evaluate("(" + crossTermSessionFlow.toString() + ")()")),
    );
  } finally {
    await reloadReady(env);
    await evaluate(
      "(async()=>{closeModal();EduV24.previewFullBackup(" +
        JSON.stringify(original) +
        ");document.getElementById('fullRestoreConfirmed').checked=true;await EduV24.restoreFullBackup();await EduV24.test.settle();})()",
    );
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "cross-term-session-slots", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
