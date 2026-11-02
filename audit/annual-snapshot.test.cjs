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

test("four-stage karnameh reads only the available terms of the active year and accepts an unstarted second term", async () => {
  const { c, catalog, reads, finish } = fixture();
  catalog.splice(1, 1);
  const context = c.captureWorkspaceContext();
  const pending = c.readAnnualRecordSets(context, {}, c.selectKarnamehPeriods);
  finish();
  const snapshot = await pending;
  assert.deepEqual(reads, ["first"]);
  assert.equal(snapshot.periods.length, 1);
});

test("karnameh term lookup rejects duplicate roles and never treats another year as the missing term", () => {
  const { c, catalog } = fixture();
  catalog[1].year = "1406-1407";
  assert.equal(c.selectKarnamehPeriods(catalog, {}, c.workspace).length, 1);
  catalog.push({ ...catalog[0], id: "duplicate" });
  assert.throws(
    () => c.selectKarnamehPeriods(catalog, {}, c.workspace),
    /چند نسخه/,
  );
});

test("cross-term karnameh never returns protected grades when access is cancelled", async () => {
  const { c, catalog } = fixture();
  c.flushDrafts = async () => {};
  c.writer = Promise.resolve();
  c.readAnnualRecordSets = async () => ({
    periods: catalog.slice(0, 2),
    recordSets: [[], []],
  });
  c.decodeWorkspaceRecords = (rows, options) => ({
    data: {
      settings: {
        password: options.workspaceId === "second" ? "protected" : "",
      },
    },
  });
  c.prompt = () => null;
  c.verifyPassword = () => {
    throw Error("Cancelled password must not be checked");
  };
  await assert.rejects(c.prepareKarnamehSnapshot(), /دسترسی.*تأیید نشد/);
});
test("annual merge retains term-specific lesson metadata and infers legacy rosters from their own term", async () => {
  const { c, catalog } = fixture();
  const makeData = (name, sid, teacher) => ({
    settings: { academicYear: "1405-1406", password: "" },
    schools: [
      {
        id: "school",
        name: "school",
        classes: [
          {
            id: "class",
            name,
            students: [{ id: sid, name: sid }],
            archivedStudents: [],
            lessons: [
              { id: "lesson", name: name + " lesson", teacher, poudmans: [] },
            ],
          },
        ],
      },
    ],
    sessions: [
      {
        id: "same-id",
        date: "2026-10-31",
        period: 0,
        schoolId: "school",
        classId: "class",
        lessonId: "lesson",
        attendance: {},
        scores: [],
      },
    ],
  });
  const data = [
    makeData("first class", "old-student", "first teacher"),
    makeData("second class", "new-student", "second teacher"),
  ];
  const before = JSON.stringify(data);
  Object.assign(c, {
    clone: structuredClone,
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    readAnnualRecordSets: async () => ({
      periods: catalog.slice(0, 2),
      recordSets: data,
    }),
    decodeWorkspaceRecords: (rows) => ({ data: rows }),
    knownStudents: (cls) => [...cls.students, ...cls.archivedStudents],
    assertReportSnapshot: async () => true,
  });
  const fromFirst = await c.prepareAnnualReportSnapshot();
  c.workspace = { ...catalog[1] };
  const fromSecond = await c.prepareAnnualReportSnapshot();
  assert.equal(JSON.stringify(fromFirst.data), JSON.stringify(fromSecond.data));
  assert.equal(fromFirst.data.schools[0].classes[0].name, "second class");
  const [first, second] = fromFirst.data.sessions;
  assert.equal(first.annualMetadata.teacher, "first teacher");
  assert.equal(second.annualMetadata.teacher, "second teacher");
  assert.equal(first.roster[0].id, "old-student");
  assert.equal(second.roster[0].id, "new-student");
  assert.equal(first.rosterInferred, true);
  assert.equal(first.academicTerm, "اول");
  assert.equal(second.sourcePeriodId, "second");
  assert.notEqual(first.id, second.id);
  Object.assign(c, {
    range: () => ({ start: "2026-10-31", end: "2026-10-31" }),
    isoDate: (value) => new Date(value),
    addDays: (value) => value,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/reports/periodic/model.js"),
      "utf8",
    ),
    c,
  );
  const report = c.build(fromFirst.data, {
    mode: "annual",
    date: "2026-10-31",
    schoolId: "school",
    audience: "management",
  });
  assert.equal(
    report.summary.unknown,
    2,
    "each term has one student, not the merged roster of two students",
  );
  assert.equal(report.sessions[0].teacher, "first teacher");
  assert.equal(report.sessions[1].teacher, "second teacher");
  assert.equal(report.sessions[0].className, "first class");
  assert.equal(report.sessions[0].sourcePeriodId, "first");
  assert.equal(report.sessions[0].academicTerm, "اول");
  assert.equal(JSON.stringify(data), before);
});
test("annual sessions keep an explicitly empty historical roster rather than replacing it with current students", () => {
  const { c } = fixture();
  c.clone = structuredClone;
  const session = {
    id: "session",
    schoolId: "school",
    classId: "class",
    lessonId: "lesson",
    roster: [],
  };
  const part = {
    period: { id: "first", term: "اول" },
    data: {
      schools: [
        {
          id: "school",
          classes: [
            {
              id: "class",
              name: "class",
              students: [{ id: "later" }],
              lessons: [],
            },
          ],
        },
      ],
    },
  };
  const copy = c.annualSessionCopy(part, session);
  assert.equal(copy.roster.length, 0);
  assert.equal(copy.rosterInferred, undefined);
  assert.notEqual(copy.roster, session.roster);
});
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
    /چند نسخه/,
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

