"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const context = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/domain/revision.js"), "utf8"),
    context,
  );
  return context.EduRevision;
}

for (const [current, expected] of [
  [0, 1],
  [1, 2],
  [1234, 1235],
  [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER],
])
  test(`revision ${current} advances exactly once`, () => {
    const value = fixture().next(current);
    assert.equal(value, expected);
    assert.equal(Number.isSafeInteger(value), true);
  });

for (const value of [
  -1,
  0.5,
  NaN,
  Infinity,
  "1",
  null,
  undefined,
  9007199254740992,
])
  test(`invalid revision ${String(value)} never produces a new counter`, () => {
    assert.throws(() => fixture().next(value), { code: "REVISION_INVALID" });
  });

test("an exhausted safe revision rejects instead of persisting an unsafe integer", () => {
  assert.throws(() => fixture().next(Number.MAX_SAFE_INTEGER), {
    code: "REVISION_LIMIT_REACHED",
  });
});

test("the revision API is immutable and only exposes exact counter advancement", () => {
  const revision = fixture();
  assert.equal(Object.isFrozen(revision), true);
  assert.deepEqual(Object.keys(revision), ["next"]);
});
