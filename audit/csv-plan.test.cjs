"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  let lookups = 0;
  const c = vm.createContext({
    knownStudents: (cls) => {
      lookups++;
      return [...cls.students, ...cls.archivedStudents];
    },
    recordFieldError: (message) => Error(message),
  });
  for (const name of [
    "domain/csv-parser.js",
    "legacy/students/archive.js",
    "workspace/domain/defaults-numbers.js",
    "workspace/students/editor.js",
    "workspace/students/csv-import.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
      c,
    );
  const cls = {
    students: [{ id: "active", name: "علی کریمی", code: "001" }],
    archivedStudents: [{ id: "archived", name: "رضا", code: "002" }],
  };
  return {
    c,
    cls,
    get lookups() {
      return lookups;
    },
  };
}
for (const header of ["نام,نام خانوادگی", "کد,کد هنرجو,نام"]) {
  test(`ambiguous CSV columns are rejected: ${header}`, () => {
    const f = fixture();
    assert.throws(
      () =>
        f.c.csvPlan(
          header +
            "\n" +
            header
              .split(",")
              .map(() => "x")
              .join(","),
          f.cls,
        ),
      /مبهم/,
    );
  });
}
test("Persian and Arabic digits resolve existing active and archived student codes", () => {
  const f = fixture();
  const rows = f.c.csvPlan("کد,نام\n۰۰۱,علی\n٠٠٢,رضا", f.cls);
  assert.equal(rows[0].existingId, "active");
  assert.equal(rows[0].archived, false);
  assert.equal(rows[1].existingId, "archived");
  assert.equal(rows[1].archived, true);
  assert.equal(rows[1].choice, "skip");
});
test("equivalent Persian and Arabic names require review instead of automatic addition", () => {
  const f = fixture();
  const rows = f.c.csvPlan("نام\nعلي كريمي", f.cls);
  assert.equal(rows[0].duplicate, true);
  assert.equal(rows[0].choice, "skip");
});
test("same-name rows in the file are not silently merged or duplicated", () => {
  const f = fixture();
  const rows = f.c.csvPlan("نام\nهنرجوی جدید\nهنرجوی جدید", f.cls);
  assert.equal(rows[0].choice, "add");
  assert.equal(rows[1].choice, "skip");
  assert.equal(rows[1].existingId, null);
});
test("duplicate codes are detected after digit normalization", () => {
  const f = fixture();
  assert.throws(() => f.c.csvPlan("کد,نام\n123,یک\n۱۲۳,دو", f.cls), /تکراری/);
});
test("CSV plan indexes known students once without mutating class data", () => {
  const f = fixture();
  const before = JSON.stringify(f.cls);
  const rows = f.c.csvPlan(
    "کد,نام\n" +
      Array.from({ length: 500 }, (_, i) => `${i + 1000},Student ${i}`).join(
        "\n",
      ),
    f.cls,
  );
  assert.equal(rows.length, 500);
  assert.equal(f.lookups, 1);
  assert.equal(JSON.stringify(f.cls), before);
});
test("single name column without optional code remains supported", () => {
  const f = fixture();
  const rows = f.c.csvPlan("نام و نام خانوادگی\nهنرجوی جدید", f.cls);
  assert.equal(rows[0].code, "");
  assert.equal(rows[0].choice, "add");
});
