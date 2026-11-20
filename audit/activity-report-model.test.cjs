"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  { inspectService } = require("../scripts/architecture-boundaries.cjs");

const read = (name) =>
    fs.readFileSync(path.join(__dirname, "..", name), "utf8"),
  modelSource = read("src/domain/reporting/activity-report.js"),
  legacySource = read("src/legacy/reports/comprehensive.js"),
  // Only the original report functions are retained, solely as a compatibility
  // oracle. Copied from a86356ed75ae4bccf4f07b1d539d92e89bda0e58 before extraction.
  beforeSource = read("audit/fixtures/activity-report-before-refactor.txt"),
  flags = [
    "showAttendance",
    "showScores",
    "showPosNeg",
    "showHomework",
    "showPresentNames",
    "showAbsentNames",
    "showLateNames",
  ],
  plain = (value) => JSON.parse(JSON.stringify(value));

function data() {
  const roster = [
      { id: "selected", name: "HISTORICAL_SELECTED<&>" },
      { id: "other", name: "PRIVATE_OTHER<&>" },
      { id: "leave", name: "PRIVATE_LEAVE" },
      { id: "unset", name: "PRIVATE_UNSET" },
    ],
    classroom = {
      id: "class",
      name: "CLASS<&>",
      students: [
        { id: "selected", name: "CURRENT_SELECTED" },
        ...roster.slice(1),
      ],
      archivedStudents: [],
      lessons: [{ id: "lesson", name: "LESSON<&>", teacher: "TEACHER<&>" }],
    },
    session = {
      id: "newer",
      schoolId: "school",
      classId: "class",
      lessonId: "lesson",
      date: "2026-11-20",
      period: 2,
      roster,
      attendance: {
        selected: "late:0",
        other: "absent",
        leave: "leave",
        unset: "late:invalid",
        phantom: "present",
      },
      scores: [
        { studentId: "selected", type: "activity", value: 0 },
        { studentId: "other", type: "mostamar", value: "PRIVATE_MARK<&>" },
        { studentId: "selected", type: "positive", value: 0 },
        { studentId: "selected", type: "payani", value: 18 },
        { studentId: "selected", type: "classGrade", value: "<class>&" },
        { studentId: "selected", type: "mostamar", value: 0 },
        { studentId: "selected", type: "negative", value: 1 },
        {
          studentId: "selected",
          type: "homework",
          value: 0,
          note: "HOMEWORK<&>\nSECOND_LINE",
        },
        {
          studentId: "other",
          type: "homework",
          value: 1,
          note: "PRIVATE_NOTE<&>",
        },
        { studentId: "selected", type: "homework", value: 1, note: "" },
        { studentId: "score-only", type: "activity", value: 5 },
        { studentId: "selected", type: "unrecognized", value: "IGNORED" },
      ],
    },
    sessionAt = (id, date, period, patch = {}) => ({
      ...structuredClone(session),
      id,
      date,
      period,
      ...patch,
    }),
    otherClass = {
      ...structuredClone(classroom),
      name: "SECOND_SCHOOL_CLASS",
      lessons: [{ id: "lesson", name: "SECOND_LESSON", teacher: "" }],
    };
  return {
    schools: [
      { id: "school", name: "SCHOOL<&>", classes: [classroom] },
      { id: "second-school", name: "SECOND_SCHOOL", classes: [otherClass] },
    ],
    sessions: [
      sessionAt("older-high-bell", "2026-11-19", 10),
      session,
      sessionAt("newer-first-bell", "2026-11-20", 0, {
        attendance: { selected: "late", other: "present" },
        scores: [],
      }),
      sessionAt("newer-tied-bell", "2026-11-20", 2, {
        attendance: { selected: "late:9" },
        scores: [],
      }),
      sessionAt("current-roster", "2026-11-18", 1, { roster: undefined }),
      sessionAt("empty-roster", "2026-11-17", 0, {
        roster: [],
        attendance: {},
        scores: [],
      }),
      sessionAt("second-school", "2026-11-16", 3, {
        schoolId: "second-school",
      }),
    ],
  };
}

