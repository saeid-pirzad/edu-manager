"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const context = vm.createContext({
  TextEncoder,
  Uint8Array,
  Intl,
  Date,
  structuredClone,
});
for (const file of ["domain.js", "file-backup.js"])
  vm.runInContext(
    fs.readFileSync(`src/features/question-bank/${file}`, "utf8"),
    context,
  );
const D = context.EduQuestionBank;
test("bank filename errors identify the actual rejected name and the supported prefix", () => {
  for (const name of [
    "legacy-bank.json",
    "Classyar-QuestionBank(۱).json",
    "Classyar-Classroom.json",
  ])
    assert.throws(
      () => context.EduQuestionBankFileBackup.assertFileName(name),
      (error) =>
        error.message.includes("«" + name + "»") &&
        error.message.includes("Classyar-QuestionBank.json"),
    );
});
for (const name of [
  "Classyar-QuestionBank.json",
  "Classyar-QuestionBank(1).json",
  "Classyar-QuestionBank (12).json",
])
  test(
    "bank accepts its exact stable prefix and numbered copies: " + name,
    () => {
      assert.doesNotThrow(() =>
        context.EduQuestionBankFileBackup.assertFileName(name),
      );
    },
  );
for (const name of [
  "Classyar-Classroom.json",
  "bank.json",
  "Classyar-QuestionBank-old.json",
  "Classyar-QuestionBank(0).json",
  "Classyar-QuestionBank(01).json",
  "Classyar-QuestionBank(1).json.exe",
  "xClassyar-QuestionBank.json",
  undefined,
])
  test(
    "bank rejects wrong name before reading, connecting or writing: " + name,
    async () => {
      assert.throws(() =>
        context.EduQuestionBankFileBackup.assertFileName(name),
      );
      const f = fixture(),
        wrong = f.file(name ?? "wrong.json");
      let reads = 0;
      wrong.handle.getFile = async () => {
        reads++;
        throw Error("must not read");
      };
      f.choose(wrong);
      assert.equal(await f.service.choose(), false);
      assert.equal(reads, 0);
      assert.equal(wrong.handle.opens, 0);
      assert.equal(f.config(), null);
    },
  );
