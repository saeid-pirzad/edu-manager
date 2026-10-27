"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({ structuredClone });
// Deliberately no DOM, storage or legacy-ui script in this context.
for (const file of ["grade-math.js", "data-boundary.js", "grade-policy.js"])
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../assets/scripts", file), "utf8"),
    context,
  );
const policy = context.EduPolicy;
test("general subjects need one grade, preserve zero and do not use vocational weighting", () => {
  const p = { ...policy.defaults("dual", "1405-1406"), subjectType: "general" };
  assert.equal(policy.validate(p), true);
  assert.equal(policy.dual(p, null, 0).final, 0);
  assert.equal(policy.dual(p, null, 0).complete, true);
  assert.equal(policy.dual(p, 20, 12).final, 12);
  assert.equal(policy.dual(p, 20, null).complete, false);
  assert.equal(policy.dual(p, 20, null).final, null);
  assert.equal(policy.dual(p, null, 8).passed, null);
  assert.throws(() => policy.validate({ ...p, method: "modular" }));
});

test("grade domain works independently and respects the exact passing boundary", () => {
  const p = policy.defaults("dual", "1405-1406");
  assert.equal(policy.dual(p, 20, 0).final, 14);
  assert.equal(policy.dual(p, 20, 0).passed, true);
  assert.equal(policy.dual(p, 19.999999, 0).passed, false);
  assert.equal(policy.dual(p, 18, 12).final, 16.2);
});
test("grade math preserves tiny finite imported grades and rejects zero denominators", () => {
  const p = policy.defaults("dual", "1405-1406");
  for (const value of [1e-100, Number.MIN_VALUE])
    assert.equal(policy.dual(p, value, value).final, value);
  assert.throws(() => context.finiteRatio(1n, 0n));
  assert.equal(context.finiteRatio(-1n, 2n), -0.5);
});
test("grade domain parses Persian digits and keeps missing grades incomplete", () => {
  const p = policy.defaults("dual", "1405-1406");
  assert.equal(policy.parse("۱۸٫۵", p, "practical", "k").value, 18.5);
  assert.equal(policy.parse("۲۱", p, "practical", "k").ok, false);
  assert.equal(policy.dual(p, null, 18).complete, false);
});
test("score records cannot inherit grades or accept reserved identifiers", () => {
  const source = Object.create({ student: { practical: 20 } });
  assert.equal(context.ownScoreRecord(source, "student").practical, undefined);
  for (const id of ["__proto__", "constructor", "toString", "prototype"])
    assert.equal(context.isSafeRecordId(id), false);
  assert.throws(() =>
    context.assertSafeDataTree(JSON.parse('{"__proto__": {"polluted": true}}')),
  );
});
test("modular grading requires competency and honors missing input", () => {
  const p = policy.defaults("modular", "1405-1406");
  assert.equal(policy.moduleResult(p, { m: 2, c: 2 }).final, 12);
  assert.equal(policy.moduleResult(p, { m: 5, c: 1 }).passed, false);
  assert.equal(policy.moduleResult(p, { m: 5 }).complete, false);
});
test("legacy gate settings cannot block a completed module or change its score", () => {
  const p = { ...policy.defaults("modular", "1405-1406"), requireGate: true };
  for (const gate of [undefined, false, true]) {
    const result = policy.moduleResult(p, { m: 5, c: 3, gate });
    assert.equal(result.complete, true);
    assert.equal(result.final, 20);
    assert.equal(result.passed, true);
  }
  assert.equal(policy.moduleResult(p, {}).reason, "نمره‌ای ثبت نشده");
  assert.equal(policy.moduleResult(p, { c: 2 }).reason, "مستمر ثبت نشده");
  assert.equal(policy.moduleResult(p, { m: 0 }).reason, "شایستگی ثبت نشده");
  assert.equal(policy.moduleResult(p, { m: 0, c: 2 }).complete, true);
});
