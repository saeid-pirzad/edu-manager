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

function newPeriodFixture() {
  const f = fixture();
  f.c.document.getElementById = () => ({ value: "new" });
  f.c.uid = () => "fixture-id";
  f.c.recoveryPeriodTerm = (term) => term + " recovered";
  f.c.installWorkspace = async () => ({ id: "created" });
  f.c.switchPeriod = async () => {};
  return f;
}

test("new-period import retries navigation without installing a duplicate period", async () => {
  const { c } = newPeriodFixture();
  let installs = 0,
    switches = 0;
  c.installWorkspace = async () => {
    installs++;
    return { id: "created" };
  };
  c.switchPeriod = async (id) => {
    assert.equal(id, "created");
    if (++switches === 1) throw Error("read failure");
  };
  const preview = c.pendingImport;
  await assert.rejects(c.confirmImport(), /read failure/);
  assert.equal(c.pendingImport, preview);
  await c.confirmImport();
  assert.equal(installs, 1);
  assert.equal(switches, 2);
  assert.equal(c.pendingImport, null);
});

test("independent import can retry after its navigation flush advances source revision", async () => {
  const { c } = newPeriodFixture();
  let installs = 0,
    switches = 0;
  c.installWorkspace = async () => {
    installs++;
    return { id: "created" };
  };
  c.switchPeriod = async () => {
    if (++switches === 1) {
      c.workspace.revision++;
      throw Error("read failure after flush");
    }
  };
  await assert.rejects(c.confirmImport(), /read failure/);
  await c.confirmImport();
  assert.equal(installs, 1);
  assert.equal(switches, 2);
  assert.equal(c.pendingImport, null);
});

test("independent import tolerates source revision changes without replacing source data", async () => {
  const { c, writes } = newPeriodFixture();
  c.installWorkspace = async () => {
    c.workspace.revision++;
    return { id: "created" };
  };
  await c.confirmImport();
  assert.equal(writes.length, 0);
  assert.equal(c.pendingImport, null);
});

test("replacement still rejects a preview whose source revision has advanced", async () => {
  const { c, writes } = fixture();
  c.workspace.revision++;
  await assert.rejects(c.confirmImport(), /stale/);
  assert.equal(writes.length, 0);
});

test("independent import rechecks read access after installation", async () => {
  const { c } = newPeriodFixture();
  let switches = 0,
    readable = true;
  const check = c.assertWorkspaceContext;
  c.assertWorkspaceContext = (...args) => {
    if (!readable) throw Error("blocked");
    return check(...args);
  };
  c.installWorkspace = async () => {
    readable = false;
    return { id: "created" };
  };
  c.switchPeriod = async () => {
    switches++;
  };
  await assert.rejects(c.confirmImport(), /blocked/);
  assert.equal(switches, 0);
});
test("new-period import preserves a newer preview opened during navigation", async () => {
  const { c } = newPeriodFixture();
  const next = { label: "newer" };
  c.switchPeriod = async () => {
    c.pendingImport = next;
  };
  await c.confirmImport();
  assert.equal(c.pendingImport, next);
});
test("new-period import retains the created id when the source changes after installation", async () => {
  const { c } = newPeriodFixture();
  let switches = 0;
  const preview = c.pendingImport;
  c.installWorkspace = async () => {
    c.workspace.id = "second";
    return { id: "created" };
  };
  c.switchPeriod = async () => {
    switches++;
  };
  await assert.rejects(c.confirmImport(), /stale/);
  assert.equal(preview.createdWorkspace, "created");
  assert.equal(switches, 0);
});
test("failed new-period installation leaves the preview available for retry", async () => {
  const { c } = newPeriodFixture();
  const preview = c.pendingImport;
  c.installWorkspace = async () => {
    throw Error("quota");
  };
  await assert.rejects(c.confirmImport(), /quota/);
  assert.equal(c.pendingImport, preview);
  assert.equal(preview.createdWorkspace, undefined);
  c.installWorkspace = async () => ({ id: "retry" });
  await c.confirmImport();
  assert.equal(c.pendingImport, null);
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
