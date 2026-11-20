"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture(audience = "management") {
  const c = vm.createContext({
    Intl,
    faDate: String,
    modeLabel: String,
    root: {
      EduV24: {
        finalText: (grade) =>
          grade.complete && Number.isFinite(grade.final)
            ? grade.final.toFixed(2)
            : "—",
      },
    },
  });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
    "domain/reporting/completeness.js",
    "domain/reporting/academic-summary.js",
    "reports/periodic/text.js",
    "reports/periodic/excel.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  const students = [
    { id: "a", name: "FIRST", code: "001" },
    { id: "b", name: "OTHER_PRIVATE", code: "002" },
    { id: "c", name: "THIRD", code: "003" },
  ];
  const source = {
    settings: { academicYear: "1405-1406", academicTerm: "اول" },
    schools: [
      {
        id: "school",
        name: "SCHOOL",
        classes: [
          {
            id: "class",
            name: "CLASS",
            students,
            lessons: [{ id: "lesson", name: "LESSON", teacher: "TEACHER" }],
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
        date: "2026-11-20",
        period: 0,
        roster: students,
        attendance: { a: "late:0", b: "absent" },
        scores: [],
      },
    ],
  };
  const model = c.EduReportModel.build(
    source,
    {
      mode: "annual",
      date: "2026-11-20",
      schoolId: "school",
      classId: "class",
      audience,
      studentId: audience === "parent" ? "a" : "",
      detailLevel: "full",
    },
    { generatedAt: "2026-11-20T10:00:00Z" },
  );
  model.annualGrades = students
    .map((student, index) => ({
      classId: "class",
      className: "CLASS",
      studentId: student.id,
      studentName: student.name,
      studentCode: student.code,
      lessonId: "lesson",
      lessonName: "LESSON",
      complete: index !== 2,
      final: index === 2 ? null : index ? 5 : 18,
      passed: index !== 2 ? index === 0 : null,
      components: [0, 1, 2, 3].map((stage) => ({
        term: stage < 2 ? "اول" : "دوم",
        stage: stage % 2 ? "final" : "midterm",
        complete: index !== 2,
        practical: index === 2 ? null : index ? 5 : 18,
        theory: index === 2 ? null : index ? 5 : 18,
        practicalWeight: 70,
        final: index === 2 ? null : index ? 5 : 18,
        passed: index === 0,
      })),
    }))
    .filter((grade) => audience !== "parent" || grade.studentId === "a");
  return { c, model };
}

test("text and Excel expose the same recorded-observation completion and practical follow-up scope", () => {
  const { c, model } = fixture(),
    before = JSON.stringify(model),
    text = c.textReport(model),
    sheets = c.excelReportSheets(model),
    metadata = new Map(sheets.find((sheet) => sheet.name === "خلاصه").rows),
    followup = sheets.find((sheet) => sheet.name === "پیگیری حضور").rows;
  assert.equal(metadata.get("ثبت حضور · کل نفرـجلسه"), 3);
  assert.equal(metadata.get("ثبت حضور · ثبت‌شده"), 2);
  assert.equal(metadata.get("ثبت حضور · تعیین‌نشده"), 1);
  assert.equal(
    metadata.get("تکمیل ثبت حضور (درصد؛ متفاوت از نرخ حضور)"),
    (2 / 3) * 100,
  );
  assert.equal(metadata.get("جلسات با حضور ناتمام"), 1);
  assert.equal(followup.length, 4);
  assert.equal(followup[1][1], "003");
  assert.match(text, /ثبت‌شده \/ کل نفرـجلسه: ۲ \/ ۳/);
  assert.match(text, /تکمیل ثبت حضور: ۶۶٫۶۷٪/);
  assert.match(
    text,
    /THIRD \| CLASS \| کد: 003 \| غایب: ۰ \| تأخیر: ۰ \| تعیین‌نشده: ۱/,
  );
  assert.equal(JSON.stringify(model), before);
});

test("official summary and follow-up exports distinguish incomplete, failed and passed results with a documented denominator", () => {
  const { c, model } = fixture(),
    sheets = c.excelReportSheets(model),
    summary = sheets.find((sheet) => sheet.name === "خلاصه ارزشیابی").rows,
    followup = sheets.find((sheet) => sheet.name === "پیگیری ارزشیابی").rows,
    text = c.textReport(model);
  assert.deepEqual(Array.from(summary[1].slice(5)), [
    3,
    2,
    1,
    1,
    1,
    0,
    (2 / 3) * 100,
    50,
  ]);
  assert.equal(followup.length, 3);
  assert.equal(followup.find((row) => row[2] === "THIRD")[6], "نمره ناقص");
  assert.equal(
    followup.find((row) => row[2] === "OTHER_PRIVATE")[6],
    "نیازمند جبران",
  );
  assert.match(
    text,
    /کامل ۲ از ۳ \| ناقص ۱ \| قبول ۱ \| جبران ۱ \| بدون معیار قبولی ۰ \| درصد قبولی ۵۰٪/,
  );
  assert.match(
    text,
    /OTHER_PRIVATE \/ CLASS \/ LESSON \| کد: 002 \| نیازمند جبران/,
  );
  assert.match(text, /THIRD \/ CLASS \/ LESSON \| کد: 003 \| نمره ناقص/);
});

test("every parent export summary retains only the selected learner and does not invent an academic follow-up", () => {
  const { c, model } = fixture("parent"),
    sheets = c.excelReportSheets(model),
    text = c.textReport(model);
  assert.doesNotMatch(
    JSON.stringify(sheets) + text,
    /OTHER_PRIVATE|THIRD|002|003/,
  );
  assert.equal(
    sheets.some((sheet) => sheet.name === "پیگیری ارزشیابی"),
    false,
  );
  assert.equal(
    sheets.find((sheet) => sheet.name === "پیگیری حضور").rows.length,
    2,
  );
  assert.equal(
    sheets.find((sheet) => sheet.name === "خلاصه ارزشیابی").rows[1][5],
    1,
  );
});

test("independent work units retain their own follow-up and never create a module or course aggregate", () => {
  const { c, model } = fixture();
  model.annualGrades = [];
  model.technicalGrades = [
    {
      classId: "class",
      className: "CLASS",
      lessonId: "unit-lesson",
      lessonName: "UNIT_LESSON",
      studentId: "a",
      studentName: "FIRST",
      studentCode: "001",
      method: "modular",
      unitBased: true,
      modules: [
        {
          id: "module",
          name: "MODULE",
          units: [
            {
              id: "first-unit",
              name: "FIRST_UNIT",
              complete: false,
              final: null,
              inputs: { m: 0, c: null },
            },
            {
              id: "second-unit",
              name: "SECOND_UNIT",
              complete: true,
              final: 5,
              passed: false,
              inputs: { m: 0, c: 1 },
            },
          ],
        },
      ],
    },
  ];
  const sheets = c.excelReportSheets(model),
    rows = sheets
      .find((sheet) => sheet.name === "خلاصه ارزشیابی")
      .rows.slice(1),
    followup = sheets
      .find((sheet) => sheet.name === "پیگیری ارزشیابی")
      .rows.slice(1),
    text = c.textReport(model);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row[4] === "واحد کار مستقل"));
  assert.equal(followup.find((row) => row[5] === "FIRST_UNIT")[6], "نمره ناقص");
  assert.equal(
    followup.find((row) => row[5] === "SECOND_UNIT")[6],
    "نیازمند جبران",
  );
  assert.equal(
    sheets.some((sheet) => sheet.name === "نتیجه فنی"),
    false,
  );
  assert.match(text, /FIRST \/ CLASS \/ UNIT_LESSON \/ MODULE \/ FIRST_UNIT/);
  assert.match(text, /نمرهٔ تجمیعی ساخته نمی‌شود/);
});
