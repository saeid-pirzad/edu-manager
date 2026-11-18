"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(file, globals = {}) {
  const context = vm.createContext(globals);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
    context,
  );
  return context;
}

function indexedBefore(entries) {
  let reads = 0;
  return {
    rows: entries.map(([key, value]) => ({
      get key() {
        reads++;
        return key;
      },
      value,
    })),
    reads: () => reads,
  };
}

function sessions(size) {
  return Array.from({ length: size }, (_, index) => {
    const value = {
      id: "s" + index,
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
      date: "2026-11-18",
      period: index % 6,
      scores: [],
    };
    return ["session:" + value.id, value];
  });
}

test("ordinary session batches do not decode payloads for directory detection", () => {
  let parses = 0;
  const c = load("data/academic-directory-transaction.js", {
    JSON: {
      parse(value) {
        parses++;
        return JSON.parse(value);
      },
    },
    EduAcademicYearDirectory: {
      layoutHasChanges: () => assert.fail("unexpected layout comparison"),
      hasChanges: () => assert.fail("unexpected class comparison"),
    },
  });
  const entries = sessions(2000),
    before = indexedBefore(entries);
  assert.equal(
    c.EduAcademicDirectoryTransaction.hasChanges({
      records: new Map([["meta", {}]]),
      changed: entries.map(([key, value]) => [key, JSON.stringify(value)]),
      removed: [],
      before: before.rows,
    }),
    false,
  );
  assert.equal(parses, 0);
  assert.equal(before.reads(), 0);
});

test("directory detection preserves metadata, class, schedule and removal decisions", () => {
  const comparisons = [],
    c = load("data/academic-directory-transaction.js", {
      EduAcademicYearDirectory: {
        layoutHasChanges: (a, b) => JSON.stringify(a) !== JSON.stringify(b),
        scheduleHasChanges: (a, b) => a?.periods !== b.periods,
        hasChanges(a, b) {
          comparisons.push(a?.name);
          return a?.name !== b.name;
        },
      },
      EduAcademicYearCourses: {
        hasChanges: (a, b) => a?.course !== b.course,
      },
    }),
    meta = { layout: [], periods: 6 },
    cls = { name: "class", course: "old" },
    args = {
      records: new Map([["meta", meta]]),
      removed: [],
      before: [
        { key: "meta", value: meta },
        { key: "class:c", value: cls },
        { key: "class:c", value: { name: "duplicate ignored" } },
      ],
    },
    detect = (key, value) =>
      c.EduAcademicDirectoryTransaction.hasChanges({
        ...args,
        changed: [[key, JSON.stringify(value)]],
      });
  assert.equal(detect("meta", meta), false);
  assert.equal(detect("meta", { ...meta, layout: [{ id: "new" }] }), true);
  assert.equal(detect("meta", { ...meta, periods: 7 }), true);
  assert.equal(detect("class:c", cls), false);
  assert.equal(detect("class:c", { ...cls, name: "renamed" }), true);
  assert.equal(detect("class:c", { ...cls, course: "new" }), true);
  assert.equal(comparisons[0], "class");
  assert.equal(
    c.EduAcademicDirectoryTransaction.hasChanges({
      ...args,
      changed: [],
      removed: ["class:c"],
    }),
    true,
  );
  assert.equal(
    c.EduAcademicDirectoryTransaction.hasChanges({
      ...args,
      records: new Map(),
      changed: [],
      removed: ["class:c"],
    }),
    false,
  );
});

test("bulk slot checks scale linearly and retain slot, undo and removal semantics", () => {
  const c = load("domain/session-slots.js"),
    entries = sessions(2000),
    before = indexedBefore(entries),
    changed = entries.map(([key, value], index) => [
      key,
      JSON.stringify({
        ...value,
        ...(index === 0 || index === 1 ? { date: "2026-11-19" } : {}),
        scores: [{ studentId: "student", value: 0 }],
      }),
    ]),
    restored = new Map([[changed[1][0], JSON.parse(changed[1][1])]]),
    result = c.EduSessionSlots.changes({
      changed: [...changed, ["meta", "{}"]],
      before: before.rows,
      removed: ["class:c", "session:removed"],
      restoredRecords: restored,
    });
  assert.equal(result.updates.length, entries.length);
  assert.deepEqual(
    Array.from(result.guarded, (row) => row.logical),
    [entries[0][0]],
  );
  assert.deepEqual(Array.from(result.removed), ["session:removed"]);
  assert.ok(before.reads() <= entries.length * 2, before.reads());
  assert.equal(entries[0][1].date, "2026-11-18");
  assert.equal(entries[2][1].scores.length, 0);
});

test("slot index keeps the first previous record and skips indexing when no sessions change", () => {
  const c = load("domain/session-slots.js"),
    [[key, value]] = sessions(1),
    before = indexedBefore([
      [key, value],
      [key, { ...value, date: "2026-11-17" }],
    ]);
  assert.equal(
    c.EduSessionSlots.changes({
      changed: [[key, JSON.stringify(value)]],
      before: before.rows,
      removed: [],
    }).guarded.length,
    0,
  );
  const empty = indexedBefore([[key, value]]);
  c.EduSessionSlots.changes({
    changed: [["meta", "{}"]],
    before: empty.rows,
    removed: [],
  });
  assert.equal(empty.reads(), 0);
});

test("bulk save date validation indexes undo records once and checks moved/new dates", async () => {
  const entries = sessions(2000),
    before = indexedBefore(entries),
    dates = [],
    changed = entries.map(([key, value], index) => [
      key,
      JSON.stringify(index === 0 ? { ...value, date: "2026-11-19" } : value),
    ]);
  changed.push([
    "session:new",
    JSON.stringify({ ...entries[0][1], id: "new", date: "2026-11-20" }),
  ]);
  let writes = 0;
  const c = load("workspace/data/save.js", {
    blocked: false,
    workspace: { id: "term", revision: 1, year: "1405-1406" },
    connection: {},
    committed: new Map(),
    resetBusy: false,
    connectionRetired: false,
    failNextWrite: false,
    normalizedName: String,
    academicTermKind: () => "first",
    decodeWorkspaceRecords: () => assert.fail("unexpected decode"),
    historicalRoster: () => assert.fail("unexpected roster"),
    EduRecordCommitPlan: {
      create: () => ({
        changed,
        removed: [],
        before: before.rows,
        changes: [],
      }),
    },
    EduAcademicYear: {
      assertDate: (year, date) => dates.push([year, date]),
    },
    EduRecordTransaction: {
      async commit() {
        writes++;
        return { id: "term", revision: 2 };
      },
    },
    broadcast() {},
  });
  assert.equal(await c.commitRecords(new Map()), true);
  assert.equal(writes, 1);
  assert.deepEqual(dates, [
    ["1405-1406", "2026-11-19"],
    ["1405-1406", "2026-11-20"],
  ]);
  assert.ok(before.reads() <= entries.length * 2, before.reads());
  assert.equal(c.committed.size, changed.length);
});
