"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({ structuredClone });
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/domain/academic-year-directory.js"),
    "utf8",
  ),
  context,
);
const directory = context.EduAcademicYearDirectory,
  plain = (v) => JSON.parse(JSON.stringify(v)),
  clone = structuredClone;
const student = (id, name = id, code = id) => ({ id, name, code });
function classroom() {
  return {
    id: "class",
    name: "شبکه",
    students: [student("a"), student("b")],
    archivedStudents: [student("old")],
    lessons: [
      {
        id: "lesson",
        name: "کارگاه",
        kardaneshScores: { a: { practical: 16, theory: 12 } },
        poudmans: [
          {
            id: "pod",
            podScores: { a: { m: 4, c: 2 } },
            units: [{ id: "unit", unitScores: { a: { m: 15 } } }],
          },
        ],
      },
    ],
  };
}
const layout = () => [
  { id: "school", name: "مدرسه", classes: ["class", "second"] },
];
const expectConflict = (action) =>
  assert.throws(
    action,
    (error) => error.code === "ACADEMIC_DIRECTORY_CONFLICT",
  );

test("directory ignores term grades and definitions when detecting shared changes", () => {
  const old = classroom(),
    next = clone(old);
  next.lessons[0].name = "تعریف مستقل";
  next.lessons[0].kardaneshScores.a.practical = 20;
  assert.equal(directory.hasChanges(old, next), false);
});
test("directory detects name, enrollment, identity and roster order edits", () => {
  for (const edit of [
    (c) => (c.name = "جدید"),
    (c) => c.students.push(student("new")),
    (c) => (c.students[0].name = "اصلاح"),
    (c) => c.students.reverse(),
  ]) {
    const old = classroom(),
      next = clone(old);
    edit(next);
    assert.equal(directory.hasChanges(old, next), true);
  }
});
test("missing optional code equals empty optional code", () => {
  const old = classroom(),
    next = clone(old);
  delete old.students[0].code;
  next.students[0].code = "";
  assert.equal(directory.hasChanges(old, next), false);
});
test("mirroring rename preserves companion course definitions and every term score", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.name = "شبکه جدید";
  target.lessons[0].name = "نوبت دوم";
  target.lessons[0].kardaneshScores.a.practical = 8;
  const original = clone(target),
    value = directory.mirrorClass(old, next, target);
  assert.equal(value.name, next.name);
  assert.deepEqual(plain(value.lessons), target.lessons);
  assert.deepEqual(target, original);
  assert.equal(old.name, "شبکه");
});
test("student identity updates are shared without changing grades or historical snapshots", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.students[0].name = "سعید پیرزاد";
  next.students[0].code = "1";
  const value = directory.mirrorClass(old, next, target);
  assert.deepEqual(plain(value.students[0]), next.students[0]);
  assert.deepEqual(plain(value.lessons), target.lessons);
});
test("changed identity conflict prevents silently overwriting another term", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.students[0].name = "نام تازه";
  target.students[0].name = "شخص دیگر";
  expectConflict(() => directory.mirrorClass(old, next, target));
});
test("unchanged target-only identity edits survive unrelated source edits", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.students[0].name = "الف جدید";
  target.students[1].name = "ب مستقل";
  assert.equal(
    directory.mirrorClass(old, next, target).students[1].name,
    "ب مستقل",
  );
});
test("repeating a synchronized identity edit is idempotent", () => {
  const old = classroom(),
    next = clone(old);
  next.students[0].name = "اصلاح";
  const first = directory.mirrorClass(old, next, old),
    second = directory.mirrorClass(old, next, first);
  assert.deepEqual(plain(second), plain(first));
});
test("new roster members append in file order without importing term scores", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.students.push(student("c", "ج", "3"), student("d", "د", "4"));
  const value = directory.mirrorClass(old, next, target);
  assert.deepEqual(plain(value.students.map((s) => s.id)), [
    "a",
    "b",
    "c",
    "d",
  ]);
  assert.deepEqual(plain(value.lessons), target.lessons);
});
test("archive and restore keep stable student ids and independent grades", () => {
  const old = classroom(),
    next = clone(old);
  next.archivedStudents.push(next.students.shift());
  const archived = directory.mirrorClass(old, next, old);
  assert.deepEqual(plain(archived.students.map((s) => s.id)), ["b"]);
  assert.equal(
    archived.archivedStudents.some((s) => s.id === "a"),
    true,
  );
  const restored = directory.mirrorClass(next, old, archived);
  assert.deepEqual(plain(restored.students), old.students);
  assert.deepEqual(plain(restored.lessons), old.lessons);
});
test("physical enrollment removal fails before either term can diverge", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.students.shift();
  expectConflict(() => directory.mirrorClass(old, next, target));
  assert.deepEqual(target, old);
  assert.equal(next.students.length, 1);
});

