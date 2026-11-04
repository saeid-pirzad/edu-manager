"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

const read = (file) =>
    fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
  plain = (value) => JSON.parse(JSON.stringify(value)),
  esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
  latin = (value) =>
    String(value).replace(/[۰-۹]/g, (digit) =>
      String(digit.charCodeAt(0) - 1776),
    ),
  text = (html) =>
    latin(
      html
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  table = (html, className) => {
    const found = [
      ...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/g),
    ].find((match) => new RegExp("\\b" + className + "\\b").test(match[1]));
    assert.ok(found, "table " + className + " exists");
    return found[2];
  },
  tableRows = (html) => {
    const body = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] || "";
    return [...body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)].map(
      (match) => ({
        attributes: match[1],
        html: match[2],
        text: text(match[2]),
      }),
    );
  },
  cells = (row) =>
    [...row.html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((match) => {
      const value = match[1].match(
        /<span\b[^>]*class="[^"]*\b(?:karnameh-sheet-value|karnameh-legacy-result)\b[^"]*"[^>]*>([\s\S]*?)<\/span>/,
      )?.[1];
      const content = text(value ?? match[1]).replace(/^نتیجه:\s*/, "");
      return /^\d+(?:\.\d+)?$/.test(content)
        ? String(Number(content))
        : content;
    }),
  lessonRow = (html, className, lessonName) => {
    const found = tableRows(table(html, className)).find((row) =>
      row.html.includes(esc(lessonName)),
    );
    assert.ok(found, "lesson row " + lessonName + " exists");
    return found;
  },
  sheet = (f, index = 0) =>
    f.c.individualKarnameh(f.classroom, {
      ...f.options,
      student: f.classroom.students[index],
    }),
  classes = (f) => f.parts.map((part) => part.data.schools[0].classes[0]);

function fixture({ count = 3 } = {}) {
  const c = vm.createContext({
    structuredClone,
    esc,
    workspace: { id: "second", year: "1405-1406", term: "دوم" },
    getSortedStudents: (classroom) => classroom.students,
    knownStudents: (classroom) => [
      ...classroom.students,
      ...(classroom.archivedStudents || []),
    ],
  });
  for (const file of [
    "domain/grade-math.js",
    "domain/data-boundary.js",
    "domain/grade-policy.js",
    "domain/reporting/academic-results.js",
    "domain/annual-modules.js",
    "legacy/grading/calculation.js",
    "legacy/grading/kardanesh.js",
    "workspace/domain/defaults-numbers.js",
    "workspace/grading/results.js",
    "workspace/reports/student.js",
  ])
    vm.runInContext(read(file), c, { filename: file });
  c.old = { calcStudentLesson: c.legacy_calcStudentLesson };
  const students = Array.from({ length: count }, (_, index) => ({
      id: "student_" + index,
      name: ["زهره", "آرون", "بهرام"][index] || "هنرجو " + index,
      code: ["020", "2", "001"][index] || String(index + 1),
    })),
    archived = { id: "archived", name: "ARCHIVED_PRIVATE", code: "999" },
    dual = {
      id: "dual",
      name: "مهارت <ایمن>",
      gradeMode: "kardanesh",
      gradingPolicy: plain(c.EduPolicy.defaults("dual", "1405-1406")),
      poudmans: [],
      kardaneshScores: {},
    },
    general = {
      ...structuredClone(dual),
      id: "general",
      name: "عمومی",
      gradingPolicy: {
        ...plain(c.EduPolicy.defaults("dual", "1405-1406")),
        subjectType: "general",
      },
    },
    modular = {
      id: "modular",
      name: "پودمانی",
      gradeMode: "standard",
      gradingPolicy: plain(c.EduPolicy.defaults("modular", "1405-1406")),
      kardaneshScores: {},
      poudmans: [
        {
          id: "pod",
          name: "پودمان <یک>",
          podScores: {},
          units: [{ id: "unit", name: "واحد", unitScores: {} }],
        },
      ],
    },
    legacy = {
      id: "legacy",
      name: "واحد قدیمی",
      gradeMode: "standard",
      weightMostamar: 40,
      weightPayani: 60,
      kardaneshScores: {},
      poudmans: [
        {
          id: "legacyPod",
          name: "قدیمی",
          units: [{ id: "legacyUnit", name: "واحد قدیمی", unitScores: {} }],
        },
      ],
    },
    classroom = {
      id: "classroom",
      name: "کلاس <آزمون>",
      students,
      archivedStudents: [archived],
      lessons: [dual, general, modular, legacy],
    },
    parts = ["اول", "دوم"].map((term, index) => ({
      period: {
        id: index ? "second" : "first",
        year: "1405-1406",
        term,
        termKind: index ? "second" : "first",
        revision: 1,
        closed: false,
      },
      data: {
        settings: { academicYear: "1405-1406", academicTerm: term },
        schools: [
          {
            id: "school",
            name: "مدرسه",
            classes: [structuredClone(classroom)],
          },
        ],
        sessions: [],
      },
    }));
  for (const [index, part] of parts.entries()) {
    const courses = part.data.schools[0].classes[0].lessons;
    for (const student of [...students, archived]) {
      courses[0].kardaneshScores[student.id] = index
        ? { midtermPractical: 10, midtermTheory: 20, practical: 20, theory: 20 }
        : { midtermPractical: 0, midtermTheory: 0, practical: 18, theory: 12 };
      courses[1].kardaneshScores[student.id] = index
        ? { midtermTheory: 20, theory: 12 }
        : { midtermTheory: 0, theory: 10 };
      courses[2].poudmans[0].podScores[student.id] = { m: 5, c: 3 };
      courses[3].poudmans[0].units[0].unitScores[student.id] = {
        m: index ? 10 : 0,
        p: index ? 10 : 0,
      };
    }
  }
  if (students[1]) {
    delete parts[0].data.schools[0].classes[0].lessons[0].kardaneshScores[
      students[1].id
    ].midtermTheory;
    delete parts[1].data.schools[0].classes[0].lessons[1].kardaneshScores[
      students[1].id
    ].theory;
    for (const part of parts)
      delete part.data.schools[0].classes[0].lessons[2].poudmans[0].podScores[
        students[1].id
      ].c;
  }
  const activeClass = parts[1].data.schools[0].classes[0];
  c.db = parts[1].data;
  c.gradeStatus = (result) =>
    result.complete === false
      ? "ناقص"
      : result.passed === false
        ? "جبران"
        : result.passed === true
          ? "قبول"
          : "تکمیل";
  vm.runInContext(read("workspace/reports/karnameh-grid.js"), c, {
    filename: "workspace/reports/karnameh-grid.js",
  });
  return {
    c,
    classroom: activeClass,
    parts,
    options: { parts, source: parts[1].data, schoolId: "school" },
  };
}

test("individual sheet contains lesson rows for exactly the selected pupil", () => {
  const f = fixture({ count: 23 }),
    html = sheet(f),
    assessment = tableRows(table(html, "karnameh-assessment-table"));
  assert.match(html, /\bkarnameh-student-sheet\b/);
  assert.equal(assessment.length, 1);
  assert.ok(html.includes(esc(f.classroom.students[0].name)));
  assert.ok(latin(html).includes("020"), "student code keeps its leading zero");
  const gradeBody = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)]
    .map((match) => match[1])
    .join("");
  for (const st of [
    ...f.classroom.students.slice(1),
    ...f.classroom.archivedStudents,
  ])
    assert.ok(
      !gradeBody.includes(esc(st.name)),
      "other pupil absent from grades: " + st.id,
    );
  assert.doesNotMatch(
    html,
    /data-karnameh-page-hidden|data-karnameh-student-row|data-karnameh-page-size/,
  );
  const header =
    table(html, "karnameh-assessment-table").match(
      /<thead\b[^>]*>([\s\S]*?)<\/thead>/,
    )?.[1] || "";
  assert.equal((header.match(/<tr\b/g) || []).length, 2);
  assert.equal((header.match(/scope="colgroup"/g) || []).length, 4);
});

