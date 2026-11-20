"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  { spawnSync } = require("node:child_process");
const context = vm.createContext({});
for (const file of [
  "calendar.js",
  "academic-year.js",
  "reporting/date-ranges.js",
])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/domain", file), "utf8"),
    context,
  );
const plain = (value) => JSON.parse(JSON.stringify(value));
const formatter = new Intl.DateTimeFormat("en-US", {
  calendar: "persian",
  numberingSystem: "latn",
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
function utcDate(year, month, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}
function intlParts(date) {
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return [Number(parts.year), Number(parts.month), Number(parts.day)];
}

test("shared calendar corrects the early-year inverse and the 2124 leap-cycle divergence", () => {
  for (const [jalali, gregorian] of [
    [
      [3, 7, 1],
      [624, 9, 23],
    ],
    [
      [1503, 1, 1],
      [2124, 3, 20],
    ],
    [
      [1503, 12, 30],
      [2125, 3, 20],
    ],
    [
      [-621, 10, 11],
      [1, 1, 1],
    ],
  ]) {
    assert.deepEqual(
      Array.from(context.jalaliToGregorian(...jalali)),
      gregorian,
    );
    assert.deepEqual(
      Array.from(context.gregorianToJalali(...gregorian)),
      jalali,
    );
    assert.deepEqual(intlParts(utcDate(...gregorian)), jalali);
  }
});

test("shared calendar keeps exact ISO-range boundary dates including Gregorian years below 100", () => {
  for (const gregorian of [
    [1, 1, 1],
    [1, 12, 31],
    [4, 2, 29],
    [99, 12, 31],
    [100, 1, 1],
    [9999, 12, 31],
  ]) {
    const jalali = Array.from(context.gregorianToJalali(...gregorian));
    assert.deepEqual(jalali, intlParts(utcDate(...gregorian)));
    assert.deepEqual(
      Array.from(context.jalaliToGregorian(...jalali)),
      gregorian,
    );
  }
});

test("shared calendar agrees with Persian Intl and round-trips every day from 1900 through 2150", () => {
  for (
    let timestamp = Date.UTC(1900, 0, 1);
    timestamp < Date.UTC(2151, 0, 1);
    timestamp += 86400000
  ) {
    const date = new Date(timestamp),
      gregorian = [
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
      ],
      jalali = Array.from(context.gregorianToJalali(...gregorian));
    assert.deepEqual(jalali, intlParts(date), date.toISOString());
    assert.deepEqual(
      Array.from(context.jalaliToGregorian(...jalali)),
      gregorian,
      date.toISOString(),
    );
  }
});

test("all accepted academic years have reversible Nowruz and Mehr boundaries", () => {
  for (let year = 1; year <= 9378; year++) {
    for (const month of [1, 7]) {
      const jalali = [year, month, 1],
        gregorian = Array.from(context.jalaliToGregorian(...jalali));
      assert.deepEqual(intlParts(utcDate(...gregorian)), jalali);
      assert.deepEqual(
        Array.from(context.gregorianToJalali(...gregorian)),
        jalali,
      );
    }
  }
});

test("shared calendar rejects malformed values and impossible Gregorian civil dates", () => {
  for (const parts of [
    ["2026", 1, 1],
    [2026, "1", 1],
    [2026, 1, "1"],
    [NaN, 1, 1],
    [Infinity, 1, 1],
    [2026.5, 1, 1],
    [null, 1, 1],
    [0, 1, 1],
    [10000, 1, 1],
    [2026, 0, 1],
    [2026, 13, 1],
    [2026, 1, 0],
    [2026, 1, 32],
    [2026, 2, 29],
    [1900, 2, 29],
    [2024, 4, 31],
  ])
    assert.throws(() => context.gregorianToJalali(...parts), /تاریخ معتبر/);
  for (const parts of [
    ["1405", 1, 1],
    [1405, "1", 1],
    [1405, 1, "1"],
    [NaN, 1, 1],
    [Infinity, 1, 1],
    [1405.5, 1, 1],
    [null, 1, 1],
    [-622, 1, 1],
    [10000, 1, 1],
    [1405, 0, 1],
    [1405, 13, 1],
    [1405, 1, 0],
    [1405, 1, 32],
  ])
    assert.throws(() => context.jalaliToGregorian(...parts), /تاریخ معتبر/);
});

test("picker can still reject invalid Esfand and month-day overflow by round-trip", () => {
  for (const jalali of [
    [1502, 12, 30],
    [1405, 7, 31],
  ]) {
    const gregorian = Array.from(context.jalaliToGregorian(...jalali));
    assert.notDeepEqual(
      Array.from(context.gregorianToJalali(...gregorian)),
      jalali,
    );
  }
});

test("shared calendar retains only 256 cached year starts and never falls back to another calendar", () => {
  for (let year = 1000; year < 1400; year++)
    context.jalaliToGregorian(year, 1, 1);
  assert.equal(vm.runInContext("calendarYearStarts.size", context), 256);
  assert.equal(vm.runInContext("calendarYearStarts.has(1000)", context), false);
  assert.equal(vm.runInContext("calendarYearStarts.has(1399)", context), true);
  for (const intl of [
    undefined,
    {
      DateTimeFormat: class {
        resolvedOptions() {
          return { calendar: "gregory", numberingSystem: "latn" };
        }
      },
    },
  ]) {
    const unsupported = vm.createContext({ Intl: intl });
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/domain/calendar.js"),
        "utf8",
      ),
      unsupported,
    );
    assert.throws(
      () => unsupported.gregorianToJalali(2026, 1, 1),
      /تقویم فارسی در این مرورگر پشتیبانی نمی‌شود/,
    );
    assert.throws(
      () => unsupported.jalaliToGregorian(1405, 1, 1),
      /تقویم فارسی در این مرورگر پشتیبانی نمی‌شود/,
    );
  }
});

