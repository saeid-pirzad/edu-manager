"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const effects = [];
  const row = {
    workspace: "first",
    label: "daily",
    at: "2026-10-27",
    db: { schools: [] },
  };
  const c = vm.createContext({
    workspace: { id: "first" },
    state: {},
    readable: true,
    assertWorkspaceReadable() {
      if (!c.readable) throw Error("unavailable");
    },
    readRecord: async () => row,
    normalizeDB: (value) => value,
    downloadJSON: (...args) => effects.push(["download", ...args]),
    showModal: (...args) => {
      effects.push(["preview", ...args]);
      return false;
    },
    previewFullBackup: (...args) => effects.push(["full", ...args]),
  });
  const read = (file) =>
    fs.readFileSync(path.join(__dirname, "../src/workspace", file), "utf8");
  vm.runInContext(read("core/async-target.js"), c);
  vm.runInContext(read("backups/period-import.js"), c);
  // Isolate the read/selection boundary from preview HTML rendering.
  c.previewImport = (...args) => effects.push(["period", ...args]);
  return { c, row, effects };
}

for (const operation of ["downloadInternalBackup", "previewInternalBackup"]) {
  for (const full of [false, true]) {
    test(`${operation} rejects navigation while reading ${full ? "full" : "period"} backup`, async () => {
      const f = fixture();
      if (full) f.row.full = { format: "EduManager.FullBackup" };
      f.c.readRecord = async () => {
        f.c.workspace.id = "second";
        return f.row;
      };
      await assert.rejects(f.c[operation]("backup"));
      assert.equal(f.effects.length, 0);
    });
  }
  test(`${operation} rejects another period's backup`, async () => {
    const f = fixture();
    f.row.workspace = "other";
    await assert.rejects(f.c[operation]("backup"));
    assert.equal(f.effects.length, 0);
  });
  test(`${operation} reports a missing backup`, async () => {
    const f = fixture();
    f.c.readRecord = async () => undefined;
    await assert.rejects(f.c[operation]("missing"));
    assert.equal(f.effects.length, 0);
  });
  test(`${operation} rechecks readability after storage read`, async () => {
    const f = fixture();
    f.c.readRecord = async () => {
      f.c.readable = false;
      return f.row;
    };
    await assert.rejects(f.c[operation]("backup"), /unavailable/);
    assert.equal(f.effects.length, 0);
  });
  for (const owner of ["first", null]) {
    test(`${operation} accepts ${owner === null ? "legacy installation" : "current period"} backup`, async () => {
      const f = fixture();
      f.row.workspace = owner;
      await f.c[operation]("backup");
      assert.equal(f.effects.length, 1);
      assert.equal(
        f.effects[0][0],
        operation === "previewInternalBackup" ? "period" : "download",
      );
    });
  }
  test(`${operation} retains full-backup routing`, async () => {
    const f = fixture();
    f.row.full = { format: "EduManager.FullBackup" };
    await f.c[operation]("backup");
    assert.equal(f.effects.length, 1);
    assert.equal(
      f.effects[0][0],
      operation === "previewInternalBackup" ? "full" : "download",
    );
  });
}
