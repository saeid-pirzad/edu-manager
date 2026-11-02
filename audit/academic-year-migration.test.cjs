"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  clone = structuredClone,
  plain = (value) => JSON.parse(JSON.stringify(value));
function fixture({ canonical = false, globalOnly = false } = {}) {
  const c = vm.createContext({ structuredClone, connectionRetired: false });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "validation/full-backup.js",
    "workspace/periods/academic-years.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  c.validateFullBackup = c.EduFullBackupValidator.create({
    assertSafeDataTree() {},
    isDataObject: (value) =>
      value !== null && typeof value === "object" && !Array.isArray(value),
  });
  const classroom = {
      id: "class",
      name: "شبکه",
      students: [{ id: "student", name: "سعید", code: "1" }],
      lessons: [
        {
          id: "lesson",
          name: "کارگاه",
          courseInfo: { year: "١٤٠٥/١٤٠٦", grade: "11" },
          gradingPolicy: {
            year: "۱۴۰۵–۱۴۰۶",
            method: "dual",
            practicalWeight: 70,
          },
          kardaneshScores: { student: { practical: 0, theory: 19 } },
          poudmans: [
            { id: "pod", podScores: { student: { m: 0, c: 2 } }, units: [] },
          ],
        },
      ],
    },
    session = {
      id: "session",
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
      date: "2026-10-27",
      period: 0,
      roster: [{ id: "student", name: "نام تاریخی" }],
      attendance: { student: "leave" },
      scores: [{ studentId: "student", value: 0 }],
    },
    initial = {
      catalog: [
        {
          id: "first",
          year: "۱۴۰۵ – ۱۴۰۶",
          term: "اول",
          revision: 4,
          closed: true,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-02",
        },
        {
          id: "second",
          year: "1405-1406",
          term: "دوم",
          revision: 7,
          closed: false,
        },
        {
          id: "other",
          year: "1406-1407",
          term: "اول",
          revision: 2,
          closed: false,
        },
      ],
      records: [
        {
          key: "first|meta",
          workspace: "first",
          logical: "meta",
          value: {
            settings: { academicYear: "۱۴۰۵–۱۴۰۶", academicTerm: "اول" },
            masterSchedule: {
              school: { "0:0": { classId: "class", lessonId: "lesson" } },
            },
          },
        },
        {
          key: "first|class:class",
          workspace: "first",
          logical: "class:class",
          value: classroom,
        },
        {
          key: "first|session:session",
          workspace: "first",
          logical: "session:session",
          value: session,
        },
        {
          key: "second|meta",
          workspace: "second",
          logical: "meta",
          value: {
            settings: { academicYear: "1405-1406", academicTerm: "دوم" },
          },
        },
      ],
      reports: [
        {
          id: "report",
          workspace: "first",
          year: "١٤٠٥/١٤٠٦",
          result: { value: 0, status: "incomplete" },
          classes: [
            {
              students: [
                {
                  lessons: [
                    {
                      policy: { year: "۱۴۰۵–۱۴۰۶", method: "dual" },
                      courseInfo: { year: "١٤٠٥/١٤٠٦" },
                      final: 0,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      undo: [
        {
          id: "first",
          revision: 4,
          action: "ثبت نمره",
          before: [
            { key: "meta", value: { settings: { academicYear: "۱۴۰۵–۱۴۰۶" } } },
            { key: "class:class", value: clone(classroom) },
            { key: "session:session", value: clone(session) },
          ],
        },
        {
          id: "second",
          revision: 6,
          action: "قدیمی",
          before: [
            { key: "meta", value: { settings: { academicYear: "۱۴۰۵–۱۴۰۶" } } },
          ],
        },
      ],
      backups: [
        {
          id: "local",
          workspace: "first",
          label: "ایمنی",
          db: {
            settings: { academicYear: "۱۴۰۵–۱۴۰۶" },
            schools: [{ classes: [clone(classroom)] }],
            sessions: [clone(session)],
          },
        },
        {
          id: "full",
          workspace: null,
          full: {
            format: "EduManager.FullBackup",
            stores: {
              catalog: [{ id: "nested", year: "۱۴۰۵–۱۴۰۶" }],
              records: [],
              reports: [],
              undo: [],
              backups: [],
            },
          },
        },
        {
          id: "raw",
          workspace: null,
          full: {
            format: "EduManager.RawRecovery",
            stores: { catalog: [{ year: "invalid raw archive" }] },
          },
        },
      ],
      events: [
        {
          id: 1,
          workspace: "first",
          revision: 4,
          action: "رویداد تاریخی",
          changes: [],
        },
      ],
    },
    source =
      canonical || globalOnly
        ? c.validateFullBackup.normalizeYears({
            format: "EduManager.FullBackup",
            stores: initial,
          }).stores
        : initial;
  if (globalOnly)
    source.backups.find(
      (row) => row.id === "full",
    ).full.stores.catalog[0].year = "۱۴۰۵–۱۴۰۶";
  const state = Object.fromEntries(
      Object.entries(source).map(([name, rows]) => [
        name,
        new Map(
          rows.map((row) => [
            name === "records" ? row.key : row.id,
            clone(row),
          ]),
        ),
      ]),
    ),
    transactions = [],
    writes = [],
    hooks = {
      beforeWrite: null,
      afterRead: null,
      failPut: 0,
      failAdd: false,
      failTransaction: false,
      failRead: "",
    };
  c.connection = {
    transaction(names, mode) {
      names = Array.from(names);
      transactions.push({ names, mode });
      if (mode === "readwrite") hooks.beforeWrite?.();
      const snapshot = clone(state);
      let resolve,
        reject,
        pending = 0,
        aborted = false,
        putCount = 0;
      const tx = {
        done: new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
        abort() {
          aborted = true;
          reject(Error("aborted"));
        },
        objectStore(name) {
          assert.ok(names.includes(name), "store is inside transaction");
          return {
            getAll() {
              const request = {};
              pending++;
              queueMicrotask(() => {
                if (aborted) return;
                if (hooks.failRead === name) {
                  request.error = Error("read failed");
                  request.onerror?.();
                  aborted = true;
                  reject(request.error);
                  return;
                }
                request.result = clone([...snapshot[name].values()]);
                request.onsuccess?.();
                if (--pending || aborted) return;
                queueMicrotask(() => {
                  if (aborted) return;
                  if (mode === "readonly") hooks.afterRead?.();
                  if (mode === "readwrite" && hooks.failTransaction) {
                    reject(Error("async transaction failed"));
                    return;
                  }
                  if (mode === "readwrite")
                    for (const store of names) state[store] = snapshot[store];
                  resolve();
                });
              });
              return request;
            },
            put(row) {
              assert.equal(mode, "readwrite");
              if (++putCount === hooks.failPut) throw Error("quota failed");
              writes.push({ store: name, row: clone(row) });
              snapshot[name].set(
                name === "records" ? row.key : row.id,
                clone(row),
              );
            },
            add(row) {
              assert.equal(mode, "readwrite");
              if (hooks.failAdd) throw Error("event add failed");
              const id = snapshot[name].size + 1;
              writes.push({ store: name, row: clone(row) });
              snapshot[name].set(id, { ...clone(row), id });
            },
          };
        },
      };
      return tx;
    },
  };
  c.transactionDone = (tx) => tx.done;
  c.requestPromise = (request) =>
    new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return {
    c,
    state,
    hooks,
    transactions,
    writes,
    run: () => c.synchronizeAcademicYearsForRead(),
  };
}
test("year migration canonically groups terms and changes only equivalent year labels and migration metadata", async () => {
  const f = fixture(),
    before = clone(f.state),
    result = await f.run();
  assert.deepEqual(plain(result.changed), [
    { workspace: "first", revision: 5 },
    { workspace: "second", revision: 8 },
  ]);
  assert.equal(f.state.catalog.get("first").year, "1405-1406");
  assert.equal(f.state.catalog.get("second").year, "1405-1406");
  assert.equal(f.state.catalog.get("first").closed, true);
  assert.equal(f.state.catalog.get("second").closed, false);
  assert.deepEqual(f.state.catalog.get("other"), before.catalog.get("other"));
  for (const logical of [
    "first|class:class",
    "first|meta",
    "first|session:session",
  ]) {
    const expected = clone(before.records.get(logical));
    if (logical.endsWith("class:class"))
      for (const lesson of expected.value.lessons)
        lesson.courseInfo.year = lesson.gradingPolicy.year = "1405-1406";
    if (logical.endsWith("meta"))
      expected.value.settings.academicYear = "1405-1406";
    assert.deepEqual(f.state.records.get(logical), expected);
  }
  assert.deepEqual(
    f.state.reports.get("report").result,
    before.reports.get("report").result,
  );
  assert.equal(
    f.state.reports.get("report").classes[0].students[0].lessons[0].final,
    0,
  );
  assert.deepEqual(f.state.events.get(1), before.events.get(1));
  assert.equal(
    f.writes.some(
      (write) => write.store === "records" && write.row.key === "second|meta",
    ),
    false,
  );
});
test("year migration retains undo data and updates its revision only when previously usable", async () => {
  const f = fixture(),
    firstBefore = clone(f.state.undo.get("first"));
  await f.run();
  assert.equal(f.state.undo.get("first").revision, 5);
  assert.equal(
    f.state.undo.get("second").revision,
    6,
    "stale undo must stay stale",
  );
  assert.equal(f.state.undo.get("first").action, firstBefore.action);
  assert.deepEqual(f.state.undo.get("first").before[2], firstBefore.before[2]);
  assert.equal(
    f.state.undo.get("first").before[0].value.settings.academicYear,
    "1405-1406",
  );
});
test("year migration normalizes recognized archived backups and preserves raw recovery verbatim", async () => {
  const f = fixture(),
    raw = clone(f.state.backups.get("raw"));
  await f.run();
  assert.equal(
    f.state.backups.get("local").db.settings.academicYear,
    "1405-1406",
  );
  assert.equal(
    f.state.backups.get("full").full.stores.catalog[0].year,
    "1405-1406",
  );
  assert.deepEqual(f.state.backups.get("raw"), raw);
});
test("year migration is idempotent with no second write or revision increment", async () => {
  const f = fixture();
  await f.run();
  const before = clone(f.state),
    count = f.writes.length;
  assert.deepEqual(plain(await f.run()), { changed: [] });
  assert.deepEqual(f.state, before);
  assert.equal(f.writes.length, count);
  assert.deepEqual(
    f.transactions.map((tx) => tx.mode),
    ["readonly", "readwrite", "readonly"],
  );
});
test("canonical installations use one read snapshot and perform no writes", async () => {
  const f = fixture({ canonical: true }),
    before = clone(f.state);
  assert.deepEqual(plain(await f.run()), { changed: [] });
  assert.deepEqual(f.state, before);
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.transactions[0].names, [
    "catalog",
    "records",
    "reports",
    "undo",
    "backups",
  ]);
  assert.equal(f.transactions.length, 1);
});
for (const kind of ["catalog", "class", "nested-backup", "missing-catalog"])
  test(
    "invalid declared year aborts before writes and preserves recovery data: " +
      kind,
    async () => {
      const f = fixture();
      if (kind === "catalog") f.state.catalog.get("first").year = "1405-1408";
      else if (kind === "class")
        f.state.records.get(
          "first|class:class",
        ).value.lessons[0].gradingPolicy.year = "bad";
      else if (kind === "nested-backup")
        f.state.backups.get("full").full.stores.catalog[0].year = "bad";
      else delete f.state.catalog.get("first").year;
      const before = clone(f.state);
      await assert.rejects(
        f.run(),
        (error) => error.code === "ACADEMIC_YEAR_INVALID",
      );
      assert.deepEqual(f.state, before);
      assert.equal(f.transactions.length, 1);
      assert.equal(f.writes.length, 0);
    },
  );
for (const failure of ["put", "add", "transaction"])
  test("year migration is atomic when " + failure + " fails", async () => {
    const f = fixture(),
      before = clone(f.state);
    if (failure === "put") f.hooks.failPut = 2;
    else if (failure === "add") f.hooks.failAdd = true;
    else f.hooks.failTransaction = true;
    await assert.rejects(f.run(), /failed/);
    assert.deepEqual(f.state, before);
  });
for (const change of ["revision", "catalog-metadata", "backup", "record"])
  test(
    "year migration refuses concurrent " +
      change +
      " updates without overwriting them",
    async () => {
      const f = fixture();
      let concurrent;
      f.hooks.beforeWrite = () => {
        if (change === "revision") f.state.catalog.get("first").revision++;
        else if (change === "catalog-metadata")
          f.state.catalog.get("first").label = "newer";
        else if (change === "backup")
          f.state.backups.get("local").label = "newer";
        else
          f.state.records.get("first|meta").value.masterSchedule = {
            newer: true,
          };
        concurrent = clone(f.state);
      };
      await assert.rejects(f.run(), /پنجرهٔ دیگری/);
      assert.deepEqual(f.state, concurrent);
      assert.equal(f.writes.length, 0);
    },
  );
for (const phase of ["before-read", "after-read", "before-write"])
  test(
    "year migration rejects changed or retired connection " + phase,
    async () => {
      const f = fixture(),
        before = clone(f.state);
      if (phase === "before-read") f.c.connectionRetired = true;
      else if (phase === "after-read")
        f.hooks.afterRead = () => {
          f.c.connection = {};
        };
      else
        f.hooks.beforeWrite = () => {
          f.c.connectionRetired = true;
        };
      await assert.rejects(f.run(), /اتصال بانک/);
      assert.deepEqual(f.state, before);
      assert.equal(f.writes.length, 0);
    },
  );
test("year migration never increments unrelated catalog revisions for a global archive-only correction", async () => {
  const f = fixture({ globalOnly: true }),
    before = clone(f.state);
  assert.deepEqual(plain(await f.run()), { changed: [] });
  assert.deepEqual(f.state.catalog, before.catalog);
  assert.deepEqual(f.state.events, before.events);
  assert.equal(
    f.state.backups.get("full").full.stores.catalog[0].year,
    "1405-1406",
  );
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].store, "backups");
});
for (const revision of [0, "4", Number.MAX_SAFE_INTEGER])
  test(
    "year migration rejects an unsafe affected revision before opening a write transaction: " +
      revision,
    async () => {
      const f = fixture();
      f.state.catalog.get("first").revision = revision;
      const before = clone(f.state);
      await assert.rejects(f.run(), /شمارهٔ نسخهٔ سال تحصیلی/);
      assert.deepEqual(f.state, before);
      assert.equal(f.transactions.length, 1);
    },
  );
test("year migration propagates snapshot read errors and preserves every row", async () => {
  const f = fixture(),
    before = clone(f.state);
  f.hooks.failRead = "records";
  await assert.rejects(f.run(), /read failed/);
  assert.deepEqual(f.state, before);
  assert.equal(f.writes.length, 0);
});

test("year migration rebases current recovered-name peer guards and preserves their historical payload", async () => {
  const f = fixture(),
    undo = f.state.undo.get("first");
  undo.recoveredPeers = [
    {
      id: "second",
      revision: 7,
      rosters: [
        {
          sessionId: "old_session",
          classId: "class",
          before: [{ id: "student", name: "نام پیشین", recovered: true }],
        },
      ],
      migrationWarnings: ["هشدار قدیمی"],
    },
  ];
  const payload = clone(undo.recoveredPeers[0]);
  await f.run();
  const saved = f.state.undo.get("first"),
    guard = saved.recoveredPeers[0];
  assert.equal(saved.revision, f.state.catalog.get("first").revision);
  assert.equal(guard.revision, f.state.catalog.get("second").revision);
  assert.deepEqual({ ...guard, revision: payload.revision }, payload);
  const before = clone(f.state),
    writes = f.writes.length;
  assert.deepEqual(plain(await f.run()), { changed: [] });
  assert.deepEqual(f.state, before);
  assert.equal(f.writes.length, writes);
});

test("a peer-only year correction also publishes and rebases the canonical undo owner", async () => {
  const f = fixture({ canonical: true });
  f.state.catalog.get("second").year = "۱۴۰۵–۱۴۰۶";
  f.state.undo.get("first").recoveredPeers = [
    { id: "second", revision: 7, rosters: [] },
  ];
  const result = await f.run(),
    revisions = new Map(
      result.changed.map((row) => [row.workspace, row.revision]),
    );
  assert.equal(revisions.get("first"), 5);
  assert.equal(revisions.get("second"), 8);
  assert.equal(f.state.undo.get("first").revision, 5);
  assert.equal(f.state.undo.get("first").recoveredPeers[0].revision, 8);
  assert.equal(f.state.events.size, 3, "both changed owners must be announced");
});

test("year correction never promotes a stale recovered-name peer guard", async () => {
  const f = fixture({ canonical: true });
  f.state.catalog.get("second").year = "۱۴۰۵–۱۴۰۶";
  f.state.undo.get("first").recoveredPeers = [
    { id: "second", revision: 6, rosters: [] },
  ];
  const before = clone(f.state.undo.get("first")),
    result = await f.run();
  assert.deepEqual(plain(result.changed), [
    { workspace: "second", revision: 8 },
  ]);
  assert.deepEqual(f.state.undo.get("first"), before);
  assert.equal(f.state.catalog.get("first").revision, 4);
});

test("rebasing a current peer guard does not make an already stale source undo executable", async () => {
  const f = fixture({ canonical: true });
  f.state.catalog.get("second").year = "۱۴۰۵–۱۴۰۶";
  f.state.undo.get("first").revision = 3;
  f.state.undo.get("first").recoveredPeers = [
    { id: "second", revision: 7, rosters: [] },
  ];
  await f.run();
  assert.equal(f.state.undo.get("first").revision, 3);
  assert.equal(f.state.catalog.get("first").revision, 5);
  assert.equal(f.state.undo.get("first").recoveredPeers[0].revision, 8);
});

test("a failed migration keeps recovered-name undo guards and catalog revisions together", async () => {
  const f = fixture({ canonical: true });
  f.state.catalog.get("second").year = "۱۴۰۵–۱۴۰۶";
  f.state.undo.get("first").recoveredPeers = [
    { id: "second", revision: 7, rosters: [] },
  ];
  f.hooks.failAdd = true;
  const before = clone(f.state);
  await assert.rejects(f.run(), /event add failed/);
  assert.deepEqual(f.state, before);
});
