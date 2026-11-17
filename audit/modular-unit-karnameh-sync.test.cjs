"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { fixture } = require("./modular-unit-reports.test.cjs");

const plain = (value) => JSON.parse(JSON.stringify(value));
const latin = (value) =>
  value.replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
function annualFixture() {
  const f = fixture();
  const second = structuredClone(f.parts[0]);
  second.period = {
    id: "second",
    year: "1405-1406",
    term: "دوم",
    termKind: "second",
  };
  const nextLesson = second.data.schools[0].classes[0].lessons[0];
  for (const [index, unit] of nextLesson.poudmans
    .flatMap((pod) => pod.units)
    .entries()) {
    if (index !== 1) unit.competencyScores = {};
  }
  f.lesson.poudmans[0].units[1].competencyScores = {};
  f.parts.push(second);
  return f;
}
function values(html) {
  return [
    ...html.matchAll(
      /<td\b[^>]*data-karnameh-field="([^"]+)"[^>]*>[\s\S]*?<span class="karnameh-sheet-value"[^>]*>([^<]*)<\/span>[\s\S]*?<\/td>/g,
    ),
  ].map((match) => {
    const value = latin(match[2]);
    return [match[1], value === "—" ? null : Number(value)];
  });
}
function sheet(f, classroom = f.classroom) {
  return f.c.individualKarnameh(classroom, {
    parts: f.parts,
    schoolId: "school",
    student: classroom.students[0],
  });
}
function excel(f, classroom = f.classroom) {
  return plain(
    f.c.karnamehExcelSheets({
      parts: f.parts,
      schoolId: "school",
      classroom,
      studentId: "student",
      year: "1405-1406",
      generatedAt: "2026-11-17T12:00:00.000Z",
    }),
  )
    .find((item) => item.name === "واحدهای کار پودمانی")
    .rows.slice(1);
}

test("individual karnameh and Excel share the same annual work-unit records from either term, including zero and incomplete inputs", () => {
  const f = annualFixture();
  const before = JSON.stringify(f.parts);
  const expected = [
    [0, 3, 15],
    [4.5, 3, 19.5],
    [1, 1, 6],
    [2, null, null],
  ];
  for (const part of f.parts) {
    const classroom = part.data.schools[0].classes[0];
    const cells = values(sheet(f, classroom));
    assert.equal(cells.length, 12);
    assert.deepEqual(
      cells.map((cell) => cell[0]),
      Array.from({ length: 4 }, () => [
        "continuous",
        "competency",
        "unit-result",
      ]).flat(),
    );
    assert.deepEqual(
      Array.from({ length: 4 }, (_, index) =>
        cells.slice(index * 3, index * 3 + 3).map((cell) => cell[1]),
      ),
      expected,
    );
    assert.deepEqual(
      excel(f, classroom).map((row) => row.slice(7, 10)),
      expected,
    );
    assert.equal(excel(f, classroom)[3][10], "ناقص");
    assert.doesNotMatch(sheet(f, classroom), /نهایی درس|میانگین|PRIVATE/);
  }
  f.parts.reverse();
  assert.deepEqual(
    excel(f).map((row) => row.slice(7, 10)),
    expected,
  );
  assert.equal(JSON.stringify([...f.parts].reverse()), before);
});

test("annual work-unit reports reject conflicting term grades instead of silently choosing one term", () => {
  const f = annualFixture();
  f.parts[1].data.schools[0].classes[0].lessons[0].poudmans[0].units[0].competencyScores =
    { student: { m: 1, c: 3 } };
  assert.throws(() => sheet(f), /دو نمرهٔ متفاوت/);
  assert.throws(() => excel(f), /دو نمرهٔ متفاوت/);
});

test("annual rendering and export never rewrite the frozen first-term work-unit report", () => {
  const f = annualFixture();
  const frozen = f.report();
  const before = JSON.stringify(frozen);
  assert.equal(f.c.validateFrozenReport(frozen), true);
  assert.equal(
    frozen.classes[0].students[0].lessons[0].modules[0].units[1].final,
    null,
  );
  assert.equal(values(sheet(f))[5][1], 19.5);
  assert.equal(excel(f)[1][9], 19.5);
  assert.equal(f.c.validateFrozenReport(frozen), true);
  assert.equal(JSON.stringify(frozen), before);
});

