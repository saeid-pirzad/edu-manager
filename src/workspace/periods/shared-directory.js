// Share one academic-year directory while retaining every term's own lesson,
// grade and session records. The caller reloads/broadcasts changed workspaces.
async function synchronizeAcademicDirectoryForRead(id) {
  const database = connection,
    model = globalThis.EduAcademicYearDirectory;
  if (!model) throw Error("مدل فهرست مشترک سال تحصیلی آماده نیست.");
  const assertConnection = () => {
    if (
      connection !== database ||
      (typeof connectionRetired !== "undefined" && connectionRetired)
    )
      throw Error("اتصال بانک هنگام یکپارچه‌سازی فهرست سال تغییر کرده است.");
  };
  const family = (catalog) => {
    const active = catalog.find((period) => period.id === id);
    if (!active) throw Error("سال تحصیلی برای یکپارچه‌سازی فهرست موجود نیست.");
    return catalog
      .filter((period) => period.year === active.year)
      .sort((a, b) => a.id.localeCompare(b.id));
  };
  const signature = (periods) =>
    JSON.stringify(
      periods.map((period) => [
        period.id,
        period.year,
        period.term,
        period.termKind || null,
        period.revision,
        !!period.closed,
      ]),
    );
  const read = database.transaction(["catalog", "records"], "readonly"),
    readDone = transactionDone(read);
  let periods;
  const pending = new Promise((resolve, reject) => {
    try {
      const request = read.objectStore("catalog").getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        try {
          assertConnection();
          periods = family(request.result);
          for (const period of periods)
            if (!Number.isSafeInteger(period.revision) || period.revision < 1)
              throw Error("شمارهٔ نسخهٔ اطلاعات سال تحصیلی معتبر نیست.");
          // Queue bounded prefix reads in this still-active IDB callback.
          Promise.all(
            periods.map((period) =>
              requestPromise(
                workspaceRecordRequest(read.objectStore("records"), period.id),
              ),
            ),
          ).then(resolve, reject);
        } catch (error) {
          reject(error);
          read.abort();
        }
      };
    } catch (error) {
      reject(error);
      read.abort();
    }
  });
  const [recordSets] = await Promise.all([pending, readDone]);
  assertConnection();
  const changed = [],
    conflicts = [];
  if (periods.length < 2) return { changed, conflicts };
  const parts = periods.map((period, position) => {
    const rows = recordSets[position];
    // Decode checks record ownership, unique layout references and all grades.
    decodeWorkspaceRecords(rows, { workspaceId: period.id });
    return {
      period,
      rows,
      records: new Map(rows.map((row) => [row.logical, row.value])),
      plans: new Map(),
    };
  });
  try {
    const layout = model.reconcileLayouts(
        parts.map((part) => part.records.get("meta").layout),
      ),
      classes = new Map();
    for (const school of layout)
      for (const classId of school.classes) {
        const copies = parts
          .map((part) => part.records.get("class:" + classId))
          .filter(Boolean);
        classes.set(classId, model.reconcileClass(copies));
      }
    for (const part of parts) {
      const originalMeta = part.records.get("meta"),
        meta = { ...clone(originalMeta), layout: clone(layout) };
      if (JSON.stringify(meta) !== JSON.stringify(originalMeta))
        part.plans.set("meta", meta);
      for (const [classId, common] of classes) {
        const logical = "class:" + classId,
          original = part.records.get(logical),
          value = original
            ? model.mirrorClass(original, common, original)
            : model.skeleton(common);
        if (JSON.stringify(value) === JSON.stringify(original)) continue;
        part.plans.set(logical, value);
        // Freeze older sessions against their actual pre-change roster. Never
        // add new-year members to historical sessions by inference afterward.
        if (original)
          for (const [sessionLogical, session] of part.records) {
            if (
              !sessionLogical.startsWith("session:") ||
              session.classId !== classId ||
              Array.isArray(session.roster)
            )
              continue;
            part.plans.set(sessionLogical, {
              ...clone(session),
              roster: historicalRoster(original, session),
            });
          }
      }
      const candidate = new Map(part.records);
      for (const [logical, value] of part.plans) candidate.set(logical, value);
      decodeWorkspaceRecords(
        [...candidate].map(([logical, value]) => ({
          key: part.period.id + "|" + logical,
          workspace: part.period.id,
          logical,
          value,
        })),
        { workspaceId: part.period.id },
      );
    }
  } catch (error) {
    if (error.code !== "ACADEMIC_DIRECTORY_CONFLICT") throw error;
    conflicts.push({
      year: periods[0].year,
      message: error.message,
      code: error.code,
    });
    // No unambiguous class is partially committed while another class conflicts.
    return { changed, conflicts };
  }
  const updates = parts.filter((part) => part.plans.size);
  if (!updates.length) return { changed, conflicts };
  assertConnection();
  const tx = database.transaction(
      ["catalog", "records", "events", "undo"],
      "readwrite",
    ),
    done = transactionDone(tx);
  let failure;
  const abort = (error) => {
    failure = error;
    try {
      tx.abort();
    } catch {}
  };
  try {
    const request = tx.objectStore("catalog").getAll();
    request.onsuccess = () => {
      try {
        assertConnection();
        if (signature(family(request.result)) !== signature(periods))
          throw Error(
            "فهرست یا نوبت‌های سال در پنجرهٔ دیگری تغییر کرده‌اند؛ یکپارچه‌سازی انجام نشد.",
          );
        const at = new Date().toISOString();
        for (const { period, plans } of updates) {
          const revision = period.revision + 1;
          if (!Number.isSafeInteger(revision))
            throw Error("شمارهٔ نسخهٔ فهرست سال قابل افزایش نیست.");
          for (const [logical, value] of plans)
            tx.objectStore("records").put({
              key: period.id + "|" + logical,
              workspace: period.id,
              logical,
              value,
            });
          tx.objectStore("catalog").put({ ...period, revision, updatedAt: at });
          tx.objectStore("events").add({
            workspace: period.id,
            revision,
            at,
            action: "یکپارچه‌سازی فهرست سال تحصیلی",
            changes: [...plans.keys()].map((logical) => ({
              path: logical + ".academicYearDirectory",
              before: null,
              after: "فهرست مشترک سال یکپارچه شد؛ نمرات و جلسات نوبت حفظ شدند",
            })),
          });
          tx.objectStore("undo").delete(period.id);
          changed.push({ workspace: period.id, revision });
        }
      } catch (error) {
        abort(error);
      }
    };
  } catch (error) {
    abort(error);
  }
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  assertConnection();
  return { changed, conflicts };
}
