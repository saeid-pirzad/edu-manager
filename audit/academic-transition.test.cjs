"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const c = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/periods/install.js"),
      "utf8",
    ),
    c,
  );
  return c;
}
test("a year starts with its first term, and its second can only follow a closed first term", () => {
  const c = fixture(),
    first = {
      id: "first",
      year: "1405-1406",
      term: "اول",
      revision: 5,
      closed: false,
    };
  assert.equal(c.validateAcademicTransition([], "1405-1406", "اول"), null);
  assert.throws(() => c.validateAcademicTransition([], "1405-1406", "دوم"));
  assert.throws(
    () => c.validateAcademicTransition([first], "1405-1406", "دوم"),
    /ببندید/,
  );
  first.closed = true;
  assert.equal(
    c.validateAcademicTransition([first], "1405-1406", "دوم").id,
    "first",
  );
  assert.throws(() =>
    c.validateAcademicTransition([first], "1406-1407", "دوم"),
  );
});
test("a year has only two unique terms regardless of display labels or obsolete backup-source metadata", () => {
  const c = fixture(),
    first = {
      year: "1405-1406",
      term: "عنوان سفارشی",
      termKind: "first",
      reportSource: "secondary",
      closed: true,
    };
  assert.throws(
    () => c.validateAcademicTransition([first], "1405-1406", "اول"),
    /قبلاً/,
  );
  assert.throws(
    () => c.validateAcademicTransition([], "1405-1406", "تابستان"),
    /فقط/,
  );
  const second = { year: first.year, term: "دوم", closed: false };
  assert.throws(
    () => c.validateAcademicTransition([first, second], first.year, "دوم"),
    /قبلاً/,
  );
  assert.throws(() =>
    c.validateAcademicTransition([second], first.year, "اول"),
  );
});
test("ambiguous old duplicate first terms are never silently selected as the source of second-term data", () => {
  const c = fixture(),
    first = { year: "1405-1406", term: "اول", closed: true };
  assert.throws(
    () =>
      c.validateAcademicTransition([first, { ...first }], first.year, "دوم"),
    /یک نوبت اول مشخص/,
  );
});