test("source edits cannot merge a new student into an unrelated same-code identity", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.students.push(student("incoming", "ورودی", "3"));
  target.students.push(student("different", "مستقل", "3"));
  expectConflict(() => directory.mirrorClass(old, next, target));
});
test("source additions reject reused stable ids with a different identity or membership", () => {
  const old = classroom(),
    next = clone(old),
    target = clone(old);
  next.students.push(student("new"));
  target.archivedStudents.push(student("new", "دیگر"));
  expectConflict(() => directory.mirrorClass(old, next, target));
});
test("source reorder is shared but unexpected target reorder produces conflict", () => {
  const old = classroom();
  old.students.push(student("c"));
  const next = clone(old);
  next.students.reverse();
  assert.deepEqual(
    plain(directory.mirrorClass(old, next, old).students.map((s) => s.id)),
    ["c", "b", "a"],
  );
  const target = clone(old);
  target.students = [
    target.students[1],
    target.students[0],
    target.students[2],
  ];
  expectConflict(() => directory.mirrorClass(old, next, target));
});
test("new class skeleton keeps lesson definitions and strips all grade maps", () => {
  const current = classroom(),
    original = clone(current),
    value = directory.skeleton(current),
    lesson = value.lessons[0];
  assert.deepEqual(plain(lesson.kardaneshScores), {});
  assert.deepEqual(plain(lesson.poudmans[0].podScores), {});
  assert.deepEqual(plain(lesson.poudmans[0].units[0].unitScores), {});
  assert.equal(lesson.name, current.lessons[0].name);
  assert.deepEqual(current, original);
});
test("missing companion classes are created without term grade leakage", () => {
  const old = classroom(),
    next = clone(old);
  next.name = "تازه";
  const value = directory.mirrorClass(old, next, null);
  assert.equal(value.name, "تازه");
  assert.deepEqual(plain(value.lessons[0].kardaneshScores), {});
});
test("same class codes can repeat across separate classes without merging identities", () => {
  const first = classroom(),
    second = classroom();
  second.id = "other";
  second.students[0].code = first.students[0].code;
  assert.equal(directory.hasChanges(first, clone(first)), false);
  assert.equal(directory.hasChanges(second, clone(second)), false);
});
test("layout propagates names, school additions and classes preserving unrelated schools", () => {
  const old = layout(),
    next = clone(old),
    target = [
      ...clone(old),
      { id: "unrelated", name: "مستقل", classes: ["extra"] },
    ];
  next[0].name = "جدید";
  next[0].classes.push("third");
  next.push({ id: "new", name: "تازه", classes: ["fourth"] });
  const value = directory.mirrorLayout(old, next, target);
  assert.equal(value[0].name, "جدید");
  assert.deepEqual(plain(value[0].classes), ["class", "second", "third"]);
  assert.deepEqual(plain(value.map((s) => s.id)), [
    "school",
    "new",
    "unrelated",
  ]);
  assert.deepEqual(plain(target[0]), old[0]);
});
test("layout applies explicit removals while keeping unrelated target classes", () => {
  const old = layout(),
    next = clone(old),
    target = clone(old);
  next[0].classes.pop();
  target[0].classes.push("extra");
  assert.deepEqual(
    plain(directory.mirrorLayout(old, next, target)[0].classes),
    ["class", "extra"],
  );
});
test("layout rejects changed school identities or ambiguous class owners", () => {
  const old = layout(),
    next = clone(old),
    target = clone(old);
  next[0].name = "تازه";
  target[0].name = "دیگر";
  expectConflict(() => directory.mirrorLayout(old, next, target));
  expectConflict(() =>
    directory.mirrorLayout(
      [],
      [{ id: "new", name: "نو", classes: ["class"] }],
      old,
    ),
  );
});
test("layout handles explicit class moves without duplicate owners", () => {
  const old = [...layout(), { id: "other", name: "دوم", classes: [] }],
    next = clone(old);
  next[0].classes.shift();
  next[1].classes.push("class");
  assert.deepEqual(plain(directory.mirrorLayout(old, next, old)), next);
});
test("deleting school fails if companion has extra unacknowledged classes", () => {
  const old = layout(),
    target = clone(old);
  target[0].classes.push("extra");
  expectConflict(() => directory.mirrorLayout(old, [], target));
});
test("duplicate ids, unsafe ids and duplicate enrollment fail closed", () => {
  const old = classroom(),
    next = clone(old);
  next.students.push(clone(next.students[0]));
  expectConflict(() => directory.hasChanges(old, next));
  const unsafe = classroom();
  unsafe.id = "__proto__";
  expectConflict(() => directory.projection(unsafe));
  expectConflict(() =>
    directory.layoutHasChanges(
      [],
      [{ id: "school", name: "x", classes: ["same", "same"] }],
    ),
  );
});
test("class deletion protection recognizes every grade family and zero grades", () => {
  const target = classroom();
  assert.equal(directory.classHasHistory(target), true);
  expectConflict(() => directory.assertClassRemovable(target));
  const empty = directory.skeleton(target);
  assert.equal(directory.assertClassRemovable(empty), true);
  assert.equal(directory.classHasHistory(empty, [{ classId: "class" }]), true);
  for (const record of ["dual", "module", "unit"]) {
    const value = directory.skeleton(target);
    if (record === "dual")
      value.lessons[0].kardaneshScores.a = { practical: 0 };
    if (record === "module")
      value.lessons[0].poudmans[0].podScores.a = { m: 0 };
    if (record === "unit")
      value.lessons[0].poudmans[0].units[0].unitScores.a = { m: 0 };
    assert.equal(directory.classHasHistory(value), true);
  }
});
test("legacy reconciliation unions additive ids and combines compatible partial file order", () => {
  const a = classroom(),
    b = clone(a);
  a.students = [student("a"), student("c")];
  b.students = [student("a"), student("b"), student("c")];
  b.lessons[0].kardaneshScores.a.practical = 9;
  const result = directory.reconcileClass([a, b]);
  assert.deepEqual(plain(result.students.map((s) => s.id)), ["a", "b", "c"]);
  assert.deepEqual(plain(result.lessons), a.lessons);
  assert.equal(a.students.length, 2);
});
test("legacy reconciliation never matches same-name or same-code identities", () => {
  const a = classroom(),
    b = clone(a);
  a.students = [student("id-one", "مشترک", "1")];
  b.students = [student("id-two", "مشترک", "1")];
  expectConflict(() => directory.reconcileClass([a, b]));
});
test("legacy reconciliation refuses identity, membership, class-name or order disagreement", () => {
  const a = classroom();
  for (const edit of [
    (b) => (b.students[0].name = "دیگر"),
    (b) => b.archivedStudents.push(b.students.shift()),
    (b) => (b.name = "دیگر"),
    (b) => b.students.reverse(),
  ]) {
    const b = clone(a);
    edit(b);
    expectConflict(() => directory.reconcileClass([a, b]));
  }
});
test("legacy layout reconciliation unions missing schools/classes in compatible order", () => {
  const a = [{ id: "school", name: "مدرسه", classes: ["class", "third"] }],
    b = [
      { id: "school", name: "مدرسه", classes: ["class", "second", "third"] },
      { id: "new", name: "تازه", classes: [] },
    ];
  const result = directory.reconcileLayouts([a, b]);
  assert.deepEqual(plain(result[0].classes), ["class", "second", "third"]);
  assert.equal(result[1].id, "new");
});
test("legacy layout reconciliation refuses school identity, ownership and order disagreement", () => {
  const a = layout();
  expectConflict(() =>
    directory.reconcileLayouts([a, [{ ...a[0], name: "دیگر" }]]),
  );
  expectConflict(() =>
    directory.reconcileLayouts([
      a,
      [{ id: "other", name: "دیگر", classes: ["class"] }],
    ]),
  );
  expectConflict(() =>
    directory.reconcileLayouts([
      a,
      [{ ...a[0], classes: ["second", "class"] }],
    ]),
  );
});
test("reconciliation accepts identical data and is idempotent", () => {
  const a = classroom(),
    first = directory.reconcileClass([a, clone(a)]);
  assert.deepEqual(plain(first), a);
  assert.deepEqual(plain(directory.reconcileClass([first, a])), a);
  const l = layout();
  assert.deepEqual(plain(directory.reconcileLayouts([l, clone(l)])), l);
});

