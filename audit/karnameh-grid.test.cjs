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

test("Kardanesh shows all four raw practical/theory pairs, exact stage results, without an annual score column", () => {
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
  ]);
  assert.equal(
    f.c.annualGradeRows(f.parts, "school", f.classroom.id, "student_0")[0]
      .final,
    12.3,
  );
});

test("general subject shows only its four theory scores without invented practical or annual values", () => {
  const f = fixture(),
    row = lessonRow(sheet(f), "karnameh-general-table", "عمومی");
  assert.deepEqual(cells(row), ["0", "10", "20", "12"]);
  assert.doesNotMatch(row.html, /data-grade-tone="remedial"/);
  assert.equal(
    f.c
      .annualGradeRows(f.parts, "school", f.classroom.id, "student_0")
      .find((row) => row.lessonId === "general").final,
    10.5,
  );
});

test("zero remains recorded while incomplete stage results stay missing", () => {
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
  assert.equal(
    f.c
      .annualGradeRows(f.parts, "school", f.classroom.id, "student_1")
      .find((row) => row.lessonId === "dual").complete,
    false,
  );
  assert.deepEqual(cells(general), ["0", "10", "20", "—"]);
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

test("a missing second term cannot produce fabricated stage results", () => {
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
  ]);
});

test("stage results preserve exact subthreshold classification while shared annual calculation remains unchanged", () => {
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

test("formal modules expose continuous, competency, and result without an annual score column", () => {
  const f = fixture(),
    row = lessonRow(sheet(f), "karnameh-modular-table", "پودمانی");
  assert.deepEqual(cells(row), ["5", "3", "20"]);
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
  assert.deepEqual(cells(row), ["5", "3", "20", "3", "2", "13"]);
  assert.equal(
    f.c
      .annualTechnicalRows(f.parts, "school", f.classroom.id, "student_0")
      .find((row) => row.lessonId === "modular").final,
    16.5,
  );
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
    ["5", "3", "20"],
  );
  assert.deepEqual(cells(double), ["5", "3", "20", "5", "3", "20"]);
});

test("incomplete formal competency is missing while completed failed modules remain remedial", () => {
  const f = fixture(),
    incomplete = lessonRow(sheet(f, 1), "karnameh-modular-table", "پودمانی");
  assert.deepEqual(cells(incomplete), ["5", "—", "—"]);
  for (const cls of classes(f))
    cls.lessons[2].poudmans[0].podScores.student_0 = { m: 5, c: 1 };
  const failed = lessonRow(sheet(f), "karnameh-modular-table", "پودمانی");
  assert.deepEqual(cells(failed).slice(0, 3), ["5", "1", "10"]);
  assert.equal(cells(failed).at(-1), "10");
  assert.match(failed.html, /data-grade-complete="true"/);
  assert.match(failed.html, /data-grade-tone="remedial"/);
  const official = f.c
    .annualTechnicalRows(f.parts, "school", f.classroom.id, "student_0")
    .find((row) => row.lessonId === "modular");
  assert.equal(official.complete, true);
  assert.equal(official.passed, false);
  assert.equal(official.final, null);
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
  ]);
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
  assert.deepEqual(cells(row), ["0", "3", "15"]);
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

function stageTableFixture(html, className) {
  const content = table(html, className),
    head = content.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)?.[1] || "";
  return {
    classList: {
      contains: (name) => name === className || name === "karnameh-sheet-table",
    },
    tHead: {
      rows: [...head.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => ({
        cells: [...match[1].matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)].map(
          (cell) => ({
            colSpan: Number(cell[1].match(/\bcolspan="(\d+)"/)?.[1] || 1),
            rowSpan: Number(cell[1].match(/\browspan="(\d+)"/)?.[1] || 1),
            textContent: text(cell[2]),
          }),
        ),
      })),
    },
  };
}

test("stage metadata matches the actual four-stage assessment and general headers without changing grades", () => {
  const f = fixture(),
    html = sheet(f),
    keys = ["first-midterm", "first-final", "second-midterm", "second-final"];
  for (const [className, width] of [
    ["karnameh-assessment-table", 3],
    ["karnameh-general-table", 1],
  ]) {
    const groups = plain(
      f.c.karnamehTableStageGroups(stageTableFixture(html, className)),
    );
    assert.deepEqual(
      groups.map((group) => group.key),
      keys,
    );
    assert.deepEqual(
      groups.map((group) => group.width),
      [width, width, width, width],
    );
    assert.ok(
      groups.every(
        (group) => typeof group.label === "string" && group.label.trim(),
      ),
    );
    const lesson =
      className === "karnameh-assessment-table"
        ? f.classroom.lessons[0].name
        : "عمومی";
    const row = lessonRow(html, className, lesson);
    assert.equal(cells(row).length, width * 4);
    assert.doesNotMatch(row.html, /\bhidden(?:\s|=|>)/);
  }
  assert.equal(sheet(f), html);
});

