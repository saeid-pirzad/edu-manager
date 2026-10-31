"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const read = (p) =>
  fs.readFileSync(path.join(__dirname, "../src/reports/periodic", p), "utf8");
test("deputy report retains full attendance and session marks in chronological order without mutation", () => {
  const c = vm.createContext({ faDate: (x) => x });
  vm.runInContext(read("text.js"), c);
  const session = (date, period) => ({
    date,
    period,
    className: "CLASS",
    lessonName: "LESSON",
    teacher: "TEACHER",
    participants: [
      { name: "LEAVE-STUDENT", attendance: { status: "leave", minutes: null } },
      { name: "LATE-STUDENT", attendance: { status: "late", minutes: 10 } },
    ],
    marks: [
      {
        name: "MARK-STUDENT",
        label: "CLASS-GRADE",
        value: 18,
        note: "HOMEWORK-NOTE",
      },
    ],
  });
  const m = {
    school: { name: "SCHOOL" },
    start: "2026-10-01",
    end: "2026-10-31",
    academicYear: "1405",
    detailLevel: "summary",
    summary: { present: 0, absent: 0, late: 2, leave: 2, unknown: 0 },
    sessions: [session("2026-10-31", 2), session("2026-10-30", 0)],
    note: "REPORT-NOTE",
  };
  const before = JSON.stringify(m),
    text = c.deputyReport(m);
  for (const word of [
    "SCHOOL",
    "CLASS",
    "TEACHER",
    "LEAVE-STUDENT",
    "LATE-STUDENT",
    "MARK-STUDENT",
    "CLASS-GRADE",
    "HOMEWORK-NOTE",
    "REPORT-NOTE",
    "مرخصی",
  ])
    assert.ok(text.includes(word), word);
  assert.ok(
    text.indexOf("تاریخ: 2026-10-30") < text.indexOf("تاریخ: 2026-10-31"),
  );
  assert.equal(JSON.stringify(m), before);
});
for (const stale of [false, true])
  test(
    "deputy copy " +
      (stale ? "rejects stale snapshot" : "copies validated snapshot"),
    async () => {
      const copied = [],
        invalid = [];
      let current = true;
      const c = vm.createContext({
        generate: async () => ({}),
        last: { context: {} },
        isPreparedCurrent: () => current,
        root: {
          EduV24: {
            assertReportSnapshot: async () => {
              if (stale) current = false;
            },
          },
        },
        document: { querySelector: () => ({}) },
        deputyReport: () => "REPORT",
        copyToClipboard: (text) => copied.push(text),
        invalidate: (m) => invalid.push(m),
      });
      vm.runInContext(
        read("output.js").split("root.EduPeriodicReports =")[0],
        c,
      );
      assert.equal(await c.output("deputy"), !stale);
      assert.equal(copied.length, stale ? 0 : 1);
      assert.equal(invalid.length, stale ? 1 : 0);
    },
  );
