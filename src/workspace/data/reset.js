const { requestPromise, transactionDone } = EduDataStoreRuntime;

const RESET_RECORD_KEY = "@installation-reset",
  RESET_EPOCH_KEY = "EduManager.resetEpoch";
let resetBusy = false,
  connectionRetired = false,
  installationToken = "";
function ownedDataKey(key) {
  return (
    key.startsWith("Edu24.") ||
    key.startsWith("EduManager.periodicDrafts.") ||
    key === STORAGE_KEY ||
    key === STORAGE_KEY + "_beforeImport"
  );
}
function retireConnection(dbConnection) {
  dbConnection.close();
  connectionRetired = true;
  ready = false;
  blocked = true;
  clearTimeout(draftTimer);
  clearInterval(automaticBackupTimer);
  automaticBackupTimer = null;
  setStatus(
    "بانک اطلاعات در پنجره دیگری تغییر می‌کند؛ برای ادامه صفحه را دوباره بارگذاری کنید.",
    "error",
  );
  lockControls();
}
function forgetInstallation() {
  clearTimeout(draftTimer);
  clearInterval(automaticBackupTimer);
  automaticBackupTimer = null;
  drafts.clear();
  draftGeneration++;
  writeFailureGeneration++;
  committed.clear();
  draftRecoveryFailed = false;
  window.EduPeriodicReports?.resetDrafts();
  db = v24DefaultDB();
  workspace = null;
  ready = false;
  blocked = true;
  connectionRetired = true;
  isAuthenticated = false;
}
function resetScreen(message) {
  const modal = document.getElementById("modal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.getElementById("modalBody").replaceChildren();
  setModalBackground(false);
  document.getElementById("app").innerHTML =
    '<div class="card" role="alert"><h2>پاک‌سازی اطلاعات</h2><p>' +
    esc(message) +
    '</p><button data-workspace-action="reload">بارگذاری مجدد و ادامه</button></div>';
}
function invalidateInstallation() {
  forgetInstallation();
  resetScreen(
    "اطلاعات برنامه در پنجره دیگری حذف شده است. برای شروع با اطلاعات خالی، برنامه را دوباره بارگذاری کنید.",
  );
}
async function completeResetCleanup(dbConnection, marker) {
  for (const key of Object.keys(localStorage))
    if (ownedDataKey(key)) localStorage.removeItem(key);
  localStorage.setItem(RESET_EPOCH_KEY, marker.value.token);
  for (const key of Object.keys(sessionStorage))
    if (key.startsWith("Edu24.")) sessionStorage.removeItem(key);
  if (
    localStorage.getItem(RESET_EPOCH_KEY) !== marker.value.token ||
    Object.keys(localStorage).some(ownedDataKey)
  )
    throw Error("پاک‌سازی حافظه مرورگر کامل نشده است.");
  const tx = dbConnection.transaction("records", "readwrite"),
    done = transactionDone(tx);
  const store = tx.objectStore("records"),
    request = store.get(RESET_RECORD_KEY);
  request.onsuccess = () => {
    if (request.result?.value?.token !== marker.value.token) {
      tx.abort();
      return;
    }
    store.put({
      ...marker,
      value: { ...marker.value, phase: "complete" },
    });
  };
  await done;
}
function resetDatabase(version, marker) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EduDataStoreSchema.databaseName, version);
    let cancelled = false,
      upgraded = false;
    request.onblocked = () => {
      cancelled = true;
      const error = Error(
        "حذف انجام نشد؛ یک اتصال دیگر بانک را باز نگه داشته است. پنجره‌های دیگر برنامه را ببندید و دوباره بارگذاری کنید.",
      );
      error.resetBlocked = true;
      reject(error);
    };
    request.onupgradeneeded = () => {
      if (cancelled) {
        request.transaction.abort();
        return;
      }
      upgraded = true;
      for (const name of request.result.objectStoreNames)
        request.transaction.objectStore(name).clear();
      request.transaction.objectStore("records").put(marker);
    };
    request.onsuccess = () => {
      if (cancelled || !upgraded) {
        request.result.close();
        reject(
          Error("بانک در پنجره دیگری تغییر کرده است؛ حذف تکراری انجام نشد."),
        );
        return;
      }
      resolve(request.result);
    };
    request.onerror = () =>
      reject(request.error || Error("حذف اطلاعات ثبت نشد."));
  });
}
