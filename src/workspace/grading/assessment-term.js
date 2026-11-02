// Missing assessment stages extend the current year without changing the open
// workspace or closing another stage. Existing catalog identities stay intact.
const assessmentTermRequests = new Map();
async function ensureAcademicAssessmentTerm(kind) {
  if (!["first", "second"].includes(kind))
    throw Error("مرحلهٔ سال تحصیلی معتبر نیست.");
  assertWorkspaceReadable();
  const year = workspace.year,
    key = year + "|" + kind;
  if (assessmentTermRequests.has(key)) return assessmentTermRequests.get(key);
  const operation = (async () => {
    const origin = captureWorkspaceContext(),
      database = connection;
    await writer.catch(() => {});
    assertWorkspaceContext(origin);
    const rows = await allFrom("catalog");
    assertWorkspaceContext(origin);
    if (connection !== database)
      throw Error("اتصال سال تحصیلی تغییر کرده است.");
    const matches = rows.filter(
      (row) =>
        row.year === year &&
        (row.termKind || academicTermKind(row.term)) === kind,
    );
    if (matches.length > 1)
      throw Error(
        "اطلاعات قدیمی این سال چند نسخه از مرحلهٔ انتخاب‌شده دارد؛ ابتدا فایل معتبر را بازیابی کنید.",
      );
    if (matches.length) return matches[0];
    const family = rows.filter((row) => row.year === year);
    if (
      !["first", "second"].includes(
        workspace.termKind || academicTermKind(workspace.term),
      ) ||
      family.some(
        (row) =>
          !["first", "second"].includes(
            row.termKind || academicTermKind(row.term),
          ),
      )
    )
      throw Error(
        "ترم اطلاعات قدیمی این سال مشخص نیست؛ پیش از ایجاد مرحله، فایل معتبر را بازیابی کنید.",
      );
    const source = await readWorkspaceSnapshot(origin.id);
    assertWorkspaceContext(origin);
    if (
      source.period.revision !== origin.revision ||
      source.period.year !== year ||
      connection !== database
    )
      throw Error(
        "اطلاعات سال هنگام آماده‌سازی مرحله تغییر کرد؛ دوباره انتخاب کنید.",
      );
    const data = clone(source.data);
    data.sessions = [];
    data.migrationWarnings = [];
    data.settings.academicTerm = kind === "first" ? "اول" : "دوم";
    for (const school of data.schools)
      for (const classroom of school.classes)
        for (const lesson of classroom.lessons) {
          lesson.kardaneshScores = {};
          for (const pod of lesson.poudmans || []) {
            if (lesson.gradingPolicy?.method !== "modular") pod.podScores = {};
            for (const unit of pod.units || []) unit.unitScores = {};
          }
        }
    const created = await installWorkspace(normalizeDB(data), {
      year,
      term: data.settings.academicTerm,
      assessmentSource: { id: origin.id, revision: origin.revision, year },
    });
    broadcast({
      workspace: created.id,
      revision: created.revision,
      annualAssessment: true,
    });
    return created;
  })();
  assessmentTermRequests.set(key, operation);
  try {
    return await operation;
  } finally {
    if (assessmentTermRequests.get(key) === operation)
      assessmentTermRequests.delete(key);
  }
}
