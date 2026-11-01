"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({});
for (const file of ["calendar.js", "academic-year.js"])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/domain", file), "utf8"),
    context,
  );
const year = context.EduAcademicYear,
  plain = (value) => JSON.parse(JSON.stringify(value)),
  code = (expected) => (error) => error.code === expected;
test("academic year canonicalizes Persian and Arabic digits without changing its meaning", () => {
  for (const value of [
    "1405-1406",
    "۱۴۰۵-۱۴۰۶",
    "١٤٠٥-١٤٠٦",
    "۱۴0٥-١۴۰6",
    "  ۱۴۰۵ - ۱۴۰۶  ",
    "\u00a0۱۴۰۵\u00a0/\u00a0۱۴۰۶\u00a0",
  ])
    assert.equal(year.normalize(value), "1405-1406");
});
test("academic year accepts ordinary document dash variants and slash", () => {
  for (const separator of ["-", "‐", "‑", "‒", "–", "—", "−", "/"])
    assert.equal(year.normalize("۱۴۰۵ " + separator + " ۱۴۰۶"), "1405-1406");
});
test("academic year rejects non-string data and empty or unrelated labels", () => {
  for (const value of [
    null,
    undefined,
    1405,
    true,
    false,
    [],
    {},
    new Date(),
    "",
    " ",
    "سال 1405-1406",
    "1405-1406 extra",
    "1405",
    "05-06",
    "1405.1406",
    "1405_1406",
    "1405--1406",
    "14 05-1406",
    "1405-1406-1407",
    "1405/06",
    "1405\u200f-1406",
  ])
    assert.throws(() => year.normalize(value), code("ACADEMIC_YEAR_INVALID"));
});
test("academic year rejects nonconsecutive, reversed, duplicate, zero and overlong years", () => {
  for (const value of [
    "1405-1405",
    "1405-1407",
    "1406-1405",
    "0000-0001",
    "9999-10000",
    "01405-01406",
    "-1405-1406",
  ])
    assert.throws(() => year.normalize(value), code("ACADEMIC_YEAR_INVALID"));
});
test("academic year supports positive four-digit early years without an arbitrary modern cutoff", () => {
  assert.equal(year.normalize("0001-0002"), "0001-0002");
  assert.deepEqual(plain(year.range("0001-0002")), {
    start: "0622-09-23",
    end: "0623-09-22",
  });
  assert.equal(year.normalize("0999-1000"), "0999-1000");
});
test("academic year rejects bounds outside supported four-digit Gregorian ISO dates", () => {
  assert.equal(year.normalize("9377-9378"), "9377-9378");
  assert.deepEqual(plain(year.range("9377-9378")), {
    start: "9998-09-22",
    end: "9999-09-22",
  });
  for (const label of ["9378-9379", "9998-9999"])
    for (const operation of [
      () => year.normalize(label),
      () => year.range(label),
      () => year.contains(label, "9999-01-01"),
      () => year.assertDate(label, "9999-01-01"),
    ])
      assert.throws(operation, code("ACADEMIC_YEAR_INVALID"));
});
test("academic year range is inclusive from Mehr first through Shahrivar last", () => {
  assert.deepEqual(plain(year.range("۱۴۰۵–۱۴۰۶")), {
    start: "2026-09-23",
    end: "2027-09-22",
  });
  assert.equal(year.contains("1405-1406", "2026-09-22"), false);
  assert.equal(year.contains("1405-1406", "2026-09-23"), true);
  assert.equal(year.contains("1405-1406", "2027-09-22"), true);
  assert.equal(year.contains("1405-1406", "2027-09-23"), false);
});
test("academic year keeps both sides of Nowruz in the same teaching year", () => {
  for (const date of ["2027-03-20", "2027-03-21", "2027-04-01"])
    assert.equal(year.assertDate("1405-1406", date), date);
  assert.equal(year.current(new Date(2027, 2, 20, 12)), "1405-1406");
  assert.equal(year.current(new Date(2027, 2, 21, 12)), "1405-1406");
});
test("academic year handles leap Esfand and the following ordinary year", () => {
  assert.deepEqual(plain(year.range("1403-1404")), {
    start: "2024-09-22",
    end: "2025-09-22",
  });
  assert.deepEqual(plain(year.range("1404-1405")), {
    start: "2025-09-23",
    end: "2026-09-22",
  });
  assert.equal(year.contains("1403-1404", "2025-03-20"), true);
  assert.equal(year.contains("1403-1404", "2025-03-21"), true);
});
test("academic year accepts real Gregorian leap days and rejects overflow dates", () => {
  assert.equal(year.contains("1402-1403", "2024-02-29"), true);
  assert.equal(year.assertDate("1402-1403", "2024-02-29"), "2024-02-29");
  for (const date of [
    "2023-02-29",
    "2024-02-30",
    "2024-04-31",
    "2024-09-31",
    "2024-00-01",
    "2024-13-01",
    "2024-01-00",
    "0000-01-01",
  ]) {
    assert.equal(year.contains("1402-1403", date), false);
    assert.throws(
      () => year.assertDate("1402-1403", date),
      code("ACADEMIC_DATE_INVALID"),
    );
  }
});
test("academic year requires exact ISO civil dates rather than ambiguous parsed timestamps", () => {
  for (const date of [
    null,
    undefined,
    false,
    20260923,
    [],
    {},
    new Date(2026, 8, 23),
    "",
    "2026-9-23",
    "26-09-23",
    "۱۴۰۵/۰۷/۰۱",
    "۲۰۲۶-۰۹-۲۳",
    "2026-09-23 ",
    " 2026-09-23",
    "2026-09-23T00:00:00Z",
    "2026/09/23",
    "10000-01-01",
  ]) {
    assert.equal(year.contains("1405-1406", date), false);
    assert.throws(
      () => year.assertDate("1405-1406", date),
      code("ACADEMIC_DATE_INVALID"),
    );
  }
});
test("academic year assertDate reports out-of-year dates with the accepted range", () => {
  assert.throws(
    () => year.assertDate("۱۴۰۵/۱۴۰۶", "2026-09-22"),
    (error) =>
      error.code === "ACADEMIC_DATE_OUT_OF_YEAR" &&
      error.message.includes("خارج از سال تحصیلی") &&
      error.message.includes("۱۴۰۵–۱۴۰۶") &&
      error.message.includes("۱ مهر ۱۴۰۵") &&
      error.message.includes("پایان شهریور ۱۴۰۶"),
  );
  assert.throws(
    () => year.assertDate("1405-1406", "2027-09-23"),
    code("ACADEMIC_DATE_OUT_OF_YEAR"),
  );
});
test("academic year validates labels before using dates in every operation", () => {
  for (const operation of [
    () => year.range("invalid"),
    () => year.contains("invalid", "invalid"),
    () => year.assertDate("invalid", "invalid"),
  ])
    assert.throws(operation, code("ACADEMIC_YEAR_INVALID"));
});
test("academic year rolls over on Mehr first, never on Gregorian New Year", () => {
  assert.equal(year.current(new Date(2026, 8, 22, 23, 59)), "1404-1405");
  assert.equal(year.current(new Date(2026, 8, 23, 0, 0)), "1405-1406");
  assert.equal(year.current(new Date(2027, 8, 22, 23, 59)), "1405-1406");
  assert.equal(year.current(new Date(2027, 8, 23, 0, 0)), "1406-1407");
  assert.equal(year.current(new Date(2026, 11, 31, 12)), "1405-1406");
  assert.equal(year.current(new Date(2027, 0, 1, 12)), "1405-1406");
});
test("academic year current uses local civil components rather than UTC conversion", () => {
  class CivilDate extends Date {
    getFullYear() {
      return 2026;
    }
    getMonth() {
      return 8;
    }
    getDate() {
      return 23;
    }
  }
  assert.equal(
    year.current(new CivilDate("2000-01-01T00:00:00.000Z")),
    "1405-1406",
  );
});
test("academic year rejects invalid current-date arguments", () => {
  for (const date of [
    new Date(NaN),
    null,
    undefined,
    false,
    {},
    "2026-09-23",
  ]) {
    if (date === undefined) continue;
    assert.throws(() => year.current(date), code("ACADEMIC_DATE_INVALID"));
  }
});
test("academic year returns fresh bounds and exposes an immutable API", () => {
  const first = year.range("1405-1406");
  first.start = "invalid";
  assert.equal(year.range("1405-1406").start, "2026-09-23");
  assert.equal(Object.isFrozen(year), true);
});
