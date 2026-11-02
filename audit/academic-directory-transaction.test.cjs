"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const clone = structuredClone,
  plain = (value) => JSON.parse(JSON.stringify(value));
function classroom({ empty = false, competency = 2 } = {}) {
  return {
    id: "class",
    name: "شبکه",
    students: [
      { id: "a", name: "سعید", code: "1" },
      { id: "b", name: "رضا", code: "2" },
    ],
    archivedStudents: [],
    lessons: [
      {
        id: "lesson",
        name: "کارگاه",
        gradeMode: "standard",
        gradingPolicy: {
          method: "modular",
          version: 1,
          mostamarMax: 5,
          competencyFactor: 5,
          competencyMin: 2,
          moduleMin: 12,
          continuousStep: 0.5,
        },
        kardaneshScores: {},
        poudmans: [
          {
            id: "module",
            name: "پودمان",
            podScores: empty ? {} : { a: { m: 4, c: competency } },
            units: [{ id: "unit", unitScores: {} }],
          },
        ],
      },
    ],
  };
}
function fixture({
  duplicateFirst = false,
  emptyGrades = false,
  legacySession = false,
  failCompanionWrite = false,
  recoveredStudent = false,
} = {}) {
  const c = vm.createContext({
    structuredClone,
    Map,
    IDBKeyRange: { bound: (lower, upper) => ({ lower, upper }) },
  });
  for (const source of [
    "domain/academic-year-directory.js",
    "domain/annual-modules.js",
    "domain/history-changes.js",
    "data/commit-plan.js",
    "data/workspace-records.js",
    "legacy/students/roster.js",
    "data/academic-directory-transaction.js",
    "data/record-transaction.js",
    "validation/undo.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
      c,
    );
  const normalizeDB = (data) => {
    const classes = new Map(
      data.schools.flatMap((school) =>
        school.classes.map((cls) => [cls.id, cls]),
      ),
    );
    for (const session of data.sessions) {
      const cls = classes.get(session.classId);
      assert.ok(cls, "session class exists");
      if (!session.roster) session.roster = c.historicalRoster(cls, session);
      const known = new Set(
        [...cls.students, ...cls.archivedStudents].map((student) => student.id),
      );
      for (const member of session.roster)
        if (!known.has(member.id))
          throw Error("Unknown historical roster member");
    }
    return data;
  };
  const codec = c.EduWorkspaceRecords.create({
    clone,
    normalizeDB,
    isDataObject: (value) =>
      value !== null && typeof value === "object" && !Array.isArray(value),
    isSafeRecordId: (value) => /^[A-Za-z0-9_-]+$/.test(value),
  });
  const stores = {
      catalog: new Map(),
      records: new Map(),
      undo: new Map(),
      events: new Map(),
    },
    reads = [],
    writes = [];
  const save = (id, term, termKind, extra = {}) => {
    const period = {
        id,
        year: "1405-1406",
        term,
        termKind,
        revision: id === "first" ? 2 : 3,
        closed: id !== "first",
        ...extra,
      },
      cls = classroom({ empty: emptyGrades });
    if (recoveredStudent)
      Object.assign(cls.students[0], {
        name: "دانش‌آموز بازیابی‌شده (a)",
        recovered: true,
      });
    stores.catalog.set(id, period);
    stores.undo.set(id, { id, action: "before" });
    const data = {
      settings: { academicYear: period.year, academicTerm: period.term },
      schools: [{ id: "school", name: "مدرسه", classes: [cls] }],
      sessions:
        legacySession && id === "first"
          ? [
              {
                id: "session",
                schoolId: "school",
                classId: "class",
                lessonId: "lesson",
                attendance: {},
                scores: [],
              },
            ]
          : [],
    };
    if (recoveredStudent) {
      data.migrationWarnings = [
        "نام دانش‌آموز a در شبکه نیازمند بررسی است.",
        "نام دانش‌آموز ab در شبکه نیازمند بررسی است.",
        "هشدار مستقل برای a حفظ شود.",
      ];
      data.sessions.push({
        id: "recovered-session",
        schoolId: "school",
        classId: "class",
        lessonId: "lesson",
        date: "2026-10-31",
        period: 0,
        attendance: { a: "absent", b: "present" },
        scores: [],
        roster: [
          clone(cls.students[0]),
          { ...clone(cls.students[1]), name: "نام تاریخی واقعی" },
        ],
      });
      data.sessions.push({
        ...clone(data.sessions[data.sessions.length - 1]),
        id: "genuine-history",
        period: 1,
        roster: [
          {
            ...clone(cls.students[0]),
            name: "نام واقعی قبلی همین هنرجو",
            recovered: false,
          },
        ],
        attendance: { a: "absent" },
      });
    }
    for (const [logical, value] of codec.collectRecords(data))
      stores.records.set(id + "|" + logical, {
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      });
  };
  save("first", "اول", "first");
  save("second", "دوم", "second");
  if (duplicateFirst) save("recovered", "اول — بازیابی 1", "first");
  save("other-year", "اول", "first", { year: "1406-1407" });
  let done;
  const connection = {
    transaction(names, mode) {
      assert.equal(mode, "readwrite");
      names = Array.from(names);
      assert.deepEqual(names, ["records", "catalog", "events", "undo"]);
      const staged = clone(stores);
      let resolve,
        reject,
        pending = 0,
        aborted = false,
        eventId = 0;
      done = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const queue = (name, range) => {
        if (name === "records")
          assert.ok(
            range?.lower && range?.upper,
            "record reads must use a bounded workspace prefix",
          );
        reads.push({ name, range });
        const request = {};
        pending++;
        queueMicrotask(() => {
          if (aborted) return;
          try {
            request.result = [...staged[name].values()]
              .filter(
                (value) =>
                  !range ||
                  (value.key >= range.lower && value.key < range.upper),
              )
              .map((value) => clone(value));
            request.onsuccess?.();
          } catch (error) {
            aborted = true;
            reject(error);
          }
          pending--;
          if (!pending && !aborted) {
            for (const name of Object.keys(stores)) {
              stores[name].clear();
              for (const [key, value] of staged[name])
                stores[name].set(key, value);
            }
            resolve();
          }
        });
        return request;
      };
      return {
        abort() {
          aborted = true;
          reject(Error("aborted"));
        },
        objectStore(name) {
          assert.ok(names.includes(name));
          return {
            getAll: (range) => queue(name, range),
            put(value) {
              if (
                failCompanionWrite &&
                (value.workspace === "second" || value.id === "second")
              )
                throw Error("companion quota failure");
              writes.push({ name, operation: "put", value: clone(value) });
              staged[name].set(
                name === "records" ? value.key : value.id,
                clone(value),
              );
            },
            add(value) {
              writes.push({ name, operation: "add", value: clone(value) });
              staged[name].set(++eventId, clone(value));
            },
            delete(key) {
              writes.push({ name, operation: "delete", key });
              staged[name].delete(key);
            },
          };
        },
      };
    },
  };
  c.EduDataStoreRuntime = { transactionDone: () => done };
  const old = stores.records.get("first|class:class").value,
    current = clone(old),
    meta = clone(stores.records.get("first|meta").value);
  const args = {
    connection,
    workspace: clone(stores.catalog.get("first")),
    records: new Map([
      ["meta", meta],
      ["class:class", current],
    ]),
    changed: [["class:class", JSON.stringify(current)]],
    removed: [],
    before: [{ key: "class:class", value: clone(old) }],
    changes: [],
    action: "ویرایش پرونده",
    keepUndo: true,
    normalizedName: String,
    academicTermKind: (term) => ({ اول: "first", دوم: "second" })[term] || null,
    annualChanged: [],
    directorySourceUpdates: [],
    decodeRecords: codec.decodeWorkspaceRecords,
    historicalRoster: c.historicalRoster,
  };
  const commit = () => {
    for (const entry of args.changed)
      entry[1] = JSON.stringify(args.records.get(entry[0]));
    return c.EduRecordTransaction.commit(args);
  };
  const value = (id, logical = "class:class") =>
    stores.records.get(id + "|" + logical)?.value;
  return { c, stores, reads, writes, args, old, current, commit, value };
}

function repairRecoveredStudent(f) {
  const session = clone(f.value("first", "session:recovered-session"));
  f.c.db = {
    schools: [{ classes: [f.current] }],
    sessions: [session],
    migrationWarnings: clone(f.value("first", "meta").migrationWarnings),
  };
  f.c.knownStudents = (cls) => [
    ...cls.students,
    ...(cls.archivedStudents || []),
  ];
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/students/editor.js"),
      "utf8",
    ),
    f.c,
  );
  f.c.applyStudentIdentity(f.current, f.current.students[0], {
    name: "نام اصلاح‌شده",
    code: "1",
  });
  f.args.records.get("meta").migrationWarnings = f.c.db.migrationWarnings;
  f.args.records.set("session:recovered-session", session);
  f.args.changed.push(
    ["meta", JSON.stringify(f.args.records.get("meta"))],
    ["session:recovered-session", JSON.stringify(session)],
  );
}

