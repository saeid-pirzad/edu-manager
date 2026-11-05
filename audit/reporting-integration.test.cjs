"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

const preparedAt = "2026-11-02T09:30:00.000Z",
  plain = (value) => JSON.parse(JSON.stringify(value)),
  load = (context, file) =>
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      context,
      { filename: file },
    );

function fixture({ host = false } = {}) {
  class ExplicitDate extends Date {
    constructor(...args) {
      if (!args.length && !host) throw Error("ambient clock must not be read");
      super(...(args.length ? args : [preparedAt]));
    }
    static now() {
      throw Error("ambient clock must not be read");
    }
  }
  const context = vm.createContext({ structuredClone, Date: ExplicitDate });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
    "domain/reporting/academic-results.js",
  ])
    load(context, file);
  for (const name of ["db", "workspace", "document", "localStorage", "window"])
    Object.defineProperty(context, name, {
      get() {
        throw Error("host dependency read: " + name);
      },
    });
  if (host) {
    context.root = context;
    load(context, "reports/periodic/date-range.js");
    load(context, "reports/periodic/model.js");
    load(context, "workspace/grading/results.js");
  }
  return context;
}

function sourceFixture() {
  const a = { id: "a", name: "CURRENT_A", code: "001" },
    b = { id: "b", name: "PRIVATE_OTHER_STUDENT", code: "002" },
    archived = { id: "archived", name: "ARCHIVED_STUDENT", code: "003" },
    d = { id: "d", name: "PARALLEL_CLASS_STUDENT", code: "004" };
  return {
    settings: {
      academicYear: "1405-1406",
      academicTerm: "اول",
      password: "PRIVATE_PASSWORD",
    },
    followups: [{ note: "PRIVATE_DEPUTY_FOLLOWUP" }],
    schools: [
      {
        id: "school",
        name: "مدرسهٔ آزمون",
        classes: [
          {
            id: "class",
            name: "کلاس اول",
            students: [a, b],
            archivedStudents: [archived],
            lessons: [{ id: "lesson", name: "درس اول", teacher: "دبیر اول" }],
          },
          {
            id: "parallel",
            name: "کلاس موازی",
            students: [d],
            archivedStudents: [],
            lessons: [
              { id: "other-lesson", name: "درس دوم", teacher: "دبیر دوم" },
            ],
          },
        ],
      },
      { id: "other-school", name: "PRIVATE_OTHER_SCHOOL", classes: [] },
    ],
    sessions: [
      {
        id: "first",
        schoolId: "school",
        classId: "class",
        lessonId: "lesson",
        date: "2026-11-01",
        period: 0,
        roster: [{ ...a, name: "HISTORICAL_A" }, b, archived],
        attendance: { a: "late:0", b: "absent", archived: "leave" },
        scores: [
          {
            studentId: "a",
            type: "classGrade",
            value: 0,
            note: "zero is real",
          },
          { studentId: "a", type: "activity" },
          {
            studentId: "b",
            type: "classGrade",
            value: 18,
            note: "PRIVATE_OTHER_ACTIVITY",
          },
        ],
      },
      {
        id: "second",
        schoolId: "school",
        classId: "class",
        lessonId: "lesson",
        date: "2026-11-01",
        period: 1,
        roster: [a, archived],
        attendance: { a: "present" },
        scores: [],
      },
      {
        id: "parallel-session",
        schoolId: "school",
        classId: "parallel",
        lessonId: "other-lesson",
        date: "2026-11-01",
        period: 0,
        roster: [d],
        attendance: { d: "present" },
        scores: [],
      },
    ],
  };
}

