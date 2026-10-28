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
  let stored = null;
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
    periodLoading: false,
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
    uid: () => "file-" + Math.random(),
    broadcast() {},
    readRecord: async () => stored && { ...stored },
    transactionDone: (tx) => tx.finished,
    connection: {
      transaction: () => {
        let finish;
        const finished = new Promise((resolve) => {
          finish = resolve;
        });
        return {
          finished,
          objectStore: () => ({
            get: () => {
              const request = {};
              queueMicrotask(() => {
                request.result = stored && { ...stored };
                request.onsuccess();
                finish();
              });
              return request;
            },
            put: (value) => {
              stored = { ...value };
            },
            delete: () => {
              stored = null;
            },
          }),
        };
      },
    },
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
    getStored: () => stored && { ...stored },
    setStored: (value) => {
      stored = value;
    },
  };
}
test("file warning stays visible on failure and hides after recovery without returning to tools", () => {
  const f = fixture();
  const panel = {
      append(el) {
        el.parentElement = this;
      },
    },
    tools = {
      append(el) {
        el.parentElement = this;
      },
    };
  const badge = { parentElement: tools };
  f.context.document = {
    getElementById: (id) => (id === "singleFileBadge" ? badge : null),
    querySelector: (selector) =>
      selector === "#app .workspace-bar" ? panel : tools,
  };
  f.context.showSingleFileFallback(true);
  f.context.singleFileStatus("write failed");
  assert.equal(badge.parentElement, panel);
  assert.equal(badge.textContent, "write failed");
  assert.equal(badge.hidden, false);
  f.context.showSingleFileFallback(false);
  f.context.singleFileStatus("saved");
  assert.equal(badge.parentElement, panel);
  assert.equal(badge.hidden, true);
});
test("automatic file sync skips period transitions without failing or disconnecting the mirror", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.context.periodLoading = true;
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.writes, 1);
  assert.equal(vm.runInContext("singleFileFailure", f.context), false);
  f.context.periodLoading = false;
  assert.equal(await f.context.syncSingleFile(), true);
  assert.equal(f.writes, 2);
});
test("a snapshot interrupted by a period switch does not pause or fail automatic file saving", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const snapshot = f.context.snapshotInstallation;
  f.context.snapshotInstallation = async () => {
    throw Object.assign(Error("period moved"), {
      code: "BACKUP_CONTEXT_CHANGED",
    });
  };
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.writes, 1);
  assert.equal(vm.runInContext("singleFileFailure", f.context), false);
  assert.equal(vm.runInContext("singleFileTimer", f.context), 1);
  f.context.snapshotInstallation = snapshot;
  assert.equal(await f.context.syncSingleFile(), true);
  assert.equal(f.writes, 2);
});
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

test("API presence and granted permissions do not activate a rejected first write", async () => {
  const f = fixture();
  f.handle.createWritable = async () => {
    throw Object.assign(Error("platform blocked"), { name: "NotAllowedError" });
  };
  assert.equal(await f.context.chooseSingleFile(), false);
  assert.equal(f.contents, "");
  assert.equal(f.getStored().savedAt, "");
  assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  assert.equal(vm.runInContext("singleFileFailure", f.context), true);
  assert.match(vm.runInContext("singleFileMessage", f.context), /اجازه نوشتن/);
  assert.match(f.context.singleFilePanel(), /دریافت دستی پشتیبان کامل/);
  assert.doesNotMatch(
    f.context.singleFilePanel(),
    /id="singleFileFallback" hidden/,
  );
});

test("timer starts only after first close and nonempty-file confirmation", async () => {
  const f = fixture();
  const original = f.handle.createWritable;
  f.handle.createWritable = async () => {
    assert.equal(vm.runInContext("singleFileTimer", f.context), null);
    const stream = await original();
    const close = stream.close;
    stream.close = async () => {
      assert.equal(vm.runInContext("singleFileTimer", f.context), null);
      await close();
    };
    return stream;
  };
  assert.equal(await f.context.chooseSingleFile(), true);
  assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
  assert.ok(f.getStored().savedAt);
});

test("failed or empty first close never confirms activation", async () => {
  for (const close of [
    async () => {
      throw Error("close failed");
    },
    async () => {},
  ]) {
    const f = fixture();
    f.handle.createWritable = async () => ({
      write: async () => {},
      close,
      abort: async () => {},
    });
    assert.equal(await f.context.chooseSingleFile(), false);
    assert.equal(f.getStored().savedAt, "");
    assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  }
});

