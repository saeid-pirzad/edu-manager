"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  vm = require("node:vm");
const read = (name) =>
    fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
  plain = (value) => JSON.parse(JSON.stringify(value)),
  sheet = (sheets, name) => {
    const value = sheets.find((item) => item.name === name);
    assert.ok(value, name);
    return value;
  },
  data = (sheets, name) => plain(sheet(sheets, name).rows.slice(1)),
  cells = (sheets) =>
    sheets.flatMap((item) => [...item.banner, ...item.rows.flat()]),
  courses = (part) => part.data.schools[0].classes[0].lessons;
function fixture({ count = 3 } = {}) {
  const c = vm.createContext({ structuredClone, Blob, TextEncoder, Intl });
  // Execute the application's actual registration-order helper without booting storage.
  vm.runInContext(
    read("legacy/core/state.js").split("function makeDefaultPoudmans")[0],
    c,
  );
  for (const file of [
    "domain/grade-math.js",
    "domain/data-boundary.js",
    "domain/grade-policy.js",
    "domain/reporting/academic-results.js",
    "domain/annual-modules.js",
    "legacy/grading/calculation.js",
    "legacy/grading/kardanesh.js",
    "workspace/domain/defaults-numbers.js",
    "workspace/validation/database.js",
    "workspace/grading/results.js",
    "workspace/reports/student.js",
    "workspace/reports/karnameh-grid.js",
    "workspace/reports/karnameh-excel-data.js",
    "reports/periodic/xlsx-workbook.js",
  ])
    vm.runInContext(read(file), c, { filename: file });
  c.old = { calcStudentLesson: c.legacy_calcStudentLesson };
  const students = Array.from({ length: count }, (_, index) => ({
      id: "student_" + index,
      name:
        ["زهره آزمایشی", "آرون خصوصی", "بهرام خصوصی"][index] ||
        "هنرجوی خصوصی " + index,
      code: ["020", "2", "001"][index] || String(index + 1),
    })),
    archived = { id: "archived", name: "هنرجوی بایگانی خصوصی", code: "099" },
    year = "1405-1406",
    all = [...students, archived],
    dual = {
      id: "dual",
      name: "مهارت رایانه",
      teacher: "دبیر آزمون",
      gradeMode: "kardanesh",
      poudmans: [],
      gradingPolicy: plain(c.EduPolicy.defaults("dual", year)),
      kardaneshScores: {},
    },
    general = {
      ...structuredClone(dual),
      id: "general",
      name: "عمومی",
      gradingPolicy: { ...dual.gradingPolicy, subjectType: "general" },
    },
    modular = {
      id: "modular",
      name: "درس فنی",
      teacher: "دبیر فنی",
      gradeMode: "standard",
      kardaneshScores: {},
      gradingPolicy: plain(c.EduPolicy.defaults("modular", year)),
      poudmans: ["a", "b"].map((id, index) => ({
        id: "pod_" + id,
        name: index ? "پودمان دوم" : "پودمان اول",
        podScores: {},
        units: [{ id: "unit_" + id, name: "واحد " + id, unitScores: {} }],
      })),
    },
    legacy = {
      id: "legacy",
      name: "درس واحدی قدیمی",
      teacher: "دبیر قدیمی",
      gradeMode: "standard",
      kardaneshScores: {},
      weightMostamar: 40,
      weightPayani: 60,
      poudmans: [
        {
          id: "legacy_pod",
          name: "واحدی قدیمی",
          units: [
            { id: "legacy_one", name: "واحد قدیمی یک", unitScores: {} },
            { id: "legacy_two", name: "واحد قدیمی دو", unitScores: {} },
          ],
        },
      ],
    },
    classroom = {
      id: "class",
      name: "یازدهم شبکه",
      students,
      archivedStudents: [archived],
      lessons: [dual, general, modular, legacy],
    },
    parts = ["اول", "دوم"].map((term, index) => ({
      period: {
        id: index ? "second" : "first",
        year,
        term,
        termKind: index ? "second" : "first",
      },
      data: {
        settings: { academicYear: year, academicTerm: term },
        schools: [
          {
            id: "school",
            name: "هنرستان آزمون",
            classes: [structuredClone(classroom)],
          },
        ],
        sessions: [],
      },
    }));
  for (const [termIndex, part] of parts.entries()) {
    const lessons = courses(part);
    for (const [index, student] of all.entries()) {
      lessons[0].kardaneshScores[student.id] = termIndex
        ? { midtermPractical: 10, midtermTheory: 20, practical: 20, theory: 20 }
        : { midtermPractical: 0, midtermTheory: 0, practical: 18, theory: 12 };
      lessons[1].kardaneshScores[student.id] = termIndex
        ? { midtermPractical: 19, midtermTheory: 20, practical: 19, theory: 12 }
        : { midtermPractical: 19, midtermTheory: 0, practical: 19, theory: 10 };
      for (const pod of lessons[2].poudmans) {
        pod.podScores[student.id] =
          pod.id === "pod_a" ? { m: 0, c: 3 } : { m: 4, c: 2 };
        if (pod.id === "pod_a")
          pod.units[0].unitScores[student.id] = termIndex
            ? { m: 12, p: 0 }
            : { m: 0, p: 8 };
      }
      lessons[3].poudmans[0].units[0].unitScores[student.id] = termIndex
        ? { m: 10, p: 20 }
        : { m: 0, p: 0 };
      lessons[3].poudmans[0].units[1].unitScores[student.id] = termIndex
        ? { m: 8, p: 12 }
        : { m: 8 };
      if (index === 1) {
        if (!termIndex)
          delete lessons[0].kardaneshScores[student.id].midtermTheory;
        if (termIndex) delete lessons[1].kardaneshScores[student.id].theory;
        delete lessons[2].poudmans[1].podScores[student.id].c;
      }
      if (index === 2) {
        lessons[0].kardaneshScores[student.id] = {
          midtermPractical: 0,
          midtermTheory: 0,
          practical: 0,
          theory: 0,
        };
        lessons[1].kardaneshScores[student.id] = {
          midtermTheory: 0,
          theory: 0,
        };
        lessons[2].poudmans[0].podScores[student.id] = { m: 0, c: 1 };
        lessons[2].poudmans[0].units[0].unitScores[student.id] = { m: 0, p: 0 };
      }
    }
  }
  courses(parts[0])[2].poudmans.reverse();
  const options = {
    parts,
    schoolId: "school",
    classroom: parts[1].data.schools[0].classes[0],
    year,
    generatedAt: "2026-11-04T10:00:00.000Z",
  };
  const build = (extra = {}) => c.karnamehExcelSheets({ ...options, ...extra });
  return { c, parts, options, build, students, archived };
}

