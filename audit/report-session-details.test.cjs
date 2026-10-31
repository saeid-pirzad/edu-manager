"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function render(participants) {
  const context = vm.createContext({
    esc: (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;"),
    num: String,
    faDate: String,
    reportParticipants: () => participants,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/reports/periodic/document.js"),
      "utf8",
    ),
    context,
  );
  return context.sessionDetailsHtml(
    { audience: "management", detailLevel: "summary" },
    {
      date: "2026-10-31",
      period: 0,
      className: "کلاس",
      lessonName: "درس",
      teacher: "<script>",
      counts: { present: 18, absent: 5, leave: 1, late: 1, unknown: 0 },
    },
  );
}
test("session without displayed activities has no empty student table or list", () => {
  const html = render([]);
  assert.doesNotMatch(html, /<table|report-session-students/);
  assert.match(html, /زنگ 1/);
  assert.match(html, /<dt>غایب<\/dt><dd>5<\/dd>/);
  assert.match(html, /&lt;script&gt;/);
});
test("session cards retain scores, zero values, notes and late minutes safely", () => {
  const html = render([
    {
      name: "<img>",
      attendance: { status: "late", label: "تأخیر", minutes: 10 },
      scores: [{ label: "تکلیف", value: 0, note: "<script>" }],
    },
  ]);
  assert.match(html, /report-session-students/);
  assert.match(html, /10 دقیقه/);
  assert.match(html, /<strong>0<\/strong>/);
  assert.match(html, /&lt;img&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<img>/);
});
