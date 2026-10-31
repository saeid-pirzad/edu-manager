function validateAcademicTransition(rows, year, term) {
  if (!["اول", "دوم"].includes(term))
    throw Error("هر سال تحصیلی فقط نوبت اول و دوم دارد.");
  const kind = academicTermKind(term);
  const sameYear = rows.filter((row) => row.year === year);
  if (
    sameYear.some(
      (row) => (row.termKind || academicTermKind(row.term)) === kind,
    )
  )
    throw Error("این نوبت از سال تحصیلی قبلاً شروع شده است.");
  if (kind === "first") {
    if (
      sameYear.some(
        (row) => (row.termKind || academicTermKind(row.term)) === "second",
      )
    )
      throw Error("این سال نوبت دوم دارد؛ نوبت اول تکراری نسازید.");
    return null;
  }
  const first = sameYear.filter(
    (row) => (row.termKind || academicTermKind(row.term)) === "first",
  );
  if (first.length !== 1)
    throw Error(
      "برای شروع نوبت دوم، باید یک نوبت اول مشخص در همین سال وجود داشته باشد.",
    );
  if (!first[0].closed)
    throw Error(
      "ابتدا نوبت اول همین سال را ببندید؛ سپس نوبت دوم را شروع کنید.",
    );
  return first[0];
}
function remapReportNoteKey(key, target, mapping) {
  const segments = key.split("|");
  segments[0] = target;
  if (segments[1] === "annual" && segments[2].startsWith("academic-year:")) {
    const refs = segments[2].split(":");
    for (let i = 1; i < refs.length; i++)
      if (mapping.has(refs[i])) refs[i] = mapping.get(refs[i]);
    segments[2] = refs.join(":");
  }
  return segments.join("|");
}
function recoveryPeriodTerm(term, marker) {
  const suffix = " — بازیابی " + marker;
  return (
    term
      .slice(0, Math.max(0, 60 - suffix.length))
      .replace(/[\uD800-\uDBFF]$/, "") + suffix
  );
}
function academicTermKind(term) {
  const base = String(term || "").split(" — بازیابی ")[0];
  return { اول: "first", دوم: "second", تابستان: "summer" }[base] || null;
}
async function installWorkspace(data, details) {
  const id = details.id || uid(),
    now = new Date().toISOString();
  const catalog = {
    id,
    year: details.year || data.settings.academicYear,
    term: details.term || data.settings.academicTerm || "نامشخص",
    termKind:
      details.termKind ||
      academicTermKind(details.term || data.settings.academicTerm),
    revision: 1,
    closed: false,
    createdAt: now,
    updatedAt: now,
  };
  const installed = clone(data);
  installed.settings.academicYear = catalog.year;
  installed.settings.academicTerm = catalog.term;
  validateV24(installed);
  const records = collectRecords(installed);
  const tx = connection.transaction(["records", "catalog"], "readwrite"),
    done = transactionDone(tx);
  let duplicate = false,
    queueError;
  const abortQueue = (error) => {
    queueError = error;
    try {
      tx.abort();
    } catch (ignore) {}
  };
  try {
    const store = tx.objectStore("catalog"),
      existing = store.getAll();
    existing.onsuccess = () => {
      try {
        if (
          existing.result.some(
            (row) =>
              row.year === catalog.year &&
              ((catalog.termKind &&
                (row.termKind || academicTermKind(row.term)) ===
                  catalog.termKind) ||
                normalizedName(row.term) === normalizedName(catalog.term)),
          )
        ) {
          duplicate = true;
          tx.abort();
          return;
        }
        if (details.requireSequence) {
          const first = validateAcademicTransition(
            existing.result,
            catalog.year,
            catalog.term,
          );
          if (first && first.revision !== details.firstRevision)
            throw Error("نوبت اول هنگام شروع نوبت دوم تغییر کرده است.");
        }
        store.add(catalog);
        for (const [logical, value] of records)
          tx.objectStore("records").put({
            key: id + "|" + logical,
            workspace: id,
            logical,
            value,
          });
      } catch (error) {
        abortQueue(error);
      }
    };
  } catch (error) {
    abortQueue(error);
  }
  try {
    await done;
  } catch (error) {
    if (duplicate)
      throw Error("دوره دیگری با همین سال و عنوان نوبت وجود دارد.", {
        cause: error,
      });
    throw queueError || error;
  }
  return catalog;
}
