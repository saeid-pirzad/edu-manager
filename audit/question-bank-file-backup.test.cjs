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
    readBackup: async () =>
      config ? { ...config, counts: { ...config.counts } } : null,
    writeBackup: async (value) => {
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
          abort: async () => {},
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
