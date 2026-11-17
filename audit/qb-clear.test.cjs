"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

function load(extra = {}, files = ["domain", "repository", "file-backup"]) {
  const context = vm.createContext({
    structuredClone,
    TextEncoder,
    Uint8Array,
    Event,
    ...extra,
  });
  for (const name of files)
    vm.runInContext(
      fs.readFileSync(`src/features/question-bank/${name}.js`, "utf8"),
      context,
    );
  return context;
}

function repositoryFixture({ holdOpen = false, holdRead = false } = {}) {
  const opening = deferred(),
    reading = deferred(),
    records = new Map(),
    events = [],
    opened = [];
  let finishOpen,
    finishRead,
    failDelete = false,
    transactions = 0;
  const database = {
    transaction(name) {
      assert.equal(name, "bank");
      transactions++;
      const pending = new Map(records);
      let aborted = false;
      const tx = {
        objectStore: () => ({
          get(key) {
            const request = {};
            finishRead = () => {
              request.result = structuredClone(records.get(key));
              try {
                request.onsuccess?.();
              } catch (error) {
                tx.error = error;
                tx.abort();
              }
              queueMicrotask(() => {
                if (aborted) return;
                records.clear();
                for (const [k, value] of pending) records.set(k, value);
                tx.oncomplete?.();
              });
            };
            reading.resolve();
            if (!holdRead) queueMicrotask(() => finishRead());
            return request;
          },
          put: (value, key) => pending.set(key, structuredClone(value)),
          delete(key) {
            if (failDelete) throw Error("configuration removal failed");
            pending.delete(key);
          },
        }),
        abort() {
          aborted = true;
          queueMicrotask(() => tx.onabort?.());
        },
      };
      return tx;
    },
  };
  const context = load({
    indexedDB: {
      open(name) {
        opened.push(name);
        const request = {};
        finishOpen = () => {
          request.result = database;
          request.onsuccess?.();
        };
        opening.resolve();
        if (!holdOpen) queueMicrotask(() => finishOpen());
        return request;
      },
    },
    dispatchEvent: (event) =>
      events.push({ type: event.type, bank: records.get("current") }),
  });
  const original = structuredClone(context.EduQuestionBank.empty());
  original.revision = 8;
  original.courses.push({ id: "math", title: "ریاضی", structure: "chapter" });
  original.units.push({ id: "one", courseId: "math", title: "فصل اول" });
  original.questions.push({
    id: "question",
    unitId: "one",
    type: "essay",
    text: "سؤال",
    answer: "پاسخ",
    explanation: "",
    score: 100,
  });
  records.set("current", structuredClone(original));
  records.set("file-backup", { id: "existing", handle: { name: "old.json" } });
  return {
    R: context.EduQuestionBankRepository,
    original,
    records,
    opened,
    events,
    opening: opening.promise,
    reading: reading.promise,
    transactions: () => transactions,
    finishOpen: () => finishOpen(),
    finishRead: () => finishRead(),
    failDelete: () => (failDelete = true),
  };
}

test("bank clear atomically empties every collection, detaches its file and preserves monotonic revisions", async () => {
  const f = repositoryFixture(),
    school = { schools: [{ id: "school-preserved" }] },
    before = JSON.stringify(school);
  const bank = await f.R.clear(8);
  assert.equal(bank.revision, 9);
  for (const key of ["courses", "units", "questions", "exams"])
    assert.equal(bank[key].length, 0);
  assert.equal(f.records.has("file-backup"), false);
  assert.deepEqual(f.records.get("current"), bank);
  assert.equal(f.transactions(), 1);
  assert.deepEqual(f.opened, ["ClassyarQuestionBank"]);
  assert.equal(JSON.stringify(school), before);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].type, "edu-question-bank-saved");
  assert.equal(f.events[0].bank.revision, 9);
  await assert.rejects(f.R.save(f.original, 8), /پنجره دیگری/);
  assert.equal(f.records.get("current").revision, 9);
  assert.equal(f.events.length, 1);
});

test("bank clear with a stale modal does not even open IndexedDB", async () => {
  const f = repositoryFixture();
  await assert.rejects(f.R.clear(8, { isCurrent: () => false }), /عملیات لغو/);
  assert.equal(f.opened.length, 0);
  assert.equal(f.transactions(), 0);
  assert.deepEqual(f.records.get("current"), f.original);
  assert.equal(f.records.has("file-backup"), true);
});

test("closing during database opening prevents a clear transaction", async () => {
  const f = repositoryFixture({ holdOpen: true });
  let current = true;
  const clearing = f.R.clear(8, { isCurrent: () => current });
  await f.opening;
  current = false;
  f.finishOpen();
  await assert.rejects(clearing, /عملیات لغو/);
  assert.equal(f.transactions(), 0);
  assert.deepEqual(f.records.get("current"), f.original);
  assert.equal(f.records.has("file-backup"), true);
});

