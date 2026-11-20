"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const plain = (value) => JSON.parse(JSON.stringify(value));
const storeNames = [
  "catalog",
  "records",
  "events",
  "backups",
  "undo",
  "reports",
];

function fixture() {
  const context = vm.createContext({
    structuredClone,
    queueMicrotask,
    workspace: {
      id: "first",
      year: "1405-1406",
      term: "اول",
      termKind: "first",
    },
    getSortedStudents: (classroom) => classroom.students,
  });
  for (const file of [
    "domain/data-boundary.js",
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/grade-drafts.js",
    "domain/reporting/academic-results.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
    "legacy/core/formatting.js",
    "legacy/validation/database.js",
    "legacy/grading/calculation.js",
    "legacy/grading/kardanesh.js",
    "legacy/students/roster.js",
    "workspace/domain/defaults-numbers.js",
    "workspace/courses/rules.js",
    "workspace/grading/scope.js",
    "workspace/validation/database.js",
    "services/grading-results.js",
    "workspace/grading/results.js",
    "workspace/reports/finalize.js",
    "workspace/reports/student.js",
    "validation/frozen-report.js",
    "data/schema.js",
    "data/workspace-records.js",
    "services/installation-backup.js",
    "validation/full-backup.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      context,
      { filename: file },
    );
  context.old = {
    calcStudentLesson: context.legacy_calcStudentLesson,
    validateDB: context.legacy_validateDB,
    defaultDB: () => ({
      settings: {},
      schools: [],
      sessions: [],
      activeDays: [0, 1, 2, 3, 4, 5],
      periods: 6,
      masterSchedule: {},
    }),
  };
  const policy = (method) =>
    plain(context.EduPolicy.defaults(method, "1405-1406"));
  const unit = (id) => ({ id, name: "واحد " + id, unitScores: {} });
  const dual = {
    id: "dual",
    name: "کاردانش",
    gradeMode: "kardanesh",
    gradingPolicy: policy("dual"),
    poudmans: [],
    kardaneshScores: {
      student: {
        midtermPractical: 0,
        midtermTheory: 0.000001,
        practical: 19.999999,
        theory: 13.123456,
      },
    },
  };
  const modular = {
    id: "modular",
    name: "پودمانی",
    gradeMode: "standard",
    gradingPolicy: policy("modular"),
    poudmans: [
      {
        id: "module",
        name: "پودمان",
        podScores: { student: { m: 0, c: 2 } },
        units: [unit("module-unit")],
      },
    ],
  };
  const workUnits = {
    id: "work-units",
    name: "واحد کار",
    gradeMode: "standard",
    gradingPolicy: { ...policy("modular"), version: 2, modularScope: "unit" },
    poudmans: [
      {
        id: "unit-module",
        name: "پودمان واحد کار",
        units: [
          {
            ...unit("work-one"),
            competencyScores: {
              student: { m: 0, c: 3 },
              archived: { m: 5, c: 3 },
            },
          },
          { ...unit("work-two"), competencyScores: { student: { m: 2 } } },
        ],
      },
    ],
  };
  const classroom = {
    id: "class",
    name: "کلاس",
    students: [{ id: "student", name: "هنرجو", code: "0001" }],
    archivedStudents: [{ id: "archived", name: "بایگانی", code: "0002" }],
    lessons: [dual, modular, workUnits],
  };
  context.db = context.normalizeDB({
    schemaVersion: 26,
    settings: { academicYear: "1405-1406", academicTerm: "اول" },
    schools: [{ id: "school", name: "مدرسه", classes: [classroom] }],
    sessions: [
      {
        id: "session",
        schoolId: "school",
        classId: "class",
        lessonId: "dual",
        date: "2026-11-19",
        period: 0,
        poudmanId: null,
        unitId: null,
        roster: [...classroom.students, ...classroom.archivedStudents],
        attendance: { student: "present", archived: "late:12" },
        scores: [
          {
            studentId: "student",
            type: "classGrade",
            value: 0,
            note: "نمره واقعی صفر",
          },
          {
            studentId: "archived",
            type: "classGrade",
            value: 20,
            note: "PRIVATE_PEER_NOTE",
          },
        ],
      },
    ],
  });
  const report = () =>
    plain({
      id: "frozen-first",
      workspace: "first",
      year: "1405-1406",
      term: "اول",
      at: "2026-11-20T00:00:00.000Z",
      classes: context.finalReportData().classes,
    });
  const codec = context.EduWorkspaceRecords.create({
    clone: structuredClone,
    normalizeDB: context.normalizeDB,
    isDataObject: context.isDataObject,
    isSafeRecordId: context.isSafeRecordId,
  });
  const validate = context.EduFullBackupValidator.create({
    backupStores: storeNames,
    assertSafeDataTree: context.assertSafeDataTree,
    isDataObject: context.isDataObject,
    isSafeRecordId: context.isSafeRecordId,
    validateReportNotes: context.validateReportNotes,
    decodeWorkspaceRecords: codec.decodeWorkspaceRecords,
    validateFrozenReport: context.validateFrozenReport,
    normalizeDB: context.normalizeDB,
    validatedUndoCandidate: () => assert.fail("Fixture has no undo rows"),
    isSupportedGradeDraft: context.EduGradeDrafts.isSupportedGradeDraft,
  });
  const rows = {
    catalog: [],
    records: [{ key: "@reset", value: { token: "installation" } }],
    events: [],
    backups: [],
    undo: [],
    reports: [report()],
    drafts: [],
  };
  for (const [id, term] of [
    ["first", "اول"],
    ["second", "دوم"],
  ]) {
    const data = plain(context.db);
    data.settings.academicTerm = term;
    if (id === "second")
      data.schools[0].classes[0].lessons[0].kardaneshScores.student = {
        midtermPractical: 16.25,
        midtermTheory: 12,
        practical: 18,
        theory: 14,
      };
    const normalized = context.normalizeDB(data);
    rows.catalog.push({
      id,
      year: "1405-1406",
      term,
      revision: 1,
      closed: false,
      createdAt: "2026-11-20T00:00:00.000Z",
    });
    rows.records.push(
      ...Array.from(codec.collectRecords(normalized), ([logical, value]) => ({
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      })),
    );
  }
  const service = context.EduInstallationBackup({
    getState: () => ({
      workspaceId: "first",
      installation: "installation",
      connection,
      ready: true,
    }),
    storage: {
      local: () => ({ getItem: () => null }),
      storeNames: () => storeNames,
      resetRecordKey: () => "@reset",
      request: async (value) => value,
      done: async () => {},
    },
    drafts: {
      current: () => ({
        key: "Edu24.drafts.first.tab",
        workspace: "first",
        generation: 0,
        entries: [],
        updatedAt: "",
      }),
      assessment: () => null,
      portable: context.EduGradeDrafts.portableGradeDrafts,
      flush: async () => {},
      persist: async () => {},
      writes: () => Promise.resolve(),
      pending: () => Promise.resolve(),
    },
    reports: { drafts: () => () => ({}) },
    identity: () => null,
  });
  const connection = {
    transaction() {
      const captured = structuredClone(rows);
      return {
        objectStore(name) {
          return {
            getAll: () => captured[name],
            openCursor() {
              const request = {};
              queueMicrotask(() => {
                request.result = null;
                request.onsuccess();
              });
              return request;
            },
          };
        },
      };
    },
  };
  return { context, report, rows, service, validate };
}

test("complete JSON backup round-trips both terms, four official stages, zero, precision, archived unit inputs and frozen results", async () => {
  const f = fixture();
  assert.deepEqual(
    Array.from(f.context.EduDataStoreSchema.stores)
      .map((store) => store.name)
      .sort(),
    [...storeNames, "drafts"].sort(),
  );
  const exported = await f.service.snapshot();
  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, /@reset/);
  const prepared = f.validate.prepare(JSON.parse(serialized));
  const terms = prepared.periods.map(
    (part) =>
      part.data.schools[0].classes[0].lessons[0].kardaneshScores.student,
  );
  assert.deepEqual(
    plain(
      terms.map((grade) => [
        grade.midtermPractical,
        grade.midtermTheory,
        grade.practical,
        grade.theory,
      ]),
    ),
    [
      [0, 0.000001, 19.999999, 13.123456],
      [16.25, 12, 18, 14],
    ],
  );
  const lessons = prepared.periods[0].data.schools[0].classes[0].lessons;
  assert.deepEqual(plain(lessons[1].poudmans[0].podScores.student), {
    m: 0,
    c: 2,
  });
  assert.deepEqual(
    plain(lessons[2].poudmans[0].units[0].competencyScores.archived),
    { m: 5, c: 3 },
  );
  assert.deepEqual(
    plain(lessons[2].poudmans[0].units[1].competencyScores.student),
    { m: 2 },
  );
  assert.deepEqual(plain(prepared.value.stores.reports), f.rows.reports);
  assert.deepEqual(
    plain(prepared.periods[0].data.sessions),
    plain(f.context.db.sessions),
  );
  assert.equal(
    prepared.value.stores.reports[0].classes[0].students[0].lessons[2].final,
    null,
  );
});

