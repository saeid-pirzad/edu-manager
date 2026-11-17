"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const plain = (value) => JSON.parse(JSON.stringify(value));
const latin = (value) =>
  String(value).replace(/[۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) - 1776),
  );

function fixture({
  mode = "daily",
  audience = "parent",
  firstOnly = false,
} = {}) {
  const elements = new Map(),
    calls = [],
    assertions = [];
  const workspace = {
    id: firstOnly ? "first" : "second",
    revision: 4,
    year: "1405-1406",
    term: firstOnly ? "اول" : "دوم",
  };
  const c = vm.createContext({
    structuredClone,
    Intl,
    Blob,
    TextEncoder,
    workspace,
    esc: (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    faDate: String,
    modeLabel: String,
    getSortedStudents: (classroom) => classroom.students,
    knownStudents: (classroom) => [
      ...classroom.students,
      ...(classroom.archivedStudents || []),
    ],
  });
  for (const file of [
    "domain/data-boundary.js",
    "domain/grade-math.js",
    "domain/grade-policy.js",
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/reporting/academic-results.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
    "domain/annual-modules.js",
    "workspace/domain/defaults-numbers.js",
    "legacy/grading/calculation.js",
    "legacy/grading/kardanesh.js",
    "workspace/grading/results.js",
    "workspace/courses/results.js",
    "workspace/reports/student.js",
    "workspace/reports/karnameh-grid.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
      { filename: file },
    );
  c.old = { calcStudentLesson: c.legacy_calcStudentLesson };
  c.gradeStatus = c.policyStatus;
  const lesson = {
    id: "unit-course",
    name: "درس واحد کار",
    teacher: "دبیر نمونه",
    gradeMode: "standard",
    gradingPolicy: {
      ...plain(c.EduPolicy.defaults("modular", workspace.year)),
      version: 2,
      modularScope: "unit",
      unitCount: 2,
    },
    poudmans: [0, 1].map((index) => ({
      id: "pod" + index,
      name: "پودمان " + index,
      podScores: {},
      units: [0, 1].map((offset) => ({
        id: "unit" + (index * 2 + offset),
        name: "واحد " + (index * 2 + offset),
        competencyScores: {},
        unitScores: {},
      })),
    })),
  };
  const parts = ["اول", "دوم"]
    .slice(0, firstOnly ? 1 : 2)
    .map((term, index) => ({
      period: {
        id: index ? "second" : "first",
        term,
        year: workspace.year,
        revision: 4,
      },
      data: {
        settings: { academicYear: workspace.year, academicTerm: term },
        schools: [
          {
            id: "school",
            name: "مدرسه",
            classes: [
              {
                id: "class",
                name: "کلاس",
                students: [{ id: "student", name: "هنرجو", code: "001" }],
                archivedStudents: [{ id: "private", name: "PRIVATE" }],
                lessons: [structuredClone(lesson)],
              },
            ],
          },
        ],
        sessions: [
          {
            id: index ? "second-session" : "first-session",
            date: "2026-11-17",
            period: index,
            schoolId: "school",
            classId: "class",
            lessonId: "unit-course",
            poudmanId: "pod0",
            unitId: "unit0",
            roster: [{ id: "student", name: "هنرجو", code: "001" }],
            attendance: { student: index ? "present" : "absent" },
            scores: [
              {
                studentId: "student",
                type: "positive",
                value: 1,
                note: index ? "SECOND_ONLY" : "FIRST_OUTSIDE",
              },
            ],
          },
        ],
      },
    }));
  const course = (part) => part.data.schools[0].classes[0].lessons[0];
  course(parts[0]).poudmans[0].units[0].competencyScores.student = {
    m: 0,
    c: 3,
  };
  course(parts[0]).poudmans[1].units[0].competencyScores.student = { m: 0 };
  for (const part of parts)
    for (const pod of course(part).poudmans)
      for (const unit of pod.units)
        unit.competencyScores.private = { m: 5, c: 3 };
  if (!firstOnly)
    course(parts[1]).poudmans[0].units[1].competencyScores.student = {
      m: 2,
      c: 1,
    };
  const active = parts.at(-1).data,
    annualData = structuredClone(active);
  annualData.settings.academicTerm = firstOnly ? "اول" : "اول و دوم";
  annualData.sessions = parts.flatMap((part) =>
    structuredClone(part.data.sessions),
  );
  const yearContext = {
    id: workspace.id,
    revision: 4,
    yearScope: workspace.year,
    members: parts.map((part) => ({ id: part.period.id, revision: 4 })),
  };
  Object.assign(c, {
    db: active,
    root: {
      EduReportModel: c.EduReportModel,
      EduReportDates: c.EduReportDates,
      EduV24: {
        async prepareReportSnapshot(options) {
          calls.push(plain(options));
          return options.annual
            ? { data: structuredClone(annualData), parts, context: yearContext }
            : {
                data: structuredClone(active),
                context: { id: workspace.id, revision: 4 },
              };
        },
        assertReportSnapshot: async (value) => assertions.push(value),
        annualTechnicalRows: c.annualTechnicalRows,
        annualGradeRows: c.annualGradeRows,
        periodicKarnamehHtml: c.periodicKarnamehHtml,
        initPeriodicKarnameh() {},
        finalText: c.finalText,
      },
    },
    context: () => workspace,
    filters: {
      mode,
      audience,
      schoolId: "school",
      classId: "class",
      studentId: audience === "parent" ? "student" : "",
      date: "2026-11-17",
      note: "",
    },
    readNote: () => "",
    noteWorkspaceId: () => workspace.id,
    notePeriodScope: (value) => value,
    noteReadErrors: new Map(),
    notes: new Map(),
    noteEditGeneration: 0,
    noteScopeSignature: () => "scope",
    invalidateExcelShare() {},
    document: {
      querySelectorAll: () => [],
      getElementById(id) {
        if (!elements.has(id))
          elements.set(id, { innerHTML: "", textContent: "" });
        return elements.get(id);
      },
    },
  });
  for (const file of [
    "date-range.js",
    "model.js",
    "text.js",
    "document.js",
    "excel.js",
    "generate.js",
  ])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/reports/periodic", file),
        "utf8",
      ),
      c,
      { filename: file },
    );
  return {
    c,
    parts,
    calls,
    assertions,
    elements,
    active,
    annualData,
    yearContext,
  };
}

