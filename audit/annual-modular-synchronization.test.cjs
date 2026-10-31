"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const c = vm.createContext({ structuredClone, clone: structuredClone });
  for (const source of [
    "domain/grade-math.js",
    "domain/data-boundary.js",
    "domain/grade-policy.js",
    "domain/annual-modules.js",
    "data/workspace-records.js",
    "workspace/grading/annual-modular.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
      c,
    );
  const codec = c.EduWorkspaceRecords.create({
    clone: structuredClone,
    normalizeDB: (value) => value,
    isDataObject: (value) =>
      !!value && typeof value === "object" && !Array.isArray(value),
    isSafeRecordId: (value) => /^[a-zA-Z0-9_-]+$/.test(value),
  });
  c.decodeWorkspaceRecords = codec.decodeWorkspaceRecords;
  c.academicTermKind = (value) =>
    ({ اول: "first", دوم: "second" })[value] || null;
  let inCallback = false;
  const reads = [],
    transactions = [],
    validations = [];
  const state = {
    catalog: new Map(),
    records: new Map(),
    undo: new Map(),
    events: [],
  };
  const hooks = {
    beforeWrite: null,
    afterRead: null,
    failPut: 0,
    failTransaction: false,
  };
  const connection = {
    transaction(names, mode) {
      names = Array.from(names);
      transactions.push({ names, mode });
      if (mode === "readwrite") hooks.beforeWrite?.();
      const snapshot = structuredClone(state),
        pending = [];
      let resolve,
        reject,
        aborted = false,
        puts = 0;
      const tx = {
        done: new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
        abort() {
          aborted = true;
          pending.length = 0;
          reject(Error("transaction aborted"));
        },
        objectStore(name) {
          assert.ok(names.includes(name));
          return {
            getAll() {
              assert.equal(
                name,
                "catalog",
                "the records store must never be scanned",
              );
              const request = { result: [...snapshot.catalog.values()] };
              queueMicrotask(() => {
                inCallback = true;
                request.onsuccess();
                inCallback = false;
                if (aborted) return;
                if (mode === "readonly") hooks.afterRead?.();
                if (mode === "readwrite" && hooks.failTransaction) {
                  reject(Error("async storage failure"));
                  return;
                }
                for (const write of pending) write();
                resolve();
              });
              return request;
            },
            put(value) {
              assert.equal(inCallback, true);
              puts++;
              if (hooks.failPut && puts === hooks.failPut)
                throw Error("injected put failure");
              const copy = structuredClone(value);
              pending.push(() => state[name].set(copy.key || copy.id, copy));
            },
            add(value) {
              assert.equal(inCallback, true);
              const copy = structuredClone(value);
              pending.push(() => state.events.push(copy));
            },
            delete(id) {
              assert.equal(inCallback, true);
              pending.push(() => state[name].delete(id));
            },
            bounded(id) {
              assert.equal(mode, "readonly");
              assert.equal(
                inCallback,
                true,
                "bounded reads must be queued inside catalog callback",
              );
              reads.push(id);
              return [...snapshot.records.values()].filter(
                (row) => row.workspace === id,
              );
            },
          };
        },
      };
      return tx;
    },
  };
  c.connection = connection;
  c.transactionDone = (tx) => tx.done;
  c.requestPromise = async (value) => value;
  c.workspaceRecordRequest = (store, id) => store.bounded(id);
  c.validateV24 = (data) => {
    validations.push(structuredClone(data));
    for (const school of data.schools)
      for (const cls of school.classes)
        for (const lesson of cls.lessons.filter(
          c.EduAnnualModules.isFormalModular,
        )) {
          c.EduPolicy.validate(lesson.gradingPolicy);
          for (const pod of lesson.poudmans)
            for (const score of Object.values(pod.podScores || {}))
              c.EduPolicy.moduleResult(lesson.gradingPolicy, score);
        }
  };
  function save(id, data, details = {}) {
    const period = {
      id,
      year: "1405-1406",
      term: id === "first" ? "اول" : "دوم",
      termKind: id === "first" ? "first" : "second",
      revision: id === "first" ? 2 : 3,
      closed: id === "first",
      ...details,
    };
    state.catalog.set(id, period);
    for (const [logical, value] of codec.collectRecords(data))
      state.records.set(id + "|" + logical, {
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      });
    state.undo.set(id, { id, marker: "undo" });
  }
  function classroom(id = "class", score = { m: 0, c: 2 }) {
    return {
      id,
      name: "کلاس",
      students: [{ id: "student", name: "هنرجو" }],
      archivedStudents: [],
      lessons: [
        {
          id: "modular",
          name: "درس سالانه",
          gradeMode: "standard",
          gradingPolicy: c.EduPolicy.defaults("modular", "1405-1406"),
          kardaneshScores: {},
          poudmans: [
            {
              id: "module-one",
              name: "اول",
              podScores: score ? { student: score } : {},
              units: [{ id: "unit", unitScores: { student: { m: 16 } } }],
            },
            { id: "module-two", name: "دوم", podScores: {}, units: [] },
          ],
        },
        {
          id: "dual",
          gradeMode: "kardanesh",
          kardaneshScores: { student: { practical: 12, theory: 14 } },
          poudmans: [],
        },
      ],
    };
  }
  function data(classes = [classroom()], schoolId = "school") {
    return {
      settings: { academicYear: "1405-1406" },
      schools: [{ id: schoolId, name: "مدرسه", classes }],
      sessions: [{ id: "session", marker: "attendance unchanged" }],
    };
  }
  const value = (workspace, classId = "class") =>
    state.records.get(workspace + "|class:" + classId).value;
  const score = (workspace, classId = "class", module = 0) =>
    value(workspace, classId).lessons[0].poudmans[module].podScores.student;
  return {
    c,
    state,
    hooks,
    reads,
    transactions,
    validations,
    save,
    classroom,
    data,
    value,
    score,
  };
}

