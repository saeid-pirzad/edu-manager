function deputyExportIdentityGuard(sourceConnection, sourceToken, check) {
  check();
  if (
    !ready ||
    resetBusy ||
    connectionRetired ||
    periodLoading ||
    (typeof fullRestoreBusy !== "undefined" && fullRestoreBusy) ||
    connection !== sourceConnection ||
    installationToken !== sourceToken
  )
    throw Error(
      "اطلاعات سیستم تغییر کرده است؛ ارسال به معاون را دوباره باز کنید.",
    );
}

async function deputyExportIdentityTransaction({
  write = false,
  next = null,
  expectedToken = null,
  check = () => {},
  validateCatalog = null,
} = {}) {
  const sourceConnection = connection,
    sourceToken = installationToken,
    candidate = write
      ? EduDeputyExportIdentity.normalize({ ...next, token: "pending" })
      : null;
  deputyExportIdentityGuard(sourceConnection, sourceToken, check);
  const tx = sourceConnection.transaction(
      ["drafts", "records", ...(validateCatalog ? ["catalog"] : [])],
      write ? "readwrite" : "readonly",
    ),
    done = transactionDone(tx);
  let failure,
    result = null,
    remaining = validateCatalog ? 3 : 2;
  const abort = (error) => {
    failure = error;
    try {
      tx.abort();
    } catch {}
  };
  try {
    const stored = tx.objectStore("drafts").get(EduDeputyExportIdentity.key),
      epoch = tx.objectStore("records").get(RESET_RECORD_KEY),
      catalog = validateCatalog ? tx.objectStore("catalog").getAll() : null;
    const complete = () => {
      if (--remaining) return;
      try {
        deputyExportIdentityGuard(sourceConnection, sourceToken, check);
        if ((epoch.result?.value?.token || "") !== sourceToken)
          throw Error(
            "اطلاعات سیستم در پنجرهٔ دیگری جایگزین شده است؛ صفحه را دوباره بارگذاری کنید.",
          );
        if (validateCatalog) validateCatalog(catalog.result);
        const current = stored.result
          ? EduDeputyExportIdentity.normalize(stored.result.value)
          : null;
        if (write) {
          if ((current?.token || null) !== expectedToken)
            throw Error(
              "مشخصات ارسال در پنجرهٔ دیگری تغییر کرده است؛ فرم ارسال را دوباره باز کنید.",
            );
          result = EduDeputyExportIdentity.normalize({
            ...candidate,
            token: uid(),
          });
          tx.objectStore("drafts").put(EduDeputyExportIdentity.row(result));
        } else result = current;
      } catch (error) {
        abort(error);
      }
    };
    stored.onsuccess = complete;
    epoch.onsuccess = complete;
    if (catalog) catalog.onsuccess = complete;
  } catch (error) {
    abort(error);
  }
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  deputyExportIdentityGuard(sourceConnection, sourceToken, check);
  return result;
}

function readDeputyExportIdentity({
  check = () => {},
  validateCatalog = null,
} = {}) {
  return deputyExportIdentityTransaction({ check, validateCatalog });
}

function saveDeputyExportIdentity(
  next,
  { expectedToken = null, check = () => {}, validateCatalog = null } = {},
) {
  return deputyExportIdentityTransaction({
    write: true,
    next,
    expectedToken,
    check,
    validateCatalog,
  });
}