test("Kardanesh shows all four raw practical/theory pairs, exact stage results, and equal-weight annual result", () => {
  const f = fixture(),
    row = lessonRow(
      sheet(f),
      "karnameh-assessment-table",
      f.classroom.lessons[0].name,
    );
  assert.deepEqual(cells(row), [
    "0",
    "0",
    "0",
    "18",
    "12",
    "16.2",
    "10",
    "20",
    "13",
    "20",
    "20",
    "20",
    "12.3",
  ]);
});

test("general subject shows only its four theory scores and annual result without invented practical values", () => {
  const f = fixture(),
    row = lessonRow(sheet(f), "karnameh-general-table", "عمومی");
  assert.deepEqual(cells(row), ["0", "10", "20", "12", "10.5"]);
  assert.doesNotMatch(row.html, /data-grade-tone="remedial"/);
});

test("zero remains recorded while incomplete stage and annual results stay missing", () => {
  const f = fixture(),
    first = lessonRow(
      sheet(f),
      "karnameh-assessment-table",
      f.classroom.lessons[0].name,
    ),
    missing = lessonRow(
      sheet(f, 1),
      "karnameh-assessment-table",
      f.classroom.lessons[0].name,
    ),
    general = lessonRow(sheet(f, 1), "karnameh-general-table", "عمومی");
  assert.deepEqual(cells(first).slice(0, 3), ["0", "0", "0"]);
  assert.deepEqual(cells(missing).slice(0, 3), ["0", "—", "—"]);
  assert.equal(cells(missing).at(-1), "—");
  assert.deepEqual(cells(general).slice(-2), ["—", "—"]);
});