function fixture(before = false) {
  const source = data(),
    output = { innerHTML: "" },
    alerts = [],
    copied = [],
    filter = {
      schoolId: "",
      classId: "",
      lessonId: "",
      studentId: "",
      date: "",
      period: "",
      reportMode: "detailed",
      ...Object.fromEntries(flags.map((flag) => [flag, true])),
    },
    context = vm.createContext({
      db: source,
      globalFilter: filter,
      document: { getElementById: () => output },
      sessionStudents: (classroom, session) =>
        session.roster || classroom.students,
      sessionStudent: (classroom, session, id) =>
        (session.roster || classroom.students).find(
          (student) => student.id === id,
        ),
      TYPE_LABELS: {
        mostamar: "MOSTAMAR",
        payani: "PAYANI",
        classGrade: "CLASS_MARK",
        activity: "ACTIVITY",
      },
      esc: (value) =>
        String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;"),
      faDate: String,
      todayISO: () => "2026-11-21",
      getPeriodName: (period) => "BELL_" + (period + 1),
      alert: (message) => alerts.push(message),
      EduV24: {
        copyReport: (produce, button) => {
          copied.push({ text: produce(), button });
          return "COPY_RESULT";
        },
      },
    });
  vm.runInContext(read("src/legacy/data/selectors.js"), context);
  vm.runInContext(read("src/domain/reporting/attendance.js"), context);
  if (!before) vm.runInContext(modelSource, context);
  vm.runInContext(before ? beforeSource : legacySource, context);
  return { context, source, output, alerts, copied, filter };
}

function capture(fixture) {
  const { context, output, alerts, copied } = fixture;
  alerts.length = 0;
  copied.length = 0;
  const sessions = plain(context.getFilteredSessions()),
    result = context.generateGlobalReport(),
    copyResult = context.copyGlobalReportText("COPY_BUTTON");
  return {
    sessions,
    html: output.innerHTML,
    alerts: [...alerts],
    copied,
    result,
    copyResult,
  };
}

for (const mode of ["summary", "detailed"])
  for (const studentId of ["", "selected", "unset", "score-only"])
    test(`${mode} ${studentId || "whole-class"} report matches the original for all 128 display-flag combinations`, () => {
      const before = fixture(true),
        after = fixture(),
        unchanged = JSON.stringify(after.source);
      for (let mask = 0; mask < 1 << flags.length; mask++) {
        const filter = {
          reportMode: mode,
          studentId,
          ...Object.fromEntries(
            flags.map((flag, index) => [flag, !!(mask & (1 << index))]),
          ),
        };
        Object.assign(before.filter, filter);
        Object.assign(after.filter, filter);
        assert.deepEqual(capture(after), capture(before), "flag mask " + mask);
      }
      assert.equal(JSON.stringify(after.source), unchanged);
    });

test("report filters, empty results and numeric bell grouping match the original", () => {
  for (const filter of [
    { schoolId: "second-school", classId: "class" },
    { classId: "class", lessonId: "lesson", date: "2026-11-20", period: "0" },
    { date: "2026-11-19", period: "10", studentId: "selected" },
    { date: "1900-01-01" },
    { studentId: "not-in-any-session" },
    { lessonId: "missing" },
  ]) {
    const before = fixture(true),
      after = fixture();
    Object.assign(before.filter, filter);
    Object.assign(after.filter, filter);
    assert.deepEqual(capture(after), capture(before), JSON.stringify(filter));
  }
  const f = fixture(),
    sessions = f.context.getFilteredSessions(),
    model = f.context.createGlobalReportModel().build(sessions, f.filter);
  assert.deepEqual(
    Array.from(model.rows, (row) => row.session.id),
    [
      "newer-first-bell",
      "newer",
      "newer-tied-bell",
      "older-high-bell",
      "current-roster",
      "empty-roster",
      "second-school",
    ],
  );
  assert.deepEqual(
    Array.from(model.periods, (group) => group.period),
    [0, 1, 2, 3, 10],
  );
  assert.deepEqual(
    Array.from(model.periods[2].rows, (row) => row.session.id),
    ["newer", "newer-tied-bell"],
  );
});

