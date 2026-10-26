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
  const originalEstimate = navigator.storage.estimate;
  let release, pending;
  try {
    navigator.storage.estimate = () =>
      new Promise((resolve) => {
        release = () => resolve({ usage: 0, quota: 1 });
      });
    pending = EduV24.openBackups();
    pending.catch(() => {});
    for (let attempt = 0; attempt < 100 && !release; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    if (!release)
      throw Error("Backup dialog did not reach the delayed estimate stage");
    await EduV24.switchPeriod(other.id);
    release();
    rejected = false;
    try {
      await pending;
    } catch {
      rejected = true;
    }
    cases.push({
      id: "AT02",
      name: "backup dialog cannot reopen old rows after a real period switch",
      pass:
        rejected &&
        document.getElementById("modal").classList.contains("hidden"),
      observed: {},
    });
  } finally {
    navigator.storage.estimate = originalEstimate;
    release?.();
    await pending?.catch(() => {});
    if (EduV24.getReportContext().id !== current)
      await EduV24.switchPeriod(current);
    closeModal();
    goSchools();
  }
  return cases;
};
