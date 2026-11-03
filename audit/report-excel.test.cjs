"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  vm = require("node:vm"),
  { execFileSync } = require("node:child_process");
const read = (name) =>
  fs.readFileSync(path.join(__dirname, "../src", name), "utf8");
function fixture(audience = "management", mode = "daily") {
  const c = vm.createContext({ Blob, TextEncoder, Intl });
  for (const name of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
    "reports/periodic/xlsx-workbook.js",
    "reports/periodic/excel.js",
  ])
    vm.runInContext(read(name), c);
  const data = {
    settings: { academicYear: "1405-1406", academicTerm: "اول" },
    schools: [
      {
        id: "s",
        name: "مدرسه",
        classes: [
          {
            id: "c",
            name: "کلاس",
            students: [
              { id: "a", name: "علی", code: "001" },
              { id: "b", name: "PRIVATE_OTHER", code: "002" },
            ],
            lessons: [{ id: "l", name: "درس", teacher: "دبیر" }],
          },
        ],
      },
    ],
    sessions: [
      {
        id: "x",
        date: "2026-10-31",
        period: 1,
        schoolId: "s",
        classId: "c",
        lessonId: "l",
        roster: [
          { id: "a", name: "علی", code: "001" },
          { id: "b", name: "PRIVATE_OTHER", code: "002" },
        ],
        attendance: { a: "leave", b: "late:0" },
        scores: [
          {
            studentId: "a",
            type: "homework",
            value: 0,
            note: '=HYPERLINK("https://example.test","x")',
          },
          { studentId: "b", type: "positive", value: 2, note: "PRIVATE_NOTE" },
        ],
      },
      {
        id: "outside",
        date: "2026-10-30",
        period: 1,
        schoolId: "s",
        classId: "c",
        lessonId: "l",
        roster: [{ id: "a", name: "علی" }],
        attendance: { a: "absent" },
        scores: [],
      },
    ],
  };
  const m = c.EduReportModel.build(
    data,
    {
      mode,
      date: "2026-10-31",
      schoolId: "s",
      classId: "c",
      studentId: "a",
      audience,
      detailLevel: "full",
    },
    { generatedAt: "2026-11-03T10:00:00.000Z", collisionScope: "teacher" },
  );
  return { c, m };
}
test("Excel uses the actual filtered model, preserving leave, late-zero, codes, activities and the source", () => {
  const { c, m } = fixture(),
    before = JSON.stringify(m),
    s = c.excelReportSheets(m);
  assert.equal(JSON.stringify(m), before);
  const attendance = s.find((x) => x.name === "حضور و غیاب").rows;
  assert.equal(attendance.length, 3);
  assert.equal(attendance[1][9], "001");
  assert.equal(attendance[1][11], "مرخصی");
  assert.equal(attendance[2][12], 0);
  assert.equal(s.find((x) => x.name === "فعالیت‌ها").rows[1][12], 0);
  assert.equal(
    s.some((x) => x.name === "نتیجه سالانه"),
    false,
  );
  assert.equal(s.find((x) => x.name === "جلسات").rows.length, 2);
  assert.equal(
    s
      .find((x) => x.name === "خلاصه")
      .rows.find((r) => r[0] === "حاضر با احتساب تأخیر")[1],
    1,
  );
});
test("parent Excel contains only the chosen pupil across every sheet and every date mode", () => {
  for (const mode of ["daily", "weekly", "monthly", "annual"]) {
    const { c, m } = fixture("parent", mode),
      s = c.excelReportSheets(m),
      text = JSON.stringify(s);
    assert.doesNotMatch(text, /PRIVATE_OTHER|PRIVATE_NOTE/);
    assert.ok(
      s
        .find((x) => x.name === "حضور و غیاب")
        .rows.slice(1)
        .every((r) => r[10] === "علی"),
    );
  }
});
test("annual Excel exports raw stages and configured weights without turning missing grades into zero", () => {
  const { c, m } = fixture("management", "annual");
  const components = [0, 1, 2, 3].map((i) => ({
    term: i < 2 ? "اول" : "دوم",
    stage: i % 2 ? "final" : "midterm",
    practical: 0,
    theory: 20,
    practicalWeight: 70,
    final: 6,
    complete: true,
    passed: false,
  }));
  m.annualGrades = [
    {
      className: "کلاس",
      studentName: "علی",
      studentCode: "001",
      lessonName: "درس",
      components,
      final: 6,
      complete: true,
      passed: false,
    },
  ];
  m.technicalGrades = [
    {
      className: "کلاس",
      studentName: "علی",
      studentCode: "001",
      lessonName: "پودمانی",
      term: "سالانه",
      method: "modular",
      complete: false,
      final: null,
      modules: [
        { name: "پودمان", complete: false, final: null, reason: "ناقص" },
      ],
    },
  ];
  let s = c.excelReportSheets(m);
  assert.equal(s.find((x) => x.name === "امتحانات چهار مرحله").rows.length, 5);
  assert.deepEqual(
    Array.from(
      s.find((x) => x.name === "امتحانات چهار مرحله").rows[1].slice(7, 12),
    ),
    [0, 20, 70, 30, 6],
  );
  assert.equal(s.find((x) => x.name === "نتیجه سالانه").rows[1][9], 6);
  components[2].complete = false;
  components[2].final = null;
  m.annualGrades[0].complete = false;
  m.annualGrades[0].final = null;
  s = c.excelReportSheets(m);
  assert.equal(s.find((x) => x.name === "نتیجه سالانه").rows[1][9], null);
  assert.equal(s.find((x) => x.name === "پودمان‌ها").rows[1][7], null);
});
function unzipStored(bytes) {
  const files = new Map();
  let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const n = bytes.readUInt16LE(at + 26),
      extra = bytes.readUInt16LE(at + 28),
      size = bytes.readUInt32LE(at + 18),
      start = at + 30 + n + extra;
    assert.equal(bytes.readUInt16LE(at + 8), 0);
    files.set(
      bytes.subarray(at + 30, at + 30 + n).toString(),
      bytes.subarray(start, start + size).toString(),
    );
    at = start + size;
  }
  assert.equal(bytes.readUInt32LE(at), 0x02014b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  return files;
}
test("real XLSX is accepted by independent .NET ZIP/XML readers; text inert, zero numeric, missing blank", async (t) => {
  const { c } = fixture();
  const blob = c.xlsxWorkbook([
    {
      name: "آزمون",
      rows: [
        ["کد", "نمره", "خالی", "متن"],
        ["001", 0, null, "=1+2 & <tag> _x0041_\u0001"],
      ],
    },
  ]);
  assert.equal(
    blob.type,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const bytes = Buffer.from(await blob.arrayBuffer()),
    files = unzipStored(bytes),
    xml = files.get("xl/worksheets/sheet1.xml");
  assert.match(xml, /<c r="A2"[^>]*t="inlineStr"[^>]*><is><t[^>]*>001/);
  assert.match(xml, /<c r="B2"[^>]*><v>0<\/v>/);
  assert.doesNotMatch(xml, /<c r="C2"/);
  assert.match(xml, /rightToLeft="1"/);
  assert.match(xml, /state="frozen"/);
  assert.match(xml, /<autoFilter/);
  assert.match(xml, /&amp; &lt;tag&gt; _x005F_x0041__x0001_/);
  assert.doesNotMatch(
    [...files.values()].join(""),
    /<f[ >]|externalLink|vbaProject/,
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edu-xlsx-test-"));
  t.after(() => {
    assert.ok(dir.startsWith(path.join(os.tmpdir(), "edu-xlsx-test-")));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const name = path.join(dir, "report.xlsx");
  fs.writeFileSync(name, bytes);
  if (process.platform === "win32") {
    const script = [
      "$ErrorActionPreference='Stop'",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      "$archive=[IO.Compression.ZipFile]::OpenRead($env:EDU_XLSX_TEST)",
      "try { foreach($entry in $archive.Entries) {",
      "$reader=[IO.StreamReader]::new($entry.Open())",
      "try { [xml]$document=$reader.ReadToEnd(); if(-not $document.DocumentElement){throw 'Missing XML root'} } finally {$reader.Dispose()}",
      "}; Write-Output 'XLSX package and all XML parts read successfully.' } finally {$archive.Dispose()}",
    ].join("\n");
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        env: { ...process.env, EDU_XLSX_TEST: name },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.match(output, /successfully/);
  }
});
test("XLSX refuses invalid numbers, oversized cells and ambiguous sheet names without silent truncation", () => {
  const { c } = fixture();
  assert.throws(() => c.xlsxWorkbook([{ name: "bad/name", rows: [["x"]] }]));
  assert.throws(() =>
    c.xlsxWorkbook([{ name: "ok", rows: [["x"], [Infinity]] }]),
  );
  assert.throws(() =>
    c.xlsxWorkbook([{ name: "ok", rows: [["x"], ["x".repeat(32768)]] }]),
  );
  assert.throws(() =>
    c.xlsxWorkbook([
      { name: "ok", rows: [["x"]] },
      { name: "ok", rows: [["y"]] },
    ]),
  );
});
test("Excel output validates the snapshot, downloads actual XLSX and blocks changed or failed snapshots", async () => {
  const { c, m } = fixture(),
    downloads = [],
    errors = [];
  Object.assign(c, {
    document: { getElementById: () => null },
    generate: async () => m,
    last: { context: { id: "p", revision: 1 } },
    isPreparedCurrent: () => true,
    root: { EduV24: { assertReportSnapshot: async () => {} } },
    downloadLocalFile: (blob, name) => downloads.push({ blob, name }),
    invalidate: (message) => errors.push(message),
  });
  vm.runInContext(
    read("reports/periodic/output.js").split("root.EduPeriodicReports =")[0],
    c,
  );
  assert.equal(await c.output("xlsx"), true);
  assert.match(downloads[0].name, /_گزارش-روزانه\.xlsx$/);
  assert.equal(
    Buffer.from(await downloads[0].blob.arrayBuffer()).readUInt32LE(0),
    0x04034b50,
  );
  downloads.length = 0;
  c.isPreparedCurrent = () => false;
  assert.equal(await c.output("xlsx"), false);
  assert.equal(downloads.length, 0);
  c.isPreparedCurrent = () => true;
  c.root.EduV24.assertReportSnapshot = async () => {
    throw Error("stale revision");
  };
  assert.equal(await c.output("xlsx"), false);
  assert.equal(downloads.length, 0);
  assert.equal(errors.at(-1), "stale revision");
});

test("Excel uses human-facing bell numbers consistently and keeps lesson totals", () => {
  const { c, m } = fixture();
  m.sessions[0].period = 0;
  const sheets = c.excelReportSheets(m);
  for (const name of ["جلسات", "حضور و غیاب", "فعالیت‌ها"])
    assert.equal(sheets.find((s) => s.name === name).rows[1][3], 1);
  assert.equal(m.sessions[0].period, 0);
  assert.equal(sheets.find((s) => s.name === "آمار درس‌ها").rows[1][1], "درس");
});
test("Excel module and unit details preserve zero, competency and missing values without inventing an official unit result", () => {
  const { c, m } = fixture("management", "annual");
  m.technicalGrades = [
    {
      className: "کلاس",
      studentCode: "001",
      studentName: "علی",
      lessonName: "درس",
      term: "سالانه",
      method: "modular",
      complete: true,
      final: 10,
      passed: true,
      modules: [
        {
          name: "پودمان",
          continuous: 0,
          competency: 2,
          complete: true,
          passed: true,
          final: 10,
        },
      ],
      units: [
        { moduleName: "پودمان", unitName: "واحد", mostamar: 0, payani: null },
      ],
    },
  ];
  const sheets = c.excelReportSheets(m),
    row = sheets.find((s) => s.name === "پودمان‌ها").rows[1],
    unit = sheets.find((s) => s.name === "واحدهای کار").rows[1];
  assert.equal(row[10], 0);
  assert.equal(row[11], 2);
  assert.equal(unit[8], 0);
  assert.equal(unit[9], null);
  assert.equal(unit[10], null);
});
test("Excel filenames preserve the teacher name while excluding filesystem control characters", () => {
  const { c, m } = fixture();
  m.author = "دبیر: /آزمایش?";
  const name = c.excelReportFilename(m);
  assert.match(name, /دبیر/);
  assert.match(name, /_1405-08-12_13-30-00_/);
  assert.doesNotMatch(name, /[\\/:*?"<>|]/);
});

test("Excel print setup repeats headers, fits A4 width and retains numeric precision in stored values", async () => {
  const { c } = fixture(),
    bytes = Buffer.from(
      await c
        .xlsxWorkbook([
          {
            name: "نام'داخلی",
            rows: [
              ["نمره", "وضعیت"],
              [12.34567, "قبول"],
            ],
          },
        ])
        .arrayBuffer(),
    );
  const files = unzipStored(bytes),
    sheet = files.get("xl/worksheets/sheet1.xml"),
    book = files.get("xl/workbook.xml"),
    styles = files.get("xl/styles.xml");
  assert.match(sheet, /fitToPage="1"/);
  assert.match(sheet, /paperSize="9"/);
  assert.match(sheet, /fitToWidth="1" fitToHeight="0"/);
  assert.match(sheet, /<v>12.34567<\/v>/);
  assert.match(sheet, /<c r="B2" s="5"/);
  assert.match(book, /_xlnm.Print_Titles/);
  assert.match(book, /!\$1:\$1/);
  assert.match(styles, /formatCode="0.##"/);
  assert.throws(() =>
    c.xlsxWorkbook([
      { name: "SHEET", rows: [["x"]] },
      { name: "sheet", rows: [["y"]] },
    ]),
  );
});

test("every report sheet identifies its exact filters in a merged banner without filtering or freezing the banner as data", async () => {
  const { c, m } = fixture();
  m.author = "سعید پیرزاد";
  const sheets = c.excelReportSheets(m);
  for (const s of sheets) {
    assert.equal(s.banner.length, 3);
    assert.match(s.banner.join(" "), /فیلتر محدوده/);
    assert.match(s.banner.join(" "), /فیلتر زمانی/);
    assert.match(s.banner.join(" "), /سعید پیرزاد/);
    assert.match(s.banner.join(" "), /1405-1406/);
  }
  const files = unzipStored(
    Buffer.from(await c.xlsxWorkbook(sheets).arrayBuffer()),
  );
  const xml = files.get("xl/worksheets/sheet5.xml"),
    styles = files.get("xl/styles.xml"),
    book = files.get("xl/workbook.xml");
  assert.match(xml, /ySplit="4" topLeftCell="A5"/);
  assert.match(xml, /<autoFilter ref="A4:/);
  assert.match(xml, /<mergeCells count="3">/);
  assert.match(xml, /showGridLines="0"/);
  assert.match(book, /!\$1:\$4/);
  assert.match(styles, /<sz val="14"/);
  assert.equal((styles.match(/<fill>/g) || []).length, 8);
  assert.equal((styles.match(/<font>/g) || []).length, 4);
  assert.equal((styles.match(/<xf /g) || []).length, 11);
  assert.equal(files.size, sheets.length + 5);
});
test("filename dates use report creation in Tehran and explicit teacher name takes priority", () => {
  const { c, m } = fixture();
  m.author = "سعید پیرزاد";
  m.generatedAt = "2026-11-03T21:00:00Z";
  assert.equal(
    c.excelReportFilename(m),
    "سعید پیرزاد_1405-08-13_00-30-00_گزارش-روزانه.xlsx",
  );
  m.author = "";
  assert.equal(c.excelTeacherName(m), "دبیر");
  m.sessions.push({ teacher: "دبیر دیگر" });
  assert.equal(c.excelTeacherName(m), "چند دبیر");
  m.sessions = [];
  assert.equal(c.excelTeacherName(m), "نام دبیر ثبت نشده");
});

test("exported report cells independently round-trip at the actual data rows, including names, codes and zero", async (t) => {
  const { c, m } = fixture(),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "edu-xlsx-roundtrip-"));
  t.after(() => {
    assert.ok(dir.startsWith(path.join(os.tmpdir(), "edu-xlsx-roundtrip-")));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const file = path.join(dir, "report.xlsx");
  fs.writeFileSync(
    file,
    Buffer.from(await c.xlsxWorkbook(c.excelReportSheets(m)).arrayBuffer()),
  );
  const decoded = require("./xlsx-reader.cjs")(file);
  const attendance = decoded.sheets.find((s) => s.name === "حضور و غیاب");
  const first = attendance.rows.find((r) => r.number === 5).cells;
  assert.equal(first.J5, "001");
  assert.equal(first.K5, "علی");
  assert.equal(first.L5, "مرخصی");
  const activities = decoded.sheets.find((s) => s.name === "فعالیت‌ها");
  assert.equal(activities.rows.find((r) => r.number === 5).cells.M5, "0");
  const allText = JSON.stringify(c.excelReportSheets(m));
  assert.doesNotMatch(allText, /تاریخ ISO|2026-10|2026-11/);
  assert.match(allText, /۱۴۰۵/);
  assert.match(allText, /روز هفته/);
});

test("Excel opens on actual report data and removes empty worksheets instead of presenting empty tables", () => {
  const { c, m } = fixture();
  let sheets = c.excelReportSheets(m);
  assert.equal(sheets[0].name, "حضور و غیاب");
  assert.equal(sheets.at(-1).name, "خلاصه");
  assert.ok(sheets.every((s) => s.rows.length > 1));
  m.days = [];
  m.students = [];
  m.lessons = [];
  m.sessions = [];
  m.summary.sessions = 0;
  sheets = c.excelReportSheets(m);
  assert.deepEqual(
    Array.from(sheets, (s) => s.name),
    ["خلاصه"],
  );
  assert.match(JSON.stringify(sheets), /هیچ جلسه/);
});