test("production parent preparation merges independent unit scores annually while retaining term-local activity", async () => {
  const f = fixture(),
    before = JSON.stringify(f.parts),
    model = await f.c.generate();
  assert.ok(model, f.elements.get("periodicError")?.textContent);
  assert.deepEqual(
    f.calls.map((call) => call.annual),
    [false, true],
  );
  assert.equal(f.calls[1].yearWide, true);
  assert.deepEqual(plain(model.currentGrades), []);
  assert.equal(model.summary.sessions, 1);
  assert.deepEqual(
    Array.from(model.sessions, (session) => session.id),
    ["second-session"],
  );
  assert.equal(model.technicalGrades.length, 1);
  assert.equal(model.technicalGrades[0].unitBased, true);
  assert.deepEqual(
    plain(
      model.technicalGrades[0].units.map((unit) => [
        unit.unitId,
        unit.inputs,
        unit.final,
      ]),
    ),
    [
      ["unit0", { m: 0, c: 3 }, 15],
      ["unit1", { m: 2, c: 1 }, 7],
      ["unit2", { m: 0, c: null }, null],
      ["unit3", { m: null, c: null }, null],
    ],
  );
  assert.equal(f.assertions.at(-1), f.yearContext);
  assert.equal(JSON.stringify(f.parts), before);
});

test("generated HTML, plain text and Excel expose identical annual unit inputs and results including zero and incomplete grades", async () => {
  const f = fixture(),
    model = await f.c.generate();
  assert.ok(model, f.elements.get("periodicError")?.textContent);
  const html = f.elements.get("periodicReportOutput").innerHTML;
  assert.equal(
    (
      html.match(
        /<td\b[^>]*data-karnameh-field="unit-result"[^>]*data-karnameh-unit=/g,
      ) || []
    ).length,
    4,
  );
  const text = latin(f.c.textReport(model));
  const fallback = latin(f.c.documentHtml(model));
  const sheets = plain(f.c.excelReportSheets(model));
  const units = sheets.find((sheet) => sheet.name === "واحدهای کار پودمانی");
  assert.deepEqual(
    units.rows.slice(1).map((row) => row.slice(-6)),
    [
      ["پودمان 0", "واحد 0", 0, 3, 15, "قبول"],
      ["پودمان 0", "واحد 1", 2, 1, 7, "نیازمند جبران"],
      ["پودمان 1", "واحد 2", 0, null, null, "ناقص"],
      ["پودمان 1", "واحد 3", null, null, null, "ناقص"],
    ],
  );
  assert.match(text, /واحد 0: مستمر 0 \| شایستگی 3 \| نتیجه واحد 15\.00/);
  assert.match(text, /واحد 1: مستمر 2 \| شایستگی 1 \| نتیجه واحد 7\.00/);
  assert.match(text, /واحد 2: مستمر 0 \| شایستگی — \| نتیجه واحد — — ناقص/);
  for (const output of [html, fallback, text, JSON.stringify(sheets)]) {
    assert.doesNotMatch(output, /PRIVATE|FIRST_OUTSIDE/);
    assert.doesNotMatch(
      output,
      /میانگین برابر|نهایی سالانه[:<]|نهایی درس[:<]|نتیجه درس:|نمرات چهار مرحله/,
    );
  }
  assert.ok(
    !sheets.some((sheet) =>
      ["نتیجه فنی", "پودمان‌ها", "واحدهای کار", "نتیجه سالانه"].includes(
        sheet.name,
      ),
    ),
  );
});

