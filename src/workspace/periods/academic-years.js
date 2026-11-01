// Canonicalize equivalent year labels before grouping terms. The detached
// snapshot and one guarded write transaction preserve all historical values.
async function synchronizeAcademicYearsForRead() {
  const database = connection,
    names = ["catalog", "records", "reports", "undo", "backups"],
    assertConnection = () => {
      if (
        connection !== database ||
        (typeof connectionRetired !== "undefined" && connectionRetired)
      )
        throw Error("اتصال بانک هنگام اصلاح قالب سال تحصیلی تغییر کرده است.");
    },
    keyOf = (name, row) => (name === "records" ? row.key : row.id),
    signature = (name, rows) =>
      JSON.stringify(
        [...rows].sort((a, b) =>
          String(keyOf(name, a)).localeCompare(String(keyOf(name, b))),
        ),
      );
  assertConnection();
  const read = database.transaction(names, "readonly"),
    readDone = transactionDone(read),
    [values] = await Promise.all([
      Promise.all(
        names.map((name) => requestPromise(read.objectStore(name).getAll())),
      ),
      readDone,
    ]);
  assertConnection();
  const original = Object.fromEntries(
      names.map((name, index) => [name, values[index]]),
    ),
    normalized = validateFullBackup.normalizeYears({
      format: "EduManager.FullBackup",
      stores: original,
    }).stores,
    catalog = new Map(original.catalog.map((row) => [row.id, row])),
    plans = new Map(),
    affected = new Set();
  for (const row of normalized.catalog) EduAcademicYear.normalize(row.year);
  for (const name of names) {
    const rows = new Map();
    normalized[name].forEach((row, index) => {
      if (JSON.stringify(row) === JSON.stringify(original[name][index])) return;
      rows.set(keyOf(name, row), row);
      const owner =
        name === "catalog" || name === "undo" ? row.id : row.workspace;
      if (catalog.has(owner)) affected.add(owner);
    });
    if (rows.size) plans.set(name, rows);
  }
  if (!plans.size) return { changed: [] };
  const at = new Date().toISOString(),
    changed = [],
    catalogPlans = plans.get("catalog") || new Map();
  for (const id of affected) {
    const period = catalog.get(id),
      revision = period.revision + 1;
    if (
      !Number.isSafeInteger(period.revision) ||
      period.revision < 1 ||
      !Number.isSafeInteger(revision)
    )
      throw Error("شمارهٔ نسخهٔ سال تحصیلی برای اصلاح قالب معتبر نیست.");
    const current = normalized.catalog.find((row) => row.id === id);
    catalogPlans.set(id, { ...current, revision, updatedAt: at });
    changed.push({ workspace: id, revision });
    const undo = normalized.undo.find((row) => row.id === id);
    if (undo && undo.revision === period.revision) {
      const undoPlans = plans.get("undo") || new Map();
      undoPlans.set(id, { ...undo, revision });
      plans.set("undo", undoPlans);
    }
  }
  if (catalogPlans.size) plans.set("catalog", catalogPlans);
  assertConnection();
  const checked = [...new Set(["catalog", ...plans.keys()])],
    tx = database.transaction([...checked, "events"], "readwrite"),
    done = transactionDone(tx);
  let failure;
  const abort = (error) => {
    failure = error;
    try {
      tx.abort();
    } catch {}
  };
  try {
    let remaining = checked.length;
    const current = new Map();
    for (const name of checked) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => {
        try {
          assertConnection();
          current.set(name, request.result);
          if (--remaining) return;
          for (const store of checked)
            if (
              signature(store, current.get(store)) !==
              signature(store, original[store])
            )
              throw Error(
                "اطلاعات سال تحصیلی در پنجرهٔ دیگری تغییر کرده است؛ دوباره برنامه را باز کنید.",
              );
          for (const [store, rows] of plans)
            for (const row of rows.values()) tx.objectStore(store).put(row);
          for (const item of changed)
            tx.objectStore("events").add({
              workspace: item.workspace,
              revision: item.revision,
              at,
              action: "یکسان‌سازی قالب سال تحصیلی",
              changes: [
                {
                  path: "academicYearFormat",
                  before: catalog.get(item.workspace).year,
                  after: catalogPlans.get(item.workspace).year,
                },
              ],
            });
        } catch (error) {
          abort(error);
        }
      };
    }
  } catch (error) {
    abort(error);
  }
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  assertConnection();
  return { changed };
}
