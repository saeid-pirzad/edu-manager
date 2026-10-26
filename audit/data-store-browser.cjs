"use strict";

module.exports = async function dataStoreBrowserChecks() {
  const cases = [];
  const name = "EduManagerAdapterAudit-" + crypto.randomUUID();
  const schema = { ...EduDataStoreSchema, databaseName: name };
  const request = (value) => EduDataStoreRuntime.requestPromise(value);
  let connection;
  let stage = "create";
  const check = (id, label, pass) =>
    cases.push({ id, name: label, pass: !!pass });
  try {
    connection = await EduDataStore.open({ schema });
    check(
      "IDB01",
      "fresh adapter creates all stores and workspace indexes",
      schema.stores.every((definition) => {
        const store = connection
          .transaction(definition.name)
          .objectStore(definition.name);
        return (
          store.keyPath === definition.keyPath &&
          store.autoIncrement === !!definition.autoIncrement &&
          (!definition.workspaceIndex ||
            store.indexNames.contains(schema.workspaceIndexName))
        );
      }),
    );
    let tx = connection.transaction("drafts", "readwrite");
    const done = EduDataStoreRuntime.transactionDone(tx);
    tx.objectStore("drafts").put({ key: "retained", workspace: "audit" });
    await done;
    const version = connection.version;
    connection.close();
    stage = "remove-index";
    const upgrade = indexedDB.open(name, version + 1);
    upgrade.onupgradeneeded = () =>
      upgrade.transaction.objectStore("drafts").deleteIndex("workspace");
    connection = await request(upgrade);
    connection.close();
    stage = "repair-index";
    connection = await EduDataStore.open({ schema });
    const store = connection.transaction("drafts").objectStore("drafts");
    check(
      "IDB02",
      "adapter repairs a missing index while preserving records",
      store.indexNames.contains("workspace") &&
        (await request(store.get("retained")))?.workspace === "audit",
    );
    connection.close();
    stage = "reject-incompatible";
    let rejected = false;
    try {
      const incompatible = {
        ...schema,
        stores: schema.stores.map((definition) =>
          definition.name === "drafts"
            ? { ...definition, keyPath: "wrong" }
            : definition,
        ),
      };
      const unexpected = await EduDataStore.open({ schema: incompatible });
      unexpected.close();
    } catch {
      rejected = true;
    }
    check(
      "IDB03",
      "adapter rejects an incompatible key path without deleting records",
      rejected,
    );
    stage = "reopen-after-rejection";
    connection = await EduDataStore.open({ schema });
    check(
      "IDB04",
      "records remain readable after a rejected schema",
      !!(await request(
        connection.transaction("drafts").objectStore("drafts").get("retained"),
      )),
    );
    stage = "atomic-record-commit";
    const workspace = {
      id: "audit-workspace",
      year: "1405-1406",
      term: "first",
      revision: 0,
    };
    tx = connection.transaction("catalog", "readwrite");
    const seeded = EduDataStoreRuntime.transactionDone(tx);
    tx.objectStore("catalog").put(workspace);
    await seeded;
    const records = new Map([["class:a", { id: "a", name: "new" }]]);
    const plan = EduRecordCommitPlan.create(records, new Map());
    const commit = () =>
      EduRecordTransaction.commit({
        connection,
        workspace,
        records,
        ...plan,
        action: "adapter test",
        keepUndo: true,
        normalizedName: (value) => value.trim(),
        academicTermKind: () => "first",
      });
    const next = await commit();
    const read = (name) =>
      request(connection.transaction(name).objectStore(name).getAll());
    const saved = await read("records"),
      undo = await read("undo"),
      events = await read("events");
    check(
      "IDB05",
      "record transaction commits data, revision, history and undo together",
      next.revision === 1 &&
        saved[0]?.value.name === "new" &&
        undo[0]?.revision === 1 &&
        events[0]?.revision === 1,
    );
    stage = "stale-record-commit";
    let conflict;
    try {
      await commit();
    } catch (error) {
      conflict = error.code;
    }
    check(
      "IDB06",
      "stale record transaction aborts without adding history or changing undo",
      conflict === "WORKSPACE_CONFLICT" &&
        (await read("events")).length === events.length &&
        JSON.stringify(await read("undo")) === JSON.stringify(undo) &&
        JSON.stringify(await read("records")) === JSON.stringify(saved),
    );
  } catch (error) {
    throw Error("Adapter audit stage " + stage + ": " + error.message, {
      cause: error,
    });
  } finally {
    connection?.close();
    await request(indexedDB.deleteDatabase(name));
  }
  return cases;
};
