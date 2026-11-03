"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const c = vm.createContext({
  num: (x) => String(x),
  esc: (x) =>
    String(x)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;"),
});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/reports/periodic/document.js"),
    "utf8",
  ),
  c,
);
test("same-name classes have separate student groups without changing counts or source order", () => {
  const m = {
    students: [
      {
        classId: "a",
        className: "Same class",
        name: "FIRST",
        sessions: 2,
        present: 1,
        leave: 1,
      },
      {
        classId: "b",
        className: "Same class",
        name: "SECOND",
        sessions: 1,
        absent: 1,
      },
      {
        classId: "a",
        className: "Same class",
        name: "THIRD",
        sessions: 1,
        unknown: 1,
      },
    ],
  };
  const before = JSON.stringify(m),
    html = c.studentFollowupHtml(m);
  assert.equal((html.match(/class="report-class-group"/g) || []).length, 2);
  assert.match(html, /^<section class="report-followup">/);
  assert.equal(
    (html.match(/<details class="report-class-group">/g) || []).length,
    2,
  );
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  const groups = html.split('<details class="report-class-group">').slice(1);
  assert.ok(
    groups[0].includes("FIRST") &&
      groups[0].includes("THIRD") &&
      !groups[0].includes("SECOND"),
  );
  assert.ok(groups[1].includes("SECOND") && !groups[1].includes("FIRST"));
  assert.ok(html.includes("report-metric-leave"));
  assert.equal(JSON.stringify(m), before);
});
test("follow-up escapes class names student names and codes", () => {
  const html = c.studentFollowupHtml({
    students: [
      { classId: "a", className: "<img>", name: "<script>", code: "<code>" },
    ],
  });
  assert.ok(html.includes("&lt;img>"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<code>"));
});

test("standalone session disclosure retains all class labels and sorts dates and bells without duplicating sessions", () => {
  c.faDate = String;
  c.reportParticipants = () => [];
  const session = (id, classId, date, period) => ({
    id,
    classId,
    className: "Same",
    date,
    period,
    lessonName: id,
    teacher: "Teacher",
    counts: { present: 0, absent: 0, leave: 0, late: 0, unknown: 0 },
    participants: [],
    marks: [],
  });
  const m = {
    audience: "management",
    detailLevel: "summary",
    students: [
      { classId: "a", className: "Same", name: "FIRST" },
      { classId: "b", className: "Same", name: "SECOND" },
    ],
    sessions: [
      session("A_LATER", "a", "2026-11-02", 2),
      session("B_ONLY", "b", "2026-11-01", 1),
      session("A_EARLY", "a", "2026-11-01", 0),
      session("EMPTY_ROSTER", "c", "2026-11-01", 3),
    ],
  };
  const before = JSON.stringify(m),
    followup = c.studentFollowupHtml(m),
    html = c.sessionDisclosureHtml(m, m.sessions);
  assert.doesNotMatch(followup, /report-session-disclosure|periodic-session/);
  assert.equal((followup.match(/class="report-class-group"/g) || []).length, 2);
  for (const id of ["A_EARLY", "A_LATER", "B_ONLY", "EMPTY_ROSTER"])
    assert.equal((html.match(new RegExp(id, "g")) || []).length, 1);
  assert.ok(html.indexOf("A_EARLY") < html.indexOf("B_ONLY"));
  assert.ok(html.indexOf("B_ONLY") < html.indexOf("A_LATER"));
  assert.equal((html.match(/class="periodic-session"/g) || []).length, 4);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.equal(JSON.stringify(m), before);
});
