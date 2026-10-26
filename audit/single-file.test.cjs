"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  let contents = "",
    modified = 1,
    writes = 0,
    aborts = 0,
    fail = false;
  const handle = {
    name: "EduManager-data.json",
    getFile: async () => ({ size: contents.length, lastModified: modified }),
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    createWritable: async () => {
      let pending;
      return {
        write: async (value) => {
          if (fail) throw Error("disk full");
          pending = value;
        },
        close: async () => {
          contents = pending;
          modified++;
          writes++;
        },
        abort: async () => {
          aborts++;
        },
      };
    },
  };
  const context = vm.createContext({
    ready: true,
    blocked: false,
    resetBusy: false,
    connectionRetired: false,
    document: { getElementById: () => null },
    window: { showSaveFilePicker: async () => handle },
    navigator: {},
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    confirm: () => true,
    esc: String,
    setStatus() {},
    snapshotInstallation: async () => ({
      format: "EduManager.FullBackup",
      exportedAt: new Date().toISOString(),
      stores: { records: [{ value: 1 }] },
    }),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/backups/single-file.js"),
      "utf8",
    ),
    context,
  );
  context.persistSingleFile = async () => {};
  return {
    context,
    handle,
    get contents() {
      return contents;
    },
    get writes() {
      return writes;
    },
    get aborts() {
      return aborts;
    },
    externalEdit() {
      contents = "external";
      modified++;
    },
    failWrites() {
      fail = true;
    },
  };
}
test("single-file backup replaces the same JSON with additions, edits and deletions", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  assert.equal(JSON.parse(f.contents).stores.records[0].value, 1);
  f.context.snapshotInstallation = async () => ({
    stores: { records: [{ value: 2 }, { value: 3 }] },
  });
  await f.context.syncSingleFile();
  assert.equal(JSON.parse(f.contents).stores.records.length, 2);
  f.context.snapshotInstallation = async () => ({ stores: { records: [] } });
  await f.context.syncSingleFile();
  assert.equal(JSON.parse(f.contents).stores.records.length, 0);
  assert.equal(f.writes, 3);
});
test("cancelled picker or refused replacement never writes", async () => {
  const f = fixture();
  f.context.window.showSaveFilePicker = async () => {
    throw Object.assign(Error("cancel"), { name: "AbortError" });
  };
  await f.context.chooseSingleFile();
  f.context.window.showSaveFilePicker = async () => f.handle;
  f.externalEdit();
  f.context.confirm = () => false;
  await f.context.chooseSingleFile();
  assert.equal(f.writes, 0);
  assert.equal(f.contents, "external");
});
test("external changes pause writing rather than overwriting another editor or tab", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.externalEdit();
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.contents, "external");
  assert.match(vm.runInContext("singleFileMessage", f.context), /بیرون/);
});
test("failed writes abort and preserve the last complete file", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const previous = f.contents;
  f.failWrites();
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.contents, previous);
  assert.equal(f.aborts, 1);
  assert.match(vm.runInContext("singleFileMessage", f.context), /disk full/);
});
test("reset during a pending snapshot never empties the external backup", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const previous = f.contents;
  f.context.snapshotInstallation = async () => {
    f.context.resetBusy = true;
    return { stores: {} };
  };
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.contents, previous);
});
test("stopping leaves the file untouched and removes the connection", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const previous = f.contents;
  await f.context.disableSingleFile();
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.contents, previous);
});
test("permission denial pauses automatic saving without claiming success", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.handle.requestPermission = async () => "denied";
  await f.context.resumeSingleFile();
  assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  assert.match(vm.runInContext("singleFileMessage", f.context), /اجازه/);
  assert.equal(f.writes, 1);
});
