"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const clone = structuredClone,
  plain = (value) => JSON.parse(JSON.stringify(value)),
  year = "1405-1406",
  persian = "\u06f1\u06f4\u06f0\u06f5\u2013\u06f1\u06f4\u06f0\u06f6",
  arabic = "\u0661\u0664\u0660\u0665 / \u0661\u0664\u0660\u0666",
  term = "\u0627\u0648\u0644";
function fixture() {
  const c = vm.createContext({
    structuredClone,
    TYPE_LABELS: { classGrade: "grade" },
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
    "domain/calendar.js",
    "domain/academic-year.js",
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
    "validation/frozen-report.js",
    "validation/undo.js",
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
  c.academicTermKind = (value) => (value === term ? "first" : null);
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
    normalizeDB: c.normalizeDB,
    validateFrozenReport: (report) =>
      c.EduFrozenReportValidator.validate(report, {
        assertSafeDataTree: c.assertSafeDataTree,
        isDataObject: c.isDataObject,
        isSafeRecordId: c.isSafeRecordId,
        weightedKardanesh: c.weightedKardanesh,
        gradePolicy: c.EduPolicy,
      }),
    validatedUndoCandidate: (undo, records, period) =>
      c.EduUndoValidator.validate(undo, records, period, {
        assertSafeDataTree: c.assertSafeDataTree,
        isDataObject: c.isDataObject,
        isSafeRecordId: c.isSafeRecordId,
        clone,
        logicalRecordType: codec.logicalRecordType,
        validateLogicalValue: codec.validateLogicalValue,
        decodeWorkspaceRecords: codec.decodeWorkspaceRecords,
      }),
    isSupportedGradeDraft: () => false,
  });
  c.validateFullBackup = validate;
  for (const name of ["connection", "workspace", "db", "committed"])
    Object.defineProperty(c, name, {
      get() {
        throw Error("No live state access: " + name);
      },
    });
  const database = () => ({
    schemaVersion: 26,
    settings: { academicYear: persian, academicTerm: term, password: "" },
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
                teacher: "Historical teacher",
                gradeMode: "kardanesh",
                periodsPerWeek: 2,
                courseInfo: {
                  year: arabic,
                  branch: "kardanesh",
                  code: "corrected-code",
                },
                gradingPolicy: {
                  ...plain(c.EduPolicy.defaults("dual", year)),
                  year: persian,
                  code: "historical-code",
                  confirmed: true,
                },
                poudmans: [],
                kardaneshScores: {
                  student: {
                    practical: 0,
                    theory: 0,
                    midtermPractical: 0,
                    midtermTheory: 0,
                    final: 0,
                    passed: false,
                  },
                },
              },
            ],
          },
        ],
      },
    ],
    masterSchedule: {},
    activeDays: [0, 1, 2, 3, 4, 5],
    periods: 6,
    sessions: ["2026-09-22", "2026-09-23"].map((date, index) => ({
      id: "session_" + index,
      schoolId: "school",
      classId: "classroom",
      lessonId: "lesson",
      date,
      period: 0,
      poudmanId: null,
      unitId: null,
      roster: [{ id: "student", name: "Historic roster", code: "1" }],
      attendance: { student: index ? "present" : "absent" },
      scores: [
        {
          studentId: "student",
          type: "classGrade",
          value: 0,
          note: "Historical zero",
        },
      ],
    })),
  });
  const backup = () => {
    const data = database(),
      id = "first";
    return {
      format: "EduManager.FullBackup",
      version: 2,
      schemaVersion: 26,
      activeWorkspace: id,
      exportedAt: "2026-11-01T00:00:00Z",
      reportDrafts: {},
      gradeDrafts: [],
      stores: {
        catalog: [
          {
            id,
            year: arabic,
            term,
            termKind: "first",
            closed: true,
            revision: 3,
            createdAt: "2026-10-01T00:00:00Z",
            closedAt: "2026-11-01T00:00:00Z",
          },
        ],
        records: [...codec.collectRecords(data)].map(([logical, value]) => ({
          key: id + "|" + logical,
          workspace: id,
          logical,
          value: clone(value),
        })),
        events: [
          {
            workspace: id,
            action: "Historical edit",
            at: "2026-11-01T00:00:00Z",
            changes: [
              {
                path: "meta.settings.academicYear",
                before: persian,
                after: arabic,
              },
            ],
          },
        ],
        undo: [],
        reports: [],
        backups: [],
      },
    };
  };
  return { c, codec, validate, database, backup };
}
const classRecord = (value) =>
  value.stores.records.find((row) => row.logical === "class:classroom").value;
