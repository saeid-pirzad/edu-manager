"use strict";
module.exports = async function workspaceScale() {
  const cases = [],
    queries = [];
  const origin = EduV24.getReportContext().id,
    connection = EduV24.test.getConnection();
  const before = JSON.stringify(db);
  const namespace = "audit_scale_" + Date.now();
  const size = 10000;
  const finished = (tx) =>
    new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () =>
        reject(tx.error || Error("transaction aborted"));
    });
  const getAll = IDBObjectStore.prototype.getAll;
  let seeded = false;
  try {
    closeModal();
    const annualIds = {};
    for (const [role, term] of [
      ["first", "اول"],
      ["second", "دوم"],
    ]) {
      EduV24.openNewPeriod();
      document.getElementById("periodYear").value = "1419-1420";
      document.getElementById("periodTerm").value = term;
      await EduV24.createNewPeriod();
      annualIds[role] = EduV24.getReportContext().id;
    }
    await EduV24.switchPeriod(origin);
    closeModal();
    const catalog = await new Promise((resolve, reject) => {
      const request = connection
        .transaction("catalog")
        .objectStore("catalog")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const other = catalog.find((row) => row.id !== origin);
    if (!other) throw Error("scale fixture needs a second existing period");
    const tx = connection.transaction("records", "readwrite"),
      done = finished(tx);
    const store = tx.objectStore("records");
    for (let index = 0; index < size; index++)
      store.put({
        key: namespace + "|" + index,
        workspace: namespace,
        logical: String(index),
        value: { payload: "x".repeat(128) },
      });
    await done;
    seeded = true;
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = Reflect.apply(getAll, this, args);
      if (this.name === "records")
        request.addEventListener("success", () =>
          queries.push({
            bounded: args[0] instanceof IDBKeyRange,
            count: request.result.length,
            unrelated: request.result.some(
              (row) => row.workspace === namespace,
            ),
          }),
        );
      return request;
    };
    const start = performance.now();
    await EduV24.switchPeriod(other.id);
    await EduV24.switchPeriod(origin);
    const snapshot = await EduV24.prepareReportSnapshot();
    const elapsedMs = Math.round(performance.now() - start);
    cases.push({
      id: "SCALE01",
      name: "switching periods and single-period report use bounded record requests with 10000 unrelated records",
      pass:
        queries.length >= 3 &&
        queries.every(
          (query) => query.bounded && !query.unrelated && query.count < size,
        ),
      observed: { unrelatedRecords: size, queries: queries.slice(), elapsedMs },
    });
    cases.push({
      id: "SCALE02",
      name: "bounded reads preserve active period and report data without copying unrelated records",
      pass:
        EduV24.getReportContext().id === origin &&
        JSON.stringify(db) === before &&
        JSON.stringify(snapshot.data) === before,
    });
    await EduV24.switchPeriod(annualIds.second);
    const annualStart = queries.length;
    const annual = await EduV24.prepareReportSnapshot({
      annual: true,
      periodIds: annualIds,
    });
    const annualQueries = queries.slice(annualStart);
    cases.push({
      id: "SCALE03",
      name: "annual report reads only its two selected periods despite 10000 unrelated records",
      pass:
        annualQueries.length === 2 &&
        annualQueries.every(
          (query) => query.bounded && !query.unrelated && query.count < size,
        ) &&
        annual.parts[0].period.id === annualIds.first &&
        annual.parts[1].period.id === annualIds.second,
      observed: { unrelatedRecords: size, queries: annualQueries },
    });
  } catch (error) {
    cases.push({
      id: "SCALE99",
      name: "large installation scoped-read regression completes",
      pass: false,
      error: error.stack || String(error),
    });
  } finally {
    IDBObjectStore.prototype.getAll = getAll;
    if (seeded) {
      const tx = connection.transaction("records", "readwrite"),
        done = finished(tx);
      tx.objectStore("records").delete(
        IDBKeyRange.bound(namespace + "|", namespace + "}", false, true),
      );
      await done;
    }
    if (EduV24.getReportContext().id !== origin)
      await EduV24.switchPeriod(origin);
    closeModal();
  }
  return cases;
};