function fixture() {
  let bank = D.empty(),
    config = null,
    tail = Promise.resolve(),
    failPersist = false;
  bank.courses.push({ id: "c", title: "ریاضی", structure: "chapter" });
  bank.units.push({ id: "u", courseId: "c", title: "فصل اول" });
  bank.questions.push({
    id: "q",
    unitId: "u",
    type: "essay",
    text: "پرسش",
    answer: "پاسخ",
    explanation: "",
    score: 100,
  });
  const repository = {
    read: async () => structuredClone(bank),
    clear: async (expected, { isCurrent = () => true } = {}) => {
      if (!isCurrent() || expected !== bank.revision || failPersist)
        throw Error("clear rejected");
      bank = { ...D.empty(), revision: expected + 1 };
      config = null;
      return structuredClone(bank);
    },
    readBackup: async () =>
      config ? { ...config, counts: { ...config.counts } } : null,
    writeBackup: async (value, { isCurrent = () => true } = {}) => {
      if (!isCurrent()) throw Error("operation cancelled");
      if (failPersist) throw Error("storage full");
      config = value ? { ...value } : null;
    },
  };
  function file(name = "Classyar-QuestionBank.json", initial = "") {
    let text = initial,
      permission = "granted",
      failWrite = false;
    const handle = {
      name,
      kind: "file",
      writes: 0,
      opens: 0,
      aborts: 0,
      requests: 0,
      getFile: async () => ({
        size: Buffer.byteLength(text),
        text: async () => text,
      }),
      queryPermission: async () => permission,
      requestPermission: async () => {
        handle.requests++;
        return permission === "denied" ? "denied" : (permission = "granted");
      },
      createWritable: async () => {
        handle.opens++;
        let pending;
        return {
          write: async (value) => {
            if (failWrite) throw Error("write denied");
            pending = value;
          },
          close: async () => {
            text = pending;
            handle.writes++;
          },
          abort: async () => {
            handle.aborts++;
          },
        };
      },
    };
    return {
      handle,
      text: () => text,
      external: (value) => {
        text = value;
      },
      permission: (value) => {
        permission = value;
      },
      fail: (value) => {
        failWrite = value;
      },
    };
  }
  const target = file();
  const timers = new Map();
  let chosen = target.handle,
    timerId = 0;
  const host = {
    isSecureContext: true,
    crypto: webcrypto,
    navigator: {
      locks: {
        request: (_name, action) => {
          const operation = tail.then(action);
          tail = operation.catch(() => {});
          return operation;
        },
      },
    },
    showSaveFilePicker: async () => chosen,
    setTimeout: (fn, ms) => {
      timers.set(++timerId, { fn, ms });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => {
      timers.set(++timerId, { fn, ms });
      return timerId;
    },
    clearInterval: (id) => timers.delete(id),
  };
  const create = () =>
    context.EduQuestionBankFileBackup.create(repository, host);
  const service = create();
  return {
    service,
    target,
    repository,
    host,
    create,
    file,
    timers,
    choose: (value) => {
      chosen = value.handle;
    },
    change: (action) => {
      action(bank);
      bank.revision++;
    },
    bank: () => structuredClone(bank),
    config: () => config,
    failPersist: (value) => {
      failPersist = value;
    },
  };
}
test("explicit bank removal deletes only the previewed file and detaches its cleared bank", async () => {
  const f = fixture();
  await f.service.choose();
  const id = f.config().id,
    revision = f.bank().revision;
  let removals = 0;
  f.target.handle.remove = async () => {
    removals++;
  };
  await f.service.clear(revision, { deleteFile: true, expectedFileId: id });
  assert.equal(removals, 1);
  assert.equal(f.config(), null);
  assert.equal(f.bank().revision, revision + 1);
  assert.equal(f.bank().questions.length, 0);
  assert.equal(f.service.state().state, "inactive");
});

for (const failure of [
  "unsupported",
  "denied",
  "changed-name",
  "actual-name-changed",
  "missing-file",
  "invalid-content",
  "changed-bytes",
  "changed-connection",
  "changed-bank",
  "remove-failed",
  "closed-panel",
]) {
  test(
    "bank file removal preserves data before deletion on " + failure,
    async () => {
      const f = fixture();
      await f.service.choose();
      const id = f.config().id,
        revision = f.bank().revision;
      let removals = 0;
      f.target.handle.remove = async () => {
        if (failure === "remove-failed") throw Error("OS rejected removal");
        removals++;
      };
      if (failure === "unsupported") delete f.target.handle.remove;
      if (failure === "denied") f.target.permission("denied");
      if (failure === "changed-name")
        f.target.handle.name = "Classyar-Classroom.json";
      if (failure === "actual-name-changed") {
        const originalRead = f.target.handle.getFile;
        f.target.handle.getFile = async () => ({
          ...(await originalRead()),
          name: "Classyar-Classroom.json",
        });
      }
      if (failure === "missing-file")
        f.target.handle.getFile = async () => {
          throw Object.assign(Error("File was removed outside the app"), {
            name: "NotFoundError",
          });
        };
      if (failure === "invalid-content") f.target.external("not-json");
      if (failure === "changed-bytes")
        f.target.external(JSON.stringify(D.empty()));
      if (failure === "changed-connection")
        await f.repository.writeBackup({ ...f.config(), id: "replacement" });
      if (failure === "changed-bank")
        f.change((b) => {
          b.courses[0].title = "concurrent change";
        });
      const before = f.bank();
      await assert.rejects(
        f.service.clear(revision, {
          deleteFile: true,
          expectedFileId: id,
          isCurrent: () => failure !== "closed-panel",
        }),
      );
      assert.equal(removals, 0);
      assert.deepEqual(f.bank(), before);
      assert.ok(f.config());
      if (failure === "changed-name") assert.equal(f.target.handle.requests, 0);
    },
  );
}

test("a database failure after physical removal reports the partial outcome and retains bank data", async () => {
  const f = fixture();
  await f.service.choose();
  const before = f.bank(),
    id = f.config().id;
  let removed = false;
  f.target.handle.remove = async () => {
    removed = true;
  };
  f.failPersist(true);
  await assert.rejects(
    f.service.clear(before.revision, { deleteFile: true, expectedFileId: id }),
    /فایل متصل حذف شد/,
  );
  assert.equal(removed, true);
  assert.deepEqual(f.bank(), before);
  assert.equal(f.service.state().state, "error");
  assert.match(f.service.state().message, /فایل متصل حذف شد/);
});

test("connection activates only after verified JSON write and persists a device-only handle", async () => {
  const f = fixture();
  await f.service.init();
  assert.equal(await f.service.choose(), true);
  assert.equal(f.service.state().state, "active");
  assert.deepEqual(JSON.parse(f.target.text()), f.bank());
  assert.equal(f.config().handle, f.target.handle);
  assert.ok(f.config().hash.length === 64 && f.config().savedAt);
  assert.equal(D.size(f.bank()).includes("file-backup"), false);
  assert.match(f.service.suggestedName(), /^Classyar-QuestionBank\.json$/);
});
test("updates the same file from fresh committed data and avoids unchanged rewrites", async () => {
  const f = fixture();
  await f.service.choose();
  await f.service.sync();
  assert.equal(f.target.handle.writes, 1);
  f.change((b) => {
    b.questions[0].text = "ویرایش";
  });
  assert.equal(await f.service.sync(), true);
  assert.equal(D.parse(f.target.text()).questions[0].text, "ویرایش");
  assert.equal(f.target.handle.writes, 2);
});
test("never overwrites school, corrupt, foreign or populated different bank files", async () => {
  for (const initial of [
    '{"schools":[]}',
    "bad json",
    JSON.stringify(D.empty()),
  ]) {
    const f = fixture(),
      foreign = f.file("Classyar-QuestionBank(1).json", initial);
    f.choose(foreign);
    assert.equal(await f.service.choose(), false);
    assert.equal(foreign.text(), initial);
    assert.equal(foreign.handle.opens, 0);
    assert.equal(f.config(), null);
  }
  const f = fixture(),
    old = f.file("Classyar-QuestionBank(2).json", JSON.stringify(f.bank()));
  f.change((b) => {
    b.questions = [];
  });
  f.choose(old);
  assert.equal(await f.service.choose(), false);
  assert.equal(old.handle.opens, 0);
});
test("a matching existing bank can reconnect without importing or changing source data", async () => {
  const f = fixture(),
    old = f.file("Classyar-QuestionBank(3).json", JSON.stringify(f.bank()));
  f.choose(old);
  const source = JSON.stringify(f.bank());
  assert.equal(await f.service.choose(), true);
  assert.equal(JSON.stringify(f.bank()), source);
});
test("restored educational content reconnects to its backup despite a different local revision", async () => {
  const f = fixture(),
    original = JSON.stringify(f.bank()),
    restored = f.file("Classyar-QuestionBank(3).json", original);
  f.change(() => {});
  const source = JSON.stringify(f.bank());
  f.choose(restored);
  assert.equal(await f.service.choose(), true);
  assert.equal(JSON.stringify(f.bank()), source);
  assert.equal(restored.text(), source);
  assert.equal(f.config().handle, restored.handle);
  assert.equal(f.service.state().state, "active");
});
test("equivalent JSON object key order does not prevent reconnecting a restored bank", async () => {
  const f = fixture();
  function reorder(value) {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.keys(value)
          .reverse()
          .map((key) => [key, reorder(value[key])]),
      );
    return value;
  }
  const restored = f.file(
    "Classyar-QuestionBank (4).json",
    JSON.stringify(reorder(f.bank())),
  );
  f.change(() => {});
  const source = JSON.stringify(f.bank());
  f.choose(restored);
  assert.equal(await f.service.choose(), true);
  assert.equal(JSON.stringify(f.bank()), source);
  assert.equal(restored.text(), source);
  assert.equal(f.config().handle, restored.handle);
});
test("reconnecting ignores only local revision and preserves a populated different file and active connection", async () => {
  for (const { prepare = () => {}, change } of [
    {
      change: (bank) => {
        bank.questions[0].answer = "A different answer";
      },
    },
    {
      change: (bank) => {
        bank.questions[0].score++;
      },
    },
    {
      change: (bank) => {
        bank.courses[0].title = "A different course";
      },
    },
    {
      prepare: (bank) => {
        bank.questions.push({ ...bank.questions[0], id: "another-question" });
      },
      change: (bank) => bank.questions.reverse(),
    },
    {
      change: (bank) => {
        bank.version = 2;
      },
    },
  ]) {
    const f = fixture();
    f.change(prepare);
    await f.service.choose();
    const originalConfig = f.config(),
      originalFile = f.target.text(),
      originalBank = JSON.stringify(f.bank()),
      otherBank = f.bank();
    otherBank.revision += 10;
    change(otherBank);
    const otherText = JSON.stringify(otherBank),
      other = f.file("Classyar-QuestionBank(5).json", otherText);
    f.choose(other);
    assert.equal(await f.service.choose(), false);
    assert.equal(other.handle.opens, 0);
    assert.equal(other.text(), otherText);
    assert.equal(f.target.text(), originalFile);
    assert.equal(JSON.stringify(f.bank()), originalBank);
    assert.equal(f.config().id, originalConfig.id);
    assert.equal(f.config().handle, originalConfig.handle);
  }
});
test("source loss pauses writing across reloads; cancellation preserves the old file", async () => {
  const f = fixture();
  await f.service.choose();
  const original = f.target.text();
  f.change((b) => {
    b.questions = [];
  });
  assert.equal(await f.service.sync(), false);
  assert.equal(f.service.state().state, "paused");
  const reloaded = f.create();
  await reloaded.init();
  assert.equal(reloaded.state().state, "paused");
  assert.equal(await reloaded.saveNow(() => false), false);
  assert.equal(f.target.text(), original);
  assert.equal(
    await reloaded.saveNow((_name, counts) => counts.questions === 0),
    true,
  );
  assert.equal(D.parse(f.target.text()).questions.length, 0);
});
test("restore suspension is persistent even when the replacement has more data", async () => {
  const f = fixture();
  await f.service.choose();
  const original = f.target.text();
  await f.service.suspend();
  f.change((b) => {
    b.questions.push({ ...b.questions[0], id: "q2" });
  });
  assert.equal(await f.service.sync(), false);
  assert.equal(f.target.text(), original);
  assert.equal(await f.service.saveNow(() => true), true);
  assert.equal(D.parse(f.target.text()).questions.length, 2);
});
test("externally changed or zero-length files are never overwritten, even on explicit save", async () => {
  for (const text of ["", '{"schools":[]}', JSON.stringify(D.empty())]) {
    const f = fixture();
    await f.service.choose();
    f.target.external(text);
    f.change((b) => {
      b.questions[0].text = "تغییر";
    });
    assert.equal(await f.service.sync(), false);
    assert.equal(await f.service.saveNow(() => true), false);
    assert.equal(f.target.text(), text);
    assert.equal(f.target.handle.writes, 1);
  }
});
test("an external edit during the committed source read prevents opening a replacement stream", async () => {
  const f = fixture();
  await f.service.choose();
  f.change((bank) => {
    bank.questions[0].text = "ویرایش محلی";
  });
  const external = f.bank();
  external.questions[0].text = "ویرایش بیرونی که باید حفظ شود";
  const text = JSON.stringify(external),
    read = f.repository.read,
    previousHash = f.config().hash;
  f.repository.read = async () => {
    const bank = await read();
    f.target.external(text);
    return bank;
  };
  assert.equal(await f.service.sync(), false);
  assert.equal(f.target.text(), text);
  assert.equal(f.target.handle.opens, 1);
  assert.equal(f.target.handle.writes, 1);
  assert.equal(f.config().hash, previousHash);
  assert.equal(f.service.state().state, "error");
});
test("an external edit during selection source read prevents connecting or opening a stream", async () => {
  const f = fixture(),
    external = f.bank();
  external.questions[0].text = "نسخهٔ بیرونی";
  const text = JSON.stringify(external),
    read = f.repository.read;
  f.repository.read = async () => {
    const bank = await read();
    f.target.external(text);
    return bank;
  };
  assert.equal(await f.service.choose(), false);
  assert.equal(f.target.text(), text);
  assert.equal(f.target.handle.opens, 0);
  assert.equal(f.target.handle.writes, 0);
  assert.equal(f.config(), null);
});
test("selection rechecks an edit made while its previous fingerprint was being calculated", async () => {
  const f = fixture(),
    external = f.bank();
  external.questions[0].text = "نسخهٔ بیرونی پس از بررسی اولیه";
  const text = JSON.stringify(external);
  let digests = 0;
  f.host.crypto = {
    randomUUID: () => webcrypto.randomUUID(),
    subtle: {
      digest: async (...args) => {
        const result = await webcrypto.subtle.digest(...args);
        if (++digests === 2) f.target.external(text);
        return result;
      },
    },
  };
  assert.equal(await f.service.choose(), false);
  assert.equal(f.target.text(), text);
  assert.equal(f.target.handle.opens, 0);
  assert.equal(f.target.handle.writes, 0);
  assert.equal(f.config(), null);
});
test("permission is requested only by explicit save; a declined permission preserves the file", async () => {
  const f = fixture();
  await f.service.choose();
  const original = f.target.text();
  f.change((b) => {
    b.questions[0].text = "داده جدید";
  });
  f.target.permission("prompt");
  assert.equal(await f.service.sync(), false);
  assert.equal(f.target.handle.requests, 0);
  f.target.permission("denied");
  assert.equal(await f.service.saveNow(), false);
  assert.equal(f.target.text(), original);
  f.target.permission("prompt");
  assert.equal(await f.service.saveNow(), true);
  assert.equal(D.parse(f.target.text()).questions[0].text, "داده جدید");
});
test("permission renewal starts in the click turn and uses only the bank lock and repository", async () => {
  const f = fixture();
  await f.service.choose();
  f.target.permission("prompt");
  await f.service.sync();
  const requests = f.target.handle.requests,
    locks = [];
  const lock = f.host.navigator.locks.request;
  f.host.navigator.locks.request = (name, action) => {
    locks.push(name);
    return lock(name, action);
  };
  const operation = f.service.saveNow();
  assert.equal(f.target.handle.requests, requests + 1);
  assert.equal(await operation, true);
  assert.ok(
    locks.length > 0 &&
      locks.every((name) => name === "ClassyarQuestionBank.file"),
  );
  assert.equal(JSON.parse(f.target.text()).format, "classyar-question-bank");
  assert.equal(f.service.state().state, "active");
});
test("write or configuration failure never claims activation and atomic write failure preserves the prior file", async () => {
  const f = fixture();
  f.target.fail(true);
  assert.equal(await f.service.choose(), false);
  assert.equal(f.config(), null);
  f.target.fail(false);
  await f.service.choose();
  const original = f.target.text();
  f.change((b) => {
    b.questions[0].text = "ویرایش";
  });
  f.target.fail(true);
  assert.equal(await f.service.sync(), false);
  assert.equal(f.target.text(), original);
  const other = fixture();
  other.failPersist(true);
  assert.equal(await other.service.choose(), false);
  assert.equal(other.service.state().state, "error");
  assert.equal(other.config(), null);
});
test("two windows serialize writes and stale manual actions cannot touch the replacement connection", async () => {
  const f = fixture();
  await f.service.choose();
  const peer = f.create();
  await peer.init();
  f.change((b) => {
    b.questions[0].text = "پنجره دوم";
  });
  assert.deepEqual(await Promise.all([f.service.sync(), peer.sync()]), [
    true,
    true,
  ]);
  assert.equal(f.target.handle.writes, 2);
  const next = f.file("Classyar-QuestionBank(4).json");
  f.choose(next);
  await peer.choose();
  const written = next.text();
  await assert.rejects(f.service.stop(), /اتصال فایل/);
  assert.equal(await f.service.saveNow(), false);
  assert.equal(next.text(), written);
  assert.equal(f.config().handle, next.handle);
});
test("bank changes during replacement approval invalidate the acknowledgement", async () => {
  const f = fixture();
  await f.service.choose();
  const original = f.target.text();
  await f.service.suspend();
  assert.equal(
    await f.service.saveNow(() => {
      f.change((b) => {
        b.questions = [];
      });
      return true;
    }),
    false,
  );
  assert.equal(f.target.text(), original);
});
test("disconnect preserves the file and stops subsequent automatic writes", async () => {
  const f = fixture();
  await f.service.choose();
  const original = f.target.text();
  assert.equal(await f.service.stop(), true);
  f.change((b) => {
    b.questions = [];
  });
  assert.equal(await f.service.sync(), false);
  assert.equal(f.target.text(), original);
  assert.equal(f.config(), null);
});
test("unsupported browsers retain the manual bank without attempting a picker or writer", async () => {
  const f = fixture();
  f.host.isSecureContext = false;
  await f.service.init();
  assert.equal(f.service.state().state, "unsupported");
  assert.equal(await f.service.choose(), false);
  assert.equal(f.target.handle.opens, 0);
});
test("a zero-byte write result is never reported as an activated backup", async () => {
  const f = fixture();
  f.target.handle.createWritable = async () => ({
    write: async () => {},
    close: async () => {},
    abort: async () => {},
  });
  assert.equal(await f.service.choose(), false);
  assert.equal(f.config(), null);
  assert.equal(f.service.state().state, "error");
  assert.equal(f.target.text(), "");
});
test("restore still suspends an existing connection when the picker becomes unavailable", async () => {
  const f = fixture();
  await f.service.choose();
  const previous = f.target.text();
  f.host.showSaveFilePicker = undefined;
  await f.service.suspend();
  assert.equal(f.config().suspended, "restore");
  assert.equal(f.target.text(), previous);
});
test("automatic schedule debounces saves and checks periodically without a selected file", async () => {
  const f = fixture();
  await f.service.init();
  f.service.schedule();
  f.service.schedule();
  assert.equal([...f.timers.values()].filter((t) => t.ms === 2000).length, 1);
  assert.equal([...f.timers.values()].filter((t) => t.ms === 30000).length, 1);
  f.service.dispose();
  assert.equal(f.timers.size, 0);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

test("retired manual file controls cannot start a picker, permission request or disconnect", async () => {
  const f = fixture();
  await f.service.choose();
  const original = f.target.text(),
    connection = f.config(),
    requests = f.target.handle.requests;
  let pickers = 0;
  f.host.showSaveFilePicker = () => {
    pickers++;
    throw Error("retired picker");
  };
  const options = { isCurrent: () => false };
  assert.equal(await f.service.choose(options), false);
  assert.equal(await f.service.saveNow(undefined, options), false);
  assert.equal(await f.service.stop(options), false);
  assert.equal(pickers, 0);
  assert.equal(f.target.handle.requests, requests);
  assert.equal(f.config().id, connection.id);
  assert.equal(f.target.text(), original);
});

test("a late picker cannot replace the prior connection or write after leaving the backup panel", async () => {
  const f = fixture();
  await f.service.choose();
  const original = f.target.text(),
    connection = f.config(),
    next = f.file("Classyar-QuestionBank(8).json"),
    selection = deferred();
  let current = true;
  f.host.showSaveFilePicker = () => selection.promise;
  const operation = f.service.choose({ isCurrent: () => current });
  current = false;
  selection.resolve(next.handle);
  assert.equal(await operation, false);
  assert.equal(next.handle.opens, 0);
  assert.equal(next.text(), "");
  assert.equal(f.config().id, connection.id);
  assert.equal(f.target.text(), original);
  assert.equal(f.service.state().state, "active");
});

test("retiring during the final destination read cancels before opening a file stream", async () => {
  const f = fixture();
  await f.service.choose();
  const original = f.target.text(),
    connection = f.config(),
    next = f.file("Classyar-QuestionBank(8).json"),
    waiting = deferred(),
    release = deferred(),
    getFile = next.handle.getFile;
  let current = true,
    reads = 0;
  next.handle.getFile = async () => {
    if (++reads === 3) {
      waiting.resolve();
      await release.promise;
    }
    return getFile();
  };
  f.choose(next);
  const operation = f.service.choose({ isCurrent: () => current });
  await waiting.promise;
  current = false;
  release.resolve();
  assert.equal(await operation, false);
  assert.equal(next.handle.opens, 0);
  assert.equal(next.text(), "");
  assert.equal(f.config().id, connection.id);
  assert.equal(f.target.text(), original);
  assert.equal(f.service.state().state, "active");
});

for (const stage of ["open", "write"])
  test(`retiring during stream ${stage} aborts its temporary contents before close`, async () => {
    const f = fixture();
    await f.service.choose();
    const original = f.target.text(),
      connection = f.config(),
      next = f.file("Classyar-QuestionBank(8).json"),
      waiting = deferred(),
      release = deferred(),
      createWritable = next.handle.createWritable;
    let current = true;
    next.handle.createWritable = async () => {
      const stream = await createWritable();
      if (stage === "open") {
        waiting.resolve();
        await release.promise;
      } else {
        const write = stream.write;
        stream.write = async (text) => {
          await write(text);
          waiting.resolve();
          await release.promise;
        };
      }
      return stream;
    };
    f.choose(next);
    const operation = f.service.choose({ isCurrent: () => current });
    await waiting.promise;
    current = false;
    release.resolve();
    assert.equal(await operation, false);
    assert.equal(next.handle.aborts, 1);
    assert.equal(next.handle.writes, 0);
    assert.equal(next.text(), "");
    assert.equal(f.config().id, connection.id);
    assert.equal(f.target.text(), original);
    assert.equal(f.service.state().state, "active");
  });

test("retiring after close begins reports the committed file and keeps the prior connection", async () => {
  const f = fixture();
  await f.service.choose();
  const original = f.target.text(),
    connection = f.config(),
    next = f.file("Classyar-QuestionBank(8).json"),
    waiting = deferred(),
    release = deferred(),
    createWritable = next.handle.createWritable;
  let current = true;
  next.handle.createWritable = async () => {
    const stream = await createWritable(),
      close = stream.close;
    stream.close = async () => {
      waiting.resolve();
      await release.promise;
      await close();
    };
    return stream;
  };
  f.choose(next);
  const operation = f.service.choose({ isCurrent: () => current });
  await waiting.promise;
  current = false;
  release.resolve();
  assert.equal(await operation, false);
  assert.equal(next.handle.writes, 1);
  assert.equal(JSON.parse(next.text()).revision, f.bank().revision);
  assert.equal(f.config().id, connection.id);
  assert.equal(f.target.text(), original);
  assert.equal(f.service.state().state, "error");
  assert.match(f.service.state().message, /فایل نوشته شد/);
  assert.doesNotMatch(f.service.state().message, /فایل به‌روز نشد/);
});

test("a late permission grant cannot save from a retired panel and automatic sync remains independent", async () => {
  const f = fixture();
  await f.service.choose();
  const original = f.target.text(),
    connection = f.config(),
    permission = deferred();
  f.change((bank) => (bank.questions[0].text = "new question"));
  let current = true;
  f.target.handle.requestPermission = () => permission.promise;
  const operation = f.service.saveNow(undefined, {
    isCurrent: () => current,
  });
  current = false;
  permission.resolve("granted");
  assert.equal(await operation, false);
  assert.equal(f.config().id, connection.id);
  assert.equal(f.target.text(), original);
  assert.equal(f.target.handle.writes, 1);
  assert.equal(await f.service.sync(), true);
  assert.equal(JSON.parse(f.target.text()).questions[0].text, "new question");
});

for (const action of ["choose", "saveNow", "stop"])
  test(`a queued manual ${action} rechecks the page lifetime after acquiring its lock`, async () => {
    const f = fixture();
    await f.service.choose();
    const original = f.target.text(),
      connection = f.config(),
      next = f.file("Classyar-QuestionBank(8).json"),
      waiting = deferred(),
      release = deferred(),
      lock = f.host.navigator.locks.request;
    let current = true;
    f.change((bank) => (bank.questions[0].text = "new question"));
    f.choose(next);
    f.host.navigator.locks.request = (name, run) =>
      lock(name, async () => {
        waiting.resolve();
        await release.promise;
        return run();
      });
    const options = { isCurrent: () => current },
      operation =
        action === "saveNow"
          ? f.service.saveNow(undefined, options)
          : f.service[action](options);
    await waiting.promise;
    current = false;
    release.resolve();
    assert.equal(await operation, false);
    assert.equal(next.handle.opens, 0);
    assert.equal(f.config().id, connection.id);
    assert.equal(f.target.text(), original);
    assert.equal(f.target.handle.writes, 1);
  });

test("replacement approval from a retired panel cannot resume a suspended file", async () => {
  const f = fixture();
  await f.service.choose();
  await f.service.suspend();
  const original = f.target.text(),
    connection = f.config(),
    waiting = deferred(),
    approval = deferred();
  let current = true;
  f.change((bank) => (bank.questions[0].text = "new question"));
  const operation = f.service.saveNow(
    () => {
      waiting.resolve();
      return approval.promise;
    },
    { isCurrent: () => current },
  );
  await waiting.promise;
  current = false;
  approval.resolve(true);
  assert.equal(await operation, false);
  assert.equal(f.config().id, connection.id);
  assert.equal(f.config().suspended, "restore");
  assert.equal(f.target.text(), original);
  assert.equal(f.target.handle.writes, 1);
});

for (const state of ["active", "permission", "error"])
  test(`aborting a scoped replacement restores the prior ${state} status`, async () => {
    const f = fixture();
    await f.service.choose();
    if (state === "permission") {
      f.target.permission("prompt");
      await f.service.sync();
    } else if (state === "error") {
      f.change((bank) => (bank.questions[0].text = "new question"));
      f.target.fail(true);
      await f.service.sync();
    }
    const previous = f.service.state(),
      original = f.target.text(),
      connection = f.config(),
      next = f.file("Classyar-QuestionBank(8).json"),
      waiting = deferred(),
      release = deferred(),
      createWritable = next.handle.createWritable;
    assert.equal(previous.state, state);
    let current = true;
    next.handle.createWritable = async () => {
      const stream = await createWritable(),
        write = stream.write;
      stream.write = async (text) => {
        await write(text);
        waiting.resolve();
        await release.promise;
      };
      return stream;
    };
    f.choose(next);
    const operation = f.service.choose({ isCurrent: () => current });
    await waiting.promise;
    current = false;
    release.resolve();
    assert.equal(await operation, false);
    assert.deepEqual(f.service.state(), previous);
    assert.equal(next.handle.aborts, 1);
    assert.equal(next.text(), "");
    assert.equal(f.config().id, connection.id);
    assert.equal(f.target.text(), original);
  });

for (const action of ["choose", "saveNow", "stop"])
  test(`retiring during queued metadata persistence cannot publish a successful manual ${action}`, async () => {
    const f = fixture();
    await f.service.choose();
    const original = f.target.text(),
      connection = f.config(),
      next = f.file("Classyar-QuestionBank(8).json"),
      waiting = deferred(),
      release = deferred(),
      writeBackup = f.repository.writeBackup;
    let current = true;
    f.change((bank) => (bank.questions[0].text = "new question"));
    f.choose(next);
    f.repository.writeBackup = async (config, options) => {
      waiting.resolve();
      await release.promise;
      return writeBackup(config, options);
    };
    const options = { isCurrent: () => current },
      operation =
        action === "saveNow"
          ? f.service.saveNow(undefined, options)
          : f.service[action](options);
    await waiting.promise;
    current = false;
    release.resolve();
    assert.equal(await operation, false);
    assert.deepEqual(f.config(), connection);
    if (action === "stop") {
      assert.equal(f.service.state().state, "active");
      assert.equal(f.target.text(), original);
    } else {
      assert.equal(f.service.state().state, "error");
      assert.match(f.service.state().message, /فایل نوشته شد/);
      if (action === "choose") {
        assert.equal(next.handle.writes, 1);
        assert.equal(f.target.text(), original);
      } else {
        assert.equal(f.target.handle.writes, 2);
        assert.equal(
          JSON.parse(f.target.text()).questions[0].text,
          "new question",
        );
      }
    }
  });
