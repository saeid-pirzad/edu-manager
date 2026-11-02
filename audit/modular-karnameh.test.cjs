"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  const c = vm.createContext({
    structuredClone,
    workspace: { id: "first", year: "1405-1406", term: "اول" },
    esc: (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    getSortedStudents: (classroom) => classroom.students,
    knownStudents: (classroom) => [
      ...classroom.students,
      ...(classroom.archivedStudents || []),
    ],
    db: { schools: [], sessions: [] },
  });
  for (const file of [
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/reporting/academic-results.js",
    "domain/annual-modules.js",
    "workspace/domain/defaults-numbers.js",
    "legacy/grading/calculation.js",
    "legacy/grading/kardanesh.js",
    "workspace/grading/results.js",
    "workspace/reports/student.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  c.old = { calcStudentLesson: c.legacy_calcStudentLesson };
  return c;
}

function module(id, name, grade) {
  return {
    id,
    name,
    units: [],
    podScores: grade ? { student: grade } : {},
  };
}

function modular(c, pods, overrides = {}) {
  return {
    id: "modular",
    name: "درس پودمانی",
    gradeMode: "fani",
    gradingPolicy: c.EduPolicy.defaults("modular", "1405-1406"),
    poudmans: pods,
    ...overrides,
  };
}

function classroom(lessons) {
  return {
    id: "class",
    name: "کلاس",
    students: [{ id: "student", name: "هنرجو" }],
    archivedStudents: [],
    lessons,
  };
}

function part(lessons, term) {
  return {
    period: { id: term === "اول" ? "first" : "second", term },
    data: {
      sessions: [],
      schools: [{ id: "school", classes: [classroom(lessons)] }],
    },
  };
}

function sections(html, className) {
  const starts = [
    ...html.matchAll(
      new RegExp(
        '<([a-z][a-z0-9]*)\\b[^>]*class="[^"\\n]*\\b' +
          className +
          '\\b[^"\\n]*"[^>]*>',
        "g",
      ),
    ),
  ];
  return starts.map((start) => {
    const tags = new RegExp("<(\\/?)" + start[1] + "\\b[^>]*>", "g");
    tags.lastIndex = start.index + start[0].length;
    let depth = 1;
    for (const match of html.matchAll(tags)) {
      depth += match[1] ? -1 : 1;
      if (!depth) return html.slice(start.index, match.index + match[0].length);
    }
    throw Error("Unclosed report markup: " + className);
  });
}

function textNodes(html) {
  return [...html.matchAll(/>([^<>]+)</g)].map((match) => match[1].trim());
}

test("modular karnameh reveals completed modules even while the course remains incomplete", () => {
  const c = fixture();
  const lesson = modular(c, [
    module("complete", "پودمان ثبت‌شده", { m: 3.5, c: 3 }),
    module("pending", "پودمان ثبت‌نشده"),
  ]);
  assert.equal(c.calcV24(classroom([lesson]), lesson, "student").final, null);
  const html = c.modularOverviewCell(lesson, "student");
  const rows = sections(html, "report-module-row");
  assert.equal(rows.length, 2);
  assert.match(rows[0], /پودمان ثبت‌شده/);
  for (const value of ["3.5", "3", "18.50"])
    assert.ok(textNodes(rows[0]).includes(value), value);
  assert.match(rows[1], /پودمان ثبت‌نشده/);
  assert.equal(textNodes(rows[1]).filter((value) => value === "—").length, 3);
  assert.doesNotMatch(html, /report-grade-status|نیازمند جبران|قبول/);
});

test("failed modules keep numeric results and zero mostamar is not treated as missing", () => {
  const c = fixture();
  const lesson = modular(c, [
    module("zero", "نمره صفر مستمر", { m: 0, c: 1 }),
    module("failed", "نمره پایین", { m: 1, c: 1 }),
  ]);
  const result = c.calcV24(classroom([lesson]), lesson, "student");
  assert.equal(result.complete, true);
  assert.equal(result.passed, false);
  assert.equal(result.final, null);
  const html = c.modularOverviewCell(lesson, "student");
  const rows = sections(html, "report-module-row");
  assert.ok(textNodes(rows[0]).includes("0"));
  assert.ok(textNodes(rows[0]).includes("5.00"));
  assert.ok(textNodes(rows[1]).includes("6.00"));
  assert.doesNotMatch(html, /report-grade-status|نیازمند جبران|قبول/);
});

test("partially entered module preserves its raw value without inventing a result", () => {
  const c = fixture();
  const lesson = modular(c, [module("half", "ثبت ناقص", { m: 4 })]);
  const html = c.modularOverviewCell(lesson, "student");
  const values = textNodes(sections(html, "report-module-row")[0]);
  assert.ok(values.includes("4"));
  assert.equal(values.filter((value) => value === "—").length, 2);
  assert.ok(!values.includes("4.00"));
});

test("annual modular karnameh reports incompatible policy and structure instead of choosing a term", () => {
  const c = fixture();
  const first = modular(c, [
    module("first-only", "پودمان پاییز", { m: 4.5, c: 3 }),
  ]);
  const second = modular(c, [
    module("second-only", "پودمان بهار", { m: 2.5, c: 2 }),
    module("extra", "پودمان اضافه"),
  ]);
  second.gradingPolicy.competencyFactor = 4;
  second.gradingPolicy.mostamarMax = 8;
  c.db = {
    get sessions() {
      throw Error("Report must not read unrelated active sessions");
    },
  };
  for (const parts of [
    [part([second], "دوم"), part([first], "اول")],
    [part([first], "اول"), part([second], "دوم")],
  ]) {
    const html = c.modularOverviewCell(first, "student", parts, "class");
    assert.equal(sections(html, "report-modular-conflict").length, 1);
    assert.match(html, /قواعد نمره‌دهی/);
    assert.equal(sections(html, "report-module-row").length, 0);
    assert.doesNotMatch(html, /19\.50|10\.50|نوبت اول|نوبت دوم/);
  }
  second.gradingPolicy = structuredClone(first.gradingPolicy);
  const html = c.modularOverviewCell(
    first,
    "student",
    [part([first], "اول"), part([second], "دوم")],
    "class",
  );
  assert.match(html, /report-modular-conflict/);
  assert.match(html, /ساختار پودمان/);
  assert.equal(sections(html, "report-module-row").length, 0);
});

test("an unstarted second term leaves one annual modular course without term placeholders", () => {
  const c = fixture();
  const lesson = modular(c, [module("p", "تنها پودمان", { m: 3.5, c: 3 })]);
  const html = c.modularOverviewCell(
    lesson,
    "student",
    [part([lesson], "اول")],
    "class",
  );
  const courses = sections(html, "report-modular-course");
  assert.equal(courses.length, 1);
  assert.equal(sections(html, "report-modular-term").length, 0);
  assert.equal(sections(html, "report-module-row").length, 1);
  assert.ok(textNodes(courses[0]).includes("18.50"));
  assert.doesNotMatch(html, /نوبت اول|نوبت دوم/);
});

test("annual modular karnameh unites disjoint module grades across snapshots into one aggregate", () => {
  const c = fixture(),
    first = modular(c, [
      module("one", "پودمان اول", { m: 3, c: 3 }),
      module("two", "پودمان دوم"),
    ]),
    second = modular(c, [
      module("one", "پودمان اول"),
      module("two", "پودمان دوم", { m: 2, c: 2 }),
    ]),
    parts = [part([second], "دوم"), part([first], "اول")],
    before = JSON.stringify(parts);
  c.db = {
    get sessions() {
      throw Error("Formal annual modular grades must not read active sessions");
    },
  };
  const html = c.modularOverviewCell(second, "student", parts, "class"),
    courses = sections(html, "report-modular-course"),
    rows = sections(html, "report-module-row"),
    totals = sections(html, "report-modular-final");
  assert.equal(courses.length, 1);
  assert.equal(rows.length, 2);
  assert.equal(totals.length, 1);
  assert.ok(textNodes(rows[0]).includes("18.00"));
  assert.ok(textNodes(rows[1]).includes("12.00"));
  assert.ok(textNodes(totals[0]).includes("15.00"));
  assert.doesNotMatch(html, /نوبت اول|نوبت دوم|report-modular-conflict/);
  assert.equal(JSON.stringify(parts), before);
});

test("annual modular karnameh deduplicates equal module grades and keeps zero mostamar", () => {
  const c = fixture(),
    first = modular(c, [module("same", "پودمان مشترک", { m: 0, c: 3 })]),
    second = structuredClone(first);
  second.poudmans[0].podScores.student.gate = false;
  const html = c.modularOverviewCell(
    first,
    "student",
    [part([first], "اول"), part([second], "دوم")],
    "class",
  );
  assert.equal(sections(html, "report-modular-course").length, 1);
  const rows = sections(html, "report-module-row");
  assert.equal(rows.length, 1);
  assert.ok(textNodes(rows[0]).includes("0"));
  assert.ok(textNodes(rows[0]).includes("15.00"));
  assert.equal(sections(html, "report-modular-final").length, 1);
});

test("annual modular karnameh never arbitrarily picks one conflicting score", () => {
  const c = fixture(),
    first = modular(c, [module("same", "پودمان مشترک", { m: 0, c: 3 })]),
    second = modular(c, [module("same", "پودمان مشترک", { m: 5, c: 3 })]);
  for (const parts of [
    [part([first], "اول"), part([second], "دوم")],
    [part([second], "دوم"), part([first], "اول")],
  ]) {
    const html = c.modularOverviewCell(first, "student", parts, "class");
    assert.equal(sections(html, "report-modular-conflict").length, 1);
    assert.match(html, /دو نمرهٔ متفاوت/);
    assert.doesNotMatch(html, /report-module-row|report-modular-final/);
    assert.doesNotMatch(html, /15\.00|20\.00/);
    assert.throws(
      () => c.annualTechnicalRows(parts, "school", "class"),
      /دو نمرهٔ متفاوت/,
    );
  }
});

test("annual technical report produces one formal modular row per student and course", () => {
  const c = fixture(),
    first = modular(c, [
      module("one", "پودمان اول", { m: 0, c: 3 }),
      module("two", "پودمان دوم"),
    ]),
    second = modular(c, [
      module("one", "پودمان اول"),
      module("two", "پودمان دوم", { m: 5, c: 3 }),
    ]);
  for (const parts of [
    [part([first], "اول"), part([second], "دوم")],
    [part([second], "دوم"), part([first], "اول")],
  ]) {
    const rows = c.annualTechnicalRows(parts, "school", "class", "student");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].term, "سالانه");
    assert.equal(rows[0].method, "modular");
    assert.equal(rows[0].lessonId, "modular");
    assert.equal(rows[0].studentId, "student");
    assert.equal(rows[0].complete, true);
    assert.equal(rows[0].passed, true);
    assert.equal(rows[0].final, 17.5);
    assert.deepEqual(
      Array.from(rows[0].modules, (pod) => pod.final),
      [15, 20],
    );
  }
});

