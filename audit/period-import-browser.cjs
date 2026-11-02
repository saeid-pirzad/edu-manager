"use strict";

async function periodImportRace() {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed });
  const previous = EduV24.getReportContext().id,
    originalTransaction = globalThis.EduRecordTransaction;
  let release;
  try {
    closeModal();
    const create = async (year) => {
      await EduV24.test.prepareLegacyPeriodFixture();
      document.getElementById("periodYear").value = year;
      document.getElementById("periodTerm").value = "اول";
      await EduV24.test.createLegacyPeriod();
      return EduV24.getReportContext().id;
    };
    const source = await create("1420-1421");
    db.schools[0].name = "Restore race source snapshot";
    await saveDB();
    const backup = { version: 25, db: structuredClone(db) };
    db.schools[0].name = "Restore race source newer";
    await saveDB();
    const destination = await create("1421-1422");
    db.schools[0].name = "Restore race destination preserved";
    await saveDB();
    await EduV24.test.switchLegacyPeriod(source);
    // Exercise the retained private compatibility path. Public imports accept
    // only complete-system backups and are covered by unifiedBackup.
    await EduV24.test.importLegacyBackup({
      target: {
        files: [
          new File([JSON.stringify(backup)], "synthetic-period.json", {
            type: "application/json",
          }),
        ],
        value: "",
      },
    });
    document.getElementById("restoreExternalConfirmed").checked = true;
    let entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    globalThis.EduRecordTransaction = {
      ...originalTransaction,
      async commit(args) {
        const saved = await originalTransaction.commit(args);
        if (args.action.startsWith("بازیابی پشتیبان:")) {
          entered();
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        return saved;
      },
    };
    const restoring = EduV24.confirmImport();
    await Promise.race([
      started,
      restoring.then(() => {
        throw Error("Replacement did not enter the real transaction boundary");
      }),
    ]);
    const switching = EduV24.test.switchLegacyPeriod(destination);
    await new Promise((resolve) => setTimeout(resolve, 40));
    check(
      "RESTORERACE01",
      "period switching waits for a real pending replacement commit and memory update",
      EduV24.getReportContext().id === source,
    );
    release();
    await Promise.all([restoring, switching]);
    check(
      "RESTORERACE02",
      "the selected destination never receives restored source data in memory",
      EduV24.getReportContext().id === destination &&
        db.schools[0].name === "Restore race destination preserved",
    );
    db.schools[0].name = "Restore race destination next edit";
    await saveDB();
    const installed = await EduV24.snapshotInstallation();
    const schoolName = (id) =>
      installed.stores.records.find(
        (row) => row.workspace === id && row.logical === "meta",
      )?.value.layout[0]?.name;
    check(
      "RESTORERACE03",
      "the next destination edit persists only in the destination and leaves the restored source intact",
      schoolName(source) === "Restore race source snapshot" &&
        schoolName(destination) === "Restore race destination next edit",
    );
    check(
      "RESTORERACE04",
      "the complete installation remains a valid restorable backup after concurrent restore and switch",
      EduV24.validateFullBackup(installed).length ===
        installed.stores.catalog.length,
    );
  } finally {
    release?.();
    globalThis.EduRecordTransaction = originalTransaction;
    closeModal();
    if (EduV24.getReportContext().id !== previous)
      await EduV24.test.switchLegacyPeriod(previous);
  }
  return cases;
}

module.exports = async ({ cdp, evaluate, cases }) => {
  if (await evaluate("!!EduV24.getReportContext().blocked")) {
    await cdp("Page.reload", { ignoreCache: true });
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate("!!globalThis.EduV24?.getReportContext?.().ready"))
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  cases.push(...(await evaluate("(" + periodImportRace.toString() + ")()")));
};

if (require.main === module)
  require("./data-integrity.cjs")
    .main({
      stage: "period-import-switch-race",
      runExtra: module.exports,
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 2;
    });
