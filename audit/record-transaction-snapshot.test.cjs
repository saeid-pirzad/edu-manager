"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(liveRevision = 1) {
  let resolve, reject;
  const done = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const writes = [],
    reads = [];
  const request = {
    result: {
      id: "first",
      revision: liveRevision,
      year: "1405-1406",
      term: "اول",
    },
  };
  const tx = {
    abort() {
      reject(Error("aborted"));
    },
    objectStore(name) {
      return {
        get(id) {
          reads.push(id);
          return request;
        },
        getAll() {
          return { result: [] };
        },
        put(value) {
          writes.push([name, value]);
        },
        add(value) {
          writes.push([name, value]);
        },
        delete(id) {
          writes.push([name, id]);
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
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/periods/install.js"),
      "utf8",
    ),
    c,
  );
  const workspace = {
    id: "first",
    revision: 1,
    year: "1405-1406",
    term: "اول",
  };
  const meta = {
    settings: { academicYear: workspace.year, academicTerm: workspace.term },
  };
  const args = {
    connection: { transaction: () => tx },
    workspace,
    records: new Map([["meta", meta]]),
    changed: [["school:1", '{"id":"one"}']],
    removed: [],
    before: [],
    changes: [],
    action: "test",
    keepUndo: true,
    normalizedName: String,
    academicTermKind: c.academicTermKind,
  };
  return {
    c,
    workspace,
    meta,
    request,
    args,
    writes,
    reads,
    finish() {
      request.onsuccess();
      resolve();
    },
  };
}
test("transaction retains original revision even if the UI object advances", async () => {
  const f = fixture(2);
  const pending = f.c.EduRecordTransaction.commit(f.args);
  f.workspace.revision = 2;
  f.finish();
  await assert.rejects(pending, (error) => error.code === "WORKSPACE_CONFLICT");
  assert.equal(f.writes.length, 0);
});
test("transaction keeps record, history and undo ownership at the original workspace", async () => {
  const f = fixture();
  const pending = f.c.EduRecordTransaction.commit(f.args);
  f.workspace.id = "second";
  f.finish();
  const result = await pending;
  assert.equal(result.id, "first");
  assert.equal(
    f.writes.find(([name]) => name === "records")[1].workspace,
    "first",
  );
  assert.equal(
    f.writes.find(([name]) => name === "events")[1].workspace,
    "first",
  );
  assert.equal(f.writes.find(([name]) => name === "undo")[1].id, "first");
});
test("transaction catalog labels do not follow mutations to the pending meta object", async () => {
  const f = fixture();
  const pending = f.c.EduRecordTransaction.commit(f.args);
  f.meta.settings.academicYear = "1410-1411";
  f.meta.settings.academicTerm = "دوم";
  f.finish();
  const result = await pending;
  assert.equal(result.year, "1405-1406");
  assert.equal(result.term, "اول");
});
test("unchanged transaction advances its original catalog revision", async () => {
  const f = fixture();
  const pending = f.c.EduRecordTransaction.commit(f.args);
  f.finish();
  assert.equal((await pending).revision, 2);
  assert.deepEqual(f.reads, ["first"]);
});

for (const [kind, original, renamed] of [
  ["first", "اول", "دوم"],
  ["second", "دوم", "نوبت پایانی"],
  ["summer", "تابستان", "اول"],
]) {
  test(`display-label correction preserves explicit ${kind} annual role`, async () => {
    const f = fixture();
    f.workspace.term = original;
    f.request.result.term = original;
    f.request.result.termKind = kind;
    f.meta.settings.academicTerm = renamed;
    const pending = f.c.EduRecordTransaction.commit(f.args);
    f.finish();
    const result = await pending;
    assert.equal(result.term, renamed);
    assert.equal(result.termKind, kind);
  });
}

test("legacy second-term role is inferred before replacing its display label", async () => {
  const f = fixture();
  f.workspace.term = f.request.result.term = "دوم — بازیابی old-id";
  f.meta.settings.academicTerm = "نوبت پایانی";
  const pending = f.c.EduRecordTransaction.commit(f.args);
  f.finish();
  const result = await pending;
  assert.equal(result.termKind, "second");
  assert.equal(result.term, "نوبت پایانی");
});

test("unknown legacy role is not guessed from a newly assigned first-term label", async () => {
  const f = fixture();
  f.workspace.term = f.request.result.term = "دوره قدیمی";
  f.meta.settings.academicTerm = "اول";
  const pending = f.c.EduRecordTransaction.commit(f.args);
  f.finish();
  assert.equal((await pending).termKind, null);
});