test("pending initial activation stays paused after reload and can recover with save now", async () => {
  const f = fixture();
  const original = f.handle.createWritable;
  f.handle.createWritable = async () => {
    throw Error("not writable");
  };
  await f.context.chooseSingleFile();
  await f.context.restoreSingleFile();
  assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  assert.match(vm.runInContext("singleFileMessage", f.context), /تأیید نشده/);
  f.handle.createWritable = original;
  assert.equal(await f.context.resumeSingleFile(), true);
  assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
  assert.equal(vm.runInContext("singleFileFailure", f.context), false);
});

test("missing picker offers a manual backup without pretending automatic support", () => {
  const f = fixture();
  delete f.context.window.showSaveFilePicker;
  assert.match(f.context.singleFilePanel(), /در دسترس نیست/);
  assert.match(
    f.context.singleFilePanel(),
    /data-workspace-action="export-full"/,
  );
});

test("save now takes a fresh snapshot after an older in-flight write", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  let release, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const original = f.handle.createWritable;
  let delayOnce = true;
  f.handle.createWritable = async () => {
    const stream = await original();
    const write = stream.write;
    stream.write = async (json) => {
      if (delayOnce) {
        delayOnce = false;
        entered();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      await write(json);
    };
    return stream;
  };
  const old = f.context.syncSingleFile();
  await started;
  f.context.snapshotInstallation = async () => ({
    stores: { records: [{ value: 2 }] },
  });
  const requested = f.context.resumeSingleFile();
  await Promise.resolve();
  release();
  await Promise.all([old, requested]);
  assert.equal(JSON.parse(f.contents).stores.records[0].value, 2);
});

test("permission service rejection pauses and reports instead of rejecting", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.handle.requestPermission = async () => {
    throw Error("permission service failed");
  };
  assert.equal(await f.context.resumeSingleFile(), false);
  assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  assert.match(
    vm.runInContext("singleFileMessage", f.context),
    /permission service failed/,
  );
});

test("sync and async Web Lock failures are contained and pause timers", async () => {
  for (const request of [
    () => {
      throw Error("lock failed");
    },
    async () => {
      throw Error("lock failed");
    },
  ]) {
    const f = fixture();
    await f.context.chooseSingleFile();
    f.context.navigator.locks = { request };
    assert.equal(await f.context.syncSingleFile(), false);
    assert.equal(vm.runInContext("singleFileTimer", f.context), null);
    assert.match(
      vm.runInContext("singleFileMessage", f.context),
      /lock failed/,
    );
  }
});

test("disconnected or replaced persistent settings cannot be resurrected by a stale tab", async () => {
  for (const replacement of [null, { connectionId: "another-connection" }]) {
    const f = fixture();
    await f.context.chooseSingleFile();
    const previous = f.contents;
    f.setStored(replacement);
    assert.equal(await f.context.syncSingleFile(), false);
    assert.equal(f.contents, previous);
    assert.deepEqual(f.getStored(), replacement);
    assert.equal(vm.runInContext("singleFile", f.context), null);
  }
});

test("stop message aborts an in-flight stream and cannot recreate its configuration", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const previous = f.contents;
  const original = f.handle.createWritable;
  f.handle.createWritable = async () => {
    const stream = await original();
    const write = stream.write;
    stream.write = async (json) => {
      await write(json);
      f.setStored(null);
      f.context.singleFileChanged({
        type: "single-file-changed",
        connectionId: null,
      });
    };
    return stream;
  };
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.aborts, 1);
  assert.equal(f.contents, previous);
  assert.equal(f.getStored(), null);
});

test("persistent disconnect aborts an in-flight stream even without BroadcastChannel", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const previous = f.contents;
  const original = f.handle.createWritable;
  f.handle.createWritable = async () => {
    const stream = await original();
    const write = stream.write;
    stream.write = async (json) => {
      await write(json);
      f.setStored(null);
    };
    return stream;
  };
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.aborts, 1);
  assert.equal(f.contents, previous);
  assert.equal(f.getStored(), null);
});

test("metadata compare-and-set cannot overwrite a replacement or recreate a deleted connection", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  for (const replacement of [null, { connectionId: "replacement" }]) {
    f.setStored(replacement);
    assert.equal(await f.context.persistSingleFile(), false);
    assert.deepEqual(f.getStored(), replacement);
  }
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