test("stage metadata derives positional module groups from actual table headers and keeps legacy term columns separate", () => {
  const f = fixture();
  for (const cls of classes(f)) {
    const lesson = cls.lessons[2];
    lesson.poudmans.push({
      ...structuredClone(lesson.poudmans[0]),
      id: "module_other",
      name: "پودمان دیگر",
    });
  }
  const html = sheet(f),
    groups = plain(
      f.c.karnamehTableStageGroups(
        stageTableFixture(html, "karnameh-modular-table"),
      ),
    );
  assert.deepEqual(
    groups.map((group) => group.key),
    ["module-0", "module-1"],
  );
  assert.deepEqual(
    groups.map((group) => group.width),
    [3, 3],
  );
  const row = lessonRow(html, "karnameh-modular-table", "پودمانی");
  assert.deepEqual(cells(row), ["5", "3", "20", "5", "3", "20"]);
  assert.ok(row.html.includes(esc("پودمان <یک>")));
  assert.ok(row.html.includes("پودمان دیگر"));
  assert.doesNotMatch(row.html, /\bhidden(?:\s|=|>)/);
  const legacy = plain(
    f.c.karnamehTableStageGroups(
      stageTableFixture(html, "karnameh-legacy-table"),
    ),
  );
  assert.equal(legacy.length, 2);
  assert.deepEqual(
    legacy.map((group) => group.width),
    [1, 1],
  );
  assert.equal(new Set(legacy.map((group) => group.key)).size, 2);
  assert.ok(legacy.every((group) => group.key !== "annual"));
});

