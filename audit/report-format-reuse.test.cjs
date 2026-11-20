"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture(name) {
  const calls = [];
  const context = vm.createContext({
    Intl: {
      NumberFormat: function (locale, options) {
        calls.push({ kind: "number", locale, options });
        return new Intl.NumberFormat(locale, options);
      },
      DateTimeFormat: function (locale, options) {
        calls.push({ kind: "date", locale, options });
        return new Intl.DateTimeFormat(locale, options);
      },
    },
  });
  for (const file of ["completeness.js", "academic-summary.js"])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/domain/reporting", file),
        "utf8",
      ),
      context,
    );
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/reports/periodic", name),
      "utf8",
    ),
    context,
  );
  return { context, calls };
}

function model(size = 120) {
  const counts = {
    present: 1,
    absent: 0,
    late: 0,
    leave: 0,
    unknown: 0,
  };
  const dates = ["2026-03-20", "2026-03-21", "2026-11-18"];
  return {
    mode: "annual",
    audience: "management",
    school: { name: "SCHOOL" },
    academicYear: "1405-1406",
    generatedAt: "2026-11-18T21:15:30Z",
    start: dates[0],
    end: dates.at(-1),
    summary: { ...counts, sessions: size },
    days: size ? dates.map((date) => ({ date, ...counts, sessions: 1 })) : [],
    students: [],
    lessons: [],
    sessions: Array.from({ length: size }, (_, index) => ({
      date: dates[index % dates.length],
      period: index % 3,
      className: "CLASS",
      lessonName: "LESSON",
      teacher: "TEACHER",
      counts,
      marks: [],
      participants: [
        {
          studentId: "student",
          name: "STUDENT",
          code: "001",
          attendance: { label: "حاضر", minutes: null },
          scores: [],
        },
      ],
    })),
  };
}

test("report numbers preserve missing, coercion, rounding and nonfinite output while reusing one lazy formatter", () => {
  const { context, calls } = fixture("text.js");
  const format = vm.runInContext("num", context);
  assert.equal(calls.length, 0, "loading reports needs no Intl instance");
  assert.equal(format(null), "—");
  assert.equal(format(undefined), "—");
  assert.throws(() => format(Symbol("invalid")), { name: "TypeError" });
  assert.equal(calls.length, 0, "missing and failed conversions stay lazy");

  const values = [
    0,
    -0,
    1234567.895,
    -12.345,
    1e21,
    NaN,
    Infinity,
    -Infinity,
    "",
    " 17.005 ",
    "invalid",
    true,
    false,
    9007199254740993n,
  ];
  for (let repeat = 0; repeat < 20; repeat++)
    for (const value of values)
      assert.equal(
        format(value),
        Number(value).toLocaleString("fa-IR", { maximumFractionDigits: 2 }),
      );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].locale, "fa-IR");
  assert.equal(calls[0].options.maximumFractionDigits, 2);
});

test("report number reuse converts objects once and preserves conversion errors", () => {
  const { context } = fixture("text.js");
  const format = vm.runInContext("num", context);
  let conversions = 0;
  assert.equal(
    format({
      valueOf() {
        conversions++;
        return 19.125;
      },
    }),
    Number(19.125).toLocaleString("fa-IR", { maximumFractionDigits: 2 }),
  );
  assert.equal(conversions, 1);
  const failure = Error("conversion failed");
  assert.throws(
    () =>
      format({
        valueOf() {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
  assert.equal(format(0), Number(0).toLocaleString("fa-IR"));
});

test("Excel shares UTC formatters across actual day, session, attendance and banner rows without changing the model", () => {
  const { context, calls } = fixture("excel.js");
  const input = model();
  const before = JSON.stringify(input);
  assert.equal(calls.length, 0);
  const sheets = context.excelReportSheets(input);
  assert.equal(
    calls.length,
    3,
    "one date, weekday and prepared-time formatter",
  );
  const sessionRows = sheets.find((sheet) => sheet.name === "جلسات").rows;
  const attendanceRows = sheets.find(
    (sheet) => sheet.name === "حضور و غیاب",
  ).rows;
  const dayRows = sheets.find((sheet) => sheet.name === "آمار روزها").rows;
  for (const [rows, source] of [
    [sessionRows, input.sessions],
    [attendanceRows, input.sessions],
    [dayRows, input.days],
  ]) {
    assert.equal(rows.length, source.length + 1);
    for (let index = 0; index < source.length; index++) {
      const date = new Date(source[index].date + "T12:00:00Z");
      assert.equal(
        rows[index + 1][0],
        new Intl.DateTimeFormat("fa-IR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: "UTC",
        }).format(date),
      );
      assert.equal(
        rows[index + 1][1],
        new Intl.DateTimeFormat("fa-IR", {
          weekday: "long",
          timeZone: "UTC",
        }).format(date),
      );
    }
  }
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.excelReportSheets(input))),
    JSON.parse(JSON.stringify(sheets)),
  );
  assert.equal(calls.length, 6, "each new export owns its own formatters");
  assert.equal(JSON.stringify(input), before);
});

test("an empty Excel export creates no unused weekday formatter", () => {
  const { context, calls } = fixture("excel.js");
  const sheets = context.excelReportSheets(model(0));
  assert.deepEqual(
    Array.from(sheets, (sheet) => sheet.name),
    ["خلاصه"],
  );
  assert.equal(calls.length, 2);
  assert.equal(
    calls.some((call) => call.options.weekday),
    false,
  );
});
