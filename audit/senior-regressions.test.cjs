"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (name) =>
  fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function draftsFixture() {
  const gate = deferred(),
    writes = [],
    modals = [];
  const item = {
    kind: "k",
    classId: "c",
    lid: "l",
    sid: "s",
    field: "theory",
    value: "19",
  };
  const key = "Edu24.drafts.A.other.document";
  const c = vm.createContext({
    workspace: { id: "A" },
    state: {},
    connection: {},
    drafts: new Map(),
    tabId: "self",
    documentToken: "document",
    assertWorkspaceReadable() {},
    persistedGradeDrafts: async () => {
      await gate.promise;
      return [{ key, entries: [item] }];
    },
    storeDrafts: async () => {
      writes.push({
        workspace: c.workspace.id,
        entries: [...c.drafts.values()],
      });
    },
    reviewDrafts: () => modals.push("review"),
    showModal: () => modals.push("list"),
    esc: String,
  });
  vm.runInContext(read("src/domain/grade-drafts.js"), c);
  const persistence = read("src/workspace/drafts/persistence.js");
  vm.runInContext(
    persistence.slice(
      0,
      persistence.indexOf("async function persistedGradeDrafts"),
    ),
    c,
  );
  vm.runInContext(read("src/workspace/core/async-target.js"), c);
  vm.runInContext(read("src/workspace/collaboration/session-drafts.js"), c);
  let consumed = 0;
  c.consumeDraftSource = async () => {
    consumed++;
  };
  return { c, key, item, gate, writes, modals, consumed: () => consumed };
}
test("draft adoption rejects period and connection changes before touching local entries", async () => {
  for (const change of [
    (c) => {
      c.workspace = { id: "B" };
    },
    (c) => {
      c.connection = {};
    },
  ]) {
    const f = draftsFixture();
    const operation = f.c.adoptDrafts(f.key);
    change(f.c);
    f.gate.resolve();
    await assert.rejects(operation);
    assert.equal(f.c.drafts.size, 0);
    assert.equal(f.writes.length, 0);
    assert.equal(f.consumed(), 0);
  }
});
test("draft collision retains both local edits and the untouched source", async () => {
  const f = draftsFixture();
  const local = { ...f.item, value: "17" };
  f.c.drafts.set(f.c.inputKey(local), local);
  f.gate.resolve();
  await assert.rejects(f.c.adoptDrafts(f.key), /هیچ ورودی جایگزین نشد/);
  assert.equal(f.c.drafts.get(f.c.inputKey(local)).value, "17");
  assert.equal(f.item.value, "19");
  assert.equal(f.writes.length, 0);
  assert.equal(f.consumed(), 0);
});
test("draft adoption stops source consumption and modal rendering after navigation during persistence", async () => {
  const f = draftsFixture();
  f.c.storeDrafts = async () => {
    f.c.workspace = { id: "B" };
    f.c.drafts.clear();
  };
  f.gate.resolve();
  await assert.rejects(f.c.adoptDrafts(f.key));
  assert.equal(f.consumed(), 0);
  assert.equal(f.modals.length, 0);
});
test("draft imports serialize and successful imports require review", async () => {
  const f = draftsFixture();
  const first = f.c.adoptDrafts(f.key);
  await assert.rejects(f.c.adoptDrafts(f.key), /در حال انجام/);
  f.gate.resolve();
  await first;
  assert.equal(f.writes[0].workspace, "A");
  assert.equal(f.writes[0].entries[0].review, true);
  assert.equal(f.consumed(), 1);
  assert.deepEqual(f.modals, ["review"]);
});
test("other-session draft listing cannot open in a different period", async () => {
  const f = draftsFixture();
  const operation = f.c.openOtherDrafts();
  f.c.workspace = { id: "B" };
  f.gate.resolve();
  await assert.rejects(operation);
  assert.equal(f.modals.length, 0);
});

