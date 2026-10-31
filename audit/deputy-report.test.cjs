"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const read = (p) =>
  fs.readFileSync(path.join(__dirname, "../src/reports/periodic", p), "utf8");
test("deputy summary retains follow-up names and summarizes marks in chronological order without mutation", () => {
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
    "CLASS-GRADE",
    "REPORT-NOTE",
    "مرخصی",
  ])
    assert.ok(text.includes(word), word);
  assert.ok(
    text.indexOf("تاریخ: 2026-10-30") < text.indexOf("تاریخ: 2026-10-31"),
  );
  assert.ok(!text.includes("HOMEWORK-NOTE"));
  assert.ok(!text.includes("MARK-STUDENT"));
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

test("daily deputy summary omits unknown and present names while explicitly warning about incomplete attendance", () => {
  const c = vm.createContext({ faDate: (x) => x });
  vm.runInContext(read("text.js"), c);
  const people = Array.from({ length: 28 }, (_, i) => ({
    name: "UNKNOWN-NAME-" + i,
    attendance: { status: "unknown", minutes: null },
  }));
  people.push({
    name: "ON-LEAVE",
    attendance: { status: "leave", minutes: null },
  });
  const m = {
    school: { name: "SCHOOL" },
    start: "2026-10-31",
    end: "2026-10-31",
    summary: { unknown: 28, leave: 1 },
    sessions: [
      {
        classId: "c",
        className: "CLASS",
        date: "2026-10-31",
        period: 0,
        lessonName: "LESSON",
        participants: people,
        marks: [],
      },
    ],
  };
  const text = c.deputyReport(m);
  assert.ok(!text.includes("UNKNOWN-NAME-"));
  assert.ok(text.includes("ON-LEAVE"));
  assert.ok(text.includes("حضور تکمیل‌نشده"));
  assert.ok(text.includes("به معنی غیبت نیست"));
  assert.ok(text.length < 650);
  assert.equal((text.match(/2026-10-31/g) || []).length, 1);
});
test("deputy summary never merges classes sharing the same display name", () => {
  const c = vm.createContext({ faDate: (x) => x });
  vm.runInContext(read("text.js"), c);
  const session = (id) => ({
    classId: id,
    className: "SAME-CLASS",
    date: "2026-10-31",
    period: 0,
    lessonName: "LESSON",
    participants: [
      { name: id, attendance: { status: "absent", minutes: null } },
    ],
    marks: [],
  });
  const text = c.deputyReport({
    school: { name: "SCHOOL" },
    start: "2026-10-31",
    end: "2026-10-31",
    summary: { unknown: 0, leave: 0 },
    sessions: [session("a"), session("b")],
  });
  assert.equal((text.match(/🎓 SAME-CLASS/g) || []).length, 2);
});

test("multi-day deputy summary groups dates and prints a shared teacher only once", () => {
  const c = vm.createContext({ faDate: (x) => x });
  vm.runInContext(read("text.js"), c);
  const session = (date, period) => ({
    classId: "a",
    className: "CLASS",
    date,
    period,
    teacher: "SHARED-TEACHER",
    lessonName: "LESSON",
    participants: [
      { name: "STUDENT", attendance: { status: "unknown", minutes: null } },
    ],
    marks: [],
  });
  const text = c.deputyReport({
    school: { name: "SCHOOL" },
    start: "2026-10-01",
    end: "2026-10-31",
    summary: { unknown: 3 },
    sessions: [
      session("2026-10-02", 2),
      session("2026-10-02", 0),
      session("2026-10-03", 0),
    ],
  });
  assert.equal((text.match(/SHARED-TEACHER/g) || []).length, 1);
  assert.equal((text.match(/تاریخ: 2026-10-02/g) || []).length, 1);
  assert.ok(text.indexOf("زنگ ۱") < text.indexOf("زنگ ۳"));
  assert.ok(text.includes("حضور ناتمام:"));
  assert.ok(!text.includes("✅"));
});
test("empty attendance rosters never produce a misleading all-present message", () => {
  const c = vm.createContext({ faDate: (x) => x });
  vm.runInContext(read("text.js"), c);
  const text = c.deputyReport({
    school: { name: "SCHOOL" },
    start: "2026-10-31",
    end: "2026-10-31",
    summary: {},
    sessions: [
      {
        classId: "a",
        className: "CLASS",
        date: "2026-10-31",
        period: 0,
        lessonName: "LESSON",
        participants: [],
        marks: [],
      },
    ],
  });
  assert.ok(!text.includes("✅"));
  assert.ok(text.includes("فهرست حضور بعضی جلسه‌ها خالی است"));
});
