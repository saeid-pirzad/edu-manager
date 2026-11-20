"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = (file) =>
  fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function fixture() {
  const selected = { id: "selected", name: "SELECTED_HISTORICAL" },
    other = { id: "other", name: "OTHER_PRIVATE" },
    unknown = { id: "unknown", name: "UNKNOWN_HISTORICAL" },
    lesson = { id: "lesson", name: "LESSON", teacher: "TEACHER", poudmans: [] },
    cls = {
      id: "class",
      name: "CLASS",
      students: [other, unknown],
      archivedStudents: [{ ...selected, name: "SELECTED_CURRENT" }],
      lessons: [lesson],
    },
    school = { id: "school", name: "SCHOOL", classes: [cls] },
    session = {
      id: "session",
      schoolId: school.id,
      classId: cls.id,
      lessonId: lesson.id,
      date: "2026-10-31",
      period: 0,
      roster: [selected, other, unknown],
      attendance: { selected: "late:10", other: "absent" },
      scores: [
        { studentId: "selected", type: "classGrade", value: 16 },
        { studentId: "selected", type: "positive", value: 3 },
        { studentId: "selected", type: "negative", value: 2 },
        { studentId: "selected", type: "homework", value: 1, note: "OWN_NOTE" },
        { studentId: "other", type: "classGrade", value: 19 },
        { studentId: "other", type: "positive", value: 99 },
        { studentId: "other", type: "negative", value: 98 },
        {
          studentId: "other",
          type: "homework",
          value: 1,
          note: "PRIVATE_NOTE",
        },
      ],
    },
    output = { innerHTML: "" },
    copied = [];
  const c = vm.createContext({
    db: { schools: [school], sessions: [session] },
    globalFilter: {
      studentId: selected.id,
      reportMode: "detailed",
      showAttendance: true,
      showScores: true,
      showPosNeg: true,
      showHomework: true,
      showPresentNames: true,
      showAbsentNames: true,
      showLateNames: true,
    },
    document: { getElementById: () => output },
    getClassObj: () => cls,
    getStudentObj: (cl, id) =>
      [...cl.students, ...cl.archivedStudents].find((st) => st.id === id),
    getLessonObj: () => lesson,
    findClassById: () => ({ school, classObj: cls }),
    sessionStudents: (cl, x) => x.roster || cl.students,
    sessionStudent: (cl, x, id) =>
      (x.roster || cl.students).find((st) => st.id === id),
    TYPE_LABELS: { classGrade: "CLASS_MARK", activity: "ACTIVITY_MARK" },
    esc: String,
    faDate: String,
    todayISO: () => session.date,
    getPeriodName: () => "PERIOD",
    copyToClipboard: (text) => copied.push(text),
    EduV24: {
      // Formatting tests use the pure producer. The actual asynchronous
      // boundary is covered by report-copy-guard.test.cjs and browser tests.
      copyReport: (produce) => copied.push(produce()),
    },
    alert(message) {
      throw Error(message);
    },
  });
  vm.runInContext(source("src/domain/reporting/attendance.js"), c);
  vm.runInContext(source("src/legacy/reports/comprehensive.js"), c);
  return {
    c,
    session,
    cls,
    school,
    lesson,
    selected,
    other,
    unknown,
    output,
    copied,
  };
}

test("student-scoped activity reports project historical roster, attendance and every score without mutating source", () => {
  const f = fixture(),
    before = JSON.stringify(f.c.db);
  f.c.db.sessions.push({
    ...structuredClone(f.session),
    id: "unrelated-session",
    period: 1,
    roster: [f.other],
    attendance: { other: "absent" },
    scores: [],
  });
  const afterAppend = JSON.stringify(f.c.db),
    sessions = f.c.getFilteredSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].roster.length, 1);
  assert.equal(sessions[0].roster[0].name, f.selected.name);
  assert.equal(Object.keys(sessions[0].attendance).join(), "selected");
  assert.equal(sessions[0].scores.length, 4);
  assert.ok(
    sessions[0].scores.every((score) => score.studentId === "selected"),
  );
  assert.equal(JSON.stringify(f.c.db), afterAppend);
  assert.notEqual(before, afterAppend);
});

for (const mode of ["summary", "detailed"]) {
  test(`student-scoped ${mode} activity rendering and copy never include another student's names, notes or marks`, () => {
    const f = fixture();
    f.c.globalFilter.reportMode = mode;
    f.c.generateGlobalReport();
    f.c.copyGlobalReportText({});
    const rendered = f.output.innerHTML + f.copied[0];
    assert.doesNotMatch(
      rendered,
      /OTHER_PRIVATE|UNKNOWN_HISTORICAL|PRIVATE_NOTE/,
    );
    assert.doesNotMatch(rendered, /99|98|19/);
    assert.match(rendered, /16/);
    assert.match(f.copied[0], /SELECTED_HISTORICAL/);
    assert.doesNotMatch(f.copied[0], /SELECTED_CURRENT/);
  });
}

