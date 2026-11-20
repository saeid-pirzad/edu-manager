"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
test("welcome banner keeps both database file states independent and escapes names", () => {
  const { context } = fixture();
  vm.runInContext(
    `singleFile = {handle:{name:'Classyar-Classroom.json'},savedAt:'2026-11-18T10:00:00Z'}; singleFilePermissionNeeded = true;`,
    context,
  );
  context.EduQuestionBankFileBackup = {
    service: {
      state: () => ({
        connected: true,
        state: "active",
        name: "Classyar-QuestionBank<script>.json",
        savedAt: "2026-11-17T10:00:00Z",
      }),
    },
  };
  let html = vm.runInContext("welcomeFileSummariesHtml()", context);
  assert.match(html, /data-scope="school" data-state="review"/);
  assert.match(html, /data-scope="bank" data-state="connected"/);
  assert.match(html, /Classyar-QuestionBank&lt;script&gt;.json/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal((html.match(/<time /g) || []).length, 2);
  context.EduQuestionBankFileBackup.service.state = () => ({
    connected: true,
    state: "permission",
    name: "Classyar-QuestionBank.json",
  });
  vm.runInContext("singleFilePermissionNeeded = false", context);
  html = vm.runInContext("welcomeFileSummariesHtml()", context);
  assert.match(html, /data-scope="school" data-state="connected"/);
  assert.match(html, /data-scope="bank" data-state="review"/);
});
test("school summaries retain state precedence when permission, failure and pending writes overlap", () => {
  const { context } = fixture();
  const cases = [
    { connected: false, expected: "inactive" },
    { connected: true, expected: "paused" },
    { connected: true, saved: true, expected: "active" },
    { connected: true, writing: true, expected: "busy" },
    { connected: true, saved: true, writing: true, expected: "active" },
    { connected: true, saved: true, failure: true, expected: "error" },
    { connected: true, failure: true, suspension: true, expected: "paused" },
    {
      connected: true,
      failure: true,
      suspension: true,
      permission: true,
      expected: "permission",
    },
    { connected: false, saved: true, writing: true, expected: "inactive" },
  ];
  for (const item of cases) {
    context.scenario = item;
    vm.runInContext(
      `singleFile = scenario.connected ? {
        handle: {name: 'school<script>.json', requestPermission() {}},
        suspension: scenario.suspension ? 'restore' : undefined
      } : null;
      singleFileFailure = !!scenario.failure;
      singleFilePermissionNeeded = !!scenario.permission;
      singleFileNoticeSaved = !!scenario.saved;
      singleFileWriting = scenario.writing ? Promise.resolve() : null;`,
      context,
    );
    assert.equal(context.singleFileViewState().state, item.expected);
    assert.equal(
      context.singleFileViewState().needsReview,
      !!(item.failure || item.permission || item.suspension),
    );
    const panel = context.singleFilePanel();
    assert.ok(panel.includes('data-state="' + item.expected + '"'));
    assert.doesNotMatch(panel, /<script>/);
  }
});
test("welcome summaries keep school and bank review states independent across all bank connection states", () => {
  const f = fixture();
  let bank;
  f.context.EduQuestionBankFileBackup = {
    service: { state: () => bank },
  };
  for (const schoolReview of [false, true])
    for (const connected of [false, true])
      for (const state of [
        "inactive",
        "active",
        "busy",
        "permission",
        "paused",
        "error",
      ]) {
        bank = { connected, state, name: 'bank<&".json' };
        f.context.schoolReview = schoolReview;
        vm.runInContext(
          `singleFile = {handle: {name: 'school.json'}};
          singleFileFailure = schoolReview;`,
          f.context,
        );
        const html = f.context.welcomeFileSummariesHtml();
        assert.ok(
          html.includes(
            'data-scope="school" data-state="' +
              (schoolReview ? "review" : "connected") +
              '"',
          ),
        );
        const expected = ["permission", "paused", "error"].includes(state)
          ? "review"
          : connected
            ? "connected"
            : "inactive";
        assert.ok(
          html.includes('data-scope="bank" data-state="' + expected + '"'),
        );
        assert.match(html, /bank&lt;&amp;&quot;\.json/);
      }
  assert.equal(f.writes, 0);
  assert.equal(f.snapshots, 0);
  assert.equal(f.getStored(), null);
});
test("painting school summaries preserves button availability and avoids redundant DOM writes", () => {
  const f = fixture(),
    buttons = Object.fromEntries(
      ["choose", "save", "stop"].map((key) => [key, {}]),
    );
  let changes = 0;
  const element = () => {
      let content = "";
      return {
        get innerHTML() {
          return content;
        },
        set innerHTML(value) {
          changes++;
          content = value;
        },
        closest: () => ({
          querySelector: (selector) => buttons[selector.match(/="([^"]+)"/)[1]],
        }),
      };
    },
    welcome = element(),
    summary = element(),
    picker = f.context.window.showSaveFilePicker;
  f.context.document = {
    getElementById: (id) =>
      id === "singleFileSummary"
        ? summary
        : id === "welcomeFileSummary"
          ? welcome
          : null,
  };
  for (const connected of [false, true])
    for (const choosing of [false, true])
      for (const writing of [false, true])
        for (const supported of [false, true]) {
          f.context.connected = connected;
          f.context.choosing = choosing;
          f.context.writing = writing;
          f.context.window.showSaveFilePicker = supported ? picker : undefined;
          vm.runInContext(
            `singleFile = connected ? {handle: {name: 'school.json'}} : null;
            singleFileChoosing = choosing;
            singleFileWriting = writing ? Promise.resolve() : null;`,
            f.context,
          );
          f.context.paintSingleFileBanner();
          assert.equal(
            buttons.choose.disabled,
            !supported || choosing || writing,
          );
          assert.equal(
            buttons.save.disabled,
            !supported || choosing || writing || !connected,
          );
          assert.equal(buttons.stop.disabled, buttons.save.disabled);
          const before = changes;
          f.context.paintSingleFileBanner();
          assert.equal(changes, before);
        }
  assert.equal(f.writes, 0);
  assert.equal(f.getStored(), null);
});
test("bank notice painting retains its own visibility and permission action without changing the school notice", () => {
  const f = fixture(),
    welcome = { innerHTML: "" },
    schoolNotice = { innerHTML: "school notice", hidden: false },
    panel = {
      append(element) {
        element.parentElement = panel;
      },
    };
  let notice, bank, supported;
  f.context.document = {
    getElementById: (id) =>
      id === "questionBankFileBadge"
        ? notice
        : id === "welcomeFileSummary"
          ? welcome
          : id === "singleFileBadge"
            ? schoolNotice
            : null,
    querySelector: () => panel,
    createElement: () => (notice = { dataset: {} }),
  };
  f.context.EduQuestionBankFileBackup = {
    service: { state: () => bank, supported: () => supported },
  };
  for (const state of ["error", "permission", "paused", "active", "inactive"])
    for (const connected of [false, true])
      for (supported of [false, true]) {
        bank = {
          state,
          connected,
          name: "bank<script>.json",
          message: "check <file>",
        };
        f.context.paintQuestionBankFileNotice();
        const visible =
          state === "error" ||
          (connected && ["permission", "paused"].includes(state));
        assert.equal(notice.hidden, !visible);
        if (visible) {
          assert.equal(notice.dataset.state, state);
          assert.equal(notice.parentElement, panel);
          assert.doesNotMatch(notice.innerHTML, /<script>|<file>/);
          assert.equal(
            notice.innerHTML.includes(
              'data-workspace-action="question-bank-file-permission"',
            ),
            state === "permission" && supported,
          );
        }
        assert.deepEqual(schoolNotice, {
          innerHTML: "school notice",
          hidden: false,
        });
      }
  assert.equal(f.writes, 0);
  assert.equal(f.getStored(), null);
});
function fixture() {
  let contents = "",
    modified = 1,
    writes = 0,
    aborts = 0,
    fail = false;
  let stored = null,
    snapshots = 0,
    sourceReads = 0,
    pollCallback = null,
    pollDelay = null,
    debounceCallback = null,
    debounceDelay = null;
  const deliveries = [],
    pickerCalls = [],
    nameStorage = new Map();
  const handle = {
    name: "Classyar-Classroom.json",
    getFile: async () => {
      const captured = contents;
      return {
        name: handle.name,
        size: captured.length,
        lastModified: modified,
        text: async () => captured,
      };
    },
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
    crypto: require("node:crypto").webcrypto,
    TextEncoder,
    ready: true,
    periodLoading: false,
    blocked: false,
    resetBusy: false,
    fullRestoreBusy: false,
    connectionRetired: false,
    document: { getElementById: () => null },
    window: {
      showSaveFilePicker: async (options) => {
        pickerCalls.push(options);
        return handle;
      },
    },
    localStorage: {
      getItem: (key) => nameStorage.get(key) ?? null,
      setItem: (key, value) => nameStorage.set(key, String(value)),
      removeItem: (key) => nameStorage.delete(key),
    },
    navigator: {},
    setInterval(callback, delay) {
      pollCallback = callback;
      pollDelay = delay;
      return 1;
    },
    clearInterval() {
      pollCallback = null;
    },
    setTimeout(callback, delay) {
      debounceCallback = callback;
      debounceDelay = delay;
      return 1;
    },
    clearTimeout() {
      debounceCallback = null;
    },
    confirm: () => true,
    esc: (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;"),
    setStatus() {},
    validateFullBackup(value) {
      if (
        value?.format !== "EduManager.FullBackup" ||
        (value.version !== undefined && value.version !== 2) ||
        !Array.isArray(value.stores?.records)
      )
        throw Error("invalid full backup");
    },
    legacyBackupReplacement(value) {
      if (
        value?.format !== undefined ||
        !Array.isArray((value?.db || value)?.schools)
      )
        throw Error("unsupported legacy backup");
      return {
        format: "EduManager.FullBackup",
        version: 2,
        stores: { records: [] },
      };
    },
    uid: () => "file-" + Math.random(),
    broadcast() {},
    recordFullBackupDelivery: (value) => deliveries.push(value),
    readRecord: async () => stored && { ...stored },
    transactionDone: (tx) => tx.finished,
    connection: {
      transaction: () => {
        let finish, fail;
        let pending = 0;
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
              pending++;
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
                if (!--pending) finish();
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
    sourceValue: 1,
    readBackupSourceSignature: async () => {
      sourceReads++;
      return "source:" + context.sourceValue;
    },
    snapshotInstallation: async ({ onSourceSignature } = {}) => {
      snapshots++;
      const value = context.sourceValue;
      onSourceSignature?.("source:" + value);
      return {
        format: "EduManager.FullBackup",
        exportedAt: new Date().toISOString(),
        stores: { records: [{ value }] },
      };
    },
  });
  for (const name of [
    "src/domain/calendar.js",
    "src/ui/backup-automatic-view.js",
    "src/workspace/backups/single-file-name.js",
    "src/domain/single-file-policy.js",
    "src/workspace/backups/single-file-view.js",
    "src/workspace/backups/single-file.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", name), "utf8"),
      context,
    );
  return {
    context,
    handle,
    deliveries,
    pickerCalls,
    nameStorage,
    get contents() {
      return contents;
    },
    get writes() {
      return writes;
    },
    get aborts() {
      return aborts;
    },
    get snapshots() {
      return snapshots;
    },
    get sourceReads() {
      return sourceReads;
    },
    get pollDelay() {
      return pollDelay;
    },
    get debounceDelay() {
      return debounceDelay;
    },
    async tick() {
      assert.equal(typeof pollCallback, "function");
      pollCallback();
      await vm.runInContext("singleFileWriting", context);
    },
    async runDebounce() {
      assert.equal(typeof debounceCallback, "function");
      const callback = debounceCallback;
      debounceCallback = null;
      callback();
      await vm.runInContext("singleFileWriting", context);
    },
    externalEdit() {
      contents = "external";
      modified++;
    },
    replaceContents(value) {
      contents = value;
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
test("classroom rejects another feature's filename before reading, confirming or writing", async () => {
  const f = fixture();
  let reads = 0,
    confirms = 0;
  f.handle.name = "Classyar-QuestionBank.json";
  f.handle.getFile = async () => {
    reads++;
    throw Error("must not read");
  };
  f.context.confirm = () => {
    confirms++;
    return true;
  };
  await assert.rejects(f.context.chooseSingleFile(), /Classyar-Classroom/);
  assert.equal(reads, 0);
  assert.equal(confirms, 0);
  assert.equal(f.writes, 0);
  assert.equal(f.getStored(), null);
});
test("classroom file selection rejects a question-bank backup before confirmation or writes", async () => {
  const f = fixture(),
    bank =
      "\uFEFF" +
      JSON.stringify({
        format: "classyar-question-bank",
        version: 1,
        courses: [],
        units: [],
        questions: [],
        exams: [],
        revision: 0,
      });
  f.handle.getFile = async () => ({
    size: bank.length,
    lastModified: 1,
    text: async () => bank,
  });
  let confirms = 0;
  f.context.confirm = () => {
    confirms++;
    return true;
  };
  await assert.rejects(f.context.chooseSingleFile(), /بانک سؤال/);
  assert.equal(confirms, 0);
  assert.equal(f.writes, 0);
  assert.equal(f.getStored(), null);
  assert.equal(f.contents, "");
});
test("an existing classroom connection cannot overwrite a question-bank file even with matching metadata and explicit permission", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const stored = f.getStored(),
    before = f.contents,
    writes = f.writes;
  const bank = JSON.stringify({ format: "classyar-question-bank", version: 1 });
  f.handle.getFile = async () => ({
    size: stored.size,
    lastModified: stored.modified,
    text: async () => bank,
  });
  f.context.sourceValue++;
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(await f.context.resumeSingleFile(), false);
  assert.equal(f.writes, writes);
  assert.equal(f.contents, before);
});
for (const [label, contents] of [
  ["corrupt JSON", "{broken"],
  ["foreign JSON", '{"format":"unrelated-backup","data":[1,2,3]}'],
  ["unrecognized JSON", '{"hello":"world"}'],
  ["scalar JSON", "null"],
  ["array JSON", "[]"],
  [
    "invalid FullBackup",
    '{"format":"EduManager.FullBackup","version":2,"stores":{}}',
  ],
  [
    "unsupported FullBackup version",
    '{"format":"EduManager.FullBackup","version":999,"stores":{"records":[]}}',
  ],
])
  test("a correct classroom filename cannot authorize " + label, async () => {
    const f = fixture();
    f.replaceContents(contents);
    let confirmations = 0;
    f.context.confirm = () => {
      confirmations++;
      return true;
    };
    await assert.rejects(f.context.chooseSingleFile(), /فایل تغییر نکرد/);
    assert.equal(confirmations, 0);
    assert.equal(f.writes, 0);
    assert.equal(f.getStored(), null);
    assert.equal(f.contents, contents);
  });
for (const [label, contents] of [
  ["empty new file", ""],
  [
    "validated full backup",
    JSON.stringify({
      format: "EduManager.FullBackup",
      version: 2,
      stores: { records: [] },
    }),
  ],
  [
    "validated legacy backup",
    JSON.stringify({ version: 25, db: { schools: [] } }),
  ],
])
  test("classroom selection permits " + label, async () => {
    const f = fixture();
    f.replaceContents(contents);
    let confirmations = 0;
    f.context.confirm = () => {
      confirmations++;
      return true;
    };
    assert.equal(await f.context.chooseSingleFile(), true);
    assert.equal(confirmations, contents ? 1 : 0);
    assert.equal(f.writes, 1);
    assert.ok(f.getStored().savedAt);
    assert.equal(JSON.parse(f.contents).format, "EduManager.FullBackup");
  });
test("a rejected destination preserves the previous connection and its confirmed file", async () => {
  const f = fixture(),
    bad = fixture();
  await f.context.chooseSingleFile();
  const before = f.contents,
    connectionId = f.getStored().connectionId;
  bad.replaceContents('{"format":"foreign-backup"}');
  f.context.window.showSaveFilePicker = async () => bad.handle;
  await assert.rejects(f.context.chooseSingleFile(), /فایل تغییر نکرد/);
  assert.equal(f.getStored().connectionId, connectionId);
  assert.equal(f.contents, before);
  assert.equal(bad.writes, 0);
  assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
});
for (const contents of [
  "{broken",
  '{"format":"unrelated-backup","data":[1,2,3]}',
  '{"format":"EduManager.FullBackup","version":999,"stores":{"records":[]}}',
])
  test(
    "matching metadata cannot bypass destination content validation: " +
      contents,
    async () => {
      const f = fixture();
      await f.context.chooseSingleFile();
      const stored = f.getStored(),
        before = f.contents,
        writes = f.writes,
        deliveries = f.deliveries.length;
      f.handle.getFile = async () => ({
        name: f.handle.name,
        size: stored.size,
        lastModified: stored.modified,
        text: async () => contents,
      });
      f.context.sourceValue++;
      assert.equal(await f.context.syncSingleFile(), false);
      assert.equal(await f.context.resumeSingleFile(), false);
      assert.equal(f.writes, writes);
      assert.equal(f.contents, before);
      assert.equal(f.deliveries.length, deliveries);
      assert.equal(vm.runInContext("singleFileTimer", f.context), null);
    },
  );
test("unreadable nonempty destination content cannot authorize a classroom write", async () => {
  const f = fixture();
  f.handle.getFile = async () => ({
    name: f.handle.name,
    size: 20,
    lastModified: 1,
  });
  await assert.rejects(f.context.chooseSingleFile(), /خواندن محتوای فایل/);
  assert.equal(f.writes, 0);
  assert.equal(f.getStored(), null);
});
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
    format: "EduManager.FullBackup",
    version: 2,
    stores: { records: [{ value: 2 }, { value: 3 }] },
  });
  await f.context.syncSingleFile();
  assert.equal(JSON.parse(f.contents).stores.records.length, 2);
  f.context.snapshotInstallation = async () => ({
    format: "EduManager.FullBackup",
    version: 2,
    stores: { records: [] },
  });
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(
    f.writes,
    2,
    "empty replacement requires a separate acknowledgement",
  );
  await f.context.resumeSingleFile();
  assert.equal(JSON.parse(f.contents).stores.records.length, 0);
  assert.equal(f.writes, 3);
});

