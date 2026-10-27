"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  const downloads = [],
    stamps = [],
    writes = [];
  let aborts = 0;
  const stream = {
    async write(value) {
      writes.push(JSON.parse(value));
    },
    async close() {},
    async abort() {
      aborts++;
    },
  };
  const handle = {
    async createWritable() {
      return stream;
    },
    async getFile() {
      return { size: 100 };
    },
  };
  const c = vm.createContext({
    workspace: { id: "first", year: "wrong-live-label", term: "wrong" },
    ready: true,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    drafts: new Map(),
    writer: Promise.resolve(),
    flushDrafts: async () => {},
    readWorkspaceSnapshot: async (id) => {
      assert.equal(id, "first");
      return {
        period: { year: "1405-1406", term: "first-term" },
        data: { schools: [] },
      };
    },
    window: { showSaveFilePicker: async () => handle },
    downloadJSON: (data, name) => downloads.push({ data, name }),
    localStorage: {
      setItem: (key, value) => stamps.push({ key, value: JSON.parse(value) }),
    },
    todayISO: () => "2026-10-27",
    setStatus() {},
    render() {},
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
    handle,
    stream,
    downloads,
    stamps,
    writes,
    get aborts() {
      return aborts;
    },
  };
}

test("period export freezes atomic metadata and stamps the origin after picker navigation", async () => {
  const f = fixture();
  f.c.window.showSaveFilePicker = async (options) => {
    assert.match(options.suggestedName, /1405-1406-first-term/);
    f.c.workspace.id = "second";
    return f.handle;
  };
  assert.equal(await f.c.exportBackupV24(), "confirmed");
  assert.equal(f.writes[0].period.year, "1405-1406");
  assert.equal(f.stamps[0].key, "Edu24.externalBackup.first");
});

for (const stage of ["flush", "snapshot"]) {
  test(`period export rejects source change during ${stage}`, async () => {
    const f = fixture();
    if (stage === "flush")
      f.c.flushDrafts = async () => {
        f.c.workspace.id = "second";
      };
    else {
      const read = f.c.readWorkspaceSnapshot;
      f.c.readWorkspaceSnapshot = async (id) => {
        const result = await read(id);
        f.c.workspace.id = "second";
        return result;
      };
    }
    await assert.rejects(f.c.exportBackupV24());
    assert.equal(f.writes.length + f.stamps.length + f.downloads.length, 0);
  });
}

for (const method of ["write", "close"]) {
  test(`period export aborts stream after ${method} failure and requests fallback`, async () => {
    const f = fixture();
    f.stream[method] = async () => {
      throw Error("disk error");
    };
    assert.equal(await f.c.exportBackupV24(), "downloaded");
    assert.equal(f.aborts, 1);
    assert.equal(f.downloads.length, 1);
    assert.equal(f.stamps[0].value.confirmed, false);
  });
}

test("empty file cannot be reported as a confirmed period backup", async () => {
  const f = fixture();
  f.handle.getFile = async () => ({ size: 0 });
  assert.equal(await f.c.exportBackupV24(), "downloaded");
  assert.equal(f.stamps[0].value.confirmed, false);
});

test("picker cancellation creates neither fallback nor backup stamp", async () => {
  const f = fixture();
  f.c.window.showSaveFilePicker = async () => {
    throw Object.assign(Error("cancel"), { name: "AbortError" });
  };
  assert.equal(await f.c.exportBackupV24(), false);
  assert.equal(f.downloads.length + f.stamps.length, 0);
});

test("failed draft flush exports durable data with excluded draft count", async () => {
  const f = fixture();
  f.c.drafts.set("grade", {});
  f.c.flushDrafts = async () => {
    throw Error("validation");
  };
  assert.equal(await f.c.exportBackupV24(), "confirmed");
  assert.equal(f.writes[0].excludedDrafts, 1);
});

test("failed fallback download does not record a backup stamp", async () => {
  const f = fixture();
  f.c.window.showSaveFilePicker = undefined;
  f.c.downloadJSON = () => {
    throw Error("download unavailable");
  };
  await assert.rejects(f.c.exportBackupV24(), /download unavailable/);
  assert.equal(f.stamps.length, 0);
});

for (const [flag, value] of [
  ["ready", false],
  ["periodLoading", true],
  ["resetBusy", true],
  ["connectionRetired", true],
]) {
  test(`period export refuses unavailable source: ${flag}`, async () => {
    const f = fixture();
    f.c[flag] = value;
    await assert.rejects(f.c.exportBackupV24());
    assert.equal(f.writes.length + f.stamps.length + f.downloads.length, 0);
  });
}
