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
  return decodeWorkspaceRecords(
    (await allFrom("records")).filter((row) => row.workspace === id),
    { workspaceId: id },
  );
}