test("class export preserves registration order, leading-zero codes and explicit archived membership", () => {
  const f = fixture(),
    rows = data(f.build(), "کاردانش");
  assert.deepEqual(
    rows.map((row) => row[0]),
    ["020", "2", "001", "099"],
  );
  assert.deepEqual(
    rows.map((row) => row[1]),
    [...f.students, f.archived].map((student) => student.name),
  );
  assert.deepEqual(
    rows.map((row) => row[2]),
    ["فعال", "فعال", "فعال", "بایگانی"],
  );
  assert.ok(rows.every((row) => typeof row[0] === "string"));
});

test("four independent Kardanesh stages reuse exact raw inputs and domain results without an annual column", () => {
  const f = fixture(),
    sheets = f.build(),
    row = data(sheets, "کاردانش")[0],
    headers = sheet(sheets, "کاردانش").rows[0];
  assert.deepEqual(
    row.slice(5),
    [70, 30, 0, 0, 0, 18, 12, 16.2, 10, 20, 13, 20, 20, 20],
  );
  assert.equal(headers.length, 19);
  assert.ok(headers.every((header) => !header.includes("سالانه")));
  const calculated = f.c.annualGradeRows(
    f.parts,
    "school",
    "class",
    "student_0",
  )[0];
  assert.deepEqual(
    row.slice(7).filter((_, index) => index % 3 === 2),
    plain(calculated.components.map((item) => item.final)),
  );
});

