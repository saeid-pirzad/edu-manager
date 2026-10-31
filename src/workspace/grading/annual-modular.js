// Reconcile pre-existing annual modules without changing live UI state. The
// caller reloads affected workspaces and broadcasts revisions after completion.
async function synchronizeAnnualModularGrades(id) {
  const database = connection;
  const assertConnection = () => {
    if (
      connection !== database ||
      (typeof connectionRetired !== "undefined" && connectionRetired)
    )
      throw Error("اتصال بانک هنگام همگام‌سازی نمرات سالانه تغییر کرده است.");
  };
  const family = (catalog) => {
    const target = catalog.find((period) => period.id === id);
    if (!target) throw Error("نوبت برای همگام‌سازی نمرات سالانه موجود نیست.");
    const kind = target.termKind || academicTermKind(target.term);
    if (!["first", "second"].includes(kind)) return [];
    return ["first", "second"].flatMap((role) => {
      const members = catalog.filter(
        (period) =>
          period.year === target.year &&
          (period.termKind || academicTermKind(period.term)) === role,
      );
      if (members.length > 1) {
        const error = Error(
          "نوبت‌های سال برای همگام‌سازی نمرات پودمانی تکراری‌اند.",
        );
        error.code = "ANNUAL_PERIOD_AMBIGUOUS";
        throw error;
      }
      if (
        members.some(
          (period) =>
            !Number.isSafeInteger(period.revision) || period.revision < 1,
        )
      )
        throw Error("نسخهٔ نوبت برای همگام‌سازی نمرات سالانه معتبر نیست.");
      return members;
    });
  };
  const signature = (periods) =>
    JSON.stringify(
      periods.map((period) => [
        period.id,
        period.year,
        period.termKind || academicTermKind(period.term),
        period.revision,
        !!period.closed,
      ]),
    );
  const projection = (classroom) =>
    JSON.stringify(
      classroom.lessons
        .filter(EduAnnualModules.isFormalModular)
        .map((lesson) => [
          lesson.id,
          lesson.poudmans
            .map((pod) => [
              pod.id,
              Object.entries(pod.podScores || {})
                .map(([sid, score]) => [
                  sid,
                  score?.m ?? null,
                  score?.c ?? null,
                ])
                .filter(
                  ([, mostamar, competency]) =>
                    mostamar !== null || competency !== null,
                )
                .sort(([a], [b]) => a.localeCompare(b)),
            ])
            .sort(([a], [b]) => a.localeCompare(b)),
        ])
        .sort(([a], [b]) => a.localeCompare(b)),
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
          // All bounded requests must be queued in this active IDB callback.
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
  const conflicts = [],
    changed = [];
  if (periods.length < 2) return { changed, conflicts };
  const parts = periods.map((period, index) => ({
    period,
    data: decodeWorkspaceRecords(recordSets[index], { workspaceId: period.id })
      .data,
    plans: new Map(),
  }));
  const classes = new Map();
  for (const part of parts)
    for (const [schoolIndex, school] of part.data.schools.entries())
      for (const [classIndex, classroom] of school.classes.entries()) {
        const key = JSON.stringify([school.id, classroom.id]);
        if (!classes.has(key)) classes.set(key, []);
        classes.get(key).push({ part, schoolIndex, classIndex, classroom });
      }
  for (const [key, members] of classes) {
    if (members.length < 2) continue;
    try {
      const plans = [];
      for (const member of members) {
        const value = EduAnnualModules.mergeClass(
          [
            member.classroom,
            ...members
              .filter((other) => other !== member)
              .map((other) => other.classroom),
          ],
          { includeMissingLessons: false },
        );
        if (projection(value) === projection(member.classroom)) continue;
        const candidate = clone(member.part.data);
        candidate.schools[member.schoolIndex].classes[member.classIndex] =
          value;
        validateV24(candidate);
        plans.push({ member, candidate, value });
      }
      // Never accept just one side of a class whose other side conflicts.
      for (const { member, candidate, value } of plans) {
        member.part.data = candidate;
        member.part.plans.set("class:" + value.id, value);
      }
    } catch (error) {
      const [schoolId, classId] = JSON.parse(key);
      conflicts.push({ schoolId, classId, message: error.message });
    }
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
            "نوبت‌ها یا نمرات سالانه در پنجرهٔ دیگری تغییر کرده‌اند؛ دوباره تلاش کنید.",
          );
        const at = new Date().toISOString();
        for (const { period, plans } of updates) {
          for (const [logical, value] of plans)
            tx.objectStore("records").put({
              key: period.id + "|" + logical,
              workspace: period.id,
              logical,
              value,
            });
          const revision = period.revision + 1;
          tx.objectStore("catalog").put({ ...period, revision, updatedAt: at });
          tx.objectStore("events").add({
            workspace: period.id,
            revision,
            at,
            action: "تجمیع نمرات سالانهٔ پودمان",
            changes: [...plans.keys()].map((logical) => ({
              path: logical + ".annualModules",
              before: null,
              after: "نمره‌های سالانهٔ پودمان یکپارچه شد",
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
