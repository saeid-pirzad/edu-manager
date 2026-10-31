"use strict";
const { main } = require("./data-integrity.cjs");
async function deletionFlow() {
  const cases = [];
  const check = (id, pass, observed) =>
    cases.push({ id, name: id, pass: !!pass, observed });
  const wait = async (predicate) => {
    for (let i = 0; i < 150; i++) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error(
      "Deletion UI timeout: " +
        (document.getElementById("operationError")?.textContent || ""),
    );
  };
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("EduManagerProfessional");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const read = (name) =>
    new Promise((resolve, reject) => {
      const request = database.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const originalConfirm = window.confirm;
  try {
    closeModal();
    await EduV24.openNewPeriod();
    document.getElementById("periodYear").value = "1420-1421";
    document.getElementById("periodTerm").value = "اول";
    await EduV24.createNewPeriod();
    const active = EduV24.getReportContext().id;
    const schoolName = db.schools[0].name;
    db.schools[0].name = schoolName + " آزمون بازگردانی";
    await saveDB({ action: "آزمون مودال بازگردانی" });
    render();
    document.querySelector(".workspace-tools").open = true;
    document.querySelector('#app [data-workspace-action="undo"]').click();
    await wait(() => document.getElementById("undoPreview"));
    check(
      "UNDO_MODAL_PREVIEW",
      document
        .getElementById("undoPreview")
        .textContent.includes("آزمون مودال بازگردانی") &&
        db.schools[0].name !== schoolName,
    );
    const undoPanel = document.getElementById("undoPreview");
    check(
      "UNDO_MODAL_NO_OVERFLOW",
      undoPanel.scrollWidth <= undoPanel.clientWidth + 1,
    );
    let duplicatePrompt = false;
    window.confirm = () => {
      duplicatePrompt = true;
      return false;
    };
    document.querySelector('[data-workspace-action="confirm-undo"]').click();
    await wait(
      () =>
        db.schools[0].name === schoolName &&
        !document.querySelector("#modal:not(.hidden) #undoPreview"),
    );
    check(
      "UNDO_MODAL_APPLIES_ONCE",
      !duplicatePrompt && db.schools[0].name === schoolName,
    );
    document.querySelector('#app [data-workspace-action="undo"]').click();
    await wait(() =>
      document.querySelector("#modal:not(.hidden) #undoPreview"),
    );
    check(
      "UNDO_MODAL_EMPTY_STATE",
      !document.querySelector('[data-workspace-action="confirm-undo"]'),
    );
    closeModal();
    const before = (await read("catalog")).map((row) => row.id);
    await EduV24.openPeriods();
    document
      .querySelector(
        '[data-workspace-action="delete-period"][data-key="' + active + '"]',
      )
      .click();
    await wait(() => document.getElementById("periodDeletionConfirmed"));
    check(
      "DELETE_UI_PREVIEW",
      document.querySelector(".period-delete-stats") &&
        document.querySelector(".period-delete-transition"),
    );
    const width = document.querySelector(".period-delete");
    check("DELETE_UI_NO_OVERFLOW", width.scrollWidth <= width.clientWidth + 1);
    document.getElementById("periodDeletionConfirmed").checked = true;
    window.confirm = () => true;
    document
      .querySelector('[data-workspace-action="confirm-delete-period"]')
      .click();
    await wait(
      async () =>
        !(await read("catalog")).some((row) => row.id === active) &&
        EduV24.getReportContext().id !== active,
    );
    await wait(() => document.querySelector(".period-hub"));
    const after = await read("catalog");
    check(
      "DELETE_ACTIVE_TRANSITION",
      after.some((row) => row.id === EduV24.getReportContext().id) &&
        !EduV24.getReportContext().blocked,
    );
    check(
      "DELETE_OTHER_PERIODS_UNCHANGED",
      after.length === before.length - 1 &&
        before
          .filter((id) => id !== active)
          .every((id) => after.some((row) => row.id === id)),
    );
    check(
      "DELETE_SAFETY_PRESENT",
      (await read("backups")).some(
        (row) =>
          row.id.startsWith("before-period-delete-") &&
          row.full.stores.catalog.some((period) => period.id === active),
      ),
    );
    check(
      "DELETE_NO_ORPHAN_RECORDS",
      !(await read("records")).some((row) => row.workspace === active),
    );
    const exported = await EduV24.snapshotInstallation();
    EduV24.previewFullBackup(exported);
    check(
      "DELETE_EXPORT_VALID",
      !!document.getElementById("fullRestoreConfirmed"),
    );
  } catch (error) {
    check("DELETE_BROWSER_ERROR", false, error.message);
  } finally {
    window.confirm = originalConfirm;
    database.close();
  }
  return cases;
}
if (require.main === module)
  main({
    stage: "period-deletion",
    runExtra: async ({ cdp, evaluate, cases }) => {
      await cdp("Page.reload", { ignoreCache: true });
      for (let i = 0; i < 150; i++) {
        if (await evaluate("!!globalThis.EduV24?.getReportContext?.().ready"))
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      cases.push(...(await evaluate("(" + deletionFlow.toString() + ")()")));
    },
  }).catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
