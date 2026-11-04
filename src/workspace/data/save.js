async function commitRecords(
  records,
  {
    action = "ویرایش اطلاعات",
    replace = false,
    allowClosed = false,
    keepUndo = true,
    directoryRevisions,
    expectedInstallation = typeof installationToken === "undefined"
      ? ""
      : installationToken,
  } = {},
  historicalUndo = null,
) {
  if (blocked) throw Error("ذخیره مسدود است؛ صفحه را دوباره بارگذاری کنید.");
  if (workspace.closed && !allowClosed)
    throw Error("این ترم بسته است؛ ابتدا آن را بازگشایی کنید.");
  const sourceWorkspace = workspace,
    sourceRevision = workspace.revision,
    sourceConnection = connection,
    sourceCommitted = committed;
  const isCurrentCommit = () =>
    (typeof installationToken === "undefined" ? "" : installationToken) ===
      expectedInstallation &&
    workspace === sourceWorkspace &&
    workspace.revision === sourceRevision &&
    connection === sourceConnection &&
    committed === sourceCommitted &&
    !resetBusy &&
    !connectionRetired;
  let historicalRecords = null;
  if (historicalUndo !== null) {
    if (
      historicalUndo.id !== sourceWorkspace.id ||
      historicalUndo.revision !== sourceRevision
    )
      throw Error("سابقهٔ بازگردانی با نوبت و نسخهٔ فعلی یکسان نیست.");
    historicalRecords = validatedUndoCandidate(
      historicalUndo,
      new Map(
        [...sourceCommitted].map(([key, json]) => [key, JSON.parse(json)]),
      ),
      sourceWorkspace,
    );
    const meta = records.get("meta");
    if (meta) {
      const warningState = {
        settings: meta.settings,
        migrationWarnings: meta.migrationWarnings,
        sessions: [...records]
          .filter(([key]) => key.startsWith("session:"))
          .map(([, value]) => value),
      };
      refreshAcademicYearWarnings(warningState);
      meta.migrationWarnings = warningState.migrationWarnings;
    }
  }
  const { changed, removed, before, changes } = EduRecordCommitPlan.create(
    records,
    committed,
    { replace },
  );
  if (!changed.length && !removed.length) return;
  // Keep legacy dates readable/editable, but never introduce a new out-of-year
  // session or move an existing session to a different out-of-year date.
  const academicYear =
    records.get("meta")?.settings?.academicYear ?? workspace.year;
  for (const [key, json] of changed) {
    if (!key.startsWith("session:")) continue;
    const current = JSON.parse(json),
      previous = before.find((row) => row.key === key)?.value;
    if (
      (!previous || previous.date !== current.date) &&
      JSON.stringify(historicalRecords?.get(key)) !== JSON.stringify(current)
    )
      EduAcademicYear.assertDate(academicYear, current.date);
  }
  if (failNextWrite) {
    failNextWrite = false;
    throw new DOMException("آزمون شکست ذخیره", "QuotaExceededError");
  }
  let nextCatalog;
  const annualChanged = [],
    directorySourceUpdates = [];
  try {
    nextCatalog = await EduRecordTransaction.commit({
      connection: sourceConnection,
      expectedInstallation,
      workspace: sourceWorkspace,
      records,
      changed,
      removed,
      before,
      changes,
      action,
      keepUndo,
      normalizedName,
      academicTermKind,
      annualChanged,
      decodeRecords: decodeWorkspaceRecords,
      historicalRoster,
      directorySourceUpdates,
      directoryRevisions,
      recoveredUndo: historicalUndo?.recoveredPeers,
      restoredSessionRecords: historicalRecords,
    });
  } catch (error) {
    if (
      ["WORKSPACE_CONFLICT", "INSTALLATION_CHANGED"].includes(error.code) &&
      isCurrentCommit()
    )
      blocked = true;
    throw error;
  }
  if (isCurrentCommit()) {
    for (const [key, json] of changed) sourceCommitted.set(key, json);
    for (const key of removed) sourceCommitted.delete(key);
    for (const [key, value] of directorySourceUpdates) {
      if (key === "meta") {
        const sent = records.get("meta")?.masterSchedule || {};
        for (const [slot, previous] of Object.entries(sent))
          if (
            !Object.hasOwn(value.masterSchedule || {}, slot) &&
            JSON.stringify(db.masterSchedule?.[slot]) ===
              JSON.stringify(previous)
          )
            delete db.masterSchedule[slot];
        continue;
      }
      if (!key.startsWith("session:")) continue;
      const session = db.sessions.find((item) => item.id === value.id);
      if (session && !session.roster && value.roster)
        session.roster = clone(value.roster);
    }
    workspace = nextCatalog;
  }
  if (
    (typeof installationToken === "undefined" ? "" : installationToken) ===
      expectedInstallation &&
    connection === sourceConnection &&
    !resetBusy &&
    !connectionRetired
  ) {
    broadcast({ workspace: nextCatalog.id, revision: nextCatalog.revision });
    for (const change of annualChanged)
      broadcast({ ...change, annualModular: true });
  }
  return true;
}

