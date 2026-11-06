"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const key = "EduManager.singleFileNames",
  root = path.resolve(__dirname, ".."),
  formatting = fs.readFileSync(
    path.join(root, "src/legacy/core/formatting.js"),
    "utf8",
  ),
  calendar = fs.readFileSync(path.join(root, "src/domain/calendar.js"), "utf8"),
  source = fs.readFileSync(
    path.join(root, "src/workspace/backups/single-file-name.js"),
    "utf8",
  );
function fixture(shared = new Map()) {
  const storage = {
    blocked: false,
    full: false,
    writes: 0,
    getItem(name) {
      if (this.blocked) throw Error("storage denied");
      return shared.get(name) ?? null;
    },
    setItem(name, value) {
      if (this.blocked) throw Error("storage denied");
      if (this.full) throw Error("quota exceeded");
      this.writes++;
      shared.set(name, value);
    },
  };
  const context = vm.createContext({ localStorage: storage });
  vm.runInContext(formatting, context);
  vm.runInContext(calendar, context);
  vm.runInContext(source, context);
  return {
    context,
    storage,
    shared,
    reserve(year = 2026, month = 10, day = 23) {
      return vm.runInContext(
        `reserveSingleFileName(new Date(${year}, ${month - 1}, ${day}, 23, 59, 59))`,
        context,
      );
    },
    ledger() {
      return JSON.parse(shared.get(key));
    },
  };
}

test("filename reservation is synchronous, ASCII, padded and uses the actual Jalali converter", () => {
  const f = fixture(),
    first = f.reserve();
  assert.equal(first.name, "MySchool-1405-08-01.json");
  assert.equal(typeof first.then, "undefined");
  assert.equal(typeof first.release, "function");
  assert.equal(f.storage.writes, 1);
  assert.equal(f.ledger().days["1405-08-01"].count, 1);
  assert.equal(f.reserve().name, "MySchool-1405-08-01-2.json");
  assert.equal(f.reserve().name, "MySchool-1405-08-01-3.json");
});
for (const [gregorian, expected] of [
  [[2025, 3, 20], "1403-12-30"],
  [[2025, 3, 21], "1404-01-01"],
  [[2026, 3, 20], "1404-12-29"],
  [[2026, 3, 21], "1405-01-01"],
  [[2026, 10, 22], "1405-07-30"],
  [[2026, 10, 23], "1405-08-01"],
  [[2026, 11, 21], "1405-08-30"],
  [[2026, 11, 22], "1405-09-01"],
])
  test("Jalali filename boundary " + expected, () => {
    assert.equal(
      fixture().reserve(...gregorian).name,
      "MySchool-" + expected + ".json",
    );
  });

test("dates have independent counters, including returning to an earlier day", () => {
  const f = fixture();
  assert.equal(f.reserve().name, "MySchool-1405-08-01.json");
  assert.equal(f.reserve(2026, 10, 24).name, "MySchool-1405-08-02.json");
  assert.equal(f.reserve().name, "MySchool-1405-08-01-2.json");
  assert.equal(f.reserve(2026, 10, 24).name, "MySchool-1405-08-02-2.json");
});
test("a reload and a second tab resume the durable daily counter", () => {
  const shared = new Map(),
    first = fixture(shared);
  assert.equal(first.reserve().name, "MySchool-1405-08-01.json");
  const reloaded = fixture(shared);
  assert.equal(reloaded.reserve().name, "MySchool-1405-08-01-2.json");
  assert.equal(first.reserve().name, "MySchool-1405-08-01-3.json");
  assert.equal(fixture(shared).reserve().name, "MySchool-1405-08-01-4.json");
});
test("cancellation releases only its latest reservation and is idempotent", () => {
  const f = fixture(),
    first = f.reserve();
  assert.equal(first.release(), true);
  assert.equal(first.release(), false);
  assert.equal(f.reserve().name, "MySchool-1405-08-01.json");
  const second = f.reserve();
  assert.equal(second.name, "MySchool-1405-08-01-2.json");
  assert.equal(second.release(), true);
  assert.equal(f.reserve().name, "MySchool-1405-08-01-2.json");
});
test("an older cancellation cannot roll back a later reservation in this page", () => {
  const f = fixture(),
    first = f.reserve(),
    second = f.reserve();
  assert.equal(first.release(), false);
  assert.equal(second.release(), true);
  assert.equal(first.release(), false);
  assert.equal(f.reserve().name, "MySchool-1405-08-01-2.json");
});
test("cancellation never undoes a newer reservation from another tab", () => {
  const shared = new Map(),
    first = fixture(shared),
    second = fixture(shared),
    pending = first.reserve();
  assert.equal(second.reserve().name, "MySchool-1405-08-01-2.json");
  assert.equal(pending.release(), false);
  assert.equal(first.reserve().name, "MySchool-1405-08-01-3.json");
});
test("ownership tokens protect a reused count from an obsolete release", () => {
  const f = fixture(),
    pending = f.reserve(),
    ledger = f.ledger();
  ledger.days["1405-08-01"].token = "another-tab";
  f.shared.set(key, JSON.stringify(ledger));
  assert.equal(pending.release(), false);
  assert.equal(f.ledger().days["1405-08-01"].token, "another-tab");
  assert.equal(f.reserve().name, "MySchool-1405-08-01-2.json");
});
test("release preserves another date reserved by a different tab", () => {
  const shared = new Map(),
    first = fixture(shared),
    pending = first.reserve(),
    second = fixture(shared);
  second.reserve(2026, 10, 24);
  assert.equal(pending.release(), true);
  assert.equal(first.ledger().days["1405-08-01"], undefined);
  assert.equal(first.ledger().days["1405-08-02"].count, 1);
});