function undoRecoveredStudent(f, saved = null) {
  const undo = saved || JSON.parse(JSON.stringify(f.stores.undo.get("first"))),
    records = new Map(
      [...f.stores.records.values()]
        .filter((row) => row.workspace === "first")
        .map((row) => [row.logical, clone(row.value)]),
    ),
    period = clone(f.stores.catalog.get("first")),
    candidate = f.c.EduUndoValidator.validate(undo, records, period, {
      assertSafeDataTree() {},
      isDataObject: (value) =>
        value !== null && typeof value === "object" && !Array.isArray(value),
      isSafeRecordId: (value) =>
        typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value),
      clone,
      logicalRecordType: (key) => {
        if (key !== "meta" && !/^(class|session):[A-Za-z0-9_-]+$/.test(key))
          throw Error("invalid key");
      },
      validateLogicalValue: (key, value) => {
        if (key !== "meta" && key.split(":")[1] !== value?.id)
          throw Error("invalid record");
      },
      decodeWorkspaceRecords: f.args.decodeRecords,
    }),
    plan = f.c.EduRecordCommitPlan.create(
      candidate,
      new Map([...records].map(([key, value]) => [key, JSON.stringify(value)])),
      { replace: true },
    );
  Object.assign(f.args, plan, {
    records: candidate,
    workspace: period,
    keepUndo: false,
    recoveredUndo: undo.recoveredPeers,
    annualChanged: [],
    directorySourceUpdates: [],
  });
  return f.commit();
}