test("monthly reports retain four-digit Gregorian dates for accepted early academic years", () => {
  assert.equal(context.EduAcademicYear.normalize("0001-0002"), "0001-0002");
  assert.deepEqual(
    plain(context.EduReportDates.range("monthly", "0622-09-23")),
    { start: "0622-09-23", end: "0622-10-22" },
  );
});

test("monthly reports preserve leading zeros across Gregorian year boundaries", () => {
  for (const [date, expected] of [
    ["0623-01-15", { start: "0622-12-22", end: "0623-01-20" }],
    ["0999-01-15", { start: "0998-12-22", end: "0999-01-20" }],
    ["1000-01-15", { start: "0999-12-22", end: "1000-01-20" }],
  ]) {
    const actual = context.EduReportDates.range("monthly", date);
    assert.deepEqual(plain(actual), expected, date);
    assert.equal(context.EduAcademicYear.validDate(actual.start), true, date);
    assert.equal(context.EduAcademicYear.validDate(actual.end), true, date);
    assert.equal(actual.start <= date && date <= actual.end, true, date);
  }
});

test("report date parser rejects year zero and non-string values without civil date coercion", () => {
  for (const value of [
    "0000-01-01",
    "0000-02-29",
    "10000-01-01",
    undefined,
    null,
    true,
    20260101,
    { toString: () => "2026-01-01" },
  ])
    assert.throws(() => context.EduReportDates.isoDate(value), /تاریخ معتبر/);
  for (const value of ["0001-01-01", "9999-12-31"])
    assert.equal(
      context.EduReportDates.isoDate(value).toISOString().slice(0, 10),
      value,
    );
});

