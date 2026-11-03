"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture({ expected = "old", actual = "new" } = {}) {
  const committed = [],
    local = new Map();
  const draft = {
    kind: "k",
    value: "18",
    classId: "class",
    lid: "lesson",
    sid: "student",
    field: "theory",
  };
  const c = vm.createContext({
    workspace: { id: "year" },
    installationToken: expected,
    RESET_RECORD_KEY: "@installation-reset",
    resetBusy: false,
    connectionRetired: false,
    documentToken: "document",
    draftGeneration: 1,
    drafts: new Map([["grade", draft]]),
    draftWriter: Promise.resolve(),
    draftWritesPending: 0,
    draftRecoveryFailed: false,
    clone: structuredClone,
    setStatus() {},
    draftBaseKey: () => "Edu24.drafts.year.tab",
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => local.set(key, value),
      removeItem: (key) => local.delete(key),
    },
    transactionDone: (tx) => tx.done,
    actual,
  });
  c.connection = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const queued = [];
      let finish,
        fail,
        aborted = false;
      const done = new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      const tx = {
        done,
        abort() {
          aborted = true;
          fail(Error("aborted"));
        },
        objectStore: (name) => ({
          get(key) {
            const request = {};
            queueMicrotask(() => {
              request.result =
                name === "records"
                  ? c.actual
                    ? { key, value: { token: c.actual } }
                    : undefined
                  : undefined;
              request.onsuccess?.();
            });
            return request;
          },
          put(row) {
            queued.push(structuredClone(row));
          },
        }),
      };
      setImmediate(() => {
        if (!aborted) {
          committed.push(...queued);
          finish();
        }
      });
      return tx;
    },
  };
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/drafts/persistence.js"),
      "utf8",
    ),
    c,
  );
  return { c, committed, local, draft };
}
test("stale installation cannot recreate a grade draft after full replacement", async () => {
  const f = fixture();
  await assert.rejects(
    f.c.storeDrafts(),
    (error) => error.code === "INSTALLATION_CHANGED",
  );
  assert.equal(f.committed.length, 0);
  assert.equal(f.local.has("Edu24.drafts.year.tab.document"), false);
  assert.equal(
    f.c.drafts.size,
    1,
    "in-memory input remains available for explicit recovery",
  );
});
for (const token of ["", "same"]) {
  test(
    "matching installation saves grades including legacy marker absence: " +
      JSON.stringify(token),
    async () => {
      const f = fixture({ expected: token, actual: token });
      await f.c.storeDrafts();
      assert.equal(f.committed.length, 1);
      assert.equal(f.committed[0].entries[0].value, "18");
    },
  );
}
test("queued draft keeps the installation token captured at input time", async () => {
  const f = fixture();
  let release;
  f.c.draftWriter = new Promise((resolve) => {
    release = resolve;
  });
  const save = f.c.storeDrafts();
  f.c.installationToken = "new";
  release();
  await assert.rejects(save, (error) => error.code === "INSTALLATION_CHANGED");
  assert.equal(f.committed.length, 0);
});

test("stale draft adoption cannot recreate a consumed-source tombstone after replacement", async () => {
  const f = fixture();
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/collaboration/session-drafts.js"),
      "utf8",
    ),
    f.c,
  );
  const row = {
    key: "Edu24.drafts.year.other.document",
    generation: 1,
    entries: [f.draft],
    updatedAt: "2026-11-03T10:00:00Z",
  };
  await assert.rejects(
    f.c.consumeDraftSource(row, "year", f.c.connection, () => {}),
    (error) => error.code === "INSTALLATION_CHANGED",
  );
  assert.equal(f.committed.length, 0);
  assert.equal(f.local.size, 0);
});

test("an installation mismatch never deletes a different newer local draft", async () => {
  const f = fixture();
  let release;
  f.c.draftWriter = new Promise((resolve) => {
    release = resolve;
  });
  const operation = f.c.storeDrafts();
  const key = "Edu24.drafts.year.tab.document",
    newer = JSON.stringify({ entries: [{ kind: "k", value: "20" }] });
  f.local.set(key, newer);
  release();
  await assert.rejects(
    operation,
    (error) => error.code === "INSTALLATION_CHANGED",
  );
  assert.equal(f.local.get(key), newer);
  assert.equal(f.committed.length, 0);
});