const options = (extra = {}) => ({
    mode: "daily",
    date: "2026-11-01",
    schoolId: "school",
    audience: "management",
    ...extra,
  }),
  build = (context, source, input = options()) =>
    context.EduReportModel.build(source, input, { generatedAt: preparedAt }),
  deepFreeze = (value) => {
    if (value && typeof value === "object") {
      Object.freeze(value);
      for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
  };

test("shared periodic projection is deterministic with explicit time and no host or ambient-clock dependencies", () => {
  const c = fixture(),
    source = deepFreeze(sourceFixture()),
    input = deepFreeze(options()),
    before = JSON.stringify({ source, input });
  const first = build(c, source, input),
    second = build(c, source, input);
  assert.deepEqual(plain(first), plain(second));
  assert.equal(first.generatedAt, preparedAt);
  assert.equal(JSON.stringify({ source, input }), before);
  assert.equal(first.format, "EduManager.PeriodicReport");
  assert.equal(first.version, 1);
  assert.throws(() => c.EduReportModel.build(source, input), /زمان/);
  assert.throws(
    () => c.EduReportModel.build(source, input, { generatedAt: "invalid" }),
    /زمان/,
  );
});

test("teacher public build wrapper preserves the exact shared report DTO and fixed host timestamp", () => {
  const c = fixture({ host: true }),
    source = sourceFixture();
  assert.deepEqual(
    plain(c.build(source, options())),
    plain(
      c.EduReportModel.build(source, options(), {
        generatedAt: preparedAt,
        collisionScope: "teacher",
      }),
    ),
  );
  assert.equal(vm.runInContext("range", c), c.EduReportDates.range);
  assert.equal(vm.runInContext("addDays", c), c.EduReportDates.addDays);
  assert.equal(vm.runInContext("isoDate", c), c.EduReportDates.isoDate);
});

test("shared parent projection excludes other pupils, classes, passwords and private notes before rendering", () => {
  const c = fixture(),
    source = deepFreeze(sourceFixture()),
    report = build(
      c,
      source,
      options({ audience: "parent", classId: "class", studentId: "a" }),
    ),
    text = JSON.stringify(report);
  assert.equal(report.detailLevel, "full");
  assert.equal(report.summary.sessions, 2);
  assert.equal(report.summary.students, 1);
  assert.ok(
    report.sessions.every((session) =>
      session.participants.every((person) => person.studentId === "a"),
    ),
  );
  assert.ok(
    report.sessions.every((session) =>
      session.marks.every((mark) => mark.studentId === "a"),
    ),
  );
  for (const secret of [
    "PRIVATE_OTHER_STUDENT",
    "PRIVATE_OTHER_ACTIVITY",
    "PRIVATE_PASSWORD",
    "PRIVATE_DEPUTY_FOLLOWUP",
    "PRIVATE_OTHER_SCHOOL",
    "PARALLEL_CLASS_STUDENT",
    "ARCHIVED_STUDENT",
  ])
    assert.ok(!text.includes(secret), secret);
});

test("historical rosters, archived pupils and raw zero/missing activities survive shared projection unchanged", () => {
  const c = fixture(),
    source = sourceFixture(),
    report = build(c, source);
  assert.equal(
    report.sessions[0].participants.find((person) => person.studentId === "a")
      .name,
    "HISTORICAL_A",
  );
  assert.equal(
    report.sessions[0].participants.find(
      (person) => person.studentId === "archived",
    ).attendance.status,
    "leave",
  );
  assert.equal(
    report.sessions
      .find((session) => session.id === "second")
      .participants.find((person) => person.studentId === "archived").attendance
      .status,
    "unknown",
  );
  assert.deepEqual(
    plain(
      report.sessions[0].participants
        .find((person) => person.studentId === "a")
        .scores.map((score) => score.value),
    ),
    [0, null],
  );
  assert.equal(report.summary.present, 2);
  assert.equal(report.summary.late, 1);
  assert.equal(report.summary.lateMinutes, 0);
  assert.equal(report.summary.lateMinutesRecorded, 1);
  assert.equal(report.summary.absent, 1);
  assert.equal(report.summary.leave, 1);
  assert.equal(report.summary.unknown, 1);
  assert.equal(report.summary.attendanceRate, 75);
  assert.equal(report.currentGrades.length, 0);
});

test("parallel classes in the same bell do not produce a duplicate-slot warning", () => {
  const report = build(fixture(), sourceFixture());
  assert.equal(report.summary.sessions, 3);
  assert.equal(
    report.warnings.some((warning) => warning.includes("بیش از یک جلسه")),
    false,
  );
});

test("the actual teacher adapter detects the teacher's occupied bell across different classes without changing the shared school's default class scope", () => {
  const c = fixture({ host: true }),
    source = sourceFixture();
  source.schools[0].classes[1].lessons[0].teacher =
    source.schools[0].classes[0].lessons[0].teacher;
  const school = build(c, source),
    teacher = c.EduReportModel.build(source, options(), {
      generatedAt: preparedAt,
      collisionScope: "teacher",
    }),
    actual = c.build(source, options());
  assert.equal(
    school.warnings.some((warning) => warning.includes("بیش از یک جلسه")),
    false,
  );
  assert.equal(
    teacher.warnings.filter((warning) => warning.includes("بیش از یک جلسه"))
      .length,
    1,
  );
  assert.deepEqual(plain(actual), plain(teacher));
  assert.equal(actual.summary.sessions, 3);
});

test("shared report collision scope rejects unsupported values rather than silently broadening its meaning", () => {
  const c = fixture(),
    source = sourceFixture();
  for (const collisionScope of ["student", "Teacher", "", null, 1, {}, true])
    assert.throws(
      () =>
        c.EduReportModel.build(source, options(), {
          generatedAt: preparedAt,
          collisionScope,
        }),
      String(collisionScope),
    );
});

test("two distinct sessions in the same class and bell still expose a duplicate-slot warning", () => {
  const source = sourceFixture();
  source.sessions.push({
    ...structuredClone(source.sessions[0]),
    id: "conflicting-session",
  });
  const report = build(fixture(), source);
  assert.equal(report.summary.sessions, 4);
  assert.equal(
    report.warnings.filter((warning) => warning.includes("بیش از یک جلسه"))
      .length,
    1,
  );
});

test("tuple keys do not merge pipe-containing class/student or class/lesson identities", () => {
  const source = sourceFixture();
  source.schools[0].classes = [
    {
      id: "x|y",
      name: "کلاس یک",
      students: [{ id: "z", name: "یک" }],
      lessons: [{ id: "l", name: "درس یک" }],
    },
    {
      id: "x",
      name: "کلاس دو",
      students: [{ id: "y|z", name: "دو" }],
      lessons: [{ id: "y|l", name: "درس دو" }],
    },
  ];
  source.sessions = source.schools[0].classes.map((classroom, index) => ({
    id: "tuple-" + index,
    schoolId: "school",
    classId: classroom.id,
    lessonId: classroom.lessons[0].id,
    date: "2026-11-01",
    period: 0,
    roster: classroom.students,
    attendance: {},
    scores: [],
  }));
  const report = build(fixture(), source);
  assert.equal(report.summary.students, 2);
  assert.equal(report.lessons.length, 2);
  assert.equal(report.students.length, 2);
  assert.equal(report.warnings.length, 0);
});

test("historical annual session metadata remains separate from current class and course labels", () => {
  const source = sourceFixture();
  Object.assign(source.sessions[0], {
    academicTerm: "اول",
    sourcePeriodId: "first",
    annualMetadata: {
      className: "کلاس تاریخی",
      lessonName: "درس تاریخی",
      teacher: "دبیر تاریخی",
    },
  });
  const report = build(fixture(), source, options({ mode: "annual" }));
  const session = report.sessions.find((item) => item.id === "first");
  assert.equal(session.className, "کلاس تاریخی");
  assert.equal(session.lessonName, "درس تاریخی");
  assert.equal(session.teacher, "دبیر تاریخی");
  assert.equal(session.academicTerm, "اول");
  assert.equal(session.sourcePeriodId, "first");
});

test("custom weekly ranges include exactly their endpoints without shifting to Saturday", () => {
  const c = fixture(),
    source = sourceFixture();
  const input = options({
    mode: "weekly",
    date: "2026-11-01",
    startDate: "2026-11-01",
    endDate: "2026-11-01",
  });
  const result = build(c, source, input);
  assert.equal(result.start, input.startDate);
  assert.equal(result.end, input.endDate);
  assert.ok(
    result.sessions.every((session) => session.date === input.startDate),
  );
  assert.equal(result.days.length, 1);
  assert.throws(
    () => build(c, source, { ...input, endDate: "2026-10-31" }),
    /پایان/,
  );
  assert.throws(
    () => build(c, source, { ...input, endDate: "2026-02-30" }),
    /تاریخ/,
  );
});

test("shared date ranges retain Saturday-Friday weeks, actual Jalali leap months and academic-year boundaries", () => {
  const { EduReportDates: dates } = fixture();
  assert.deepEqual(plain(dates.range("weekly", "2026-11-01")), {
    start: "2026-10-31",
    end: "2026-11-06",
  });
  assert.deepEqual(plain(dates.range("monthly", "2025-03-20")), {
    start: "2025-02-19",
    end: "2025-03-20",
  });
  assert.deepEqual(plain(dates.range("monthly", "2027-03-20")), {
    start: "2027-02-20",
    end: "2027-03-20",
  });
  assert.deepEqual(plain(dates.range("annual", "2026-11-01", "1405-1406")), {
    start: "2026-09-23",
    end: "2027-09-22",
  });
  for (const value of ["2026-03-08", "2026-11-01"])
    assert.equal(
      +dates.isoDate(dates.addDays(value, 1)) - +dates.isoDate(value),
      86400000,
    );
  for (const value of [
    "2026-02-30",
    "2026-13-01",
    "1405/08/10",
    "",
    " 2026-11-01",
  ])
    assert.throws(() => dates.range("daily", value), /تاریخ/);
  assert.throws(() => dates.range("unknown", "2026-11-01"), /نوع گزارش/);
});

test("teacher assessment adapter and deputy machine projection use the same actual shared grades for all four stages", () => {
  const c = fixture({ host: true });
  load(c, "domain/deputy-exchange.js");
  const policy = plain(c.EduPolicy.defaults("dual", "1405-1406")),
    lesson = {
      id: "lesson",
      name: "درس عملی نظری",
      gradeMode: "kardanesh",
      gradingPolicy: { ...policy, dualConfigurable: true, practicalWeight: 60 },
      kardaneshScores: {
        student: {
          practical: 0,
          theory: 20,
          midtermPractical: 10,
          midtermTheory: 20,
        },
      },
      poudmans: [],
    },
    classroom = {
      id: "class",
      name: "کلاس",
      students: [{ id: "student", name: "هنرجو", code: "001" }],
      archivedStudents: [],
      lessons: [lesson],
    },
    parts = ["first", "second"].map((termKind) => ({
      period: { id: termKind, year: "1405-1406", termKind, revision: 1 },
      data: {
        schools: [{ id: "school", name: "مدرسه", classes: [classroom] }],
        sessions: [],
      },
    })),
    before = JSON.stringify(parts),
    packet = c.EduDeputyExchange.build({
      sender: { code: "TEACHER", name: "دبیر" },
      schoolId: "school",
      schoolCode: "SCHOOL",
      parts,
      packetId: "integration",
      exportedAt: preparedAt,
    }),
    row = c.EduDeputyExchange.gradeRows(packet)[0];
  assert.equal(row.stages.length, 4);
  for (const stage of row.stages) {
    const { termKind, stage: kind, ...actual } = stage;
    assert.ok(["first", "second"].includes(termKind));
    assert.deepEqual(
      plain(actual),
      plain(c.assessmentResult(lesson, "student", kind)),
    );
    assert.deepEqual(
      plain(actual),
      plain(c.EduReportGrades.assessment(lesson, "student", kind)),
    );
  }
  assert.deepEqual(plain(c.assessmentWeights(lesson)), {
    practical: 60,
    theory: 40,
  });
  assert.equal(row.stages.find((item) => item.stage === "final").final, 8);
  assert.equal(JSON.stringify(parts), before);
});

test("shared reporting APIs are frozen and expose only their explicit host-independent contracts", () => {
  const c = fixture();
  for (const [name, methods] of [
    [
      "EduReportAttendance",
      [
        "normalize",
        "emptyCounts",
        "tally",
        "attendanceRate",
        "summarizeObservations",
      ],
    ],
    ["EduReportDates", ["isoDate", "addDays", "range"]],
    ["EduReportModel", ["build"]],
    [
      "EduReportGrades",
      ["settings", "weights", "assessment", "annual", "modular"],
    ],
  ]) {
    const api = c[name];
    assert.equal(Object.isFrozen(api), true, name);
    assert.deepEqual(Object.keys(api).sort(), [...methods].sort(), name);
    for (const method of methods)
      assert.equal(typeof api[method], "function", name + "." + method);
    assert.throws(() => {
      api.extra = () => {};
    }, TypeError);
  }
});

test("both application shells load the actual shared reporting bundle after policies and before every consumer", () => {
  const c = vm.createContext({ structuredClone });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
  ])
    load(c, file);
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../assets/scripts/reporting-core.js"),
      "utf8",
    ),
    c,
    { filename: "reporting-core.js" },
  );
  assert.deepEqual(
    plain(build(c, sourceFixture())),
    plain(build(fixture(), sourceFixture())),
  );
  const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../source-map.json"), "utf8"),
    ),
    bundle = manifest.bundles.find(
      (entry) => entry.output === "assets/scripts/reporting-core.js",
    );
  assert.deepEqual(bundle.sources, [
    "src/domain/reporting/attendance.js",
    "src/domain/reporting/date-ranges.js",
    "src/domain/reporting/periodic-model.js",
    "src/domain/reporting/academic-results.js",
  ]);
  for (const [file, consumers] of [
    [
      "EduManager.html",
      ["deputy-exchange.js", "workspace-runtime.js", "periodic-reports.js"],
    ],
  ]) {
    const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
      scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(
        (match) => match[1].split("/").pop(),
      ),
      index = scripts.indexOf("reporting-core.js");
    assert.equal(
      scripts.filter((name) => name === "reporting-core.js").length,
      1,
      file,
    );
    assert.ok(
      index > scripts.indexOf("grade-policy.js") &&
        scripts.indexOf("grade-policy.js") >= 0,
      file,
    );
    for (const consumer of consumers)
      assert.ok(scripts.indexOf(consumer) > index, file + ":" + consumer);
  }
});