test("a restored file connection stays suspended on reopen until the named overwrite is acknowledged", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const previous = f.contents;
  f.setStored({ ...f.getStored(), suspension: "restore" });
  await f.context.restoreSingleFile();
  assert.equal(f.writes, 1);
  assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  assert.equal(await f.context.syncSingleFile(), false);
  let warning;
  f.context.confirm = (message) => {
    warning = message;
    return false;
  };
  assert.equal(await f.context.resumeSingleFile(), false);
  assert.match(warning, /Classyar-Classroom\.json/);
  assert.equal(f.contents, previous);
  assert.equal(f.getStored().suspension, "restore");
  f.context.confirm = () => true;
  assert.equal(await f.context.resumeSingleFile(), true);
  assert.equal(f.getStored().suspension, undefined);
  assert.equal(f.writes, 2);
});

test("a confirmed content baseline blocks an empty automatic startup snapshot without touching the file", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const previous = f.contents;
  assert.ok(f.getStored().contentBaseline);
  f.context.snapshotInstallation = async () => ({
    format: "EduManager.FullBackup",
    version: 2,
    stores: { records: [] },
  });
  await f.context.restoreSingleFile();
  assert.equal(f.contents, previous);
  assert.equal(f.writes, 1);
  assert.equal(f.getStored().suspension, "source-drop");
  assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  await f.context.restoreSingleFile();
  assert.equal(
    f.writes,
    1,
    "reopening must not bypass the persisted suspension",
  );
});