test("closing during the revision read rolls back both bank clear and detachment", async () => {
  const f = repositoryFixture({ holdRead: true });
  let current = true;
  const clearing = f.R.clear(8, { isCurrent: () => current });
  await f.reading;
  current = false;
  f.finishRead();
  await assert.rejects(clearing, /عملیات لغو/);
  assert.deepEqual(f.records.get("current"), f.original);
  assert.equal(f.records.has("file-backup"), true);
  assert.equal(f.events.length, 0);
});

test("a concurrent edit invalidates a clear preview without detaching the file", async () => {
  const f = repositoryFixture({ holdRead: true });
  const clearing = f.R.clear(8);
  await f.reading;
  const winner = structuredClone(f.original);
  winner.revision++;
  winner.courses[0].title = "ویرایش جدید";
  f.records.set("current", winner);
  f.finishRead();
  await assert.rejects(clearing, /پنجره دیگری/);
  assert.deepEqual(f.records.get("current"), winner);
  assert.equal(f.records.has("file-backup"), true);
  assert.equal(f.events.length, 0);
});

test("a failed connection deletion rolls back the empty bank too", async () => {
  const f = repositoryFixture();
  f.failDelete();
  await assert.rejects(f.R.clear(8), /configuration removal failed/);
  assert.deepEqual(f.records.get("current"), f.original);
  assert.equal(f.records.has("file-backup"), true);
  assert.equal(f.events.length, 0);
});

function serviceFixture() {
  const context = load({}, ["domain", "file-backup"]),
    D = context.EduQuestionBank,
    timers = new Map();
  let bank = structuredClone(D.empty()),
    config = null,
    text = "",
    opens = 0,
    clears = 0,
    timerId = 0,
    tail = Promise.resolve(),
    clearStarted = deferred(),
    heldClear = null;
  bank.revision = 4;
  bank.courses.push({ id: "course", title: "ریاضی", structure: "chapter" });
  const handle = {
    kind: "file",
    name: "Classyar-QuestionBank.json",
    getFile: async () => ({
      size: Buffer.byteLength(text),
      text: async () => text,
    }),
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    createWritable: async () => {
      opens++;
      let pending;
      return {
        write: async (value) => (pending = value),
        close: async () => (text = pending),
        abort: async () => {},
      };
    },
  };
  const repository = {
    read: async () => structuredClone(bank),
    readBackup: async () => config,
    writeBackup: async (value) => (config = value),
    clear: async (expected, { isCurrent }) => {
      clears++;
      clearStarted.resolve();
      if (heldClear) await heldClear.promise;
      if (!isCurrent()) throw Error("عملیات لغو شد");
      if (bank.revision !== expected)
        throw Error("بانک در پنجره دیگری تغییر کرد");
      bank = structuredClone(D.empty());
      bank.revision = expected + 1;
      config = null;
      return structuredClone(bank);
    },
  };
  const locks = [];
  const host = {
    isSecureContext: true,
    crypto: webcrypto,
    navigator: {
      locks: {
        request(name, action) {
          locks.push(name);
          const operation = tail.then(action);
          tail = operation.catch(() => {});
          return operation;
        },
      },
    },
    showSaveFilePicker: async () => handle,
    setTimeout(fn, ms) {
      timers.set(++timerId, { fn, ms });
      return timerId;
    },
    setInterval(fn, ms) {
      timers.set(++timerId, { fn, ms });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id),
  };
  const create = () =>
    context.EduQuestionBankFileBackup.create(repository, host);
  return {
    service: create(),
    create,
    context,
    repository,
    host,
    handle,
    timers,
    locks,
    text: () => text,
    bank: () => structuredClone(bank),
    config: () => config,
    opens: () => opens,
    clears: () => clears,
    change: () => bank.revision++,
    clearStarted: () => clearStarted.promise,
    holdClear() {
      heldClear = deferred();
      clearStarted = deferred();
      return heldClear;
    },
  };
}

test("service clear preserves the connected JSON and prevents automatic writes from either window", async () => {
  const f = serviceFixture();
  await f.service.init();
  await f.service.choose();
  const peer = f.create();
  await peer.init();
  f.service.schedule();
  assert.ok([...f.timers.values()].some((timer) => timer.ms === 2000));
  const original = f.text(),
    writes = f.opens();
  const empty = await f.service.clear(4);
  assert.equal(empty.revision, 5);
  assert.equal(f.config(), null);
  assert.equal(f.service.state().state, "inactive");
  assert.equal(f.service.state().connected, false);
  assert.equal(f.service.state().name, "");
  assert.equal(f.service.state().savedAt, "");
  assert.equal(f.text(), original);
  assert.equal(f.opens(), writes);
  assert.equal(
    [...f.timers.values()].some((timer) => timer.ms === 2000),
    false,
  );
  assert.equal(await f.service.sync(), false);
  assert.equal(await peer.sync(), false);
  assert.equal(await peer.saveNow(() => true), false);
  assert.equal(f.text(), original);
  assert.equal(f.opens(), writes);
  assert.ok(f.locks.every((name) => name === "ClassyarQuestionBank.file"));
});