test("recovered-name repair reaches historical placeholders in closed peer terms and their reports only", async () => {
  const f = fixture({ recoveredStudent: true }),
    otherYear = clone(f.value("other-year", "session:recovered-session")),
    genuineHistory = clone(f.value("second", "session:genuine-history")),
    grades = ["first", "second"].map((id) =>
      JSON.stringify(f.value(id).lessons),
    );
  repairRecoveredStudent(f);
  await f.commit();
  for (const [index, id] of ["first", "second"].entries()) {
    const student = f.value(id).students[0],
      session = f.value(id, "session:recovered-session");
    assert.equal(student.name, "نام اصلاح‌شده");
    assert.equal(student.recovered, false);
    assert.equal(session.roster[0].name, "نام اصلاح‌شده");
    assert.equal(session.roster[0].recovered, false);
    assert.equal(session.roster[1].name, "نام تاریخی واقعی");
    assert.equal(JSON.stringify(f.value(id).lessons), grades[index]);
    assert.deepEqual(plain(f.value(id, "meta").migrationWarnings), [
      "نام دانش‌آموز ab در شبکه نیازمند بررسی است.",
      "هشدار مستقل برای a حفظ شود.",
    ]);
  }
  assert.equal(f.stores.catalog.get("second").closed, true);
  assert.deepEqual(
    clone(f.value("second", "session:genuine-history")),
    genuineHistory,
  );
  assert.deepEqual(
    clone(f.value("other-year", "session:recovered-session")),
    otherYear,
  );
  const report = vm.createContext({});
  for (const file of [
    "calendar.js",
    "academic-year.js",
    "reporting/attendance.js",
    "reporting/date-ranges.js",
    "reporting/periodic-model.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/domain", file), "utf8"),
      report,
    );
  report.root = report;
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/reports/periodic/model.js"),
      "utf8",
    ),
    report,
  );
  const model = report.build(
    {
      settings: f.value("second", "meta").settings,
      schools: [{ id: "school", name: "مدرسه", classes: [f.value("second")] }],
      sessions: [f.value("second", "session:recovered-session")],
    },
    {
      mode: "daily",
      date: "2026-10-31",
      schoolId: "school",
      audience: "management",
    },
  );
  assert.equal(model.sessions[0].participants[0].name, "نام اصلاح‌شده");
});

