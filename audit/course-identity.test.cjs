"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({ structuredClone });
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/domain/grade-policy.js"),
    "utf8",
  ),
  context,
);
const policy = context.EduPolicy;
test("unspecified course grade remains empty and validates without a hidden tenth-grade default", () => {
  const defaults = policy.defaults("dual", "1405-1406");
  assert.equal(defaults.grade, "");
  assert.equal(policy.validate(defaults), true);
  assert.equal(policy.identity({}, "1405-1406").grade, "");
  assert.throws(() => policy.validate({ ...defaults, grade: "13" }));
});
test("course identity inherits only actual class metadata without inventing a code", () => {
  const identity = policy.identity({}, "1405-1406", {
    grade: "11",
    field: "کامپیوتر",
  });
  assert.equal(identity.grade, "11");
  assert.equal(identity.field, "کامپیوتر");
  assert.equal(identity.code, "");
  assert.equal(policy.identity({}, "1405-1406", { grade: "99" }).grade, "");
});
test("existing course identity takes priority over class defaults and is not mutated", () => {
  const lesson = {
    courseInfo: { grade: "12", field: "الکترونیک", code: "A-12" },
    gradingPolicy: {
      ...policy.defaults("modular", "1405-1406"),
      grade: "10",
      code: "historical",
    },
  };
  const before = JSON.stringify(lesson);
  const identity = policy.identity(lesson, "1405-1406", {
    grade: "11",
    field: "کامپیوتر",
  });
  assert.equal(identity.grade, "12");
  assert.equal(identity.field, "الکترونیک");
  assert.equal(identity.code, "A-12");
  assert.equal(JSON.stringify(lesson), before);
});
