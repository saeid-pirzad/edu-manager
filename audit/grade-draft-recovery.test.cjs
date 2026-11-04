"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const row = (generation, entries, suffix = "document") => ({
  key: "Edu24.drafts.year.tab." + suffix,
  workspace: "year",
  generation,
  entries,
  updatedAt: "2026-11-04T00:00:00Z",
});
const entry = (value) => ({
  kind: "k",
  classId: "class",
  lid: "lesson",
  sid: "student",
  field: "theory",
  value,
  baseRevision: 5,
});
function fixture(rows, local = {}) {
  const notices = [],
    writes = [],
    prunes = [],
    stored = Object.assign(Object.create(null), local);
  Object.defineProperties(stored, {
    getItem: {
      value(key) {
        return Object.hasOwn(this, key) ? this[key] : null;
      },
    },
    setItem: {
      value(key, value) {
        this[key] = String(value);
      },
    },
    removeItem: {
      value(key) {
        delete this[key];
      },
    },
  });
  const c = vm.createContext({
    structuredClone,
    workspace: { id: "year", revision: 5 },
    installationToken: "",
    connectionRetired: false,
    resetBusy: false,
    drafts: new Map(),
    draftGeneration: 0,
    draftRecoveryFailed: false,
    localStorage: stored,
    draftBaseKey: () => "Edu24.drafts.year.tab",
    setStatus: (...args) => notices.push(args),
    requestPromise: (value) => Promise.resolve(value),
    connection: {
      objectStoreNames: { contains: () => true },
      transaction: () => ({
        objectStore: () => ({
          index: () => ({ getAll: () => structuredClone(rows) }),
        }),
      }),
    },
  });
  for (const file of [
    "domain/grade-drafts.js",
    "workspace/drafts/persistence.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  c.storeDrafts = async () =>
    writes.push(structuredClone([...c.drafts.values()]));
  c.pruneGradeDrafts = async (values) => prunes.push(structuredClone(values));
  return { c, rows, stored, notices, writes, prunes };
}
test("recovery retains a reviewed numeric grade and long invalid raw value without truncation", async () => {
  const long = "۹".repeat(101),
    values = [entry("17"), { ...entry(long), sid: "student2" }],
    f = fixture([row(2, values)]);
  await f.c.loadDrafts();
  assert.deepEqual(
    [...f.c.drafts.values()].map((item) => item.value),
    ["17", long],
  );
  assert.equal(f.writes.length, 1);
  assert.equal(f.c.draftRecoveryFailed, false);
});
test("recovery refuses an unsupported newest row without writing or pruning its raw data", async () => {
  const newest = row(3, [{ ...entry("17"), kind: "future" }], "new"),
    f = fixture([row(1, [entry("10")], "old"), newest]);
  await f.c.loadDrafts();
  assert.equal(f.c.drafts.size, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.prunes.length, 0);
  assert.equal(f.c.draftRecoveryFailed, true);
  assert.match(f.notices.at(-1)[0], /پشتیبانی نمی‌شود/);
  assert.equal(newest.entries[0].value, "17");
});
test("a newest empty tombstone suppresses unsupported older entries before recovery validation", async () => {
  const f = fixture([
    row(1, [{ ...entry("10"), kind: "future" }], "old"),
    row(2, [], "new"),
  ]);
  await f.c.loadDrafts();
  assert.equal(f.c.drafts.size, 0);
  assert.equal(f.c.draftRecoveryFailed, false);
  assert.equal(f.writes.length, 1);
});
test("a malformed newest entry list cannot revive older valid grades", async () => {
  const f = fixture([row(1, [entry("10")], "old"), row(2, null, "new")]);
  await f.c.loadDrafts();
  assert.equal(f.writes.length, 0);
  assert.equal(f.c.draftRecoveryFailed, true);
  assert.match(f.notices.at(-1)[0], /فهرست ورودی/);
});
test("an unreadable local draft prevents fallback to an older durable grade and remains recoverable", async () => {
  const key = row(1, []).key,
    f = fixture([row(1, [entry("10")])], { [key]: "{broken" });
  await f.c.loadDrafts();
  assert.equal(f.writes.length, 0);
  assert.equal(f.prunes.length, 0);
  assert.equal(f.stored.getItem(key), "{broken");
  assert.equal(f.c.draftRecoveryFailed, true);
  assert.match(f.notices.at(-1)[0], /نسخهٔ قدیمی جایگزین آن نشد/);
});
test("unavailable local storage still permits recovery of a durable complete draft", async () => {
  const f = fixture([row(1, [entry("17")])]);
  f.c.localStorage = new Proxy(
    {},
    {
      ownKeys() {
        throw Error("local storage unavailable");
      },
    },
  );
  await f.c.loadDrafts();
  assert.equal([...f.c.drafts.values()][0].value, "17");
  assert.equal(f.writes.length, 1);
});
test("a similar tab prefix cannot import or block another tab's malformed draft", async () => {
  const other = { ...row(9, null), key: "Edu24.drafts.year.tab10.document" },
    f = fixture([row(1, [entry("17")]), other]);
  await f.c.loadDrafts();
  assert.equal([...f.c.drafts.values()][0].value, "17");
  assert.equal(f.c.draftRecoveryFailed, false);
});
