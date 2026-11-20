"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

const plain = (value) => JSON.parse(JSON.stringify(value));

// Use the production database normalizer, workspace record codec, attendance
// domain and complete-backup validator. No live database or real student data.
function fixture() {
  const c = vm.createContext({
    structuredClone,
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
    "legacy/core/formatting.js",
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/attendance-reminders.js",
    "domain/reporting/attendance.js",
    "workspace/domain/defaults-numbers.js",
    "legacy/validation/database.js",
    "legacy/students/roster.js",
    "workspace/grading/scope.js",
    "workspace/courses/rules.js",
    "workspace/validation/database.js",
    "data/workspace-records.js",
    "validation/full-backup.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
      c,
      { filename: name },
    );
  c.old.validateDB = c.legacy_validateDB;
  const codec = c.EduWorkspaceRecords.create({
      clone: structuredClone,
      normalizeDB: c.normalizeDB,
      isDataObject: c.isDataObject,
      isSafeRecordId: c.isSafeRecordId,
    }),
    validate = c.EduFullBackupValidator.create({
      backupStores: [
        "catalog",
        "records",
        "events",
        "backups",
        "undo",
        "reports",
      ],
      assertSafeDataTree: c.assertSafeDataTree,
      isDataObject: c.isDataObject,
      isSafeRecordId: c.isSafeRecordId,
      validateReportNotes: c.validateReportNotes,
      decodeWorkspaceRecords: codec.decodeWorkspaceRecords,
      normalizeDB: c.normalizeDB,
      validateFrozenReport() {
        throw Error("This attendance fixture has no frozen reports");
      },
      validatedUndoCandidate() {
        throw Error("This attendance fixture has no undo records");
      },
      isSupportedGradeDraft: () => false,
    }),
    historical = [
      "present",
      "absent",
      "leave",
      "late",
      "zero",
      "maximum",
      "unset",
      "transferred",
    ].map((id) => ({ id, name: "Historical " + id, code: "Code_" + id })),
    data = {
      schemaVersion: 26,
      settings: {
        academicYear: "1405-1406",
        academicTerm: "اول",
        password: "",
      },
      schools: [
        {
          id: "school",
          name: "Synthetic school",
          classes: [
            {
              id: "class",
              name: "Original class",
              students: [
                ...historical
                  .filter((student) => student.id !== "transferred")
                  .map((student) => ({
                    ...student,
                    name: "Current " + student.id,
                  })),
                { id: "newcomer", name: "Enrolled after the session" },
              ],
              archivedStudents: [
                { id: "transferred", name: "Current transferred name" },
              ],
              lessons: [
                {
                  id: "lesson",
                  name: "Synthetic lesson",
                  gradeMode: "standard",
                  poudmans: [
                    {
                      id: "pod",
                      name: "Section",
                      units: [{ id: "unit", name: "Unit", unitScores: {} }],
                    },
                  ],
                },
              ],
            },
            {
              id: "target_class",
              name: "Transfer target class",
              students: [{ id: "transferred", name: "Transferred student" }],
              archivedStudents: [],
              lessons: [
                {
                  id: "target_lesson",
                  name: "Other lesson",
                  gradeMode: "standard",
                  poudmans: [],
                },
              ],
            },
          ],
        },
      ],
      sessions: [
        {
          id: "session",
          schoolId: "school",
          classId: "class",
          lessonId: "lesson",
          date: "2026-11-01",
          period: 0,
          poudmanId: "pod",
          unitId: "unit",
          attendance: {
            present: "present",
            absent: "absent",
            leave: "leave",
            late: "late",
            zero: "late:0",
            maximum: "late:999",
            transferred: "present",
          },
          scores: [
            {
              studentId: "present",
              type: "classGrade",
              value: 0,
              note: "Explicit zero remains a recorded observation",
            },
            { studentId: "transferred", type: "positive", value: 2 },
          ],
          roster: historical,
        },
        {
          id: "target_session",
          schoolId: "school",
          classId: "target_class",
          lessonId: "target_lesson",
          date: "2026-11-01",
          period: 0,
          poudmanId: null,
          unitId: null,
          attendance: { transferred: "absent" },
          scores: [],
          roster: [{ id: "transferred", name: "Target historical name" }],
        },
      ],
      masterSchedule: {},
      activeDays: [0, 1, 2, 3, 4, 5],
      periods: 6,
      notHeldSessions: [],
    };

  function backup(source = data) {
    const second = structuredClone(source);
    second.settings.academicTerm = "دوم";
    second.sessions = [
      {
        ...structuredClone(source.sessions[0]),
        date: "2027-03-01",
        attendance: { present: "absent", absent: "present" },
        scores: [],
      },
    ];
    const periods = [
      { id: "first", term: "اول", termKind: "first", data: source },
      { id: "second", term: "دوم", termKind: "second", data: second },
    ];
    return plain({
      format: "EduManager.FullBackup",
      version: 2,
      schemaVersion: 26,
      activeWorkspace: "first",
      exportedAt: "2026-11-20T12:00:00.000Z",
      gradeDrafts: [],
      stores: {
        catalog: periods.map(({ id, term, termKind }) => ({
          id,
          term,
          termKind,
          year: "1405-1406",
          revision: 4,
          closed: false,
          createdAt: "2026-09-23T00:00:00.000Z",
        })),
        records: periods.flatMap(({ id, data: value }) =>
          [...codec.collectRecords(value)].map(([logical, record]) => ({
            key: id + "|" + logical,
            workspace: id,
            logical,
            value: record,
          })),
        ),
        events: [],
        backups: [],
        undo: [],
        reports: [],
      },
    });
  }

  return { c, codec, validate, historical, data, backup };
}

function sessionRecord(backup) {
  return backup.stores.records.find(
    (row) => row.workspace === "first" && row.logical === "session:session",
  ).value;
}

test("JSON attendance round-trip preserves every status, unset, zero grade and historical roster across terms and transfers", () => {
  const f = fixture(),
    source = f.backup(),
    before = JSON.stringify(source),
    restored = f.validate(source);
  assert.equal(JSON.stringify(source), before);
  assert.equal(restored.length, 2);
  assert.deepEqual(plain(restored[0].data.sessions), f.data.sessions);
  assert.deepEqual(plain(restored[0].data.sessions[0].roster), f.historical);
  assert.equal(
    Object.hasOwn(restored[0].data.sessions[0].attendance, "unset"),
    false,
  );
  assert.equal(restored[0].data.sessions[0].scores[0].value, 0);
  assert.equal(restored[0].data.sessions[1].attendance.transferred, "absent");
  assert.equal(restored[1].data.sessions[0].attendance.present, "absent");
  assert.equal(restored[1].data.sessions[0].date, "2027-03-01");
  assert.equal(restored[0].data.sessions[0].roster.length, 8);
  assert.equal(
    restored[0].data.sessions[0].roster.some(
      (student) => student.id === "newcomer",
    ),
    false,
  );

  const counts = f.c.EduReportAttendance.emptyCounts();
  for (const student of restored[0].data.sessions[0].roster)
    f.c.EduReportAttendance.tally(
      counts,
      f.c.EduReportAttendance.normalize(
        restored[0].data.sessions[0].attendance[student.id],
      ),
    );
  assert.deepEqual(plain(counts), {
    present: 2,
    absent: 1,
    leave: 1,
    late: 3,
    unknown: 1,
    lateMinutes: 999,
    lateMinutesRecorded: 2,
  });
});

for (const invalid of [
  "",
  null,
  false,
  0,
  "unset",
  "unknown",
  "Late",
  "late:-1",
  "late:1.5",
  "late:1000",
  "late:",
  "late:۱",
  "late:1abc",
  "present:1",
])
  test(
    "complete JSON backup rejects invalid attendance " +
      JSON.stringify(invalid),
    () => {
      const f = fixture(),
        backup = f.backup();
      sessionRecord(backup).attendance.present = invalid;
      const input = JSON.stringify(backup);
      assert.throws(() => f.validate(JSON.parse(input)), /وضعیت حضور/);
      assert.equal(JSON.stringify(backup), input);
    },
  );

for (const [name, mutate] of [
  [
    "nonhistorical attendance member",
    (x) => (x.attendance.newcomer = "present"),
  ],
  ["unknown attendance member", (x) => (x.attendance.missing = "present")],
  [
    "nonhistorical score member",
    (x) =>
      x.scores.push({ studentId: "newcomer", type: "classGrade", value: 10 }),
  ],
  [
    "unknown score member",
    (x) => x.scores.push({ studentId: "missing", type: "positive", value: 1 }),
  ],
  ["duplicated historical member", (x) => x.roster.push({ ...x.roster[0] })],
  [
    "unknown historical member",
    (x) => x.roster.push({ id: "missing", name: "Missing" }),
  ],
  ["wrong session school", (x) => (x.schoolId = "missing")],
  ["lesson from another class", (x) => (x.lessonId = "target_lesson")],
  ["unit without its module", (x) => (x.poudmanId = null)],
  ["unknown module", (x) => (x.poudmanId = "missing")],
  ["unknown unit", (x) => (x.unitId = "missing")],
  ["nonexistent calendar day", (x) => (x.date = "2026-02-30")],
  ["negative bell", (x) => (x.period = -1)],
  ["fractional bell", (x) => (x.period = 0.5)],
  ["thirteenth bell", (x) => (x.period = 12)],
  ["string bell", (x) => (x.period = "0")],
  ["null attendance container", (x) => (x.attendance = null)],
  ["array attendance container", (x) => (x.attendance = [])],
  ["empty historical roster with recorded attendance", (x) => (x.roster = [])],
  ["null score container", (x) => (x.scores = null)],
  ["negative recorded grade", (x) => (x.scores[0].value = -1)],
  ["recorded grade above twenty", (x) => (x.scores[0].value = 21)],
  ["null recorded grade", (x) => (x.scores[0].value = null)],
  ["string recorded grade", (x) => (x.scores[0].value = "12")],
  ["unknown observation type", (x) => (x.scores[0].type = "missing")],
  ["nontext observation note", (x) => (x.scores[0].note = false)],
  ["explicit null historical roster", (x) => (x.roster = null)],
  ["explicit false historical roster", (x) => (x.roster = false)],
  ["explicit zero historical roster", (x) => (x.roster = 0)],
  ["explicit empty-string historical roster", (x) => (x.roster = "")],
  ["false module ID", (x) => (x.poudmanId = false)],
  ["zero module ID", (x) => (x.poudmanId = 0)],
  ["false work-unit ID", (x) => (x.unitId = false)],
  ["zero work-unit ID", (x) => (x.unitId = 0)],
  ["object historical student code", (x) => (x.roster[0].code = {})],
])
  test("complete JSON backup rejects " + name + " before replacement", () => {
    const f = fixture(),
      backup = f.backup();
    mutate(sessionRecord(backup));
    const serialized = JSON.stringify(backup);
    assert.throws(() => f.validate(JSON.parse(serialized)));
    assert.equal(JSON.stringify(backup), serialized);
  });

test("same-class same-day same-bell duplicate sessions fail, while another class may use the same bell", () => {
  const f = fixture(),
    backup = f.backup();
  assert.equal(f.validate(backup).length, 2);
  const duplicate = structuredClone(
    backup.stores.records.find(
      (row) => row.workspace === "first" && row.logical === "session:session",
    ),
  );
  duplicate.logical = "session:duplicate";
  duplicate.key = "first|session:duplicate";
  duplicate.value.id = "duplicate";
  backup.stores.records.push(duplicate);
  assert.throws(() => f.validate(plain(backup)), /جلسه تکراری/);
});

test("historical bell count and out-of-year session dates are preserved with a warning", () => {
  const f = fixture(),
    backup = f.backup(),
    session = sessionRecord(backup);
  session.period = 11;
  session.date = "2025-11-01";
  const [restored] = f.validate(backup);
  assert.equal(restored.data.periods, 6);
  assert.equal(restored.data.sessions[0].period, 11);
  assert.equal(restored.data.sessions[0].date, "2025-11-01");
  assert.ok(
    restored.data.migrationWarnings.some((warning) =>
      warning.startsWith("جلسات خارج از سال تحصیلی:"),
    ),
  );
});

test("omitted old historical roster migrates from recorded members without enrolling current newcomers", () => {
  const f = fixture(),
    data = structuredClone(f.data);
  delete data.sessions[0].roster;
  const restored = f.c.normalizeDB(plain(data));
  assert.deepEqual(
    plain(restored.sessions[0].roster.map((student) => student.id)).sort(),
    Object.keys(data.sessions[0].attendance).sort(),
  );
  assert.equal(restored.sessions[0].attendance.transferred, "present");
  assert.equal(restored.sessions[0].scores[0].value, 0);
  assert.equal(Object.hasOwn(data.sessions[0], "roster"), false);
});

test("legacy-only orphan recovery preserves evidence and requests names; current JSON rejects the orphan", () => {
  const f = fixture(),
    input = structuredClone(f.data),
    session = input.sessions[0];
  session.attendance.orphan = "leave";
  session.scores.push({ studentId: "orphan", type: "classGrade", value: 0 });
  assert.throws(() => f.c.normalizeDB(plain(input)), /فهرست تاریخی/);
  input.schemaVersion = 23;
  const before = JSON.stringify(input),
    recovered = f.c.normalizeDB(plain(input), { legacy: true });
  assert.equal(JSON.stringify(input), before);
  assert.equal(recovered.sessions[0].attendance.orphan, "leave");
  assert.equal(recovered.sessions[0].scores.at(-1).value, 0);
  assert.ok(
    recovered.sessions[0].roster.some((student) => student.id === "orphan"),
  );
  assert.ok(
    recovered.schools[0].classes[0].archivedStudents.some(
      (student) => student.id === "orphan" && student.recovered === true,
    ),
  );
  assert.ok(
    recovered.migrationWarnings.some((warning) => warning.includes("orphan")),
  );
});

test("local historical backup JSON receives the same attendance validation as active workspace records", () => {
  const f = fixture(),
    backup = f.backup();
  backup.stores.backups.push({
    id: "local_copy",
    workspace: "first",
    at: "2026-11-20T12:00:00.000Z",
    label: "Synthetic local historical copy",
    db: structuredClone(f.data),
  });
  assert.equal(f.validate(plain(backup)).length, 2);
  backup.stores.backups[0].db.sessions[0].attendance.present = "late:1000";
  assert.throws(() => f.validate(plain(backup)), /وضعیت حضور/);
});

test("JSON prototype keys in attendance never enter restoration records", () => {
  const f = fixture(),
    backup = f.backup();
  sessionRecord(backup).attendance = JSON.parse(
    '{"present":"present","__proto__":"absent"}',
  );
  assert.throws(() => f.validate(plain(backup)), /کلید غیرمجاز/);
});

test("historical attendance record cannot claim another term or a mismatched record key", () => {
  const f = fixture();
  for (const mutate of [
    (row) => (row.workspace = "second"),
    (row) => (row.key = "second|session:session"),
    (row) => (row.value.id = "different_session"),
  ]) {
    const backup = f.backup(),
      row = backup.stores.records.find(
        (item) =>
          item.workspace === "first" && item.logical === "session:session",
      );
    mutate(row);
    assert.throws(() => f.validate(plain(backup)));
  }
});

for (const [name, mutate] of [
  ["null settings", (meta) => (meta.settings = null)],
  ["false master schedule", (meta) => (meta.masterSchedule = false)],
  ["null active days", (meta) => (meta.activeDays = null)],
  ["false archived students", (_meta, cls) => (cls.archivedStudents = false)],
  ["null lesson list", (_meta, cls) => (cls.lessons = null)],
  [
    "false vocational grade map",
    (_meta, cls) => (cls.lessons[0].kardaneshScores = false),
  ],
  [
    "null unit grade map",
    (_meta, cls) => (cls.lessons[0].poudmans[0].units[0].unitScores = null),
  ],
  [
    "false score application options",
    (_meta, cls) => (cls.lessons[0].poudmans[0].units[0].applyOptions = false),
  ],
])
  test(
    "full JSON backup rejects " +
      name +
      " instead of replacing it with empty defaults",
    () => {
      const f = fixture(),
        backup = f.backup(),
        meta = backup.stores.records.find(
          (row) => row.workspace === "first" && row.logical === "meta",
        ).value,
        cls = backup.stores.records.find(
          (row) => row.workspace === "first" && row.logical === "class:class",
        ).value;
      mutate(meta, cls);
      const serialized = JSON.stringify(backup);
      assert.throws(() => f.validate(JSON.parse(serialized)));
      assert.equal(JSON.stringify(backup), serialized);
    },
  );

for (const invalid of [null, false, 0, "", {}])
  test(
    "raw JSON rejects explicit malformed session container " +
      JSON.stringify(invalid),
    () => {
      const f = fixture(),
        data = structuredClone(f.data);
      data.sessions = invalid;
      const serialized = JSON.stringify(data);
      assert.throws(() => f.c.normalizeDB(JSON.parse(serialized)));
      assert.equal(JSON.stringify(data), serialized);
    },
  );

test("omitted optional containers migrate while an explicit empty session roster stays empty", () => {
  const f = fixture(),
    source = structuredClone(f.data);
  source.sessions[0].roster = [];
  source.sessions[0].attendance = {};
  source.sessions[0].scores = [];
  for (const key of [
    "masterSchedule",
    "activeDays",
    "periods",
    "notHeldSessions",
  ])
    delete source[key];
  const cls = source.schools[0].classes[0],
    lesson = cls.lessons[0],
    unit = lesson.poudmans[0].units[0];
  delete lesson.kardaneshScores;
  delete unit.unitScores;
  delete unit.applyOptions;
  delete cls.archivedStudents;
  source.sessions = [source.sessions[0]];
  const normalized = f.c.normalizeDB(plain(source));
  assert.deepEqual(plain(normalized.sessions[0].roster), []);
  assert.deepEqual(plain(normalized.sessions[0].attendance), {});
  assert.deepEqual(plain(normalized.sessions[0].scores), []);
  assert.deepEqual(
    plain(normalized.schools[0].classes[0].archivedStudents),
    [],
  );
  assert.deepEqual(plain(normalized.masterSchedule), {});
  assert.deepEqual(plain(normalized.notHeldSessions), []);
  assert.equal(normalized.periods, 6);
  assert.equal(normalized.activeDays.length, 6);
  assert.deepEqual(
    plain(f.c.normalizeDB(plain(normalized))),
    plain(normalized),
  );
});

test("genuinely omitted old session and lesson lists still receive compatible defaults", () => {
  const f = fixture(),
    source = structuredClone(f.data);
  delete source.sessions;
  delete source.schools[0].classes[0].lessons;
  delete source.schools[0].classes[0].archivedStudents;
  const normalized = f.c.normalizeDB(plain(source));
  assert.deepEqual(plain(normalized.sessions), []);
  assert.deepEqual(plain(normalized.schools[0].classes[0].lessons), []);
  assert.deepEqual(
    plain(normalized.schools[0].classes[0].archivedStudents),
    [],
  );
});

test("unset optional session module and work-unit IDs preserve supported old representations", () => {
  const f = fixture();
  for (const empty of [undefined, null, ""]) {
    const backup = f.backup(),
      session = sessionRecord(backup);
    if (empty === undefined) {
      delete session.poudmanId;
      delete session.unitId;
    } else {
      session.poudmanId = empty;
      session.unitId = empty;
    }
    assert.equal(f.validate(plain(backup)).length, 2);
  }
});

for (const location of ["students", "archivedStudents", "roster"])
  for (const invalid of [null, {}, [], true, 1.5, Number.MAX_SAFE_INTEGER + 1])
    test(
      "JSON rejects corrupt student code in " +
        location +
        ": " +
        JSON.stringify(invalid),
      () => {
        const f = fixture(),
          source = plain(f.data),
          members =
            location === "roster"
              ? source.sessions[0].roster
              : source.schools[0].classes[0][location];
        members[0].code = invalid;
        const serialized = JSON.stringify(source);
        assert.throws(() => f.c.normalizeDB(JSON.parse(serialized)), /کد/);
        assert.equal(JSON.stringify(source), serialized);
      },
    );

test("safe legacy numeric codes migrate to text without changing membership or historical names", () => {
  const f = fixture(),
    source = plain(f.data),
    cls = source.schools[0].classes[0];
  cls.students[0].code = 123;
  cls.archivedStudents[0].code = 0;
  source.sessions[0].roster[0].code = 123;
  const serialized = JSON.stringify(source),
    normalized = f.c.normalizeDB(JSON.parse(serialized));
  assert.equal(normalized.schools[0].classes[0].students[0].code, "123");
  assert.equal(normalized.schools[0].classes[0].archivedStudents[0].code, "0");
  assert.equal(normalized.sessions[0].roster[0].code, "123");
  assert.equal(normalized.sessions[0].roster[0].name, "Historical present");
  assert.equal(JSON.stringify(source), serialized);
});

test("text student codes keep leading zeros and historical spelling through JSON", () => {
  const f = fixture(),
    source = plain(f.data);
  source.schools[0].classes[0].students[0].code = "۰۰۱۲";
  source.sessions[0].roster[0].code = "۰۰۱۲";
  const normalized = f.c.normalizeDB(plain(source));
  assert.equal(normalized.schools[0].classes[0].students[0].code, "0012");
  assert.equal(normalized.sessions[0].roster[0].code, "۰۰۱۲");
  assert.deepEqual(
    plain(f.c.normalizeDB(plain(normalized))),
    plain(normalized),
  );
});
