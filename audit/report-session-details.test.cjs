"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function render(participants, grouped = false) {
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
    { grouped },
  );
}

test("session toggle exposes identifying context when closed and retains activities inside its own body", () => {
  const html = render(
    [
      {
        name: "STUDENT",
        attendance: { status: "present", label: "حاضر", minutes: null },
        scores: [
          { type: "positive", label: "امتیاز مثبت", value: 0, note: "NOTE" },
        ],
      },
    ],
    true,
  );
  assert.match(
    html,
    /^<details class="periodic-session report-session-compact">/,
  );
  const summary = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)[1];
  for (const text of ["زنگ 1", "2026-10-31", "کلاس", "درس"])
    assert.ok(summary.includes(text));
  assert.doesNotMatch(summary, /STUDENT|NOTE/);
  assert.match(html, /<div class="report-session-content">/);
  assert.match(html, /<strong>0<\/strong>/);
  assert.match(html, /NOTE/);
  assert.doesNotMatch(html, /<details[^>]*\b(?:open|name)=?/);
  assert.ok(html.endsWith("</div></details>"));
});
test("session without displayed activities has no empty student table or list", () => {
  const html = render([]);
  assert.doesNotMatch(html, /<table|report-session-students/);
  assert.match(html, /زنگ 1/);
  assert.match(html, /<dt>غایب<\/dt><dd>5<\/dd>/);
  assert.match(html, /&lt;script&gt;/);
});
test("compact session table retains scores, zero values, notes and late minutes safely", () => {
  const html = render([
    {
      name: "<img>",
      attendance: { status: "late", label: "تأخیر", minutes: 10 },
      scores: [{ label: "تکلیف", value: 0, note: "<script>" }],
    },
  ]);
  assert.match(
    html,
    /<table class="report-session-table" data-mobile-layout="compact">/,
  );
  assert.match(html, /<th scope="col">نمره، امتیاز و تکلیف<\/th>/);
  assert.match(html, /10 دقیقه/);
  assert.match(html, /<strong>0<\/strong>/);
  assert.match(html, /&lt;img&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<img>/);
});

test("large session tables keep one row per student and every activity without truncation", () => {
  const participants = Array.from({ length: 200 }, (_, index) => ({
    name: "هنرجو " + index,
    attendance: { status: "present", label: "حاضر", minutes: null },
    scores:
      index === 0
        ? []
        : [
            { label: "امتیاز مثبت", value: 0.5, note: "" },
            { label: "امتیاز منفی", value: 3, note: "پرسش" },
            { label: "تکلیف", value: 0, note: "یادداشت\nتکلیف" },
          ],
  }));
  const html = render(participants);
  assert.equal((html.match(/<th scope="row"/g) || []).length, 200);
  assert.equal((html.match(/<strong>0.5<\/strong>/g) || []).length, 199);
  assert.equal((html.match(/<strong>3<\/strong>/g) || []).length, 199);
  assert.equal((html.match(/<strong>0<\/strong>/g) || []).length, 199);
  assert.match(html, /report-session-no-score">—/);
  assert.match(html, /هنرجو 199/);
  assert.doesNotMatch(html, /<ol|report-session-students/);
});
