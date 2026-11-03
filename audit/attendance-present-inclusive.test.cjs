"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(values) {
  const context = vm.createContext({
    root: {},
    esc: String,
    faDate: String,
    modeLabel: String,
  });
  for (const file of [
    "calendar.js",
    "academic-year.js",
    "reporting/attendance.js",
    "reporting/date-ranges.js",
    "reporting/periodic-model.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/domain", file), "utf8"),
      context,
    );
  Object.assign(context.root, {
    EduReportDates: context.EduReportDates,
    EduReportModel: context.EduReportModel,
    EduReportAttendance: context.EduReportAttendance,
  });
  for (const name of ["date-range.js", "model.js", "text.js", "document.js"])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/reports/periodic", name),
        "utf8",
      ),
      context,
    );
  const students = values.map((_, index) => ({
    id: "s" + index,
    name: "student" + index,
  }));
  const source = {
    settings: { academicYear: "1405-1406" },
    schools: [
      {
        id: "school",
        name: "school",
        classes: [
          {
            id: "class",
            name: "class",
            students,
            lessons: [{ id: "lesson", name: "lesson" }],
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
        date: "2026-10-31",
        period: 0,
        roster: students,
        attendance: Object.fromEntries(
          values.map((value, index) => ["s" + index, value]),
        ),
        scores: [],
      },
    ],
  };
  return {
    context,
    source,
    model: context.build(source, {
      mode: "daily",
      date: "2026-10-31",
      schoolId: "school",
      audience: "management",
      detailLevel: "summary",
    }),
  };
}
const latin = (text) =>
  text.replace(/[۰-۹]/g, (value) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(value)));
test("late attendance belongs to displayed present totals without changing raw records or doubling attendance rate", () => {
  const { context, source, model } = fixture([
    "present",
    "late:10",
    "absent",
    "leave",
    "",
  ]);
  const before = JSON.stringify({ source, model });
  assert.equal(model.summary.present, 1);
  assert.equal(model.summary.late, 1);
  assert.equal(model.summary.attendanceRate, 66.7);
  const html = latin(context.documentHtml(model));
  assert.doesNotMatch(html, /periodic-summary|data-summary-status/);
  assert.match(html, /<dt>حاضر<\/dt><dd>2<\/dd>/);
  const lateStudent = context.studentFollowupHtml({
    students: model.students.filter((st) => st.studentId === "s1"),
  });
  assert.match(latin(lateStudent), /<dt>حاضر<\/dt><dd>1<\/dd>/);
  assert.match(latin(context.textReport(model)), /حاضر: 2/);
  const deputy = latin(context.deputyReport(model));
  assert.match(deputy, /🟢 حاضر: 2 نفر/);
  assert.match(deputy, /🟠 تأخیر \(1\): student1 \(10 دقیقه\)/);
  assert.match(deputy, /تأخیر جزو حاضرین است/);
  assert.equal(JSON.stringify({ source, model }), before);
});
test("all-late, zero-minute late, missing attendance and empty rosters produce correct present totals", () => {
  for (const values of [["late", "late:0"], ["absent", "leave", ""], []]) {
    const { context, model } = fixture(values);
    const expected = values.filter(
      (value) => value === "present" || value.startsWith("late"),
    ).length;
    const deputy = latin(context.deputyReport(model));
    assert.ok(deputy.includes("🟢 حاضر: " + expected + " نفر"));
    if (values[0] === "late") assert.equal(model.summary.attendanceRate, 100);
    else assert.equal(model.summary.attendanceRate, values.length ? 0 : null);
  }
});