test("copied reports preserve their captured source and the existing school-specific lookup", () => {
  for (const mode of ["summary", "detailed"]) {
    const before = fixture(true),
      after = fixture(),
      captured = structuredClone(after.source),
      unchanged = JSON.stringify(captured);
    for (const f of [before, after]) {
      f.filter.reportMode = mode;
      f.filter.schoolId = "second-school";
      f.filter.classId = "class";
      for (const school of f.source.schools) {
        school.name = "LIVE_SCHOOL";
        school.classes[0].name = "LIVE_CLASS";
        school.classes[0].lessons[0].name = "LIVE_LESSON";
      }
    }
    const text = after.context.buildGlobalReportText(captured);
    assert.equal(text, before.context.buildGlobalReportText(captured));
    assert.match(text, /SECOND_SCHOOL_CLASS/);
    assert.match(text, /SECOND_LESSON/);
    assert.doesNotMatch(text, /LIVE_/);
    assert.equal(JSON.stringify(captured), unchanged);
  }
});

test("individual reports retain zero lateness and homework notes without exposing other pupils", () => {
  const f = fixture();
  f.filter.studentId = "selected";
  f.context.generateGlobalReport();
  const html = f.output.innerHTML,
    text = f.context.buildGlobalReportText();
  for (const output of [html, text]) {
    assert.match(output, /\(0د\)/);
    assert.match(output, /HOMEWORK/);
    assert.doesNotMatch(output, /PRIVATE_|IGNORED|phantom|late:invalid/);
  }
  assert.match(html, /HOMEWORK&lt;&amp;&gt;\nSECOND_LINE/);
  assert.match(text, /HOMEWORK<&>\nSECOND_LINE/);
  assert.doesNotMatch(html, /HISTORICAL_SELECTED<&>/);
});

test("pure report model uses only injected collaborators and leaves frozen inputs intact", () => {
  assert.deepEqual(inspectService(modelSource, "EduActivityReportModel"), []);
  const f = fixture(),
    freeze = (value) => {
      if (value && typeof value === "object") {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
      }
      return value;
    };
  freeze(f.source);
  freeze(f.filter);
  const model = f.context.createGlobalReportModel(),
    sessions = model.filterSessions(f.source, f.filter),
    report = model.build(sessions, f.filter),
    newer = report.rows.find((row) => row.session.id === "newer");
  assert.equal(Object.isFrozen(model), true);
  assert.equal(sessions[1], f.source.sessions[1]);
  assert.equal(newer.attendance.counts.lateMinutesRecorded, 1);
  assert.equal(newer.attendance.counts.lateMinutes, 0);
  assert.equal(newer.attendance.counts.unknown, 1);
  assert.deepEqual(
    Array.from(newer.scores.exams, (score) => score.type),
    ["activity", "mostamar", "payani", "classGrade", "mostamar", "activity"],
  );
});

test("disabled report details do not resolve attendance, pupil names or activity labels", () => {
  const f = fixture(),
    fail = () => {
      throw Error("A disabled report detail was resolved");
    },
    model = f.context.EduActivityReportModel({
      findClass: f.context.findClassById,
      getLesson: f.context.getLessonObj,
      sessionStudents: fail,
      sessionStudent: fail,
      typeLabel: fail,
      attendance: { normalize: fail, emptyCounts: fail, tally: fail },
    }),
    filter = {
      ...f.filter,
      ...Object.fromEntries(flags.map((flag) => [flag, false])),
    },
    report = model.build(model.filterSessions(f.source, filter), filter);
  assert.equal(report.rows.length, f.source.sessions.length);
  for (const row of report.rows) {
    assert.equal(row.attendance, null);
    assert.equal(row.studentAttendance, null);
    assert.deepEqual(plain(row.entries), {});
  }
});
