"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function classroom(score = 2) {
  return {
    id: "class",
    name: "Class",
    students: [{ id: "student", name: "Student" }],
    archivedStudents: [],
    lessons: [
      {
        id: "lesson",
        name: "Modules",
        gradeMode: "fani",
        gradingPolicy: {
          method: "modular",
          version: 1,
          mostamarMax: 5,
          competencyFactor: 5,
          competencyMin: 2,
          moduleMin: 12,
          continuousStep: 0.5,
        },
        poudmans: [
          {
            id: "module",
            name: "Module",
            units: [],
            podScores: { student: { m: 5, c: score } },
          },
        ],
      },
    ],
  };
}

// A small transactional request scheduler: requests queued from callbacks keep
// the transaction alive, and none of its writes escape an abort.
function fixture(options = {}) {
  const first = {
      id: "first",
      year: "1405-1406",
      term: options.legacySource ? "سوابق پیشین" : "اول",
      termKind: options.legacySource ? null : "first",
      revision: options.sourceRevision ?? 1,
    },
    second = {
      id: "second",
      year: "1405-1406",
      term: "دوم",
      termKind: "second",
      revision: options.companionRevision ?? 7,
      closed: true,
      closedAt: "2026-01-01T00:00:00.000Z",
      reportSource: "preserved",
    },
    source = classroom(2),
    current = classroom(3),
    companion = options.companion || classroom(2),
    meta = {
      settings: { academicYear: first.year, academicTerm: first.term },
      layout: [{ id: "school", name: "School", classes: ["class"] }],
    },
    row = (workspace, logical, value) => ({
      key: workspace + "|" + logical,
      workspace,
      logical,
      value,
    });
  const stores = {
    catalog: new Map([
      [first.id, structuredClone(first)],
      [second.id, structuredClone(second)],
    ]),
    records: new Map([
      ["first|meta", row("first", "meta", meta)],
      ["first|class:class", row("first", "class:class", source)],
      ["second|meta", row("second", "meta", options.companionMeta || meta)],
      ["second|class:class", row("second", "class:class", companion)],
    ]),
    events: new Map(),
    undo: new Map([["second", { id: "second", action: "Old undo" }]]),
  };
  if (options.installation !== undefined && options.installation !== null)
    stores.records.set("@installation-reset", {
      key: "@installation-reset",
      value: { token: options.installation },
    });
  let complete, fail;
  const done = new Promise((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  let pending = 0,
    aborted = false,
    started = false;
  const reads = [],
    writes = [];
  let eventId = 0;
  const staged = Object.fromEntries(
    Object.entries(stores).map(([name, rows]) => [
      name,
      new Map([...rows].map(([key, value]) => [key, structuredClone(value)])),
    ]),
  );
  const queue = (name, operation, key) => {
    reads.push([name, operation, key]);
    const request = {};
    pending++;
    queueMicrotask(() => {
      if (aborted) return;
      try {
        request.result =
          operation === "getAll"
            ? [...staged[name].values()].map((value) => structuredClone(value))
            : structuredClone(staged[name].get(key));
        request.onsuccess?.();
      } catch (error) {
        aborted = true;
        fail(error);
      }
      pending--;
      if (!pending && !aborted) {
        for (const [storeName, rows] of Object.entries(staged)) {
          stores[storeName].clear();
          for (const [rowKey, value] of rows)
            stores[storeName].set(rowKey, value);
        }
        complete();
      }
    });
    return request;
  };
  const tx = {
    abort() {
      aborted = true;
      fail(Error("aborted"));
    },
    objectStore(name) {
      return {
        get: (key) => queue(name, "get", key),
        getAll: () => queue(name, "getAll"),
        put(value) {
          if (options.failAt === name + ".put")
            throw Error("injected " + name + ".put");
          if (
            options.failCompanionAt === name + ".put" &&
            (value.workspace === "second" || value.id === "second")
          )
            throw Error("injected companion " + name + ".put");
          writes.push([name, "put", structuredClone(value)]);
          staged[name].set(
            name === "records" ? value.key : value.id,
            structuredClone(value),
          );
        },
        add(value) {
          if (
            options.failCompanionAt === name + ".add" &&
            value.workspace === "second"
          )
            throw Error("injected companion " + name + ".add");
          writes.push([name, "add", structuredClone(value)]);
          staged[name].set(++eventId, structuredClone(value));
        },
        delete(key) {
          if (options.failCompanionAt === name + ".delete" && key === "second")
            throw Error("injected companion " + name + ".delete");
          writes.push([name, "delete", key]);
          staged[name].delete(key);
        },
      };
    },
  };
  const c = vm.createContext({
    structuredClone,
    EduDataStoreRuntime: { transactionDone: () => done },
  });
  const modelPath = path.join(__dirname, "../src/domain/annual-modules.js");
  for (const filename of [
    path.join(__dirname, "../src/domain/revision.js"),
    modelPath,
    path.join(__dirname, "../src/data/record-transaction.js"),
  ])
    vm.runInContext(fs.readFileSync(filename, "utf8"), c);
  const args = {
    connection: {
      transaction: () => {
        started = true;
        return tx;
      },
    },
    workspace: first,
    records: new Map([
      ["meta", meta],
      ["class:class", current],
    ]),
    changed: [["class:class", JSON.stringify(current)]],
    removed: [],
    before: [{ key: "class:class", value: source }],
    changes: [],
    action: "Save grades",
    keepUndo: true,
    normalizedName: String,
    academicTermKind: (term) =>
      term === "اول" ? "first" : term === "دوم" ? "second" : null,
    annualChanged: [],
  };
  return {
    c,
    args,
    stores,
    reads,
    writes,
    get started() {
      return started;
    },
    get aborted() {
      return aborted;
    },
  };
}

test("annual modular commit updates the companion grade atomically without reopening its term", async () => {
  const f = fixture();
  const result = await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(result.id, "first");
  assert.equal(result.revision, 2);
  const companion = f.stores.records.get("second|class:class").value;
  assert.equal(companion.lessons[0].poudmans[0].podScores.student.c, 3);
  const catalog = f.stores.catalog.get("second");
  assert.equal(catalog.revision, 8);
  assert.equal(catalog.closed, true);
  assert.equal(catalog.closedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(catalog.reportSource, "preserved");
  assert.equal(f.stores.undo.has("second"), false);
  assert.equal(f.stores.undo.has("first"), true);
  assert.equal(
    [...f.stores.events.values()].filter((row) => row.workspace === "second")
      .length,
    1,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(f.args.annualChanged)), [
    { workspace: "second", revision: 8 },
  ]);
});

test("annual change notifications remain empty before the transaction commits", async () => {
  const f = fixture();
  const pending = f.c.EduRecordTransaction.commit(f.args);
  assert.deepEqual(f.args.annualChanged, []);
  await pending;
  assert.equal(f.args.annualChanged.length, 1);
});

test("conflicting companion grades abort the source and companion together", async () => {
  const f = fixture({ companion: classroom(1) });
  await assert.rejects(f.c.EduRecordTransaction.commit(f.args));
  assert.equal(f.aborted, true);
  assert.equal(f.stores.catalog.get("first").revision, 1);
  assert.equal(f.stores.catalog.get("second").revision, 7);
  assert.equal(
    f.stores.records.get("first|class:class").value.lessons[0].poudmans[0]
      .podScores.student.c,
    2,
  );
  assert.equal(
    f.stores.records.get("second|class:class").value.lessons[0].poudmans[0]
      .podScores.student.c,
    1,
  );
  assert.equal(f.stores.events.size, 0);
  assert.equal(f.stores.undo.has("second"), true);
  assert.deepEqual(f.args.annualChanged, []);
});

test("a coherent companion does not receive a redundant revision or undo invalidation", async () => {
  const f = fixture({ companion: classroom(3) });
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(f.stores.catalog.get("second").revision, 7);
  assert.equal(f.stores.undo.has("second"), true);
  assert.deepEqual(f.args.annualChanged, []);
});

test("class identities in a different school are never synchronized", async () => {
  const f = fixture({
    companionMeta: { layout: [{ id: "other-school", classes: ["class"] }] },
  });
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(f.stores.catalog.get("second").revision, 7);
  assert.equal(
    f.stores.records.get("second|class:class").value.lessons[0].poudmans[0]
      .podScores.student.c,
    2,
  );
  assert.equal(
    f.reads.some(
      ([name, , key]) => name === "records" && key === "second|class:class",
    ),
    false,
  );
});

test("another academic year and legacy extra periods are excluded from annual grade synchronization", async () => {
  const f = fixture();
  // Store snapshots are made when the fixture is built; use the transaction's
  // source catalog before its callbacks to add rows through the mock store.
  const originalTransaction = f.args.connection.transaction;
  f.args.connection.transaction = (...args) => {
    const tx = originalTransaction(...args);
    tx.objectStore("catalog").put({
      id: "old",
      year: "1404-1405",
      termKind: "first",
      revision: 1,
    });
    tx.objectStore("catalog").put({
      id: "legacy",
      year: "1405-1406",
      termKind: "summer",
      revision: 1,
    });
    return tx;
  };
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(
    f.reads.some(([, , key]) => String(key).startsWith("old|")),
    false,
  );
  assert.equal(
    f.reads.some(([, , key]) => String(key).startsWith("legacy|")),
    false,
  );
});

test("duplicate annual roles reject rather than duplicating a grade into ambiguous periods", async () => {
  const f = fixture();
  const originalTransaction = f.args.connection.transaction;
  f.args.connection.transaction = (...args) => {
    const tx = originalTransaction(...args);
    tx.objectStore("catalog").put({
      id: "duplicate",
      year: "1405-1406",
      termKind: "second",
      revision: 1,
    });
    return tx;
  };
  await assert.rejects(f.c.EduRecordTransaction.commit(f.args), /تکراری/);
  assert.equal(f.stores.catalog.get("first").revision, 1);
  assert.deepEqual(f.args.annualChanged, []);
});

test("ordinary class edits avoid catalog scans and companion record reads", async () => {
  const f = fixture();
  const value = structuredClone(f.args.before[0].value);
  value.name = "Renamed class";
  f.args.changed = [["class:class", JSON.stringify(value)]];
  await f.c.EduRecordTransaction.commit(f.args);
  assert.deepEqual(f.reads, [
    ["records", "get", "@installation-reset"],
    ["catalog", "get", "first"],
  ]);
  assert.equal(f.stores.catalog.get("second").revision, 7);
});

test("missing or inconsistent companion class records abort instead of silently losing annual grades", async () => {
  const f = fixture();
  const originalTransaction = f.args.connection.transaction;
  f.args.connection.transaction = (...args) => {
    const tx = originalTransaction(...args);
    tx.objectStore("records").delete("second|class:class");
    return tx;
  };
  await assert.rejects(f.c.EduRecordTransaction.commit(f.args), /رکورد کلاس/);
  assert.equal(f.stores.catalog.get("first").revision, 1);
  assert.deepEqual(f.args.annualChanged, []);
});

for (const stage of ["records.put", "catalog.put", "events.add", "undo.delete"])
  test(`companion ${stage} failure rolls back every source write and emits no annual notification`, async () => {
    const f = fixture({ failCompanionAt: stage });
    await assert.rejects(
      f.c.EduRecordTransaction.commit(f.args),
      /injected companion/,
    );
    assert.equal(f.stores.catalog.get("first").revision, 1);
    assert.equal(f.stores.catalog.get("second").revision, 7);
    assert.equal(
      f.stores.records.get("first|class:class").value.lessons[0].poudmans[0]
        .podScores.student.c,
      2,
    );
    assert.equal(
      f.stores.records.get("second|class:class").value.lessons[0].poudmans[0]
        .podScores.student.c,
      2,
    );
    assert.equal(f.stores.events.size, 0);
    assert.equal(f.stores.undo.has("second"), true);
    assert.deepEqual(f.args.annualChanged, []);
  });

test("incompatible companion rules cannot receive an annual grade under another grading system", async () => {
  const companion = classroom(2);
  companion.lessons[0].gradingPolicy.competencyFactor = 4;
  const f = fixture({ companion });
  await assert.rejects(f.c.EduRecordTransaction.commit(f.args), /قواعد نمره/);
  assert.equal(f.stores.catalog.get("first").revision, 1);
  assert.deepEqual(f.args.annualChanged, []);
});

test("incompatible module identities abort the annual grade rather than matching by position or name", async () => {
  const companion = classroom(2);
  companion.lessons[0].poudmans[0].id = "another-module";
  const f = fixture({ companion });
  await assert.rejects(
    f.c.EduRecordTransaction.commit(f.args),
    /ساختار پودمان/,
  );
  assert.equal(f.stores.catalog.get("first").revision, 1);
  assert.deepEqual(f.args.annualChanged, []);
});

test("multiple synchronized class records advance the companion revision only once", async () => {
  const f = fixture(),
    before = classroom(2),
    after = classroom(3);
  before.id = after.id = "class2";
  f.args.records.get("meta").layout[0].classes.push("class2");
  f.args.changed.push(["class:class2", JSON.stringify(after)]);
  f.args.before.push({ key: "class:class2", value: before });
  const originalTransaction = f.args.connection.transaction;
  f.args.connection.transaction = (...args) => {
    const tx = originalTransaction(...args);
    tx.objectStore("records").put({
      key: "second|meta",
      workspace: "second",
      logical: "meta",
      value: f.args.records.get("meta"),
    });
    tx.objectStore("records").put({
      key: "second|class:class2",
      workspace: "second",
      logical: "class:class2",
      value: before,
    });
    return tx;
  };
  await f.c.EduRecordTransaction.commit(f.args);
  for (const id of ["class", "class2"])
    assert.equal(
      f.stores.records.get("second|class:" + id).value.lessons[0].poudmans[0]
        .podScores.student.c,
      3,
    );
  assert.equal(f.stores.catalog.get("second").revision, 8);
  const events = [...f.stores.events.values()].filter(
    (row) => row.workspace === "second",
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].changes.length, 2);
  assert.equal(f.args.annualChanged.length, 1);
});

test("legacy periods without a first/second role keep their local modular grades without touching another period", async () => {
  const f = fixture({ legacySource: true });
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(f.stores.catalog.get("first").revision, 2);
  assert.equal(f.stores.catalog.get("second").revision, 7);
  assert.deepEqual(f.args.annualChanged, []);
});

test("new empty classes remain creatable without an annual baseline", async () => {
  const f = fixture(),
    value = classroom();
  value.lessons = [];
  f.args.before[0].value = null;
  f.args.changed = [["class:class", JSON.stringify(value)]];
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(f.stores.catalog.get("first").revision, 2);
  assert.deepEqual(f.reads, [
    ["records", "get", "@installation-reset"],
    ["catalog", "get", "first"],
  ]);
});

test("new classes with matching annual identity can initialize their existing companion's empty scores", async () => {
  const companion = classroom();
  companion.lessons[0].poudmans[0].podScores = {};
  const f = fixture({ companion });
  f.args.before[0].value = null;
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(
    f.stores.records.get("second|class:class").value.lessons[0].poudmans[0]
      .podScores.student.c,
    3,
  );
});

test("deleting a term's lesson does not erase the same year's modular grades in another term", async () => {
  const f = fixture(),
    value = classroom(2);
  value.lessons = [];
  f.args.changed = [["class:class", JSON.stringify(value)]];
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(
    f.stores.records.get("first|class:class").value.lessons.length,
    0,
  );
  assert.equal(
    f.stores.records.get("second|class:class").value.lessons[0].poudmans[0]
      .podScores.student.c,
    2,
  );
  assert.equal(f.stores.catalog.get("second").revision, 7);
  assert.deepEqual(f.args.annualChanged, []);
});

test("removing a module from one term's structure does not clear its counterpart's annual grades", async () => {
  const f = fixture(),
    value = classroom(2);
  value.lessons[0].poudmans = [];
  f.args.changed = [["class:class", JSON.stringify(value)]];
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(
    f.stores.records.get("second|class:class").value.lessons[0].poudmans[0]
      .podScores.student.c,
    2,
  );
  assert.equal(f.stores.catalog.get("second").revision, 7);
  assert.deepEqual(f.args.annualChanged, []);
});

test("explicit clearing of a retained module's score is an annual change and preserves unrelated metadata", async () => {
  const companion = classroom(2);
  companion.lessons[0].poudmans[0].podScores.student.gate = true;
  const f = fixture({ companion }),
    value = classroom(2);
  value.lessons[0].poudmans[0].podScores = {};
  f.args.changed = [["class:class", JSON.stringify(value)]];
  await f.c.EduRecordTransaction.commit(f.args);
  const record =
    f.stores.records.get("second|class:class").value.lessons[0].poudmans[0]
      .podScores.student;
  assert.equal(record.m, undefined);
  assert.equal(record.c, undefined);
  assert.equal(record.gate, true);
  assert.equal(f.stores.catalog.get("second").revision, 8);
  assert.equal(f.args.annualChanged.length, 1);
});

test("a lesson absent from the companion term is not recreated by grade synchronization", async () => {
  const companion = classroom();
  companion.lessons = [];
  const f = fixture({ companion });
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(
    f.stores.records.get("second|class:class").value.lessons.length,
    0,
  );
  assert.equal(f.stores.catalog.get("second").revision, 7);
  assert.deepEqual(f.args.annualChanged, []);
});

for (const [expected, durable] of [
  ["old-installation", "replacement-installation"],
  ["", "replacement-installation"],
  ["old-installation", null],
]) {
  test(
    "ordinary transaction rejects installation ABA before any source, annual peer, history or undo write: " +
      JSON.stringify([expected, durable]),
    async () => {
      const f = fixture({ installation: durable });
      f.args.expectedInstallation = expected;
      const before = structuredClone(f.stores);
      await assert.rejects(
        f.c.EduRecordTransaction.commit(f.args),
        (error) => error.code === "INSTALLATION_CHANGED",
      );
      assert.deepEqual(f.stores, before);
      assert.equal(f.writes.length, 0);
    },
  );
}

test("matching nonempty installation permits atomic annual grade save", async () => {
  const f = fixture({ installation: "current-installation" });
  f.args.expectedInstallation = "current-installation";
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(f.stores.catalog.get("first").revision, 2);
  assert.equal(
    f.stores.records.get("second|class:class").value.lessons[0].poudmans[0]
      .podScores.student.c,
    3,
  );
});

for (const target of ["source", "companion"]) {
  test(`exhausted ${target} revision aborts annual records, catalog, history and undo together`, async () => {
    const f = fixture({
      [target + "Revision"]: Number.MAX_SAFE_INTEGER,
    });
    const revision = f.c.EduRevision;
    let domainError;
    f.c.EduRevision = {
      next(value) {
        try {
          return revision.next(value);
        } catch (error) {
          domainError = error;
          throw error;
        }
      },
    };
    const before = structuredClone(f.stores);
    await assert.rejects(
      f.c.EduRecordTransaction.commit(f.args),
      (error) =>
        error === domainError && error.code === "REVISION_LIMIT_REACHED",
    );
    assert.equal(f.aborted, true);
    assert.deepEqual(f.stores, before);
    assert.deepEqual(f.args.annualChanged, []);
    if (target === "source") assert.equal(f.writes.length, 0);
    else
      assert.equal(
        f.writes.some(
          ([name, operation, row]) =>
            name === "records" &&
            operation === "put" &&
            row.workspace === "second",
        ),
        false,
      );
  });
}

test("the last safe source and companion revision commits with exact history and undo tokens", async () => {
  const f = fixture({
    sourceRevision: Number.MAX_SAFE_INTEGER - 1,
    companionRevision: Number.MAX_SAFE_INTEGER - 1,
  });
  const result = await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(result.revision, Number.MAX_SAFE_INTEGER);
  assert.equal(
    f.stores.catalog.get("second").revision,
    Number.MAX_SAFE_INTEGER,
  );
  for (const event of f.stores.events.values())
    assert.equal(event.revision, Number.MAX_SAFE_INTEGER);
  assert.equal(f.stores.undo.get("first").revision, Number.MAX_SAFE_INTEGER);
  assert.equal(f.args.annualChanged[0].revision, Number.MAX_SAFE_INTEGER);
});

test("an unchanged companion at the revision limit permits a source grade save", async () => {
  const f = fixture({
    companionRevision: Number.MAX_SAFE_INTEGER,
    companion: classroom(3),
  });
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(f.stores.catalog.get("first").revision, 2);
  assert.equal(
    f.stores.catalog.get("second").revision,
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(f.stores.undo.has("second"), true);
  assert.deepEqual(f.args.annualChanged, []);
});

test("zero revisions advance normally while preserving synchronized grade values", async () => {
  const f = fixture({ sourceRevision: 0, companionRevision: 0 });
  await f.c.EduRecordTransaction.commit(f.args);
  for (const id of ["first", "second"]) {
    assert.equal(f.stores.catalog.get(id).revision, 1);
    assert.equal(
      f.stores.records.get(id + "|class:class").value.lessons[0].poudmans[0]
        .podScores.student.c,
      3,
    );
  }
});

test("an ordinary edit can consume the last safe revision and its next edit is rejected atomically", async () => {
  const edit = (f) => {
    const value = structuredClone(f.args.before[0].value);
    value.name = "Renamed class";
    f.args.changed = [["class:class", JSON.stringify(value)]];
  };
  const f = fixture({ sourceRevision: Number.MAX_SAFE_INTEGER - 1 });
  edit(f);
  await f.c.EduRecordTransaction.commit(f.args);
  assert.equal(f.stores.catalog.get("first").revision, Number.MAX_SAFE_INTEGER);
  assert.equal(
    f.stores.records.get("first|class:class").value.name,
    "Renamed class",
  );
  const exhausted = fixture({
    sourceRevision: f.stores.catalog.get("first").revision,
  });
  edit(exhausted);
  const before = structuredClone(exhausted.stores);
  await assert.rejects(
    exhausted.c.EduRecordTransaction.commit(exhausted.args),
    (error) => error.code === "REVISION_LIMIT_REACHED",
  );
  assert.deepEqual(exhausted.stores, before);
  assert.equal(exhausted.writes.length, 0);
});
