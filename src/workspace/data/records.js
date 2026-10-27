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
async function readWorkspaceSnapshot(id) {
  const tx = connection.transaction(["catalog", "records"], "readonly");
  const done = transactionDone(tx);
  const [period, rows] = await Promise.all([
    requestPromise(tx.objectStore("catalog").get(id)),
    requestPromise(workspaceRecordRequest(tx.objectStore("records"), id)),
    done,
  ]);
  if (!period) throw Error("دوره موجود نیست.");
  return { period, ...decodeWorkspaceRecords(rows, { workspaceId: id }) };
}