test("assessment identity mapping is independent from the shared DTO row order", () => {
  const f = fixture(),
    rows = f.c.annualGradeRows(f.parts, "school", f.classroom.id, "student_0"),
    before = sheet(f);
  f.c.annualGradeRows = () => [...rows].reverse();
  assert.equal(sheet(f), before);
});

test("individual grade builders request the selected pupil rather than the full roster", () => {
  const f = fixture(),
    requested = [],
    annual = f.c.annualGradeRows,
    technical = f.c.annualTechnicalRows;
  f.c.annualGradeRows = (...args) => {
    requested.push(["annual", args[3]]);
    return annual(...args);
  };
  f.c.annualTechnicalRows = (...args) => {
    requested.push(["technical", args[3]]);
    return technical(...args);
  };
  sheet(f, 2);
  assert.ok(requested.length >= 1);
  for (const [name, studentId] of requested)
    assert.equal(studentId, "student_2", name + " must use pupil scope");
});

test("a missing second term cannot produce an annual or fabricated stage result", () => {
  const f = fixture();
  f.options.parts = [f.parts[0]];
  const row = lessonRow(
    sheet(f),
    "karnameh-assessment-table",
    f.classroom.lessons[0].name,
  );
  assert.deepEqual(cells(row), [
    "0",
    "0",
    "0",
    "18",
    "12",
    "16.2",
    "—",
    "—",
    "—",
    "—",
    "—",
    "—",
    "—",
  ]);
});

test("annual pass classification uses raw values rather than averaging rounded display grades", () => {
  const f = fixture();
  for (const cls of classes(f))
    cls.lessons[0].kardaneshScores.student_0 = {
      midtermPractical: 13.999,
      midtermTheory: 13.999,
      practical: 13.999,
      theory: 13.999,
    };
  const result = f.c.annualGradeRows(
      f.parts,
      "school",
      f.classroom.id,
      "student_0",
    )[0],
    row = lessonRow(
      sheet(f),
      "karnameh-assessment-table",
      f.classroom.lessons[0].name,
    );
  assert.equal(result.passed, false);
  assert.equal(result.final, 13.999);
  assert.match(row.html, /data-grade-tone="remedial"/);
  assert.match(cells(row).at(-1), /^13\.999/);
  assert.doesNotMatch(cells(row).at(-1), /^14\.00$/);
});

test("formal modules expose continuous, competency, result, and the official annual result", () => {
  const f = fixture(),
    row = lessonRow(sheet(f), "karnameh-modular-table", "پودمانی");
  assert.deepEqual(cells(row), ["5", "3", "20", "20"]);
  assert.ok(row.html.includes(esc("پودمان <یک>")));
});

test("module IDs preserve raw-score mapping across reordered terms and duplicate labels", () => {
  const f = fixture();
  for (const [index, cls] of classes(f).entries()) {
    const lesson = cls.lessons[2];
    lesson.poudmans = [
      {
        ...structuredClone(lesson.poudmans[0]),
        id: "module_A",
        name: "هم‌نام",
        podScores: { student_0: { m: 5, c: 3 } },
      },
      {
        ...structuredClone(lesson.poudmans[0]),
        id: "module_B",
        name: "هم‌نام",
        podScores: { student_0: { m: 3, c: 2 } },
      },
    ];
    if (!index) lesson.poudmans.reverse();
  }
  const row = lessonRow(sheet(f), "karnameh-modular-table", "پودمانی");
  assert.deepEqual(cells(row), ["5", "3", "20", "3", "2", "13", "16.5"]);
});

