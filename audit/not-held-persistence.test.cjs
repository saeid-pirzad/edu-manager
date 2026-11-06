"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const plain = (value) => JSON.parse(JSON.stringify(value)),
  read = (name) =>
    fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
  year = "1405-1406";

function fixture() {
  const c = vm.createContext({
    structuredClone,
    TYPE_LABELS: { classGrade: "grade" },
    old: {
      defaultDB: () => ({
        schools: [],
        sessions: [],
        masterSchedule: {},
        activeDays: [0, 1, 2, 3, 4, 5],
        periods: 6,
        settings: {},
      }),
    },
  });
  for (const name of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/attendance-reminders.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
    "domain/academic-year-directory.js",
    "workspace/domain/defaults-numbers.js",
    "legacy/validation/database.js",
    "legacy/students/roster.js",
    "workspace/grading/scope.js",
    "workspace/courses/rules.js",
    "workspace/validation/database.js",
    "data/workspace-records.js",
    "validation/full-backup.js",
  ])
    vm.runInContext(read(name), c, { filename: name });
  c.old.validateDB = c.legacy_validateDB;
  const codec = c.EduWorkspaceRecords.create({
    clone: structuredClone,
    normalizeDB: c.normalizeDB,
    isDataObject: c.isDataObject,
    isSafeRecordId: c.isSafeRecordId,
  });
  const marker = {
    id: "not_held",
    date: "2026-10-31",
    period: 0,
    schoolId: "school",
    classId: "class",
    lessonId: "modular",
    recordedAt: "2026-11-06T10:00:00.000Z",
  };
  const data = {
    schemaVersion: 26,
    settings: { academicYear: year, academicTerm: "اول", password: "" },
    schools: [
      {
        id: "school",
        name: "Synthetic school",
        classes: [
          {
            id: "class",
            name: "Synthetic class",
            students: [{ id: "student", name: "Synthetic student" }],
            archivedStudents: [],
            lessons: [
              {
                id: "modular",
                name: "Synthetic course",
                gradeMode: "standard",
                gradingPolicy: plain(c.EduPolicy.defaults("modular", year)),
                kardaneshScores: {},
                poudmans: [
                  {
                    id: "pod",
                    name: "Module",
                    podScores: { student: { m: 2, c: 2 } },
                    units: [
                      {
                        id: "unit",
                        name: "Unit",
                        unitScores: { student: { m: 0, p: 18 } },
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
    notHeldSessions: [marker],
  };
  return { c, codec, marker, data };
}

function rows(f, data = f.data) {
  return [...f.codec.collectRecords(data)].map(([logical, value]) => ({
    key: "first|" + logical,
    workspace: "first",
    logical,
    value,
  }));
}

test("old databases gain an empty marker list without mutating their input", () => {
  const f = fixture(),
    input = structuredClone(f.data);
  delete input.notHeldSessions;
  const before = structuredClone(input),
    normalized = f.c.normalizeDB(input);
  assert.deepEqual(plain(normalized.notHeldSessions), []);
  assert.deepEqual(input, before);
  assert.deepEqual(plain(f.c.v24DefaultDB().notHeldSessions), []);
});

test("marker normalization preserves data, grades, provenance and missing entities without fabricating sessions", () => {
  const f = fixture();
  // Historical cancellation metadata is allowed after a referenced item was
  // removed. The matching dashboard/action layer decides whether it applies.
  f.data.notHeldSessions[0].classId = "historical_class";
  f.data.notHeldSessions[0].lessonId = "historical_lesson";
  const before = structuredClone(f.data),
    normalized = f.c.normalizeDB(f.data);
  assert.deepEqual(plain(normalized.notHeldSessions), f.data.notHeldSessions);
  assert.deepEqual(
    plain(normalized.schools[0].classes[0].lessons[0].poudmans[0].podScores),
    { student: { m: 2, c: 2 } },
  );
  assert.deepEqual(plain(normalized.sessions), []);
  assert.deepEqual(f.data, before);
});

test("workspace normalization rejects malformed marker lists rather than deleting them", () => {
  const f = fixture();
  for (const value of [
    null,
    {},
    "invalid",
    [{ ...f.marker, period: 12 }],
    [{ ...f.marker, date: "2026-02-30" }],
    [f.marker, f.marker],
  ]) {
    const data = { ...structuredClone(f.data), notHeldSessions: value };
    assert.throws(() => f.c.normalizeDB(data));
    assert.deepEqual(data.notHeldSessions, value);
  }
});

test("missing validator cannot silently accept populated markers but legacy empty data remains readable", () => {
  const f = fixture();
  vm.runInContext("globalThis.EduAttendanceReminders = undefined;", f.c);
  assert.throws(() => f.c.normalizeDB(f.data), /اعتبارسنجی/);
  assert.deepEqual(
    plain(f.c.normalizeDB({ ...f.data, notHeldSessions: [] }).notHeldSessions),
    [],
  );
});

test("meta record JSON roundtrip retains markers independently of real session records", () => {
  const f = fixture(),
    records = JSON.parse(JSON.stringify(rows(f))),
    decoded = f.codec.decodeWorkspaceRecords(records, { workspaceId: "first" });
  assert.deepEqual(plain(decoded.data.notHeldSessions), f.data.notHeldSessions);
  assert.deepEqual(plain(decoded.data.sessions), []);
  assert.ok(!records.some((row) => row.logical.startsWith("session:")));
  assert.deepEqual(
    JSON.parse(decoded.records.get("meta")).notHeldSessions,
    f.data.notHeldSessions,
  );
});

test("not-held markers never become report sessions, absences or attendance observations", () => {
  const f = fixture(),
    source = f.c.normalizeDB(f.data),
    without = structuredClone(source);
  without.notHeldSessions = [];
  for (const mode of ["daily", "weekly", "monthly", "annual"])
    for (const audience of ["management", "parent"]) {
      const options = {
          mode,
          audience,
          date: "2026-10-31",
          schoolId: "school",
          classId: "class",
          studentId: "student",
        },
        prepared = { generatedAt: "2026-11-06T10:00:00.000Z" },
        before = f.c.EduReportModel.build(without, options, prepared),
        after = f.c.EduReportModel.build(source, options, prepared);
      assert.deepEqual(plain(after), plain(before));
      assert.equal(after.summary.sessions, 0);
      assert.equal(after.summary.absent, 0);
      assert.equal(after.summary.unknown, 0);
    }
});

test("single-class assessment reads and saves preserve markers for other class identities", () => {
  const f = fixture();
  f.data.notHeldSessions.push({
    ...f.marker,
    id: "other_marker",
    period: 1,
    classId: "another_class",
    lessonId: "another_lesson",
  });
  const records = rows(f),
    decoded = f.codec.decodeAssessmentRecords(records, {
      workspaceId: "first",
      schoolId: "school",
      classId: "class",
    });
  assert.deepEqual(plain(decoded.data.notHeldSessions), f.data.notHeldSessions);
  assert.deepEqual(
    JSON.parse(decoded.records.get("meta")).notHeldSessions,
    f.data.notHeldSessions,
  );
  f.c.db = f.c.normalizeDB(f.data);
  f.c.checkScope({ classId: "class" });
  assert.deepEqual(plain(f.c.db.notHeldSessions), f.data.notHeldSessions);
});

test("full portable backup validation retains markers while session and grade data stay unchanged", () => {
  const f = fixture(),
    stores = {
      records: rows(f),
      catalog: [
        {
          id: "first",
          year,
          term: "اول",
          termKind: "first",
          revision: 1,
          closed: false,
          createdAt: "2026-09-23T00:00:00.000Z",
        },
      ],
      events: [],
      undo: [],
      reports: [],
      backups: [],
    };
  const validate = f.c.EduFullBackupValidator.create({
    backupStores: Object.keys(stores),
    assertSafeDataTree: f.c.assertSafeDataTree,
    isDataObject: f.c.isDataObject,
    isSafeRecordId: f.c.isSafeRecordId,
    validateReportNotes: f.c.validateReportNotes,
    decodeWorkspaceRecords: f.codec.decodeWorkspaceRecords,
    normalizeDB: f.c.normalizeDB,
    validateFrozenReport() {
      throw Error("No frozen reports in this fixture");
    },
    validatedUndoCandidate() {
      throw Error("No undo in this fixture");
    },
    isSupportedGradeDraft: () => false,
  });
  const backup = JSON.parse(
    JSON.stringify({
      format: "EduManager.FullBackup",
      version: 2,
      schemaVersion: 26,
      activeWorkspace: "first",
      exportedAt: "2026-11-06T10:00:00.000Z",
      gradeDrafts: [],
      stores,
    }),
  );
  const [restored] = validate(backup);
  assert.deepEqual(
    plain(restored.data.notHeldSessions),
    f.data.notHeldSessions,
  );
  assert.deepEqual(plain(restored.data.sessions), []);
  assert.deepEqual(
    plain(restored.data.schools[0].classes[0].lessons[0].poudmans[0].podScores),
    { student: { m: 2, c: 2 } },
  );
});

test("shared annual schedule synchronization does not propagate or overwrite local marker decisions", () => {
  const f = fixture(),
    first = f.codec.metaValue(f.data),
    second = structuredClone(first);
  second.notHeldSessions = [
    { ...f.marker, id: "second_marker", date: "2027-02-01" },
  ];
  const previous = structuredClone(first),
    edited = structuredClone(first);
  edited.notHeldSessions = [];
  assert.equal(
    f.c.EduAcademicYearDirectory.scheduleHasChanges(previous, edited),
    false,
  );
  const mirrored = f.c.EduAcademicYearDirectory.mirrorSchedule(
    previous,
    edited,
    second,
  );
  assert.deepEqual(plain(mirrored.notHeldSessions), second.notHeldSessions);
});

function creationFixture() {
  const f = fixture(),
    installs = [],
    source = f.c.normalizeDB(f.data),
    period = {
      id: "first",
      year,
      term: "اول",
      termKind: "first",
      revision: 3,
      closed: true,
    };
  Object.assign(f.c, {
    __EDU_TEST_MODE__: true,
    workspace: period,
    db: source,
    connection: {},
    fileMode: false,
    writer: Promise.resolve(),
    document: {
      getElementById: (id) => ({ value: id === "periodYear" ? year : "دوم" }),
    },
    assertWorkspaceReadable() {},
    assertWorkspaceContext() {},
    captureWorkspaceContext: () => ({
      id: period.id,
      revision: period.revision,
    }),
    preserveAsyncTarget: () => () => {},
    flushDrafts: async () => {},
    allFrom: async () => [structuredClone(period)],
    readWorkspaceSnapshot: async () => ({
      period: structuredClone(period),
      data: structuredClone(source),
    }),
    broadcast() {},
  });
  for (const name of [
    "workspace/periods/install.js",
    "workspace/periods/switch-create.js",
    "workspace/grading/assessment-term.js",
  ])
    vm.runInContext(read(name), f.c, { filename: name });
  f.c.installWorkspace = async (data) => {
    installs.push(structuredClone(data));
    return { id: "second" };
  };
  f.c.switchPeriod = async () => {};
  return { ...f, source, installs };
}

for (const operation of ["assessment", "explicit-term"])
  test(
    operation +
      " creation clears copied marker decisions without clearing annual module scores",
    async () => {
      const f = creationFixture(),
        before = structuredClone(f.source);
      if (operation === "assessment")
        await f.c.ensureAcademicAssessmentTerm("second");
      else await f.c.createNewPeriod();
      const created = f.installs[0];
      assert.deepEqual(plain(created.notHeldSessions), []);
      assert.deepEqual(plain(created.sessions), []);
      assert.deepEqual(
        plain(created.schools[0].classes[0].lessons[0].poudmans[0].podScores),
        { student: { m: 2, c: 2 } },
      );
      assert.deepEqual(
        plain(
          created.schools[0].classes[0].lessons[0].poudmans[0].units[0]
            .unitScores,
        ),
        {},
      );
      assert.deepEqual(plain(f.source), plain(before));
    },
  );