test("Persian reconciliation errors never contain replacement question strings", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/domain/academic-year-directory.js"),
    "utf8",
  );
  assert.equal(/\?{3,}/.test(source), false);
  assert.equal(source.includes("ترتیب ثبت فهرست‌های قدیمی سال"), true);
  const first = classroom(),
    second = clone(first);
  second.students[0].name = "متفاوت";
  assert.throws(
    () => directory.reconcileClass([first, second]),
    (error) =>
      error.code === "ACADEMIC_DIRECTORY_CONFLICT" &&
      error.message.includes("مشخصات یا عضویت هنرجوی"),
  );
});
function synchronizationFixture() {
  const c = vm.createContext({
    structuredClone,
    clone: structuredClone,
    connectionRetired: false,
  });
  for (const source of [
    "domain/academic-year-directory.js",
    "data/workspace-records.js",
    "legacy/students/roster.js",
    "workspace/periods/shared-directory.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
      c,
    );
  const codec = c.EduWorkspaceRecords.create({
    clone: structuredClone,
    normalizeDB: (v) => v,
    isDataObject: (v) =>
      v !== null && typeof v === "object" && !Array.isArray(v),
    isSafeRecordId: (v) => /^[A-Za-z0-9_-]+$/.test(v),
  });
  c.decodeWorkspaceRecords = codec.decodeWorkspaceRecords;
  const state = {
      catalog: new Map(),
      records: new Map(),
      undo: new Map(),
      events: [],
      reports: [{ id: "frozen", result: "unchanged" }],
    },
    reads = [],
    transactions = [],
    hooks = {
      beforeWrite: null,
      afterRead: null,
      failPut: 0,
      failTransaction: false,
    };
  let inCallback = false;
  c.connection = {
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
          reject(Error("aborted"));
        },
        objectStore(name) {
          assert.ok(names.includes(name));
          return {
            getAll() {
              assert.equal(
                name,
                "catalog",
                "no full records-store scan is permitted",
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
            bounded(id) {
              assert.equal(inCallback, true);
              reads.push(id);
              return [...snapshot.records.values()].filter(
                (row) => row.workspace === id,
              );
            },
            put(value) {
              assert.equal(inCallback, true);
              if (++puts === hooks.failPut) throw Error("quota failure");
              const valueCopy = structuredClone(value);
              pending.push(() =>
                state[name].set(valueCopy.key || valueCopy.id, valueCopy),
              );
            },
            add(value) {
              assert.equal(inCallback, true);
              const valueCopy = structuredClone(value);
              pending.push(() => state.events.push(valueCopy));
            },
            delete(id) {
              assert.equal(inCallback, true);
              pending.push(() => state[name].delete(id));
            },
          };
        },
      };
      return tx;
    },
  };
  c.transactionDone = (tx) => tx.done;
  c.requestPromise = async (value) => value;
  c.workspaceRecordRequest = (store, id) => store.bounded(id);
  const save = (id, data, extra = {}) => {
    state.catalog.set(id, {
      id,
      year: "1405-1406",
      term: id,
      revision: 2,
      closed: id === "first",
      ...extra,
    });
    state.undo.set(id, { id });
    for (const [logical, value] of codec.collectRecords(data))
      state.records.set(id + "|" + logical, {
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      });
  };
  const data = (classes = [classroom()], sessions = []) => ({
    settings: { academicYear: "1405-1406" },
    schools: [{ id: "school", name: "مدرسه", classes }],
    sessions,
  });
  const value = (id, logical = "class:class") =>
    state.records.get(id + "|" + logical)?.value;
  return { c, state, hooks, reads, transactions, save, data, value };
}