test("configurable practical/theory weights are exported from the same policy rather than hardcoded", () => {
  const f = fixture();
  for (const part of f.parts)
    Object.assign(courses(part)[0].gradingPolicy, {
      dualConfigurable: true,
      practicalWeight: 60,
    });
  const row = data(f.build({ studentId: "student_0" }), "کاردانش")[0];
  assert.deepEqual(row.slice(5, 7), [60, 40]);
  assert.deepEqual(row.slice(10, 13), [18, 12, 15.6]);
});

test("incomplete assessments retain their actual partial input while the result remains null", () => {
  const f = fixture(),
    row = data(f.build({ studentId: "student_1" }), "کاردانش")[0];
  assert.deepEqual(row.slice(7, 10), [0, null, null]);
  assert.equal(row[12], 16.2);
  assert.equal(
    data(f.build({ studentId: "student_1" }), "عمومی")[0].at(-1),
    null,
  );
});

test("general courses expose only four direct grades and ignore unrelated practical inputs", () => {
  const f = fixture(),
    sheets = f.build({ studentId: "student_0" });
  assert.deepEqual(data(sheets, "عمومی")[0].slice(5), [0, 10, 20, 12]);
  assert.equal(sheet(sheets, "عمومی").rows[0].length, 9);
  assert.ok(
    sheet(sheets, "عمومی").rows[0].every(
      (header) => !header.includes("عملی") && !header.includes("سالانه"),
    ),
  );
});

test("zero grades remain numbers in every relevant sheet", () => {
  const f = fixture(),
    sheets = f.build({ studentId: "student_2" });
  assert.deepEqual(data(sheets, "کاردانش")[0].slice(7), Array(12).fill(0));
  assert.deepEqual(data(sheets, "عمومی")[0].slice(5), [0, 0, 0, 0]);
  assert.deepEqual(
    data(sheets, "جزئیات واحد کار").map((row) => row.slice(-2)),
    [
      [0, 0],
      [0, 0],
    ],
  );
  assert.ok(
    data(sheets, "کاردانش")[0]
      .slice(7)
      .every((value) => typeof value === "number"),
  );
});

test("module raw inputs/results align by identity despite reversed term order and duplicate names", () => {
  const f = fixture();
  for (const part of f.parts)
    for (const pod of courses(part)[2].poudmans) pod.name = "عنوان مشترک";
  const rows = data(f.build({ studentId: "student_0" }), "پودمانی");
  assert.deepEqual(
    rows.map((row) => row.slice(5)),
    [
      ["عنوان مشترک", 0, 3, 15, "قبول"],
      ["عنوان مشترک", 4, 2, 14, "قبول"],
    ],
  );
  assert.equal(
    rows.length,
    2,
    "one row per actual annual module, never duplicated by term",
  );
});

test("incomplete and failed modules do not invent complete or passing status", () => {
  const f = fixture(),
    missing = data(f.build({ studentId: "student_1" }), "پودمانی")[1],
    failed = data(f.build({ studentId: "student_2" }), "پودمانی")[0];
  assert.deepEqual(missing.slice(6), [4, null, null, "ناقص"]);
  assert.deepEqual(failed.slice(6), [0, 1, 5, "نیازمند جبران"]);
});

test("conflicting term module records fail explicitly and never choose an arbitrary score", () => {
  const f = fixture();
  courses(f.parts[0])[2].poudmans.find(
    (pod) => pod.id === "pod_a",
  ).podScores.student_0 = { m: 1, c: 3 };
  assert.throws(() => f.build({ studentId: "student_0" }), /دو نمرهٔ متفاوت/);
});

