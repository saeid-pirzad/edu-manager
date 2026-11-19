"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const context = vm.createContext({ Blob, TextEncoder });
vm.runInContext(
  fs.readFileSync("src/reports/periodic/xlsx-workbook.js", "utf8"),
  context,
);
async function workbook(sheets) {
  const bytes = Buffer.from(await context.xlsxWorkbook(sheets).arrayBuffer()),
    parts = new Map();
  let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(at + 8), 0);
    const length = bytes.readUInt16LE(at + 26),
      extra = bytes.readUInt16LE(at + 28),
      size = bytes.readUInt32LE(at + 18),
      start = at + 30 + length + extra;
    parts.set(
      bytes.subarray(at + 30, at + 30 + length).toString("utf8"),
      bytes.subarray(start, start + size).toString("utf8"),
    );
    at = start + size;
  }
  assert.equal(bytes.readUInt32LE(at), 0x02014b50);
  return {
    parts,
    sheet: parts.get("xl/worksheets/sheet1.xml"),
    styles: [
      ...parts
        .get("xl/styles.xml")
        .match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1]
        .matchAll(/<xf\b[^>]*>[\s\S]*?<\/xf>/g),
    ].map((match) => match[0]),
  };
}
function cell(sheet, ref) {
  const match = sheet.match(
    new RegExp('<c r="' + ref + '" s="(\\d+)"([^>]*)>([\\s\\S]*?)</c>'),
  );
  assert.ok(match, "missing cell " + ref);
  return { style: Number(match[1]), attributes: match[2], body: match[3] };
}
function decodeText(body) {
  // Independent, single-pass SpreadsheetML escape decoding after XML entities.
  return body
    .match(/<t[^>]*>([\s\S]*?)<\/t>/)[1]
    .replace(/&#13;/g, "\r")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}
test("entry columns opt into Excel Text before typing; blank cells and column defaults share it", async () => {
  const book = await workbook([
    {
      name: "سؤال‌ها",
      rows: [
        ["متن", "پاسخ"],
        ["", ""],
      ],
      entryRows: 3,
      columnStyles: [
        { format: "text", direction: "context" },
        { format: "text", direction: "context" },
      ],
    },
  ]);
  assert.equal(cell(book.sheet, "A1").style, 1);
  for (const ref of ["A2", "B2", "A3", "B3", "A4", "B4"]) {
    const entry = cell(book.sheet, ref),
      style = book.styles[entry.style];
    assert.match(style, /numFmtId="49"/);
    assert.match(style, /borderId="1"/);
    assert.match(style, /horizontal="general"/);
    assert.match(style, /wrapText="1" readingOrder="0"/);
    assert.equal(decodeText(entry.body), "");
  }
  assert.notEqual(cell(book.sheet, "A2").style, cell(book.sheet, "A3").style);
  assert.equal(cell(book.sheet, "A2").style, cell(book.sheet, "A4").style);
  assert.equal(book.styles.length, 14, "identical column styles are reused");
  const defaults = [...book.sheet.matchAll(/<col\b[^>]*style="(\d+)"/g)];
  assert.equal(defaults.length, 2);
  for (const match of defaults)
    assert.equal(Number(match[1]), cell(book.sheet, "A2").style);
});
test("technical literals remain inline text, never formulas or implicit date/numeric values", async () => {
  const values = [
      "001",
      "1/2",
      "1e3",
      "1405/08/25",
      '=HYPERLINK("https://example.invalid", "x")',
      "+1+2",
      "@SUM(A1:A2)",
      0,
    ],
    book = await workbook([
      {
        name: "entry",
        rows: [values.map((_, i) => "C" + i), values],
        columnStyles: values.map(() => ({ format: "text" })),
      },
    ]);
  for (const [index, value] of values.entries()) {
    const entry = cell(book.sheet, String.fromCharCode(65 + index) + "2");
    assert.match(entry.attributes, /t="inlineStr"/);
    assert.equal(decodeText(entry.body), String(value));
    assert.match(book.styles[entry.style], /numFmtId="49"/);
  }
  assert.doesNotMatch([...book.parts.values()].join(""), /<f[ >]|externalLink/);
});
test("XML and SpreadsheetML escaping preserves mixed code, whitespace and literal escape sequences", async () => {
  const value =
      '  خروجی زیر چیست؟\r\n\tconst Value = "001";\n  console.log("<A>&", Value);\r\n_x0041_ _x005F_ _x005F_x0042_\u0001  ',
    book = await workbook([
      {
        name: "entry",
        rows: [["متن"], [value]],
        columnStyles: [{ format: "text", direction: "context" }],
      },
    ]),
    entry = cell(book.sheet, "A2");
  assert.match(entry.body, /xml:space="preserve"/);
  assert.match(entry.body, /&#13;\n/);
  assert.match(entry.body, /_x005F_x0041_/);
  assert.match(entry.body, /_x0001_/);
  assert.equal(decodeText(entry.body), value);
});
test("context, LTR and RTL entry directions are explicit without changing report defaults", async () => {
  const book = await workbook([
    {
      name: "entry",
      rows: [
        ["auto", "ltr", "rtl", "report"],
        ["A", "B", "پ", 0],
      ],
      columnStyles: [
        { direction: "context" },
        { direction: "ltr" },
        { direction: "rtl" },
      ],
    },
    {
      name: "report",
      rows: [
        ["code", "grade"],
        ["001", 0],
      ],
    },
  ]);
  for (const [ref, alignment, order] of [
    ["A2", "general", 0],
    ["B2", "left", 1],
    ["C2", "right", 2],
  ]) {
    const style = book.styles[cell(book.sheet, ref).style];
    assert.match(style, new RegExp('horizontal="' + alignment + '"'));
    assert.match(style, new RegExp('readingOrder="' + order + '"'));
  }
  assert.equal(cell(book.sheet, "D2").style, 3);
  const report = book.parts.get("xl/worksheets/sheet2.xml");
  assert.equal(cell(report, "A2").style, 0);
  assert.equal(cell(report, "B2").style, 3);
  assert.doesNotMatch(report, /<col\b[^>]* style=/);
  assert.match(
    book.styles[0],
    /numFmtId="0".*horizontal="right".*readingOrder="2"/,
  );
  assert.match(
    book.styles[3],
    /numFmtId="164".*horizontal="center".*readingOrder="2"/,
  );
});
test("invalid entry-column metadata fails before producing an ambiguous workbook", () => {
  for (const columnStyles of [
    "text",
    ["text"],
    [{ format: "date" }],
    [{ direction: "auto" }],
    [{ format: "text" }, { format: "text" }],
  ])
    assert.throws(
      () =>
        context.xlsxWorkbook([
          { name: "entry", rows: [["text"], ["x"]], columnStyles },
        ]),
      /قالب ستون/,
    );
});
