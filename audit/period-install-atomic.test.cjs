"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(fail = "") {
  let resolve,
    reject,
    aborted = 0;
  const pending = [],
    committed = [];
  const done = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const failure = Error("injected " + fail);
  const request = { result: [] };
  const tx = {
    abort() {
      aborted++;
      pending.length = 0;
      reject(Error("aborted"));
    },
    objectStore(name) {
      return {
        getAll() {
          if (fail === "getAll") throw failure;
          queueMicrotask(() => {
            request.onsuccess();
            if (!aborted) {
              if (fail === "transaction") {
                pending.length = 0;
                reject(failure);
              } else {
                committed.push(...pending);
                resolve();
              }
            }
          });
          return request;
        },
        add(value) {
          if (fail === "add") throw failure;
          pending.push([name, value]);
        },
        put(value) {
          if (fail === "put") throw failure;
          pending.push([name, value]);
        },
      };
    },
  };
  const c = vm.createContext({
    connection: { transaction: () => tx },
    transactionDone: () => done,
    clone: structuredClone,
    validateV24() {},
    collectRecords: () =>
      new Map([
        ["meta", {}],
        ["school:1", { id: "school" }],
      ]),
    normalizedName: (value) => value.trim().toLowerCase(),
    uid: () => "new-id",
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/periods/install.js"),
      "utf8",
    ),
    c,
  );
  const data = { settings: { academicYear: "1405-1406", academicTerm: "اول" } };
  return {
    c,
    data,
    request,
    failure,
    committed,
    get aborted() {
      return aborted;
    },
  };
}
for (const stage of ["getAll", "add", "put"]) {
  test(`period installation aborts and preserves the original ${stage} error`, async () => {
    const f = fixture(stage);
    await assert.rejects(
      f.c.installWorkspace(f.data, {}),
      (error) => error === f.failure,
    );
    assert.equal(f.aborted, 1);
    assert.equal(f.committed.length, 0);
  });
}
test("period installation propagates asynchronous transaction failure", async () => {
  const f = fixture("transaction");
  await assert.rejects(
    f.c.installWorkspace(f.data, {}),
    (error) => error === f.failure,
  );
  assert.equal(f.committed.length, 0);
});
test("duplicate period aborts before any catalog or record write", async () => {
  const f = fixture();
  f.request.result = [{ year: "1405-1406", term: " اول " }];
  await assert.rejects(f.c.installWorkspace(f.data, {}), /دوره دیگری/);
  assert.equal(f.aborted, 1);
  assert.equal(f.committed.length, 0);
});
test("valid installation commits catalog and records without mutating the source", async () => {
  const f = fixture();
  const before = JSON.stringify(f.data);
  const result = await f.c.installWorkspace(f.data, { term: "دوم" });
  assert.equal(result.termKind, "second");
  assert.equal(f.committed.length, 3);
  assert.equal(f.committed[1][1].workspace, result.id);
  assert.equal(JSON.stringify(f.data), before);
});