test("individual export does not evaluate or leak another pupil's conflicting module record", () => {
  const f = fixture();
  courses(f.parts[0])[2].poudmans.find(
    (pod) => pod.id === "pod_a",
  ).podScores.student_1 = { m: 2, c: 3 };
  const sheets = f.build({ studentId: "student_0" }),
    exported = cells(sheets);
  for (const pupil of [...f.students.slice(1), f.archived])
    assert.ok(!exported.includes(pupil.name));
  for (const name of [
    "کاردانش",
    "عمومی",
    "پودمانی",
    "جزئیات واحد کار",
    "سوابق واحدی",
  ])
    assert.ok(
      data(sheets, name).every(
        (row) => row[0] === "020" && row[1] === f.students[0].name,
      ),
    );
  assert.equal(
    sheet(sheets, "مشخصات و راهنما").rows.find(
      (row) => row[0] === "تعداد هنرجویان انتخاب‌شده",
    )[1],
    1,
  );
});

test("archived individual export contains only that pupil and retains archived status", () => {
  const f = fixture(),
    sheets = f.build({ studentId: f.archived.id });
  for (const name of [
    "کاردانش",
    "عمومی",
    "پودمانی",
    "جزئیات واحد کار",
    "سوابق واحدی",
  ])
    assert.ok(
      data(sheets, name).every(
        (row) =>
          row[0] === "099" &&
          row[1] === f.archived.name &&
          row[2] === "بایگانی",
      ),
    );
  for (const pupil of f.students)
    assert.ok(!cells(sheets).includes(pupil.name));
});

test("formal work units preserve distinct term raw entries and never invent a combined final", () => {
  const f = fixture(),
    sheets = f.build({ studentId: "student_0" }),
    rows = data(sheets, "جزئیات واحد کار");
  assert.deepEqual(
    rows.map((row) => row.slice(5)),
    [
      ["اول", "پودمان اول", "واحد a", 0, 8],
      ["دوم", "پودمان اول", "واحد a", 12, 0],
    ],
  );
  assert.ok(
    sheet(sheets, "جزئیات واحد کار").rows[0].every(
      (header) => !header.includes("نتیجه"),
    ),
  );
  assert.equal(
    rows.length,
    2,
    "ungraded work units are omitted without creating fictitious grades",
  );
});

test("legacy unit details use the report domain including raw partial grades and group-over-session priority", () => {
  const f = fixture();
  f.parts[0].data.sessions.push({
    id: "session",
    date: "2026-10-01",
    period: 0,
    classId: "class",
    lessonId: "legacy",
    poudmanId: "legacy_pod",
    unitId: "legacy_one",
    attendance: { student_0: "present" },
    scores: [
      { studentId: "student_0", type: "mostamar", value: 19 },
      { studentId: "student_0", type: "payani", value: 20 },
    ],
  });
  const rows = data(f.build({ studentId: "student_0" }), "سوابق واحدی");
  assert.deepEqual(
    rows.map((row) => row.slice(5)),
    [
      ["اول", "واحدی قدیمی", "واحد قدیمی یک", 0, 0, 0, null, "ناقص"],
      ["اول", "واحدی قدیمی", "واحد قدیمی دو", 8, null, null, null, "ناقص"],
      ["دوم", "واحدی قدیمی", "واحد قدیمی یک", 10, 20, 16, 13.2, "تکمیل"],
      ["دوم", "واحدی قدیمی", "واحد قدیمی دو", 8, 12, 10.4, 13.2, "تکمیل"],
    ],
  );
});

test("missing term is explicit in metadata and its stage cells stay blank", () => {
  const f = fixture(),
    sheets = f.build({ parts: [f.parts[1]], studentId: "student_0" });
  assert.deepEqual(
    data(sheets, "کاردانش")[0].slice(7, 13),
    Array(6).fill(null),
  );
  assert.deepEqual(data(sheets, "عمومی")[0].slice(5, 7), [null, null]);
  const meta = sheet(sheets, "مشخصات و راهنما").rows;
  assert.match(meta.find((row) => row[0] === "نوبت اول")[1], /موجود نیست/);
  assert.equal(meta.find((row) => row[0] === "نوبت دوم")[1], "موجود");
});

