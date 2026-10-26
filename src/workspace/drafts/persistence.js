function inputKey(d) {
  return [
    d.kind,
    d.classId,
    d.lid,
    d.pid || "",
    d.uid || "",
    d.sid,
    d.field,
  ].join("|");
}

function draftStorageKey() {
  return draftBaseKey() + "." + documentToken;
}

function isSupportedGradeDraft(item) {
  return EduGradeDrafts.isSupportedGradeDraft(item);
}

async function persistedGradeDrafts(prefix) {
  const records = new Map();
  const add = (key, raw) => {
    const entry = {
      key,
      entries: Array.isArray(raw) ? raw : raw?.entries || [],
      generation: Array.isArray(raw) ? 0 : Number(raw?.generation || 0),
      updatedAt: raw?.updatedAt || "",
    };
    if (
      !Array.isArray(entry.entries) ||
      !Number.isSafeInteger(entry.generation) ||
      entry.generation < 0
    )
      throw Error("ساختار پیش‌نویس معتبر نیست.");
    const previous = records.get(key);
    if (
      !previous ||
      entry.generation > previous.generation ||
      (entry.generation === previous.generation &&
        entry.updatedAt > previous.updatedAt)
    )
      records.set(key, entry);
  };
  let unreadable = false;
  try {
    for (const key of Object.keys(localStorage).filter((key) =>
      key.startsWith(prefix),
    ))
      try {
        add(key, JSON.parse(localStorage.getItem(key)));
      } catch {
        unreadable = true;
      }
  } catch {
    unreadable = true;
  }
  if (connection?.objectStoreNames.contains("drafts")) {
    const tx = connection.transaction("drafts", "readonly");
    const rows = await requestPromise(
      tx.objectStore("drafts").index("workspace").getAll(workspace.id),
    );
    for (const row of rows) if (row.key.startsWith(prefix)) add(row.key, row);
  }
  if (unreadable && !records.size)
    throw Error("خواندن پیش‌نویس‌های قبلی انجام نشد.");
  return [...records.values()];
}

function storeDrafts() {
  if (!workspace || resetBusy || connectionRetired) return Promise.resolve();
  const key = draftStorageKey(),
    entry = {
      key,
      workspace: workspace.id,
      owner: documentToken,
      generation: draftGeneration,
      entries: clone([...drafts.values()]),
      updatedAt: new Date().toISOString(),
    };
  let localFailure = false;
  try {
    const current = JSON.parse(localStorage.getItem(key) || "null");
    if (
      current &&
      !Array.isArray(current) &&
      Number(current.generation) > draftGeneration
    )
      return Promise.resolve();
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    localFailure = true;
  }
  const targetConnection = connection;
  draftWritesPending++;
  const operation = draftWriter
    .catch(() => {})
    .then(async () => {
      if (connectionRetired) return;
      if (!targetConnection?.objectStoreNames.contains("drafts"))
        throw Error("ذخیره پایدار پیش‌نویس در دسترس نیست.");
      let tx;
      try {
        tx = targetConnection.transaction("drafts", "readwrite", {
          durability: "strict",
        });
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        tx = targetConnection.transaction("drafts", "readwrite");
      }
      const done = transactionDone(tx),
        store = tx.objectStore("drafts"),
        request = store.get(key);
      request.onsuccess = () => {
        if (!request.result || request.result.generation <= entry.generation)
          store.put(entry);
      };
      await done;
      draftRecoveryFailed = false;
      if (localFailure && entry.entries.length)
        setStatus("پیش‌نویس پایدار محفوظ است؛ در انتظار ثبت نمره.", "pending");
    })
    .catch((error) => {
      draftRecoveryFailed = true;
      setStatus(
        "ذخیره پایدار پیش‌نویس انجام نشد؛ تا ثبت موفق نمره صفحه را نبندید. " +
          error.message,
        "error",
      );
      throw error;
    })
    .finally(() => {
      draftWritesPending--;
    });
  draftWriter = operation;
  operation.catch(() => {});
  return operation;
}

async function loadDrafts() {
  drafts.clear();
  try {
    const base = draftBaseKey();
    const records = (await persistedGradeDrafts(base)).filter(
      (row) => row.key === base || row.key.startsWith(base + "."),
    );
    records.sort(
      (a, b) =>
        b.generation - a.generation || b.updatedAt.localeCompare(a.updatedAt),
    );
    const saved = records[0];
    draftGeneration = (saved?.generation || 0) + 1;
    for (const original of saved?.entries || []) {
      if (!isSupportedGradeDraft(original)) continue;
      const stale =
        !Number.isInteger(original.baseRevision) ||
        original.baseRevision !== workspace.revision;
      const item = stale
        ? {
            ...original,
            review: true,
            error:
              "اطلاعات از زمان این پیش‌نویس تغییر کرده یا نسخه مرجع نامعلوم است؛ نیازمند بررسی",
          }
        : original;
      drafts.set(inputKey(item), item);
    }
    await storeDrafts();
    for (const old of records)
      if (old.generation < draftGeneration - 1) {
        try {
          localStorage.removeItem(old.key);
        } catch {}
        const tx = connection.transaction("drafts", "readwrite"),
          done = transactionDone(tx);
        tx.objectStore("drafts").delete(old.key);
        await done;
      }
  } catch (error) {
    draftRecoveryFailed = true;
    setStatus(
      "پیش‌نویس قبلی خوانده نشد؛ داده اصلی محفوظ است. " + error.message,
      "error",
    );
  }
}
