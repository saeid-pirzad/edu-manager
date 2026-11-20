"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const alert = { textContent: "" },
    rendered = [],
    c = vm.createContext({
      filters: {
        mode: "weekly",
        date: "2026-11-20",
        startDate: "2026-11-14",
        endDate: "2026-11-20",
      },
      last: { signature: "prepared-report" },
      root: { render: () => rendered.push(true) },
      document: {
        getElementById: (id) => (id === "periodicError" ? alert : null),
      },
    });
  for (const name of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/reporting/date-ranges.js",
    "reports/periodic/generate.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
      c,
      { filename: name },
    );
  Object.assign(c, c.EduReportDates);
  return { c, alert, rendered };
}

for (const [key, value] of [
  ["date", "0001-01-01"],
  ["startDate", "9999-12-31"],
  ["date", "0000-01-01"],
])
  test(
    "unsupported report date interval preserves existing filters: " +
      key +
      "=" +
      value,
    () => {
      const { c, alert, rendered } = fixture(),
        before = JSON.stringify(c.filters),
        prepared = c.last;
      assert.doesNotThrow(() => c.set(key, value));
      assert.ok(alert.textContent);
      assert.equal(JSON.stringify(c.filters), before);
      assert.equal(c.last, prepared);
      assert.deepEqual(rendered, []);
    },
  );

test("valid calendar selection publishes a complete weekly interval together", () => {
  const { c, alert, rendered } = fixture();
  c.set("date", "2026-11-23");
  assert.deepEqual(JSON.parse(JSON.stringify(c.filters)), {
    mode: "weekly",
    date: "2026-11-23",
    startDate: "2026-11-21",
    endDate: "2026-11-27",
  });
  assert.equal(c.last, null);
  assert.equal(alert.textContent, "");
  assert.deepEqual(rendered, [true]);
});

test("a complete final ISO week remains supported at year 9999", () => {
  const { c, alert, rendered } = fixture();
  c.set("date", "9999-12-31");
  assert.equal(c.filters.date, "9999-12-31");
  assert.equal(c.filters.startDate, "9999-12-25");
  assert.equal(c.filters.endDate, "9999-12-31");
  assert.equal(alert.textContent, "");
  assert.deepEqual(rendered, [true]);
});