const metaRecord = (value) =>
  value.stores.records.find((row) => row.logical === "meta").value;
const invalidYear = (fn) =>
  assert.throws(fn, (error) => error.code === "ACADEMIC_YEAR_INVALID");

test("legacy year spellings canonicalize settings and both lesson identities without mutating input or grades", () => {
  const f = fixture(),
    input = f.database(),
    before = clone(input),
    result = f.c.legacyBackupReplacement(input),
    lesson = classRecord(result).lessons[0];
  assert.deepEqual(input, before);
  assert.equal(result.stores.catalog[0].year, year);
  assert.equal(metaRecord(result).settings.academicYear, year);
  assert.equal(lesson.courseInfo.year, year);
  assert.equal(lesson.gradingPolicy.year, year);
  assert.equal(lesson.courseInfo.code, "corrected-code");
  assert.equal(lesson.gradingPolicy.code, "historical-code");
  assert.equal(lesson.gradingPolicy.confirmed, true);
  for (const field of [
    "practical",
    "theory",
    "midtermPractical",
    "midtermTheory",
    "final",
    "passed",
  ])
    assert.equal(
      lesson.kardaneshScores.student[field],
      before.schools[0].classes[0].lessons[0].kardaneshScores.student[field],
    );
});

test("legacy sessions outside the year survive import with their exact roster, attendance and activity plus warning", () => {
  const f = fixture(),
    input = f.database(),
    result = f.c.legacyBackupReplacement(input);
  const sessions = result.stores.records
    .filter((row) => row.logical.startsWith("session:"))
    .map((row) => row.value);
  assert.deepEqual(plain(sessions), input.sessions);
  assert.equal(sessions[0].date, "2026-09-22");
  assert.equal(sessions[0].scores[0].value, 0);
  assert.equal(metaRecord(result).migrationWarnings.length, 1);
  assert.ok(metaRecord(result).migrationWarnings[0].includes(year));
  assert.deepEqual(
    plain(f.c.normalizeDB(f.c.normalizeDB(input)).migrationWarnings),
    plain(f.c.normalizeDB(input).migrationWarnings),
  );
});

test("invalid explicit legacy years are rejected before returning a replacement candidate", () => {
  const f = fixture();
  for (const value of [
    "",
    "wrong",
    "1405-1407",
    "0000-0001",
    "9999-10000",
    null,
    false,
  ]) {
    const input = f.database(),
      before = clone(input);
    input.settings.academicYear = value;
    invalidYear(() => f.c.legacyBackupReplacement(input));
    input.settings.academicYear = before.settings.academicYear;
    assert.deepEqual(input, before);
  }
});

test("missing legacy year retains defaults while a present outer year is normalized or rejected", () => {
  const f = fixture(),
    data = f.database();
  delete data.settings.academicYear;
  // An otherwise empty historical DB has no policy year to contradict the default.
  data.schools = [];
  data.sessions = [];
  assert.equal(
    f.c.legacyBackupReplacement(data).stores.catalog[0].year,
    f.c.currentYearLabel(),
  );
  const wrapped = {
    version: 25,
    period: { id: "original", year: arabic, term },
    db: data,
  };
  assert.equal(
    f.c.legacyBackupReplacement(wrapped).stores.catalog[0].year,
    year,
  );
  wrapped.period.year = "1405-1407";
  invalidYear(() => f.c.legacyBackupReplacement(wrapped));
});

test("full backup validation returns canonical period data without changing the selected source object", () => {
  const f = fixture(),
    input = f.backup(),
    before = clone(input),
    periods = f.validate(input);
  assert.deepEqual(input, before);
  assert.equal(periods[0].period.year, year);
  assert.equal(periods[0].data.settings.academicYear, year);
  assert.equal(
    periods[0].data.schools[0].classes[0].lessons[0].gradingPolicy.year,
    year,
  );
  assert.deepEqual(plain(periods[0].data.sessions), f.database().sessions);
  assert.equal(periods[0].data.migrationWarnings.length, 1);
});

