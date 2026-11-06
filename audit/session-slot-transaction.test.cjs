"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const copy = structuredClone,
  session = (id, extra = {}) => ({
    id,
    schoolId: "school",
    classId: "classroom",
    lessonId: "lesson",
    date: "2026-10-27",
    period: 0,
    roster: [],
    attendance: {},
    scores: [],
    ...extra,
  });

// Readwrite transactions serialize their snapshots. Requests queued inside an
// IDB success callback keep the transaction alive, and abort publishes nothing.
function fixture({
  first = [],
  second = [],
  extra = [],
  directory = false,
  annual = false,
  schedules = {},
} = {}) {
  const c = vm.createContext({
      structuredClone,
      Map,
      IDBKeyRange: { bound: (lower, upper) => ({ lower, upper }) },
    }),
    stores = {
      catalog: new Map(),
      records: new Map(),
      events: new Map(),
      undo: new Map(),
    },
    transactions = [];
  let active = false,
    eventId = 0;
  const connect = {
    transaction() {
      let resolve, reject;
      const tx = {
        done: new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
        operations: [],
        aborted: false,
        abort() {
          if (tx.aborted) return;
          tx.aborted = true;
          reject(Error("Aborted transaction"));
        },
        objectStore(name) {
          const request = (operation, key, value) => {
            const result = {};
            tx.operations.push({
              name,
              operation,
              key,
              value: copy(value),
              result,
            });
            return result;
          };
          return {
            get: (key) => request("get", key),
            getAll: (key) => request("getAll", key),
            put: (value) => request("put", undefined, value),
            add: (value) => request("add", undefined, value),
            delete: (key) => request("delete", key),
          };
        },
        resolve,
      };
      transactions.push(tx);
      queueMicrotask(start);
      return tx;
    },
  };
  function start() {
    if (active || !transactions.length) return;
    active = true;
    const tx = transactions[0],
      staged = Object.fromEntries(
        Object.entries(stores).map(([name, rows]) => [
          name,
          new Map([...rows].map(([key, value]) => [key, copy(value)])),
        ]),
      );
    const run = () => {
      if (tx.aborted || !tx.operations.length) {
        if (!tx.aborted) {
          for (const name of Object.keys(stores)) stores[name] = staged[name];
          tx.resolve();
        }
        transactions.shift();
        active = false;
        queueMicrotask(start);
        return;
      }
      const { name, operation, key, value, result } = tx.operations.shift(),
        rows = staged[name];
      try {
        if (operation === "getAll")
          result.result = [...rows]
            .filter(([id]) => !key || (id >= key.lower && id < key.upper))
            .map(([, row]) => copy(row));
        else if (operation === "get") result.result = copy(rows.get(key));
        else if (operation === "delete") rows.delete(key);
        else
          rows.set(
            name === "records"
              ? value.key
              : name === "events"
                ? ++eventId
                : value.id,
            copy(value),
          );
        result.onsuccess?.();
      } catch (error) {
        tx.abort();
      }
      queueMicrotask(run);
    };
    run();
  }
  const classroom = {
      id: "classroom",
      name: "CLASS",
      students: [],
      archivedStudents: [],
      lessons: [
        {
          id: "lesson",
          name: "LESSON",
          gradeMode: "kardanesh",
          kardaneshScores: {},
          poudmans: [],
        },
      ],
    },
    install = (id, kind, year, sessions) => {
      const period = {
          id,
          year,
          term: kind === "first" ? "اول" : "دوم",
          termKind: kind,
          revision: 1,
          closed: false,
        },
        meta = {
          settings: {
            academicYear: year,
            academicTerm: period.term,
            weekStartDate: "2026-10-24",
          },
          activeDays: [0, 1, 2, 3, 4, 5],
          periods: 6,
          masterSchedule: copy(
            schedules[id] || {
              "3-0-all": {
                schoolId: "school",
                classId: "classroom",
                lessonId: "lesson",
              },
              "3-1-all": {
                schoolId: "school",
                classId: "classroom",
                lessonId: "lesson",
              },
            },
          ),
          layout: [{ id: "school", name: "SCHOOL", classes: [classroom.id] }],
        };
      stores.catalog.set(id, period);
      for (const [logical, value] of [
        ["meta", meta],
        ["class:classroom", classroom],
        ...sessions.map((row) => ["session:" + row.id, row]),
      ])
        stores.records.set(id + "|" + logical, {
          key: id + "|" + logical,
          workspace: id,
          logical,
          value: copy(value),
        });
    };
  install("first", "first", "1405-1406", first);
  install("second", "second", "1405-1406", second);
  for (const item of extra)
    install(item.id, item.kind || "first", item.year, item.sessions);
  for (const source of [
    "domain/revision.js",
    "domain/session-slots.js",
    ...(directory
      ? [
          "domain/academic-year-directory.js",
          "domain/history-changes.js",
          "data/commit-plan.js",
          "data/academic-directory-transaction.js",
        ]
      : []),
    "data/record-transaction.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
      c,
    );
  c.EduDataStoreRuntime = { transactionDone: (tx) => tx.done };
  if (annual)
    c.EduAnnualModules = { hasChanges: () => true, mirrorClass: () => null };
  const commit = (
    id,
    current,
    {
      previous = null,
      restore = null,
      classEdit = false,
      metaEdit = null,
    } = {},
  ) => {
    const period = copy(stores.catalog.get(id)),
      records = new Map([
        ["meta", copy(stores.records.get(id + "|meta").value)],
      ]),
      changed = [["session:" + current.id, JSON.stringify(current)]],
      before = [{ key: "session:" + current.id, value: previous }];
    if (metaEdit) {
      const originalMeta = copy(records.get("meta"));
      Object.assign(records.get("meta"), copy(metaEdit));
      changed.push(["meta", JSON.stringify(records.get("meta"))]);
      before.push({ key: "meta", value: originalMeta });
    }
    if (classEdit) {
      records.set("class:classroom", { ...copy(classroom), name: "EDITED" });
      changed.push([
        "class:classroom",
        JSON.stringify(records.get("class:classroom")),
      ]);
      before.push({ key: "class:classroom", value: copy(classroom) });
    }
    return c.EduRecordTransaction.commit({
      connection: connect,
      workspace: period,
      records,
      changed,
      before,
      removed: [],
      changes: [],
      action: "TEST",
      keepUndo: !restore,
      normalizedName: String,
      academicTermKind: (term) => (term === "اول" ? "first" : "second"),
      decodeRecords() {},
      historicalRoster: () => [],
      restoredSessionRecords: restore,
    });
  };
  return { c, stores, commit };
}
test("a peer slot conflict atomically preserves records, catalog, event and undo stores", async () => {
  const f = fixture({ first: [session("a")] }),
    before = JSON.stringify(
      Object.entries(f.stores).map(([name, rows]) => [name, [...rows]]),
    );
  await assert.rejects(
    f.commit("second", session("b")),
    (error) => error.code === "ACADEMIC_SESSION_SLOT_CONFLICT",
  );
  assert.equal(
    JSON.stringify(
      Object.entries(f.stores).map(([name, rows]) => [name, [...rows]]),
    ),
    before,
  );
});
test("competing first/second writers cannot both claim an initially empty physical slot", async () => {
  const f = fixture(),
    result = await Promise.allSettled([
      f.commit("first", session("a")),
      f.commit("second", session("b")),
    ]);
  assert.equal(result.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(
    result.find((row) => row.status === "rejected").reason.code,
    "ACADEMIC_SESSION_SLOT_CONFLICT",
  );
  assert.equal(
    [...f.stores.records.values()].filter((row) =>
      row.logical.startsWith("session:"),
    ).length,
    1,
  );
  assert.equal(f.stores.events.size, 1);
});
test("other academic years do not block a new slot", async () => {
  const f = fixture({
    first: [],
    extra: [
      { id: "old", year: "1404-1405", sessions: [session("old-session")] },
    ],
  });
  await f.commit("second", session("b"));
  assert.ok(f.stores.records.has("second|session:b"));
});
test("different-class and different-school peer collisions roll back every store", async () => {
  for (const extra of [
    { classId: "another-class" },
    { classId: "another-class", schoolId: "another-school" },
  ]) {
    const f = fixture({ first: [session("a", extra)] }),
      before = JSON.stringify(
        Object.entries(f.stores).map(([name, rows]) => [name, [...rows]]),
      );
    await assert.rejects(
      f.commit("second", session("b")),
      (error) => error.code === "ACADEMIC_SESSION_SLOT_CONFLICT",
    );
    assert.equal(
      JSON.stringify(
        Object.entries(f.stores).map(([name, rows]) => [name, [...rows]]),
      ),
      before,
    );
  }
});
test("competing terms with different classes still commit only one teacher date/bell", async () => {
  const f = fixture({
      schedules: {
        second: {
          "3-0-all": {
            schoolId: "another-school",
            classId: "another-class",
            lessonId: "lesson",
          },
        },
      },
    }),
    results = await Promise.allSettled([
      f.commit("first", session("a")),
      f.commit(
        "second",
        session("b", { classId: "another-class", schoolId: "another-school" }),
      ),
    ]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(
    results.find((row) => row.status === "rejected").reason.code,
    "ACADEMIC_SESSION_SLOT_CONFLICT",
  );
  assert.equal(
    [...f.stores.records.values()].filter((row) =>
      row.logical.startsWith("session:"),
    ).length,
    1,
  );
});
test("legacy duplicate slots allow attendance updates and exact historical undo", async () => {
  const a = session("a"),
    b = session("b"),
    f = fixture({ first: [a], second: [b] });
  await f.commit(
    "second",
    { ...b, attendance: { student: "present" } },
    { previous: b },
  );
  const moved = { ...b, period: 1 };
  await f.commit("second", moved, { previous: b });
  await f.commit("second", b, {
    previous: moved,
    restore: new Map([["session:b", b]]),
  });
  assert.equal(f.stores.records.get("second|session:b").value.period, 0);
});
test("a slot correction cannot introduce an overlap merely by supplying a mismatched undo map", async () => {
  const previous = session("b", { period: 1 }),
    f = fixture({ first: [session("a")], second: [previous] });
  await assert.rejects(
    f.commit("second", session("b"), {
      previous,
      restore: new Map([["session:b", previous]]),
    }),
    (error) => error.code === "ACADEMIC_SESSION_SLOT_CONFLICT",
  );
});
test("a combined shared-directory edit cannot bypass the physical slot guard", async () => {
  const f = fixture({ first: [session("a")], directory: true }),
    before = JSON.stringify([...f.stores.records]);
  await assert.rejects(
    f.commit("second", session("b"), { classEdit: true }),
    (error) => error.code === "ACADEMIC_SESSION_SLOT_CONFLICT",
  );
  assert.equal(JSON.stringify([...f.stores.records]), before);
  assert.equal(f.stores.events.size, 0);
});
test("a combined annual-module grade commit cannot bypass the physical slot guard", async () => {
  const f = fixture({ first: [session("a")], annual: true }),
    before = JSON.stringify([...f.stores.records]);
  await assert.rejects(
    f.commit("second", session("b"), { classEdit: true }),
    (error) => error.code === "ACADEMIC_SESSION_SLOT_CONFLICT",
  );
  assert.equal(JSON.stringify([...f.stores.records]), before);
  assert.equal(f.stores.events.size, 0);
});

const storeSnapshot = (f) =>
    JSON.stringify(
      Object.entries(f.stores).map(([name, rows]) => [name, [...rows]]),
    ),
  scheduleFailure = (error) => error.code === "SESSION_OUTSIDE_SCHEDULE";

for (const directory of [false, true]) {
  const pathName = directory ? "shared-directory" : "normal-record";
  test(
    pathName +
      " direct session save rejects an unscheduled date and rolls back every store",
    async () => {
      const f = fixture({ directory }),
        before = storeSnapshot(f);
      await assert.rejects(
        f.commit("second", session("new", { date: "2026-10-28" }), {
          classEdit: directory,
        }),
        scheduleFailure,
      );
      assert.equal(storeSnapshot(f), before);
    },
  );

  test(
    pathName +
      " session date correction cannot move history outside its schedule",
    async () => {
      const previous = session("existing", {
        attendance: { student: "leave" },
        scores: [{ studentId: "student", type: "classGrade", value: 18 }],
      });
      const f = fixture({ directory, second: [previous] }),
        before = storeSnapshot(f);
      await assert.rejects(
        f.commit(
          "second",
          { ...previous, date: "2026-10-28" },
          { previous, classEdit: directory },
        ),
        scheduleFailure,
      );
      assert.equal(storeSnapshot(f), before);
    },
  );

  test(
    pathName +
      " retargeting the same physical session revalidates school and lesson ownership",
    async () => {
      for (const extra of [
        { schoolId: "other-school" },
        { lessonId: "other-lesson" },
      ]) {
        const previous = session("existing"),
          f = fixture({ directory, second: [previous] });
        const before = storeSnapshot(f);
        await assert.rejects(
          f.commit(
            "second",
            { ...previous, ...extra },
            { previous, classEdit: directory },
          ),
          scheduleFailure,
        );
        assert.equal(storeSnapshot(f), before);
      }
    },
  );

  test(
    pathName +
      " existing unscheduled attendance remains editable without reassigning its slot",
    async () => {
      const previous = session("historical", { date: "2026-10-28" }),
        f = fixture({ directory, second: [previous] });
      await f.commit(
        "second",
        { ...previous, attendance: { student: "present" } },
        { previous, classEdit: directory },
      );
      const saved = f.stores.records.get("second|session:historical").value;
      assert.equal(saved.date, "2026-10-28");
      assert.equal(saved.attendance.student, "present");
    },
  );

  test(
    pathName +
      " exact validated undo restores unscheduled history while forged undo remains guarded",
    async () => {
      const historical = session("historical", { date: "2026-10-28" }),
        previous = session("historical");
      const f = fixture({ directory, second: [previous] });
      await f.commit("second", historical, {
        previous,
        classEdit: directory,
        restore: new Map([["session:historical", historical]]),
      });
      assert.equal(
        f.stores.records.get("second|session:historical").value.date,
        "2026-10-28",
      );
      const forged = fixture({ directory, second: [previous] }),
        before = storeSnapshot(forged);
      await assert.rejects(
        forged.commit("second", historical, {
          previous,
          classEdit: directory,
          restore: new Map([["session:historical", previous]]),
        }),
        scheduleFailure,
      );
      assert.equal(storeSnapshot(forged), before);
    },
  );
}

test("a combined schedule and session write validates against the new effective schedule atomically", async () => {
  const f = fixture({ directory: true }),
    schedule = {
      "4-0-all": {
        schoolId: "school",
        classId: "classroom",
        lessonId: "lesson",
      },
    };
  await f.commit("second", session("new", { date: "2026-10-28" }), {
    metaEdit: { masterSchedule: schedule },
  });
  assert.equal(
    f.stores.records.get("second|session:new").value.date,
    "2026-10-28",
  );
  for (const id of ["first", "second"])
    assert.deepEqual(
      f.stores.records.get(id + "|meta").value.masterSchedule,
      schedule,
    );
});

test("a combined schedule change cannot authorize a session using only the old schedule", async () => {
  const f = fixture({ directory: true }),
    before = storeSnapshot(f),
    schedule = {
      "4-0-all": {
        schoolId: "school",
        classId: "classroom",
        lessonId: "lesson",
      },
    };
  await assert.rejects(
    f.commit("second", session("new"), {
      metaEdit: { masterSchedule: schedule },
    }),
    scheduleFailure,
  );
  assert.equal(storeSnapshot(f), before);
});
