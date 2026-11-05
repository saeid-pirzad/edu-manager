"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(mode) {
  const c = vm.createContext({
    esc: (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;"),
    faDate: String,
    modeLabel: String,
  });
  c.root = c;
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
    "reports/periodic/text.js",
    "reports/periodic/document.js",
    "reports/periodic/excel.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  const student = { id: "selected", name: "SELECTED", code: "001" },
    other = { id: "other", name: "PRIVATE_PERSON" };
  const types = [
    "mostamar",
    "payani",
    "classGrade",
    "positive",
    "negative",
    "homework",
    "activity",
    "legacy",
  ];
  const data = {
    settings: { academicYear: "1405-1406", academicTerm: "اول" },
    schools: [
      {
        id: "school",
        name: "SCHOOL",
        classes: [
          {
            id: "class",
            name: "CLASS",
            students: [student, other],
            lessons: [{ id: "lesson", name: "LESSON" }],
          },
        ],
      },
    ],
    sessions: [0, 1].map((period) => ({
      id: "session" + period,
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
      date: "2026-11-02",
      period,
      roster: [student, other],
      attendance: { selected: period ? "absent" : "late:10", other: "present" },
      scores: period
        ? []
        : [
            ...types.map((type, index) => ({
              studentId: "selected",
              type,
              value: index === 3 ? 0.5 : 0,
              note: "NOTE_" + type + "<script>",
            })),
            { studentId: "selected", type: "negative", note: "NOTE_ONLY" },
            {
              studentId: "other",
              type: "positive",
              value: 20,
              note: "PRIVATE_NOTE",
            },
          ],
    })),
  };
  const m = c.EduReportModel.build(
    data,
    {
      mode,
      date: "2026-11-02",
      schoolId: "school",
      classId: "class",
      audience: "parent",
      studentId: "selected",
      detailLevel: "summary",
    },
    { generatedAt: "2026-11-06T08:00:00Z" },
  );
  return { c, m, data, types };
}
for (const mode of ["daily", "weekly", "monthly", "annual"])
  test(
    "complete parent performance in " +
      mode +
      " retains every activity and isolates the pupil across outputs",
    () => {
      const { c, m, data, types } = fixture(mode);
      const before = JSON.stringify({ m, data });
      assert.equal(m.detailLevel, "full");
      assert.equal(m.sessions.length, 2);
      assert.equal(m.summary.present, 0);
      assert.equal(m.summary.late, 1);
      assert.equal(m.summary.absent, 1);
      assert.equal(m.sessions[0].participants[0].scores.length, 9);
      const html = c.documentHtml(m),
        text = c.textReport(m),
        excel = JSON.stringify(c.excelReportSheets(m));
      for (const output of [html, text, excel, JSON.stringify(m)]) {
        for (const type of types) assert.ok(output.includes("NOTE_" + type));
        assert.ok(output.includes("NOTE_ONLY"));
        assert.doesNotMatch(output, /PRIVATE_PERSON|PRIVATE_NOTE/);
      }
      assert.match(html, /report-session-disclosure" open/);
      assert.match(html, /گزارش کامل عملکرد هنرجو/);
      assert.match(html, /توضیح \/ تذکر: NOTE_ONLY/);
      assert.match(html, /&lt;script&gt;/);
      assert.doesNotMatch(html, /<script>/);
      assert.equal(
        (
          html.match(/scope="row" class="report-session-student-heading"/g) ||
          []
        ).length,
        2,
      );
      const rows = c.parentPerformanceRows(m);
      assert.equal(rows.find(([label]) => label === "امتیاز منفی")[1], "۲ ثبت");
      assert.equal(
        rows.find(([label]) => label === "نمره‌های ثبت‌شده")[1],
        "۳ ثبت",
      );
      assert.equal(
        rows.find(([label]) => label === "توضیحات همراه ثبت‌ها")[1],
        "۹ مورد",
      );
      assert.equal(JSON.stringify({ m, data }), before);
    },
  );
