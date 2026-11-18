"use strict";
module.exports = async function asyncTargets() {
  const cases = [];
  closeModal();
  await EduV24.test.settle();
  const school = db.schools[0],
    classroom = school.classes[0];
  goSchool(school.id);
  goClass(classroom.id);
  const opening = openBulkScoreModal(classroom.lessons[0].id);
  goSchools();
  let rejected = false;
  try {
    await opening;
  } catch {
    rejected = true;
  }
  cases.push({
    id: "AT01",
    name: "bulk editor rejects a navigation change during draft preparation",
    pass:
      rejected &&
      state.view === "schools" &&
      document.getElementById("modal").classList.contains("hidden"),
    observed: {},
  });
  const current = EduV24.getReportContext().id;
  const records = await new Promise((resolve, reject) => {
    const request = EduV24.test
      .getConnection()
      .transaction("catalog")
      .objectStore("catalog")
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const other = records.find((row) => row.id !== current);
  if (!other)
    throw Error("Async target regression needs a second isolated period");
  let pending;
  try {
    // The file-based hub no longer reads storage estimates. Its actual async
    // boundary is the pending writer; a newer dialog must win that boundary.
    pending = EduV24.openBackups();
    pending.catch(() => {});
    showModal(
      "Newer synthetic dialog",
      '<p id="asyncTargetNewerDialog">Newer content</p>',
    );
    rejected = false;
    try {
      await pending;
    } catch {
      rejected = true;
    }
    const newerPreserved =
      !!document.getElementById("asyncTargetNewerDialog") &&
      !document.getElementById("backupHub");
    await EduV24.test.switchLegacyPeriod(other.id);
    await EduV24.test.settle();
    cases.push({
      id: "AT02",
      name: "queued backup hub preserves a newer dialog and cannot reopen after a real period switch",
      pass:
        !rejected &&
        newerPreserved &&
        document.getElementById("modal").classList.contains("hidden"),
      observed: { newerPreserved, rejected },
    });
  } finally {
    await pending?.catch(() => {});
    if (EduV24.getReportContext().id !== current)
      await EduV24.test.switchLegacyPeriod(current);
    closeModal();
    goSchools();
  }
  return cases;
};