test("module grades for another student never appear in the selected student's karnameh", () => {
  const c = fixture();
  const lesson = modular(c, [module("p", "پودمان", { m: 3.5, c: 3 })]);
  const html = c.modularOverviewCell(lesson, "other");
  const values = textNodes(sections(html, "report-module-row")[0]);
  assert.equal(values.filter((value) => value === "—").length, 3);
  assert.ok(!values.includes("18.50"));
});

test("karnameh lesson union includes other-term modular courses and deduplicates by identity", () => {
  const c = fixture();
  const activeLesson = modular(c, [], { id: "shared", name: "نام فعلی" });
  const oldShared = modular(c, [], { id: "shared", name: "نام قدیمی" });
  const oldOnly = modular(c, [], { id: "past-only", name: "درس سابق" });
  const sameName = modular(c, [], { id: "same-name", name: "نام فعلی" });
  const active = classroom([activeLesson]);
  const first = part([oldShared, oldOnly, sameName], "اول");
  first.data.schools.push({
    id: "foreign-school",
    classes: [classroom([modular(c, [], { id: "foreign" })])],
  });
  first.data.schools[0].classes.push({
    ...classroom([modular(c, [], { id: "foreign-class" })]),
    id: "other-class",
  });
  const lessons = c.karnamehLessons([first], "school", active);
  assert.deepEqual(
    Array.from(lessons, (lesson) => lesson.id),
    ["shared", "past-only", "same-name"],
  );
  assert.equal(lessons[0].name, "نام فعلی");
  assert.equal(active.lessons.length, 1);
});

