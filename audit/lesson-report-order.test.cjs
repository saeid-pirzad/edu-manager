"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const lesson = { id: "lesson", name: "Course", poudmans: [] },
    classroom = {
      id: "classroom",
      name: "Class",
      students: [],
      lessons: [lesson],
    },
    sessions = [
      { id: "later", date: "2026-11-03", period: 3 },
      { id: "previous", date: "2026-11-02", period: 2 },
      { id: "earlier", date: "2026-11-03", period: 0 },
    ].map((s) => ({
      ...s,
      classId: classroom.id,
      lessonId: lesson.id,
      attendance: {},
      scores: [],
    }));
  const c = vm.createContext({
    db: { sessions },
    lessonReportFilter: { classId: classroom.id },
    findClassById: () => ({ classObj: classroom }),
    getLessonObj: () => lesson,
    getSortedStudents: () => [],
    generateSessionReportText: (s) => "SESSION:" + s.id,
    faDate: (d) => d,
    esc: String,
    sessionStudents: () => [],
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/reports/lesson.js"),
      "utf8",
    ),
    c,
  );
  return { c, lesson, classroom, sessions };
}
test("copied lesson report orders sessions by date and bell without reordering stored sessions", () => {
  const f = fixture(),
    before = JSON.stringify(f.sessions),
    text = f.c.buildLessonReportText(f.lesson.id);
  assert.ok(text.indexOf("SESSION:previous") < text.indexOf("SESSION:earlier"));
  assert.ok(text.indexOf("SESSION:earlier") < text.indexOf("SESSION:later"));
  assert.equal(JSON.stringify(f.sessions), before);
});
test("legacy lesson report displays same-day sessions in bell order", () => {
  const f = fixture(),
    html = f.c.legacy_buildLessonReportHtml(f.classroom, f.lesson);
  assert.ok(
    html.indexOf("2026-11-02 — زنگ 3") < html.indexOf("2026-11-03 — زنگ 1"),
  );
  assert.ok(
    html.indexOf("2026-11-03 — زنگ 1") < html.indexOf("2026-11-03 — زنگ 4"),
  );
});
