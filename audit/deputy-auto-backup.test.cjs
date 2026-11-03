"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const source = fs.readFileSync(
  require("node:path").join(__dirname, "../src/deputy/automatic-backup.js"),
  "utf8",
);
function fixture({ supported = true } = {}) {
  let clock = 1800000000000,
    config = null,
    permission = "granted",
    content = "",
    modified = 1,
    revision = 1,
    failWrite = false,
    failPersist = false,
    chooseError = null,
    confirm = true,
    serial = Promise.resolve(),
    writes = 0,
    aborts = 0,
    prompts = 0,
    pickers = 0;
  const timers = new Map();
  let sequence = 0;
  const handle = {
    name: "deputy.json",
    async queryPermission() {
      return permission;
    },
    async requestPermission() {
      prompts++;
      return permission;
    },
    async getFile() {
      return { size: Buffer.byteLength(content), lastModified: modified };
    },
    async createWritable() {
      let next = "";
      return {
        async write(value) {
          if (failWrite) throw Error("disk full");
          next = value;
        },
        async close() {
          content = next;
          modified++;
          writes++;
        },
        async abort() {
          aborts++;
        },
      };
    },
  };
  const store = {
    async automaticBackupConfig() {
      return config ? { ...config } : null;
    },
    async setAutomaticBackupConfig(value, expected) {
      if (failPersist) throw Error("storage full");
      if (expected !== undefined && (config?.connectionId || null) !== expected)
        return false;
      config = value ? { ...value } : null;
      return true;
    },
    async backup() {
      return {
        format: "EduManager.DeputyBackup",
        exportedAt: new Date(clock).toISOString(),
        revision,
        streams: [{ key: "first" }, { key: "second" }],
        followups: [{ id: "note" }],
      };
    },
  };
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [clock]));
    }
    static now() {
      return clock;
    }
  }
  const context = vm.createContext({
    Blob,
    Date: Clock,
    crypto: { randomUUID: () => String(++sequence) },
    navigator: {
      locks: {
        request(_name, task) {
          const job = serial.then(task);
          serial = job.catch(() => {});
          return job;
        },
      },
    },
    setInterval: (fn, ms) => {
      const id = ++sequence;
      timers.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
    confirm: () => confirm,
    EduDeputyStore: {
      maxBackupBytes: 1e7,
      validateBackup: (value) => {
        assert.equal(value.format, "EduManager.DeputyBackup");
        return value;
      },
    },
  });
  if (supported)
    context.showSaveFilePicker = async () => {
      pickers++;
      if (chooseError) throw chooseError;
      return handle;
    };
  vm.runInContext(source, context);
  const make = () => context.EduDeputyAutoBackup.create({ store });
  return {
    make,
    store,
    context,
    timers,
    handle,
    get config() {
      return config;
    },
    get content() {
      return content;
    },
    get writes() {
      return writes;
    },
    get prompts() {
      return prompts;
    },
    get pickers() {
      return pickers;
    },
    get aborts() {
      return aborts;
    },
    advance: (ms) => (clock += ms),
    setRevision: (v) => (revision = v),
    setPermission: (v) => (permission = v),
    externalEdit: () => {
      content = "external";
      modified++;
    },
    setWriteFailure: (v) => (failWrite = v),
    setPersistFailure: (v) => (failPersist = v),
    setCancel: () =>
      (chooseError = Object.assign(Error("cancel"), { name: "AbortError" })),
    setConfirm: (v) => (confirm = v),
  };
}
test("activation writes one complete validated deputy file immediately; timers update the same file after twenty minutes", async () => {
  const f = fixture(),
    a = f.make();
  await a.init();
  assert.equal(await a.choose(), true);
  assert.equal(f.writes, 1);
  assert.equal(a.status().active, true);
  assert.equal(f.timers.size, 1);
  const saved = JSON.parse(f.content);
  assert.equal(saved.streams.length, 2);
  assert.equal(saved.followups.length, 1);
  assert.equal(saved.handle, undefined);
  f.advance(19 * 60000);
  assert.equal(await a.saveDue(), true);
  assert.equal(f.writes, 1);
  f.advance(60000);
  f.setRevision(2);
  assert.equal(await a.saveDue(), true);
  assert.equal(f.writes, 2);
  assert.equal(JSON.parse(f.content).revision, 2);
  assert.equal(f.pickers, 1);
  await a.dispose();
  assert.equal(f.timers.size, 0);
});
test("a persisted connection resumes without a picker or permission prompt", async () => {
  const f = fixture(),
    a = f.make();
  await a.choose();
  await a.dispose();
  const b = f.make();
  await b.init();
  assert.equal(b.status().active, true);
  assert.equal(f.writes, 1);
  assert.equal(f.pickers, 1);
  assert.equal(f.prompts, 0);
  await b.dispose();
});
test("revoked permission pauses the timer; only explicit save requests permission", async () => {
  const f = fixture(),
    a = f.make();
  await a.choose();
  await a.dispose();
  f.setPermission("prompt");
  const b = f.make();
  await b.init();
  assert.equal(b.status().permission, true);
  assert.equal(b.status().active, false);
  assert.equal(f.timers.size, 0);
  assert.equal(f.prompts, 0);
  f.setPermission("denied");
  assert.equal(await b.save(), false);
  assert.equal(f.writes, 1);
  f.setPermission("granted");
  assert.equal(await b.save(), true);
  assert.equal(f.writes, 2);
  assert.equal(b.status().active, true);
  assert.equal(b.status().permission, false);
  await b.dispose();
});
test("external file changes are never overwritten", async () => {
  const f = fixture(),
    a = f.make();
  await a.choose();
  f.externalEdit();
  f.advance(1200000);
  assert.equal(await a.saveDue(), false);
  assert.equal(f.content, "external");
  assert.equal(f.writes, 1);
  assert.equal(a.status().error, true);
  assert.equal(a.status().active, false);
  await a.dispose();
});
test("stop removes only the device connection and keeps the last file", async () => {
  const f = fixture(),
    a = f.make();
  await a.choose();
  const previous = f.content;
  assert.equal(await a.stop(), true);
  assert.equal(f.config, null);
  assert.equal(f.content, previous);
  assert.equal(f.timers.size, 0);
  assert.equal(await a.saveDue(), false);
  await a.dispose();
});
test("disk failure aborts the stream, preserves the old complete file and never claims success", async () => {
  const f = fixture(),
    a = f.make();
  await a.choose();
  const previous = f.content;
  f.setWriteFailure(true);
  assert.equal(await a.save(), false);
  assert.equal(f.content, previous);
  assert.equal(f.aborts, 1);
  assert.equal(a.status().active, false);
  assert.equal(a.status().error, true);
  await a.dispose();
});
test("cancelling the file picker leaves the current active connection intact", async () => {
  const f = fixture(),
    a = f.make();
  await a.choose();
  const id = f.config.connectionId;
  f.setCancel();
  assert.equal(await a.choose(), false);
  assert.equal(a.status().active, true);
  assert.equal(f.config.connectionId, id);
  assert.equal(f.writes, 1);
  await a.dispose();
});
test("a nonempty file requires replacement confirmation; declining does not overwrite it", async () => {
  const f = fixture(),
    a = f.make();
  f.externalEdit();
  f.setConfirm(false);
  assert.equal(await a.choose(), false);
  assert.equal(f.content, "external");
  assert.equal(f.config, null);
  assert.equal(f.writes, 0);
  await a.dispose();
});
test("a second tab shares the lock and only one due snapshot is written", async () => {
  const f = fixture(),
    a = f.make();
  await a.choose();
  const b = f.make();
  await b.init();
  f.advance(1200000);
  await Promise.all([a.saveDue(), b.saveDue()]);
  assert.equal(f.writes, 2);
  await a.dispose();
  await b.dispose();
});
test("a stale tab cannot write or disconnect a replacement connection", async () => {
  const f = fixture(),
    a = f.make();
  await a.choose();
  const b = f.make();
  await b.init();
  await b.choose();
  const id = f.config.connectionId;
  f.advance(1200000);
  assert.equal(await a.saveDue(), false);
  assert.equal(f.writes, 2);
  assert.equal(await a.stop(), false);
  assert.equal(f.config.connectionId, id);
  assert.equal(b.status().active, true);
  await a.dispose();
  await b.dispose();
});
test("failed settings persistence cannot activate an empty file", async () => {
  const f = fixture(),
    a = f.make();
  f.setPersistFailure(true);
  assert.equal(await a.choose(), false);
  assert.equal(f.writes, 0);
  assert.equal(a.status().active, false);
  assert.equal(f.config, null);
  await a.dispose();
});
test("unsupported browsers keep automatic writing disabled without fake downloads", async () => {
  const f = fixture({ supported: false }),
    a = f.make();
  await a.init();
  assert.equal(a.status().supported, false);
  assert.equal(await a.choose(), false);
  assert.equal(f.writes, 0);
  assert.equal(f.timers.size, 0);
  await a.dispose();
});

test("reopening an overdue connection immediately writes the current complete snapshot", async () => {
  const f = fixture(),
    a = f.make();
  await a.choose();
  await a.dispose();
  f.advance(25 * 60000);
  f.setRevision(3);
  const b = f.make();
  await b.init();
  assert.equal(f.writes, 2);
  assert.equal(JSON.parse(f.content).revision, 3);
  assert.equal(b.status().active, true);
  await b.dispose();
});
test("moving the device clock backwards cannot postpone automatic saving indefinitely", async () => {
  const f = fixture(),
    a = f.make();
  await a.choose();
  f.advance(-60 * 60000);
  assert.equal(await a.saveDue(), true);
  assert.equal(f.writes, 2);
  assert.equal(a.status().active, true);
  await a.dispose();
});