test("actual report date ranges are identical in isolated UTC, Tehran, Los Angeles and Apia processes across DST and calendar edges", () => {
  const { spawnSync } = require("node:child_process"),
    files = [
      "domain/calendar.js",
      "domain/academic-year.js",
      "domain/reporting/date-ranges.js",
    ].map((file) => path.join(__dirname, "../src", file)),
    script = `
      const fs = require("node:fs"), vm = require("node:vm"), context = vm.createContext({});
      for (const file of ${JSON.stringify(files)})
        vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
      const dates = context.EduReportDates;
      process.stdout.write(JSON.stringify({
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        results: {
          daily: dates.range("daily", "2026-03-08"),
          weekly: dates.range("weekly", "2026-11-01"),
          leapMonth: dates.range("monthly", "2025-03-20"),
          nonLeapMonth: dates.range("monthly", "2027-03-20"),
          annual: dates.range("annual", "2026-11-01", "1405-1406"),
          followingDays: ["2026-03-08", "2026-11-01", "2025-03-20", "2026-03-20", "2026-12-31", "2011-12-29"].map(value => dates.addDays(value, 1))
        }
      }));
    `,
    expected = {
      daily: { start: "2026-03-08", end: "2026-03-08" },
      weekly: { start: "2026-10-31", end: "2026-11-06" },
      leapMonth: { start: "2025-02-19", end: "2025-03-20" },
      nonLeapMonth: { start: "2027-02-20", end: "2027-03-20" },
      annual: { start: "2026-09-23", end: "2027-09-22" },
      followingDays: [
        "2026-03-09",
        "2026-11-02",
        "2025-03-21",
        "2026-03-21",
        "2027-01-01",
        "2011-12-30",
      ],
    };
  for (const zone of [
    "UTC",
    "Asia/Tehran",
    "America/Los_Angeles",
    "Pacific/Apia",
  ]) {
    const child = spawnSync(process.execPath, ["-e", script], {
      env: { ...process.env, TZ: zone },
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, zone + ": " + child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.zone, zone, "the child must actually run in " + zone);
    assert.deepEqual(result.results, expected, zone);
  }
});