test("report day arithmetic rejects non-integral offsets and overflows instead of truncating ISO years", () => {
  for (const offset of ["1", null, true, 0.5, NaN, Infinity, 1e100])
    assert.throws(
      () => context.EduReportDates.addDays("2026-01-01", offset),
      /تاریخ معتبر/,
    );
  for (const [date, offset] of [
    ["0001-01-01", -1],
    ["9999-12-31", 1],
    ["2026-01-01", Number.MAX_SAFE_INTEGER],
    ["2026-01-01", -Number.MAX_SAFE_INTEGER],
  ])
    assert.throws(
      () => context.EduReportDates.addDays(date, offset),
      /تاریخ معتبر/,
    );
  for (const [date, offset, expected] of [
    ["0001-01-01", 0, "0001-01-01"],
    ["9999-12-31", 0, "9999-12-31"],
    ["0001-01-01", 1, "0001-01-02"],
    ["9999-12-31", -1, "9999-12-30"],
    ["2024-02-28", 1, "2024-02-29"],
    ["2026-01-01", -1, "2025-12-31"],
  ])
    assert.equal(context.EduReportDates.addDays(date, offset), expected);
});

test("report calendar rejects full weeks and months crossing the supported ISO range", () => {
  for (const date of ["0001-01-01", "9999-12-31"])
    assert.throws(
      () => context.EduReportDates.range("monthly", date),
      /تاریخ معتبر/,
    );
  assert.throws(
    () => context.EduReportDates.range("weekly", "0001-01-01"),
    /تاریخ معتبر/,
  );
  assert.deepEqual(
    plain(context.EduReportDates.range("weekly", "9999-12-31")),
    { start: "9999-12-25", end: "9999-12-31" },
  );
  for (const date of ["0001-01-01", "9999-12-31"])
    assert.deepEqual(plain(context.EduReportDates.range("daily", date)), {
      start: date,
      end: date,
    });
  assert.deepEqual(
    plain(
      context.EduReportDates.range("weekly", "9999-12-31", undefined, {
        startDate: "9999-12-30",
        endDate: "9999-12-31",
      }),
    ),
    { start: "9999-12-30", end: "9999-12-31" },
  );
});

test("stored civil date formatting survives Apia's skipped day while today remains local", () => {
  const sourcePath = path.join(__dirname, "../src/legacy/core/formatting.js"),
    script = `
      const fs = require("node:fs"), vm = require("node:vm");
      class FixedDate extends Date {
        constructor(...parts) {
          super(...(parts.length ? parts : ["2011-12-30T10:30:00Z"]));
        }
      }
      const context = vm.createContext({ Date: FixedDate });
      vm.runInContext(fs.readFileSync(${JSON.stringify(sourcePath)}, "utf8"), context);
      console.log(JSON.stringify({
        dates: ["2011-12-30", "2026-11-20"].map((date) => ({
          date, text: context.faDate(date), day: context.getDayIdxFromDate(date)
        })),
        today: context.todayISO(),
        todayIndex: context.todayIdx(),
        empty: context.faDate(""),
        missing: context.faDate(),
        invalidText: context.faDate("invalid-date"),
        invalidDay: Number.isNaN(context.getDayIdxFromDate("invalid-date"))
      }));
    `;
  for (const timezone of [
    "UTC",
    "Asia/Tehran",
    "America/Los_Angeles",
    "Pacific/Apia",
  ]) {
    const child = spawnSync(process.execPath, ["-e", script], {
      encoding: "utf8",
      env: { ...process.env, TZ: timezone },
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    const actual = JSON.parse(child.stdout);
    assert.deepEqual(
      actual.dates,
      [
        { date: "2011-12-30", text: "۱۳۹۰/۱۰/۹", day: 6 },
        { date: "2026-11-20", text: "۱۴۰۵/۸/۲۹", day: 6 },
      ],
      timezone,
    );
    assert.equal(
      actual.today,
      timezone === "Pacific/Apia" ? "2011-12-31" : "2011-12-30",
      timezone,
    );
    assert.equal(
      actual.todayIndex,
      timezone === "Pacific/Apia" ? 0 : 6,
      timezone,
    );
    assert.equal(actual.empty, "");
    assert.equal(actual.missing, "");
    assert.equal(actual.invalidText, "Invalid Date");
    assert.equal(actual.invalidDay, true);
  }
});
