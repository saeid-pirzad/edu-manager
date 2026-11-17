"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  { fixture } = require("./modular-unit-reports.test.cjs");

function lessonFixture() {
  const f = fixture(),
    { c } = f;
  c.lessonReportFilter = { schoolId: "school", classId: "class" };
  c.getLessonObj = (classroom, id) =>
    classroom.lessons.find((lesson) => lesson.id === id);
  c.calcStudentLesson = c.calcV24;
  c.EduV24 = { modularReportText: c.modularReportText };
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/reports/lesson.js"),
      "utf8",
    ),
    c,
  );
  return f;
}

test("lesson and parent text expose the same independent units, zero, missing component and status", () => {
  const { c, lesson, classroom } = lessonFixture(),
    source = structuredClone(c.db),
    before = JSON.stringify(source),
    result = c.calcV24(classroom, lesson, "student", source),
    grades = c.modularReportText(lesson, result, "student"),
    parent = c.parentReportV24(classroom.students[0], classroom, source),
    lessonText = c.buildLessonReportText(lesson.id, source);
  assert.ok(parent.includes(grades));
  assert.ok(lessonText.includes(grades));
  for (const text of [parent, lessonText]) {
    assert.match(text, /واحد 0: مستمر 0 \| شایستگی 3 \| 15\.00/);
    assert.match(text, /واحد 1: مستمر 4\.5 \| شایستگی 3 \| 19\.50/);
    assert.match(text, /واحد 2: مستمر 1 \| شایستگی 1 \| 6\.00/);
    assert.match(text, /واحد 3: مستمر 2 \| شایستگی —/);
    assert.match(text, /نیازمند جبران/);
    assert.doesNotMatch(text, /نهایی:|نهایی درس|میانگین|PRIVATE|20\.00/);
  }
  assert.equal(JSON.stringify(source), before);
});

test("copied lesson grades and attendance use captured durable data throughout", async () => {
  const { c, lesson } = lessonFixture(),
    durable = structuredClone(c.db),
    durableLesson = durable.schools[0].classes[0].lessons[0];
  durableLesson.name = "درس ذخیره‌شده";
  durableLesson.poudmans[0].units[1].competencyScores.student.m = 3.5;
  durable.sessions.push({
    id: "saved-session",
    classId: "class",
    lessonId: lesson.id,
    date: "2026-11-17",
    period: 0,
    attendance: { student: "absent" },
    scores: [],
  });
  c.generateSessionReportText = (session) => "جلسه " + session.id;
  c.db.schools[0].classes[0].lessons[0].name = "UNCOMMITTED";
  c.EduV24.copyReport = async (build) => build(durable);
  const text = await c.copyLessonReportForVicePrincipal(lesson.id, {});
  assert.match(text, /درس ذخیره‌شده/);
  assert.match(text, /جلسه saved-session/);
  assert.match(text, /غایب 1/);
  assert.match(text, /واحد 1: مستمر 3\.5 \| شایستگی 3 \| 18\.50/);
  assert.doesNotMatch(text, /UNCOMMITTED|19\.50|نهایی:/);
  const parent = c.parentReportV24(
    durable.schools[0].classes[0].students[0],
    durable.schools[0].classes[0],
    durable,
  );
  assert.match(parent, /غایب 1/);
  assert.match(parent, /18\.50/);
  const liveClass = c.db.schools[0].classes[0];
  assert.equal(
    c.parentReportV24(liveClass.students[0], liveClass, durable),
    parent,
  );
  assert.equal(
    c.parentReportV24(liveClass.students[0], liveClass, { schools: [] }),
    undefined,
  );
  const missingStudent = structuredClone(durable);
  missingStudent.schools[0].classes[0].students = [];
  assert.equal(
    c.parentReportV24(liveClass.students[0], liveClass, missingStudent),
    undefined,
  );
});

test("a missing class or lesson in captured data never falls back to live private grades", () => {
  const { c, lesson } = lessonFixture();
  assert.equal(
    c.buildLessonReportText(lesson.id, { schools: [], sessions: [] }),
    undefined,
  );
  const source = structuredClone(c.db);
  source.schools[0].classes[0].lessons = [];
  assert.equal(c.buildLessonReportText(lesson.id, source), undefined);
  c.lessonReportFilter.schoolId = "another-school";
  assert.equal(c.buildLessonReportText(lesson.id, c.db), undefined);
});

test("old module-based lesson and parent reports retain module results and course final", () => {
  const { c, lesson, classroom } = lessonFixture();
  lesson.gradingPolicy.version = 1;
  delete lesson.gradingPolicy.modularScope;
  for (const pod of lesson.poudmans) pod.podScores.student = { m: 0, c: 3 };
  for (const text of [
    c.buildLessonReportText(lesson.id),
    c.parentReportV24(classroom.students[0], classroom),
  ]) {
    assert.match(text, /پودمان 0: مستمر 0 \| شایستگی 3 \| 15\.00/);
    assert.match(text, /نهایی:? 15\.00/);
    assert.doesNotMatch(text, /واحد 0:|واحد 1:/);
  }
});

test("live and immutable unit rows expose each result's own status without module totals", () => {
  const { c, lesson, report } = lessonFixture(),
    snapshot = report(),
    saved = snapshot.classes[0].students[0].lessons[0],
    before = JSON.stringify(snapshot);
  for (const html of [
    c.modularOverviewCell(lesson, "student"),
    c.frozenLessonRows(saved),
  ]) {
    assert.equal((html.match(/class="report-unit-status"/g) || []).length, 4);
    assert.match(html, /نیازمند جبران/);
    assert.doesNotMatch(html, /report-modular-final|نهایی درس/);
  }
  assert.equal(JSON.stringify(snapshot), before);
});