test("annual consolidation atomically merges split modules while preserving term-only data and closed history", async () => {
  const f = fixture();
  const first = f.data(),
    second = f.data([f.classroom("class", null)]);
  second.schools[0].classes[0].lessons[0].poudmans[1].podScores.student = {
    m: 5,
    c: 3,
  };
  second.schools[0].classes[0].lessons[1].kardaneshScores.student.theory = 20;
  f.save("first", first);
  f.save("second", second);
  const preserved = JSON.stringify(
    [...f.state.records.values()].filter(
      (row) => !row.logical.startsWith("class:"),
    ),
  );
  const result = await f.c.synchronizeAnnualModularGrades("second");
  assert.equal(result.changed.length, 2);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(f.reads, ["first", "second"]);
  assert.equal(f.score("first").m, 0);
  assert.equal(f.score("second").m, 0);
  assert.equal(f.score("first", "class", 1).c, 3);
  assert.equal(f.score("second", "class", 1).m, 5);
  assert.equal(f.value("first").lessons[1].kardaneshScores.student.theory, 14);
  assert.equal(f.value("second").lessons[1].kardaneshScores.student.theory, 20);
  assert.equal(
    f.value("first").lessons[0].poudmans[0].units[0].unitScores.student.m,
    16,
  );
  assert.equal(
    JSON.stringify(
      [...f.state.records.values()].filter(
        (row) => !row.logical.startsWith("class:"),
      ),
    ),
    preserved,
  );
  assert.equal(f.state.catalog.get("first").closed, true);
  assert.equal(f.state.catalog.get("first").revision, 3);
  assert.equal(f.state.catalog.get("second").revision, 4);
  assert.equal(f.state.events.length, 2);
  assert.equal(f.state.undo.size, 0);
  assert.equal(f.validations.length, 2);
  assert.equal(f.transactions.length, 2);
});

