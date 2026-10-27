"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const catalog = [
    {
      id: "first",
      year: "1405-1406",
      term: "اول",
      termKind: "first",
      revision: 2,
    },
    {
      id: "second",
      year: "1405-1406",
      term: "دوم",
      termKind: "second",
      revision: 3,
    },
    {
      id: "other",
      year: "1404-1405",
      term: "دوم",
      termKind: "second",
      revision: 1,
    },
  ];
  const reads = [];
  let finish,
    fail,
    inCallback = false,
    aborted = false;
  const done = new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const c = vm.createContext({
    workspace: { ...catalog[0] },
    db: { settings: {} },
    ready: true,
    periodLoading: false,
    fileMode: false,
    resetBusy: false,
    connectionRetired: false,
    blocked: false,
    drafts: new Map(),
    setStatus() {},
    lockControls() {},
    window: { EduPeriodicReports: { invalidate() {} } },
    isSafeRecordId: (id) => typeof id === "string" && !!id,
    academicTermKind: (term) =>
      ({ اول: "first", دوم: "second", تابستان: "summer" })[term] || null,
    requestPromise: async (value) => value,
    transactionDone: () => done,
    workspaceRecordRequest: (_store, id) => {
      assert.equal(
        inCallback,
        true,
        "reads must be queued before the IDB callback finishes",
      );
      reads.push(id);
      return [{ workspace: id }];
    },
    connection: {
      transaction: (names, mode) => {
        assert.deepEqual(Array.from(names), ["catalog", "records"]);
        assert.equal(mode, "readonly");
        return {
          abort: () => {
            aborted = true;
            fail(Error("aborted"));
          },
          objectStore: (name) => ({
            getAll: () => {
              assert.equal(name, "catalog");
              const request = { result: catalog };
              queueMicrotask(() => {
                inCallback = true;
                request.onsuccess();
                inCallback = false;
              });
              return request;
            },
          }),
        };
      },
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/reports/snapshots.js"),
      "utf8",
    ),
    c,
  );
  return { c, catalog, reads, finish, aborted: () => aborted };
}
test("annual snapshot reads only the two selected periods and waits for its single transaction", async () => {
  const { c, reads, finish } = fixture();
  let settled = false;
  const pending = c
    .readAnnualRecordSets({ id: "first", revision: 2 }, {})
    .then((value) => {
      settled = true;
      return value;
    });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.deepEqual(reads, ["first", "second"]);
  finish();
  const result = await pending;
  assert.equal(result.recordSets.length, 2);
  assert.equal(result.recordSets[1][0].workspace, "second");
});
test("a stale active-period revision blocks annual reads before any records are loaded", async () => {
  const { c, catalog, reads } = fixture();
  catalog[0].revision++;
  await assert.rejects(
    c.readAnnualRecordSets({ id: "first", revision: 2 }, {}),
    /اطلاعات بانک/,
  );
  assert.equal(reads.length, 0);
  assert.equal(c.blocked, true);
});
test("a deleted active period blocks annual reads before any records are loaded", async () => {
  const { c, catalog, reads } = fixture();
  catalog.shift();
  await assert.rejects(
    c.readAnnualRecordSets({ id: "first", revision: 2 }, {}),
    /اطلاعات بانک/,
  );
  assert.equal(reads.length, 0);
  assert.equal(c.blocked, true);
});
test("record-request failures are contained even when another request throws synchronously", async () => {
  const { c, finish } = fixture();
  c.workspaceRecordRequest = (_store, id) => {
    if (id === "first") return Promise.reject(Error("first read failed"));
    throw Error("second read failed");
  };
  await assert.rejects(
    c.readAnnualRecordSets({ id: "first", revision: 2 }, {}),
    /read failed/,
  );
  finish();
  await new Promise((resolve) => setImmediate(resolve));
});
test("invalid annual selection aborts before reading any period records", async () => {
  const { c, reads, aborted } = fixture();
  await assert.rejects(
    c.readAnnualRecordSets(
      { id: "first", revision: 2 },
      { first: "second", second: "first" },
    ),
    /مطابقت ندارد/,
  );
  assert.equal(reads.length, 0);
  assert.equal(aborted(), true);
});
test("period change before the catalog callback prevents record reads", async () => {
  const { c, reads } = fixture();
  const pending = c.readAnnualRecordSets({ id: "first", revision: 2 }, {});
  c.workspace = { id: "other", revision: 1 };
  await assert.rejects(pending);
  assert.equal(reads.length, 0);
});
test("annual selection rejects incomplete, repeated and cross-year explicit pairs", () => {
  const { c, catalog } = fixture();
  for (const ids of [
    { first: "first" },
    { first: "first", second: "first" },
    { first: "first", second: "other" },
    { first: "missing", second: "second" },
  ])
    assert.throws(() => c.selectAnnualPeriods(catalog, ids, catalog[0]));
});
test("ambiguous automatic periods are rejected while explicit restored aliases remain selectable", () => {
  const { c, catalog } = fixture();
  catalog.push({ ...catalog[0], id: "restored" });
  assert.throws(
    () => c.selectAnnualPeriods(catalog, {}, catalog[0]),
    /چند دوره/,
  );
  assert.equal(
    c.selectAnnualPeriods(
      catalog,
      { first: "restored", second: "second" },
      catalog[0],
    )[0].id,
    "restored",
  );
});

test("automatic label fallback cannot use a summer period as the first annual term", async () => {
  const { c, catalog, reads, aborted } = fixture();
  catalog[0].termKind = "summer";
  await assert.rejects(
    c.readAnnualRecordSets({ id: "first", revision: 2 }, {}),
    /مطابقت ندارد/,
  );
  assert.equal(reads.length, 0);
  assert.equal(aborted(), true);
});

test("automatic label fallback cannot override saved second and summer roles", () => {
  const { c, catalog } = fixture();
  catalog[0].termKind = "second";
  catalog[1].termKind = "summer";
  assert.throws(
    () => c.selectAnnualPeriods(catalog, {}, catalog[0]),
    /مطابقت ندارد/,
  );
});

test("legacy first and second labels without saved roles remain selectable", () => {
  const { c, catalog } = fixture();
  delete catalog[0].termKind;
  delete catalog[1].termKind;
  const selected = c.selectAnnualPeriods(catalog, {}, catalog[0]);
  assert.deepEqual(
    Array.from(selected, (row) => row.id),
    ["first", "second"],
  );
});

test("custom titles retain their saved annual order rather than their display labels", () => {
  const { c, catalog } = fixture();
  catalog[0].term = "پایان سال";
  catalog[1].term = "شروع سال";
  const selected = c.selectAnnualPeriods(catalog, {}, catalog[0]);
  assert.deepEqual(
    Array.from(selected, (row) => row.id),
    ["first", "second"],
  );
});