test("student-scoped unknown attendance remains unknown and includes no other students' attendance", () => {
  const f = fixture();
  f.c.globalFilter.studentId = "unknown";
  f.c.globalFilter.reportMode = "summary";
  const sessions = f.c.getFilteredSessions();
  assert.equal(sessions.length, 1);
  assert.equal(Object.keys(sessions[0].attendance).length, 0);
  assert.equal(sessions[0].scores.length, 0);
  f.c.generateGlobalReport();
  f.c.copyGlobalReportText({});
  assert.match(f.copied[0], /UNKNOWN_HISTORICAL: ثبت نشده/);
  assert.doesNotMatch(f.copied[0], /OTHER_PRIVATE|SELECTED_HISTORICAL/);
});

test("unfiltered activity reports retain all historical students and scores", () => {
  const f = fixture();
  f.c.globalFilter.studentId = "";
  assert.equal(f.c.getFilteredSessions()[0], f.session);
  f.c.generateGlobalReport();
  f.c.copyGlobalReportText({});
  for (const text of [f.output.innerHTML, f.copied[0]]) {
    assert.match(text, /OTHER_PRIVATE/);
    assert.match(text, /SELECTED_HISTORICAL/);
    assert.match(text, /99/);
  }
  assert.match(f.output.innerHTML, /PRIVATE_NOTE/);
});

test("multi-day detailed activity reports display each actual session date rather than only today's generation date", () => {
  const f = fixture();
  f.c.db.sessions.push({
    ...structuredClone(f.session),
    id: "earlier-session",
    date: "2026-10-24",
  });
  f.c.generateGlobalReport();
  f.c.copyGlobalReportText({});
  const sessions = f.output.innerHTML.split('class="session-detail"').slice(1);
  assert.equal(sessions.length, 2);
  assert.match(sessions[0], /تاریخ:<\/b> 2026-10-31/);
  assert.match(sessions[1], /تاریخ:<\/b> 2026-10-24/);
  assert.match(f.output.innerHTML, /تاریخ تهیه گزارش:/);
  assert.match(f.copied[0], /تاریخ تهیه گزارش:/);
  assert.match(f.copied[0], /🔹 تاریخ: 2026-10-31 \| درس: LESSON/);
  assert.match(f.copied[0], /🔹 تاریخ: 2026-10-24 \| درس: LESSON/);
});

for (const mode of ["summary", "detailed"])
  for (const student of ["selected", ""])
    for (const value of [0, 7]) {
      test(`${mode} activity report and copied text retain activity value ${value} with ${student || "all students"} scope`, () => {
        const f = fixture();
        f.c.globalFilter.reportMode = mode;
        f.c.globalFilter.studentId = student;
        f.session.scores.push(
          { studentId: "selected", type: "activity", value },
          { studentId: "other", type: "activity", value: 777 },
        );
        f.c.generateGlobalReport();
        f.c.copyGlobalReportText({});
        if (mode === "summary") {
          assert.match(f.output.innerHTML, /فعالیت: /);
          assert.match(f.copied[0], new RegExp("امتیاز فعالیت: " + value));
          if (student)
            assert.match(f.output.innerHTML, new RegExp("فعالیت: " + value));
          else assert.match(f.output.innerHTML, /فعالیت: 2/);
        } else {
          const expected = new RegExp("ACTIVITY_MARK:" + value);
          assert.match(f.output.innerHTML, expected);
          assert.match(f.copied[0], expected);
        }
        if (student) {
          assert.doesNotMatch(f.output.innerHTML, /777|OTHER_PRIVATE/);
          assert.doesNotMatch(f.copied[0], /777|OTHER_PRIVATE/);
        } else {
          assert.match(f.copied[0], /777/);
        }
      });
    }