test("a failed shared recovered-name repair preserves every term, placeholder and warning", async () => {
  const f = fixture({ recoveredStudent: true, failCompanionWrite: true }),
    before = clone(f.stores);
  repairRecoveredStudent(f);
  await assert.rejects(f.commit(), /quota/);
  assert.deepEqual(clone(f.stores), before);
  assert.deepEqual(f.args.annualChanged, []);
  assert.deepEqual(f.args.directorySourceUpdates, []);
});

test("serialized undo restores shared placeholder rosters and warnings exactly without touching peer grades or settings", async () => {
  const f = fixture({ recoveredStudent: true });
  f.value("second", "meta").masterSchedule = {
    independent: { classId: "class" },
  };
  const before = clone(f.stores.records);
  repairRecoveredStudent(f);
  await f.commit();
  const saved = JSON.parse(JSON.stringify(f.stores.undo.get("first")));
  assert.equal(saved.recoveredPeers[0].id, "second");
  assert.equal(saved.recoveredPeers[0].revision, 4);
  assert.equal(saved.recoveredPeers[0].rosters.length, 1);
  await undoRecoveredStudent(f, saved);
  assert.deepEqual(clone(f.stores.records), before);
  assert.equal(f.stores.catalog.get("first").revision, 4);
  assert.equal(f.stores.catalog.get("second").revision, 5);
  assert.equal(f.stores.undo.has("first"), false);
});

test("any newer peer revision blocks recovered-name undo without changing records, events or revisions", async () => {
  const f = fixture({ recoveredStudent: true });
  repairRecoveredStudent(f);
  await f.commit();
  f.stores.catalog.get("second").revision++;
  f.value("second", "session:recovered-session").attendance.b = "leave";
  const before = clone(f.stores);
  await assert.rejects(
    () => undoRecoveredStudent(f),
    (error) => error.code === "WORKSPACE_CONFLICT",
  );
  assert.deepEqual(clone(f.stores), before);
});

for (const historical of ["different-placeholder", "missing-roster"]) {
  test(`shared recovery undo exactly restores a peer's ${historical}`, async () => {
    const f = fixture({ recoveredStudent: true }),
      session = f.value("second", "session:recovered-session");
    if (historical === "missing-roster") delete session.roster;
    else session.roster[0].name = "نام موقت بازیابی قدیمی متفاوت";
    const before = clone(f.stores.records);
    repairRecoveredStudent(f);
    await f.commit();
    await undoRecoveredStudent(f);
    assert.deepEqual(clone(f.stores.records), before);
  });
}

for (const tamper of [
  "roster-name",
  "warnings",
  "foreign-year",
  "scores",
  "settings",
]) {
  test(`shared recovery undo rejects forged ${tamper} markers without writes`, async () => {
    const f = fixture({ recoveredStudent: true });
    repairRecoveredStudent(f);
    await f.commit();
    const undo = JSON.parse(JSON.stringify(f.stores.undo.get("first"))),
      peer = undo.recoveredPeers[0];
    if (tamper === "roster-name")
      peer.rosters[0].before[1].name = "forged genuine historical name";
    if (tamper === "warnings")
      peer.migrationWarnings.push("unrelated forged warning");
    if (tamper === "foreign-year") peer.id = "other-year";
    if (tamper === "scores") peer.rosters[0].scores = [{ value: 0 }];
    if (tamper === "settings") peer.settings = { password: "changed" };
    const before = clone(f.stores);
    await assert.rejects(async () => undoRecoveredStudent(f, undo));
    assert.deepEqual(clone(f.stores), before);
  });
}

