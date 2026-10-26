"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../assets/scripts/workspace-records.js"),
    "utf8",
  ),
  context,
);
const codec = context.EduWorkspaceRecords.create({
  clone: structuredClone,
  normalizeDB: (value) => value,
  isDataObject: (value) =>
    !!value && typeof value === "object" && !Array.isArray(value),
  isSafeRecordId: (value) =>
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,120}$/.test(value) &&
    !["__proto__", "prototype", "constructor"].includes(value),
});
const fixture = () => ({
  schemaVersion: 26,
  settings: { academicYear: "1405-1406" },
  schools: [
    {
      id: "s1",
      name: "مدرسه",
      classes: [
        { id: "c1", name: "کلاس", students: [] },
        { id: "c2", students: [] },
      ],
    },
  ],
  sessions: [
    { id: "a1", classId: "c1" },
    { id: "a2", classId: "c2" },
  ],
});
const records = (data) =>
  Array.from(codec.collectRecords(data), ([logical, value]) => ({
    key: "w1|" + logical,
    workspace: "w1",
    logical,
    value,
  }));

test("workspace records round-trip Persian data and return detached values", () => {
  const data = fixture(),
    rows = records(data);
  const decoded = codec.decodeWorkspaceRecords(rows, { workspaceId: "w1" });
  assert.deepEqual(JSON.parse(JSON.stringify(decoded.data)), data);
  decoded.data.schools[0].classes[0].name = "changed";
  assert.equal(
    rows.find((row) => row.logical === "class:c1").value.name,
    "کلاس",
  );
  assert.equal(data.schools[0].classes[0].name, "کلاس");
});
test("workspace scoped writes include metadata and only the requested record", () => {
  assert.deepEqual(
    Array.from(codec.collectRecords(fixture(), { classId: "c1" }).keys()),
    ["meta", "class:c1"],
  );
  assert.deepEqual(
    Array.from(codec.collectRecords(fixture(), { sessionId: "a1" }).keys()),
    ["meta", "session:a1"],
  );
});
test("workspace decode rejects duplicate, missing and orphan records", () => {
  const rows = records(fixture());
  assert.throws(() => codec.decodeWorkspaceRecords([...rows, rows[0]]));
  assert.throws(() =>
    codec.decodeWorkspaceRecords(rows.filter((row) => row.logical !== "meta")),
  );
  assert.throws(() =>
    codec.decodeWorkspaceRecords(
      rows.filter((row) => row.logical !== "class:c1"),
    ),
  );
  assert.throws(() =>
    codec.decodeWorkspaceRecords([
      ...rows,
      { logical: "class:orphan", value: { id: "orphan" } },
    ]),
  );
});
test("workspace decode rejects ownership, key and identifier mismatches", () => {
  for (const mutate of [
    (rows) => {
      rows[0].workspace = "w2";
    },
    (rows) => {
      rows[0].key = "w2|meta";
    },
    (rows) => {
      rows[1].value.id = "wrong";
    },
    (rows) => {
      rows[1].logical = "class:__proto__";
    },
    (rows) => {
      rows[1].value = null;
    },
  ]) {
    const rows = records(fixture());
    mutate(rows);
    assert.throws(() =>
      codec.decodeWorkspaceRecords(rows, { workspaceId: "w1" }),
    );
  }
});