test("ordinary student edits and small deletions sync while a large drop is suspended", async () => {
  const f = fixture();
  let students = 24;
  f.context.snapshotInstallation = async () => ({
    format: "EduManager.FullBackup",
    version: 2,
    stores: {
      records: [
        {
          logical: "class:c",
          value: {
            students: Array.from({ length: students }, (_, id) => ({ id })),
            lessons: [],
          },
        },
      ],
    },
  });
  await f.context.chooseSingleFile();
  students = 23;
  f.context.sourceValue++;
  await f.tick();
  assert.equal(f.writes, 2);
  students = 4;
  f.context.sourceValue++;
  await f.tick();
  assert.equal(f.writes, 2);
  assert.equal(f.getStored().suspension, "source-drop");
  f.context.confirm = () => false;
  assert.equal(await f.context.resumeSingleFile(), false);
  f.context.confirm = () => true;
  assert.equal(await f.context.resumeSingleFile(), true);
  assert.equal(f.getStored().contentBaseline.students, 4);
});

test("a legacy saved connection derives its safety baseline from the still-unchanged JSON before startup publishing", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const previous = f.contents,
    stored = f.getStored();
  delete stored.contentBaseline;
  f.setStored(stored);
  const getFile = f.handle.getFile;
  f.handle.getFile = async () => ({
    ...(await getFile()),
    text: async () => f.contents,
  });
  f.context.snapshotInstallation = async () => ({
    format: "EduManager.FullBackup",
    version: 2,
    stores: { records: [] },
  });
  await f.context.restoreSingleFile();
  assert.equal(f.contents, previous);
  assert.equal(f.writes, 1);
  assert.equal(f.getStored().suspension, "source-drop");
});

test("archiving students preserves the educational baseline and does not suspend autosave", async () => {
  const f = fixture();
  let archived = false;
  const roster = Array.from({ length: 24 }, (_, id) => ({ id }));
  f.context.snapshotInstallation = async () => ({
    format: "EduManager.FullBackup",
    version: 2,
    stores: {
      records: [
        {
          logical: "class:c",
          value: {
            students: archived ? [] : roster,
            archivedStudents: archived ? roster : [],
            lessons: [],
          },
        },
      ],
    },
  });
  await f.context.chooseSingleFile();
  archived = true;
  f.context.sourceValue++;
  await f.tick();
  assert.equal(f.writes, 2);
  assert.equal(f.getStored().contentBaseline.students, 24);
  assert.equal(f.getStored().suspension, undefined);
});

test("recorded zero grades count as content and loss of the complete educational payload is blocked even with class shells retained", async () => {
  const f = fixture();
  let populated = true;
  f.context.snapshotInstallation = async () => ({
    format: "EduManager.FullBackup",
    version: 2,
    stores: {
      records: [
        { logical: "meta", value: { layout: [{ id: "s", classes: ["c"] }] } },
        {
          logical: "class:c",
          value: {
            students: [],
            lessons: populated
              ? [{ kardaneshScores: { student: { practical: 0, theory: 0 } } }]
              : [],
          },
        },
      ],
    },
  });
  await f.context.chooseSingleFile();
  assert.equal(f.getStored().contentBaseline.grades, 2);
  const previous = f.contents;
  populated = false;
  f.context.sourceValue++;
  await f.tick();
  assert.equal(f.contents, previous);
  assert.equal(f.writes, 1);
  assert.equal(f.getStored().suspension, "source-drop");
});

