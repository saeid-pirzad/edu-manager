"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const writes = [],
    errors = [];
  const candidate = {
    schools: [],
    sessions: [],
    settings: { academicYear: "1405-1406", academicTerm: "اول" },
  };
  const c = vm.createContext({
    workspace: { id: "first", revision: 1, year: "1405-1406", term: "اول" },
    db: structuredClone(candidate),
    pendingImport: {
      workspace: "first",
      revision: 1,
      candidate,
      label: "fixture",
    },
    fileMode: false,
    busy: 0,
    writer: Promise.resolve(),
    drafts: new Map(),
    document: {
      getElementById: (id) =>
        id === "restoreMode" ? { value: "current" } : { checked: true },
    },
    confirm: () => true,
    normalizeDB: structuredClone,
    validateV24: () => true,
    flushDrafts: async () => {},
    putBackup: async () => {},
    collectRecords: (x) => x,
    commitRecords: async (x) => writes.push(x),
    paintStatus() {},
    storeDrafts() {},
    closeModal() {},
    setStatus() {},
    render() {},
    handleError: (e) => errors.push(e),
    assertWorkspaceContext: (target, { write } = {}) => {
      if (
        c.workspace.id !== target.id ||
        c.workspace.revision !== target.revision ||
        (write && c.workspace.closed)
      )
        throw Error("stale context");
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/period-import.js"),
      "utf8",
    ),
    c,
  );
  return { c, writes, errors };
}
test("replacement import aborts before writing if workspace changes during draft flush", async () => {
  const { c, writes } = fixture();
  c.flushDrafts = async () => {
    c.workspace = { ...c.workspace, id: "second" };
  };
  await assert.rejects(c.confirmImport(), /stale/);
  assert.equal(writes.length, 0);
});
test("replacement import aborts if revision changes while pre-restore backup is being written", async () => {
  const { c, writes } = fixture();
  c.putBackup = async () => {
    c.workspace.revision++;
  };
  await assert.rejects(c.confirmImport(), /stale/);
  assert.equal(writes.length, 0);
});
test("replacement validates the target-year candidate before making a backup or writing", async () => {
  const { c, writes } = fixture();
  let backups = 0;
  c.putBackup = async () => backups++;
  c.validateV24 = () => {
    throw Error("policy year mismatch");
  };
  await assert.rejects(c.confirmImport(), /policy year/);
  assert.equal(backups, 0);
  assert.equal(writes.length, 0);
});
test("concurrent replacement cannot commit the same preview twice", async () => {
  const { c, writes } = fixture();
  let unblock;
  c.flushDrafts = () =>
    new Promise((resolve) => {
      unblock = resolve;
    });
  const first = c.confirmImport();
  await assert.rejects(c.confirmImport());
  unblock();
  await first;
  assert.equal(writes.length, 1);
  assert.equal(c.pendingImport, null);
});
test("a replacement preview rejected by the dirty-modal guard does not replace the accepted preview", () => {
  const { c } = fixture(),
    previous = c.pendingImport;
  c.esc = String;
  c.showModal = () => false;
  c.previewImport(
    { schools: [], sessions: [], settings: { academicYear: "1405-1406" } },
    "rejected",
  );
  assert.equal(c.pendingImport, previous);
});
test("full-backup preview also preserves the accepted source when modal replacement is declined", () => {
  let accepted = true;
  const c = vm.createContext({
    EduFullBackupValidator: { create: () => () => [{}] },
    backupStores: [],
    assertSafeDataTree() {},
    isDataObject() {},
    isSafeRecordId() {},
    validateReportNotes() {},
    decodeWorkspaceRecords() {},
    validateFrozenReport() {},
    normalizeDB() {},
    validatedUndoCandidate() {},
    isSupportedGradeDraft() {},
    showModal: () => accepted,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/full-restore.js"),
      "utf8",
    ),
    c,
  );
  const first = { gradeDrafts: [] },
    second = { gradeDrafts: [] };
  c.previewFullBackup(first);
  accepted = false;
  c.previewFullBackup(second);
  assert.equal(vm.runInContext("pendingFullBackup", c), first);
});
