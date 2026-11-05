"use strict";
module.exports = async function unifiedBackup() {
  const cases = [],
    record = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed });
  const original = await EduV24.snapshotInstallation();
  const files = [],
    oldDownload = downloadLocalFile;
  const pause = () => new Promise((r) => setTimeout(r, 50));
  const wait = async (predicate) => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await pause();
    }
    throw Error("Backup action timed out");
  };
  const logical = (v) =>
    JSON.stringify(
      EduV24.validateFullBackup(v).map(({ period, data }) => ({
        id: period.id,
        data,
      })),
    );
  try {
    downloadLocalFile = (blob) => {
      void blob.text().then((text) => files.push(JSON.parse(text)));
    };
    closeModal();
    await EduV24.openBackups();
    document.querySelector('[data-workspace-action="export-full"]').click();
    await wait(() => files.length === 1);
    closeModal();
    await wipeAllData();
    document.querySelector(".wipe-export").click();
    await wait(() => files.length === 2);
    await exportBackup();
    await wait(() => files.length === 3);
    record(
      "UNIFIED01",
      "Backup hub and delete-all safety download contain identical complete period data",
      logical(files[0]) === logical(files[1]) &&
        logical(files[0]) === logical(files[2]) &&
        logical(files[0]) === logical(original),
      { periods: files[0].stores.catalog.length },
    );
  } finally {
    downloadLocalFile = oldDownload;
    closeModal();
  }
  const fixture = structuredClone(original),
    base = original.stores.catalog.find(
      (p) => p.id === original.activeWorkspace,
    );
  for (const name of Object.keys(fixture.stores)) fixture.stores[name] = [];
  fixture.reportDrafts = {};
  fixture.gradeDrafts = [];
  for (const [i, term] of ["اول", "دوم", "تابستان"].entries()) {
    const id = "unified-period-" + i;
    fixture.stores.catalog.push({
      ...structuredClone(base),
      id,
      year: base.year,
      term,
      termKind: ["first", "second", "summer"][i],
      closed: i < 2,
      revision: 1,
      reportNotesRecovery: {},
    });
    for (const raw of original.stores.records.filter(
      (r) => r.workspace === base.id,
    )) {
      const row = structuredClone(raw);
      row.workspace = id;
      row.key = id + "|" + row.logical;
      if (row.logical === "meta") {
        row.value.settings.academicYear = base.year;
        row.value.settings.academicTerm = term;
      }
      if (row.logical.startsWith("class:"))
        for (const lesson of row.value.lessons || [])
          if (lesson.gradeMode === "kardanesh") {
            for (const score of Object.values(lesson.kardaneshScores || {})) {
              for (const key of [
                "practical",
                "theory",
                "midtermPractical",
                "midtermTheory",
              ])
                score[key] = 10 + i * 4;
            }
          }
      fixture.stores.records.push(row);
    }
  }
  fixture.activeWorkspace = "unified-period-2";
  const expected = logical(fixture);
  EduV24.validateFullBackup(fixture);
  const restore = async (value) => {
    closeModal();
    EduV24.previewFullBackup(value);
    document.getElementById("fullRestoreConfirmed").checked = true;
    await EduV24.restoreFullBackup();
  };
  try {
    await restore(fixture);
    let result = await EduV24.snapshotInstallation();
    const oldIds = new Set(original.stores.catalog.map((p) => p.id));
    record(
      "UNIFIED02",
      "One-file restore replaces all old periods with three saved periods and their independent data",
      logical(result) === expected &&
        result.stores.catalog.length === 3 &&
        !result.stores.catalog.some((p) => oldIds.has(p.id)),
      { periods: result.stores.catalog.map((p) => p.term) },
    );
    record(
      "UNIFIED03",
      "Old events reports undo and ordinary internal backups are replaced without creating an operation backup",
      result.stores.events.length === 0 &&
        result.stores.reports.length === 0 &&
        result.stores.undo.length === 0 &&
        result.stores.backups.length === 0,
    );
    await restore(fixture);
    result = await EduV24.snapshotInstallation();
    record(
      "UNIFIED04",
      "Repeating complete replacement does not duplicate periods or students",
      logical(result) === expected && result.stores.catalog.length === 3,
    );
    const damaged = structuredClone(fixture);
    damaged.stores.records = damaged.stores.records.filter(
      (row) =>
        !(row.workspace === fixture.activeWorkspace && row.logical === "meta"),
    );
    let rejected = false;
    try {
      EduV24.previewFullBackup(damaged);
    } catch {
      rejected = true;
    }
    record(
      "UNIFIED05",
      "Missing required metadata is refused before replacing any current data",
      rejected && logical(await EduV24.snapshotInstallation()) === expected,
    );
  } finally {
    await restore(original);
  }
  return cases;
};