test("acknowledging a suspended connection never bypasses externally edited file checks", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.setStored({ ...f.getStored(), suspension: "restore" });
  await f.context.restoreSingleFile();
  f.externalEdit();
  assert.equal(await f.context.resumeSingleFile(), false);
  assert.equal(f.contents, "external");
  assert.equal(f.writes, 1);
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
for (const [label, alter] of [
  ["truncated", (json) => json.slice(0, -1)],
  ["different valid JSON", (json) => json.replace('"value":1', '"value":9')],
])
  for (const connected of [false, true])
    test(`${label} write cannot confirm ${connected ? "an existing" : "the first"} classroom backup`, async () => {
      const f = fixture();
      if (connected) await f.context.chooseSingleFile();
      const savedAt = f.getStored()?.savedAt || "",
        deliveries = f.deliveries.length,
        create = f.handle.createWritable;
      f.handle.createWritable = async () => {
        const stream = await create(),
          write = stream.write;
        stream.write = async (json) => write(alter(json));
        return stream;
      };
      const saved = connected
        ? await f.context.syncSingleFile()
        : await f.context.chooseSingleFile();
      assert.equal(saved, false);
      assert.equal(f.getStored().savedAt, savedAt);
      assert.equal(f.deliveries.length, deliveries);
      assert.equal(vm.runInContext("singleFileTimer", f.context), null);
      assert.equal(vm.runInContext("singleFileFailure", f.context), true);
      assert.match(
        vm.runInContext("singleFileMessage", f.context),
        /مطابقت ندارد.*ذخیره تأیید نشد/,
      );
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

test("the backup hub keeps the connected school filename visible after a successful save", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const html = f.context.singleFilePanel();
  assert.match(html, /class="backup-file-summary" id="singleFileSummary"/);
  assert.ok(html.includes(f.handle.name));
  assert.match(html, /آخرین ذخیره/);
  assert.match(
    html,
    /class="single-file-notice backup-automatic-notice" id="singleFileStatus" data-backup-file-status hidden/,
  );
});

test("the school filename summary updates without requiring the home banner", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const summary = { innerHTML: "" };
  f.context.document = {
    getElementById: (id) => (id === "singleFileSummary" ? summary : null),
  };
  f.context.paintSingleFileBanner();
  assert.ok(summary.innerHTML.includes(f.handle.name));
  assert.match(summary.innerHTML, /آخرین ذخیره/);
  await f.context.disableSingleFile();
  assert.match(summary.innerHTML, /بدون اتصال/);
  assert.match(summary.innerHTML, /انتخاب نشده/);
  assert.ok(!summary.innerHTML.includes(f.handle.name));
});

test("missing picker offers a manual backup without pretending automatic support", () => {
  const f = fixture();
  delete f.context.window.showSaveFilePicker;
  assert.match(
    f.context.singleFilePanel(),
    /<details class="backup-automatic" open>/,
  );
  assert.match(
    f.context.singleFilePanel(),
    /<summary><span>ذخیره خودکار<\/span>/,
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
    format: "EduManager.FullBackup",
    version: 2,
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
  const existing = JSON.stringify({
    format: "EduManager.FullBackup",
    version: 2,
    stores: { records: [] },
  });
  f.replaceContents(existing);
  f.context.confirm = () => false;
  await f.context.chooseSingleFile();
  assert.equal(f.writes, 0);
  assert.equal(f.contents, existing);
});
test("external changes pause writing rather than overwriting another editor or tab", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.externalEdit();
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(f.contents, "external");
  assert.match(vm.runInContext("singleFileMessage", f.context), /بیرون/);
});
test("external edits during the final connection check never open or overwrite a stream", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const getFile = f.handle.getFile,
    readRecord = f.context.readRecord,
    writes = f.writes;
  let inspected = false,
    changed = false,
    opened = 0;
  f.handle.getFile = async () => {
    const file = await getFile();
    inspected = true;
    return file;
  };
  f.context.readRecord = async (store, key) => {
    const row = await readRecord(store, key);
    if (inspected && !changed && store === "records") {
      changed = true;
      f.externalEdit();
    }
    return row;
  };
  f.handle.createWritable = async () => {
    opened++;
    throw Error("must not open");
  };
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(changed, true);
  assert.equal(opened, 0);
  assert.equal(f.writes, writes);
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
  assert.match(
    html,
    /<strong class="backup-file-purpose">اطلاعات مدرسه<[/]strong>/,
  );
  assert.match(
    html,
    /<bdi class="backup-notice-filename" dir="ltr">Classyar-Classroom\.json<[/]bdi>/,
  );
  assert.match(html, /class="backup-file-detail"/);
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
  const panel = f.context.singleFilePanel();
  assert.doesNotMatch(panel, /single-file-permission-action/);
  assert.match(panel, /data-backup-file-action="save"[^>]*>ذخیره اکنون/);
  assert.equal((panel.match(/<button/g) || []).length, 3);
});

test("permission notices escape filenames in both visible text and accessible action labels", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.context.singleFileStatus("Needs permission", { permission: true });
  f.handle.name = 'Classyar-<img src=x onerror="unsafe">&.json';
  const html = f.context.singleFileNoticeHtml();
  assert.match(
    html,
    /<bdi class="backup-notice-filename" dir="ltr">Classyar-&lt;img src=x onerror=&quot;unsafe&quot;&gt;&amp;\.json<[/]bdi>/,
  );
  assert.match(
    html,
    /aria-label="اجازه مجدد برای فایل اطلاعات مدرسه: Classyar-&lt;img src=x onerror=&quot;unsafe&quot;&gt;&amp;\.json"/,
  );
  assert.doesNotMatch(html, /<img/);
  assert.equal(
    (html.match(/data-workspace-action="single-file-save"/g) || []).length,
    1,
  );
});

test("bank permission retry directly calls only its service without approving replacement or writing the school backup", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const before = {
    contents: f.contents,
    writes: f.writes,
    snapshots: f.snapshots,
    stored: f.getStored(),
  };
  let callerActive = true,
    calls = 0;
  const result = Promise.resolve(false);
  f.context.document.querySelector = () => null;
  f.context.EduQuestionBankFileBackup = {
    service: {
      supported: () => true,
      state: () => ({ state: "permission", connected: true }),
      saveNow(...args) {
        assert.equal(callerActive, true);
        assert.equal(
          args[0],
          undefined,
          "replacement approval must stay omitted",
        );
        assert.equal(typeof args[1].isCurrent, "function");
        assert.equal(args[1].isCurrent(), true);
        calls++;
        return result;
      },
    },
  };
  const pending = f.context.renewQuestionBankFilePermission();
  callerActive = false;
  assert.equal(calls, 1, "service must be called before the click returns");
  assert.equal(pending, result);
  assert.equal(await pending, false);
  assert.equal(f.contents, before.contents);
  assert.equal(f.writes, before.writes);
  assert.equal(f.snapshots, before.snapshots);
  assert.deepEqual(f.getStored(), before.stored);
});

test("bank permission retry does nothing when unsupported, no longer needed, or blocked by a bank confirmation or save", () => {
  const f = fixture();
  let calls = 0,
    supported = true,
    state = "permission",
    blocked = false;
  f.context.document.querySelector = () => (blocked ? {} : null);
  assert.equal(f.context.renewQuestionBankFilePermission(), false);
  f.context.EduQuestionBankFileBackup = {
    service: {
      supported: () => supported,
      state: () => ({ state }),
      saveNow() {
        calls++;
      },
    },
  };
  supported = false;
  assert.equal(f.context.renewQuestionBankFilePermission(), false);
  supported = true;
  for (state of ["inactive", "active", "paused", "busy", "error"])
    assert.equal(f.context.renewQuestionBankFilePermission(), false);
  state = "permission";
  blocked = true;
  assert.equal(f.context.renewQuestionBankFilePermission(), false);
  assert.equal(calls, 0);
  assert.equal(f.writes, 0);
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
  assert.doesNotMatch(status.innerHTML, /single-file-permission-action/);
  f.handle.requestPermission = async () => "denied";
  assert.equal(await f.context.resumeSingleFile(), false);
  assert.equal(f.contents, before);
  assert.equal(f.writes, 1);
  assert.match(badge.innerHTML, /single-file-permission-action/);
  assert.doesNotMatch(status.innerHTML, /single-file-permission-action/);
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

test("three unchanged automatic poll ticks perform only source checks and no full snapshots or writes", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const initial = f.contents,
    delivered = f.deliveries.length;
  for (let tick = 0; tick < 3; tick++) await f.tick();
  assert.equal(f.snapshots, 1);
  assert.equal(f.sourceReads, 3);
  assert.equal(f.writes, 1);
  assert.equal(f.contents, initial);
  assert.equal(f.deliveries.length, delivered);
  assert.equal(f.pollDelay, 30000);
});

test("manual save and explicit permission retry still force a full confirmed write when data is unchanged", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  await f.tick();
  assert.equal(f.snapshots, 1);
  assert.equal(await f.context.syncSingleFile(), true);
  assert.equal(await f.context.resumeSingleFile(), true);
  assert.equal(f.snapshots, 3);
  assert.equal(f.writes, 3);
  assert.equal(f.deliveries.length, 3);
});