function stageControllerFixture() {
  const f = fixture(),
    { c } = f;
  for (const cls of classes(f))
    cls.lessons[2].poudmans.push({
      ...structuredClone(cls.lessons[2].poudmans[0]),
      id: "extra_module",
      name: "پودمان دوم",
    });
  c.state = { view: "reports", reportTab: "karnameh" };
  c.karnamehFilter = {
    schoolId: "school",
    classId: f.classroom.id,
    studentId: "student_0",
  };
  c.localStorage = {
    setItem: () => {
      throw Error("stage selection must not write storage");
    },
  };
  c.saveDB = () => {
    throw Error("stage selection must not write marks");
  };
  c.commitRecordChanges = c.saveDB;
  let currentReport,
    validations = 0;
  const context = {
    id: c.workspace.id,
    revision: 1,
    karnamehYear: c.workspace.year,
  };
  c.assertReportSnapshot = async (value) => {
    assert.equal(value, context);
    validations++;
  };
  c.document = {
    getElementById: (id) =>
      id === "karnamehTabOutput"
        ? { contains: (report) => report === currentReport }
        : null,
  };
  const snapshots = vm.runInContext("karnamehSnapshots", c);
  function element({
    attributes = "",
    html = "",
    colSpan = 1,
    rowSpan = 1,
  } = {}) {
    const data = {},
      attrs = new Map();
    for (const match of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) {
      attrs.set(match[1], match[2]);
      if (match[1].startsWith("data-"))
        data[
          match[1]
            .slice(5)
            .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
        ] = match[2];
    }
    const node = {
      dataset: data,
      attributes: attrs,
      colSpan,
      rowSpan,
      isConnected: true,
      disabled: false,
      innerHTML: html,
      textContent: text(html),
      setAttribute(name, value) {
        attrs.set(name, String(value));
      },
      getAttribute(name) {
        return attrs.get(name) ?? null;
      },
      toggleAttribute(name, enabled) {
        if (enabled) attrs.set(name, "");
        else attrs.delete(name);
      },
    };
    Object.defineProperty(node, "hidden", {
      get: () => false,
      set: () => {
        throw Error("stage controls must not mutate hidden properties");
      },
    });
    return node;
  }
  const mount = (studentIndex = 0) => {
    const html = sheet(f, studentIndex),
      report = {
        dataset: { studentId: "student_" + studentIndex },
        isConnected: true,
      },
      sections = [];
    c.karnamehFilter.studentId = report.dataset.studentId;
    for (const className of [
      "karnameh-assessment-table",
      "karnameh-general-table",
      "karnameh-modular-table",
      "karnameh-legacy-table",
    ]) {
      const content = table(html, className),
        parsed = stageTableFixture(html, className),
        header = content.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)?.[1] || "",
        body = content.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] || "",
        parseRows = (markup) =>
          [...markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => ({
            cells: [
              ...row[1].matchAll(/<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]>/g),
            ].map((match) =>
              element({
                attributes: match[1],
                html: match[2],
                colSpan: Number(match[1].match(/\bcolspan="(\d+)"/)?.[1] || 1),
                rowSpan: Number(match[1].match(/\browspan="(\d+)"/)?.[1] || 1),
              }),
            ),
          })),
        node = {
          classList: parsed.classList,
          dataset: {},
          tHead: { rows: parseRows(header) },
          tBodies: [{ rows: parseRows(body) }],
        },
        allCells = [...node.tHead.rows, ...node.tBodies[0].rows].flatMap(
          (row) => row.cells,
        ),
        section = {
          dataset: {},
          table: node,
          buttons: [],
          allCells,
          scroll: { scrollLeft: 85 },
          header: {},
        };
      section.header.insertAdjacentHTML = (position, controls) => {
        assert.equal(position, "beforeend");
        section.buttons = [
          ...controls.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
        ].map((match) => {
          const button = element({ attributes: match[1], html: match[2] });
          button.closest = (selector) =>
            selector === ".karnameh-student-sheet"
              ? report
              : selector === ".karnameh-subject-section"
                ? section
                : null;
          return button;
        });
      };
      section.querySelector = (selector) => {
        if (selector === "table" || selector === "table.karnameh-sheet-table")
          return node;
        if (selector === ".karnameh-sheet-scroll") return section.scroll;
        if (selector === ".karnameh-subject-header") return section.header;
        if (selector === ".karnameh-stage-switcher")
          return section.buttons.length ? {} : null;
        return null;
      };
      section.querySelectorAll = (selector) =>
        selector === "[data-karnameh-group]"
          ? allCells.filter((cell) => cell.dataset.karnamehGroup !== undefined)
          : selector === "[data-karnameh-stage]"
            ? section.buttons
            : [];
      sections.push(section);
    }
    report.querySelectorAll = (selector) =>
      selector === ".karnameh-subject-section" ? sections : [];
    report.contains = (section) => sections.includes(section);
    snapshots.set(report, context);
    currentReport = report;
    c.initKarnamehStageControls(report, {
      schoolId: "school",
      classId: f.classroom.id,
    });
    const find = (kind, index = 0) =>
      sections.filter((section) => section.dataset.karnamehGroupSet === kind)[
        index
      ];
    return {
      report,
      sections,
      find,
      button: (kind, stage, index = 0) =>
        find(kind, index).buttons.find(
          (button) => button.dataset.karnamehStage === stage,
        ),
      grades: () =>
        sections.flatMap((section) =>
          section.allCells.map((cell) => ({
            html: cell.innerHTML,
            text: cell.textContent,
            hidden: cell.hidden,
          })),
        ),
      active: (kind) =>
        sections
          .filter((section) => section.dataset.karnamehGroupSet === kind)
          .map((section) => section.dataset.karnamehActiveGroup),
    };
  };
  return {
    ...f,
    mount,
    context,
    validations: () => validations,
    replaceOutput: () => {
      currentReport = null;
    },
  };
}

function stageDeferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("runtime stage decoration groups every original header and grade cell without any annual cells", () => {
  const f = stageControllerFixture(),
    view = f.mount();
  for (const [kind, expected] of [
    ["assessment", ["first-midterm", "first-midterm"]],
    ["modular", ["module-0"]],
    ["legacy", ["first-term"]],
  ])
    assert.deepEqual(view.active(kind), expected);
  for (const section of view.sections) {
    assert.ok(
      section.allCells.slice(1).some((cell) => cell.dataset.karnamehGroup),
    );
    assert.ok(
      section.buttons.every((button) =>
        ["true", "false"].includes(button.getAttribute("aria-pressed")),
      ),
    );
    for (const cell of section.allCells.filter(
      (cell) => cell.dataset.karnamehGroup,
    ))
      assert.equal(
        cell.attributes.has("data-karnameh-group-active"),
        cell.dataset.karnamehGroup === section.dataset.karnamehActiveGroup,
      );
    assert.equal(section.scroll.scrollLeft, 0);
  }
  assert.equal(view.report.dataset.karnamehCompactReady, "true");
  assert.equal(f.validations(), 0);
});

