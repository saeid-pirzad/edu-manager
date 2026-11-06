function openDatabase() {
  return EduDataStore.open({ onVersionChange: retireConnection });
}

async function allFrom(store) {
  const tx = connection.transaction(store, "readonly");
  return requestPromise(tx.objectStore(store).getAll());
}

async function readRecord(store, key) {
  const tx = connection.transaction(store, "readonly");
  return requestPromise(tx.objectStore(store).get(key));
}

function recordKey(key) {
  return workspace.id + "|" + key;
}

const {
  metaValue,
  collectRecords,
  logicalRecordType,
  validateLogicalValue,
  decodeWorkspaceRecords,
  decodeAssessmentRecords,
} = EduWorkspaceRecords.create({
  clone,
  normalizeDB,
  isDataObject,
  isSafeRecordId,
});

async function readWorkspace(id) {
  const tx = connection.transaction("records", "readonly");
  return decodeWorkspaceRecords(
    await requestPromise(workspaceRecordRequest(tx.objectStore("records"), id)),
    { workspaceId: id },
  );
}
function workspaceRecordRequest(store, id) {
  // Record keys are workspaceId + "|" + logical. The next ASCII character
  // bounds the entire prefix without a schema upgrade or a full-store scan.
  return store.getAll(IDBKeyRange.bound(id + "|", id + "}", false, true));
}
async function synchronizeAnnualForRead(id) {
  const directory = await synchronizeAcademicDirectoryForRead(id);
  try {
    const annual = await synchronizeAnnualModularGrades(id);
    return {
      changed: [...directory.changed, ...annual.changed],
      conflicts: [...directory.conflicts, ...annual.conflicts],
    };
  } catch (error) {
    if (error.code !== "ANNUAL_PERIOD_AMBIGUOUS") throw error;
    return {
      changed: directory.changed,
      conflicts: [...directory.conflicts, { message: error.message }],
    };
  }
}
async function readWorkspaceSnapshot(id) {
  const tx = connection.transaction(["catalog", "records"], "readonly");
  const done = transactionDone(tx);
  const [period, rows, epoch] = await Promise.all([
    requestPromise(tx.objectStore("catalog").get(id)),
    requestPromise(workspaceRecordRequest(tx.objectStore("records"), id)),
    requestPromise(tx.objectStore("records").get(RESET_RECORD_KEY)),
    done,
  ]);
  if (!period) throw Error("ترم موجود نیست.");
  return {
    period,
    installationToken: epoch?.value?.token || "",
    ...decodeWorkspaceRecords(rows, { workspaceId: id }),
  };
}

// The catalog, installation and selected class are read under one snapshot.
// Sessions and other classes are not needed to edit a Kardanesh assessment.
async function readAssessmentSnapshot(id, identity, expectedInstallation) {
  const tx = connection.transaction(["catalog", "records"], "readonly"),
    done = transactionDone(tx),
    store = tx.objectStore("records"),
    [period, epoch, meta, classroom] = await Promise.all([
      requestPromise(tx.objectStore("catalog").get(id)),
      requestPromise(store.get("@installation-reset")),
      requestPromise(store.get(id + "|meta")),
      requestPromise(store.get(id + "|class:" + identity.classId)),
      done,
    ]);
  if ((epoch?.value?.token || "") !== expectedInstallation)
    throw Object.assign(
      Error(
        "اطلاعات در پنجرهٔ دیگری جایگزین شده است؛ صفحه را دوباره باز کنید.",
      ),
      { code: "INSTALLATION_CHANGED" },
    );
  if (!period || period.id !== id) throw Error("نوبت این مرحله موجود نیست.");
  return {
    period,
    ...decodeAssessmentRecords([meta, classroom], {
      workspaceId: id,
      schoolId: identity.schoolId,
      classId: identity.classId,
    }),
  };
}