test("school, class and academic-year scoping excludes unrelated source values from every sheet", () => {
  const f = fixture(),
    foreign = structuredClone(f.parts[0]);
  foreign.period.year = "1404-1405";
  foreign.data.schools[0].name = "PRIVATE_OTHER_YEAR";
  for (const lesson of courses(foreign)) {
    lesson.name = "PRIVATE_OTHER_YEAR_LESSON";
    lesson.teacher = "PRIVATE_OTHER_YEAR_TEACHER";
  }
  f.parts.push(foreign);
  for (const part of f.parts.slice(0, 2)) {
    const otherClass = structuredClone(part.data.schools[0].classes[0]);
    otherClass.id = "other_class";
    otherClass.name = "PRIVATE_OTHER_CLASS";
    for (const lesson of otherClass.lessons) {
      lesson.name = "PRIVATE_CLASS_LESSON";
      lesson.teacher = "PRIVATE_CLASS_TEACHER";
    }
    part.data.schools[0].classes.push(otherClass);
    part.data.schools.push({
      id: "other_school",
      name: "PRIVATE_OTHER_SCHOOL",
      classes: [structuredClone(otherClass)],
    });
  }
  assert.doesNotMatch(JSON.stringify(f.build()), /PRIVATE_OTHER|PRIVATE_CLASS/);
  assert.throws(
    () => f.build({ schoolId: "other_school", classroom: f.options.classroom }),
    /کلاس در مدرسه/,
  );
  assert.throws(() => f.build({ studentId: "not_in_class" }), /هنرجو در کلاس/);
});

test("metadata includes scoped teachers, Persian preparation date, scope and both term availability", () => {
  const f = fixture(),
    sheets = f.build({ studentId: "student_0" }),
    meta = data(sheets, "مشخصات و راهنما"),
    entry = (label) => meta.find((row) => row[0] === label)[1];
  assert.equal(entry("مدرسه"), "هنرستان آزمون");
  assert.equal(entry("کلاس"), "یازدهم شبکه");
  assert.equal(entry("سال تحصیلی"), "1405-1406");
  assert.equal(entry("نوبت اول"), "موجود");
  assert.equal(entry("نوبت دوم"), "موجود");
  assert.equal(entry("دبیر"), "دبیر آزمون، دبیر فنی، دبیر قدیمی");
  assert.match(entry("زمان تهیه (شمسی)"), /۱۴۰۵/);
  assert.ok(
    sheets.every((item) => item.banner.some((text) => text.includes("کد 020"))),
  );
});

test("a class with more than 100 pupils uses a bounded set of per-model sheets", () => {
  const f = fixture({ count: 101 }),
    sheets = f.build();
  assert.equal(sheets.length, 6);
  assert.equal(data(sheets, "کاردانش").length, 102);
  assert.equal(data(sheets, "پودمانی").length, 204);
  assert.ok(
    sheets.every((item) =>
      item.rows.every((row) => row.length === item.rows[0].length),
    ),
  );
});

test("grade export is pure, cannot read storage/current selections and does not mutate frozen source", () => {
  const f = fixture(),
    freeze = (value) => {
      if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
      }
      return value;
    };
  const before = JSON.stringify(f.options);
  freeze(f.options);
  for (const key of [
    "db",
    "workspace",
    "state",
    "karnamehFilter",
    "document",
    "localStorage",
    "indexedDB",
  ])
    Object.defineProperty(f.c, key, {
      get() {
        throw Error("Unscoped access: " + key);
      },
    });
  const sheets = f.build({ studentId: "student_0" });
  assert.equal(JSON.stringify(f.options), before);
  assert.equal(data(sheets, "کاردانش")[0][0], "020");
});

test("invalid scope, duplicate terms and invalid preparation time fail before producing a misleading workbook", () => {
  const f = fixture();
  assert.throws(() => f.c.karnamehExcelSheets(), /سال تحصیلی/);
  assert.throws(() => f.build({ year: "1404-1405" }), /کلاس در مدرسه/);
  assert.throws(
    () => f.build({ parts: [f.parts[0], structuredClone(f.parts[0])] }),
    /تکراری/,
  );
  assert.throws(() => f.build({ generatedAt: "not-a-date" }), /زمان تهیه/);
});

