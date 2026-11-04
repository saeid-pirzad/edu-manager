"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/domain/grade-drafts.js"),
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
const invalidDraft = (fn) =>
  assert.throws(fn, (error) => error.code === "GRADE_DRAFT_INVALID");

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
test("drafts ignore another workspace without interpreting its content", () => {
  assert.deepEqual(
    select([
      { ...row(1, "18"), key: "Edu24.drafts.foreign.tab1.one", entries: null },
    ]),
    [],
  );
});
test("unorderable draft metadata fails explicitly rather than silently reviving an older generation", () => {
  for (const bad of [
    row(-1, "18"),
    row(1.5, "18"),
    { ...row(3, "18"), updatedAt: 42 },
  ])
    invalidDraft(() => select([row(1, "10"), bad]));
});
test("unfinished invalid grades including long pasted text remain lossless in one draft row", () => {
  const long = "۹".repeat(101),
    latest = {
      ...row(2, "17"),
      entries: [{ ...draft("17"), review: true }, draft(long)],
    },
    before = JSON.stringify(latest),
    selected = select([row(1, "10"), latest]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].generation, 2);
  assert.deepEqual(
    selected[0].entries.map((item) => item.value),
    ["17", long],
  );
  assert.equal(selected[0].entries[0].review, true);
  assert.equal(JSON.stringify(latest), before);
  assert.equal(context.EduGradeDrafts.isSupportedGradeDraft(draft(long)), true);
  assert.equal(select([row(1, "99")])[0].entries[0].value, "99");
});
test("unsupported newest entries produce an explicit error instead of exporting an older value", () => {
  const bad = {
    ...row(2, "17"),
    entries: [{ kind: "future-kind", value: "17" }],
  };
  invalidDraft(() => select([row(1, "10"), bad]));
  invalidDraft(() => select([row(1, "10")], [{ key: bad.key, value: bad }]));
});
test("newest tombstones suppress unsupported older content before validating entries", () => {
  const bad = {
    ...row(1, "17"),
    entries: [{ kind: "future-kind", value: "17" }],
  };
  assert.deepEqual(select([bad, row(2, null, "two")]), []);
  assert.deepEqual(select([bad], [{ key: bad.key, value: row(2, null) }]), []);
});
test("malformed selected entry arrays fail explicitly without mutation", () => {
  for (const entries of [
    null,
    "17",
    undefined,
    [null],
    [{ kind: "k", value: 17 }],
  ]) {
    const newest = { ...row(2, "18"), entries },
      before = JSON.stringify(newest);
    invalidDraft(() => select([row(1, "10"), newest]));
    assert.equal(JSON.stringify(newest), before);
  }
});
test("legacy array drafts remain supported and newer tombstones prevent their resurrection", () => {
  const key = row(0, "17").key;
  assert.equal(
    select([], [{ key, value: [draft("17")] }])[0].entries[0].value,
    "17",
  );
  assert.deepEqual(select([row(1, null)], [{ key, value: [draft("17")] }]), []);
});
test("entry validation preserves the original long string and rejects an unsupported kind", () => {
  const values = [draft("17"), draft("x".repeat(1000))];
  assert.equal(context.EduGradeDrafts.assertEntries(values), values);
  invalidDraft(() =>
    context.EduGradeDrafts.assertEntries([
      draft("17"),
      { kind: "unknown", value: "" },
    ]),
  );
});
