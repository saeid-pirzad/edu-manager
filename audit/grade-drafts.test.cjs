"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../assets/scripts/grade-drafts.js"),
    "utf8",
  ),
  context,
);
const draft = (value) => ({ kind: "k", value });
const row = (generation, value, suffix = "one") => ({
  key: "Edu24.drafts.w1.tab1." + suffix,
  generation,
  entries: value === null ? [] : [draft(value)],
  updatedAt: "2026-10-25T00:00:00Z",
});
const select = (rows, stored = []) =>
  JSON.parse(
    JSON.stringify(
      context.EduGradeDrafts.portableGradeDrafts(rows, [{ id: "w1" }], stored),
    ),
  );

test("draft selection keeps newest generation per tab and separates independent tabs", () => {
  const other = { ...row(1, "17"), key: "Edu24.drafts.w1.tab2.one" };
  const selected = select([row(1, "10"), row(2, "18", "two"), other]);
  assert.equal(selected.length, 2);
  assert.equal(
    selected.find((item) => item.key.includes("tab1")).entries[0].value,
    "18",
  );
});
test("newer empty draft suppresses older values", () => {
  assert.deepEqual(select([row(1, "18"), row(2, null, "two")]), []);
});
test("drafts merge supplied local copies and prefer newer timestamps at equal generation", () => {
  const newer = { ...row(1, "19"), updatedAt: "2026-10-26T00:00:00Z" };
  assert.equal(
    select([row(1, "18")], [{ key: newer.key, value: newer }])[0].entries[0]
      .value,
    "19",
  );
});
test("drafts reject foreign periods, invalid generations and unsupported entries", () => {
  assert.deepEqual(
    select([
      { ...row(1, "18"), key: "Edu24.drafts.foreign.tab1.one" },
      row(-1, "18"),
      row(1.5, "18"),
      { ...row(1, "18"), entries: [{ kind: "unknown", value: "18" }] },
    ]),
    [],
  );
});
test("unfinished invalid grade stays in backup as a draft for later review", () => {
  assert.equal(select([row(1, "99")])[0].entries[0].value, "99");
  assert.equal(
    context.EduGradeDrafts.isSupportedGradeDraft(draft("x".repeat(101))),
    false,
  );
});