test("an empty roster exports explicit metadata without any other student's grade rows", () => {
  const f = fixture(),
    classroom = { ...f.options.classroom, students: [], archivedStudents: [] },
    sheets = f.build({ classroom });
  assert.equal(sheets.length, 1);
  assert.equal(
    sheet(sheets, "مشخصات و راهنما").rows.find(
      (row) => row[0] === "تعداد هنرجویان انتخاب‌شده",
    )[1],
    0,
  );
});

test("grade worksheets open first and metadata remains available as the last sheet", () => {
  const f = fixture(),
    sheets = f.build();
  assert.deepEqual(plain(sheets.map((item) => item.name)), [
    "کاردانش",
    "عمومی",
    "پودمانی",
    "جزئیات واحد کار",
    "سوابق واحدی",
    "مشخصات و راهنما",
  ]);
  const classroom = {
    ...f.options.classroom,
    lessons: f.options.classroom.lessons.filter(
      (lesson) => lesson.id === "modular",
    ),
  };
  const parts = structuredClone(f.parts);
  for (const part of parts)
    part.data.schools[0].classes[0].lessons =
      part.data.schools[0].classes[0].lessons.filter(
        (lesson) => lesson.id === "modular",
      );
  assert.equal(f.build({ classroom, parts })[0].name, "پودمانی");
});

test("legacy lessons without work units retain an explicit per-term result row", () => {
  const f = fixture();
  for (const part of f.parts) courses(part)[3].poudmans[0].units = [];
  const rows = data(f.build({ studentId: "student_0" }), "سوابق واحدی");
  assert.deepEqual(
    rows.map((row) => row.slice(5)),
    [
      ["اول", "", "", null, null, null, null, "ناقص"],
      ["دوم", "", "", null, null, null, null, "ناقص"],
    ],
  );
});

test("legacy session fallback is retained for a missing field while an explicit grouped zero has priority", () => {
  const f = fixture();
  delete courses(f.parts[0])[3].poudmans[0].units[0].unitScores.student_0.p;
  f.parts[0].data.sessions.push({
    id: "session",
    date: "2026-10-01",
    period: 0,
    classId: "class",
    lessonId: "legacy",
    poudmanId: "legacy_pod",
    unitId: "legacy_one",
    attendance: {},
    scores: [
      { studentId: "student_0", type: "mostamar", value: 19 },
      { studentId: "student_0", type: "payani", value: 17 },
    ],
  });
  const rows = data(f.build({ studentId: "student_0" }), "سوابق واحدی");
  assert.deepEqual(rows[0].slice(8, 11), [0, 17, 10.2]);
  assert.deepEqual(rows[0].slice(11), [null, "ناقص"]);
});