test("mixed directory and annual grade edits reject duplicate first-term roles without any partial writes", async () => {
  const f = fixture({ duplicateFirst: true }),
    before = clone(f.stores);
  f.current.students[0].name = "نام جدید";
  f.current.lessons[0].poudmans[0].podScores.a.c = 3;
  await assert.rejects(f.commit(), /تکراری|چند نسخه|مبهم/);
  assert.deepEqual(clone(f.stores), before);
  assert.deepEqual(f.args.annualChanged, []);
  assert.deepEqual(f.args.directorySourceUpdates, []);
});
test("roster-only edits remain permitted for legacy duplicate roles without mirroring term grades", async () => {
  const f = fixture({ duplicateFirst: true });
  f.value("second").lessons[0].poudmans[0].podScores.a.c = 1;
  f.value("recovered").lessons[0].poudmans[0].podScores.a.c = 3;
  const grades = ["first", "second", "recovered"].map((id) =>
    JSON.stringify(f.value(id).lessons),
  );
  f.current.students[0].name = "نام اصلاح‌شده";
  await f.commit();
  for (const [index, id] of ["first", "second", "recovered"].entries()) {
    assert.equal(f.value(id).students[0].name, "نام اصلاح‌شده");
    assert.equal(JSON.stringify(f.value(id).lessons), grades[index]);
  }
  assert.equal(f.args.annualChanged.length, 2);
});
test("physical identity removal is blocked by inferred membership of a legacy blank session", async () => {
  const f = fixture({ emptyGrades: true, legacySession: true }),
    before = clone(f.stores);
  f.current.students.shift();
  await assert.rejects(
    f.commit(),
    (error) =>
      error.code === "ACADEMIC_DIRECTORY_CONFLICT" &&
      /سابقه|بایگانی/.test(error.message),
  );
  assert.deepEqual(clone(f.stores), before);
  assert.deepEqual(f.args.annualChanged, []);
  assert.deepEqual(f.args.directorySourceUpdates, []);
});
test("physical removal without any year history succeeds consistently for all terms", async () => {
  const f = fixture({ emptyGrades: true });
  f.current.students.shift();
  f.args.keepUndo = false;
  await f.commit();
  for (const id of ["first", "second"]) {
    assert.deepEqual(plain(f.value(id).students.map((s) => s.id)), ["b"]);
    assert.equal(f.value(id).archivedStudents.length, 0);
    assert.equal(f.stores.undo.has(id), false);
  }
});
test("legacy roster freezes are published only after commit and recorded in the source undo", async () => {
  const f = fixture({ emptyGrades: true, legacySession: true });
  f.current.students.push({ id: "new", name: "تازه", code: "3" });
  const pending = f.commit();
  assert.deepEqual(f.args.directorySourceUpdates, []);
  await pending;
  assert.deepEqual(
    plain(
      f.value("first", "session:session").roster.map((student) => student.id),
    ),
    ["a", "b"],
  );
  const undo = f.stores.undo.get("first"),
    sessionBefore = undo.before.find((row) => row.key === "session:session");
  assert.equal(Object.hasOwn(sessionBefore.value, "roster"), false);
  assert.equal(
    f.args.changed.some(([key]) => key === "session:session"),
    true,
  );
});
test("a companion write failure rolls back source, peers, events and undo without publishing updates", async () => {
  const f = fixture({
      emptyGrades: true,
      legacySession: true,
      failCompanionWrite: true,
    }),
    before = clone(f.stores);
  f.current.students[0].name = "اصلاح";
  await assert.rejects(f.commit(), /quota/);
  assert.deepEqual(clone(f.stores), before);
  assert.deepEqual(f.args.directorySourceUpdates, []);
  assert.deepEqual(f.args.annualChanged, []);
  assert.equal(f.args.changed.length, 1);
});
test("shared directory commit isolates other years and checks the source revision before reading term records", async () => {
  const f = fixture(),
    other = clone(f.value("other-year"));
  f.current.name = "نام تازه";
  await f.commit();
  assert.deepEqual(clone(f.value("other-year")), other);
  assert.equal(
    f.reads.some((read) => read.range?.lower.startsWith("other-year|")),
    false,
  );
  const stale = fixture();
  stale.current.name = "قدیمی";
  stale.args.workspace.revision--;
  const records = clone(stale.stores.records);
  await assert.rejects(
    stale.commit(),
    (error) => error.code === "WORKSPACE_CONFLICT",
  );
  assert.deepEqual(clone(stale.stores.records), records);
  assert.equal(stale.reads.filter((read) => read.name === "records").length, 0);
});

function prepareClassDeletion(f, { school = false } = {}) {
  const meta = f.args.records.get("meta"),
    oldMeta = clone(f.stores.records.get("first|meta").value);
  if (school) meta.layout = [];
  else meta.layout[0].classes = [];
  f.args.records.delete("class:class");
  f.args.changed = [["meta", JSON.stringify(meta)]];
  f.args.removed = ["class:class"];
  f.args.before = [
    { key: "meta", value: oldMeta },
    { key: "class:class", value: clone(f.old) },
  ];
  f.args.directoryRevisions = [...f.stores.catalog.values()]
    .filter((row) => row.year === f.args.workspace.year)
    .map(({ id, revision, year }) => ({ id, revision, year }));
}