test("mixed class overview renders actual module rows alongside the four dual stages", () => {
  const c = fixture();
  const lesson = modular(c, [module("p", "پودمان اول", { m: 3.5, c: 3 })]);
  const dual = {
    id: "dual",
    name: "درس کاردانش",
    gradeMode: "kardanesh",
    poudmans: [],
    gradingPolicy: c.EduPolicy.defaults("dual", "1405-1406"),
    kardaneshScores: { student: { practical: 18, theory: 12 } },
  };
  const parts = [part([lesson, dual], "اول")];
  const cls = classroom([lesson, dual]);
  const html = c.overviewV24(cls, { parts, source: parts[0].data });
  assert.match(html, /data-report-lesson="درس پودمانی"/);
  assert.match(html, /پودمان اول/);
  assert.match(html, /18\.50/);
  assert.equal(sections(html, "report-modular-term").length, 0);
  assert.equal(sections(html, "report-modular-course").length, 1);
  assert.equal(sections(html, "report-lesson-stage").length, 4);
  assert.doesNotMatch(html, /report-grade-status|report-average-cell/);
});

test("legacy unit grades are calculated from each term's session snapshot, not active sessions", () => {
  const c = fixture();
  const lesson = {
    id: "legacy",
    name: "درس قدیمی",
    gradeMode: "fani",
    weightMostamar: 40,
    weightPayani: 60,
    poudmans: [
      {
        id: "pod",
        name: "پودمان قدیمی",
        units: [{ id: "unit", name: "واحد", unitScores: {} }],
      },
    ],
  };
  const parts = [part([lesson], "اول"), part([structuredClone(lesson)], "دوم")];
  for (const [index, [m, p]] of [
    [3, 8],
    [10, 20],
  ].entries())
    parts[index].data.sessions = [
      {
        id: "session-" + index,
        date: "1405-08-09",
        period: 0,
        classId: "class",
        lessonId: "legacy",
        poudmanId: "pod",
        unitId: "unit",
        attendance: {},
        scores: [
          { studentId: "student", type: "mostamar", value: m },
          { studentId: "student", type: "payani", value: p },
        ],
      },
    ];
  c.db = {
    get sessions() {
      throw Error("Active sessions must not enter historical grades");
    },
  };
  const html = c.modularOverviewCell(lesson, "student", parts, "class");
  const terms = sections(html, "report-modular-term");
  assert.equal(terms.length, 2);
  const firstValues = textNodes(sections(terms[0], "report-module-row")[0]);
  const secondValues = textNodes(sections(terms[1], "report-module-row")[0]);
  for (const value of ["3", "8", "6.00"])
    assert.ok(firstValues.includes(value), value);
  for (const value of ["10", "20", "16.00"])
    assert.ok(secondValues.includes(value), value);
  assert.match(html, /مستمر/);
  assert.match(html, /پایانی/);
  assert.doesNotMatch(html, /شایستگی/);
  const annual = c.annualTechnicalRows(parts, "school", "class");
  assert.equal(annual.length, 2);
  assert.deepEqual(
    Array.from(annual, (row) => row.term),
    ["اول", "دوم"],
  );
  assert.deepEqual(
    Array.from(annual, (row) => row.final),
    [6, 16],
  );
  assert.ok(annual.every((row) => row.method === "legacy-unit"));
});

test("selected-student modular overview does not leak another student's scores or mutate its source", () => {
  const c = fixture();
  const lesson = modular(c, [module("p", "پودمان <ویژه>", { m: 4.5, c: 3 })]);
  lesson.poudmans[0].podScores.archived = { m: 2, c: 2 };
  const cls = classroom([lesson]);
  const archived = { id: "archived", name: "هنرجوی بایگانی" };
  cls.archivedStudents.push(archived);
  const before = JSON.stringify(cls);
  const html = c.overviewV24(cls, {
    source: { schools: [], sessions: [] },
    student: archived,
  });
  assert.match(html, /هنرجوی بایگانی/);
  assert.doesNotMatch(html, /19\.50/);
  assert.match(html, /12\.00/);
  assert.match(html, /پودمان &lt;ویژه&gt;/);
  assert.doesNotMatch(html, /پودمان <ویژه>/);
  assert.equal(JSON.stringify(cls), before);
  assert.equal(sections(html, "report-module-row").length, 1);
});