function storedParts(buffer) {
  const result = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18),
      nameLength = buffer.readUInt16LE(offset + 26),
      extra = buffer.readUInt16LE(offset + 28),
      body = offset + 30 + nameLength + extra;
    result.set(
      buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"),
      buffer.subarray(body, body + size).toString("utf8"),
    );
    offset = body + size;
  }
  return result;
}
test("real XLSX writer preserves typed zero, leading-zero code, missing cells and literal unsafe-looking text", async () => {
  const f = fixture();
  f.options.classroom.students[0].name =
    '=HYPERLINK("https://example.invalid", "<نام & ایمن>")';
  const sheets = f.build({ studentId: "student_0" }),
    buffer = Buffer.from(await f.c.xlsxWorkbook(sheets).arrayBuffer()),
    parts = storedParts(buffer),
    xml = parts.get("xl/worksheets/sheet1.xml"),
    row = sheets[0].banner.length + 2;
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  const cellStart = xml.indexOf('<c r="A' + row + '"'),
    codeCell = xml.slice(cellStart, xml.indexOf("</c>", cellStart) + 4);
  assert.match(codeCell, /t="inlineStr"/);
  assert.ok(codeCell.includes('<t xml:space="preserve">020</t>'));
  assert.match(xml, new RegExp('<c r="H' + row + '"[^>]*><v>0</v></c>'));
  assert.ok(xml.includes("&lt;نام &amp; ایمن&gt;"));
  for (const value of parts.values()) {
    assert.ok(!value.includes("<f>") && !value.includes("<f "));
    assert.doesNotMatch(value, /externalLink|vbaProject/);
  }
  const partial = f.build({ studentId: "student_1" }),
    partialXml = storedParts(
      Buffer.from(await f.c.xlsxWorkbook(partial).arrayBuffer()),
    ).get("xl/worksheets/sheet1.xml");
  assert.ok(
    !partialXml.includes('r="I' + row + '"') &&
      !partialXml.includes('r="J' + row + '"'),
    "missing theory/result are absent cells rather than numeric zero",
  );
  if (process.platform === "win32") {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), "edu-karnameh-xlsx-"),
      ),
      filename = path.join(directory, "selected-student.xlsx");
    try {
      fs.writeFileSync(filename, buffer);
      const decoded = require("./xlsx-reader.cjs")(filename),
        decodedDual = decoded.sheets.find((item) => item.name === "کاردانش"),
        record = decodedDual.rows.find((item) => item.number === row).cells;
      assert.equal(record["A" + row], "020");
      assert.equal(record["B" + row], f.options.classroom.students[0].name);
      assert.equal(record["H" + row], "0");
      assert.equal(record["M" + row], "16.2");
      assert.equal(decoded.sheets.length, 6);
      assert.doesNotMatch(
        JSON.stringify(decoded),
        /آرون خصوصی|بهرام خصوصی|هنرجوی بایگانی خصوصی/,
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("a real subthreshold Kardanesh result remains visibly below the threshold in the workbook", async () => {
  const f = fixture();
  Object.assign(courses(f.parts[0])[0].kardaneshScores.student_0, {
    midtermPractical: 13.99,
    midtermTheory: 14.02,
  });
  const grade = f.c.annualGradeRows(f.parts, "school", "class", "student_0")[0]
    .components[0];
  assert.equal(grade.final, 13.999);
  assert.equal(grade.passed, false);
  const sheets = f.build({ studentId: "student_0" }),
    row = data(sheets, "کاردانش")[0],
    text = f.c.finalText(grade);
  assert.equal(row[9], text);
  assert.match(row[9], /^13\.999 \(کمتر از 14\)$/);
  assert.equal(row[12], 16.2);
  assert.equal(typeof row[12], "number");
  const xml = storedParts(
      Buffer.from(await f.c.xlsxWorkbook(sheets).arrayBuffer()),
    ).get("xl/worksheets/sheet1.xml"),
    rowNumber = sheets[0].banner.length + 2,
    start = xml.indexOf('<c r="J' + rowNumber + '"'),
    cell = xml.slice(start, xml.indexOf("</c>", start) + 4);
  assert.match(cell, /t="inlineStr"/);
  assert.ok(cell.includes(text));
  assert.doesNotMatch(cell, /<v>14<\/v>/);
});

test("configured threshold exceptions use the same report wording while normal and zero results stay numeric", () => {
  const f = fixture();
  for (const part of f.parts)
    Object.assign(courses(part)[0].gradingPolicy, {
      dualConfigurable: true,
      practicalWeight: 70,
      passMin: 16,
    });
  Object.assign(courses(f.parts[0])[0].kardaneshScores.student_0, {
    midtermPractical: 15.99,
    midtermTheory: 16.02,
  });
  const grade = f.c.annualGradeRows(f.parts, "school", "class", "student_0")[0]
      .components[0],
    row = data(f.build({ studentId: "student_0" }), "کاردانش")[0];
  assert.equal(grade.final, 15.999);
  assert.equal(row[9], f.c.finalText(grade));
  assert.match(row[9], /کمتر از 16/);
  assert.equal(row[12], 16.2);
  assert.equal(typeof row[12], "number");
  assert.ok(
    data(f.build({ studentId: "student_2" }), "کاردانش")[0]
      .slice(7)
      .every((value) => typeof value === "number" && value === 0),
  );
});