test("shared class and school deletion disables partial undo of independent peer definitions", async () => {
  for (const school of [false, true]) {
    const f = fixture({ emptyGrades: true });
    f.value("second").lessons[0].name = "تعریف مستقل نوبت دوم";
    f.value("second", "meta").masterSchedule = {
      "0-1": { schoolId: "school", classId: "class", lessonId: "lesson" },
    };
    prepareClassDeletion(f, { school });
    await f.commit();
    assert.equal(f.value("first"), undefined);
    assert.equal(f.value("second"), undefined);
    assert.equal(f.stores.undo.has("first"), false);
    assert.equal(f.stores.undo.has("second"), false);
    assert.deepEqual(plain(f.value("second", "meta").masterSchedule), {});
    assert.equal(f.value("other-year").lessons[0].name, "کارگاه");
  }
});
test("single-term class deletion still keeps its exact source undo", async () => {
  const f = fixture({ emptyGrades: true });
  f.stores.catalog.delete("second");
  f.stores.records.delete("second|meta");
  f.stores.records.delete("second|class:class");
  prepareClassDeletion(f);
  await f.commit();
  const undo = f.stores.undo.get("first");
  assert.ok(undo);
  assert.deepEqual(
    plain(undo.before.find((row) => row.key === "class:class").value),
    f.old,
  );
});
test("source undo for shared class addition remains available", async () => {
  const f = fixture({ emptyGrades: true }),
    meta = f.args.records.get("meta"),
    newClass = classroom({ empty: true });
  newClass.id = "new-class";
  newClass.name = "کلاس تازه";
  newClass.lessons[0].id = "new-lesson";
  newClass.lessons[0].poudmans[0].id = "new-module";
  newClass.lessons[0].poudmans[0].units[0].id = "new-unit";
  const oldMeta = clone(f.stores.records.get("first|meta").value);
  meta.layout[0].classes.push(newClass.id);
  f.args.records.set("class:new-class", newClass);
  f.args.changed = [
    ["meta", ""],
    ["class:new-class", ""],
  ];
  f.args.before = [
    { key: "meta", value: oldMeta },
    { key: "class:new-class", value: null },
  ];
  await f.commit();
  assert.ok(f.value("second", "class:new-class"));
  assert.equal(
    f.stores.undo
      .get("first")
      .before.find((row) => row.key === "class:new-class").value,
    null,
  );
});
test("shared deletion checks every term revision against the exact full safety snapshot", async () => {
  const f = fixture({ emptyGrades: true });
  prepareClassDeletion(f);
  f.stores.catalog.get("second").revision++;
  const before = clone(f.stores);
  await assert.rejects(
    f.commit(),
    (error) =>
      error.code === "WORKSPACE_CONFLICT" &&
      /پشتیبان ایمنی/.test(error.message),
  );
  assert.deepEqual(clone(f.stores), before);
  assert.equal(f.reads.filter((row) => row.name === "records").length, 0);
  assert.deepEqual(f.args.directorySourceUpdates, []);
});
test("shared deletion rejects a term added since the full safety snapshot", async () => {
  const f = fixture({ emptyGrades: true });
  prepareClassDeletion(f);
  f.stores.catalog.set("third", {
    ...clone(f.stores.catalog.get("second")),
    id: "third",
    term: "سوم",
    termKind: null,
  });
  const before = clone(f.stores);
  await assert.rejects(
    f.commit(),
    (error) => error.code === "WORKSPACE_CONFLICT",
  );
  assert.deepEqual(clone(f.stores), before);
});