test("coherent annual grades are idempotent despite record and key ordering", async () => {
  const f = fixture();
  f.save("first", f.data());
  const second = f.data();
  second.schools[0].classes[0].lessons[0].poudmans.reverse();
  second.schools[0].classes[0].lessons[0].poudmans[1].podScores.student = {
    c: 2,
    m: 0,
  };
  f.save("second", second);
  const before = JSON.stringify([...f.state.records]);
  const result = await f.c.synchronizeAnnualModularGrades("first");
  assert.equal(result.changed.length, 0);
  assert.equal(result.conflicts.length, 0);
  assert.equal(f.transactions.length, 1);
  assert.equal(f.state.events.length, 0);
  assert.equal(f.state.undo.size, 2);
  assert.equal(JSON.stringify([...f.state.records]), before);
});

test("conflicting class grades remain untouched while coherent sibling classes still consolidate", async () => {
  const f = fixture();
  f.save("first", f.data([f.classroom(), f.classroom("safe")]));
  f.save(
    "second",
    f.data([f.classroom("class", { m: 5, c: 3 }), f.classroom("safe", null)]),
  );
  const conflictBefore = JSON.stringify([f.value("first"), f.value("second")]);
  const result = await f.c.synchronizeAnnualModularGrades("first");
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].schoolId, "school");
  assert.equal(result.conflicts[0].classId, "class");
  assert.match(result.conflicts[0].message, /دو نمرهٔ متفاوت/);
  assert.equal(
    JSON.stringify([f.value("first"), f.value("second")]),
    conflictBefore,
  );
  assert.equal(f.score("second", "safe").m, 0);
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].workspace, "second");
});

