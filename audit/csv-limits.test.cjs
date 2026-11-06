"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const c = vm.createContext({
    normalizedName: (value) => value.trim(),
    knownStudents: (cls) => cls.students,
    asciiDigits: (value) => String(value || "").trim(),
    studentIdentity: (name, code) => ({ name, code }),
    esc: String,
  });
  for (const name of [
    "domain/csv-parser.js",
    "workspace/students/csv-import.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
      c,
    );
  return c;
}
test("CSV parser stops at the row ceiling before parsing a malformed tail", () => {
  const c = fixture();
  assert.throws(
    () => c.parseCSV('name\none\ntwo\n"unfinished', { maxRows: 2 }),
    (error) => error.code === "CSV_ROW_LIMIT",
  );
});
test("CSV parser row ceiling counts logical nonblank records, not quoted newlines", () => {
  const c = fixture();
  const rows = c.parseCSV('name\n\n"one\ntwo"\n\r\n', { maxRows: 2 });
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], "one\ntwo");
  assert.throws(
    () => c.parseCSV("one\ntwo", { maxRows: 1 }),
    (error) => error.code === "CSV_ROW_LIMIT",
  );
});
test("CSV parser rejects invalid configured row ceilings", () => {
  const c = fixture();
  for (const maxRows of [0, -1, 1.5, NaN, "2"])
    assert.throws(() => c.parseCSV("name", { maxRows }));
});
test("class CSV accepts 500 records and rejects the 501st before preview", () => {
  const c = fixture(),
    text =
      "نام,کد\n" +
      Array.from({ length: 500 }, (_, i) => `Student ${i},${i}`).join("\n"),
    cls = { name: "Class", students: [] };
  assert.equal(c.csvPlan(text, cls).length, 500);
  assert.throws(() => c.csvPlan(text + "\nExtra,501", cls), /۵۰۰/);
  assert.equal(cls.students.length, 0);
});
test("small whole-school CSV cannot amplify into an unbounded mobile preview", () => {
  const c = fixture(),
    text =
      "نام,کد\n" +
      Array.from({ length: 10000 }, (_, i) => `Student ${i},${i}`).join("\n");
  assert.ok(Buffer.byteLength(text) < 5 * 1024 * 1024);
  assert.throws(() => c.csvPlan(text, { students: [] }), /۵۰۰/);
  assert.throws(
    () => c.csvPreviewHtml(new Array(501), { name: "Class" }, "school.csv"),
    /۵۰۰/,
  );
});