test("schedule session list includes late students as present and uses the complete historical roster as denominator", () => {
  const f = fixture();
  f.session.attendance.other = "present";
  f.session.roster.push({ id: "absent", name: "ABSENT" });
  f.session.attendance.absent = "absent";
  let html = "";
  // History rows are now rendered after showModal so the same markup can page.
  // Model that DOM boundary instead of expecting every row in the modal body.
  const recent = { innerHTML: "" },
    count = { textContent: "" },
    panel = { dataset: { sessionDay: "0", sessionPeriod: "0" } },
    history = {
      dataset: { historyClass: "class" },
      closest(selector) {
        assert.equal(selector, ".session-start-panel");
        return panel;
      },
      querySelector(selector) {
        if (selector === "header > span") return count;
        if (selector === ".session-setup-recent") return recent;
        assert.equal(selector, ".session-history-pager");
        return null;
      },
    };
  f.c.document.querySelector = (selector) => {
    assert.equal(selector, "#modalBody .session-setup-history");
    return history;
  };
  Object.assign(f.c, {
    DAYS: ["SATURDAY"],
    getMasterEntry: () => ({ classId: "class", lessonId: "lesson" }),
    getDayIdxFromDate: () => 0,
    toShamsi: String,
    showModal: (title, body) => (html = body),
  });
  vm.runInContext(source("src/core/icons.js"), f.c);
  vm.runInContext(source("src/legacy/schedule/timetable.js"), f.c);
  f.c.legacy_clickMasterCell(0, 0);
  assert.match(html, /<svg class="ui-icon"/);
  assert.equal(history.dataset.historyPage, "0");
  assert.equal(count.textContent, "۱ جلسه");
  assert.match(recent.innerHTML, /2\/4 حاضر/);
  assert.doesNotMatch(recent.innerHTML, /1\/3 حاضر/);
});

for (const late of ["late", "late:0", "late:10"]) {
  test(`copied session report includes ${late} in present and the separate lateness subset`, () => {
    const f = fixture();
    f.session.attendance.selected = late;
    f.session.attendance.other = "present";
    f.session.attendance.unknown = "leave";
    vm.runInContext(source("src/legacy/reports/session-text.js"), f.c);
    const text = f.c.generateSessionReportText(f.session, f.cls, f.lesson);
    assert.match(text, /حاضر \(2 نفر\): SELECTED_HISTORICAL، OTHER_PRIVATE/);
    assert.match(text, /تأخیر \(1 نفر\): SELECTED_HISTORICAL/);
    assert.match(text, /مرخصی \(1 نفر\): UNKNOWN_HISTORICAL/);
    assert.match(text, /غایب \(0 نفر\)/);
  });
}

test("copied activity reports read names, rosters, attendance and scores only from their captured source", () => {
  const f = fixture(),
    durable = structuredClone(f.c.db);
  f.c.globalFilter.schoolId = "school";
  f.c.globalFilter.classId = "class";
  f.c.getLessonObj = (classroom, id) =>
    classroom.lessons.find((lesson) => lesson.id === id);
  f.school.name = "LIVE_SCHOOL";
  f.cls.name = "LIVE_CLASS";
  f.lesson.name = "LIVE_LESSON";
  f.session.attendance.selected = "absent";
  f.session.scores[0].value = 777;
  const before = JSON.stringify(durable),
    text = f.c.buildGlobalReportText(durable);
  assert.match(text, /مدرسه: SCHOOL \| کلاس: CLASS/);
  assert.match(text, /درس: LESSON/);
  assert.match(text, /CLASS_MARK:16/);
  assert.match(text, /تأخیری‌ها \(1\): SELECTED_HISTORICAL \(10د\)/);
  assert.doesNotMatch(text, /LIVE_|777/);
  assert.equal(JSON.stringify(durable), before);
});

for (const mode of ["summary", "detailed"])
  test(
    mode +
      " activity report counts the complete historical roster and exposes unknown attendance",
    () => {
      const f = fixture();
      f.c.globalFilter.studentId = "";
      f.c.globalFilter.reportMode = mode;
      f.session.attendance.phantom = "present";
      f.session.attendance.other = "late:invalid";
      f.c.generateGlobalReport();
      const text = f.c.buildGlobalReportText();
      if (mode === "summary") {
        assert.match(
          f.output.innerHTML,
          /✅1 ❌0 ⏰1 · مرخصی 0 · تعیین‌نشده 2/,
        );
        assert.match(
          text,
          /حاضر 1 \| غایب 0 \| مرخصی 0 \| تأخیر 1 \| تعیین‌نشده 2/,
        );
      } else {
        assert.match(f.output.innerHTML, /تعیین‌نشده \(2\)/);
        assert.match(
          text,
          /تعیین‌نشده \(2\): OTHER_PRIVATE، UNKNOWN_HISTORICAL/,
        );
      }
      assert.doesNotMatch(f.output.innerHTML + text, /invalid|phantom/);
    },
  );

for (const [raw, minutes] of [
  ["late", null],
  ["late:0", 0],
  ["late:9", 9],
])
  test(
    "single-pupil activity copy preserves lateness minutes for " + raw,
    () => {
      const f = fixture();
      f.c.globalFilter.reportMode = "summary";
      f.session.attendance.selected = raw;
      f.c.generateGlobalReport();
      const text = f.c.buildGlobalReportText();
      if (minutes === null)
        assert.doesNotMatch(text + f.output.innerHTML, /\(0د\)/);
      else assert.ok(text.includes("(" + minutes + "د)"));
    },
  );