test("different partial records are conflicts, never combined into an invented complete grade", async () => {
  const f = fixture();
  f.save("first", f.data([f.classroom("class", { m: 0 })]));
  f.save("second", f.data([f.classroom("class", { c: 3 })]));
  const result = await f.c.synchronizeAnnualModularGrades("first");
  assert.equal(result.changed.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(f.score("first").c, undefined);
  assert.equal(f.score("second").m, undefined);
  assert.equal(f.transactions.length, 1);
});

test("annual consolidation is scoped by academic year and school identity", async () => {
  const f = fixture();
  f.save("first", f.data());
  f.save("second", f.data([f.classroom("class", null)], "other-school"));
  f.save("other-year", f.data([f.classroom("class", { m: 5, c: 3 })]), {
    year: "1404-1405",
  });
  const result = await f.c.synchronizeAnnualModularGrades("first");
  assert.equal(result.changed.length, 0);
  assert.deepEqual(f.reads, ["first", "second"]);
  assert.equal(f.score("second"), undefined);
  assert.equal(f.state.catalog.get("other-year").revision, 3);
});

test("duplicate annual period roles reject before any write or grade reads", async () => {
  const f = fixture();
  f.save("first", f.data());
  f.save("second", f.data());
  f.save("duplicate", f.data(), { termKind: "first" });
  await assert.rejects(f.c.synchronizeAnnualModularGrades("first"), /تکراری/);
  assert.equal(f.reads.length, 0);
  assert.equal(f.state.events.length, 0);
  assert.equal(f.transactions.length, 1);
});

for (const mutation of ["revision", "family", "role"]) {
  test(`annual consolidation rechecks ${mutation} in the write transaction`, async () => {
    const f = fixture();
    f.save("first", f.data());
    f.save("second", f.data([f.classroom("class", null)]));
    const recordsBefore = JSON.stringify([...f.state.records]);
    f.hooks.beforeWrite = () => {
      if (mutation === "revision") f.state.catalog.get("first").revision++;
      else if (mutation === "family") f.state.catalog.delete("second");
      else f.state.catalog.get("second").termKind = "first";
    };
    await assert.rejects(
      f.c.synchronizeAnnualModularGrades("first"),
      /تغییر|تکراری/,
    );
    assert.equal(JSON.stringify([...f.state.records]), recordsBefore);
    assert.equal(f.state.events.length, 0);
    assert.equal(f.state.undo.size, 2);
  });
}

for (const failure of ["put", "transaction"]) {
  test(`annual consolidation rolls back every record, revision, event and undo on ${failure} failure`, async () => {
    const f = fixture();
    f.save("first", f.data());
    f.save("second", f.data([f.classroom("class", null)]));
    const before = structuredClone(f.state);
    if (failure === "put") f.hooks.failPut = 2;
    else f.hooks.failTransaction = true;
    await assert.rejects(
      f.c.synchronizeAnnualModularGrades("second"),
      /failure/,
    );
    assert.deepEqual(structuredClone(f.state), before);
  });
}

test("candidate validation failure leaves the complete class family untouched", async () => {
  const f = fixture();
  f.save("first", f.data());
  f.save("second", f.data([f.classroom("class", null)]));
  const before = structuredClone(f.state);
  f.c.validateV24 = () => {
    throw Error("invalid candidate");
  };
  const result = await f.c.synchronizeAnnualModularGrades("first");
  assert.equal(result.changed.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.match(result.conflicts[0].message, /invalid candidate/);
  assert.deepEqual(structuredClone(f.state), before);
});

test("consolidation never resurrects a course missing from another term", async () => {
  const f = fixture();
  f.save("first", f.data());
  const second = f.data();
  second.schools[0].classes[0].lessons.shift();
  f.save("second", second);
  const result = await f.c.synchronizeAnnualModularGrades("first");
  assert.equal(result.changed.length, 0);
  assert.equal(f.value("second").lessons.length, 1);
  assert.equal(f.value("second").lessons[0].id, "dual");
});

test("annual consolidation cannot continue after its connection has changed", async () => {
  const f = fixture();
  f.save("first", f.data());
  f.save("second", f.data([f.classroom("class", null)]));
  f.hooks.afterRead = () => {
    f.c.connection = {};
  };
  await assert.rejects(
    f.c.synchronizeAnnualModularGrades("first"),
    /اتصال بانک/,
  );
  assert.equal(f.state.events.length, 0);
});

test("an unstarted second term is a no-op without writes or global-state changes", async () => {
  const f = fixture();
  f.save("first", f.data());
  const uiWorkspace = { id: "unrelated", revision: 9 };
  const uiData = { marker: "never replaced" };
  const committed = new Map([["meta", "current tab"]]);
  f.c.workspace = uiWorkspace;
  f.c.db = uiData;
  f.c.committed = committed;
  const result = await f.c.synchronizeAnnualModularGrades("first");
  assert.equal(result.changed.length, 0);
  assert.equal(result.conflicts.length, 0);
  assert.equal(f.transactions.length, 1);
  assert.deepEqual(f.reads, ["first"]);
  assert.equal(f.c.workspace, uiWorkspace);
  assert.equal(f.c.db, uiData);
  assert.equal(f.c.committed, committed);
});

test("an inconsistent modular policy skips the entire class family without stopping startup", async () => {
  const f = fixture();
  f.save("first", f.data());
  const second = f.data([f.classroom("class", null)]);
  second.schools[0].classes[0].lessons[0].gradingPolicy.moduleMin = 13;
  f.save("second", second);
  const before = structuredClone(f.state);
  const result = await f.c.synchronizeAnnualModularGrades("first");
  assert.equal(result.changed.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.match(result.conflicts[0].message, /قواعد نمره‌دهی/);
  assert.deepEqual(structuredClone(f.state), before);
});

test("blank raw-score placeholders never create unnecessary class or revision writes", async () => {
  const f = fixture();
  const first = f.data([f.classroom("class", { m: null, c: null })]);
  f.save("first", first);
  f.save("second", f.data([f.classroom("class", null)]));
  const before = structuredClone(f.state);
  const result = await f.c.synchronizeAnnualModularGrades("first");
  assert.equal(result.changed.length, 0);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(structuredClone(f.state), before);
});

test("a retired connection cannot queue consolidation writes", async () => {
  const f = fixture();
  f.save("first", f.data());
  f.save("second", f.data([f.classroom("class", null)]));
  f.hooks.afterRead = () => {
    f.c.connectionRetired = true;
  };
  await assert.rejects(
    f.c.synchronizeAnnualModularGrades("first"),
    /اتصال بانک/,
  );
  assert.equal(f.transactions.length, 1);
  assert.equal(f.state.events.length, 0);
});