test("a changed source causes exactly one new compact automatic snapshot and subsequent idle ticks skip it", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.context.sourceValue = 2;
  await f.tick();
  assert.equal(JSON.parse(f.contents).stores.records[0].value, 2);
  assert.equal(f.writes, 2);
  assert.equal(f.snapshots, 2);
  assert.equal(f.contents, JSON.stringify(JSON.parse(f.contents)));
  await f.tick();
  assert.equal(f.snapshots, 2);
  assert.equal(f.writes, 2);
});

test("a source mutation during the stream is not marked clean and schedules a catch-up snapshot", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.context.sourceValue = 2;
  const create = f.handle.createWritable;
  let mutate = true;
  f.handle.createWritable = async () => {
    const stream = await create(),
      write = stream.write;
    stream.write = async (value) => {
      await write(value);
      if (mutate) {
        mutate = false;
        f.context.sourceValue = 3;
        f.context.scheduleSingleFile();
      }
    };
    return stream;
  };
  await f.tick();
  assert.equal(JSON.parse(f.contents).stores.records[0].value, 2);
  assert.equal(
    vm.runInContext("singleFileSavedSource.signature", f.context),
    "source:2",
  );
  assert.equal(f.debounceDelay, 2000);
  await f.runDebounce();
  assert.equal(JSON.parse(f.contents).stores.records[0].value, 3);
  assert.equal(f.snapshots, 3);
  assert.equal(f.writes, 3);
  await f.tick();
  assert.equal(f.snapshots, 3);
});

test("an edit arriving after capture but before snapshot return is detected on the next automatic tick", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.context.sourceValue = 2;
  const snapshot = f.context.snapshotInstallation;
  f.context.snapshotInstallation = async (options) => {
    const captured = await snapshot(options);
    f.context.sourceValue = 3;
    return captured;
  };
  await f.tick();
  assert.equal(JSON.parse(f.contents).stores.records[0].value, 2);
  assert.equal(
    vm.runInContext("singleFileSavedSource.signature", f.context),
    "source:2",
  );
  f.context.snapshotInstallation = snapshot;
  await f.tick();
  assert.equal(JSON.parse(f.contents).stores.records[0].value, 3);
  assert.equal(f.writes, 3);
});

test("external file edits are rejected even when the automatic source fingerprint is otherwise unchanged", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  f.externalEdit();
  await f.tick();
  assert.equal(f.contents, "external");
  assert.equal(f.writes, 1);
  assert.equal(f.snapshots, 1);
  assert.equal(vm.runInContext("singleFileFailure", f.context), true);
  assert.match(vm.runInContext("singleFileMessage", f.context), /بیرون/);
});

for (const code of ["GRADE_DRAFT_INVALID", "BACKUP_DRAFT_UNREADABLE"]) {
  test(
    "the automatic clean check never hides " +
      code +
      " behind an unchanged signature",
    async () => {
      const f = fixture();
      await f.context.chooseSingleFile();
      const initial = f.contents;
      f.context.readBackupSourceSignature = async () => {
        throw Object.assign(Error("Synthetic invalid draft"), { code });
      };
      await f.tick();
      assert.equal(f.snapshots, 1);
      assert.equal(f.writes, 1);
      assert.equal(f.contents, initial);
      assert.equal(vm.runInContext("singleFileFailure", f.context), true);
      assert.match(
        vm.runInContext("singleFileMessage", f.context),
        /Synthetic invalid draft/,
      );
    },
  );
}

test("automatic idle checks still reject a replaced installation before reading or writing the source", async () => {
  const f = fixture();
  let epoch = "old";
  f.context.installationToken = "old";
  f.context.durableInstallationToken = "old";
  f.context.readRecord = async (store) =>
    store === "records" ? { value: { token: epoch } } : f.getStored();
  await f.context.chooseSingleFile();
  const initial = f.contents;
  epoch = "replacement";
  await f.tick();
  assert.equal(f.contents, initial);
  assert.equal(f.sourceReads, 0);
  assert.equal(f.snapshots, 1);
  assert.equal(f.writes, 1);
  assert.match(vm.runInContext("singleFileMessage", f.context), /جایگزین/);
});

test("file selection proposes the stable classroom name directly in the click before any await", async () => {
  const f = fixture(),
    expected = "Classyar-Classroom.json",
    choosing = f.context.chooseSingleFile();
  assert.equal(f.pickerCalls.length, 1, "picker cannot wait for a snapshot");
  assert.equal(f.pickerCalls[0].suggestedName, expected);
  assert.equal(f.pickerCalls[0].excludeAcceptAllOption, true);
  assert.equal(await choosing, true);
});

test("automatic writes and save-now retain the same file and do not consume new filename numbers", async () => {
  const f = fixture();
  await f.context.chooseSingleFile();
  const metadata = f.nameStorage.get("EduManager.singleFileNames"),
    selected = f.getStored().handle;
  f.context.sourceValue++;
  await f.tick();
  await f.context.resumeSingleFile();
  assert.equal(f.writes, 3);
  assert.equal(f.pickerCalls.length, 1);
  assert.equal(f.getStored().handle, selected);
  assert.equal(f.nameStorage.get("EduManager.singleFileNames"), metadata);
  await f.context.chooseSingleFile();
  assert.equal(
    f.pickerCalls[1].suggestedName,
    f.pickerCalls[0].suggestedName.replace(/\.json$/, "(1).json"),
  );
});

test("choosing a fresh numbered file preserves the earlier file and only updates the new handle", async () => {
  const f = fixture(),
    next = fixture();
  await f.context.chooseSingleFile();
  const previous = f.contents;
  let proposed;
  f.context.window.showSaveFilePicker = async (options) => {
    proposed = options.suggestedName;
    next.handle.name = proposed;
    return next.handle;
  };
  f.context.sourceValue = 2;
  assert.equal(await f.context.chooseSingleFile(), true);
  assert.equal(
    proposed,
    f.pickerCalls[0].suggestedName.replace(/\.json$/, "(1).json"),
  );
  assert.equal(f.contents, previous);
  assert.equal(f.writes, 1);
  assert.equal(next.writes, 1);
  assert.equal(f.getStored().handle, next.handle);
  f.context.sourceValue = 3;
  await f.context.resumeSingleFile();
  assert.equal(next.writes, 2);
  assert.equal(f.contents, previous);
  assert.equal(JSON.parse(next.contents).stores.records[0].value, 3);
  await f.context.disableSingleFile();
  const lastNewFile = next.contents;
  assert.equal(await f.context.syncSingleFile(), false);
  assert.equal(next.contents, lastNewFile);
  assert.equal(f.contents, previous);
});

test("canceling a new picker retains the prior connection, file and next available filename", async () => {
  const f = fixture(),
    proposals = [];
  await f.context.chooseSingleFile();
  const previous = f.contents,
    connectionId = f.getStored().connectionId;
  f.context.window.showSaveFilePicker = async (options) => {
    proposals.push(options.suggestedName);
    throw Object.assign(Error("cancel"), { name: "AbortError" });
  };
  await f.context.chooseSingleFile();
  assert.equal(f.contents, previous);
  assert.equal(f.getStored().connectionId, connectionId);
  assert.equal(vm.runInContext("singleFileTimer", f.context), 1);
  f.context.window.showSaveFilePicker = async (options) => {
    proposals.push(options.suggestedName);
    return f.handle;
  };
  assert.equal(await f.context.chooseSingleFile(), true);
  assert.equal(proposals[1], proposals[0]);
  assert.equal(f.writes, 2);
});

