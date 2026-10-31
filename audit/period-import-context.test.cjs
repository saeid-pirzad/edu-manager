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
    connection: {},
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    busy: 0,
    writer: Promise.resolve(),
    drafts: new Map(),
    document: {
      getElementById: (id) =>
        id === "restoreMode" ? { value: "current" } : { checked: true },
    },
    confirm: () => true,
    normalizeDB: structuredClone,
    academicTermKind: (term) => ({ اول: "first", دوم: "second" })[term] || null,
    normalizedName: String,
    validateV24: () => true,
    flushDrafts: async () => {},
    putBackup: async () => {},
    collectRecords: (x) => x,
    commitRecords: async (x) => {
      writes.push(x);
      c.workspace.revision++;
      return true;
    },
    paintStatus() {},
    storeDrafts() {},
    closeModal() {},
    scheduleSingleFile() {},
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

test("replacement still rejects a preview whose source revision has advanced", async () => {
  const { c, writes } = fixture();
  c.workspace.revision++;
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
    esc: (value) => String(value),
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

test("period restore never installs an independent period even if an old client submits restoreMode=new", async () => {
  const { c, writes } = fixture();
  let installs = 0;
  c.installWorkspace = async () => installs++;
  await c.confirmImport();
  assert.equal(installs, 0);
  assert.equal(writes.length, 1);
});
test("a period backup cannot overwrite a different academic year or term", async () => {
  for (const settings of [
    { academicYear: "1406-1407", academicTerm: "اول" },
    { academicYear: "1405-1406", academicTerm: "دوم" },
  ]) {
    const { c, writes } = fixture();
    c.pendingImport.candidate.settings = settings;
    await assert.rejects(c.confirmImport(), /متعلق به نوبت فعلی نیست/);
    assert.equal(writes.length, 0);
  }
});

test("period replacement joins the writer until the restored data is installed", async () => {
  const { c } = fixture();
  let finish, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  c.commitRecords = async () => {
    entered();
    await new Promise((resolve) => {
      finish = resolve;
    });
    c.workspace.revision++;
    return true;
  };
  const restoring = c.confirmImport();
  await started;
  let completed = false;
  const pendingWrite = c.writer.then(() => {
    completed = true;
    assert.deepEqual(c.db, restoredCandidate);
  });
  const restoredCandidate = c.pendingImport.candidate;
  await Promise.resolve();
  assert.equal(completed, false);
  finish();
  await Promise.all([restoring, pendingWrite]);
  assert.equal(completed, true);
  assert.equal(c.db.settings.academicTerm, "اول");
  assert.equal(c.pendingImport, null);
  assert.equal(c.busy, 0);
});

for (const changedContext of [
  "workspace",
  "connection",
  "periodLoading",
  "resetBusy",
  "connectionRetired",
  "newer revision",
]) {
  test(`committed replacement never clobbers UI or drafts after ${changedContext} changes`, async () => {
    const { c } = fixture();
    const destination = { marker: "newer selected data" },
      destinationState = { view: "destination" },
      pendingDraft = { marker: "destination draft" };
    let effects = 0;
    c.closeModal =
      c.render =
      c.setStatus =
      c.scheduleSingleFile =
        () => effects++;
    c.commitRecords = async () => {
      if (changedContext === "workspace")
        c.workspace = { ...c.workspace, id: "second" };
      else if (changedContext === "connection") c.connection = {};
      else if (changedContext === "newer revision") c.workspace.revision += 2;
      else c[changedContext] = true;
      c.db = destination;
      c.state = destinationState;
      c.drafts.set("destination", pendingDraft);
      return true;
    };
    await c.confirmImport();
    assert.equal(c.db, destination);
    assert.equal(c.state, destinationState);
    assert.equal(c.drafts.get("destination"), pendingDraft);
    assert.equal(effects, 0);
    assert.equal(c.busy, 0);
  });
}
