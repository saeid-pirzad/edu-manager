"use strict";
module.exports = async function fullRestoreSafety() {
  const cases = [];
  const origin = EduV24.getReportContext().id;
  const source = await EduV24.snapshotInstallation();
  for (const name of Object.keys(source.stores))
    source.stores[name] = source.stores[name].filter((row) =>
      name === "catalog"
        ? row.id === origin
        : name === "undo"
          ? row.id === origin
          : row.workspace === origin,
    );
  source.reportDrafts = { [origin]: source.reportDrafts[origin] || {} };
  source.gradeDrafts = source.gradeDrafts.filter(
    (row) => row.workspace === origin,
  );
  const connection = EduV24.test.getConnection();
  const capture = () =>
    new Promise((resolve, reject) => {
      const names = Object.keys(source.stores),
        tx = connection.transaction(names, "readonly"),
        values = {};
      tx.oncomplete = () => resolve(JSON.stringify(values));
      tx.onabort = tx.onerror = () => reject(tx.error);
      for (const name of names) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => {
          values[name] = request.result;
        };
      }
    });
  closeModal();
  EduV24.previewFullBackup(source);
  const before = await capture();
  const original = IDBObjectStore.prototype.add;
  let count = 0,
    error = "";
  try {
    IDBObjectStore.prototype.add = function (...args) {
      if (++count === 2)
        throw new DOMException(
          "audit synchronous restore failure",
          "DataCloneError",
        );
      return Reflect.apply(original, this, args);
    };
    try {
      await EduV24.restoreFullBackup();
    } catch (failure) {
      error = failure.message;
    }
  } finally {
    IDBObjectStore.prototype.add = original;
  }
  cases.push({
    id: "RESTORE01",
    name: "synchronous add failure rolls back every queued write in a real IndexedDB restore",
    pass:
      !!error &&
      before === (await capture()) &&
      EduV24.getReportContext().id === origin,
    observed: { queuedAttempts: count, error },
  });
  try {
    await EduV24.restoreFullBackup();
    const restored = EduV24.getReportContext().id;
    const backup = await EduV24.snapshotInstallation();
    EduV24.validateFullBackup(backup);
    cases.push({
      id: "RESTORE02",
      name: "the same accepted preview can be retried successfully after transaction rollback",
      pass:
        restored !== origin &&
        backup.stores.catalog.some((row) => row.id === restored),
    });
  } catch (failure) {
    cases.push({
      id: "RESTORE99",
      name: "retry after restore rollback completes",
      pass: false,
      error: failure.stack || String(failure),
    });
  } finally {
    closeModal();
    await EduV24.switchPeriod(origin);
    closeModal();
  }
  return cases;
};
