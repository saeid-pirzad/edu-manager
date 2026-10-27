"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(stage) {
  let resolve,
    reject,
    aborts = 0;
  const done = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const failure = Error("injected " + stage),
    pending = [],
    committed = [];
  const request = {
    result: { id: "first", revision: 1, year: "1405-1406", term: "اول" },
  };
  const check = (point) => {
    if (stage === point) throw failure;
  };
  const tx = {
    abort() {
      aborts++;
      pending.length = 0;
      reject(Error("aborted"));
    },
    objectStore(name) {
      return {
        get() {
          check("get");
          queueMicrotask(() => {
            request.onsuccess();
            if (!aborts) {
              committed.push(...pending);
              resolve();
            }
          });
          return request;
        },
        getAll() {
          check("getAll");
          return { result: [] };
        },
        put(value) {
          check(name + ".put");
          pending.push([name, value]);
        },
        add(value) {
          check(name + ".add");
          pending.push([name, value]);
        },
        delete(value) {
          check(name + ".delete");
          pending.push([name, value]);
        },
      };
    },
  };
  const c = vm.createContext({
    EduDataStoreRuntime: { transactionDone: () => done },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/data/record-transaction.js"),
      "utf8",
    ),
    c,
  );
  const args = {
    connection: { transaction: () => tx },
    workspace: { id: "first", revision: 1, year: "1405-1406", term: "اول" },
    records: new Map(),
    changed: [["school:1", '{"id":"one"}']],
    removed: ["school:2"],
    action: "test",
    changes: [],
    before: [],
    keepUndo: stage !== "undo.delete",
    normalizedName: String,
    academicTermKind: () => "first",
  };
  if (stage === "getAll")
    args.records.set("meta", {
      settings: { academicYear: "1406-1407", academicTerm: "اول" },
    });
  return {
    c,
    args,
    failure,
    committed,
    get aborts() {
      return aborts;
    },
  };
}
for (const stage of [
  "get",
  "getAll",
  "records.put",
  "records.delete",
  "catalog.put",
  "events.add",
  "undo.put",
  "undo.delete",
]) {
  test(`record transaction explicitly aborts ${stage} failure and preserves original error`, async () => {
    const f = fixture(stage);
    await assert.rejects(
      f.c.EduRecordTransaction.commit(f.args),
      (error) => error === f.failure,
    );
    assert.equal(f.aborts, 1);
    assert.equal(f.committed.length, 0);
  });
}
test("invalid record JSON aborts earlier queued writes", async () => {
  const f = fixture("json");
  f.args.changed.push(["school:bad", "invalid JSON"]);
  await assert.rejects(
    f.c.EduRecordTransaction.commit(f.args),
    (error) => error.name === "SyntaxError",
  );
  assert.equal(f.aborts, 1);
  assert.equal(f.committed.length, 0);
});
test("normal transaction commits all stores without aborting", async () => {
  const f = fixture("none");
  assert.equal((await f.c.EduRecordTransaction.commit(f.args)).revision, 2);
  assert.equal(f.aborts, 0);
  assert.equal(f.committed.length, 5);
});
