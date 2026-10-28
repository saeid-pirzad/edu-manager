"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const modals = [],
    requests = [];
  const events = [1, 3, 2].map((id) => ({
    id,
    at: "2026-10-27",
    action: "event-" + id,
    changes: [],
  }));
  const c = vm.createContext({
    workspace: { id: "first" },
    state: {},
    writer: Promise.resolve(),
    readable: true,
    assertWorkspaceReadable() {
      if (!c.readable) throw Error("unavailable");
    },
    transactionDone: async () => {},
    requestPromise: async (value) => value,
    esc: String,
    showModal: (...args) => modals.push(args),
    connection: {
      transaction(names, mode) {
        assert.deepEqual(Array.from(names), ["events", "undo"]);
        assert.equal(mode, "readonly");
        return {
          objectStore(name) {
            return {
              index(indexName) {
                assert.equal(indexName, "workspace");
                return {
                  getAll(id) {
                    requests.push([name, id]);
                    return events;
                  },
                };
              },
              get(id) {
                requests.push([name, id]);
                return { action: "latest" };
              },
            };
          },
        };
      },
    },
  });
  for (const name of [
    "core/async-target.js",
    "history/viewer.js",
    "history/undo.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/workspace", name), "utf8"),
      c,
    );
  return { c, modals, requests };
}
test("history reads events and undo in the same source transaction and preserves pagination", async () => {
  const f = fixture();
  await f.c.openHistoryV24(2);
  assert.deepEqual(f.requests, [
    ["events", "first"],
    ["undo", "first"],
  ]);
  const html = f.modals[0][1];
  assert.ok(html.indexOf("event-3") < html.indexOf("event-2"));
  assert.equal(html.includes("event-1"), false);
  assert.ok(html.includes("history-more"));
  assert.ok(html.includes("latest"));
});
test("history rejects navigation while waiting for queued writes", async () => {
  const f = fixture();
  f.c.writer = {
    catch: async () => {
      f.c.workspace.id = "second";
    },
  };
  await assert.rejects(f.c.openHistoryV24());
  assert.equal(f.requests.length + f.modals.length, 0);
});
for (const kind of ["workspace", "connection", "readability"]) {
  test(`history does not show stale results after ${kind} changes`, async () => {
    const f = fixture();
    f.c.transactionDone = async () => {
      if (kind === "workspace") f.c.workspace.id = "second";
      else if (kind === "connection") f.c.connection = {};
      else f.c.readable = false;
    };
    await assert.rejects(f.c.openHistoryV24());
    assert.equal(f.modals.length, 0);
  });
}
test("history waits for transaction completion before opening its modal", async () => {
  const f = fixture();
  let finish;
  f.c.transactionDone = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = f.c.openHistoryV24();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.modals.length, 0);
  finish();
  await pending;
  assert.equal(f.modals.length, 1);
});
test("history transaction failure produces no partial modal", async () => {
  const f = fixture();
  f.c.transactionDone = async () => {
    throw Error("read failure");
  };
  await assert.rejects(f.c.openHistoryV24(), /read failure/);
  assert.equal(f.modals.length, 0);
});

for (const storeName of ["events", "undo"]) {
  test(`history contains synchronous ${storeName} request failure and waits for abort`, async () => {
    const f = fixture();
    const failure = Error("request failure");
    let rejectDone,
      aborted = 0;
    const done = new Promise((resolve, reject) => {
      rejectDone = reject;
    });
    f.c.transactionDone = () => done;
    const transaction = f.c.connection.transaction;
    f.c.connection.transaction = (...args) => {
      const tx = transaction(...args),
        objectStore = tx.objectStore;
      tx.abort = () => {
        aborted++;
        rejectDone(Error("transaction aborted"));
      };
      tx.objectStore = (name) => {
        if (name === storeName) throw failure;
        return objectStore(name);
      };
      return tx;
    };
    await assert.rejects(f.c.openHistoryV24(), (error) => error === failure);
    assert.equal(aborted, 1);
    assert.equal(f.modals.length, 0);
  });
}

test("history handles a rejected request alongside a synchronous failure", async () => {
  const f = fixture();
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    rejectDone = reject;
  });
  f.c.transactionDone = () => done;
  f.c.connection.transaction = () => ({
    abort() {
      rejectDone(Error("aborted"));
    },
    objectStore(name) {
      if (name === "undo") throw Error("undo request failure");
      return {
        index: () => ({
          getAll: () => Promise.reject(Error("events request failure")),
        }),
      };
    },
  });
  await assert.rejects(f.c.openHistoryV24(), /request failure/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.modals.length, 0);
});

test("history can be reopened after a failed transaction without retaining partial output", async () => {
  const f = fixture();
  f.c.transactionDone = async () => {
    throw Error("failed read");
  };
  await assert.rejects(f.c.openHistoryV24());
  f.c.transactionDone = async () => {};
  await f.c.openHistoryV24();
  assert.equal(f.modals.length, 1);
});