test("unit-only report definitions and Excel guide describe official independent unit scores without contradictory module guidance", async () => {
  const f = fixture(),
    model = await f.c.generate();
  assert.ok(model, f.elements.get("periodicError")?.textContent);
  assert.ok(
    model.definitions.some((text) =>
      text.includes("مستمر و شایستگی و نتیجهٔ هر واحد مستقل"),
    ),
  );
  assert.ok(
    model.definitions.some((text) =>
      text.includes("نمرات رسمی، وضعیت فعلی کل سال"),
    ),
  );
  assert.doesNotMatch(
    model.definitions.join("\n"),
    /میانگین برابر هر چهار مرحله|نمرات پودمانی برای کل سال/,
  );
  const metadata = plain(f.c.excelReportSheets(model))
    .find((sheet) => sheet.name === "خلاصه")
    .rows.flat()
    .join("\n");
  assert.match(metadata, /ارزشیابی مستقل واحدهای کار/);
  assert.match(metadata, /در هر دو نوبت سال مشترک/);
  assert.doesNotMatch(
    metadata,
    /واحدهای کار جزئیات آموزشی‌اند|نمرهٔ ترکیبی واحد کار خالی است/,
  );
});

test("annual management preparation and a first-term-only year keep one official row per unit without placeholders for an unstarted term", async () => {
  for (const firstOnly of [false, true]) {
    const f = fixture({ mode: "annual", audience: "management", firstOnly });
    const model = await f.c.generate();
    assert.ok(model, f.elements.get("periodicError")?.textContent);
    assert.deepEqual(
      f.calls.map((call) => call.annual),
      [true],
    );
    assert.equal(model.technicalGrades.length, 2);
    assert.equal(model.technicalGrades[0].units.length, 4);
    const pupil = model.technicalGrades.find(
      (row) => row.studentId === "student",
    );
    assert.equal(pupil.units[0].final, 15);
    assert.equal(pupil.units[1].final, firstOnly ? null : 7);
    assert.equal(model.summary.sessions, firstOnly ? 1 : 2);
    assert.equal(model.periods.length, firstOnly ? 1 : 2);
    assert.match(model.definitions.join("\n"), /نوبت‌های موجود همین سال/);
  }
});

test("a revision conflict between the active term and annual unit source discards every prepared output", async () => {
  const f = fixture();
  f.yearContext.revision++;
  assert.equal(await f.c.generate(), null);
  assert.match(
    f.elements.get("periodicError").textContent,
    /اطلاعات هنگام تهیه گزارش تغییر کرد/,
  );
  assert.doesNotMatch(
    f.elements.get("periodicReportOutput").innerHTML,
    /data-karnameh-unit=/,
  );
});

test("a current-grade unit-only view does not add an empty cumulative-course section", () => {
  const f = fixture();
  const model = f.c.build(f.active, { ...f.c.filters });
  model.currentGrades = [
    { unitBased: true, lessonName: "واحدمحور", modules: [], final: null },
  ];
  assert.doesNotMatch(f.c.textReport(model), /آخرین وضعیت تجمعی درس‌ها/);
});

test("mixed old and unit-based courses keep distinct official scopes and correctly qualified Excel guidance", async () => {
  const f = fixture();
  for (const [index, part] of f.parts.entries())
    part.data.schools[0].classes[0].lessons.push({
      id: "module-course",
      name: "درس روش پودمان",
      gradeMode: "standard",
      gradingPolicy: plain(f.c.EduPolicy.defaults("modular", "1405-1406")),
      poudmans: [
        {
          id: "old-module",
          name: "پودمان مستقل قدیمی",
          podScores: index ? {} : { student: { m: 3, c: 3 } },
          units: [{ id: "old-unit", name: "واحد آموزشی", unitScores: {} }],
        },
      ],
    });
  const model = await f.c.generate();
  assert.ok(model, f.elements.get("periodicError")?.textContent);
  assert.equal(model.technicalGrades.length, 2);
  assert.equal(
    model.technicalGrades.find((grade) => grade.unitBased).final,
    null,
  );
  assert.equal(
    model.technicalGrades.find((grade) => !grade.unitBased).final,
    18,
  );
  const sheets = plain(f.c.excelReportSheets(model));
  const totals = sheets.find((sheet) => sheet.name === "نتیجه فنی");
  assert.equal(totals.rows.length, 2);
  assert.equal(totals.rows[1][3], "درس روش پودمان");
  assert.equal(
    sheets.find((sheet) => sheet.name === "واحدهای کار پودمانی").rows.length,
    5,
  );
  const metadata = sheets
    .find((sheet) => sheet.name === "خلاصه")
    .rows.flat()
    .join("\n");
  assert.match(metadata, /واحد کار در روش نمره‌دهی پودمان/);
  assert.match(metadata, /ارزشیابی مستقل واحدهای کار/);
});

test("conflicting annual unit inputs fail the production report before HTML or export data are accepted", async () => {
  const f = fixture();
  f.parts[1].data.schools[0].classes[0].lessons[0].poudmans[0].units[0].competencyScores.student =
    { m: 4, c: 3 };
  assert.equal(await f.c.generate(), null);
  assert.match(
    f.elements.get("periodicError").textContent,
    /دو نمرهٔ متفاوت|دو نمرهٔ|دو نمره|تعارض/,
  );
  assert.doesNotMatch(
    f.elements.get("periodicReportOutput").innerHTML,
    /data-karnameh-unit=/,
  );
});