function saveDBV24(scope = {}, { feedbackScope = captureSaveFeedback() } = {}) {
  if (periodLoading)
    return Promise.reject(
      Error("ترم در حال خواندن است؛ پس از پایان جابه‌جایی دوباره تلاش کنید."),
    );
  if (resetBusy || connectionRetired)
    return Promise.reject(Error("ثبت هنگام پاک‌سازی یا تغییر بانک متوقف است."));
  if (fileMode)
    return Promise.reject(
      Error(
        "برای ویرایش، نسخه نصب‌شده برنامه یا نشانی HTTPS آن را باز کنید. حالت فایل فقط برای انتقال سوابق است.",
      ),
    );
  if (db.settings?.password && !isAuthenticated)
    return Promise.reject(Error("ابتدا وارد ترم شوید؛ تغییر ثبت نشد."));
  const generation = writeFailureGeneration,
    targetWorkspace = workspace?.id,
    targetConnection = connection,
    expectedInstallation =
      typeof installationToken === "undefined" ? "" : installationToken;
  const isCurrentTarget = () =>
    (typeof installationToken === "undefined" ? "" : installationToken) ===
      expectedInstallation &&
    workspace?.id === targetWorkspace &&
    connection === targetConnection &&
    !periodLoading &&
    !resetBusy &&
    !connectionRetired;
  busy++;
  paintStatus(feedbackScope);
  const operation = writer
    .catch(() => {})
    .then(async () => {
      if (generation !== writeFailureGeneration)
        throw Error(
          "ثبت قبلی ناموفق بود؛ این درخواست هم ثبت نشده است. تغییر را دوباره اعمال کنید.",
        );
      if (!isCurrentTarget())
        throw Error("ترم یا اتصال بانک تغییر کرده است؛ این درخواست ثبت نشد.");
      if (db.settings?.password && !isAuthenticated)
        throw Error("ابتدا وارد ترم شوید؛ تغییر ثبت نشد.");
      checkScope(scope);
      refreshAcademicYearWarnings(db);
      await commitRecords(collectRecords(db, scope), {
        ...scope,
        expectedInstallation,
        replace: !scope.classId && !scope.sessionId,
      });
      if (!isCurrentTarget()) return;
      storageBlocked = false;
      storageProblem = "";
      setStatus("تغییرات ذخیره شد.", "saved", feedbackScope);
      scheduleSingleFile();
    })
    .catch(async (error) => {
      if (isCurrentTarget()) {
        try {
          const loaded = await readWorkspace(targetWorkspace);
          if (isCurrentTarget()) db = loaded.data;
        } catch (ignore) {}
      }
      // Invalidate every request queued against the in-memory data that was rolled back.
      writeFailureGeneration++;
      if (isCurrentTarget()) {
        setStatus("تغییر ذخیره نشد: " + error.message, "error", feedbackScope);
        render();
      }
      throw error;
    })
    .finally(() => {
      busy--;
      paintStatus();
    });
  writer = operation;
  return operation;
}
