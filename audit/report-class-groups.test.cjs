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
  const groups = html.split('<section class="report-class-group">').slice(1);
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
