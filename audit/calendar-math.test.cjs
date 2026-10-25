"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/scripts/calendar-math.js"), "utf8"), context);
const toJalali = (...args) => Array.from(context.gregorianToJalali(...args));
const toGregorian = (...args) => Array.from(context.jalaliToGregorian(...args));

test("calendar converts Nowruz and leap Esfand reference dates in both directions", () => {
  for (const [gregorian, jalali] of [
    [[2024, 3, 20], [1403, 1, 1]],
    [[2025, 3, 20], [1403, 12, 30]],
    [[2025, 3, 21], [1404, 1, 1]],
    [[2026, 3, 21], [1405, 1, 1]],
    [[2026, 10, 25], [1405, 8, 3]],
  ]) {
    assert.deepEqual(toJalali(...gregorian), jalali);
    assert.deepEqual(toGregorian(...jalali), gregorian);
  }
});

test("calendar agrees with Intl Persian calendar and round-trips every day from 2000 through 2050", () => {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric",
  });
  for (let timestamp = Date.UTC(2000, 0, 1); timestamp < Date.UTC(2051, 0, 1); timestamp += 86400000) {
    const date = new Date(timestamp);
    const gregorian = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    const expected = [Number(parts.year), Number(parts.month), Number(parts.day)];
    const actual = toJalali(...gregorian);
    assert.deepEqual(actual, expected, date.toISOString());
    assert.deepEqual(toGregorian(...actual), gregorian, date.toISOString());
  }
});
