"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture({ size, accepted = true, text, onConfirm } = {}) {
  const previews = [],
    confirmations = [],
    errors = [];
  let reads = 0;
  const full = { format: "EduManager.FullBackup", marker: "all history" };
  const input = {
    value: "chosen-file",
    files: [
      {
        name: "full-backup.json",
        size,
        async text() {
          reads++;
          return text ?? JSON.stringify(full);
        },
      },
    ],
  };
  const c = vm.createContext({
    ready: true,
    workspace: { id: "current" },
    connection: {},
    resetBusy: false,
    periodLoading: false,
    connectionRetired: false,
    fullRestoreBusy: false,
    pendingFullBackup: { stale: true },
    pendingFullBackupSignature: "stale",
    pendingImport: { stale: true },
    confirm(message) {
      confirmations.push(message);
      onConfirm?.(c);
      return accepted;
    },
    previewFullBackup: (value, details) => previews.push({ value, details }),
    legacyBackupReplacement: (value) => ({ ...full, legacy: value }),
    handleError: (error) => errors.push(error.message),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/period-import.js"),
      "utf8",
    ),
    c,
  );
  return {
    c,
    input,
    previews,
    confirmations,
    errors,
    reads: () => reads,
    run: () => c.handleImportV24({ target: input }),
  };
}

test("full backup above the former 100 MiB limit reaches preview only after consent", async () => {
  const f = fixture({ size: 113190260 });
  await f.run();
  assert.equal(f.confirmations.length, 1);
  assert.match(f.confirmations[0], /تا تأیید نهایی بازیابی/);
  assert.equal(f.reads(), 1);
  assert.equal(f.previews.length, 1);
  assert.equal(f.previews[0].value.marker, "all history");
  assert.equal(f.errors.length, 0);
  assert.equal(f.input.value, "");
});

test("declining a large backup neither reads it nor leaves a previous restore preview active", async () => {
  const f = fixture({ size: 113190260, accepted: false });
  await f.run();
  assert.equal(f.reads(), 0);
  assert.equal(f.previews.length, 0);
  assert.equal(f.errors.length, 0);
  assert.equal(f.c.pendingFullBackup, null);
  assert.equal(f.c.pendingFullBackupSignature, "");
  assert.equal(f.c.pendingImport, null);
  assert.equal(f.input.value, "");
  assert.equal(vm.runInContext("backupImportReading", f.c), false);
});

test("files at the old limit or below need no additional confirmation", async () => {
  for (const size of [1024, 100 * 1024 * 1024]) {
    const f = fixture({ size });
    await f.run();
    assert.equal(f.confirmations.length, 0);
    assert.equal(f.reads(), 1);
    assert.equal(f.previews.length, 1);
  }
});

test("large legacy files follow the same consent and full-replacement preview contract", async () => {
  const f = fixture({
    size: 113190260,
    text: JSON.stringify({ version: 25, db: { marker: "legacy data" } }),
  });
  await f.run();
  assert.equal(f.confirmations.length, 1);
  assert.equal(f.previews.length, 1);
  assert.equal(f.previews[0].value.legacy.db.marker, "legacy data");
  assert.equal(f.previews[0].details.legacy, true);
});

test("consent to a large file never bypasses parsing errors", async () => {
  const f = fixture({ size: 113190260, text: "not-json" });
  await f.run();
  assert.equal(f.reads(), 1);
  assert.equal(f.previews.length, 0);
  assert.equal(f.errors.length, 1);
  assert.equal(f.c.pendingFullBackup, null);
  assert.equal(f.input.value, "");
});

test("a destination changed during large-file consent is rejected before reading", async () => {
  const f = fixture({
    size: 113190260,
    onConfirm: (c) => {
      c.workspace.id = "other";
    },
  });
  await f.run();
  assert.equal(f.reads(), 0);
  assert.equal(f.previews.length, 0);
  assert.match(f.errors[0], /مقصد بازیابی/);
});

test("an unreadable large file reports the failure and releases the import gate", async () => {
  const f = fixture({ size: 113190260 });
  f.input.files[0].text = async () => {
    throw Error("Insufficient memory to read file");
  };
  await f.run();
  assert.equal(f.previews.length, 0);
  assert.match(f.errors[0], /Insufficient memory/);
  assert.equal(f.input.value, "");
  assert.equal(vm.runInContext("backupImportReading", f.c), false);
});