for (const invalid of [
  "{invalid JSON",
  "null",
  "[]",
  '{"version":2,"days":{}}',
  '{"version":1,"days":[]}',
  " ".repeat(65537),
  '{"version":1,"days":{"1405-08-01":{"count":-1,"token":"bad"}}}',
  '{"version":1,"days":{"1405-08-01":{"count":1.5,"token":"bad"}}}',
  '{"version":1,"days":{"1405-08-01":{"count":9007199254740991,"token":"bad"}}}',
  '{"version":1,"days":{"1405-08-01":{"count":2,"token":null}}}',
])
  test(
    "invalid filename metadata does not block backup: " + invalid.slice(0, 65),
    () => {
      const f = fixture(new Map([[key, invalid]]));
      assert.equal(f.reserve().name, "MySchool-1405-08-01.json");
      assert.equal(f.reserve().name, "MySchool-1405-08-01-2.json");
    },
  );

test("denied local storage falls back to independent in-page reservations", () => {
  const f = fixture();
  f.storage.blocked = true;
  assert.equal(f.reserve().name, "MySchool-1405-08-01.json");
  const pending = f.reserve();
  assert.equal(pending.name, "MySchool-1405-08-01-2.json");
  assert.equal(pending.release(), true);
  assert.equal(f.reserve().name, "MySchool-1405-08-01-2.json");
  assert.equal(f.reserve(2026, 10, 24).name, "MySchool-1405-08-02.json");
  f.storage.blocked = false;
  assert.equal(f.reserve().name, "MySchool-1405-08-01-3.json");
  assert.equal(f.ledger().days["1405-08-01"].count, 3);
});
test("a full quota does not reuse in-page names when storage stays stale", () => {
  const f = fixture();
  f.reserve();
  f.storage.full = true;
  assert.equal(f.reserve().name, "MySchool-1405-08-01-2.json");
  assert.equal(f.reserve().name, "MySchool-1405-08-01-3.json");
  assert.equal(f.ledger().days["1405-08-01"].count, 1);
  f.storage.full = false;
  assert.equal(f.reserve().name, "MySchool-1405-08-01-4.json");
  assert.equal(f.ledger().days["1405-08-01"].count, 4);
});
test("a memory-only cancelled reservation does not consume another filename", () => {
  const f = fixture();
  f.reserve();
  f.storage.full = true;
  const pending = f.reserve();
  assert.equal(pending.release(), true);
  assert.equal(f.reserve().name, "MySchool-1405-08-01-2.json");
});
test("metadata is bounded and keeps the requested day even if device clock moves back", () => {
  const f = fixture();
  for (let day = 1; day <= 400; day++) f.reserve(2026, 1, day);
  assert.equal(Object.keys(f.ledger().days).length, 366);
  const old = f.reserve(2020, 1, 1);
  assert.equal(old.name, "MySchool-1398-10-11.json");
  assert.equal(Object.keys(f.ledger().days).length, 366);
  assert.equal(f.ledger().days["1398-10-11"].count, 1);
});
test("filename bookkeeping never serializes unrelated browser data", () => {
  const f = fixture(new Map([["educational-data", "private marks"]]));
  f.reserve();
  assert.equal(f.shared.get("educational-data"), "private marks");
  assert.deepEqual(Object.keys(f.ledger()).sort(), ["days", "version"]);
  assert.equal(f.shared.get(key).includes("private marks"), false);
});
