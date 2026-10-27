"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const c = vm.createContext({
    db: { settings: { weekStartDate: "2026-10-24" }, masterSchedule: {} },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/data/selectors.js"),
      "utf8",
    ),
    c,
  );
  return c;
}
test("Saturday origin and Friday in the same week retain odd parity", () => {
  const c = fixture();
  assert.equal(c.getWeekParity("2026-10-24"), "odd");
  assert.equal(c.getWeekParity("2026-10-30"), "odd");
});
test("previous and next week are even while two weeks later is odd", () => {
  const c = fixture();
  assert.equal(c.getWeekParity("2026-10-17"), "even");
  assert.equal(c.getWeekParity("2026-10-31"), "even");
  assert.equal(c.getWeekParity("2026-11-07"), "odd");
});
test("week parity remains continuous across a Gregorian year boundary", () => {
  const c = fixture();
  c.db.settings.weekStartDate = "2026-12-26";
  assert.equal(c.getWeekParity("2027-01-02"), "even");
});
test("matching alternating entry wins while weekly entry remains the fallback", () => {
  const c = fixture();
  c.db.masterSchedule = {
    "0-0-all": { id: "weekly" },
    "0-0-odd": { id: "alternate" },
  };
  assert.equal(c.getMasterEntry(0, 0, "2026-10-24").id, "alternate");
  assert.equal(c.getMasterEntry(0, 0, "2026-10-31").id, "weekly");
});
