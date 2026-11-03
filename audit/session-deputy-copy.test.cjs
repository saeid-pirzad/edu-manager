"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
function fixture() {
  const c = vm.createContext({
    faDate: (d) => "شمسی:" + d,
    num: (n) => Number(n).toLocaleString("fa-IR"),
    esc: (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;"),
    filters: {
      audience: "parent",
      schoolId: "unrelated",
      studentId: "unrelated",
    },
  });
  c.root = c;
  for (const p of [
    "src/domain/calendar.js",
    "src/domain/academic-year.js",
    "src/domain/reporting/attendance.js",
    "src/domain/reporting/date-ranges.js",
    "src/domain/reporting/periodic-model.js",
    "src/reports/periodic/text.js",
  ])
    vm.runInContext(read(p), c);
  c.build = (source, options) =>
    c.EduReportModel.build(source, options, {
      generatedAt: "2026-11-03T10:00:00Z",
      collisionScope: "teacher",
    });
  const people = [
    "PRESENT_PRIVATE",
    "ABSENT_HISTORICAL",
    "LATE_HISTORICAL",
    "LEAVE_HISTORICAL",
    "<UNKNOWN>",
  ].map((name, i) => ({ id: "student" + i, name }));
  const lesson = {
    id: "lesson",
    name: "LESSON_SELECTED",
    teacher: "TEACHER_SELECTED",
    poudmans: [],
  };
  const source = {
    settings: { academicYear: "1405-1406", academicTerm: "اول" },
    schools: [
      {
        id: "school",
        name: "SCHOOL_SELECTED",
        classes: [
          {
            id: "class",
            name: "CLASS_SELECTED",
            students: people
              .map((st) => ({ ...st, name: "CURRENT_" + st.id }))
              .concat({ id: "new", name: "NEW_PRIVATE" }),
            archivedStudents: [],
            lessons: [lesson],
          },
          {
            id: "other-class",
            name: "OTHER_CLASS_PRIVATE",
            students: [{ id: "other", name: "OTHER_PRIVATE" }],
            lessons: [{ ...lesson, id: "other-lesson" }],
          },
        ],
      },
      { id: "other-school", name: "OTHER_SCHOOL_PRIVATE", classes: [] },
    ],
    sessions: [
      {
        id: "chosen",
        schoolId: "school",
        classId: "class",
        lessonId: "lesson",
        date: "2026-11-03",
        period: 1,
        roster: people,
        attendance: {
          student0: "present",
          student1: "absent",
          student2: "late:0",
          student3: "leave",
        },
        scores: [
          {
            studentId: "student0",
            type: "classGrade",
            value: 18,
            note: "GRADE_NOTE_PRIVATE",
          },
        ],
      },
      {
        id: "other-session",
        schoolId: "school",
        classId: "other-class",
        lessonId: "other-lesson",
        date: "2026-11-03",
        period: 2,
        roster: [{ id: "other", name: "OTHER_SESSION_PRIVATE" }],
        attendance: { other: "absent" },
        scores: [],
      },
      {
        id: "same-class-other-bell",
        schoolId: "school",
        classId: "class",
        lessonId: "lesson",
        date: "2026-11-03",
        period: 3,
        roster: [{ id: "new", name: "OTHER_BELL_PRIVATE" }],
        attendance: { new: "absent" },
        scores: [],
      },
    ],
  };
  return { c, source };
}
test("session deputy copy uses the reports format with complete attendance, historical names and only the chosen session", () => {
  const { c, source } = fixture(),
    before = JSON.stringify(source),
    filters = JSON.stringify(c.filters);
  const text = c.sessionDeputyReport(source, "chosen");
  for (const value of [
    "📋 گزارش کلی برای معاون",
    "مدرسه: SCHOOL_SELECTED",
    "سال تحصیلی: 1405-1406",
    "ترم: اول",
    "زنگ ۲",
    "CLASS_SELECTED",
    "LESSON_SELECTED",
    "TEACHER_SELECTED",
    "🟢 حاضر: ۲ نفر",
    "🔴 غایب (۱): ABSENT_HISTORICAL",
    "🟠 تأخیر (۱): LATE_HISTORICAL (۰ دقیقه)",
    "🟣 مرخصی (۱): LEAVE_HISTORICAL",
    "⚪ تعیین‌نشده (۱): <UNKNOWN>",
    "مرخصی جدا از غیبت است",
    "تعیین‌نشده به معنی غیبت نیست",
  ])
    assert.ok(text.includes(value), value);
  for (const value of [
    "PRESENT_PRIVATE",
    "OTHER_PRIVATE",
    "OTHER_SESSION_PRIVATE",
    "OTHER_BELL_PRIVATE",
    "OTHER_CLASS_PRIVATE",
    "OTHER_SCHOOL_PRIVATE",
    "NEW_PRIVATE",
    "GRADE_NOTE_PRIVATE",
    "CURRENT_",
  ])
    assert.ok(!text.includes(value), value);
  assert.equal((text.match(/تاریخ:/g) || []).length, 1);
  assert.equal(JSON.stringify(source), before);
  assert.equal(JSON.stringify(c.filters), filters);
  const html = c.deputyReportHTML(text);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /<strong>غایب<\/strong>/);
  assert.match(html, /&lt;UNKNOWN&gt;/);
  assert.doesNotMatch(html, /<UNKNOWN>/);
});
test("session and normal deputy reports use the same shared formatter", () => {
  const { c, source } = fixture();
  const expected = c.deputyReport(
    c.build(
      { ...source, sessions: source.sessions.filter((s) => s.id === "chosen") },
      {
        mode: "daily",
        date: "2026-11-03",
        schoolId: "school",
        classId: "class",
        audience: "management",
        detailLevel: "summary",
      },
    ),
  );
  assert.equal(c.sessionDeputyReport(source, "chosen"), expected);
});
for (const missing of ["session", "school", "class", "lesson"]) {
  test(
    "session deputy copy refuses a missing " +
      missing +
      " instead of copying another report",
    () => {
      const { c, source } = fixture();
      if (missing === "session") source.sessions = [];
      if (missing === "school") source.schools = [];
      if (missing === "class") source.schools[0].classes = [];
      if (missing === "lesson") source.schools[0].classes[0].lessons = [];
      assert.throws(
        () => c.sessionDeputyReport(source, "chosen"),
        /جلسه|مدرسه|کلاس|درس/,
      );
    },
  );
}
test("empty session roster is identified without treating future class members as present or absent", () => {
  const { c, source } = fixture();
  source.sessions[0].roster = [];
  source.sessions[0].attendance = {};
  source.sessions[0].scores = [];
  const text = c.sessionDeputyReport(source, "chosen");
  assert.match(text, /فهرست حضور این جلسه خالی است/);
  assert.match(text, /حاضر: ۰ نفر/);
  assert.match(text, /تعیین‌نشده \(۰\): —/);
  assert.doesNotMatch(text, /NEW_PRIVATE|CURRENT_/);
});
