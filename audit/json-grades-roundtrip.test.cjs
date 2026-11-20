"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

const year = "1405-1406",
  plain = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  const c = vm.createContext({
    structuredClone,
    TYPE_LABELS: { classGrade: "کلاسی", mostamar: "مستمر", payani: "پایانی" },
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
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/grade-drafts.js",
    "domain/annual-modules.js",
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
      fs.readFileSync(path.join(__dirname, "../src", source), "utf8"),
      c,
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
      decodeWorkspaceRecords: codec.decodeWorkspaceRecords,
      normalizeDB: c.normalizeDB,
      isSupportedGradeDraft: c.EduGradeDrafts.isSupportedGradeDraft,
      validateReportNotes() {},
      validateFrozenReport() {
        assert.fail("This fixture contains no frozen reports.");
      },
      validatedUndoCandidate() {
        assert.fail("This fixture contains no undo records.");
      },
    });
  function database(term = "اول") {
    const unit = (id) => ({ id, name: "واحد " + id, unitScores: {} }),
      raw = {
        schemaVersion: 26,
        settings: { academicYear: year, academicTerm: term, password: "" },
        schools: [
          {
            id: "school",
            name: "مدرسهٔ نمونه",
            classes: [
              {
                id: "classroom",
                name: "یازدهم",
                students: [{ id: "student", name: "هنرجوی فعال" }],
                archivedStudents: [{ id: "archived", name: "هنرجوی بایگانی" }],
                lessons: [
                  {
                    id: "dual",
                    name: "درس کاردانش",
                    gradeMode: "kardanesh",
                    gradingPolicy: c.EduPolicy.defaults("dual", year),
                    poudmans: [],
                    kardaneshScores: {
                      student: {
                        midtermPractical: 0,
                        midtermTheory: null,
                        practical: 19.999999999999996,
                        theory: Number.MIN_VALUE,
                      },
                      archived: { practical: 0, theory: 20 },
                    },
                  },
                  {
                    id: "general",
                    name: "درس عمومی",
                    gradeMode: "kardanesh",
                    gradingPolicy: {
                      ...c.EduPolicy.defaults("dual", year),
                      subjectType: "general",
                    },
                    poudmans: [],
                    kardaneshScores: { student: { theory: 0 } },
                  },
                  {
                    id: "ordinary",
                    name: "درس عادی قبلی",
                    gradeMode: "standard",
                    poudmans: [
                      {
                        id: "ordinary_pod",
                        name: "فصل",
                        units: [
                          {
                            ...unit("ordinary_unit"),
                            unitScores: {
                              student: { m: 0, p: 17.123456789123 },
                            },
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: "modular",
                    name: "درس پودمانی",
                    gradeMode: "standard",
                    gradingPolicy: c.EduPolicy.defaults("modular", year),
                    poudmans: [
                      {
                        id: "modular_pod",
                        name: "پودمان",
                        podScores: {
                          student: { m: 0, c: 2 },
                          archived: { m: null, c: 3 },
                        },
                        units: [unit("modular_one"), unit("modular_two")],
                      },
                    ],
                  },
                  {
                    id: "work_units",
                    name: "درس واحد کاری",
                    gradeMode: "standard",
                    gradingPolicy: {
                      ...c.EduPolicy.defaults("modular", year),
                      version: 2,
                      modularScope: "unit",
                      unitCount: 2,
                    },
                    poudmans: [
                      {
                        id: "work_pod",
                        name: "پودمان دارای دو واحد",
                        podScores: {},
                        units: [
                          {
                            ...unit("work_one"),
                            competencyScores: { student: { m: 0, c: 3 } },
                          },
                          {
                            ...unit("work_two"),
                            competencyScores: { student: { m: 4.5 } },
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
        sessions: [
          {
            id: "session",
            schoolId: "school",
            classId: "classroom",
            lessonId: "ordinary",
            date: "2026-10-01",
            period: 0,
            poudmanId: "ordinary_pod",
            unitId: "ordinary_unit",
            roster: [{ id: "student", name: "نام در زمان جلسه" }],
            attendance: { student: "present" },
            scores: [{ studentId: "student", type: "classGrade", value: 0 }],
          },
        ],
      };
    return c.normalizeDB(raw);
  }
  const lessons = (data) => data.schools[0].classes[0].lessons,
    lesson = (data, id) => lessons(data).find((item) => item.id === id),
    rows = (data, workspace = "first") =>
      [...codec.collectRecords(data)].map(([logical, value]) => ({
        key: workspace + "|" + logical,
        workspace,
        logical,
        value,
      })),
    backup = (data = database()) => ({
      format: "EduManager.FullBackup",
      version: 2,
      schemaVersion: 26,
      activeWorkspace: "first",
      stores: {
        catalog: [
          {
            id: "first",
            year,
            term: data.settings.academicTerm,
            termKind: "first",
            revision: 3,
            closed: false,
            createdAt: "2026-10-01T00:00:00Z",
          },
        ],
        records: rows(data),
        events: [],
        undo: [],
        reports: [],
        backups: [],
      },
      gradeDrafts: [],
    }),
    roundtrip = (data) => validate(plain(backup(data)))[0].data;
  return {
    c,
    codec,
    database,
    lessons,
    lesson,
    rows,
    backup,
    validate,
    roundtrip,
  };
}

test("school JSON round-trip preserves all grade modes, raw precision, null and zero", () => {
  const f = fixture(),
    source = f.database(),
    restored = f.roundtrip(source);
  assert.deepEqual(plain(restored), plain(source));
  const dual = f.lesson(restored, "dual").kardaneshScores.student;
  assert.equal(dual.midtermPractical, 0);
  assert.equal(dual.midtermTheory, null);
  assert.equal(dual.practical, 19.999999999999996);
  assert.equal(dual.theory, Number.MIN_VALUE);
  assert.equal(
    f.lesson(restored, "ordinary").poudmans[0].units[0].unitScores.student.p,
    17.123456789123,
  );
  assert.equal(f.lesson(restored, "general").kardaneshScores.student.final, 0);
  assert.equal(restored.sessions[0].scores[0].value, 0);
});

test("JSON decode recalculates forged dual totals from raw grades", () => {
  const f = fixture(),
    source = f.database(),
    grade = f.lesson(source, "dual").kardaneshScores.student;
  Object.assign(grade, { practical: 0, theory: 0, final: 20, passed: true });
  const result = f.lesson(f.roundtrip(source), "dual").kardaneshScores.student;
  assert.equal(result.practical, 0);
  assert.equal(result.theory, 0);
  assert.equal(result.final, 0);
  assert.equal(result.passed, false);
});

test("JSON preserves independent work units without creating a module total", () => {
  const f = fixture(),
    lesson = f.lesson(f.roundtrip(f.database()), "work_units"),
    result = f.c.EduPolicy.lesson(
      lesson.gradingPolicy,
      lesson.poudmans,
      "student",
    );
  assert.equal(lesson.poudmans[0].units[0].competencyScores.student.m, 0);
  assert.equal(lesson.poudmans[0].units[0].competencyScores.student.c, 3);
  assert.equal(lesson.poudmans[0].units[1].competencyScores.student.m, 4.5);
  assert.equal(
    Object.hasOwn(lesson.poudmans[0].units[1].competencyScores.student, "c"),
    false,
  );
  assert.equal(result.complete, false);
  assert.equal(result.final, null);
  assert.equal(result.provisionalAverage, null);
  assert.deepEqual(plain(lesson.poudmans[0].podScores), {});
});

test("JSON retains grades of archived students without making them active", () => {
  const f = fixture(),
    restored = f.roundtrip(f.database()),
    classroom = restored.schools[0].classes[0];
  assert.equal(
    classroom.students.some((student) => student.id === "archived"),
    false,
  );
  assert.equal(classroom.archivedStudents[0].id, "archived");
  assert.equal(
    f.lesson(restored, "dual").kardaneshScores.archived.practical,
    0,
  );
  assert.equal(
    f.lesson(restored, "modular").poudmans[0].podScores.archived.c,
    3,
  );
});

const gradeMaps = [
  ["dual", (lesson) => lesson.kardaneshScores],
  ["ordinary", (lesson) => lesson.poudmans[0].units[0].unitScores],
  ["modular", (lesson) => lesson.poudmans[0].podScores],
  ["work_units", (lesson) => lesson.poudmans[0].units[0].competencyScores],
];
for (const [id, getMap] of gradeMaps) {
  test("JSON rejects grades belonging to an unknown student: " + id, () => {
    const f = fixture(),
      source = f.database(),
      map = getMap(f.lesson(source, id));
    map.unknown_student = structuredClone(map.student);
    assert.throws(() => f.roundtrip(source), /دانش‌آموز|نمره/);
  });
  test("JSON rejects non-numeric and out-of-range raw marks: " + id, () => {
    const f = fixture();
    for (const value of [-0.5, 20.1, "18", true, {}, []]) {
      const source = f.database(),
        grade = getMap(f.lesson(source, id)).student,
        field = id === "dual" ? "theory" : "m";
      grade[field] = value;
      assert.throws(
        () => f.roundtrip(source),
        undefined,
        JSON.stringify(value),
      );
    }
  });
}

for (const id of ["modular", "work_units"])
  test("JSON rejects invalid competency and continuous steps: " + id, () => {
    const f = fixture(),
      getMap = gradeMaps.find(([kind]) => kind === id)[1];
    for (const [field, value] of [
      ["m", 4.75],
      ["m", 5.5],
      ["c", 0],
      ["c", 2.5],
    ]) {
      const source = f.database();
      getMap(f.lesson(source, id)).student[field] = value;
      assert.throws(() => f.roundtrip(source), /نمره/);
    }
  });

test("JSON rejects mixed module/work-unit official records and invented unit totals", () => {
  const f = fixture();
  for (const mutate of [
    (lesson) => (lesson.poudmans[0].podScores.student = { m: 5, c: 3 }),
    (lesson) =>
      (lesson.poudmans[0].units[0].competencyScores.student.final = 20),
  ]) {
    const source = f.database();
    mutate(f.lesson(source, "work_units"));
    assert.throws(() => f.roundtrip(source), /نمره|اجزای/);
  }
});

test("one JSON backup retains separate first/second term four-stage marks", () => {
  const f = fixture(),
    first = f.database(),
    second = f.database("دوم"),
    secondGrade = f.lesson(second, "dual").kardaneshScores.student;
  Object.assign(secondGrade, {
    midtermPractical: 11.5,
    midtermTheory: 12.5,
    practical: 13.5,
    theory: 14.5,
  });
  const file = f.backup(first);
  file.stores.catalog.push({
    ...file.stores.catalog[0],
    id: "second",
    term: "دوم",
    termKind: "second",
  });
  file.stores.records.push(...f.rows(second, "second"));
  const periods = f.validate(plain(file));
  assert.equal(periods.length, 2);
  const restoredFirst = f.lesson(periods[0].data, "dual").kardaneshScores
      .student,
    restoredSecond = f.lesson(periods[1].data, "dual").kardaneshScores.student;
  assert.equal(restoredFirst.midtermPractical, 0);
  assert.equal(restoredFirst.midtermTheory, null);
  assert.equal(restoredSecond.midtermPractical, 11.5);
  assert.equal(restoredSecond.midtermTheory, 12.5);
  assert.equal(restoredSecond.practical, 13.5);
  assert.equal(restoredSecond.theory, 14.5);
  restoredSecond.practical = 20;
  assert.equal(restoredFirst.practical, 19.999999999999996);
});

test("JSON keeps pending Persian grade inputs separate from committed marks", () => {
  const f = fixture(),
    file = f.backup(),
    raw = "۱۸٫۵";
  file.gradeDrafts = [
    {
      key: "Edu24.drafts.first.tab.document",
      workspace: "first",
      generation: 4,
      updatedAt: "2026-11-20T00:00:00Z",
      entries: [
        {
          kind: "k",
          classId: "classroom",
          lid: "dual",
          sid: "student",
          field: "theory",
          value: raw,
          review: true,
        },
      ],
    },
  ];
  const prepared = f.validate.prepare(plain(file));
  assert.equal(prepared.value.gradeDrafts[0].entries[0].value, raw);
  assert.equal(prepared.value.gradeDrafts[0].entries[0].review, true);
  assert.equal(
    f.lesson(prepared.periods[0].data, "dual").kardaneshScores.student.theory,
    Number.MIN_VALUE,
  );
});

function draftFile(f, entry) {
  const file = f.backup();
  file.gradeDrafts = [
    {
      key: "Edu24.drafts.first.tab.document",
      workspace: "first",
      generation: 1,
      updatedAt: "2026-11-20T00:00:00Z",
      entries: [
        {
          kind: "k",
          classId: "classroom",
          lid: "dual",
          sid: "student",
          pid: "",
          uid: "",
          field: "theory",
          value: "۱۸٫۵",
          ...entry,
        },
      ],
    },
  ];
  return file;
}

test("JSON rejects malformed declared draft identity, field and deletion flags", () => {
  const f = fixture();
  for (const patch of [
    { classId: {} },
    { lid: null },
    { sid: "__proto__" },
    { sid: "toString" },
    { pid: [] },
    { uid: 4 },
    { field: "wrong" },
    { kind: "k", field: "m" },
    { kind: "u", field: "c" },
    { kind: "pod", field: "p" },
    { kind: "unit", field: "practical" },
    { remove: "false" },
    { remove: 1 },
    { review: "true" },
  ]) {
    const file = draftFile(f, patch),
      before = JSON.stringify(file);
    assert.throws(() => f.validate(file), /پیش‌نویس/, JSON.stringify(patch));
    assert.equal(JSON.stringify(file), before);
  }
});

test("JSON draft validation preserves invalid raw text, genuine booleans and legacy context", () => {
  const f = fixture();
  for (const raw of ["", "۲۱", "unfinished text", "۹".repeat(2000)]) {
    for (const remove of [undefined, false, true]) {
      const file = draftFile(f, { value: raw, remove, review: true }),
        prepared = f.validate.prepare(plain(file));
      assert.equal(prepared.value.gradeDrafts[0].entries[0].value, raw);
      assert.equal(prepared.value.gradeDrafts[0].entries[0].remove, remove);
    }
  }
  const legacy = draftFile(f, {});
  legacy.gradeDrafts[0].entries = [{ kind: "k", value: "نامعتبر ولی محفوظ" }];
  assert.equal(
    f.validate.prepare(legacy).value.gradeDrafts[0].entries[0].value,
    "نامعتبر ولی محفوظ",
  );
});

test("newest malformed draft flags cannot silently revive an older valid edit", () => {
  const f = fixture(),
    old = draftFile(f, { value: "10" }).gradeDrafts[0],
    newest = {
      ...old,
      key: "Edu24.drafts.first.tab.new_document",
      generation: 2,
      entries: [{ ...old.entries[0], value: "18", remove: "false" }],
    },
    before = JSON.stringify([old, newest]);
  assert.throws(
    () =>
      f.c.EduGradeDrafts.portableGradeDrafts([old, newest], [{ id: "first" }]),
    (error) => error.code === "GRADE_DRAFT_INVALID",
  );
  assert.equal(JSON.stringify([old, newest]), before);
});
