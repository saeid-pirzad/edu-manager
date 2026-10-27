async function commitRecords(
  records,
  {
    action = "ویرایش اطلاعات",
    replace = false,
    allowClosed = false,
    keepUndo = true,
  } = {},
) {
  if (blocked) throw Error("ذخیره مسدود است؛ صفحه را دوباره بارگذاری کنید.");
  if (workspace.closed && !allowClosed)
    throw Error("این دوره بسته است؛ ابتدا آن را بازگشایی کنید.");
  const sourceWorkspace = workspace,
    sourceRevision = workspace.revision,
    sourceConnection = connection,
    sourceCommitted = committed;
  const isCurrentCommit = () =>
    workspace === sourceWorkspace &&
    workspace.revision === sourceRevision &&
    connection === sourceConnection &&
    committed === sourceCommitted &&
    !resetBusy &&
    !connectionRetired;
  const { changed, removed, before, changes } = EduRecordCommitPlan.create(
    records,
    committed,
    { replace },
  );
  if (!changed.length && !removed.length) return;
  if (failNextWrite) {
    failNextWrite = false;
    throw new DOMException("آزمون شکست ذخیره", "QuotaExceededError");
  }
  let nextCatalog;
  try {
    nextCatalog = await EduRecordTransaction.commit({
      connection: sourceConnection,
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
    });
  } catch (error) {
    if (error.code === "WORKSPACE_CONFLICT" && isCurrentCommit())
      blocked = true;
    throw error;
  }
  if (isCurrentCommit()) {
    for (const [key, json] of changed) sourceCommitted.set(key, json);
    for (const key of removed) sourceCommitted.delete(key);
    workspace = nextCatalog;
  }
  if (connection === sourceConnection && !resetBusy && !connectionRetired)
    broadcast({ workspace: nextCatalog.id, revision: nextCatalog.revision });
  return true;
}

function saveDBV24(scope = {}) {
  if (periodLoading)
    return Promise.reject(
      Error("دوره در حال خواندن است؛ پس از پایان جابه‌جایی دوباره تلاش کنید."),
    );
  if (resetBusy || connectionRetired)
    return Promise.reject(Error("ثبت هنگام پاک‌سازی یا تغییر بانک متوقف است."));
  if (fileMode)
    return Promise.reject(
      Error(
        "برای ویرایش، نسخه نصب‌شده برنامه یا نشانی HTTPS آن را باز کنید. حالت فایل فقط برای انتقال سوابق است.",
      ),
    );
  const generation = writeFailureGeneration,
    targetWorkspace = workspace?.id,
    targetConnection = connection;
  const isCurrentTarget = () =>
    workspace?.id === targetWorkspace &&
    connection === targetConnection &&
    !periodLoading &&
    !resetBusy &&
    !connectionRetired;
  busy++;
  paintStatus();
  const operation = writer
    .catch(() => {})
    .then(async () => {
      if (generation !== writeFailureGeneration)
        throw Error(
          "ثبت قبلی ناموفق بود؛ این درخواست هم ثبت نشده است. تغییر را دوباره اعمال کنید.",
        );
      if (!isCurrentTarget())
        throw Error("دوره یا اتصال بانک تغییر کرده است؛ این درخواست ثبت نشد.");
      checkScope(scope);
      await commitRecords(collectRecords(db, scope), {
        ...scope,
        replace: !scope.classId && !scope.sessionId,
      });
      if (!isCurrentTarget()) return;
      storageBlocked = false;
      storageProblem = "";
      setStatus("تغییرات ذخیره شد.", "saved");
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
        setStatus("تغییر ذخیره نشد: " + error.message, "error");
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
