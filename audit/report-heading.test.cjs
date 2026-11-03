"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const c = vm.createContext({
  esc: (value) =>
    String(value).replace(
      /[&<>"']/g,
      (x) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[x],
    ),
  faDate: (value) =>
    ({ "2026-11-03": "۱۴۰۵/۸/۱۲", "2026-11-04": "۱۴۰۵/۸/۱۳" })[value] || value,
  modeLabel: (mode) => ({ daily: "روزانه", weekly: "هفتگی" })[mode] || mode,
});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/reports/periodic/document.js"),
    "utf8",
  ),
  c,
);
const model = () => ({
  mode: "daily",
  audience: "management",
  detailLevel: "summary",
  school: { name: "هنرستان حافظ" },
  start: "2026-11-03",
  end: "2026-11-03",
  academicYear: "1405-1406",
  academicTerm: "اول",
  generatedAt: "2026-11-03T10:00:00Z",
});
test("daily heading shows one Persian report date, Persian year and a clear Tehran preparation time without mutating the report", () => {
  const m = model(),
    before = JSON.stringify(m),
    html = c.periodicReportHeadingHtml(m);
  assert.equal((html.match(/۱۴۰۵\/۸\/۱۲/g) || []).length, 1);
  assert.match(html, /گزارش روزانه/);
  assert.match(html, /هنرستان حافظ/);
  assert.match(html, /۱۴۰۵-۱۴۰۶/);
  assert.match(html, /ترم اول/);
  assert.match(html, /۱۳:۳۰/);
  assert.doesNotMatch(html, / تا /);
  assert.equal(JSON.stringify(m), before);
});
test("ranged parent heading keeps its own pupil and code, escapes names and prepares dates in Tehran", () => {
  const m = {
    ...model(),
    mode: "weekly",
    audience: "parent",
    end: "2026-11-04",
    generatedAt: "2026-11-03T21:00:00Z",
    class: { name: "<class>" },
    student: { name: "<student>", code: "001" },
  };
  const html = c.periodicReportHeadingHtml(m);
  assert.match(html, /۱۴۰۵\/۸\/۱۲ تا ۱۴۰۵\/۸\/۱۳/);
  assert.match(html, /ویژه اولیا/);
  assert.match(html, /&lt;student&gt;/);
  assert.match(html, /&lt;class&gt;/);
  assert.match(html, /001/);
  assert.match(html, /۰۰:۳۰/);
  assert.doesNotMatch(html, /<student>|<class>|خلاصه مدیریتی/);
});