test("rejecting existing-file overwrite keeps its contents and releases the unused suggestion", async () => {
  const f = fixture(),
    existing = fixture(),
    proposals = [];
  await f.context.chooseSingleFile();
  const previous = f.contents,
    connectionId = f.getStored().connectionId;
  const existingContents = JSON.stringify({
    format: "EduManager.FullBackup",
    version: 2,
    stores: { records: [] },
  });
  existing.replaceContents(existingContents);
  f.context.confirm = () => false;
  f.context.window.showSaveFilePicker = async (options) => {
    proposals.push(options.suggestedName);
    return existing.handle;
  };
  await f.context.chooseSingleFile();
  assert.equal(existing.contents, existingContents);
  assert.equal(existing.writes, 0);
  assert.equal(f.contents, previous);
  assert.equal(f.getStored().connectionId, connectionId);
  assert.equal(vm.runInContext("singleFileTimer", f.context), 1);
  f.context.confirm = () => true;
  assert.equal(await f.context.chooseSingleFile(), true);
  assert.equal(proposals[1], proposals[0]);
  assert.equal(existing.writes, 1);
  assert.equal(f.contents, previous);
});

test("a failed first write consumes the created file's number without touching the previous backup", async () => {
  const f = fixture(),
    next = fixture(),
    retry = fixture(),
    proposals = [];
  await f.context.chooseSingleFile();
  const previous = f.contents;
  next.failWrites();
  f.context.window.showSaveFilePicker = async (options) => {
    proposals.push(options.suggestedName);
    return proposals.length === 1 ? next.handle : retry.handle;
  };
  assert.equal(await f.context.chooseSingleFile(), false);
  assert.equal(f.contents, previous);
  assert.equal(next.writes, 0);
  assert.equal(await f.context.chooseSingleFile(), true);
  assert.match(proposals[0], /\(1\)\.json$/);
  assert.match(proposals[1], /\(2\)\.json$/);
  assert.equal(f.contents, previous);
});

test("repeated clicks cannot start concurrent pickers or reserve unused duplicate names", async () => {
  const f = fixture();
  let releasePicker,
    calls = 0;
  f.context.window.showSaveFilePicker = () => {
    calls++;
    return new Promise((resolve) => {
      releasePicker = resolve;
    });
  };
  const first = f.context.chooseSingleFile();
  assert.equal(calls, 1);
  assert.equal(await f.context.chooseSingleFile(), false);
  assert.equal(calls, 1);
  releasePicker(f.handle);
  assert.equal(await first, true);
  f.context.window.showSaveFilePicker = async (options) => {
    assert.match(options.suggestedName, /\(1\)\.json$/);
    return f.handle;
  };
  assert.equal(await f.context.chooseSingleFile(), true);
});

test("unavailable filename metadata never prevents an otherwise valid automatic backup", async () => {
  const f = fixture();
  f.context.localStorage = {
    getItem() {
      throw Error("unavailable");
    },
    setItem() {
      throw Error("unavailable");
    },
  };
  assert.equal(await f.context.chooseSingleFile(), true);
  await f.context.chooseSingleFile();
  assert.equal(f.writes, 2);
  assert.match(f.pickerCalls[1].suggestedName, /\(1\)\.json$/);
});

function deferredFileAction() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

for (const change of ["navigation", "backup tab", "connection", "installation"])
  test(`a pending classroom picker cannot publish after ${change} changes`, async () => {
    const f = fixture(),
      next = fixture();
    f.context.state = { view: "backups" };
    f.context.installationToken = "original";
    f.context.durableInstallationToken = "original";
    f.context.readRecord = async (store) =>
      store === "records"
        ? { value: { token: f.context.durableInstallationToken } }
        : f.getStored();
    let activeTab = "school";
    f.context.backupHubSession = {
      isCurrent: (tab) => activeTab === tab,
    };
    await f.context.chooseSingleFile();
    const previous = f.getStored(),
      contents = f.contents,
      pending = deferredFileAction();
    f.context.window.showSaveFilePicker = () => pending.promise;
    const choosing = f.context.chooseSingleFile();
    if (change === "navigation") f.context.state.view = "schools";
    else if (change === "backup tab") activeTab = "bank";
    else if (change === "connection")
      f.context.connection = { ...f.context.connection };
    else {
      f.context.installationToken = "replacement";
      f.context.durableInstallationToken = "replacement";
    }
    pending.resolve(next.handle);
    await assert.rejects(choosing, {
      code: "SINGLE_FILE_CONTEXT_CHANGED",
    });
    assert.equal(f.getStored().connectionId, previous.connectionId);
    assert.equal(f.contents, contents);
    assert.equal(f.writes, 1);
    assert.equal(next.writes, 0);
    assert.equal(next.contents, "");
    assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
  });

test("an abandoned picker preserves the restored installation's new file configuration", async () => {
  const f = fixture(),
    next = fixture();
  f.context.installationToken = "original";
  f.context.durableInstallationToken = "original";
  f.context.readRecord = async (store) =>
    store === "records"
      ? { value: { token: f.context.durableInstallationToken } }
      : f.getStored();
  await f.context.chooseSingleFile();
  const contents = f.contents,
    pending = deferredFileAction();
  f.context.window.showSaveFilePicker = () => pending.promise;
  const choosing = f.context.chooseSingleFile();
  f.context.connection = { ...f.context.connection };
  f.context.installationToken = "restored";
  f.context.durableInstallationToken = "restored";
  const restored = {
    key: "EduManager.singleFile",
    connectionId: "restored-file",
    handle: next.handle,
    suspension: "restore",
  };
  f.setStored(restored);
  f.context.restoredFileForAudit = restored;
  vm.runInContext(
    "pauseSingleFile(); singleFile = restoredFileForAudit",
    f.context,
  );
  pending.resolve(next.handle);
  await assert.rejects(choosing, { code: "SINGLE_FILE_CONTEXT_CHANGED" });
  assert.equal(f.getStored().connectionId, restored.connectionId);
  assert.equal(vm.runInContext("singleFile", f.context), restored);
  assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  assert.equal(f.contents, contents);
  assert.equal(next.writes, 0);
  assert.equal(next.contents, "");
});

test("navigation during destination reading preserves the existing connection and its active timer", async () => {
  const f = fixture(),
    next = fixture();
  f.context.state = { view: "backups" };
  await f.context.chooseSingleFile();
  const previous = f.getStored(),
    contents = f.contents,
    reading = deferredFileAction(),
    entered = deferredFileAction();
  next.replaceContents(contents);
  const getFile = next.handle.getFile;
  next.handle.getFile = async () => {
    const file = await getFile();
    file.text = () => {
      entered.resolve();
      return reading.promise;
    };
    return file;
  };
  let confirmations = 0;
  f.context.confirm = () => {
    confirmations++;
    return true;
  };
  f.context.window.showSaveFilePicker = async () => next.handle;
  const choosing = f.context.chooseSingleFile();
  await entered.promise;
  f.context.state.view = "schools";
  reading.resolve(contents);
  await assert.rejects(choosing, { code: "SINGLE_FILE_CONTEXT_CHANGED" });
  assert.equal(confirmations, 0);
  assert.equal(f.getStored().connectionId, previous.connectionId);
  assert.equal(f.contents, contents);
  assert.equal(next.contents, contents);
  assert.equal(next.writes, 0);
  assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
});

for (const connected of [false, true])
  test(`file selection compares the original ${connected ? "connected" : "disconnected"} configuration inside its transaction`, async () => {
    const f = fixture(),
      next = fixture();
    if (connected) await f.context.chooseSingleFile();
    const contents = f.contents,
      previous = vm.runInContext("singleFile", f.context),
      originalTransaction = f.context.connection.transaction;
    let replaced = false;
    f.context.connection.transaction = (...args) => {
      if (!replaced) {
        replaced = true;
        f.setStored({
          key: "EduManager.singleFile",
          connectionId: "newer-peer-file",
          handle: next.handle,
        });
      }
      return originalTransaction(...args);
    };
    f.context.window.showSaveFilePicker = async () => next.handle;
    await assert.rejects(f.context.chooseSingleFile(), {
      code: "SINGLE_FILE_CONNECTION_CHANGED",
    });
    assert.equal(f.getStored().connectionId, "newer-peer-file");
    assert.equal(vm.runInContext("singleFile", f.context), previous);
    assert.equal(f.contents, contents);
    assert.equal(next.contents, "");
    assert.equal(next.writes, 0);
    assert.equal(
      vm.runInContext("singleFileTimer !== null", f.context),
      connected,
    );
  });