test("stage round trips synchronize Kardanesh/general while preserving every grade and all hidden properties", async () => {
  const f = stageControllerFixture(),
    view = f.mount(),
    before = view.grades(),
    raw = JSON.stringify(f.parts);
  for (const stage of ["second-final", "first-final", "first-midterm"]) {
    await f.c.selectKarnamehStage(view.button("assessment", stage));
    const expected = [stage, stage];
    assert.deepEqual(view.active("assessment"), expected);
    assert.deepEqual(view.active("modular"), ["module-0"]);
    for (const [index, section] of view.sections
      .filter((item) => item.dataset.karnamehGroupSet === "assessment")
      .entries()) {
      assert.equal(section.table.dataset.karnamehActiveGroup, expected[index]);
      assert.equal(
        section.buttons.filter(
          (button) => button.getAttribute("aria-pressed") === "true",
        ).length,
        1,
      );
      assert.equal(
        section.buttons.find(
          (button) => button.getAttribute("aria-pressed") === "true",
        ).dataset.karnamehStage,
        expected[index],
      );
    }
  }
  assert.deepEqual(view.grades(), before);
  assert.equal(JSON.stringify(f.parts), raw);
  assert.equal(f.validations(), 3);
});

test("module and legacy stage selections remain independent from assessment selection", async () => {
  const f = stageControllerFixture(),
    view = f.mount(),
    before = view.grades();
  await f.c.selectKarnamehStage(view.button("assessment", "second-midterm", 1));
  await f.c.selectKarnamehStage(view.button("modular", "module-1"));
  await f.c.selectKarnamehStage(view.button("legacy", "second-term"));
  assert.deepEqual(view.active("assessment"), [
    "second-midterm",
    "second-midterm",
  ]);
  assert.deepEqual(view.active("modular"), ["module-1"]);
  assert.deepEqual(view.active("legacy"), ["second-term"]);
  await f.c.selectKarnamehStage(view.button("modular", "module-1"));
  assert.deepEqual(view.active("assessment"), [
    "second-midterm",
    "second-midterm",
  ]);
  assert.deepEqual(view.active("modular"), ["module-1"]);
  assert.deepEqual(view.grades(), before);
});

test("forged stage names, negative/overflow module indices and disabled controls cannot access a snapshot or change selection", async () => {
  const f = stageControllerFixture(),
    view = f.mount(),
    before = view.grades(),
    original = view.button("modular", "module-1");
  for (const selected of [
    "module--1",
    "module-2",
    "module-999999",
    "annual",
    "first-final",
    "__proto__",
    "",
  ]) {
    const forged = { ...original, dataset: { karnamehStage: selected } };
    await f.c.selectKarnamehStage(forged);
  }
  const general = view.button("assessment", "first-midterm", 1);
  await f.c.selectKarnamehStage({
    ...general,
    dataset: { karnamehStage: "annual" },
  });
  const disabled = view.button("assessment", "second-final");
  disabled.disabled = true;
  await f.c.selectKarnamehStage(disabled);
  assert.deepEqual(view.active("assessment"), [
    "first-midterm",
    "first-midterm",
  ]);
  assert.deepEqual(view.active("modular"), ["module-0"]);
  assert.deepEqual(view.grades(), before);
  assert.equal(f.validations(), 0);
});

test("a missing or rejected durable report context cannot apply a different stage", async () => {
  const f = stageControllerFixture(),
    view = f.mount(),
    snapshots = vm.runInContext("karnamehSnapshots", f.c);
  snapshots.delete(view.report);
  await f.c.selectKarnamehStage(view.button("assessment", "second-final"));
  assert.equal(f.validations(), 0);
  assert.deepEqual(view.active("assessment"), [
    "first-midterm",
    "first-midterm",
  ]);
  snapshots.set(view.report, f.context);
  f.c.assertReportSnapshot = async () => {
    throw Error("changed other term");
  };
  await assert.rejects(
    f.c.selectKarnamehStage(view.button("assessment", "second-final")),
    /changed other term/,
  );
  assert.deepEqual(view.active("assessment"), [
    "first-midterm",
    "first-midterm",
  ]);
});