test("module and local unit coordinates keep independent grades aligned when an earlier module has fewer units", () => {
  const f = fixture(),
    other = structuredClone(f.lesson);
  other.id = 'other-lesson"<';
  other.name = 'درس دوم <img src=x onerror="bad()">';
  for (const pod of other.poudmans) {
    pod.name = 'پودمان <b>هم‌نام</b> "';
    for (const unit of pod.units) {
      unit.name = 'واحد <script>bad()</script> "';
      unit.competencyScores = { student: { m: 1, c: 2 } };
    }
  }
  other.poudmans[0].units.pop();
  f.classroom.lessons.push(other);
  const before = JSON.stringify(f.parts),
    html = sheet(f),
    tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/g)]
      .filter((match) =>
        /\bclass="[^"]*\bkarnameh-unit-competency-table\b/.test(match[1]),
      )
      .map((match) => match[2]);
  assert.equal(tables.length, 1);
  const table = tables[0],
    header = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)?.[1] || "",
    rows = [...table.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)].filter(
      (match) => /\bdata-karnameh-lesson="/.test(match[1]),
    );
  assert.equal((header.match(/<tr\b/g) || []).length, 2);
  assert.equal((header.match(/<th\b/g) || []).length, 17);
  assert.match(header, /<th\b[^>]*rowspan="2"[^>]*>درس<\/th>/);
  assert.deepEqual(
    [...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
      .slice(0, 5)
      .map((match) => match[1].replace(/<[^>]*>/g, "").trim()),
    [
      "درس",
      "پودمان ۱ · واحد کار ۱",
      "پودمان ۱ · واحد کار ۲",
      "پودمان ۲ · واحد کار ۱",
      "پودمان ۲ · واحد کار ۲",
    ],
  );
  assert.equal((header.match(/scope="colgroup" colspan="3"/g) || []).length, 4);
  assert.equal(rows.length, 2);
  assert.equal(values(table).length, 21);
  for (const [lesson, expected] of [
    [
      f.lesson,
      [
        [0, 3, 15],
        [4.5, 3, 19.5],
        [1, 1, 6],
        [2, null, null],
      ],
    ],
    [other, Array.from({ length: 3 }, () => [1, 2, 11])],
  ]) {
    const ownRows = rows.filter((row) =>
      row[1].includes('data-karnameh-lesson="' + f.c.esc(lesson.id) + '"'),
    );
    assert.equal(ownRows.length, 1);
    const unitCells = [
      ...ownRows[0][2].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g),
    ].filter((cell) => /\bdata-karnameh-unit="/.test(cell[1]));
    const expectedUnits = lesson.poudmans.flatMap((pod, moduleIndex) =>
      pod.units.map((unit, unitIndex) => ({
        pod,
        unit,
        moduleIndex,
        unitIndex,
      })),
    );
    assert.deepEqual(
      unitCells.map(
        (cell) => cell[1].match(/\bdata-karnameh-unit="([^"]+)"/)[1],
      ),
      expectedUnits.flatMap(({ unit }) => Array(3).fill(f.c.esc(unit.id))),
    );
    assert.deepEqual(
      values(ownRows[0][2]).map((cell) => cell[1]),
      expected.flat(),
    );
    for (const [
      index,
      { pod, moduleIndex, unitIndex },
    ] of expectedUnits.entries())
      for (const cell of unitCells.slice(index * 3, index * 3 + 3)) {
        assert.ok(
          cell[1].includes('data-karnameh-module="' + f.c.esc(pod.id) + '"'),
        );
        assert.ok(
          cell[1].includes(
            'data-karnameh-unit-position="' +
              (moduleIndex * 2 + unitIndex) +
              '"',
          ),
        );
        assert.ok(
          cell[1].includes(
            'data-karnameh-module-position="' + moduleIndex + '"',
          ),
        );
        assert.ok(
          cell[1].includes('data-karnameh-unit-index="' + unitIndex + '"'),
        );
      }
    assert.equal((ownRows[0][2].match(/<th\b/g) || []).length, 1);
  }
  const unavailable = [
    ...table.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g),
  ].filter((cell) => /\bdata-karnameh-unit-unavailable="true"/.test(cell[1]));
  assert.equal(unavailable.length, 1);
  assert.match(unavailable[0][1], /\bcolspan="3"/);
  assert.match(unavailable[0][1], /data-karnameh-unit-position="1"/);
  assert.match(unavailable[0][1], /پودمان ۱/);
  assert.match(unavailable[0][1], /واحد کار ۲/);
  assert.doesNotMatch(unavailable[0][1], /\bclass="[^"]*no-print/);
  assert.match(unavailable[0][2], /ندارد/);
  assert.doesNotMatch(unavailable[0][1], /\bdata-karnameh-unit="/);
  assert.doesNotMatch(
    unavailable[0][2],
    /data-karnameh-field|karnameh-sheet-value/,
  );
  assert.equal(excel(f).length, 7);
  assert.doesNotMatch(
    table,
    /\bhidden(?:\s|=|>)|style="[^"]*display\s*:\s*none|data-karnameh-field="(?:annual|module-result)"/,
  );
  assert.doesNotMatch(
    html,
    /<img\b|<script\b|<b>هم‌نام<\/b>|نهایی درس|میانگین/,
  );
  assert.match(html, /&lt;img src=x onerror=&quot;bad\(\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.equal(JSON.stringify(f.parts), before);
});

test("raw work-unit inputs keep their actual precision in karnameh and the numeric XLSX cell format", async () => {
  const f = annualFixture();
  for (const part of f.parts)
    part.data.schools[0].classes[0].lessons[0].gradingPolicy.continuousStep = 0.001;
  f.lesson.poudmans[0].units[0].competencyScores.student.m = 0.001;
  const rows = excel(f);
  assert.equal(values(sheet(f))[0][1], 0.001);
  assert.equal(rows[0][7], 0.001);
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/reports/periodic/xlsx-workbook.js"),
      "utf8",
    ),
    f.c,
  );
  f.c.Blob = Blob;
  f.c.TextEncoder = TextEncoder;
  const workbook = f.c.xlsxWorkbook([
    {
      name: "درجه دقت",
      rows: [
        ["مستمر", "شایستگی"],
        [0.001, 3],
        [0, 2],
      ],
    },
  ]);
  const buffer = Buffer.from(await workbook.arrayBuffer());
  let offset = 0;
  const entries = new Map();
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18),
      nameLength = buffer.readUInt16LE(offset + 26),
      extraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    entries.set(
      buffer.subarray(offset + 30, offset + 30 + nameLength).toString(),
      buffer.subarray(start, start + size).toString(),
    );
    offset = start + size;
  }
  assert.match(entries.get("xl/styles.xml"), /formatCode="0\.###############"/);
  assert.match(
    entries.get("xl/worksheets/sheet1.xml"),
    /<c r="A2" s="3"><v>0\.001<\/v><\/c>/,
  );
  assert.match(
    entries.get("xl/worksheets/sheet1.xml"),
    /<c r="A3" s="4"><v>0<\/v><\/c>/,
  );
});