test("JSON frozen card remains detached from later live scores and preserves historical labels", () => {
  const f = fixture();
  const snapshot = f.report();
  snapshot.year = "1404-1405";
  snapshot.term = "عنوان تاریخی";
  const original = JSON.stringify(snapshot);
  f.context.db.schools[0].classes[0].lessons[0].kardaneshScores.student.practical = 1;
  assert.equal(f.context.validateFrozenReport(snapshot), true);
  assert.equal(JSON.stringify(snapshot), original);
});

for (const [label, mutate] of [
  ["unknown policy version", (lesson) => (lesson.policy.version = 99)],
  [
    "invalid policy numeric rule",
    (lesson) => (lesson.policy.theoryMin = "invalid"),
  ],
  ["policy mode mismatch", (lesson) => (lesson.mode = "standard")],
  [
    "malformed assessment explanation",
    (lesson) => (lesson.assessments.midterm.reason = {}),
  ],
  [
    "malformed assessment threshold",
    (lesson) => (lesson.assessments.midterm.threshold = {}),
  ],
  [
    "inconsistent assessment threshold",
    (lesson) => (lesson.assessments.midterm.threshold = 20),
  ],
  [
    "forged assessment grade",
    (lesson) => (lesson.assessments.midterm.final = 20),
  ],
  [
    "forged assessment status",
    (lesson) => (lesson.assessments.midterm.passed = true),
  ],
])
  test(
    "JSON restore rejects " + label + " before returning a prepared backup",
    async () => {
      const f = fixture();
      const input = plain(await f.service.snapshot());
      mutate(input.stores.reports[0].classes[0].students[0].lessons[0]);
      const before = JSON.stringify(input);
      assert.throws(() => f.validate.prepare(input));
      assert.equal(JSON.stringify(input), before);
    },
  );

