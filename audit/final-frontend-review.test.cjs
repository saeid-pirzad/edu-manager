"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const students = [
      { id: "on-time", name: "On time" },
      { id: "untimed", name: "Untimed late" },
      { id: "zero", name: "Zero-minute late" },
      { id: "timed", name: "Timed late" },
      { id: "absent", name: "Absent" },
      { id: "leave", name: "Leave" },
      { id: "unset", name: "Unset" },
    ],
    lesson = { id: "lesson", name: "Lesson", poudmans: [], teacher: "Teacher" },
    classroom = { id: "class", name: "Class", students, lessons: [lesson] },
    school = { id: "school", name: "School", classes: [classroom] },
    session = {
      id: "session",
      schoolId: school.id,
      classId: classroom.id,
      lessonId: lesson.id,
      date: "2026-11-20",
      period: 0,
      roster: students,
      attendance: {
        "on-time": "present",
        untimed: "late",
        zero: "late:0",
        timed: "late:10",
        absent: "absent",
        leave: "leave",
      },
      scores: [],
    },
    output = { innerHTML: "" },
    source = {
      settings: { academicYear: "1405-1406" },
      activeDays: [6],
      periods: 1,
      schools: [school],
      sessions: [session],
    },
    context = vm.createContext({
      db: source,
      currentSessionId: session.id,
      globalFilter: {
        showAttendance: true,
        showScores: true,
        showPosNeg: true,
        showHomework: true,
        showPresentNames: true,
        showAbsentNames: true,
        showLateNames: true,
        reportMode: "detailed",
      },
      EduIcons: { html: () => "" },
      DAYS: [
        "Saturday",
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
      ],
      EduAcademicYear: { contains: () => true },
      EduSessionSlots: { matchingPeriods: () => [0] },
      EduV24: { getReportContext: () => ({ id: "first", year: "1405-1406" }) },
      sessionStudents: (c, s) => s.roster || c.students,
      sessionStudent: (c, s, id) =>
        (s.roster || c.students).find((student) => student.id === id),
      getMasterEntry: () => ({
        schoolId: school.id,
        classId: classroom.id,
        lessonId: lesson.id,
      }),
      getLessonObj: (c, id) => c.lessons.find((item) => item.id === id),
      findClassById: () => ({ school, classObj: classroom }),
      getClassObj: () => classroom,
      getSchool: () => school,
      todayISO: () => session.date,
      faDate: String,
      getDayIdxFromDate: () => 6,
      getPeriodName: (period) => "Period " + (period + 1),
      esc: (value) =>
        String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;"),
      document: { getElementById: () => output },
    });
  context.window = context;
  for (const file of [
    "domain/reporting/attendance.js",
    "legacy/sessions/dialog.js",
    "legacy/ui/lesson.js",
    "legacy/ui/dashboard.js",
    "legacy/reports/comprehensive.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      context,
      { filename: file },
    );
  return { context, classroom, lesson, session, source, output };
}

test("session editor present progress includes all valid late statuses", () => {
  const f = fixture(),
    before = JSON.stringify(f.source);
  const result = f.context.sessionAttendanceProgress(f.session, f.classroom);
  assert.equal(result.present, 4);
  assert.equal(result.unset, 1);
  assert.equal(result.total, 7);
  assert.equal(JSON.stringify(f.source), before);
});

test("lesson session cards count late pupils within the displayed present total", () => {
  const f = fixture(),
    before = JSON.stringify(f.source);
  const html = f.context.renderLessonSessions(f.classroom, f.lesson);
  assert.ok(
    html.includes(
      '<span class="session-present"><b>' +
        (4).toLocaleString("fa-IR") +
        "</b> حاضر</span>",
    ),
  );
  assert.ok(
    html.includes(
      '<span class="session-late"><b>' +
        (3).toLocaleString("fa-IR") +
        "</b> تأخیر</span>",
    ),
  );
  assert.equal(JSON.stringify(f.source), before);
});

test("today agenda never describes an empty historical roster as completed attendance", () => {
  const f = fixture();
  f.session.roster = [];
  f.session.attendance = {};
  const before = JSON.stringify(f.source),
    html = f.context.renderTodayAgenda();
  assert.doesNotMatch(html, /حضوروغیاب کامل/);
  assert.match(html, /فهرست|بدون|فاقد|بررسی/);
  assert.equal(JSON.stringify(f.source), before);
});

test("copied detailed activity report retains homework explanations shown on screen", () => {
  const f = fixture();
  f.session.scores.push({
    studentId: "on-time",
    type: "homework",
    value: 1,
    note: "HOMEWORK_DETAILS",
  });
  const before = JSON.stringify(f.source);
  f.context.generateGlobalReport();
  assert.match(f.output.innerHTML, /HOMEWORK_DETAILS/);
  assert.match(f.context.buildGlobalReportText(f.source), /HOMEWORK_DETAILS/);
  assert.equal(JSON.stringify(f.source), before);
});
