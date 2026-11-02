"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  crypto = require("node:crypto");
const context = vm.createContext({ structuredClone, crypto });
for (const file of [
  "domain/calendar.js",
  "domain/academic-year.js",
  "domain/data-boundary.js",
  "domain/grade-math.js",
  "domain/grade-policy.js",
  "domain/reporting/academic-results.js",
  "domain/deputy-exchange.js",
])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
    context,
  );
const exchange = context.EduDeputyExchange,
  clone = structuredClone,
  json = (value) => JSON.parse(JSON.stringify(value));
function fixture({ two = false, modular = false, general = false } = {}) {
  const policy = json(
    context.EduPolicy.defaults(modular ? "modular" : "dual", "1405-1406"),
  );
  if (general) policy.subjectType = "general";
  const lesson = {
      id: "lesson",
      name: "درس آزمایشی",
      teacher: "دبیر آزمایشی",
      gradeMode: modular ? "standard" : "kardanesh",
      gradingPolicy: policy,
      kardaneshScores: modular
        ? {}
        : {
            student: {
              practical: 0,
              theory: 20,
              midtermPractical: 10,
              midtermTheory: 10,
              final: 999,
              secret: "no",
            },
          },
      poudmans: modular
        ? [
            {
              id: "pod",
              name: "پودمان اول",
              podScores: { student: { m: 0, c: 3 } },
              units: [
                {
                  id: "unit",
                  name: "واحد اول",
                  unitScores: { student: { m: 0, p: 20 } },
                },
              ],
            },
          ]
        : [],
    },
    data = {
      settings: { academicYear: "1405-1406", password: "private-password" },
      schools: [
        {
          id: "school",
          name: "مدرسهٔ آزمایشی",
          confidential: "no",
          classes: [
            {
              id: "classroom",
              name: "کلاس آزمایشی",
              grade: "11",
              field: "رشته",
              students: [
                {
                  id: "student",
                  name: "هنرجوی آزمایشی",
                  code: "100",
                  privateNote: "no",
                },
              ],
              archivedStudents: [
                { id: "old_student", name: "هنرجوی بایگانی", code: "200" },
              ],
              lessons: [lesson],
            },
          ],
        },
        { id: "other_school", name: "مدرسهٔ دیگر", classes: [] },
      ],
      sessions: [
        {
          id: "session",
          schoolId: "school",
          classId: "classroom",
          lessonId: "lesson",
          date: "2026-10-27",
          period: 0,
          roster: [{ id: "student", name: "نام تاریخی", code: "100" }],
          attendance: { student: "late:0" },
          scores: [
            {
              studentId: "student",
              type: "classGrade",
              value: 0,
              note: "یادداشت",
            },
          ],
          password: "no",
        },
      ],
      backups: ["do-not-export"],
      undo: ["no"],
      drafts: ["no"],
      events: ["no"],
    },
    first = {
      period: {
        id: "term_first",
        year: "1405-1406",
        termKind: "first",
        revision: 1,
        closed: false,
      },
      data,
    };
  const parts = [first];
  if (two) {
    const second = clone(first);
    Object.assign(second.period, { id: "term_second", termKind: "second" });
    Object.assign(second.data.sessions[0], {
      id: "session_second",
      date: "2027-03-27",
    });
    parts.push(second);
  }
  return {
    sender: { code: "teacher-1", name: "دبیر آزمایشی" },
    schoolId: "school",
    schoolCode: "school-1",
    parts,
    packetId: "packet_1",
    exportedAt: "2026-11-02T10:00:00.000Z",
  };
}
const packet = (options) => exchange.build(fixture(options));
const error = (code) => (failure) => failure.code === code;
test("deputy export uses a strict privacy whitelist and does not mutate teacher data", () => {
  const source = fixture(),
    before = clone(source),
    output = exchange.build(source),
    text = JSON.stringify(output);
  assert.deepEqual(source, before);
  for (const secret of [
    "password",
    "backups",
    "undo",
    "drafts",
    "events",
    "privateNote",
    "confidential",
    "other_school",
    "999",
  ])
    assert.ok(!text.includes(secret), secret);
  assert.equal(output.scope, "school-year");
  assert.equal(output.school.code, "SCHOOL-1");
  assert.equal(output.sender.code, "TEACHER-1");
  assert.equal(
    output.periods[0].school.classes[0].lessons[0].kardaneshScores.student
      .practical,
    0,
  );
  assert.equal(output.periods[0].sessions[0].scores[0].value, 0);
  assert.equal(output.periods[0].sessions[0].roster[0].name, "نام تاریخی");
});
test("deputy validation returns a detached packet", () => {
  const original = packet(),
    validated = exchange.validate(original);
  original.periods[0].sessions[0].attendance.student = "absent";
  assert.equal(validated.periods[0].sessions[0].attendance.student, "late:0");
});
test("deputy same payload and revision are idempotent regardless of delivery id/time or object key order", () => {
  const original = packet(),
    repeated = clone(original);
  repeated.id = "resend";
  repeated.exportedAt = "2026-11-02T11:00:00.000Z";
  repeated.sender = { name: repeated.sender.name, code: repeated.sender.code };
  assert.equal(exchange.plan(original, repeated).status, "duplicate");
  const first = exchange.plan(null, original);
  assert.equal(first.status, "new");
  assert.deepEqual(json(first.counts), {
    periods: 1,
    classes: 1,
    students: 2,
    lessons: 1,
    sessions: 1,
    activities: 1,
  });
});
test("deputy full-scope newer snapshots expose deletion and update counts", () => {
  const original = packet(),
    update = clone(original);
  update.periods[0].revision++;
  update.periods[0].sessions = [];
  update.periods[0].school.classes[0].archivedStudents = [];
  const plan = exchange.plan(original, update);
  assert.equal(plan.status, "update");
  assert.equal(plan.removed.sessions, 1);
  assert.equal(plan.removed.activities, 1);
  assert.equal(plan.removed.students, 1);
});
test("deputy rejects older, missing prior term, collided school and changed source term", () => {
  const original = packet({ two: true }),
    old = clone(original);
  old.periods[0].revision = 0;
  assert.throws(() => exchange.plan(original, old), error("DEPUTY_STALE"));
  const missing = clone(original);
  missing.periods.pop();
  assert.throws(() => exchange.plan(original, missing), error("DEPUTY_STALE"));
  const changed = clone(original);
  changed.periods[0].id = "new_term";
  assert.throws(
    () => exchange.plan(original, changed),
    error("DEPUTY_COLLISION"),
  );
  const collision = clone(original);
  collision.school.id = "other";
  for (const part of collision.periods) {
    part.school.id = "other";
    part.sessions[0].schoolId = "other";
  }
  assert.throws(
    () => exchange.plan(original, collision),
    error("DEPUTY_COLLISION"),
  );
});
test("deputy rejects different content with equal source revision", () => {
  const original = packet(),
    conflict = clone(original);
  conflict.periods[0].sessions[0].attendance.student = "absent";
  assert.throws(
    () => exchange.plan(original, conflict),
    error("DEPUTY_CONFLICT"),
  );
  const identity = clone(original);
  identity.sender.name = "نام دیگر";
  const metadata = exchange.plan(original, identity);
  assert.equal(metadata.status, "update");
  assert.equal(metadata.metadataChanged, true);
  assert.equal(metadata.updatedPeriods.length, 0);
});
test("deputy streams remain separate by school code, sender code and academic year, never by names", () => {
  const first = packet(),
    second = clone(first);
  second.sender.code = "TEACHER-2";
  assert.notEqual(exchange.key(first), exchange.key(second));
  second.sender.code = first.sender.code;
  second.school.code = "SCHOOL-2";
  assert.notEqual(exchange.key(first), exchange.key(second));
});
test("deputy transfer excludes legacy out-of-year sessions and rejects imports spanning another year", () => {
  const source = fixture();
  const old = clone(source.parts[0].data.sessions[0]);
  old.id = "old_session";
  old.date = "2025-10-27";
  source.parts[0].data.sessions.push(old);
  assert.equal(exchange.build(source).periods[0].sessions.length, 1);
  const imported = packet();
  imported.periods[0].sessions[0].date = "2025-10-27";
  assert.throws(() => exchange.validate(imported));
  const multi = fixture({ two: true });
  multi.parts[1].period.year = "1406-1407";
  assert.throws(() => exchange.build(multi));
});
test("deputy rejects malformed dates, clocks, codes, versions and unknown payload fields", () => {
  const mutations = [
    (p) => {
      p.periods[0].sessions[0].date = "2026-02-30";
    },
    (p) => {
      p.exportedAt = "2026-02-30T10:00:00.000Z";
    },
    (p) => {
      p.scope = "partial";
    },
    (p) => {
      p.version = 2;
    },
    (p) => {
      p.sender.code = "a b";
    },
    (p) => {
      p.school.code = "lowercase";
    },
    (p) => {
      p.settings = { password: "no" };
    },
    (p) => {
      p.periods[0].revision = 0.5;
    },
    (p) => {
      p.periods[0].school.classes[0].students[0].name = "x".repeat(1001);
    },
  ];
  for (const mutate of mutations) {
    const p = packet();
    mutate(p);
    assert.throws(() => exchange.validate(p));
  }
  assert.equal(exchange.normalizeCode(" ۱۴۰۵-ab "), "1405-AB");
});
test("deputy rejects prototype pollution, cycles, excessive depth and executable properties", () => {
  const polluted = packet();
  polluted.periods[0].sessions[0].attendance = JSON.parse(
    '{"__proto__":"present"}',
  );
  assert.throws(() => exchange.validate(polluted));
  const cycle = packet();
  cycle.self = cycle;
  assert.throws(() => exchange.validate(cycle));
  const deep = packet();
  let tail = deep;
  for (let i = 0; i < 35; i++) {
    tail.deep = {};
    tail = tail.deep;
  }
  assert.throws(() => exchange.validate(deep));
  const executable = packet();
  Object.defineProperty(executable, "danger", {
    enumerable: true,
    get() {
      throw Error("must not execute");
    },
  });
  assert.throws(
    () => exchange.validate(executable),
    (failure) => !failure.message.includes("must not execute"),
  );
});
test("deputy rejects duplicate IDs and broken class, roster, attendance, activity and grade references", () => {
  const mutations = [
    (p) => {
      p.periods[0].school.classes.push(clone(p.periods[0].school.classes[0]));
    },
    (p) => {
      p.periods[0].school.classes[0].archivedStudents.push(
        clone(p.periods[0].school.classes[0].students[0]),
      );
    },
    (p) => {
      p.periods[0].sessions[0].classId = "missing";
    },
    (p) => {
      p.periods[0].sessions[0].roster[0].id = "missing";
    },
    (p) => {
      p.periods[0].sessions[0].attendance.old_student = "present";
    },
    (p) => {
      p.periods[0].sessions[0].scores[0].studentId = "missing";
    },
    (p) => {
      p.periods[0].school.classes[0].lessons[0].kardaneshScores.missing = {
        practical: 10,
      };
    },
    (p) => {
      p.periods[0].sessions.push({
        ...clone(p.periods[0].sessions[0]),
        id: "another",
      });
    },
  ];
  for (const mutate of mutations) {
    const p = packet();
    mutate(p);
    assert.throws(() => exchange.validate(p));
  }
});
test("deputy rejects invalid numeric values without treating zero as missing", () => {
  for (const invalid of [-1, 21, NaN, Infinity, "18"]) {
    const p = packet();
    p.periods[0].school.classes[0].lessons[0].kardaneshScores.student.practical =
      invalid;
    assert.throws(() => exchange.validate(p));
  }
  const p = packet();
  p.periods[0].sessions[0].scores[0].type = "bad";
  assert.throws(() => exchange.validate(p));
  assert.equal(exchange.gradeRows(packet())[0].stages[1].practical, 0);
  assert.equal(exchange.gradeRows(packet())[0].stages[1].final, 6);
});
test("deputy readonly grade rows contain four term stages, direct general grades and annual modules once", () => {
  const dual = exchange
    .gradeRows(packet({ two: true }))
    .find((row) => row.studentId === "student");
  assert.equal(dual.stages.length, 4);
  assert.deepEqual(
    json(dual.stages.map((stage) => [stage.termKind, stage.stage])),
    [
      ["first", "midterm"],
      ["first", "final"],
      ["second", "midterm"],
      ["second", "final"],
    ],
  );
  assert.equal(dual.stages[1].final, 6);
  const general = exchange
    .gradeRows(packet({ general: true }))
    .find((row) => row.studentId === "student");
  assert.equal(general.kind, "general");
  assert.equal(general.stages[1].practical, null);
  assert.equal(general.stages[1].final, 20);
  const modular = exchange
    .gradeRows(packet({ two: true, modular: true }))
    .find((row) => row.studentId === "student");
  assert.equal(modular.kind, "modular");
  assert.equal(modular.modules.length, 1);
  assert.equal(modular.modules[0].m, 0);
  assert.equal(modular.modules[0].final, 15);
  assert.equal(modular.stages.length, 0);
  assert.equal(modular.result.final, 15);
});
test("deputy refuses conflicting annual modular scores and invalid competency increments", () => {
  const p = packet({ two: true, modular: true });
  p.periods[1].school.classes[0].lessons[0].poudmans[0].podScores.student.m = 1;
  assert.throws(() => exchange.validate(p), error("DEPUTY_ANNUAL_CONFLICT"));
  for (const [field, amount] of [
    ["c", 0],
    ["c", 2.5],
    ["m", 0.3],
  ]) {
    const invalid = packet({ modular: true });
    invalid.periods[0].school.classes[0].lessons[0].poudmans[0].podScores.student[
      field
    ] = amount;
    assert.throws(() => exchange.validate(invalid));
  }
});
test("deputy legacy fixed-term labels are supported without admitting arbitrary or summer terms", () => {
  const source = fixture();
  delete source.parts[0].period.termKind;
  source.parts[0].period.term = "اول";
  assert.equal(exchange.build(source).periods[0].termKind, "first");
  source.parts[0].period.term = "تابستان";
  assert.throws(() => exchange.build(source));
  source.parts[0].period.term = "اول";
  source.parts[0].period.termKind = "second";
  assert.equal(exchange.build(source).periods[0].termKind, "second");
});
test("deputy bounded tree rejects excess volume before copying or storing input", () => {
  assert.throws(
    () =>
      exchange.assertSafeTree({ value: "x".repeat(100) }, { maxBytes: 100 }),
    error("DEPUTY_SIZE_LIMIT"),
  );
  assert.throws(() =>
    exchange.assertSafeTree({ value: [1, 2, 3] }, { maxNodes: 2 }),
  );
  assert.equal(exchange.maxBytes, 32 * 1024 * 1024);
});
test("deputy legacy grade rows expose raw historical unit grades per term without inventing a formal final", () => {
  const source = fixture({ two: true, modular: true });
  for (const part of source.parts) {
    const lesson = part.data.schools[0].classes[0].lessons[0];
    delete lesson.gradingPolicy;
    lesson.poudmans[0].podScores = {};
  }
  const output = exchange.build(source),
    row = exchange
      .gradeRows(output)
      .find((item) => item.studentId === "student");
  assert.equal(row.kind, "legacy");
  assert.equal(row.units.length, 2);
  assert.equal(row.units[0].termKind, "first");
  assert.equal(row.units[0].m, 0);
  assert.equal(row.units[0].p, 20);
  assert.equal(row.units[1].termKind, "second");
  assert.equal(row.result, null);
  assert.equal(row.stages.length, 0);
});
test("deputy rejects same-identity dual lessons with conflicting grading rules across terms", () => {
  const p = packet({ two: true });
  for (const term of p.periods)
    term.school.classes[0].lessons[0].gradingPolicy.dualConfigurable = true;
  p.periods[1].school.classes[0].lessons[0].gradingPolicy.practicalWeight = 50;
  assert.throws(() => exchange.validate(p), error("DEPUTY_ANNUAL_CONFLICT"));
});
test("deputy export does not silently hide malformed source dates as out-of-year history", () => {
  const source = fixture();
  source.parts[0].data.sessions[0].date = "not-a-date";
  assert.throws(() => exchange.build(source));
});
test("deputy top-level school name must match the latest canonical term, independent of array order", () => {
  const p = packet({ two: true });
  p.school.name = "مدرسهٔ متفاوت";
  assert.throws(() => exchange.validate(p));
  p.periods[1].school.name = p.school.name;
  p.periods.reverse();
  assert.equal(exchange.validate(p).school.name, "مدرسهٔ متفاوت");
});
test("deputy activity preview compares multisets rather than array positions", () => {
  const before = packet(),
    old = before.periods[0].sessions[0].scores[0],
    second = {
      studentId: "student",
      type: "homework",
      value: 1,
      note: "تمرین",
    };
  before.periods[0].sessions[0].scores.push(second, clone(second));
  const reordered = clone(before);
  reordered.periods[0].revision++;
  reordered.periods[0].sessions[0].scores.reverse();
  const unchanged = exchange.plan(before, reordered);
  assert.equal(unchanged.added.activities, 0);
  assert.equal(unchanged.removed.activities, 0);
  const deduplicated = clone(reordered);
  deduplicated.periods[0].sessions[0].scores = [clone(old), clone(second)];
  const removedDuplicate = exchange.plan(before, deduplicated);
  assert.equal(removedDuplicate.removed.activities, 1);
  assert.equal(removedDuplicate.added.activities, 0);
  const replaced = clone(before);
  replaced.periods[0].revision++;
  replaced.periods[0].sessions[0].scores[0] = {
    studentId: "student",
    type: "activity",
    value: 7,
    note: "فعالیت متفاوت",
  };
  const change = exchange.plan(before, replaced);
  assert.equal(change.removed.activities, 1);
  assert.equal(change.added.activities, 1);
  assert.equal(change.counts.activities, 3);
});
test("deputy change preview reports status observations, not unique students or unknown roster entries", () => {
  const before = packet(),
    next = clone(before);
  next.periods[0].revision++;
  next.periods[0].sessions[0].attendance.student = "absent";
  assert.equal(exchange.plan(before, next).changed.attendance, 1);
  delete next.periods[0].sessions[0].attendance.student;
  assert.equal(exchange.plan(before, next).changed.attendance, 1);
  const unknown = clone(next);
  unknown.periods[0].revision++;
  unknown.periods[0].sessions[0].roster.push({
    id: "old_student",
    name: "هنرجوی بایگانی",
  });
  assert.equal(exchange.plan(next, unknown).changed.attendance, 0);
  const repeat = clone(before);
  repeat.id = "resend";
  assert.deepEqual(json(exchange.plan(before, repeat).changed), {
    attendance: 0,
    assessments: 0,
    policies: 0,
  });
});
test("deputy change preview distinguishes raw numeric zero from clearing and normalizes null versus missing", () => {
  const before = packet(),
    cleared = clone(before);
  cleared.periods[0].revision++;
  cleared.periods[0].school.classes[0].lessons[0].kardaneshScores.student.practical =
    null;
  const delta = exchange.plan(before, cleared);
  assert.equal(delta.changed.assessments, 1);
  assert.equal(delta.changed.policies, 0);
  assert.equal(delta.added.students, 0);
  assert.equal(delta.removed.students, 0);
  const missing = clone(cleared);
  missing.periods[0].revision++;
  delete missing.periods[0].school.classes[0].lessons[0].kardaneshScores.student
    .practical;
  assert.equal(exchange.plan(cleared, missing).changed.assessments, 0);
  const general = packet({ general: true }),
    obsolete = clone(general);
  obsolete.periods[0].revision++;
  obsolete.periods[0].school.classes[0].lessons[0].kardaneshScores.student.practical = 18;
  assert.equal(exchange.plan(general, obsolete).changed.assessments, 0);
});
test("deputy change preview deduplicates annual modular grades but not distinct term assessments", () => {
  const before = packet({ two: true, modular: true }),
    next = clone(before);
  for (const term of next.periods) {
    term.revision++;
    term.school.classes[0].lessons[0].poudmans[0].podScores.student.m = 1;
  }
  assert.equal(exchange.plan(before, next).changed.assessments, 1);
  const firstOnly = clone(before);
  firstOnly.periods.pop();
  assert.equal(exchange.plan(firstOnly, before).changed.assessments, 0);
  const dual = packet({ two: true }),
    dualNext = clone(dual);
  for (const term of dualNext.periods) {
    term.revision++;
    term.school.classes[0].lessons[0].kardaneshScores.student.theory = 19;
  }
  assert.equal(exchange.plan(dual, dualNext).changed.assessments, 2);
});
test("deputy change preview detects per-lesson/term policy records without depending on record order", () => {
  const before = packet(),
    next = clone(before);
  next.periods[0].revision++;
  next.periods[0].school.classes[0].lessons[0].gradingPolicy.passMin = 15;
  assert.equal(exchange.plan(before, next).changed.policies, 1);
  const same = clone(before);
  same.periods[0].revision++;
  same.periods[0].school.classes[0].lessons[0].gradingPolicy =
    Object.fromEntries(
      Object.entries(
        same.periods[0].school.classes[0].lessons[0].gradingPolicy,
      ).reverse(),
    );
  assert.deepEqual(json(exchange.plan(before, same).changed), {
    attendance: 0,
    assessments: 0,
    policies: 0,
  });
});
test("deputy exact compact JSON byte budget includes punctuation, numeric text and UTF-8", () => {
  for (const value of [{ x: 1234567890 }, { x: "é" }, { x: "😀" }]) {
    const exact = Buffer.byteLength(JSON.stringify(value), "utf8");
    assert.throws(
      () => exchange.assertSafeTree(value, { maxBytes: exact - 1 }),
      error("DEPUTY_SIZE_LIMIT"),
    );
    assert.doesNotThrow(() =>
      exchange.assertSafeTree(value, { maxBytes: exact }),
    );
  }
});
test("deputy JSON byte measurement cannot execute inherited serialization hooks", () => {
  let calls = 0;
  const executable = Object.create({
    toJSON() {
      calls++;
      return {};
    },
  });
  executable.x = 1;
  assert.throws(() => exchange.assertSafeTree(executable));
  const accessor = Object.create(
    Object.defineProperty({}, "toJSON", {
      get() {
        calls++;
        return () => ({});
      },
    }),
  );
  accessor.x = 1;
  assert.throws(() => exchange.assertSafeTree(accessor));
  assert.equal(calls, 0);
});
test("deputy large valid school payload fits compact export while pretty printing would create an unreadable file", () => {
  const p = packet(),
    classroom = p.periods[0].school.classes[0],
    lesson = classroom.lessons[0];
  classroom.students = Array.from({ length: 950 }, (_, index) => ({
    id: "s" + String(index).padStart(4, "0"),
    name: "S",
  }));
  classroom.archivedStudents = [];
  delete lesson.gradingPolicy;
  lesson.gradeMode = "standard";
  lesson.kardaneshScores = {};
  lesson.poudmans = Array.from({ length: 20 }, (_, pod) => ({
    id: "pod_" + pod,
    name: "P",
    podScores: {},
    units: Array.from({ length: 10 }, (_, unit) => ({
      id: "unit_" + pod + "_" + unit,
      name: "U",
      unitScores: Object.fromEntries(
        classroom.students.map((student) => [student.id, { m: 0, p: 0 }]),
      ),
    })),
  }));
  const session = p.periods[0].sessions[0];
  session.roster = [{ id: "s0000", name: "S" }];
  session.attendance = {};
  session.scores = Array.from({ length: 900 }, () => ({
    studentId: "s0000",
    type: "activity",
    value: 0,
    note: "x".repeat(10000),
  }));
  exchange.validate(p);
  assert.ok(Buffer.byteLength(JSON.stringify(p), "utf8") <= exchange.maxBytes);
  assert.ok(
    Buffer.byteLength(JSON.stringify(p, null, 2), "utf8") > exchange.maxBytes,
  );
});
test("deputy sparse or excessive arrays are rejected before JSON serialization can allocate their output", () => {
  let serialized = 0;
  const isolated = vm.createContext({
    structuredClone,
    JSON: {
      stringify() {
        serialized++;
        throw Error("must not serialize");
      },
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/domain/deputy-exchange.js"),
      "utf8",
    ),
    isolated,
  );
  const smallSparse = [1, 2];
  delete smallSparse[0];
  const disguisedSparse = [1, 2];
  delete disguisedSparse[0];
  disguisedSparse.extra = 3;
  for (const value of [Array(1000000000), smallSparse, disguisedSparse])
    assert.throws(
      () => isolated.EduDeputyExchange.assertSafeTree(value),
      (failure) => !failure.message.includes("must not serialize"),
    );
  assert.equal(serialized, 0);
  assert.doesNotThrow(() => exchange.assertSafeTree([1, null, { value: 0 }]));
});
