"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
function fixture() {
  const rows = [
    { dataset: { search: "علی کریمی 001" }, hidden: false },
    { dataset: { search: "محمدرضا دانش‌آموز 002" }, hidden: false },
  ];
  const empty = { hidden: true };
  const root = { querySelectorAll: () => rows, querySelector: () => empty };
  const context = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/sessions/dialog.js"),
      "utf8",
    ),
    context,
  );
  const search = (value) =>
    context.filterSessionAttendance({ value, closest: () => root });
  return { rows, empty, search };
}
test("session attendance search normalizes Persian letter variants and spaces", () => {
  const { rows, empty, search } = fixture();
  search("  علي   كريمي  ");
  assert.deepEqual(
    rows.map((row) => row.hidden),
    [false, true],
  );
  assert.equal(empty.hidden, true);
  search("دانش آموز");
  assert.deepEqual(
    rows.map((row) => row.hidden),
    [true, false],
  );
});
test("session attendance search supports codes and restores rows without changing identities", () => {
  const { rows, empty, search } = fixture();
  const original = JSON.stringify(rows.map((row) => row.dataset));
  search("002");
  assert.deepEqual(
    rows.map((row) => row.hidden),
    [true, false],
  );
  search("missing");
  assert.ok(rows.every((row) => row.hidden));
  assert.equal(empty.hidden, false);
  search("");
  assert.ok(rows.every((row) => !row.hidden));
  assert.equal(empty.hidden, true);
  assert.equal(JSON.stringify(rows.map((row) => row.dataset)), original);
});
