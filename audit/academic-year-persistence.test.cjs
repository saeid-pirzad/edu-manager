"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const clone = structuredClone,
  plain = (value) => JSON.parse(JSON.stringify(value)),
  year = "1405-1406",
  term = "\u0627\u0648\u0644";
function session(date = "2026-09-22", id = "session") {
  return {
    id,
    schoolId: "school",
    classId: "classroom",
    lessonId: "lesson",
    date,
    period: 0,
    poudmanId: null,
    unitId: null,
    roster: [{ id: "student", name: "Historical student", code: "1" }],
    attendance: { student: "absent" },
    scores: [
      {
        studentId: "student",
        type: "classGrade",
        value: 0,
        note: "Historical zero",
      },
    ],
  };
}
function fixture({ existingDate = null } = {}) {
  const writes = [],
    broadcasts = [],
    durable = new Map(),
    c = vm.createContext({
      structuredClone,
      Map,
      DOMException,
      TYPE_LABELS: { classGrade: "grade" },
      clone,
      old: {
        defaultDB: () => ({
          schools: [],
          sessions: [],
          settings: {},
          masterSchedule: {},
          activeDays: [0, 1, 2, 3, 4, 5],
          periods: 6,
        }),
      },
      workspace: {
        id: "first",
        year,
        term,
        termKind: "first",
        revision: 3,
        closed: false,
      },
      connection: { name: "connection" },
      blocked: false,
      resetBusy: false,
      connectionRetired: false,
      failNextWrite: false,
      normalizedName: (value) => String(value).trim().toLowerCase(),
      academicTermKind: () => "first",
      broadcast: (value) => broadcasts.push(clone(value)),
    });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/history-changes.js",
    "workspace/domain/defaults-numbers.js",
    "legacy/validation/database.js",
    "legacy/students/roster.js",
    "workspace/grading/scope.js",
    "workspace/courses/rules.js",
    "workspace/validation/database.js",
    "data/workspace-records.js",
    "validation/undo.js",
    "workspace/history/undo.js",
    "data/commit-plan.js",
    "workspace/data/save.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  c.old.validateDB = c.legacy_validateDB;
  const codec = c.EduWorkspaceRecords.create({
    clone,
    normalizeDB: c.normalizeDB,
    isDataObject: c.isDataObject,
    isSafeRecordId: c.isSafeRecordId,
  });
  Object.assign(c, codec);
  c.db = c.normalizeDB({
    schemaVersion: 26,
    settings: { academicYear: year, academicTerm: term, password: "" },
    schools: [
      {
        id: "school",
        name: "School",
        classes: [
          {
            id: "classroom",
            name: "Class",
            students: [{ id: "student", name: "Student", code: "1" }],
            archivedStudents: [],
            lessons: [
              {
                id: "lesson",
                name: "Course",
                gradeMode: "kardanesh",
                poudmans: [],
                kardaneshScores: {},
              },
            ],
          },
        ],
      },
    ],
    sessions: existingDate ? [session(existingDate)] : [],
    masterSchedule: {},
    activeDays: [0, 1, 2, 3, 4, 5],
    periods: 6,
  });
  c.committed = new Map(
    [...codec.collectRecords(c.db)].map(([key, value]) => [
      key,
      JSON.stringify(value),
    ]),
  );
  for (const [key, value] of c.committed) durable.set(key, JSON.parse(value));
  c.EduRecordTransaction = {
    async commit(args) {
      writes.push({
        changed: plain(args.changed),
        removed: plain(args.removed),
        keepUndo: args.keepUndo,
      });
      for (const [key, json] of args.changed)
        durable.set(key, JSON.parse(json));
      for (const key of args.removed) durable.delete(key);
      return { ...args.workspace, revision: args.workspace.revision + 1 };
    },
  };
  const records = () =>
    new Map([...c.committed].map(([key, json]) => [key, JSON.parse(json)]));
  const evidence = (historical = session()) => ({
    id: "first",
    workspace: "first",
    revision: 3,
    action: "Previous session edit",
    before: [{ key: "session:" + historical.id, value: clone(historical) }],
  });
  const historicalCandidate = (undo) =>
    c.validatedUndoCandidate(undo, records(), c.workspace);
  return {
    c,
    codec,
    writes,
    broadcasts,
    durable,
    records,
    evidence,
    historicalCandidate,
  };
}
const assertRejectedWithoutWrite = async (f, operation, code) => {
  const before = clone([...f.c.committed]),
    durableBefore = clone([...f.durable]);
  await assert.rejects(
    operation,
    code ? (error) => error.code === code : undefined,
  );
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.broadcasts, []);
  assert.equal(f.c.workspace.revision, 3);
  assert.deepEqual([...f.c.committed], before);
  assert.deepEqual([...f.durable], durableBefore);
};

test("new outside-year sessions are rejected at commitRecords before any write", async () => {
  const f = fixture(),
    records = f.records();
  records.set("session:session", session());
  await assertRejectedWithoutWrite(
    f,
    f.c.commitRecords(records, { replace: true }),
    "ACADEMIC_DATE_OUT_OF_YEAR",
  );
});

test("moving an existing session to an outside-year date cannot bypass the persistence guard", async () => {
  const f = fixture({ existingDate: "2026-09-23" }),
    records = f.records();
  records.get("session:session").date = "2027-09-23";
  await assertRejectedWithoutWrite(
    f,
    f.c.commitRecords(records, { replace: true }),
    "ACADEMIC_DATE_OUT_OF_YEAR",
  );
});

