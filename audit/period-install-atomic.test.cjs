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
  for (const name of ["calendar.js", "academic-year.js"])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/domain", name), "utf8"),
      c,
    );
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
  await assert.rejects(f.c.installWorkspace(f.data, {}), /ترم دیگری/);
  assert.equal(f.aborted, 1);
  assert.equal(f.committed.length, 0);
});
test("valid installation commits catalog and records without mutating the source", async () => {
  const f = fixture();
  const before = JSON.stringify(f.data);
  const result = await f.c.installWorkspace(f.data, { term: "دوم" });
  assert.equal(result.termKind, "second");
  assert.equal(result.reportSource, undefined);
  assert.equal(f.committed.length, 3);
  assert.equal(f.committed[1][1].workspace, result.id);
  assert.equal(JSON.stringify(f.data), before);
});
test("legacy metadata no longer creates a special report-source role", async () => {
  const f = fixture();
  const result = await f.c.installWorkspace(f.data, {
    term: "اول — بازیابی test",
    reportSource: "secondary",
  });
  assert.equal(result.reportSource, undefined);
  assert.equal(result.termKind, "first");
});
test("a promoted recovery version blocks creation of a second primary source for the same term", async () => {
  const f = fixture();
  f.request.result = [
    {
      year: "1405-1406",
      term: "اول — بازیابی test",
      termKind: "first",
      reportSource: "primary",
    },
  ];
  await assert.rejects(f.c.installWorkspace(f.data, {}), /ترم دیگری/);
  assert.equal(f.committed.length, 0);
});
test("second-term installation rechecks first-term closure and revision in its write transaction", async () => {
  const f = fixture();
  f.request.result = [
    { id: "first", year: "1405-1406", term: "اول", closed: true, revision: 2 },
  ];
  await assert.rejects(
    f.c.installWorkspace(f.data, {
      term: "دوم",
      requireSequence: true,
      firstRevision: 1,
      source: { id: "first", revision: 2 },
    }),
    /تغییر/,
  );
  assert.equal(f.aborted, 1);
  assert.equal(f.committed.length, 0);
});

for (const state of ["changed", "deleted", "missing-source"]) {
  test(`new-year installation aborts before writing when its source is ${state}`, async () => {
    const f = fixture();
    f.request.result =
      state === "deleted"
        ? []
        : [{ id: "source", year: "1405-1406", term: "دوم", revision: 2 }];
    await assert.rejects(
      f.c.installWorkspace(f.data, {
        year: "1406-1407",
        term: "اول",
        requireSequence: true,
        ...(state === "missing-source"
          ? {}
          : { source: { id: "source", revision: 1 } }),
      }),
      (error) =>
        error.code === "WORKSPACE_CONFLICT" && /مبدأ/.test(error.message),
    );
    assert.equal(f.aborted, 1);
    assert.equal(f.committed.length, 0);
  });
}
test("new-year installation commits only from the exact live source revision", async () => {
  const f = fixture(),
    source = { id: "source", revision: 2 };
  f.request.result = [
    { ...source, year: "1405-1406", term: "دوم", closed: true },
  ];
  const pending = f.c.installWorkspace(f.data, {
    year: "1406-1407",
    term: "اول",
    requireSequence: true,
    source,
  });
  // Later changes to a caller-owned options object cannot change the guard.
  source.revision = 3;
  const installed = await pending;
  assert.equal(installed.year, "1406-1407");
  assert.equal(f.committed.length, 3);
  assert.equal(f.aborted, 0);
});
