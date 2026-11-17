"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture({ holdOpen = false, holdRead = false } = {}) {
  let stored, finishOpen, finishRead, readStarted;
  const metrics = { opens: 0, transactions: 0, puts: 0, savedEvents: 0 };
  const reading = new Promise((resolve) => (readStarted = resolve));
  const database = {
    transaction() {
      metrics.transactions++;
      let aborted = false,
        pending;
      const transaction = {
        objectStore: () => ({
          get() {
            const request = {};
            finishRead = () => {
              request.result = structuredClone(stored);
              request.onsuccess?.();
              queueMicrotask(() => {
                if (aborted) return;
                if (pending !== undefined) stored = pending;
                transaction.oncomplete?.();
              });
            };
            readStarted();
            if (!holdRead) queueMicrotask(() => finishRead());
            return request;
          },
          put(value) {
            metrics.puts++;
            pending = structuredClone(value);
          },
        }),
        abort() {
          aborted = true;
          queueMicrotask(() => transaction.onabort?.());
        },
      };
      return transaction;
    },
  };
  const context = vm.createContext({
    structuredClone,
    TextEncoder,
    Event,
    indexedDB: {
      open() {
        metrics.opens++;
        const request = {};
        finishOpen = () => {
          request.result = database;
          request.onsuccess?.();
        };
        if (!holdOpen) queueMicrotask(() => finishOpen());
        return request;
      },
    },
    dispatchEvent(event) {
      if (event.type === "edu-question-bank-saved") metrics.savedEvents++;
    },
  });
  for (const name of ["domain", "repository"])
    vm.runInContext(
      fs.readFileSync(`src/features/question-bank/${name}.js`, "utf8"),
      context,
    );
  stored = structuredClone(context.EduQuestionBank.empty());
  stored.revision = 4;
  const original = JSON.stringify(stored);
  const incoming = structuredClone(stored);
  incoming.courses.push({
    id: "restored",
    title: "Restored course",
    structure: "chapter",
  });
  return {
    repository: context.EduQuestionBankRepository,
    incoming,
    original,
    metrics,
    reading,
    stored: () => structuredClone(stored),
    finishOpen: () => finishOpen(),
    finishRead: () => finishRead(),
    replace: (value) => (stored = structuredClone(value)),
  };
}

test("a stale backup panel cannot open a transaction or publish a saved event", async () => {
  const f = fixture();
  await assert.rejects(
    f.repository.save(f.incoming, 4, { isCurrent: () => false }),
    /عملیات لغو شد/,
  );
  assert.deepEqual(f.metrics, {
    opens: 0,
    transactions: 0,
    puts: 0,
    savedEvents: 0,
  });
  assert.equal(JSON.stringify(f.stored()), f.original);
});

test("closing a panel while IndexedDB opens prevents a restore transaction", async () => {
  const f = fixture({ holdOpen: true });
  let current = true;
  const operation = f.repository.save(f.incoming, 4, {
    isCurrent: () => current,
  });
  current = false;
  f.finishOpen();
  await assert.rejects(operation, /عملیات لغو شد/);
  assert.equal(f.metrics.transactions, 0);
  assert.equal(f.metrics.puts, 0);
  assert.equal(f.metrics.savedEvents, 0);
  assert.equal(JSON.stringify(f.stored()), f.original);
});

test("closing a panel during the revision read aborts without replacing the bank", async () => {
  const f = fixture({ holdRead: true });
  let current = true;
  const operation = f.repository.save(f.incoming, 4, {
    isCurrent: () => current,
  });
  await f.reading;
  current = false;
  f.finishRead();
  await assert.rejects(operation, /عملیات لغو شد/);
  assert.equal(f.metrics.transactions, 1);
  assert.equal(f.metrics.puts, 0);
  assert.equal(f.metrics.savedEvents, 0);
  assert.equal(JSON.stringify(f.stored()), f.original);
});

test("ordinary two-argument saves retain their optimistic revision and saved event", async () => {
  const f = fixture();
  const saved = await f.repository.save(f.incoming, 4);
  assert.equal(saved.revision, 5);
  assert.equal(f.stored().revision, 5);
  assert.equal(f.stored().courses[0].id, "restored");
  assert.equal(f.metrics.puts, 1);
  assert.equal(f.metrics.savedEvents, 1);
});

test("a live restore guard allows exactly one confirmed repository write", async () => {
  const f = fixture();
  let checks = 0;
  await f.repository.save(f.incoming, 4, { isCurrent: () => (++checks, true) });
  assert.equal(checks, 3);
  assert.equal(f.metrics.puts, 1);
  assert.equal(f.metrics.savedEvents, 1);
  assert.equal(f.stored().revision, 5);
});

test("a live restore guard does not weaken concurrent revision protection", async () => {
  const f = fixture({ holdRead: true });
  const operation = f.repository.save(f.incoming, 4, { isCurrent: () => true });
  await f.reading;
  const winner = f.stored();
  winner.revision = 5;
  winner.courses.push({
    id: "winner",
    title: "Concurrent course",
    structure: "module",
  });
  f.replace(winner);
  f.finishRead();
  await assert.rejects(operation, /پنجره دیگری/);
  assert.equal(f.metrics.puts, 0);
  assert.equal(f.metrics.savedEvents, 0);
  assert.deepEqual(f.stored(), winner);
});
