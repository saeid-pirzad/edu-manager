"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const roster = [
      { id: "present", name: "PRESENT" },
      { id: "absent", name: "ABSENT" },
      { id: "leave", name: "LEAVE" },
      { id: "late", name: "LATE_UNTIMED" },
      { id: "late-zero", name: "LATE_ZERO" },
      { id: "unset", name: "UNSET_HISTORICAL" },
      { id: "invalid", name: "<INVALID>" },
    ],
    lesson = { id: "lesson", name: "Lesson", poudmans: [] },
    classroom = {
      id: "class",
      name: "Class",
      students: [{ id: "new", name: "NEW_CURRENT_MEMBER" }],
      archivedStudents: roster,
      lessons: [lesson],
    },
    session = {
      id: "session",
      date: "2026-11-01",
      period: 0,
      schoolId: "school",
      classId: classroom.id,
      lessonId: lesson.id,
      roster,
      attendance: {
        present: "present",
        absent: "absent",
        leave: "leave",
        late: "late",
        "late-zero": "late:0",
        invalid: "late-invalid",
        new: "present",
      },
      scores: [],
    },
    source = {
      settings: { academicYear: "1405-1406" },
      schools: [{ id: "school", name: "School", classes: [classroom] }],
      sessions: [session],
    },
    context = vm.createContext({
      db: source,
      sessionStudents: (c, s) => s.roster || c.students,
      sessionStudent: (c, s, id) =>
        (s.roster || c.students).find((student) => student.id === id),
      getSortedStudents: () => [],
      faDate: String,
      esc: (value) =>
        String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;"),
    });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
    "legacy/reports/session-text.js",
    "legacy/reports/lesson.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      context,
      { filename: file },
    );
  return { context, classroom, session, lesson, source };
}

test("session report exposes every unrecorded historical member without counting current additions", () => {
  const f = fixture(),
    before = JSON.stringify(f.source),
    text = f.context.generateSessionReportText(
      f.session,
      f.classroom,
      f.lesson,
    );
  assert.match(text, /حاضر \(3 نفر\): PRESENT، LATE_UNTIMED، LATE_ZERO/);
  assert.match(text, /غایب \(1 نفر\): ABSENT/);
  assert.match(text, /مرخصی \(1 نفر\): LEAVE/);
  assert.match(text, /تعیین‌نشده \(2 نفر\): UNSET_HISTORICAL، <INVALID>/);
  assert.doesNotMatch(text, /NEW_CURRENT_MEMBER/);
  assert.equal(JSON.stringify(f.source), before);
});

test("session report distinguishes unrecorded lateness duration from explicitly recorded zero", () => {
  const f = fixture(),
    text = f.context.generateSessionReportText(
      f.session,
      f.classroom,
      f.lesson,
    );
  assert.match(text, /تأخیر \(2 نفر\): LATE_UNTIMED، LATE_ZERO \(0 دقیقه\)/);
  assert.doesNotMatch(text, /LATE_UNTIMED \(/);
});

test("legacy lesson report uses the same roster/status rules and safely displays unresolved attendance", () => {
  const f = fixture(),
    before = JSON.stringify(f.source),
    html = f.context.legacy_buildLessonReportHtml(f.classroom, f.lesson);
  assert.match(html, /حاضر: <b>3<\/b>/);
  assert.match(html, /تأخیر: <b>2<\/b>/);
  assert.match(html, /تعیین‌نشده \(2 نفر\): UNSET_HISTORICAL، &lt;INVALID&gt;/);
  assert.match(html, /LATE_UNTIMED، LATE_ZERO \(0د\)/);
  assert.doesNotMatch(html, /NEW_CURRENT_MEMBER|<INVALID>/);
  assert.equal(JSON.stringify(f.source), before);
});

test("a wholly unrecorded frozen roster remains explicit rather than looking like a completed empty report", () => {
  const f = fixture();
  f.session.attendance = {};
  for (const output of [
    f.context.generateSessionReportText(f.session, f.classroom, f.lesson),
    f.context.legacy_buildLessonReportHtml(f.classroom, f.lesson),
  ]) {
    assert.match(output, /تعیین‌نشده \(7 نفر\)/);
    assert.match(output, /UNSET_HISTORICAL/);
    assert.doesNotMatch(output, /NEW_CURRENT_MEMBER/);
  }
});

test("periodic attendance-rate definition names the exact denominator and keeps leave separate", () => {
  const f = fixture();
  // The shared projection intentionally keeps all recorded observations; valid
  // saved sessions enforce roster membership before this reporting boundary.
  delete f.session.attendance.new;
  const model = f.context.EduReportModel.build(
    f.source,
    {
      mode: "daily",
      date: f.session.date,
      schoolId: "school",
      audience: "management",
    },
    { generatedAt: "2026-11-02T09:00:00.000Z" },
  );
  assert.equal(model.summary.present, 1);
  assert.equal(model.summary.late, 2);
  assert.equal(model.summary.absent, 1);
  assert.equal(model.summary.leave, 1);
  assert.equal(model.summary.unknown, 2);
  assert.equal(model.summary.attendanceRate, 75);
  assert.ok(
    model.definitions.some((line) =>
      line.includes("مرخصی و موارد تعیین‌نشده در مخرج نیستند"),
    ),
  );
});