for (const permission of ["granted", "denied"])
  test(`an abandoned ${permission} permission request neither writes nor pauses the existing automatic backup`, async () => {
    const f = fixture();
    f.context.state = { view: "backups" };
    await f.context.chooseSingleFile();
    const previous = f.getStored(),
      contents = f.contents,
      pending = deferredFileAction();
    f.handle.requestPermission = () => pending.promise;
    const saving = f.context.resumeSingleFile();
    f.context.state.view = "schools";
    pending.resolve(permission);
    await assert.rejects(saving, { code: "SINGLE_FILE_CONTEXT_CHANGED" });
    assert.equal(f.getStored().connectionId, previous.connectionId);
    assert.equal(f.contents, contents);
    assert.equal(f.writes, 1);
    assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
    assert.equal(
      vm.runInContext("singleFilePermissionNeeded", f.context),
      false,
    );
  });

test("a manual disconnect abandoned before its storage callback preserves the configuration and restarts its prior timer", async () => {
  const f = fixture();
  f.context.state = { view: "backups" };
  await f.context.chooseSingleFile();
  const previous = f.getStored(),
    contents = f.contents,
    stopping = f.context.disableSingleFile();
  f.context.state.view = "schools";
  await assert.rejects(stopping, { code: "SINGLE_FILE_CONTEXT_CHANGED" });
  assert.equal(f.getStored().connectionId, previous.connectionId);
  assert.equal(
    vm.runInContext("singleFile", f.context).connectionId,
    previous.connectionId,
  );
  assert.equal(f.contents, contents);
  assert.equal(f.writes, 1);
  assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
});

test("background automatic backups remain active after leaving the backup page", async () => {
  const f = fixture();
  f.context.state = { view: "backups" };
  await f.context.chooseSingleFile();
  f.context.state.view = "schools";
  f.context.sourceValue++;
  await f.tick();
  assert.equal(f.writes, 2);
  assert.equal(
    JSON.parse(f.contents).stores.records[0].value,
    f.context.sourceValue,
  );
  assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
});

for (const action of ["choose", "save"])
  for (const phase of ["snapshot", "stream"])
    test(`a manual ${action} abandoned during its ${phase} preserves files, configuration and the previous automatic timer`, async () => {
      const f = fixture(),
        next = fixture();
      f.context.state = { view: "backups" };
      await f.context.chooseSingleFile();
      const previous = f.getStored(),
        contents = f.contents,
        pending = deferredFileAction(),
        entered = deferredFileAction(),
        destination = action === "choose" ? next : f;
      if (action === "choose")
        f.context.window.showSaveFilePicker = async () => next.handle;
      if (phase === "snapshot") {
        const snapshot = f.context.snapshotInstallation;
        f.context.snapshotInstallation = async (...args) => {
          entered.resolve();
          await pending.promise;
          return snapshot(...args);
        };
      } else {
        const open = destination.handle.createWritable;
        destination.handle.createWritable = async () => {
          const stream = await open();
          return {
            ...stream,
            async write(value) {
              await stream.write(value);
              entered.resolve();
              await pending.promise;
            },
          };
        };
      }
      const operation =
        action === "choose"
          ? f.context.chooseSingleFile()
          : f.context.resumeSingleFile();
      await entered.promise;
      f.context.state.view = "schools";
      pending.resolve();
      await assert.rejects(operation, { code: "SINGLE_FILE_CONTEXT_CHANGED" });
      assert.equal(f.getStored().connectionId, previous.connectionId);
      assert.equal(
        vm.runInContext("singleFile", f.context).connectionId,
        previous.connectionId,
      );
      assert.equal(f.contents, contents);
      assert.equal(f.writes, 1);
      assert.equal(next.contents, "");
      assert.equal(next.writes, 0);
      assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
      assert.equal(vm.runInContext("singleFileFailure", f.context), false);
      if (phase === "stream") assert.equal(destination.aborts, 1);
    });

test("returning to the school tab does not revive a pending picker from its earlier visit", async () => {
  const f = fixture(),
    next = fixture();
  f.context.state = { view: "backups" };
  let generation = 0;
  f.context.backupHubSession = {
    captureTab: () => {
      const captured = generation;
      return () => captured === generation;
    },
  };
  await f.context.chooseSingleFile();
  const previous = f.getStored(),
    pending = deferredFileAction();
  f.context.window.showSaveFilePicker = () => pending.promise;
  const choosing = f.context.chooseSingleFile();
  generation += 2;
  pending.resolve(next.handle);
  await assert.rejects(choosing, { code: "SINGLE_FILE_CONTEXT_CHANGED" });
  assert.equal(f.getStored().connectionId, previous.connectionId);
  assert.equal(next.writes, 0);
  assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
});

test("a bank permission retry carries the banner page's lifetime without coupling to the school file", async () => {
  const f = fixture(),
    pending = deferredFileAction();
  f.context.state = { view: "schools" };
  f.context.document.querySelector = () => null;
  let supplied,
    calls = 0;
  f.context.EduQuestionBankFileBackup = {
    service: {
      supported: () => true,
      state: () => ({ state: "permission" }),
      saveNow(approval, options) {
        assert.equal(approval, undefined);
        supplied = options;
        calls++;
        return pending.promise.then(() => options.isCurrent());
      },
    },
  };
  const saving = f.context.renewQuestionBankFilePermission();
  assert.equal(calls, 1, "request stays in the explicit click gesture");
  assert.equal(supplied.isCurrent(), true);
  f.context.temporarySchoolFile = { connectionId: "school-file" };
  vm.runInContext("singleFile = temporarySchoolFile", f.context);
  assert.equal(
    supplied.isCurrent(),
    true,
    "school connection remains independent",
  );
  f.context.state.view = "classes";
  pending.resolve();
  assert.equal(await saving, false);
  assert.equal(f.writes, 0);
  assert.equal(f.getStored(), null);
});

for (const tab of ["school", "bank"])
  test(`the bank permission banner remains usable from the active ${tab} backup tab and expires when that tab changes`, () => {
    const f = fixture();
    f.context.state = { view: "backups", backupTab: tab };
    f.context.document.querySelector = () => null;
    let generation = 0,
      supplied;
    f.context.backupHubSession = {
      captureTab(expected) {
        assert.equal(expected, tab);
        const captured = generation;
        return () => captured === generation;
      },
    };
    f.context.EduQuestionBankFileBackup = {
      service: {
        supported: () => true,
        state: () => ({ state: "permission" }),
        saveNow(approval, options) {
          assert.equal(approval, undefined);
          supplied = options;
          return true;
        },
      },
    };
    assert.equal(f.context.renewQuestionBankFilePermission(), true);
    assert.equal(supplied.isCurrent(), true);
    generation++;
    assert.equal(supplied.isCurrent(), false);
    assert.equal(f.writes, 0);
  });

for (const action of ["choose", "save"])
  test(`a manual ${action} interrupted after close starts reports its partial file result explicitly`, async () => {
    const f = fixture(),
      next = fixture();
    f.context.state = { view: "backups" };
    await f.context.chooseSingleFile();
    const previous = f.getStored(),
      pending = deferredFileAction(),
      entered = deferredFileAction(),
      destination = action === "choose" ? next : f,
      open = destination.handle.createWritable;
    if (action === "choose")
      f.context.window.showSaveFilePicker = async () => next.handle;
    destination.handle.createWritable = async () => {
      const stream = await open();
      return {
        ...stream,
        async close() {
          entered.resolve();
          await pending.promise;
          return stream.close();
        },
      };
    };
    const operation =
      action === "choose"
        ? f.context.chooseSingleFile()
        : f.context.resumeSingleFile();
    await entered.promise;
    f.context.state.view = "schools";
    pending.resolve();
    await assert.rejects(operation, (error) => {
      assert.equal(error.code, "SINGLE_FILE_CONTEXT_CHANGED");
      assert.equal(error.fileCommitStarted, true);
      assert.match(error.message, /ممکن است فایل تغییر کرده باشد/);
      return true;
    });
    assert.equal(
      JSON.parse(destination.contents).format,
      "EduManager.FullBackup",
    );
    assert.equal(destination.writes, action === "choose" ? 1 : 2);
    assert.equal(f.getStored().connectionId, previous.connectionId);
    assert.equal(
      f.deliveries.length,
      1,
      "the interrupted write is never reported as delivered",
    );
    assert.equal(vm.runInContext("singleFileTimer", f.context), null);
  });