for (const [reason, change] of [
  [
    "school",
    (f) => {
      f.c.karnamehFilter.schoolId = "other-school";
    },
  ],
  [
    "class",
    (f) => {
      f.c.karnamehFilter.classId = "other-class";
    },
  ],
  [
    "pupil",
    (f) => {
      f.c.karnamehFilter.studentId = "student_1";
    },
  ],
  [
    "workspace",
    (f) => {
      f.c.workspace.id = "another-term";
    },
  ],
  ["report", (f) => f.replaceOutput()],
  [
    "navigation",
    (f) => {
      f.c.state.view = "schools";
    },
  ],
  [
    "report tab",
    (f) => {
      f.c.state.reportTab = "daily";
    },
  ],
  [
    "preference scope",
    (f) => f.c.karnamehStagePreference("other-school", "other-class"),
  ],
  [
    "button removal",
    (_f, view, button) => {
      button.isConnected = false;
    },
  ],
  [
    "report removal",
    (_f, view) => {
      view.report.isConnected = false;
    },
  ],
])
  test(
    "a validated stage cannot apply after " +
      reason +
      " changes during its await",
    async () => {
      const f = stageControllerFixture(),
        view = f.mount(),
        waiting = stageDeferred(),
        entered = stageDeferred(),
        button = view.button("assessment", "second-final");
      f.c.assertReportSnapshot = async () => {
        entered.resolve();
        await waiting.promise;
      };
      const operation = f.c.selectKarnamehStage(button);
      await entered.promise;
      change(f, view, button);
      waiting.resolve();
      await operation;
      assert.deepEqual(view.active("assessment"), [
        "first-midterm",
        "first-midterm",
      ]);
    },
  );

test("an obsolete failed snapshot is discarded quietly after student selection changes", async () => {
  const f = stageControllerFixture(),
    view = f.mount(),
    waiting = stageDeferred(),
    entered = stageDeferred();
  f.c.assertReportSnapshot = async () => {
    entered.resolve();
    await waiting.promise;
    throw Error("obsolete report");
  };
  const operation = f.c.selectKarnamehStage(
    view.button("assessment", "second-final"),
  );
  await entered.promise;
  f.c.karnamehFilter.studentId = "student_1";
  waiting.resolve();
  await operation;
  assert.deepEqual(view.active("assessment"), [
    "first-midterm",
    "first-midterm",
  ]);
});

test("a slower earlier stage request cannot overwrite a later validated selection", async () => {
  const f = stageControllerFixture(),
    view = f.mount(),
    waiting = stageDeferred(),
    entered = stageDeferred();
  let calls = 0;
  f.c.assertReportSnapshot = async () => {
    if (++calls === 1) {
      entered.resolve();
      await waiting.promise;
    }
  };
  const earlier = f.c.selectKarnamehStage(
    view.button("assessment", "first-final"),
  );
  await entered.promise;
  await f.c.selectKarnamehStage(view.button("assessment", "second-final"));
  waiting.resolve();
  await earlier;
  assert.deepEqual(view.active("assessment"), ["second-final", "second-final"]);
});

test("clicking the already active stage cancels a pending request for another stage", async () => {
  const f = stageControllerFixture(),
    view = f.mount(),
    waiting = stageDeferred(),
    entered = stageDeferred();
  f.c.assertReportSnapshot = async () => {
    entered.resolve();
    await waiting.promise;
  };
  const pending = f.c.selectKarnamehStage(view.button("modular", "module-1"));
  await entered.promise;
  await f.c.selectKarnamehStage(view.button("modular", "module-0"));
  waiting.resolve();
  await pending;
  assert.deepEqual(view.active("modular"), ["module-0"]);
});

test("concurrent requests in separate stage families can both apply without cancelling one another", async () => {
  const f = stageControllerFixture(),
    view = f.mount(),
    waiting = stageDeferred(),
    entered = stageDeferred();
  let calls = 0;
  f.c.assertReportSnapshot = async () => {
    if (++calls === 1) {
      entered.resolve();
      await waiting.promise;
    }
  };
  const first = f.c.selectKarnamehStage(
    view.button("assessment", "second-final"),
  );
  await entered.promise;
  await f.c.selectKarnamehStage(view.button("modular", "module-1"));
  waiting.resolve();
  await first;
  assert.deepEqual(view.active("assessment"), ["second-final", "second-final"]);
  assert.deepEqual(view.active("modular"), ["module-1"]);
});

