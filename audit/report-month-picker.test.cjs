"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(date) {
  const c = vm.createContext({
    db: { settings: { academicYear: "1405-1406" }, schools: [] },
    filters: { date, schoolId: "" },
    globalFilter: {},
    noteYearScopeId: () => "year",
  });
  c.root = c;
  for (const file of [
    "domain/calendar.js",
    "domain/reporting/date-ranges.js",
    "reports/periodic/date-range.js",
    "reports/periodic/filters.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  return c;
}
test("monthly selection preserves dates outside the configured academic year", () => {
  for (const date of ["2025-03-15", "2027-11-05", "2028-07-01"]) {
    const c = fixture(date);
    c.initialize("monthly");
    assert.equal(c.filters.date, date);
    c.initialize("monthly");
    assert.equal(c.filters.date, date);
  }
});
test("monthly report covers the complete chosen Jalali month including leap Esfand", () => {
  const c = fixture("2025-03-15");
  const dates = c.EduReportDates.range("monthly", c.filters.date);
  assert.equal(dates.start, "2025-02-19");
  assert.equal(dates.end, "2025-03-20");
  const nextYear = c.EduReportDates.range("monthly", "2027-11-05");
  assert.equal(nextYear.start, "2027-10-23");
  assert.equal(nextYear.end, "2027-11-21");
});
