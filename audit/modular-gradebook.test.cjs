"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/ui/course/table-api.js"),
  "utf8",
);
function fixture() {
  const c = vm.createContext({});
  vm.runInContext(
    source.slice(0, source.indexOf("installCourseTableEvents();")),
    c,
  );
  return c;
}
test("module picker only reveals the selected panel and preserves the existing grade input", () => {
  const context = fixture();
  const grade = { value: "3.5" };
  const panels = ["one", "two"].map((id) => ({
    dataset: { modulePanel: id },
    hidden: id !== "one",
    grade,
  }));
  const search = { value: "رضایی" },
    message = { hidden: false };
  const rows = [{ hidden: true }, { hidden: true }];
  const root = {
    dataset: { moduleSelectionKey: "lesson-key" },
    querySelectorAll: (selector) =>
      selector === "[data-module-panel]" ? panels : rows,
    querySelector: (selector) =>
      selector === "[data-assessment-search]" ? search : message,
  };
  context.selectGradeModule({ value: "two", closest: () => root });
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[1].hidden, false);
  assert.equal(grade.value, "3.5");
  assert.equal(search.value, "");
  assert.equal(
    rows.every((row) => !row.hidden),
    true,
  );
  assert.equal(
    vm.runInContext('selectedGradeModules.get("lesson-key")', context),
    "two",
  );
  context.selectGradeModule({ value: "missing", closest: () => root });
  assert.equal(panels[1].hidden, false);
});
test("module selection is isolated by workspace, class and lesson", () => {
  const context = fixture();
  let id = "first";
  context.api = { context: () => ({ id }) };
  const original = context.moduleSelectionKey(
    { id: "class" },
    { id: "lesson" },
  );
  id = "second";
  assert.notEqual(
    original,
    context.moduleSelectionKey({ id: "class" }, { id: "lesson" }),
  );
  id = "first";
  assert.notEqual(
    original,
    context.moduleSelectionKey({ id: "other" }, { id: "lesson" }),
  );
  assert.notEqual(
    original,
    context.moduleSelectionKey({ id: "class" }, { id: "other" }),
  );
});