test("full replacement normalizes catalog, records, frozen reports, undo and nested backups while preserving history", () => {
  const f = fixture(),
    input = f.backup(),
    classroom = clone(classRecord(input)),
    meta = clone(metaRecord(input));
  input.stores.undo.push({
    id: "first",
    workspace: "first",
    revision: 3,
    action: "Previous edit",
    before: [
      { key: "meta", value: meta },
      { key: "class:classroom", value: classroom },
    ],
  });
  input.stores.reports.push({
    id: "frozen",
    workspace: "first",
    year: persian,
    term,
    at: "2026-11-01T00:00:00Z",
    classes: [
      {
        school: "School",
        name: "Class",
        students: [
          {
            id: "student",
            name: "Student",
            average: 0,
            lessons: [
              {
                id: "lesson",
                name: "Frozen course",
                mode: "kardanesh",
                teacher: "Original frozen teacher",
                practical: 0,
                theory: 0,
                final: 0,
                passed: false,
                policy: clone(classroom.lessons[0].gradingPolicy),
                courseInfo: clone(classroom.lessons[0].courseInfo),
              },
            ],
          },
        ],
      },
    ],
  });
  const nested = f.backup();
  input.stores.backups.push(
    { id: "old-db", workspace: "first", db: f.database() },
    { id: "nested-full", workspace: null, full: nested },
    {
      id: "raw-recovery",
      workspace: null,
      full: {
        format: "EduManager.RawRecovery",
        stores: { catalog: [{ year: "uninterpretable historical value" }] },
      },
    },
  );
  const before = clone(input),
    result = f.validate.normalize(input);
  assert.deepEqual(input, before);
  assert.notEqual(result, input);
  assert.equal(result.stores.catalog[0].year, year);
  assert.equal(metaRecord(result).settings.academicYear, year);
  assert.equal(classRecord(result).lessons[0].gradingPolicy.year, year);
  assert.equal(result.stores.reports[0].year, year);
  const frozen = result.stores.reports[0].classes[0].students[0].lessons[0];
  assert.equal(frozen.policy.year, year);
  assert.equal(frozen.courseInfo.year, year);
  assert.equal(frozen.teacher, "Original frozen teacher");
  assert.equal(frozen.final, 0);
  assert.equal(
    result.stores.undo[0].before[0].value.settings.academicYear,
    year,
  );
  assert.equal(
    result.stores.undo[0].before[1].value.lessons[0].courseInfo.year,
    year,
  );
  assert.equal(result.stores.backups[0].db.settings.academicYear, year);
  assert.equal(
    result.stores.backups[0].db.schools[0].classes[0].lessons[0].gradingPolicy
      .year,
    year,
  );
  assert.equal(result.stores.backups[1].full.stores.catalog[0].year, year);
  assert.equal(
    metaRecord(result.stores.backups[1].full).settings.academicYear,
    year,
  );
  assert.deepEqual(result.stores.backups[2], before.stores.backups[2]);
  assert.deepEqual(result.stores.events, before.stores.events);
  assert.deepEqual(
    classRecord(result).lessons[0].kardaneshScores,
    classroom.lessons[0].kardaneshScores,
  );
  assert.deepEqual(
    result.stores.records.filter((row) => row.logical.startsWith("session:")),
    before.stores.records.filter((row) => row.logical.startsWith("session:")),
  );
  const expectedCatalog = clone(before.stores.catalog[0]);
  expectedCatalog.year = year;
  assert.deepEqual(result.stores.catalog[0], expectedCatalog);
  assert.equal(result.activeWorkspace, before.activeWorkspace);
  assert.equal(f.validate(result).length, 1);
});

test("clone-only startup year normalization neither invents fields nor rewrites raw grading data", () => {
  const f = fixture(),
    input = f.backup();
  delete classRecord(input).lessons[0].courseInfo.year;
  const raw = classRecord(input).lessons[0].kardaneshScores.student;
  raw.final = 19; // Clone-only normalization must not derive or repair any grade.
  const before = clone(input),
    result = f.validate.normalizeYears(input);
  assert.deepEqual(input, before);
  assert.equal(
    Object.hasOwn(classRecord(result).lessons[0].courseInfo, "year"),
    false,
  );
  assert.equal(
    classRecord(result).lessons[0].kardaneshScores.student.final,
    19,
  );
  assert.equal(metaRecord(result).migrationWarnings, undefined);
  assert.deepEqual(
    result.stores.records.map((row) => row.key),
    before.stores.records.map((row) => row.key),
  );
});