test("undo of class addition refuses newer independent peer course definitions or schedule", async () => {
  for (const laterEdit of ["definition", "schedule"]) {
    const f = fixture({ emptyGrades: true });
    if (laterEdit === "definition")
      f.value("second").lessons[0].name = "درس تازهٔ نوبت دوم";
    else
      f.value("second", "meta").masterSchedule = {
        "0-1": { schoolId: "school", classId: "class", lessonId: "lesson" },
      };
    prepareClassDeletion(f);
    f.args.keepUndo = false;
    const before = clone(f.stores);
    await assert.rejects(
      f.commit(),
      (error) =>
        error.code === "ACADEMIC_DIRECTORY_CONFLICT" &&
        /پشتیبان کامل/.test(error.message),
    );
    assert.deepEqual(clone(f.stores), before);
    assert.deepEqual(f.args.directorySourceUpdates, []);
    assert.deepEqual(f.args.annualChanged, []);
  }
});
test("undo of a shared class addition without independent peer edits remains supported", async () => {
  const f = fixture({ emptyGrades: true });
  prepareClassDeletion(f);
  f.args.keepUndo = false;
  await f.commit();
  assert.equal(f.value("first"), undefined);
  assert.equal(f.value("second"), undefined);
  assert.equal(f.stores.undo.has("first"), false);
});

function annualScheduleFixture(options = {}) {
  const f = fixture({ recoveredStudent: true, ...options });
  for (const id of ["first", "second", "other-year"]) {
    const meta = f.value(id, "meta");
    meta.masterSchedule = {
      "0-0-all": { schoolId: "school", classId: "class", lessonId: "lesson" },
    };
    meta.activeDays = [0, 1, 2, 3, 4, 5];
    meta.periods = 6;
    meta.settings.weekStartDate = "2026-09-19";
    meta.settings.password = id + "-private-password";
  }
  const previous = clone(f.value("first", "meta"));
  f.args.records.set("meta", clone(previous));
  f.args.changed = [["meta", JSON.stringify(previous)]];
  f.args.before = [{ key: "meta", value: clone(previous) }];
  f.args.action = "ویرایش برنامهٔ هفتگی سال";
  return { ...f, previous };
}
for (const [field, update] of [
  [
    "masterSchedule",
    (meta) => {
      meta.masterSchedule["1-1-all"] = {
        schoolId: "school",
        classId: "class",
        lessonId: "lesson",
      };
    },
  ],
  [
    "activeDays",
    (meta) => {
      meta.activeDays = [0, 2, 4];
    },
  ],
  [
    "periods",
    (meta) => {
      meta.periods = 7;
    },
  ],
  [
    "weekStartDate",
    (meta) => {
      meta.settings.weekStartDate = "2026-09-26";
    },
  ],
])
  test(
    "annual schedule shares " +
      field +
      " atomically without copying term settings, grades or historical sessions",
    async () => {
      const f = annualScheduleFixture(),
        before = clone(f.stores.records);
      update(f.args.records.get("meta"));
      f.args.changed[0][1] = JSON.stringify(f.args.records.get("meta"));
      assert.equal(
        f.c.EduAcademicDirectoryTransaction.hasChanges(f.args),
        true,
      );
      await f.commit();
      assert.deepEqual(
        plain(
          f.c.EduAcademicYearDirectory.scheduleProjection(
            f.value("first", "meta"),
          ),
        ),
        plain(
          f.c.EduAcademicYearDirectory.scheduleProjection(
            f.value("second", "meta"),
          ),
        ),
      );
      for (const id of ["first", "second"]) {
        assert.deepEqual(f.value(id), before.get(id + "|class:class").value);
        assert.deepEqual(
          f.value(id, "session:recovered-session"),
          before.get(id + "|session:recovered-session").value,
        );
        assert.deepEqual(
          f.value(id, "session:genuine-history"),
          before.get(id + "|session:genuine-history").value,
        );
        assert.equal(
          f.value(id, "meta").settings.password,
          id + "-private-password",
        );
      }
      assert.equal(f.value("second", "meta").settings.academicTerm, "دوم");
      assert.equal(f.stores.catalog.get("second").closed, true);
      assert.deepEqual(
        f.value("other-year", "meta"),
        before.get("other-year|meta").value,
      );
      assert.equal(f.stores.catalog.get("first").revision, 3);
      assert.equal(f.stores.catalog.get("second").revision, 4);
    },
  );

test("private term settings do not accidentally become a shared schedule edit", () => {
  const f = annualScheduleFixture();
  f.args.records.get("meta").settings.password = "updated";
  f.args.changed = [["meta", JSON.stringify(f.args.records.get("meta"))]];
  assert.equal(f.c.EduAcademicDirectoryTransaction.hasChanges(f.args), false);
});