test("public save options and keepUndo false cannot authorize a historical outside-year insertion", async () => {
  for (const options of [
    { replace: true, keepUndo: false },
    { replace: true, allowHistoricalDates: true, historicalUndo: true },
    { replace: true, historicalUndo: { id: "first", revision: 3 } },
  ]) {
    const f = fixture(),
      records = f.records();
    records.set("session:session", session());
    await assertRejectedWithoutWrite(
      f,
      f.c.commitRecords(records, options),
      "ACADEMIC_DATE_OUT_OF_YEAR",
    );
  }
});

test("existing historical outside-year attendance and activity remain editable when the date is unchanged", async () => {
  const f = fixture({ existingDate: "2026-09-22" }),
    original = f.records().get("session:session"),
    changed = clone(original);
  changed.attendance.student = "leave";
  changed.scores.push({
    studentId: "student",
    type: "positive",
    value: 1,
    note: "Follow-up",
  });
  await f.c.commitRecords(new Map([["session:session", changed]]));
  assert.equal(f.writes.length, 1);
  assert.equal(f.c.workspace.revision, 4);
  assert.deepEqual(f.durable.get("session:session"), changed);
  assert.equal(f.durable.get("session:session").date, original.date);
  assert.equal(f.durable.get("session:session").scores[0].value, 0);
});

test("new sessions on both academic-year boundaries and an ordinary day are allowed", async () => {
  for (const date of ["2026-09-23", "2027-03-21", "2027-09-22"]) {
    const f = fixture();
    await f.c.commitRecords(new Map([["session:session", session(date)]]));
    assert.equal(f.writes.length, 1);
    assert.equal(f.durable.get("session:session").date, date);
  }
});

test("exact verified historical undo restores a deleted outside-year session with its full attendance and zero grade", async () => {
  const f = fixture(),
    original = session(),
    undo = f.evidence(original),
    candidate = f.historicalCandidate(undo);
  await f.c.commitRecords(candidate, { replace: true, keepUndo: false }, undo);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].keepUndo, false);
  assert.deepEqual(f.durable.get("session:session"), original);
  assert.equal(f.durable.get("session:session").attendance.student, "absent");
  assert.equal(f.durable.get("session:session").scores[0].value, 0);
});

test("exact verified historical undo can reverse a date correction back to the preserved original date", async () => {
  const f = fixture({ existingDate: "2026-09-24" }),
    original = session(),
    undo = f.evidence(original),
    candidate = f.historicalCandidate(undo);
  await f.c.commitRecords(candidate, { replace: true, keepUndo: false }, undo);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.durable.get("session:session"), original);
});

test("stale and foreign undo evidence cannot authorize session restoration", async () => {
  for (const change of [
    (undo) => {
      undo.revision = 2;
    },
    (undo) => {
      undo.revision = 4;
    },
    (undo) => {
      undo.id = "another";
    },
    (undo) => {
      undo.workspace = "another";
    },
  ]) {
    const f = fixture(),
      undo = f.evidence(),
      candidate = f.historicalCandidate(undo);
    change(undo);
    await assertRejectedWithoutWrite(
      f,
      f.c.commitRecords(candidate, { replace: true, keepUndo: false }, undo),
    );
  }
});

test("verified date evidence cannot authorize changes to the historical session payload", async () => {
  for (const change of [
    (row) => {
      row.date = "2026-09-21";
    },
    (row) => {
      row.attendance.student = "present";
    },
    (row) => {
      row.scores[0].value = 1;
    },
    (row) => {
      row.roster[0].name = "Tampered historical name";
    },
  ]) {
    const f = fixture(),
      undo = f.evidence(),
      candidate = f.historicalCandidate(undo);
    change(candidate.get("session:session"));
    await assertRejectedWithoutWrite(
      f,
      f.c.commitRecords(candidate, { replace: true, keepUndo: false }, undo),
    );
  }
});

test("valid undo evidence never permits an unrelated new outside-year session", async () => {
  const f = fixture(),
    undo = f.evidence(),
    candidate = f.historicalCandidate(undo);
  candidate.set("session:another", session("2026-09-21", "another"));
  await assertRejectedWithoutWrite(
    f,
    f.c.commitRecords(candidate, { replace: true, keepUndo: false }, undo),
    "ACADEMIC_DATE_OUT_OF_YEAR",
  );
});

test("malformed historical records fail real undo revalidation before reaching transaction writes", async () => {
  const f = fixture(),
    undo = f.evidence(),
    candidate = f.historicalCandidate(undo);
  undo.before[0].value.id = "another";
  await assertRejectedWithoutWrite(
    f,
    f.c.commitRecords(candidate, { replace: true, keepUndo: false }, undo),
  );
});

test("historical undo refreshes durable advisory warnings without modifying the historical session snapshot", async () => {
  const f = fixture({ existingDate: "2026-09-22" }),
    original = session(),
    undo = f.evidence(original),
    candidate = f.historicalCandidate(undo),
    recovery = "Keep recovered-student warning";
  candidate.get("meta").migrationWarnings.unshift(recovery);
  candidate
    .get("meta")
    .migrationWarnings.push("جلسات خارج از سال تحصیلی: پیام قدیمی");
  // Restore the historical deletion of this outside-year session.
  undo.before[0].value = null;
  candidate.delete("session:session");
  const before = clone(undo);
  await f.c.commitRecords(candidate, { replace: true, keepUndo: false }, undo);
  assert.deepEqual(undo, before);
  assert.equal(f.durable.has("session:session"), false);
  assert.deepEqual(f.durable.get("meta").migrationWarnings, [recovery]);
});