for (const action of ["picker", "permission", "snapshot"])
  test(`a late ${action} rejection from an abandoned manual action cannot fail the healthy existing backup`, async () => {
    const f = fixture(),
      next = fixture();
    f.context.state = { view: "backups" };
    await f.context.chooseSingleFile();
    const previous = f.getStored(),
      contents = f.contents,
      entered = deferredFileAction();
    let reject;
    const pending = new Promise((_resolve, fail) => {
      reject = fail;
    });
    let operation;
    if (action === "picker") {
      f.context.window.showSaveFilePicker = () => pending;
      operation = f.context.chooseSingleFile();
    } else if (action === "permission") {
      f.handle.requestPermission = () => pending;
      operation = f.context.resumeSingleFile();
    } else {
      f.context.window.showSaveFilePicker = async () => next.handle;
      f.context.snapshotInstallation = () => {
        entered.resolve();
        return pending;
      };
      operation = f.context.chooseSingleFile();
      await entered.promise;
    }
    f.context.state.view = "schools";
    reject(Error("late file failure"));
    await assert.rejects(operation, { code: "SINGLE_FILE_CONTEXT_CHANGED" });
    assert.equal(f.getStored().connectionId, previous.connectionId);
    assert.equal(f.contents, contents);
    assert.equal(next.writes, 0);
    assert.notEqual(vm.runInContext("singleFileTimer", f.context), null);
    assert.equal(vm.runInContext("singleFileFailure", f.context), false);
  });

async function restoredFileFixture() {
  const original = fixture(),
    source = fixture();
  await original.context.chooseSingleFile();
  const previous = original.contents;
  const text = JSON.stringify(await original.context.snapshotInstallation());
  source.replaceContents(text);
  source.handle.name = "Classyar-Classroom(2).json";
  const file = await source.handle.getFile();
  original.context.workspace = { id: "restored-workspace" };
  original.context.installationToken = "";
  const target = {
    connectionId: "restored-source",
    handle: source.handle,
    modified: file.lastModified,
    size: file.size,
    savedAt: "",
    suspension: "restore-source",
    restoreSourceHash: await original.context.singleFileRestoreHash(text),
  };
  original.context.target = target;
  vm.runInContext(
    "pauseSingleFile(); singleFile = target; singleFileSavedSource = null;",
    original.context,
  );
  original.setStored({ key: "EduManager.singleFile", ...target });
  return { original, source, target, previous, text, file };
}

test("restore continuation writes and polls only its selected source, leaving the old connected file unchanged", async () => {
  const { original, source, target, previous } = await restoredFileFixture();
  const writesBefore = original.writes;
  assert.equal(
    await original.context.continueRestoredSingleFile(
      target,
      Promise.resolve(true),
    ),
    true,
  );
  assert.equal(original.writes, writesBefore);
  assert.equal(original.contents, previous);
  assert.equal(source.writes, 1);
  assert.equal(original.getStored().handle, source.handle);
  assert.ok(original.getStored().savedAt);
  assert.equal(original.getStored().suspension, undefined);
  assert.equal(
    original.getStored().restoreSourceHash,
    await original.context.singleFileRestoreHash(source.contents),
  );
  original.context.sourceValue++;
  await original.tick();
  assert.equal(source.writes, 2);
  assert.equal(original.contents, previous);
});

test("permission refusal restores a pending source and save-now grants only that new source without an old-file overwrite prompt", async () => {
  const { original, source, target, previous } = await restoredFileFixture();
  assert.equal(
    await original.context.continueRestoredSingleFile(
      target,
      Promise.resolve(false),
    ),
    false,
  );
  assert.equal(original.getStored().handle, source.handle);
  assert.equal(source.writes, 0);
  assert.equal(original.contents, previous);
  assert.equal(
    vm.runInContext("singleFilePermissionNeeded", original.context),
    true,
  );
  original.context.confirm = () => {
    throw Error("Restore source has already been explicitly approved");
  };
  assert.equal(await original.context.resumeSingleFile(), true);
  assert.equal(source.writes, 1);
  assert.equal(original.contents, previous);
});

test("same-size and same-timestamp source mutation after the final connection check never opens a restore-source stream", async () => {
  const { original, source, target, previous, text, file } =
    await restoredFileFixture();
  let reads = 0,
    streams = 0;
  const writable = source.handle.createWritable;
  source.handle.createWritable = (...args) => {
    streams++;
    return writable(...args);
  };
  const changed = text.replace('"value":1', '"value":2');
  assert.notEqual(changed, text);
  assert.equal(changed.length, text.length);
  source.handle.getFile = async () => ({
    ...file,
    text: async () => (++reads >= 3 ? changed : text),
  });
  assert.equal(
    await original.context.continueRestoredSingleFile(
      target,
      Promise.resolve(true),
    ),
    false,
  );
  assert.equal(streams, 0);
  assert.equal(source.writes, 0);
  assert.equal(original.contents, previous);
  assert.equal(original.context.ready, true);
  assert.equal(original.context.blocked, false);
  assert.equal(original.getStored().suspension, "restore-source");
});

test("disk failure while continuing a successful restore leaves the restored database usable and never resumes the old file", async () => {
  const { original, source, target, previous } = await restoredFileFixture();
  source.failWrites();
  assert.equal(
    await original.context.continueRestoredSingleFile(
      target,
      Promise.resolve(true),
    ),
    false,
  );
  assert.equal(original.context.ready, true);
  assert.equal(original.context.blocked, false);
  assert.equal(original.contents, previous);
  assert.equal(source.writes, 0);
  assert.equal(original.getStored().handle, source.handle);
  assert.equal(vm.runInContext("singleFileTimer", original.context), null);
});

test("a stale post-restore permission completion cannot write or resume either file", async () => {
  const { original, source, target, previous } = await restoredFileFixture();
  let allow;
  const pending = original.context.continueRestoredSingleFile(
    target,
    new Promise((resolve) => {
      allow = resolve;
    }),
  );
  original.context.installationToken = "replacement";
  allow(true);
  assert.equal(await pending, false);
  assert.equal(source.writes, 0);
  assert.equal(original.contents, previous);
  assert.equal(vm.runInContext("singleFileTimer", original.context), null);
});

test("restored-source permission never approves a later whole-data loss without separate replacement consent", async () => {
  const { original, source, target, previous } = await restoredFileFixture();
  const backup = {
    format: "EduManager.FullBackup",
    stores: {
      records: [
        {
          logical: "class:source",
          value: { students: Array.from({ length: 12 }, (_, id) => ({ id })) },
        },
      ],
    },
  };
  const text = JSON.stringify(backup);
  source.replaceContents(text);
  const file = await source.handle.getFile();
  Object.assign(target, {
    modified: file.lastModified,
    size: file.size,
    restoreSourceHash: await original.context.singleFileRestoreHash(text),
    contentBaseline:
      original.context.EduSingleFilePolicy.contentBaseline(backup),
  });
  original.setStored({ key: "EduManager.singleFile", ...target });
  // The currently restored installation has since lost its educational data.
  assert.equal(
    await original.context.continueRestoredSingleFile(
      target,
      Promise.resolve(true),
    ),
    false,
  );
  assert.equal(source.writes, 0);
  assert.equal(source.contents, text);
  assert.equal(original.contents, previous);
  assert.equal(original.getStored().suspension, "source-drop");
  let asked = 0;
  original.context.confirm = () => {
    asked++;
    return false;
  };
  assert.equal(await original.context.resumeSingleFile(), false);
  assert.equal(asked, 1);
  assert.equal(source.writes, 0);
});