for (const field of ["same-field", "unrelated-field"])
  test(
    "legacy independent schedule conflict blocks a partial annual edit: " +
      field,
    async () => {
      const f = annualScheduleFixture();
      if (field === "same-field") f.value("second", "meta").activeDays = [1, 3];
      else
        f.value("second", "meta").masterSchedule["4-4-all"] = {
          schoolId: "school",
          classId: "class",
          lessonId: "lesson",
        };
      f.args.records.get("meta").activeDays = [0, 2, 4];
      const before = clone(f.stores);
      await assert.rejects(
        f.commit(),
        (error) => error.code === "ACADEMIC_SCHEDULE_CONFLICT",
      );
      assert.deepEqual(clone(f.stores), before);
    },
  );

test("explicit selected-schedule resolution replaces only the four annual schedule fields and publishes the source revision", async () => {
  const f = annualScheduleFixture();
  f.value("second", "meta").activeDays = [1, 3];
  f.value("second", "meta").periods = 9;
  f.value("second", "meta").settings.weekStartDate = "2026-09-26";
  f.value("second", "meta").masterSchedule["4-4-all"] = {
    schoolId: "school",
    classId: "class",
    lessonId: "lesson",
  };
  const before = clone(f.stores.records);
  f.args.changed = [];
  f.args.before = [];
  f.args.scheduleResolution = true;
  f.args.directoryRevisions = [...f.stores.catalog.values()]
    .filter((row) => row.year === f.args.workspace.year)
    .map(({ id, year, revision }) => ({ id, year, revision }));
  assert.equal(f.c.EduAcademicDirectoryTransaction.hasChanges(f.args), true);
  await f.commit();
  assert.deepEqual(
    plain(
      f.c.EduAcademicYearDirectory.scheduleProjection(
        f.value("second", "meta"),
      ),
    ),
    plain(f.c.EduAcademicYearDirectory.scheduleProjection(f.previous)),
  );
  assert.equal(f.stores.catalog.get("first").revision, 3);
  assert.equal(f.stores.catalog.get("second").revision, 4);
  assert.equal(
    f.value("second", "meta").settings.password,
    "second-private-password",
  );
  assert.deepEqual(f.value("second"), before.get("second|class:class").value);
  assert.deepEqual(
    f.value("second", "session:recovered-session"),
    before.get("second|session:recovered-session").value,
  );
});

for (const mode of ["missing-guard", "stale-guard", "peer-put-failure"])
  test(
    "selected-schedule resolution preserves all stores when " + mode,
    async () => {
      const f = annualScheduleFixture({
        failCompanionWrite: mode === "peer-put-failure",
      });
      f.value("second", "meta").activeDays = [1, 3];
      f.args.changed = [];
      f.args.before = [];
      f.args.scheduleResolution = true;
      if (mode !== "missing-guard")
        f.args.directoryRevisions = [...f.stores.catalog.values()]
          .filter((row) => row.year === f.args.workspace.year)
          .map(({ id, year, revision }) => ({ id, year, revision }));
      if (mode === "stale-guard")
        f.args.directoryRevisions.find((row) => row.id === "second").revision--;
      const before = clone(f.stores);
      await assert.rejects(f.commit());
      assert.deepEqual(clone(f.stores), before);
      assert.deepEqual(f.args.annualChanged, []);
    },
  );

test("normal annual schedule edits roll back source and peer together when peer storage fails", async () => {
  const f = annualScheduleFixture({ failCompanionWrite: true }),
    before = clone(f.stores);
  f.args.records.get("meta").periods = 7;
  await assert.rejects(f.commit(), /quota/);
  assert.deepEqual(clone(f.stores), before);
  assert.deepEqual(f.args.directorySourceUpdates, []);
});

test("undo of a shared annual schedule edit restores both programs while preserving all term histories", async () => {
  const f = annualScheduleFixture(),
    before = clone(f.stores.records);
  f.args.records.get("meta").periods = 7;
  await f.commit();
  const current = clone(f.value("first", "meta"));
  f.args.workspace = clone(f.stores.catalog.get("first"));
  f.args.records.set("meta", clone(f.previous));
  f.args.changed = [["meta", JSON.stringify(f.previous)]];
  f.args.before = [{ key: "meta", value: current }];
  f.args.keepUndo = false;
  await f.commit();
  assert.deepEqual(f.stores.records, before);
});
