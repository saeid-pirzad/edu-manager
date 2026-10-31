"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const context = vm.createContext({});
const source = fs.readFileSync(
  path.join(__dirname, "../src/legacy/core/state.js"),
  "utf8",
);
vm.runInContext(
  source.slice(0, source.indexOf("function makeDefaultPoudmans")),
  context,
);
test("registration order preserves 1 through 20 despite reverse alphabetical names", () => {
  const students = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    code: String(i + 1),
    name: String.fromCharCode(90 - i),
  }));
  const result = context.getSortedStudents({ students });
  assert.deepEqual(
    Array.from(result, (s) => s.code),
    students.map((s) => s.code),
  );
  assert.notEqual(result, students);
  students[0].name = "Updated";
  students[0].code = "100";
  assert.deepEqual(
    Array.from(context.getSortedStudents({ students }), (s) => s.id),
    students.map((s) => s.id),
  );
});
test("arbitrary file order, leading zeros and missing codes never trigger implicit sorting", () => {
  const students = ["20", "003", "", "1", "۱۰"].map((code, i) => ({
    id: String(i),
    code,
    name: "Name " + i,
  }));
  assert.deepEqual(
    Array.from(context.getSortedStudents({ students }), (s) => s.code),
    students.map((s) => s.code),
  );
  assert.equal(context.getSortedStudents(null).length, 0);
});
