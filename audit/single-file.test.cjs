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
  const deliveries = [];
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
    fullRestoreBusy: false,
    connectionRetired: false,
    document: { getElementById: () => null },
    window: { showSaveFilePicker: async () => handle },
    navigator: {},
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    confirm: () => true,
    esc: (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;"),
    setStatus() {},
    validateFullBackup() {},
    uid: () => "file-" + Math.random(),
    broadcast() {},
    recordFullBackupDelivery: (value) => deliveries.push(value),
    readRecord: async () => stored && { ...stored },
    transactionDone: (tx) => tx.finished,
    connection: {
      transaction: () => {
        let finish, fail;
        const finished = new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        });
        return {
          finished,
          abort() {
            fail(Error("aborted"));
          },
          objectStore: (storeName) => ({
            get: () => {
              const request = {};
              queueMicrotask(() => {
                request.result =
                  storeName === "records"
                    ? {
                        value: {
                          token: context.durableInstallationToken || "",
                        },
                      }
                    : stored && { ...stored };
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
    deliveries,
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
  assert.match(badge.innerHTML, /write failed<\/span>/);
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
test("automatic file writing pauses during system restoration without disconnecting the chosen file", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const contents = f.contents,
    writes = f.writes;
  f.context.fullRestoreBusy = true;
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.contents, contents);
  assert.equal(f.writes, writes);
  assert.ok(f.getStored());
  f.context.fullRestoreBusy = false;
  assert.equal(await f.context.syncSingleFile(), true);
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
  assert.doesNotMatch(
    f.context.singleFilePanel(),
    /data-workspace-action="export-full"/,
  );
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

for (const permission of ["prompt", "denied"]) {
  test(`restored ${permission} file permission remains visibly paused until an explicit successful save`, async () => {
    const f = fixture();
    await f.context.chooseSingleFile();
    const previous = f.contents,
      badge = { hidden: true };
    f.context.document = {
      getElementById: (id) => (id === "singleFileBadge" ? badge : null),
      querySelector: () => null,
    };
    f.handle.queryPermission = async () => permission;
    await f.context.restoreSingleFile();
    assert.equal(vm.runInContext("singleFileTimer", f.context), null);
    assert.equal(vm.runInContext("singleFileFailure", f.context), true);
    assert.equal(badge.hidden, false);
    assert.match(badge.innerHTML, /مجوز فایل نیاز به تأیید دارد/);
    assert.equal(f.contents, previous);
    assert.equal(f.writes, 1);
    // A later render uses this same persistent flag, so the warning does not
    // disappear when the user navigates to a different screen.
    assert.doesNotMatch(
      f.context.singleFilePanel(),
      /id="singleFileFallback" hidden/,
    );
    assert.equal(await f.context.resumeSingleFile(), true);
    assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
    assert.equal(vm.runInContext("singleFileFailure", f.context), false);
    assert.equal(badge.hidden, true);
    assert.equal(f.writes, 2);
  });
}
test("restored granted permission resumes saving and records only confirmed writes", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  assert.equal(f.deliveries.length, 1);
  assert.equal(f.deliveries[0].kind, "automatic-file");
  assert.equal(f.deliveries[0].name, f.handle.name);
  await f.context.restoreSingleFile();
  assert.equal(f.writes, 2);
  assert.equal(f.deliveries.length, 2);
  assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
  f.failWrites();
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.deliveries.length, 2);
});
test("explicit successful disconnect clears a permission warning without restarting saving or deleting the file", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const previous = f.contents,
    badge = { hidden: true };
  f.context.document = {
    getElementById: (id) => (id === "singleFileBadge" ? badge : null),
    querySelector: () => null,
  };
  f.handle.queryPermission = async () => "prompt";
  await f.context.restoreSingleFile();
  assert.equal(badge.hidden, false);
  await f.context.disableSingleFile();
  assert.equal(vm.runInContext("singleFileFailure", f.context), false);
  assert.equal(badge.hidden, true);
  assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  assert.equal(vm.runInContext("singleFile", f.context), null);
  assert.equal(f.getStored(), null);
  assert.equal(f.contents, previous);
  assert.equal(f.writes, 1);
  assert.match(badge.innerHTML, /اتصال متوقف شد.*حذف نشده/);
  assert.doesNotMatch(badge.innerHTML, /فعال شد/);
});

test("missing picker offers a manual backup without pretending automatic support", () => {
  const f = fixture();
  delete f.context.window.showSaveFilePicker;
  assert.match(
    f.context.singleFilePanel(),
    /<section class="backup-automatic">/,
  );
  assert.match(
    f.context.singleFilePanel(),
    /<h3>ذخیره خودکار در یک فایل<\/h3>/,
  );
  assert.match(
    f.context.singleFilePanel(),
    /data-workspace-action="single-file-choose" disabled/,
  );
  assert.match(f.context.singleFilePanel(), /در دسترس نیست/);
  assert.doesNotMatch(
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

test("an unrestorable full snapshot never opens a stream or overwrites the last confirmed automatic backup", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const before = f.contents,
    writes = f.writes,
    deliveries = f.deliveries.length;
  let opened = 0;
  f.handle.createWritable = async () => {
    opened++;
    throw Error("must not open");
  };
  f.context.validateFullBackup = () => {
    throw Error("damaged historical report");
  };
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(opened, 0);
  assert.equal(f.contents, before);
  assert.equal(f.writes, writes);
  assert.equal(f.deliveries.length, deliveries);
  assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  assert.equal(vm.runInContext("singleFileFailure", f.context), true);
  assert.match(
    vm.runInContext("singleFileMessage", f.context),
    /damaged historical report/,
  );
});

test("permission notices escape their message and keep the command outside the live status", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.handle.queryPermission = async () => "prompt";
  await f.context.restoreSingleFile();
  const html = f.context.singleFileNoticeHtml('<img src=x onerror="unsafe">');
  assert.match(html, /class="single-file-message" role="status"/);
  assert.match(html, /&lt;img src=x onerror=&quot;unsafe&quot;&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.match(
    html,
    /<[/]span><button[^>]*type="button"[^>]*class="single-file-permission-action"[^>]*data-workspace-action="single-file-save"[^>]*>اجازه مجدد<[/]button>/,
  );
  assert.equal(
    (html.match(/data-workspace-action="single-file-save"/g) || []).length,
    1,
  );
  assert.match(
    f.context.singleFilePanel(),
    /id="singleFileStatus"[^>]*>[\s\S]*class="single-file-permission-action"/,
  );
});

test("inline permission command requires a real connection, permission support and an explicit permission warning", async () => {
  const f = fixture();
  f.context.singleFileStatus("Needs permission", { permission: true });
  assert.doesNotMatch(f.context.singleFileNoticeHtml(), /<button/);
  await f.context.chooseSingleFile();
  f.context.singleFileStatus("Ordinary progress");
  assert.doesNotMatch(f.context.singleFileNoticeHtml(), /<button/);
  f.context.singleFileStatus("Needs permission", { permission: true });
  assert.match(
    f.context.singleFileNoticeHtml(),
    /data-workspace-action="single-file-save"/,
  );
  const requestPermission = f.handle.requestPermission;
  delete f.handle.requestPermission;
  assert.doesNotMatch(f.context.singleFileNoticeHtml(), /<button/);
  f.handle.requestPermission = requestPermission;
  delete f.context.window.showSaveFilePicker;
  assert.doesNotMatch(f.context.singleFileNoticeHtml(), /<button/);
  assert.doesNotMatch(
    f.context.singleFilePanel(),
    /single-file-permission-action/,
  );
});

test("permission retry requests browser permission synchronously before awaiting storage", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  let requested = false;
  f.handle.requestPermission = () => {
    requested = true;
    return Promise.resolve("granted");
  };
  const current = f.context.singleFileCurrent;
  f.context.singleFileCurrent = (...args) => {
    assert.equal(requested, true);
    return current(...args);
  };
  const retry = f.context.resumeSingleFile();
  assert.equal(
    requested,
    true,
    "permission request must occur in the caller's click gesture",
  );
  assert.equal(await retry, true);
});

test("denied inline retry preserves the last healthy file and a successful retry clears both notices", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const before = f.contents;
  const badge = {},
    status = {};
  f.context.document = {
    getElementById: (id) =>
      id === "singleFileBadge"
        ? badge
        : id === "singleFileStatus"
          ? status
          : null,
    querySelector: () => null,
  };
  f.handle.queryPermission = async () => "prompt";
  await f.context.restoreSingleFile();
  assert.match(badge.innerHTML, /single-file-permission-action/);
  assert.match(status.innerHTML, /single-file-permission-action/);
  f.handle.requestPermission = async () => "denied";
  assert.equal(await f.context.resumeSingleFile(), false);
  assert.equal(f.contents, before);
  assert.equal(f.writes, 1);
  assert.match(badge.innerHTML, /single-file-permission-action/);
  assert.match(status.innerHTML, /single-file-permission-action/);
  assert.equal(badge.hidden, false);
  f.handle.requestPermission = async () => "granted";
  assert.equal(await f.context.resumeSingleFile(), true);
  assert.equal(f.writes, 2);
  assert.equal(badge.hidden, true);
  assert.doesNotMatch(badge.innerHTML, /single-file-permission-action/);
  assert.doesNotMatch(status.innerHTML, /single-file-permission-action/);
});

for (const errorName of ["NotAllowedError", "SecurityError"]) {
  test(
    errorName + " write failure offers an inline permission retry",
    async () => {
      const f = fixture();
      f.handle.createWritable = async () => {
        throw Object.assign(Error("permission needed"), { name: errorName });
      };
      assert.equal(await f.context.chooseSingleFile(), false);
      assert.match(
        f.context.singleFileNoticeHtml(),
        /single-file-permission-action/,
      );
      assert.match(f.context.singleFileNoticeHtml(), /اجازه مجدد/);
      assert.equal(f.contents, "");
    },
  );
}

test("disk failures do not present a misleading permission action", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.failWrites();
  assert.equal(await f.context.syncSingleFile(), false);
  assert.match(f.context.singleFileNoticeHtml(), /disk full/);
  assert.doesNotMatch(
    f.context.singleFileNoticeHtml(),
    /single-file-permission-action/,
  );
});

test("disconnect and replacement in another tab remove a stale permission action", async () => {
  for (const disconnect of [true, false]) {
    const f = fixture();
    await f.context.chooseSingleFile();
    f.handle.queryPermission = async () => "prompt";
    await f.context.restoreSingleFile();
    assert.match(
      f.context.singleFileNoticeHtml(),
      /single-file-permission-action/,
    );
    if (disconnect) await f.context.disableSingleFile();
    else
      f.context.singleFileChanged({
        type: "single-file-changed",
        connectionId: "other-tab",
      });
    assert.doesNotMatch(
      f.context.singleFileNoticeHtml(),
      /single-file-permission-action/,
    );
  }
});

for (const duringStream of [false, true]) {
  test(
    "automatic backup refuses old-installation snapshots " +
      (duringStream ? "before stream close" : "before stream open"),
    async () => {
      const f = fixture();
      let epoch = "old";
      f.context.installationToken = "old";
      f.context.durableInstallationToken = "old";
      f.context.RESET_RECORD_KEY = "@installation-reset";
      f.context.readRecord = async (store) =>
        store === "records" ? { value: { token: epoch } } : f.getStored();
      await f.context.chooseSingleFile();
      const before = f.contents,
        writes = f.writes;
      if (duringStream) {
        const create = f.handle.createWritable;
        f.handle.createWritable = async () => {
          const stream = await create(),
            write = stream.write;
          stream.write = async (json) => {
            await write(json);
            epoch = "new";
            f.context.durableInstallationToken = "new";
          };
          return stream;
        };
      } else {
        epoch = "new";
        f.context.durableInstallationToken = "new";
      }
      assert.equal(await f.context.syncSingleFile(), false);
      assert.equal(f.writes, writes);
      assert.equal(f.contents, before);
      assert.equal(f.aborts, duringStream ? 1 : 0);
    },
  );
}