test("year reconciliation shares additive rosters atomically and preserves raw term grades and closed reports", async () => {
  const f = synchronizationFixture(),
    first = classroom(),
    second = classroom();
  second.students.push(student("c"));
  second.lessons[0].kardaneshScores.a.practical = 9;
  f.save("first", f.data([first]));
  f.save("second", f.data([second]));
  const grades = [
      JSON.stringify(first.lessons),
      JSON.stringify(second.lessons),
    ],
    reports = clone(f.state.reports);
  const result = await f.c.synchronizeAcademicDirectoryForRead("second");
  assert.equal(result.changed.length, 1);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(f.reads, ["first", "second"]);
  assert.deepEqual(plain(f.value("first").students), second.students);
  assert.equal(JSON.stringify(f.value("first").lessons), grades[0]);
  assert.equal(JSON.stringify(f.value("second").lessons), grades[1]);
  assert.equal(f.state.catalog.get("first").closed, true);
  assert.deepEqual(f.state.reports, reports);
  assert.equal(f.state.undo.has("first"), false);
  assert.equal(f.state.undo.has("second"), true);
});
test("year reconciliation freezes old sessions before adding shared roster members", async () => {
  const f = synchronizationFixture(),
    first = classroom(),
    second = classroom();
  second.students.push(student("c"));
  f.save(
    "first",
    f.data(
      [first],
      [
        {
          id: "session",
          classId: "class",
          attendance: { a: "present" },
          scores: [],
        },
      ],
    ),
  );
  f.save("second", f.data([second]));
  await f.c.synchronizeAcademicDirectoryForRead("first");
  assert.deepEqual(
    plain(f.value("first", "session:session").roster.map((st) => st.id)),
    ["a"],
  );
  assert.equal(f.value("first").students.length, 3);
});
test("year reconciliation creates missing class skeletons and covers third term while isolating other years", async () => {
  const f = synchronizationFixture(),
    extra = classroom();
  extra.id = "extra";
  f.save("first", f.data());
  f.save("second", f.data([classroom(), extra]));
  f.save("third", f.data());
  f.save("other", f.data(), { year: "1406-1407" });
  const other = JSON.stringify(f.value("other"));
  const result = await f.c.synchronizeAcademicDirectoryForRead("third");
  assert.equal(result.changed.length, 2);
  assert.deepEqual(f.reads, ["first", "second", "third"]);
  assert.deepEqual(
    plain(f.value("first", "class:extra").lessons[0].kardaneshScores),
    {},
  );
  assert.equal(
    f.value("third", "meta").layout[0].classes.includes("extra"),
    true,
  );
  assert.equal(JSON.stringify(f.value("other")), other);
});
test("a year identity conflict leaves all classes, revisions, undo, grades and reports untouched", async () => {
  const f = synchronizationFixture(),
    second = classroom();
  second.students[0].name = "تعارض";
  f.save("first", f.data());
  f.save("second", f.data([second]));
  const before = clone(f.state);
  const result = await f.c.synchronizeAcademicDirectoryForRead("second");
  assert.equal(result.changed.length, 0);
  assert.equal(result.conflicts[0].code, "ACADEMIC_DIRECTORY_CONFLICT");
  assert.deepEqual(clone(f.state), before);
  assert.equal(
    f.transactions.some((tx) => tx.mode === "readwrite"),
    false,
  );
});
test("year reconciliation refuses a concurrent revision change without committing staged writes", async () => {
  const f = synchronizationFixture(),
    second = classroom();
  second.students.push(student("c"));
  f.save("first", f.data());
  f.save("second", f.data([second]));
  const before = clone(f.state.records);
  f.hooks.beforeWrite = () => {
    f.state.catalog.get("first").revision++;
  };
  await assert.rejects(
    f.c.synchronizeAcademicDirectoryForRead("second"),
    /پنجرهٔ دیگری/,
  );
  assert.deepEqual(clone(f.state.records), before);
  assert.equal(f.state.events.length, 0);
  assert.equal(f.state.undo.size, 2);
});
test("year reconciliation rolls back every record if an atomic write fails", async () => {
  for (const failure of ["quota", "async"]) {
    const f = synchronizationFixture(),
      second = classroom();
    second.students.push(student("c"));
    f.save("first", f.data());
    f.save("second", f.data([second]));
    const before = clone(f.state);
    if (failure === "quota") f.hooks.failPut = 2;
    else f.hooks.failTransaction = true;
    await assert.rejects(f.c.synchronizeAcademicDirectoryForRead("second"));
    assert.deepEqual(clone(f.state), before);
  }
});
test("year reconciliation refuses connection retirement and repeated migration makes no writes", async () => {
  const f = synchronizationFixture();
  f.save("first", f.data());
  f.save("second", f.data());
  const first = await f.c.synchronizeAcademicDirectoryForRead("first");
  assert.equal(first.changed.length, 0);
  assert.equal(
    f.transactions.some((tx) => tx.mode === "readwrite"),
    false,
  );
  f.hooks.afterRead = () => {
    f.c.connectionRetired = true;
  };
  await assert.rejects(
    f.c.synchronizeAcademicDirectoryForRead("second"),
    /اتصال بانک/,
  );
});

test("verified history-free undo may physically remove a shared new identity", () => {
  const old = classroom(),
    next = clone(old);
  next.students.shift();
  const value = directory.mirrorClass(old, next, old, { allowRemoval: true });
  assert.equal(
    value.students.some((s) => s.id === "a"),
    false,
  );
  assert.equal(
    value.archivedStudents.some((s) => s.id === "a"),
    false,
  );
  assert.deepEqual(plain(value.lessons), old.lessons);
});