test("JSON restore checks unit results against their own raw inputs and never substitutes a module total", async () => {
  const f = fixture();
  for (const modify of [
    (lesson) => (lesson.final = 20),
    (lesson) => (lesson.modules[0].final = 20),
    (lesson) => (lesson.modules[0].units[0].final = 20),
    (lesson) => (lesson.modules[0].units[1].inputs.c = 3),
  ]) {
    const input = plain(await f.service.snapshot());
    modify(input.stores.reports[0].classes[0].students[0].lessons[2]);
    assert.throws(() => f.validate.prepare(input));
  }
});

test("legacy frozen assessments without optional explanation and threshold stay valid after JSON serialization", () => {
  const f = fixture();
  const report = f.report();
  const lesson = report.classes[0].students[0].lessons[0];
  for (const result of Object.values(lesson.assessments)) {
    if (typeof result !== "object") continue;
    delete result.reason;
    delete result.threshold;
  }
  assert.equal(f.context.validateFrozenReport(plain(report)), true);
  delete lesson.assessments;
  delete lesson.policy;
  assert.equal(f.context.validateFrozenReport(plain(report)), true);
});

test("a report JSON is not accepted as a restorable installation backup", () => {
  const f = fixture();
  assert.throws(() => f.validate.prepare(f.report()));
  assert.throws(() =>
    f.validate.prepare({
      format: "EduManager.PeriodicReport",
      version: 1,
      sessions: [],
      currentGrades: [],
    }),
  );
});

test("parent report JSON includes only the selected pupil while a full backup keeps every historical participant", async () => {
  const f = fixture();
  const model = f.context.EduReportModel.build(
    f.context.db,
    {
      mode: "monthly",
      date: "2026-11-19",
      audience: "parent",
      schoolId: "school",
      classId: "class",
      studentId: "student",
    },
    { generatedAt: "2026-11-20T00:00:00.000Z" },
  );
  const json = JSON.stringify(model);
  assert.doesNotMatch(json, /PRIVATE_PEER_NOTE|archived|بایگانی/);
  assert.equal(model.summary.students, 1);
  assert.equal(model.sessions[0].participants.length, 1);
  assert.equal(model.sessions[0].marks[0].value, 0);
  const backup = await f.service.snapshot();
  const session = backup.stores.records.find(
    (row) => row.logical === "session:session",
  ).value;
  assert.equal(session.roster.length, 2);
  assert.equal(session.attendance.archived, "late:12");
  assert.equal(session.scores[1].note, "PRIVATE_PEER_NOTE");
});