test("variable module counts keep a lesson row aligned without creating grades for absent modules", () => {
  const f = fixture();
  for (const cls of classes(f)) {
    const more = structuredClone(cls.lessons[2]);
    more.id = "second_modular";
    more.name = "فنی دوم";
    more.poudmans.push({
      ...structuredClone(more.poudmans[0]),
      id: "second_pod",
      name: "پودمان دوم",
    });
    cls.lessons.push(more);
  }
  const html = sheet(f),
    single = lessonRow(html, "karnameh-modular-table", "پودمانی"),
    double = lessonRow(html, "karnameh-modular-table", "فنی دوم");
  assert.deepEqual(
    cells(single).filter(
      (value) => value !== "—" && value !== "" && value !== "ندارد",
    ),
    ["5", "3", "20", "20"],
  );
  assert.deepEqual(cells(double), ["5", "3", "20", "5", "3", "20", "20"]);
});

test("incomplete formal competency is missing while completed failed modules remain remedial", () => {
  const f = fixture(),
    incomplete = lessonRow(sheet(f, 1), "karnameh-modular-table", "پودمانی");
  assert.deepEqual(cells(incomplete), ["5", "—", "—", "—"]);
  for (const cls of classes(f))
    cls.lessons[2].poudmans[0].podScores.student_0 = { m: 5, c: 1 };
  const failed = lessonRow(sheet(f), "karnameh-modular-table", "پودمانی");
  assert.deepEqual(cells(failed).slice(0, 3), ["5", "1", "10"]);
  assert.equal(cells(failed).at(-1), "جبران");
  assert.match(failed.html, /data-grade-complete="true"/);
  assert.match(failed.html, /data-grade-tone="remedial"/);
  assert.doesNotMatch(cells(failed).at(-1), /تکمیل نشده|10\.00/);
});

test("nonformal unit lessons preserve separate term results rather than inventing an annual average", () => {
  const f = fixture(),
    html = sheet(f),
    found = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)]
      .flatMap((match) => tableRows(match[1]))
      .find((row) => row.html.includes("واحد قدیمی"));
  assert.ok(found);
  assert.deepEqual(cells(found), ["0", "10"]);
  assert.doesNotMatch(found.html, /5\.00/);
});

test("rendering preserves all source records and displays useful empty data states", () => {
  const f = fixture(),
    before = JSON.stringify(f.parts);
  sheet(f);
  sheet(f, 1);
  assert.equal(JSON.stringify(f.parts), before);
  const html = f.c.individualKarnameh(
    { ...f.classroom, lessons: [] },
    { ...f.options, student: f.classroom.students[0] },
  );
  assert.ok(html.length > 0);
  assert.doesNotMatch(html, /NaN|undefined/);
  assert.equal(tableRows(html).length, 0);
});

test("sheet escapes school/class/lesson/module/pupil names and preserves literal student code", () => {
  const f = fixture(),
    payload = '<img src=x onerror="unsafe">';
  for (const cls of classes(f)) {
    cls.students[0].name = payload;
    cls.students[0].code = '<code attr="unsafe">';
  }
  f.options.schoolName = "مدرسه <ناامن>";
  const html = sheet(f);
  assert.ok(html.includes("&lt;ناامن&gt;"));
  assert.ok(html.includes("&lt;آزمون&gt;"));
  assert.ok(html.includes("&lt;ایمن&gt;"));
  assert.ok(html.includes("&lt;یک&gt;"));
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&lt;code"));
  assert.doesNotMatch(html, /<img\b|<code\b|<ایمن>|<آزمون>/);
});