test("manual-only banks can clear without picker support or Web Locks", async () => {
  const f = serviceFixture();
  f.host.isSecureContext = false;
  f.host.navigator.locks = undefined;
  await f.service.init();
  const bank = await f.service.clear(4);
  assert.equal(bank.revision, 5);
  assert.equal(bank.courses.length, 0);
  assert.equal(f.opens(), 0);
});

test("clear refuses an existing file connection without Web Locks and changes nothing", async () => {
  const f = serviceFixture();
  await f.service.choose();
  const original = f.text(),
    connection = f.config();
  f.host.navigator.locks = undefined;
  await assert.rejects(f.service.clear(4), /Chrome یا Edge/);
  assert.equal(f.clears(), 0);
  assert.equal(f.config(), connection);
  assert.equal(f.text(), original);
  assert.equal(f.bank().revision, 4);
});

test("clear can detach an old connection when only picker support became unavailable", async () => {
  const f = serviceFixture();
  await f.service.choose();
  const original = f.text();
  f.host.showSaveFilePicker = undefined;
  await f.service.clear(4);
  assert.equal(f.config(), null);
  assert.equal(f.text(), original);
  assert.equal(f.opens(), 1);
});

test("a pending local picker blocks clearing instead of reconnecting after it", async () => {
  const f = serviceFixture(),
    picker = deferred();
  f.host.showSaveFilePicker = () => picker.promise;
  const choosing = f.service.choose();
  await assert.rejects(f.service.clear(4), /انتخاب فایل/);
  assert.equal(f.clears(), 0);
  assert.equal(f.bank().revision, 4);
  assert.equal(f.opens(), 0);
  picker.resolve(f.handle);
  assert.equal(await choosing, true);
});

test("a pending picker in another window cannot write an emptied bank after clear", async () => {
  const f = serviceFixture(),
    picker = deferred(),
    peer = f.create();
  f.host.showSaveFilePicker = () => picker.promise;
  const choosing = peer.choose();
  await f.service.clear(4);
  picker.resolve(f.handle);
  assert.equal(await choosing, false);
  assert.equal(f.opens(), 0);
  assert.equal(f.text(), "");
  assert.equal(f.config(), null);
  assert.equal(f.bank().revision, 5);
  assert.match(peer.state().message, /هنگام انتخاب فایل تغییر کرد/);
});

test("a clear in progress blocks new pickers and duplicate clears", async () => {
  const f = serviceFixture(),
    pending = f.holdClear();
  let pickerCalls = 0;
  f.host.showSaveFilePicker = async () => (++pickerCalls, f.handle);
  const clearing = f.service.clear(4);
  await f.clearStarted();
  assert.equal(await f.service.choose(), false);
  assert.equal(await f.service.saveNow(), false);
  await assert.rejects(f.service.clear(4), /پاک‌سازی/);
  assert.equal(pickerCalls, 0);
  pending.resolve();
  await clearing;
  assert.equal(f.clears(), 1);
});

test("closing a confirmation while clear waits for the file lock preserves the bank and file", async () => {
  const f = serviceFixture(),
    held = deferred();
  await f.service.choose();
  const before = f.text(),
    connection = f.config(),
    blocker = f.host.navigator.locks.request(
      "ClassyarQuestionBank.file",
      () => held.promise,
    );
  let current = true;
  const clearing = f.service.clear(4, { isCurrent: () => current });
  current = false;
  held.resolve();
  await blocker;
  await assert.rejects(clearing, /عملیات لغو/);
  assert.equal(f.bank().revision, 4);
  assert.equal(f.config(), connection);
  assert.equal(f.text(), before);
  assert.equal(f.clears(), 0);
});

test("a rejected stale clear leaves the connection and file intact", async () => {
  const f = serviceFixture();
  await f.service.choose();
  const before = f.text(),
    connection = f.config();
  f.change();
  await assert.rejects(f.service.clear(4), /پنجره دیگری/);
  assert.equal(f.bank().revision, 5);
  assert.equal(f.config(), connection);
  assert.equal(f.text(), before);
  assert.equal(f.opens(), 1);
});

test("text bank names are accepted only for the explicit manual restore mode", () => {
  const f = serviceFixture(),
    check = f.context.EduQuestionBankFileBackup.assertFileName;
  for (const name of [
    "Classyar-QuestionBank.txt",
    "Classyar-QuestionBank(1).txt",
    "Classyar-QuestionBank (12).txt",
  ]) {
    assert.throws(() => check(name));
    assert.doesNotThrow(() => check(name, { allowText: true }));
  }
  for (const name of [
    "Classyar-Classroom.txt",
    "Classyar-QuestionBank-old.txt",
    "Classyar-QuestionBank(0).txt",
    "Classyar-QuestionBank(01).txt",
    "Classyar-QuestionBank.txt.exe",
  ])
    assert.throws(() => check(name, { allowText: true }));
});
