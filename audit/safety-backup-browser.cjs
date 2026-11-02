"use strict";

// The shared harness owns a temporary browser profile; this fixture never
// opens a user profile and restores its synthetic starting installation.
async function safetyBackupFlow() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    ids = {
      first: "safety_file_first",
      second: "safety_file_second",
      school: "safety_file_school",
      classroom: "safety_file_class",
      student: "safety_file_student",
      lesson: "safety_file_lesson",
    },
    year = "1500-1501",
    downloads = [],
    wait = async (predicate) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Safety backup browser UI timed out: " +
          (document.getElementById("deleteEntityError")?.textContent ||
            document.getElementById("safetyBackupStatus")?.textContent ||
            document.getElementById("operationError")?.textContent ||
            EduV24.test.getState().status.message),
      );
    },
    classRecord = (snapshot, period) =>
      snapshot.stores.records.find(
        (row) =>
          row.workspace === period && row.logical === "class:" + ids.classroom,
      ),
    restore = async (snapshot) => {
      closeModal();
      EduV24.previewFullBackup(snapshot);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
      await EduV24.test.settle();
    },
    safetyButton = () =>
      document.querySelector(
        '#modal:not(.hidden) #lastSafetyBackup [data-workspace-action="download-safety"]',
      ),
    putFixtureSafety = async (row, remove = []) => {
      const tx = EduV24.test
          .getConnection()
          .transaction("backups", "readwrite"),
        done = new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onabort = tx.onerror = () => reject(tx.error);
        });
      for (const id of remove) tx.objectStore("backups").delete(id);
      if (row) tx.objectStore("backups").put(row);
      await done;
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
    for (const [index, id] of [ids.first, ids.second].entries()) {
      const data = EduV24.normalizeDB({
          schemaVersion: 26,
          settings: {
            ...db.settings,
            password: "",
            academicYear: year,
            academicTerm: index ? "دوم" : "اول",
          },
          schools: [
            {
              id: ids.school,
              name: "مدرسهٔ نسخهٔ ایمنی",
              classes: [
                {
                  id: ids.classroom,
                  name: "کلاس قابل بازگردانی",
                  students: [
                    {
                      id: ids.student,
                      name: "هنرجوی نسخهٔ ایمنی",
                      code: "001",
                    },
                  ],
                  archivedStudents: [],
                  lessons: [
                    {
                      id: ids.lesson,
                      name: "درس بدون سابقهٔ نمره",
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
          sessions: [],
          masterSchedule: {},
          migrationWarnings: [],
        }),
        { schools, sessions, ...meta } = data;
      // The peer's independent timetable must be recoverable too.
      meta.masterSchedule[index ? "0-1-all" : "0-0-all"] = {
        schoolId: ids.school,
        classId: ids.classroom,
        lessonId: ids.lesson,
      };
      meta.layout = [
        { id: ids.school, name: schools[0].name, classes: [ids.classroom] },
      ];
      fixture.stores.catalog.push({
        id,
        year,
        term: index ? "دوم" : "اول",
        termKind: index ? "second" : "first",
        closed: !index,
        revision: 1,
        createdAt: "2026-11-02T00:00:00Z",
        updatedAt: "2026-11-02T00:00:00Z",
      });
      for (const [logical, value] of [
        ["meta", meta],
        ["class:" + ids.classroom, schools[0].classes[0]],
        ...sessions.map((session) => ["session:" + session.id, session]),
      ])
        fixture.stores.records.push({
          key: id + "|" + logical,
          workspace: id,
          logical,
          value,
        });
      fixture.reportDrafts[id] = {};
    }
    await restore(fixture);
    const beforeDelete = await EduV24.snapshotInstallation();
    goSchool(ids.school);
    goClass(ids.classroom);
    deleteClass(ids.classroom);
    await wait(() =>
      document.querySelector("#modal:not(.hidden) #deleteEntityName"),
    );
    document.getElementById("deleteEntityName").value = "کلاس قابل بازگردانی";
    document.getElementById("deleteEntityName").form.requestSubmit();
    await wait(
      () =>
        document.getElementById("deleteEntityError")?.textContent ||
        (!db.schools[0].classes.length &&
          document.getElementById("modal").classList.contains("hidden")),
    );
    if (document.getElementById("deleteEntityError")?.textContent)
      throw Error(document.getElementById("deleteEntityError").textContent);
    await EduV24.test.settle();
    const deleted = await EduV24.snapshotInstallation();
    check(
      "SAFETY_FILE01",
      "real shared-class deletion removes the class from both terms while retaining a complete safety snapshot",
      [ids.first, ids.second].every((period) => !classRecord(deleted, period)),
    );
    await EduV24.openBackups();
    const panel = document.getElementById("lastSafetyBackup"),
      button = safetyButton();
    if (!button)
      throw Error(
        "Last safety snapshot is still inaccessible from the backup dialog",
      );
    check(
      "SAFETY_FILE02",
      "backups exposes one collapsed last-operation download with operation/date, no version manager or direct restore",
      !panel.open &&
        panel.querySelectorAll("button").length === 1 &&
        panel.textContent.includes("پیش از حذف: کلاس قابل بازگردانی") &&
        !panel.querySelector(
          'table,[data-workspace-action="restore-full"],[data-workspace-action="preview-backup"]',
        ),
    );
    const deliveryBefore = localStorage.getItem("Edu24.fullBackupDelivery");
    originalDownload = downloadLocalFile;
    downloadLocalFile = (blob, name) => {
      void blob
        .text()
        .then((text) => downloads.push({ name, parsed: JSON.parse(text) }));
    };
    button.click();
    await wait(() => downloads.length === 1);
    const exported = downloads[0].parsed;
    EduV24.validateFullBackup(exported);
    check(
      "SAFETY_FILE03",
      "the actual safety download is a validated ordinary full JSON backup containing both deleted classes and their independent timetables",
      downloads[0].name.startsWith("EduManager-safety-") &&
        [ids.first, ids.second].every(
          (period) =>
            JSON.stringify(classRecord(exported, period)) ===
            JSON.stringify(classRecord(beforeDelete, period)),
        ) &&
        !exported.stores.backups.some((row) => row.full) &&
        exported.stores.records
          .filter(
            (row) =>
              [ids.first, ids.second].includes(row.workspace) &&
              row.logical === "meta",
          )
          .every((row) => Object.keys(row.value.masterSchedule).length === 1),
    );
    check(
      "SAFETY_FILE04",
      "downloading historical safety does not restore data or claim it is a current-installation backup",
      !db.schools[0].classes.length &&
        localStorage.getItem("Edu24.fullBackupDelivery") === deliveryBefore,
    );
    closeModal();
    const input = document.getElementById("importFile"),
      transfer = new DataTransfer();
    transfer.items.add(
      new File([JSON.stringify(exported)], "safety-to-restore.json", {
        type: "application/json",
      }),
    );
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(() =>
      document.querySelector("#modal:not(.hidden) #fullRestoreConfirmed"),
    );
    check(
      "SAFETY_FILE05",
      "importing the safety JSON uses the existing whole-system preview and does not restore before confirmation",
      !db.schools[0].classes.length &&
        !document.getElementById("fullRestoreConfirmed").checked,
    );
    document.getElementById("fullRestoreConfirmed").checked = true;
    document.querySelector('[data-workspace-action="restore-full"]').click();
    await wait(
      () =>
        EduV24.getReportContext().ready &&
        document.getElementById("modal").classList.contains("hidden"),
    );
    await EduV24.test.settle();
    const restored = await EduV24.snapshotInstallation();
    check(
      "SAFETY_FILE06",
      "confirmed ordinary restore reinstates both deleted term classes, student identities and closed-first-term status",
      [ids.first, ids.second].every(
        (period) =>
          JSON.stringify(classRecord(restored, period)) ===
          JSON.stringify(classRecord(beforeDelete, period)),
      ) &&
        restored.stores.catalog.find((period) => period.id === ids.first)
          .closed,
    );
    await EduV24.openBackups();
    const stale = safetyButton();
    await putFixtureSafety({
      id: "safety-newer-test",
      workspace: null,
      at: "2100-01-01T00:00:00Z",
      label: "عملیات جدیدتر آزمایشی",
      full: exported,
    });
    stale.click();
    await wait(() =>
      document
        .getElementById("safetyBackupStatus")
        ?.textContent.includes("تغییر کرده"),
    );
    check(
      "SAFETY_FILE07",
      "a displayed safety button cannot silently download a different newer operation",
      downloads.length === 1 &&
        !document
          .getElementById("safetyBackupStatus")
          .textContent.includes("دانلود نسخهٔ ایمنی «عملیات جدیدتر"),
    );
    await putFixtureSafety({
      id: "safety-invalid-test",
      workspace: null,
      at: "2101-01-01T00:00:00Z",
      label: "نسخهٔ خام آزمایشی",
      full: { format: "EduManager.RawRecovery", stores: {} },
    });
    closeModal();
    await EduV24.openBackups();
    safetyButton().click();
    await wait(() =>
      document
        .getElementById("safetyBackupStatus")
        ?.textContent.includes("انجام نشد"),
    );
    check(
      "SAFETY_FILE08",
      "a raw or invalid safety snapshot is rejected explicitly rather than downloaded as a restorable backup",
      downloads.length === 1 &&
        document
          .getElementById("safetyBackupStatus")
          .textContent.includes("قابل بازیابی نیست"),
    );
    await putFixtureSafety(null, ["safety-invalid-test", "safety-newer-test"]);
    closeModal();
    await EduV24.switchPeriod(ids.first);
    await EduV24.openBackups();
    safetyButton().click();
    await wait(() => downloads.length === 2);
    check(
      "SAFETY_FILE09",
      "a readable closed first term can download the one safety file without opening it for editing",
      EduV24.getReportContext().closed && downloads.length === 2,
    );
  } catch (error) {
    check(
      "SAFETY_FILE99",
      "last-operation safety backup download and ordinary restore complete",
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
          "SAFETY_FILE_CLEANUP",
          "the isolated safety fixture restores its starting installation",
          false,
          { error: error.stack || error.message },
        );
      }
    closeModal();
  }
  return cases;
}

async function run({ cdp, evaluate, cases, delay }) {
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  cases.push(...(await evaluate("(" + safetyBackupFlow.toString() + ")()")));
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "last-operation-safety-backup", runExtra: run })
    .catch((error) => {
      console.error(error);
      process.exitCode = 2;
    });
