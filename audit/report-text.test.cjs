"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/reports/periodic/text.js"),
  "utf8",
);
function fixture() {
  const context = vm.createContext({
    faDate: String,
    modeLabel: String,
    root: {
      EduV24: {
        finalText: (grade) => (grade.complete ? String(grade.final) : "—"),
      },
    },
  });
  vm.runInContext(source, context);
  const model = {
    mode: "daily",
    audience: "management",
    detailLevel: "summary",
    school: { name: "SCHOOL" },
    start: "2026-11-03",
    end: "2026-11-03",
    academicYear: "1405-1406",
    academicTerm: "اول",
    generatedAt: "2026-11-03T21:15:30Z",
    summary: {
      sessions: 0,
      present: 0,
      absent: 0,
      late: 0,
      leave: 0,
      unknown: 0,
      recordedMarks: 0,
      attendanceRate: null,
    },
    students: [],
    sessions: [],
    currentGrades: [],
    definitions: ["GRADE-SCOPE: missing grade is not zero."],
    warnings: [],
    author: "",
  };
  return { context, model };
}
test("text report omits signature and empty author placeholders while retaining scope definitions", () => {
  const { context, model } = fixture();
  const before = JSON.stringify(model);
  const text = context.textReport(model);
  assert.doesNotMatch(text, /امضا:|تنظیم‌کننده:|\.{4}/);
  assert.ok(text.includes(model.definitions[0]));
  assert.equal(JSON.stringify(model), before);
  model.author = "   ";
  assert.doesNotMatch(context.textReport(model), /تنظیم‌کننده:/);
});
test("actual author follows every grade section and incomplete grades remain explicit", () => {
  const { context, model } = fixture();
  model.author = "  TEACHER  ";
  model.technicalGrades = [
    {
      studentName: "STUDENT",
      className: "CLASS",
      lessonName: "TECHNICAL",
      method: "modular",
      complete: true,
      final: 18,
      modules: [],
    },
  ];
  model.annualGrades = [
    {
      studentName: "STUDENT",
      className: "CLASS",
      lessonName: "VOCATIONAL",
      components: [
        {
          stage: "midterm",
          term: "اول",
          practical: 0,
          theory: null,
          final: null,
          complete: false,
        },
      ],
      complete: false,
      final: null,
    },
  ];
  const before = JSON.stringify(model);
  const text = context.textReport(model);
  assert.ok(text.endsWith("تنظیم‌کننده: TEACHER"));
  assert.equal((text.match(/تنظیم‌کننده: TEACHER/g) || []).length, 1);
  assert.ok(text.indexOf("TECHNICAL") < text.lastIndexOf("تنظیم‌کننده:"));
  assert.ok(text.indexOf("VOCATIONAL") < text.lastIndexOf("تنظیم‌کننده:"));
  assert.match(text, /عملی 0، تئوری ثبت نشده/);
  assert.match(text, /ناقص؛ هر چهار نمره لازم است/);
  assert.doesNotMatch(text, /امضا:|\.{4}/);
  assert.equal(JSON.stringify(model), before);
});
test("text preparation time stays in Tehran when the device default zone differs", () => {
  const { context, model } = fixture();
  context.Date = class UTCDeviceDate extends Date {
    toLocaleString(locales, options) {
      return super.toLocaleString(locales, { timeZone: "UTC", ...options });
    }
  };
  const expected = new Date(model.generatedAt).toLocaleString("fa-IR", {
    timeZone: "Asia/Tehran",
  });
  const deviceDefault = new Date(model.generatedAt).toLocaleString("fa-IR", {
    timeZone: "UTC",
  });
  assert.notEqual(expected, deviceDefault);
  const text = context.textReport(model);
  assert.ok(text.includes("زمان تهیه: " + expected));
  assert.ok(!text.includes("زمان تهیه: " + deviceDefault));
});