test("stage choices survive pupil navigation but reset when academic workspace/year/school/class scope changes", async () => {
  const f = stageControllerFixture(),
    first = f.mount();
  await f.c.selectKarnamehStage(first.button("assessment", "second-final"));
  await f.c.selectKarnamehStage(first.button("modular", "module-1"));
  const next = f.mount(1);
  assert.deepEqual(next.active("assessment"), ["second-final", "second-final"]);
  assert.deepEqual(next.active("modular"), ["module-1"]);
  for (const [key, value, schoolId, classId] of [
    ["id", "another-term", "school", f.classroom.id],
    ["year", "1406-1407", "school", f.classroom.id],
    ["year", "1406-1407", "another-school", f.classroom.id],
    ["year", "1406-1407", "another-school", "another-class"],
  ]) {
    f.c.workspace[key] = value;
    const preference = f.c.karnamehStagePreference(schoolId, classId);
    assert.equal(preference.assessment, "first-midterm");
    assert.equal(preference.modular, "module-0");
    assert.equal(preference.legacy, "first-term");
    preference.assessment = "second-final";
    preference.modular = "module-1";
  }
});

test("every Karnameh table physically omits annual headers, cells, groups and options", () => {
  const f = fixture(),
    html = sheet(f),
    keys = ["first-midterm", "first-final", "second-midterm", "second-final"];
  for (const [className, expected, columnCount] of [
    ["karnameh-assessment-table", keys, 13],
    ["karnameh-general-table", keys, 5],
    ["karnameh-modular-table", ["module-0"], 4],
    ["karnameh-legacy-table", ["first-term", "second-term"], 3],
  ]) {
    const content = table(html, className),
      node = stageTableFixture(html, className),
      groups = plain(f.c.karnamehTableStageGroups(node)),
      options = plain(f.c.karnamehTableStageOptions(node));
    assert.deepEqual(
      groups.map((group) => group.key),
      expected,
    );
    assert.deepEqual(options, groups);
    assert.equal(
      node.tHead.rows[0].cells.reduce((sum, cell) => sum + cell.colSpan, 0),
      columnCount,
    );
    assert.doesNotMatch(
      content,
      /\bdata-karnameh-(?:field|group|stage)="annual"|karnameh-(?:sheet|grid)-annual|نتیجهٔ سالانه/,
    );
    for (const row of tableRows(content))
      assert.doesNotMatch(row.html, /\bdata-karnameh-field="annual"/);
  }
  assert.equal(sheet(f), html);
});

test("obsolete annual preferences fall back to valid stages and forged annual controls cannot alter grades or selection", async () => {
  const f = stageControllerFixture(),
    raw = JSON.stringify(f.parts),
    preference = f.c.karnamehStagePreference("school", f.classroom.id);
  preference.assessment = "annual";
  preference.modular = "annual";
  preference.legacy = "annual";
  const view = f.mount(),
    before = view.grades();
  assert.deepEqual(view.active("assessment"), [
    "first-midterm",
    "first-midterm",
  ]);
  assert.deepEqual(view.active("modular"), ["module-0"]);
  assert.deepEqual(view.active("legacy"), ["first-term"]);
  assert.equal(preference.assessment, "first-midterm");
  assert.equal(preference.modular, "module-0");
  assert.equal(preference.legacy, "first-term");
  for (const section of view.sections) {
    assert.ok(
      !section.allCells.some((cell) => cell.dataset.karnamehGroup === "annual"),
    );
    assert.ok(
      !section.buttons.some(
        (button) => button.dataset.karnamehStage === "annual",
      ),
    );
    assert.equal(
      section.buttons.filter(
        (button) => button.getAttribute("aria-pressed") === "true",
      ).length,
      1,
    );
    assert.ok(
      section.allCells.some((cell) =>
        cell.attributes.has("data-karnameh-group-active"),
      ),
    );
    const original = section.buttons[0];
    await f.c.selectKarnamehStage({
      ...original,
      dataset: { karnamehStage: "annual" },
    });
  }
  assert.equal(f.validations(), 0);
  assert.deepEqual(view.grades(), before);
  assert.equal(JSON.stringify(f.parts), raw);
  await f.c.selectKarnamehStage(view.button("assessment", "second-final"));
  assert.deepEqual(view.active("assessment"), ["second-final", "second-final"]);
  assert.deepEqual(view.grades(), before);
  assert.equal(
    view
      .find("modular")
      .table.tHead.rows[0].cells.reduce((sum, cell) => sum + cell.colSpan, 0),
    7,
  );
});
