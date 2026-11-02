"use strict";

// Synthetic data only: this runner uses data-integrity's temporary browser
// profile and restores that profile's starting installation in finally.
async function recoveredNameUndoFlow() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    ids = {
      first: "recovered_name_undo_first",
      second: "recovered_name_undo_second",
      school: "recovered_name_undo_school",
      classroom: "recovered_name_undo_class",
      lesson: "recovered_name_undo_lesson",
      student: "recovered_name_undo_student",
      other: "recovered_name_undo_other",
    },
    year = "1480-1481",
    terms = [ids.first, ids.second],
    placeholder = "دانش‌آموز بازیابی‌شده (" + ids.student + ")",
    corrected = "نام اصلاح‌شدهٔ آزمون بازگردانی",
    realName = "نام تاریخی واقعی همین هنرجو",
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Recovered-name undo UI timed out: " +
          (document.getElementById("studentEditError")?.textContent ||
            document.getElementById("operationError")?.textContent ||
            EduV24.test.getState().status.message),
      );
    },
    row = (snapshot, period, logical) =>
      snapshot.stores.records.find(
        (item) => item.workspace === period && item.logical === logical,
      )?.value,
    classroom = (snapshot, period) =>
      row(snapshot, period, "class:" + ids.classroom),
    warnings = (snapshot, period) =>
      row(snapshot, period, "meta").migrationWarnings,
    familyState = (snapshot) =>
      JSON.stringify(
        terms.map((period) => ({
          id: period,
          students: classroom(snapshot, period).students,
          archivedStudents: classroom(snapshot, period).archivedStudents,
          warnings: warnings(snapshot, period),
          sessions: snapshot.stores.records
            .filter(
              (item) =>
                item.workspace === period &&
                item.logical.startsWith("session:"),
            )
            .map((item) => item.value)
            .sort((a, b) => a.id.localeCompare(b.id)),
        })),
      ),
    restore = async (snapshot) => {
      closeModal();
      EduV24.previewFullBackup(snapshot);
      document.getElementById("fullRestoreConfirmed").checked = true;
      document.querySelector('[data-workspace-action="restore-full"]').click();
      await wait(
        () =>
          EduV24.getReportContext().ready &&
          document.getElementById("modal").classList.contains("hidden"),
      );
      await EduV24.test.settle();
    },
    repair = async () => {
      closeModal();
      goSchool(ids.school);
      goClass(ids.classroom);
      setTab("students");
      await openEditStudentModal(ids.student);
      document.getElementById("editStudentName").value = corrected;
      document.querySelector("#studentEditor").requestSubmit();
      await wait(
        () =>
          document.getElementById("studentEditError")?.textContent ||
          document.getElementById("modal").classList.contains("hidden"),
      );
      const error = document.getElementById("studentEditError")?.textContent;
      if (error) throw Error(error);
      await EduV24.test.settle();
    },
    undo = async () => {
      const revision = EduV24.getReportContext().revision;
      document.querySelector('[data-workspace-action="undo"]').click();
      await wait(() =>
        document.querySelector('[data-workspace-action="confirm-undo"]'),
      );
      document.querySelector('[data-workspace-action="confirm-undo"]').click();
      await wait(
        () =>
          document.getElementById("operationError")?.textContent ||
          (EduV24.getReportContext().revision > revision &&
            document.getElementById("modal").classList.contains("hidden")),
      );
      const error = document.getElementById("operationError")?.textContent;
      if (error) throw Error(error);
      await EduV24.test.settle();
    };
  let original = null,
    originalDownload = null;
  try {
    closeModal();
    await EduV24.test.settle();
    original = await EduV24.snapshotInstallation();
    const fixture = structuredClone(original);
    fixture.activeWorkspace = ids.second;
    fixture.gradeDrafts = [];
    fixture.snapshotNotes = [];
    const sourceWarnings = [
      "نام دانش‌آموز " + ids.student + " در کلاس آزمون نیازمند بررسی است.",
      "نام دانش‌آموز " + ids.student + "x در کلاس آزمون نیازمند بررسی است.",
      "هشدار مستقل آزمون بازگردانی حفظ شود.",
    ];
    for (const [index, period] of terms.entries()) {
      const student = {
          id: ids.student,
          name: placeholder,
          code: "001",
          recovered: true,
        },
        other = { id: ids.other, name: "هنرجوی دیگر", code: "002" },
        data = EduV24.normalizeDB({
          schemaVersion: 26,
          settings: {
            ...db.settings,
            password: "",
            academicYear: year,
            academicTerm: index ? "دوم" : "اول",
          },
          migrationWarnings: sourceWarnings,
          masterSchedule: {},
          schools: [
            {
              id: ids.school,
              name: "مدرسهٔ آزمایشی بازگردانی نام",
              classes: [
                {
                  id: ids.classroom,
                  name: "کلاس آزمون",
                  students: [student, other],
                  archivedStudents: [],
                  lessons: [
                    {
                      id: ids.lesson,
                      name: "درس آزمون نام تاریخی",
                      gradeMode: "kardanesh",
                      gradingPolicy: EduPolicy.defaults("dual", year),
                      kardaneshScores: {
                        [ids.student]: {
                          practical: index ? 19 : 17,
                          theory: 14,
                          midtermPractical: 18,
                          midtermTheory: 16,
                        },
                      },
                      poudmans: [],
                    },
                  ],
                },
              ],
            },
          ],
          sessions: [
            {
              id: "recovered_name_placeholder_session",
              date: EduAcademicYear.range(year).start,
              period: 0,
              schoolId: ids.school,
              classId: ids.classroom,
              lessonId: ids.lesson,
              poudmanId: null,
              unitId: null,
              roster: [
                structuredClone(student),
                { ...other, name: "نام تاریخی واقعی هنرجوی دیگر" },
              ],
              attendance: { [ids.student]: "absent", [ids.other]: "present" },
              scores: [],
            },
            {
              id: "recovered_name_genuine_session",
              date: EduAcademicYear.range(year).start,
              period: 1,
              schoolId: ids.school,
              classId: ids.classroom,
              lessonId: ids.lesson,
              poudmanId: null,
              unitId: null,
              roster: [{ ...student, name: realName, recovered: false }],
              attendance: { [ids.student]: "late:10" },
              scores: [],
            },
          ],
        }),
        { schools, sessions, ...meta } = data;
      fixture.stores.catalog.push({
        id: period,
        year,
        term: index ? "دوم" : "اول",
        termKind: index ? "second" : "first",
        revision: 10 + index,
        closed: !index,
        createdAt: "2026-11-02T00:00:00.000Z",
        updatedAt: "2026-11-02T00:00:00.000Z",
      });
      meta.layout = schools.map((school) => ({
        id: school.id,
        name: school.name,
        classes: school.classes.map((item) => item.id),
      }));
      for (const [logical, value] of [
        ["meta", meta],
        ["class:" + ids.classroom, schools[0].classes[0]],
        ...sessions.map((session) => ["session:" + session.id, session]),
      ])
        fixture.stores.records.push({
          key: period + "|" + logical,
          workspace: period,
          logical,
          value,
        });
      fixture.reportDrafts[period] = {};
    }
    await restore(fixture);
    closeModal();
    goSchool(ids.school);
    goClass(ids.classroom);
    goLesson(ids.lesson);
    setTab("sessions");
    const createForm = document.querySelector(".session-create-form");
    createForm.elements.date.value = EduAcademicYear.range(year).start;
    createForm.elements.period.value = "3";
    await addManualSession(
      { preventDefault() {}, target: createForm },
      ids.lesson,
    );
    const newlyRecordedSession = currentSessionId;
    closeModal();
    await EduV24.test.settle();
    const before = await EduV24.snapshotInstallation(),
      beforeState = familyState(before),
      genuine = terms.map((period) =>
        JSON.stringify(
          row(before, period, "session:recovered_name_genuine_session"),
        ),
      );
    check(
      "RECOVERED_ROSTER01",
      "a real manual session retains explicit recovered identity provenance until name repair",
      !!newlyRecordedSession &&
        row(before, ids.second, "session:" + newlyRecordedSession)?.roster.find(
          (member) => member.id === ids.student,
        )?.recovered === true,
    );
    check(
      "RECOVERED_UNDO01",
      "real IndexedDB fixture contains matching recovered identities in a closed first term and open second term",
      terms.every(
        (period) => classroom(before, period).students[0].recovered === true,
      ) &&
        before.stores.catalog.find((period) => period.id === ids.first)
          .closed &&
        !EduV24.getReportContext().closed,
    );
    await repair();
    let snapshot = await EduV24.snapshotInstallation();
    check(
      "RECOVERED_ROSTER02",
      "repairing the real student editor fixes the temporary name in a newly recorded session",
      row(snapshot, ids.second, "session:" + newlyRecordedSession)?.roster.find(
        (member) => member.id === ids.student,
      )?.name === corrected,
    );
    check(
      "RECOVERED_UNDO02",
      "submitting the real student editor repairs identities and marked historical placeholders in both terms",
      terms.every((period) => {
        const member = classroom(snapshot, period).students[0],
          historical = row(
            snapshot,
            period,
            "session:recovered_name_placeholder_session",
          ).roster[0];
        return (
          member.name === corrected &&
          member.recovered === false &&
          historical.name === corrected &&
          historical.recovered === false
        );
      }),
    );
    check(
      "RECOVERED_UNDO03",
      "repair preserves genuine historical names and unrelated migration warnings",
      terms.every(
        (period, index) =>
          JSON.stringify(
            row(snapshot, period, "session:recovered_name_genuine_session"),
          ) === genuine[index] &&
          JSON.stringify(warnings(snapshot, period)) ===
            JSON.stringify(sourceWarnings.slice(1)),
      ),
    );
    const sourceUndo = snapshot.stores.undo.find(
      (item) => item.id === ids.second,
    );
    check(
      "RECOVERED_UNDO04",
      "a shared repair creates a minimal revision-bound peer recovery marker",
      sourceUndo?.recoveredPeers?.length === 1 &&
        sourceUndo.recoveredPeers[0].id === ids.first &&
        sourceUndo.recoveredPeers[0].revision ===
          snapshot.stores.catalog.find((period) => period.id === ids.first)
            .revision &&
        sourceUndo.recoveredPeers[0].rosters.some(
          (entry) => entry.before?.[0].recovered === true,
        ),
    );
    await undo();
    snapshot = await EduV24.snapshotInstallation();
    check(
      "RECOVERED_UNDO05",
      "confirming undo through the real modal restores both term directories, historical placeholders, and warnings exactly",
      familyState(snapshot) === beforeState,
    );
    await repair();
    const downloads = [];
    originalDownload = downloadLocalFile;
    downloadLocalFile = (blob, name) => downloads.push({ blob, name });
    await EduV24.exportFullBackup();
    downloadLocalFile = originalDownload;
    originalDownload = null;
    const exported = JSON.parse(await downloads[0].blob.text()),
      savedPeerRevision = exported.stores.undo.find(
        (item) => item.id === ids.second,
      ).recoveredPeers[0].revision;
    EduV24.validateFullBackup(exported);
    check(
      "RECOVERED_UNDO06",
      "the real full-backup download contains validated shared repair undo metadata",
      downloads.length === 1 &&
        downloads[0].name.endsWith(".json") &&
        exported.stores.undo.some(
          (item) =>
            item.id === ids.second && item.recoveredPeers?.[0].id === ids.first,
        ),
    );
    await restore(exported);
    snapshot = await EduV24.snapshotInstallation();
    const restoredPeer = snapshot.stores.undo.find(
      (item) => item.id === ids.second,
    ).recoveredPeers[0];
    check(
      "RECOVERED_UNDO07",
      "full-system restoration remaps the valid peer marker to the restored revision",
      restoredPeer.revision > savedPeerRevision &&
        restoredPeer.revision ===
          snapshot.stores.catalog.find((period) => period.id === ids.first)
            .revision,
    );
    await undo();
    snapshot = await EduV24.snapshotInstallation();
    check(
      "RECOVERED_UNDO08",
      "shared repair undo still succeeds after full export and restore without changing genuine historical names",
      familyState(snapshot) === beforeState &&
        terms.every(
          (period, index) =>
            JSON.stringify(
              row(snapshot, period, "session:recovered_name_genuine_session"),
            ) === genuine[index],
        ),
    );
  } catch (error) {
    check(
      "RECOVERED_UNDO99",
      "recovered-name shared undo browser lifecycle completes",
      false,
      { error: error.stack || error.message },
    );
  } finally {
    if (originalDownload) downloadLocalFile = originalDownload;
    if (original)
      try {
        await restore(original);
      } catch (error) {
        check(
          "RECOVERED_UNDO_CLEANUP",
          "the isolated fixture restores its starting installation",
          false,
          { error: error.stack || error.message },
        );
      }
    closeModal();
  }
  return cases;
}

async function run({
  cdp,
  evaluate,
  cases,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const context = await evaluate("globalThis.EduV24?.getReportContext?.()");
  if (!context?.ready || context.blocked) {
    await evaluate("globalThis.__recoveredNameUndoOldPage = true");
    await cdp("Page.reload", { ignoreCache: true });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        ready = await evaluate(
          "!globalThis.__recoveredNameUndoOldPage && !!globalThis.EduV24?.getReportContext?.().ready",
        );
        if (ready) break;
      } catch {
        // Navigation may replace the execution context while polling.
      }
      await delay(100);
    }
    if (!ready)
      throw Error("Recovered-name undo browser fixture did not become ready");
  }
  cases.push(
    ...(await evaluate("(" + recoveredNameUndoFlow.toString() + ")()")),
  );
}

module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "recovered-name-shared-undo", runExtra: run })
    .catch((error) => {
      console.error(error);
      process.exitCode = 2;
    });