test("native print refuses unvalidated, stale and pending output", () => {
  let root = null;
  const c = vm.createContext({
    fileMode: false,
    busy: 0,
    drafts: new Map(),
    draftWritesPending: 0,
    draftRecoveryFailed: false,
    readable: true,
    assertWorkspaceContext() {
      if (!c.readable) throw Error("stale");
    },
    document: {
      getElementById: () => root,
      createElement: () => ({
        remove() {
          root = null;
        },
      }),
      body: {
        append(value) {
          root = value;
        },
      },
    },
  });
  vm.runInContext(read("src/workspace/reports/printing.js"), c);
  c.beforeReportPrint();
  assert.match(root.textContent, /دکمه/);
  for (const flag of [
    "busy",
    "draftWritesPending",
    "draftRecoveryFailed",
    "stale",
  ]) {
    root = {
      remove() {
        root = null;
      },
    };
    vm.runInContext("printAuthorization = { id: 'A', revision: 1 };", c);
    if (flag === "stale") c.readable = false;
    else c[flag] = 1;
    c.beforeReportPrint();
    assert.match(root.textContent, /چاپ انجام نشد/);
    c.readable = true;
    if (flag !== "stale") c[flag] = 0;
  }
  root = {
    remove() {
      root = null;
    },
  };
  vm.runInContext("printAuthorization = { id: 'A', revision: 1 };", c);
  c.beforeReportPrint();
  assert.equal(root.textContent, undefined);
});

test("validated report button authorizes printing and rejects stale snapshots before preparation", async () => {
  let root = null,
    prints = 0,
    preparations = 0;
  const c = vm.createContext({
    fileMode: false,
    busy: 0,
    drafts: new Map(),
    draftWritesPending: 0,
    draftRecoveryFailed: false,
    writer: Promise.resolve(),
    captureWorkspaceContext: () => ({ id: "A", revision: 1 }),
    flushDrafts: async () => {},
    assertReportSnapshot: async () => {},
    assertWorkspaceContext() {},
    handleError: (error) => {
      throw error;
    },
    document: { getElementById: () => root },
    window: {
      print() {
        c.beforeReportPrint();
        prints++;
      },
    },
  });
  vm.runInContext(read("src/workspace/reports/printing.js"), c);
  c.preparePrint = () => {
    preparations++;
    root = {};
  };
  assert.equal(await c.printReport(null), true);
  assert.equal(prints, 1);
  assert.equal(preparations, 1);
  c.assertReportSnapshot = async () => {
    throw Error("stale");
  };
  await assert.rejects(
    c.printReport(null, { context: { id: "A", revision: 1 } }),
    /stale/,
  );
  assert.equal(preparations, 1);
  assert.equal(prints, 1);
});

test("service worker blocks updates with another app window and permits retry after it closes", async () => {
  const handlers = new Map(),
    messages = [];
  let clients = [],
    activations = 0,
    completion;
  const c = vm.createContext({
    URL,
    self: {
      location: { href: "https://example.test/app/service-worker.js" },
      addEventListener: (name, callback) => handlers.set(name, callback),
      clients: { matchAll: async () => clients },
      skipWaiting: async () => {
        activations++;
      },
    },
  });
  vm.runInContext(read("service-worker.js"), c);
  const source = {
    id: "one",
    postMessage: (message) => messages.push(message.type),
  };
  const request = async () => {
    handlers.get("message")({
      data: { type: "APPLY_UPDATE" },
      source,
      waitUntil: (promise) => {
        completion = promise;
      },
    });
    await completion;
  };
  clients = [
    { id: "one", url: "https://example.test/app/EduManager.html" },
    { id: "two", url: "https://example.test/app/EduManager.html" },
  ];
  await request();
  assert.equal(activations, 0);
  assert.deepEqual(messages, ["UPDATE_BLOCKED"]);
  clients.pop();
  clients.push({ id: "unrelated", url: "https://example.test/another-app/" });
  await request();
  assert.equal(activations, 1);
});