test("pupil navigation follows registration order rather than alphabetical name or numeric code", () => {
  const f = fixture(),
    html = f.c.createKarnamehStudentNavigation(
      f.classroom,
      f.classroom.students[1],
    ),
    targets = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
      .filter((match) =>
        /data-workspace-action="karnameh-student"/.test(match[1]),
      )
      .map((match) => ({
        id: match[1].match(/data-key="([^"]*)"/)?.[1],
        disabled: /\bdisabled\b/.test(match[1]),
      }));
  assert.deepEqual(
    targets.filter((row) => !row.disabled).map((row) => row.id),
    ["student_0", "student_2"],
  );
  assert.deepEqual(
    plain(f.c.karnamehReportStudents(f.classroom)).map((student) => student.id),
    ["student_0", "student_1", "student_2", "archived"],
  );
  assert.match(html, /class="[^"]*\bno-print\b/);
  assert.doesNotMatch(html, /<select\b|<option\b/);
  assert.match(text(html), /2 از 4 هنرجو/);
});

test("navigation first and last boundaries cannot point outside known pupils", () => {
  const f = fixture();
  for (const [student, expected] of [
    [f.classroom.students[0], "student_1"],
    [f.classroom.archivedStudents[0], "student_2"],
  ]) {
    const html = f.c.createKarnamehStudentNavigation(f.classroom, student),
      available = [...html.matchAll(/<button\b([^>]*)>/g)]
        .filter(
          (match) =>
            /data-workspace-action="karnameh-student"/.test(match[1]) &&
            !/\bdisabled\b/.test(match[1]),
        )
        .map((match) => match[1].match(/data-key="([^"]*)"/)?.[1]);
    assert.deepEqual(available, [expected]);
  }
});

test("changing another pupil's marks cannot change the selected pupil's sheet", () => {
  const f = fixture(),
    before = sheet(f);
  for (const cls of classes(f)) {
    cls.lessons[0].kardaneshScores.student_2 = {
      midtermPractical: 19.73,
      midtermTheory: 18.63,
      practical: 17.53,
      theory: 16.43,
    };
    cls.lessons[1].kardaneshScores.student_2 = {
      midtermTheory: 9.17,
      theory: 8.27,
    };
    cls.lessons[2].poudmans[0].podScores.student_2 = { m: 4.5, c: 2 };
    cls.lessons[3].poudmans[0].units[0].unitScores.student_2 = {
      m: 7.31,
      p: 6.21,
    };
  }
  assert.equal(sheet(f), before);
});

test("an explicitly selected archived pupil keeps their complete grades and archive marker", () => {
  const f = fixture(),
    student = f.classroom.archivedStudents[0],
    html = f.c.individualKarnameh(f.classroom, { ...f.options, student });
  assert.match(html, /data-student-id="archived"/);
  assert.match(html, /karnameh-archived-tag/);
  const row = lessonRow(
    html,
    "karnameh-assessment-table",
    f.classroom.lessons[0].name,
  );
  assert.equal(cells(row).at(-1), "12.3");
  assert.ok(html.includes(esc(student.name)));
  for (const active of f.classroom.students)
    assert.ok(
      !html.includes(esc(active.name)),
      "another pupil is absent from the archived report",
    );
});

test("no pupil selected produces an explicit empty state with no grade tables", () => {
  const f = fixture();
  for (const students of [f.classroom.students, []]) {
    const html = f.c.individualKarnameh(
      { ...f.classroom, students },
      f.options,
    );
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /<table\b|NaN|undefined/);
    assert.ok(text(html).length > 0);
  }
});

test("formal module zero continuous score remains recorded and contributes to the official result", () => {
  const f = fixture();
  for (const cls of classes(f))
    cls.lessons[2].poudmans[0].podScores.student_0 = { m: 0, c: 3 };
  const row = lessonRow(sheet(f), "karnameh-modular-table", "پودمانی");
  assert.deepEqual(cells(row), ["0", "3", "15", "15"]);
});

test("nonformal partial units preserve raw zero without inventing a complete term result", () => {
  const f = fixture();
  f.parts[0].data.schools[0].classes[0].lessons[3].poudmans[0].units[0].unitScores.student_0 =
    { m: 0 };
  const row = lessonRow(sheet(f), "karnameh-legacy-table", "واحد قدیمی");
  assert.deepEqual(cells(row), ["—", "10"]);
  assert.match(text(row.html), /مستمر 0 · پایانی — · نتیجه —/);
  assert.match(text(row.html), /مستمر 10 · پایانی 10 · نتیجه 10/);
});