test("karnameh snapshot rejects a newly created second term before printing", async () => {
  const { c, catalog } = fixture();
  c.busy = 0;
  c.allFrom = async () => catalog;
  await assert.rejects(
    c.assertReportSnapshot({
      id: "first",
      revision: 2,
      members: [{ id: "first", revision: 2 }],
      karnamehYear: "1405-1406",
    }),
    /نوبت‌های سال تغییر/,
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

test("annual source listing exposes only fixed first and second labels of the current year", async () => {
  const { c, catalog } = fixture();
  catalog[0].term = "نام قدیمی نوبت اول";
  catalog[1].term = "نام قدیمی نوبت دوم";
  catalog.push(
    {
      id: "summer",
      year: c.workspace.year,
      term: "تابستان",
      termKind: "summer",
    },
    {
      id: "unknown",
      year: c.workspace.year,
      term: "فایل بازیابی",
      termKind: null,
    },
  );
  const before = JSON.stringify(catalog);
  c.allFrom = async () => catalog;
  const rows = await c.listAnnualReportPeriods();
  assert.deepEqual(
    Array.from(rows, (row) => [row.id, row.term, row.termKind]),
    [
      ["first", "اول", "first"],
      ["second", "دوم", "second"],
    ],
  );
  assert.equal(JSON.stringify(catalog), before);
});

test("explicit annual sources reject unclassified restored records rather than assigning them a term", () => {
  const { c, catalog } = fixture();
  catalog[0].term = "نام نامشخص";
  catalog[0].termKind = null;
  assert.throws(
    () =>
      c.selectAnnualPeriods(
        catalog,
        { first: "first", second: "second" },
        c.workspace,
      ),
    /مطابقت ندارد/,
  );
});

test("unstarted second-term annual reports direct users to the same-year term hub", () => {
  const { c, catalog } = fixture();
  catalog.splice(1, 1);
  assert.throws(
    () => c.selectAnnualPeriods(catalog, {}, c.workspace),
    /نوبت دوم هنوز شروع نشده.*نوبت‌های سال تحصیلی/,
  );
});

test("annual snapshot presents fixed term labels without rewriting legacy catalog titles", async () => {
  const { c, catalog } = fixture();
  catalog[0].term = "پاییز قدیمی";
  catalog[1].term = "بهار قدیمی";
  const before = JSON.stringify(catalog);
  Object.assign(c, {
    clone: structuredClone,
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    readAnnualRecordSets: async () => ({
      periods: catalog.slice(0, 2),
      recordSets: [[], []],
    }),
    decodeWorkspaceRecords: () => ({
      data: { schools: [], sessions: [], settings: {} },
    }),
    assertReportSnapshot: async () => true,
  });
  const snapshot = await c.prepareAnnualReportSnapshot();
  assert.deepEqual(
    Array.from(snapshot.parts, (part) => [
      part.period.id,
      part.period.term,
      part.period.displayTerm,
    ]),
    [
      ["first", "اول", "اول"],
      ["second", "دوم", "دوم"],
    ],
  );
  assert.equal(JSON.stringify(catalog), before);
});