test("invalid explicit years in all recognized full-backup paths reject without mutating the source", () => {
  const f = fixture();
  const changes = [
    (value) => {
      value.stores.catalog[0].year = "1405-1407";
    },
    (value) => {
      metaRecord(value).settings.academicYear = "wrong";
    },
    (value) => {
      classRecord(value).lessons[0].courseInfo.year = null;
    },
    (value) => {
      classRecord(value).lessons[0].gradingPolicy.year = "1405-1405";
    },
    (value) => {
      value.stores.reports.push({ year: "wrong" });
    },
    (value) => {
      value.stores.undo.push({
        before: [
          { key: "meta", value: { settings: { academicYear: "wrong" } } },
        ],
      });
    },
    (value) => {
      value.stores.backups.push({ db: { settings: { academicYear: false } } });
    },
    (value) => {
      const nested = f.backup();
      nested.stores.catalog[0].year = "wrong";
      value.stores.backups.push({ full: nested });
    },
  ];
  for (const change of changes) {
    const input = f.backup();
    change(input);
    const before = clone(input);
    invalidYear(() => f.validate.normalize(input));
    assert.deepEqual(input, before);
  }
});

test("normalization never hides a genuine catalog-versus-data academic-year mismatch", () => {
  const f = fixture(),
    input = f.backup();
  input.stores.catalog[0].year = "1406-1407";
  assert.throws(() => f.validate.normalize(input));
});

test("direct workspace validation requires canonical years while normalization accepts supported digit spellings", () => {
  const f = fixture(),
    input = f.database();
  assert.throws(() => f.c.validateV24(input));
  const normalized = f.c.normalizeDB(input);
  assert.equal(f.c.validateV24(normalized), true);
  for (const value of ["wrong", "1405-1407", null]) {
    const candidate = clone(normalized);
    candidate.settings.academicYear = value;
    invalidYear(() => f.c.normalizeDB(candidate));
  }
});

test("outside-year warning refreshes its count and disappears after correction without removing recovery warnings", () => {
  const f = fixture(),
    input = f.database(),
    recovery = "Preserve the recovered-student warning";
  input.migrationWarnings = [recovery, "جلسات خارج از سال تحصیلی: پیام قدیمی"];
  let normalized = f.c.normalizeDB(input);
  assert.equal(normalized.migrationWarnings.length, 2);
  assert.equal(normalized.migrationWarnings[0], recovery);
  assert.equal(
    normalized.migrationWarnings.some((warning) =>
      warning.includes("پیام قدیمی"),
    ),
    false,
  );
  assert.ok(normalized.migrationWarnings[1].includes("۱ جلسه"));
  normalized.sessions[1].date = "2026-09-21";
  normalized = f.c.normalizeDB(normalized);
  assert.equal(normalized.migrationWarnings.length, 2);
  assert.ok(normalized.migrationWarnings[1].includes("۲ جلسه"));
  normalized.sessions[0].date = "2026-09-24";
  normalized.sessions[1].date = "2026-09-25";
  normalized = f.c.normalizeDB(normalized);
  assert.deepEqual(plain(normalized.migrationWarnings), [recovery]);
  assert.equal(input.sessions[0].date, "2026-09-22");
});

test("live warning refresh preserves all entity references and clears the last corrected or deleted outside-year session", () => {
  for (const removeLast of [false, true]) {
    const f = fixture(),
      data = f.c.normalizeDB(f.database()),
      recovery = "Preserve the recovered-student warning";
    data.migrationWarnings.unshift(recovery);
    const schools = data.schools,
      classroom = schools[0].classes[0],
      lesson = classroom.lessons[0],
      scores = lesson.kardaneshScores,
      sessions = data.sessions,
      historical = sessions[0],
      roster = historical.roster,
      attendance = historical.attendance;
    const checkReferences = () => {
      assert.equal(data.schools, schools);
      assert.equal(data.schools[0].classes[0], classroom);
      assert.equal(classroom.lessons[0], lesson);
      assert.equal(lesson.kardaneshScores, scores);
      assert.equal(data.sessions, sessions);
      assert.equal(historical.roster, roster);
      assert.equal(historical.attendance, attendance);
    };
    assert.equal(f.c.refreshAcademicYearWarnings(data), data.migrationWarnings);
    checkReferences();
    assert.equal(data.migrationWarnings.length, 2);
    if (removeLast) sessions.splice(0, 1);
    else historical.date = "2026-09-24";
    f.c.refreshAcademicYearWarnings(data);
    checkReferences();
    assert.deepEqual(plain(data.migrationWarnings), [recovery]);
    assert.equal(scores.student.practical, 0);
    assert.equal(attendance.student, "absent");
    assert.equal(historical.scores[0].value, 0);
  }
});
