(function (root) {
  "use strict";
  const invalidYear =
    "سال تحصیلی باید شامل دو سال چهاررقمی پیاپی باشد؛ مانند ۱۴۰۵–۱۴۰۶.";
  function fail(message, code) {
    const error = Error(message);
    error.code = code;
    throw error;
  }
  function digits(value) {
    return value.replace(/[۰-۹٠-٩]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)),
    );
  }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return false;
    const [year, month, day] = value.split("-").map(Number),
      leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0),
      days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return (
      year > 0 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= days[month - 1]
    );
  }
  function iso(parts) {
    if (
      !Array.isArray(parts) ||
      parts.length !== 3 ||
      !parts.every(Number.isInteger)
    )
      fail(invalidYear, "ACADEMIC_YEAR_INVALID");
    const value = parts
      .map((part, index) => String(part).padStart(index ? 2 : 4, "0"))
      .join("-");
    if (!validDate(value)) fail(invalidYear, "ACADEMIC_YEAR_INVALID");
    return value;
  }
  function bounds(first, last) {
    const start = iso(jalaliToGregorian(first, 7, 1)),
      next = iso(jalaliToGregorian(last, 7, 1)),
      [year, month, day] = next.split("-").map(Number),
      end = new Date(0);
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCFullYear(year, month - 1, day - 1);
    const endISO = end.toISOString().slice(0, 10);
    if (!validDate(endISO)) fail(invalidYear, "ACADEMIC_YEAR_INVALID");
    return { start, end: endISO };
  }
  function parse(value) {
    if (typeof value !== "string") fail(invalidYear, "ACADEMIC_YEAR_INVALID");
    const match = digits(value)
      .trim()
      .match(/^(\d{4})\s*[-‐‑‒–—−/]\s*(\d{4})$/);
    if (!match) fail(invalidYear, "ACADEMIC_YEAR_INVALID");
    const first = Number(match[1]),
      last = Number(match[2]);
    if (first < 1 || last !== first + 1)
      fail(invalidYear, "ACADEMIC_YEAR_INVALID");
    return {
      label:
        String(first).padStart(4, "0") + "-" + String(last).padStart(4, "0"),
      range: bounds(first, last),
    };
  }
  function normalize(value) {
    return parse(value).label;
  }
  function range(value) {
    return parse(value).range;
  }
  function contains(value, date) {
    const period = range(value);
    return validDate(date) && date >= period.start && date <= period.end;
  }
  function assertDate(value, date) {
    const academic = parse(value);
    if (!validDate(date))
      fail(
        "تاریخ جلسه نامعتبر است؛ یک تاریخ معتبر انتخاب کنید.",
        "ACADEMIC_DATE_INVALID",
      );
    if (date < academic.range.start || date > academic.range.end) {
      const [first, last] = academic.label
        .split("-")
        .map((part) =>
          part.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]),
        );
      fail(
        "تاریخ جلسه خارج از سال تحصیلی " +
          first +
          "–" +
          last +
          " است؛ تاریخی از ۱ مهر " +
          first +
          " تا پایان شهریور " +
          last +
          " انتخاب کنید.",
        "ACADEMIC_DATE_OUT_OF_YEAR",
      );
    }
    return date;
  }
  function current(date = new Date()) {
    if (
      Object.prototype.toString.call(date) !== "[object Date]" ||
      !Number.isFinite(date.getTime())
    )
      fail("تاریخ مبنای سال تحصیلی معتبر نیست.", "ACADEMIC_DATE_INVALID");
    const [year, month] = gregorianToJalali(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
      ),
      first = year - (month < 7 ? 1 : 0);
    return normalize(
      String(first).padStart(4, "0") + "-" + String(first + 1).padStart(4, "0"),
    );
  }
  root.EduAcademicYear = Object.freeze({
    normalize,
    range,
    contains,
    validDate,
    assertDate,
    current,
  });
})(globalThis);
