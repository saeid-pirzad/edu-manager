"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const clone = structuredClone,
  plain = (value) => JSON.parse(JSON.stringify(value));
function database() {
  return {
    schemaVersion: 26,
    schools: [
      {
        id: "school",
        name: "مدرسه",
        classes: [
          {
            id: "class",
            name: "شبکه",
            students: [
              { id: "b", name: "رضا", code: "2" },
              { id: "a", name: "سعید", code: "1" },
            ],
            archivedStudents: [],
            lessons: [
              {
                id: "dual",
                name: "مهارت",
                gradeMode: "kardanesh",
                poudmans: [],
                kardaneshScores: {
                  a: {
                    practical: 0,
                    theory: 0,
                    midtermPractical: 0,
                    midtermTheory: 0,
                  },
                },
              },
              {
                id: "legacy-course",
                name: "درس واحدی",
                gradeMode: "standard",
                poudmans: [
                  {
                    id: "module",
                    name: "پودمان",
                    units: [
                      {
                        id: "unit",
                        name: "واحد",
                        unitScores: { a: { m: 0, p: 0 } },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    sessions: [],
    masterSchedule: {},
    activeDays: [0, 1, 2, 3, 4, 5],
    periods: 6,
    settings: { academicYear: "1405-1406", academicTerm: "دوم", password: "" },
  };
}
function fixture() {
  const c = vm.createContext({
    structuredClone,
    TYPE_LABELS: { classGrade: "نمره" },
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
  });
  for (const source of [
    "domain/grade-math.js",
    "domain/data-boundary.js",
    "domain/grade-policy.js",
    "workspace/domain/defaults-numbers.js",
    "legacy/validation/database.js",
    "legacy/students/roster.js",
    "workspace/grading/scope.js",
    "workspace/courses/rules.js",
    "workspace/validation/database.js",
    "data/workspace-records.js",
    "validation/full-backup.js",
    "workspace/backups/import-conversion.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
      c,
    );
  c.old.validateDB = c.legacy_validateDB;
  const codec = c.EduWorkspaceRecords.create({
    clone,
    normalizeDB: c.normalizeDB,
    isDataObject: c.isDataObject,
    isSafeRecordId: c.isSafeRecordId,
  });
  c.collectRecords = codec.collectRecords;
  c.academicTermKind = (term) =>
    ({ اول: "first", دوم: "second", تابستان: "summer" })[
      String(term || "").split(" — بازیابی ")[0]
    ] || null;
  const validate = c.EduFullBackupValidator.create({
    backupStores: [
      "records",
      "catalog",
      "events",
      "undo",
      "reports",
      "backups",
    ],
    assertSafeDataTree: c.assertSafeDataTree,
    isDataObject: c.isDataObject,
    isSafeRecordId: c.isSafeRecordId,
    validateReportNotes: c.validateReportNotes,
    decodeWorkspaceRecords: codec.decodeWorkspaceRecords,
    validateFrozenReport() {
      throw Error("reports must not be fabricated");
    },
    normalizeDB: c.normalizeDB,
    validatedUndoCandidate() {
      throw Error("undo must not be fabricated");
    },
    isSupportedGradeDraft() {
      throw Error("drafts must not be fabricated");
    },
  });
  let validations = 0;
  c.validateFullBackup = (value) => {
    validations++;
    return validate(value);
  };
  for (const key of ["workspace", "connection", "db", "committed"])
    Object.defineProperty(c, key, {
      get() {
        throw Error("conversion must not read live " + key);
      },
    });
  return {
    c,
    convert: c.legacyBackupReplacement,
    validate,
    validations: () => validations,
  };
}
const classRecord = (result) =>
  result.stores.records.find((row) => row.logical === "class:class").value;

test("raw legacy DB conversion yields one validated complete replacement independent of current installation", () => {
  const f = fixture(),
    result = f.convert(database());
  assert.equal(result.format, "EduManager.FullBackup");
  assert.equal(result.version, 2);
  assert.equal(result.schemaVersion, 26);
  assert.equal(result.activeWorkspace, "restored-file");
  assert.equal(result.stores.catalog.length, 1);
  assert.equal(f.validations(), 1);
  assert.equal(f.validate(result).length, 1);
  for (const name of ["events", "undo", "reports", "backups"])
    assert.deepEqual(plain(result.stores[name]), []);
  assert.deepEqual(plain(result.reportDrafts), {});
  assert.deepEqual(plain(result.gradeDrafts), []);
});
test("version25 wrapped backup retains school/course identities, independent grades, zeroes and registration order", () => {
  const f = fixture(),
    original = { version: 25, db: database() },
    before = clone(original),
    result = f.convert(original),
    cls = classRecord(result);
  assert.deepEqual(original, before);
  assert.deepEqual(plain(cls.students.map((student) => student.id)), [
    "b",
    "a",
  ]);
  const dual = cls.lessons[0].kardaneshScores.a;
  for (const key of [
    "practical",
    "theory",
    "midtermPractical",
    "midtermTheory",
  ])
    assert.equal(dual[key], 0);
  assert.equal(dual.final, 0);
  assert.equal(cls.lessons[1].poudmans[0].units[0].unitScores.a.m, 0);
  assert.equal(cls.lessons[1].poudmans[0].units[0].unitScores.a.p, 0);
  assert.equal(result.stores.catalog[0].term, "دوم");
  assert.equal(result.stores.catalog[0].termKind, "second");
});
test("outer legacy year and term are applied before normalization when source labels are absent", () => {
  const f = fixture(),
    source = database();
  delete source.settings.academicYear;
  delete source.settings.academicTerm;
  const result = f.convert({
    version: 25,
    period: { year: "1404-1405", term: "اول" },
    db: source,
  });
  assert.equal(result.stores.catalog[0].year, "1404-1405");
  assert.equal(result.stores.catalog[0].term, "اول");
  assert.equal(result.stores.catalog[0].termKind, "first");
  const meta = result.stores.records.find(
    (row) => row.logical === "meta",
  ).value;
  assert.equal(meta.settings.academicYear, "1404-1405");
});
test("explicit source labels take precedence over old outer labels", () => {
  const f = fixture(),
    result = f.convert({
      version: 25,
      period: { year: "1400-1401", term: "اول" },
      db: database(),
    });
  assert.equal(result.stores.catalog[0].year, "1405-1406");
  assert.equal(result.stores.catalog[0].term, "دوم");
});
test("a valid outer stable id and reliable closed flag are retained without synthesizing grades or reports", () => {
  const f = fixture(),
    result = f.convert({
      version: 25,
      period: { id: "saved-period", closed: true },
      db: database(),
    });
  assert.equal(result.activeWorkspace, "saved-period");
  assert.equal(result.stores.catalog[0].closed, true);
  assert.equal(result.stores.reports.length, 0);
  assert.equal(result.stores.catalog[0].revision, 1);
  assert.ok(
    result.stores.records.every(
      (row) =>
        row.workspace === "saved-period" && row.key.startsWith("saved-period|"),
    ),
  );
});
test("repeated conversion uses a single fixed id and never appends recovery labels", () => {
  const f = fixture(),
    source = { version: 25, db: database() },
    first = f.convert(source),
    second = f.convert(source);
  assert.equal(first.activeWorkspace, second.activeWorkspace);
  assert.equal(first.stores.catalog.length, 1);
  assert.equal(second.stores.catalog.length, 1);
  assert.equal(first.stores.catalog[0].term, "دوم");
  assert.equal(second.stores.catalog[0].term.includes("بازیابی"), false);
  assert.deepEqual(plain(first.stores.records), plain(second.stores.records));
});
test("valid export time is retained and invalid time gets a valid current timestamp", () => {
  const f = fixture(),
    at = "2025-10-01T07:00:00Z",
    result = f.convert({ version: 25, exportedAt: at, db: database() });
  assert.equal(result.exportedAt, at);
  assert.equal(result.stores.catalog[0].createdAt, at);
  const fallback = f.convert({
    version: 25,
    exportedAt: "not-a-date",
    db: database(),
  });
  assert.equal(Number.isFinite(Date.parse(fallback.exportedAt)), true);
});
test("valid older version23 records migrate while preserving legacy unit grade zero", () => {
  const f = fixture(),
    source = database();
  source.schemaVersion = 23;
  const result = f.convert({ version: 23, db: source });
  assert.equal(
    classRecord(result).lessons[1].poudmans[0].units[0].unitScores.a.m,
    0,
  );
  assert.equal(result.schemaVersion, 26);
});
test("unknown container formats and malformed wrappers are rejected without producing replacement", () => {
  for (const value of [
    null,
    [],
    "file",
    { format: "EduManager.Unknown", db: database() },
    { format: "EduManager.RawRecovery", stores: {} },
    { format: "EduManager.FullBackup", db: database() },
    { version: 25, db: null },
    { version: 25, db: [] },
    { version: 25, db: { format: "foreign", schools: [], sessions: [] } },
  ]) {
    const f = fixture();
    assert.throws(() => f.convert(value));
    assert.equal(f.validations(), 0);
  }
});
test("future, negative, fractional and nonnumeric version metadata is rejected", () => {
  for (const value of [27, 0, -1, 1.5, "25", null]) {
    const f = fixture();
    assert.throws(() => f.convert({ version: value, db: database() }));
    const source = database();
    source.schemaVersion = value;
    assert.throws(() => f.convert({ version: 25, db: source }));
  }
});
test("malformed period identity, settings and closed metadata never get silently invented defaults", () => {
  for (const period of [
    false,
    [],
    { id: "__proto__" },
    { id: "bad|id" },
    { closed: "true" },
  ]) {
    const f = fixture();
    assert.throws(() => f.convert({ version: 25, period, db: database() }));
  }
  for (const settings of [
    null,
    [],
    "settings",
    { academicYear: false },
    { academicTerm: 3 },
  ]) {
    const f = fixture(),
      source = database();
    source.settings = settings;
    assert.throws(() => f.convert({ version: 25, db: source }));
  }
});
test("unsafe keys hidden in otherwise unknown legacy metadata are rejected", () => {
  const f = fixture(),
    payload = JSON.parse(
      JSON.stringify({ version: 25, db: database() }).replace(
        '"version":25',
        '"version":25,"unknown":{"__proto__":{"polluted":true}}',
      ),
    );
  assert.throws(() => f.convert(payload), /غیرمجاز/);
  assert.equal(f.validations(), 0);
  assert.equal({}.polluted, undefined);
});
test("malformed grade or missing school structure fails production normalization before restore", () => {
  const f = fixture(),
    source = database();
  source.schools[0].classes[0].lessons[0].kardaneshScores.a.theory = 21;
  assert.throws(() => f.convert({ version: 25, db: source }));
  assert.throws(() => f.convert({ version: 25, db: { sessions: [] } }));
  assert.equal(f.validations(), 0);
});
test("converted legacy sessions retain leave status and validated historical roster", () => {
  const f = fixture(),
    source = database();
  source.sessions = [
    {
      id: "session",
      schoolId: "school",
      classId: "class",
      lessonId: "dual",
      date: "2026-10-31",
      period: 1,
      attendance: { a: "leave" },
      scores: [],
    },
  ];
  const result = f.convert({ version: 25, db: source }),
    session = result.stores.records.find(
      (row) => row.logical === "session:session",
    ).value;
  assert.equal(session.attendance.a, "leave");
  assert.deepEqual(plain(session.roster.map((student) => student.id)), ["a"]);
});
test("final full-backup validation errors propagate before any replacement is returned", () => {
  const f = fixture();
  f.c.validateFullBackup = () => {
    throw Error("final-contract-check");
  };
  assert.throws(() => f.convert(database()), /final-contract-check/);
});
