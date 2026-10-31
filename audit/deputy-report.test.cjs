"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const read = (p) =>
  fs.readFileSync(path.join(__dirname, "../src/reports/periodic", p), "utf8");
test("deputy report retains follow-up names in session order without exporting grade details or mutating data", () => {
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
    "REPORT-NOTE",
    "مرخصی",
  ])
    assert.ok(text.includes(word), word);
  assert.ok(
    text.indexOf("تاریخ: 2026-10-30") < text.indexOf("تاریخ: 2026-10-31"),
  );
  assert.ok(!text.includes("HOMEWORK-NOTE"));
  assert.ok(!text.includes("CLASS-GRADE"));
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
        deputyReportHTML: () => '<div dir="rtl">REPORT</div>',
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

test("daily deputy report includes unknown names and distinguishes them from absence", () => {
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
  for (const person of people) assert.ok(text.includes(person.name));
  assert.ok(text.includes("ON-LEAVE"));
  assert.ok(text.includes("تعیین‌نشده (۲۸)"));
  assert.ok(text.includes("به معنی غیبت نیست"));
  assert.equal((text.match(/2026-10-31/g) || []).length, 3);
});

test("rich deputy copy bolds only attendance headings while escaping names and preserving line breaks", () => {
  const c = vm.createContext({
    esc: (value) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  });
  vm.runInContext(read("text.js"), c);
  const text =
    "دبیر: پیرزاد\n\n🟢 حاضر: ۲۱ نفر\n🔴 غایب (۲): <نام>\n🟠 تأخیر (۱): نام\n🟣 مرخصی (۱): نام\n⚪ تعیین‌نشده (۰): —";
  const html = c.deputyReportHTML(text);
  for (const label of ["حاضر", "غایب", "تأخیر", "مرخصی", "تعیین‌نشده"])
    assert.ok(html.includes("<strong>" + label + "</strong>"));
  assert.ok(html.includes("پیرزاد<br><br>🟢"));
  assert.ok(html.includes("&lt;نام&gt;"));
  assert.equal(html.includes("<strong>۲۱"), false);
  assert.equal(html.includes("<نام>"), false);
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
  assert.equal((text.match(/کلاس: SAME-CLASS/g) || []).length, 2);
});

test("multi-day deputy report identifies date and teacher for every session", () => {
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
  assert.equal((text.match(/SHARED-TEACHER/g) || []).length, 3);
  assert.equal((text.match(/تاریخ: 2026-10-02/g) || []).length, 2);
  assert.ok(text.indexOf("زنگ ۱") < text.indexOf("زنگ ۳"));
  assert.ok(text.includes("تعیین‌نشده (۱)"));
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
  assert.ok(text.includes("فهرست حضور این جلسه خالی است"));
});

test("deputy report reconciles the supplied two-class scenario without listing present names", () => {
  const c = vm.createContext({ faDate: (value) => value });
  vm.runInContext(read("text.js"), c);
  const person = (name, status) => ({
    name,
    attendance: { status, minutes: null },
  });
  const sessions = [
    {
      date: "2026-10-31",
      period: 0,
      classId: "first",
      className: "یازدهم",
      lessonName: "ایلاستریتور",
      teacher: "پیرزاد",
      participants: [
        person("مرخصی اول", "leave"),
        ...Array.from({ length: 24 }, (_, i) =>
          person("تعیین‌نشده " + i, "unknown"),
        ),
      ],
    },
    {
      date: "2026-10-31",
      period: 0,
      classId: "second",
      className: "دوازدهم",
      lessonName: "افترافکت",
      teacher: "پیرزاد",
      participants: [
        ...Array.from({ length: 24 }, (_, i) =>
          person("PRESENT-PRIVATE-" + i, "present"),
        ),
        ...Array.from({ length: 4 }, (_, i) => person("غایب " + i, "absent")),
        person("مرخصی دوم", "leave"),
      ],
    },
  ];
  const model = {
    school: { name: "هنرستان حافظ" },
    academicYear: "1405-1406",
    start: "2026-10-31",
    end: "2026-10-31",
    sessions,
    summary: { present: 999, absent: 999, late: 999, leave: 999, unknown: 999 },
  };
  const before = JSON.stringify(model);
  const result = c.deputyReport(model);
  assert.equal(result.includes("خلاصه (نفرـجلسه)"), false);
  assert.ok(result.includes("کلاس: یازدهم | درس: ایلاستریتور\nدبیر: پیرزاد"));
  assert.ok(
    result.includes(
      "🟣 مرخصی (۱): مرخصی اول\n⚪ تعیین‌نشده (۲۴): تعیین‌نشده 0",
    ),
  );
  assert.ok(result.includes("🟢 حاضر: ۰ نفر\n🔴 غایب (۰): —"));
  assert.ok(result.includes("سال تحصیلی: 1405-1406"));
  assert.ok(result.includes("سال تحصیلی: 1405-1406\n\nتاریخ:"));
  assert.equal((result.match(/──────────/g) || []).length, 1);
  assert.ok(result.includes("حاضر: ۲۴ نفر"));
  assert.ok(result.includes("دبیر: پیرزاد\n\n🟢 حاضر:"));
  assert.equal(result.includes("PRESENT-PRIVATE-"), false);
  assert.equal((result.match(/تاریخ: 2026-10-31 \| زنگ ۱/g) || []).length, 2);
  for (const name of ["مرخصی اول", "مرخصی دوم", "غایب 3", "تعیین‌نشده 23"])
    assert.ok(result.includes(name));
  assert.equal(result.includes("نمرات بالا"), false);
  assert.equal(JSON.stringify(model), before);
});
