"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  reloadReady = require("./browser-ready.cjs");

function fixture(states, { ignoreCache = true } = {}) {
  const calls = [],
    delays = [];
  let marked = false;
  const tools = {
    evaluate: async (expression) => {
      calls.push(expression);
      if (!marked) {
        marked = true;
        assert.match(expression, /__eduAuditBeforeReload = true/);
        return true;
      }
      assert.match(expression, /!globalThis\.__eduAuditBeforeReload/);
      const state = states.shift();
      if (state instanceof Error) throw state;
      return state;
    },
    cdp: async (method, options) => {
      assert.equal(marked, true);
      assert.equal(method, "Page.reload");
      assert.equal(options.ignoreCache, ignoreCache);
    },
    delay: async (milliseconds) => delays.push(milliseconds),
  };
  return { tools, calls, delays };
}

test("browser reload cannot proceed on readiness from the marked old document", async () => {
  const f = fixture([false, false, true]);
  await reloadReady(f.tools);
  assert.equal(f.calls.length, 4);
  assert.deepEqual(f.delays, [100, 100]);
});

test("browser reload tolerates transient context replacement, not unrelated exceptions", async () => {
  const f = fixture([
    Error("Execution context was destroyed"),
    Error("Cannot find context with specified id"),
    true,
  ]);
  await reloadReady(f.tools);
  assert.equal(f.delays.length, 2);
  const bad = fixture([Error("application exception")]);
  await assert.rejects(reloadReady(bad.tools), /application exception/);
});

test("browser reload fails explicitly when no fresh ready document arrives", async () => {
  const f = fixture([false, false, false]);
  await assert.rejects(
    reloadReady(f.tools, { attempts: 3 }),
    /fresh, ready application context/,
  );
  assert.equal(f.calls.length, 4);
});

test("normal reload preserves the fresh-context guard without bypassing the service worker", async () => {
  const f = fixture([false, true], { ignoreCache: false });
  await reloadReady(f.tools, { ignoreCache: false });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.delays, [100]);
});
