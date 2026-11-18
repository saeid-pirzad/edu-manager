"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
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
      if (expression.startsWith("globalThis.__unlockRecordedSessionForAudit")) {
        assert.match(expression, /button\.click\(\)/);
        assert.doesNotMatch(expression, /openSessionModal\s*=/);
        return true;
      }
      assert.match(expression, /!globalThis\["__eduAuditBeforeReload"\]/);
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
  assert.equal(f.calls.length, 5);
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
  assert.equal(f.calls.length, 4);
  assert.deepEqual(f.delays, [100]);
});

function documentContext({
  old = false,
  readyState = "complete",
  read = () => {},
  readBackup = () => {},
  open = () => {},
} = {}) {
  return vm.createContext({
    ...(old ? { __beforeScopedSchoolWipe: true } : {}),
    document: { readyState },
    EduV24: { getReportContext: () => ({ ready: true }) },
    EduQuestionBankRepository: { read, readBackup },
    EduQuestionBankUI: { open },
  });
}

function documentFixture(documents) {
  const calls = [],
    delays = [];
  let current;
  return {
    calls,
    delays,
    current: () => current,
    tools: {
      cdp: async () => assert.fail("waiting must not request navigation"),
      evaluate: async (expression) => {
        calls.push(expression);
        if (
          !expression.startsWith("globalThis.__unlockRecordedSessionForAudit")
        )
          current = documents.shift() || current;
        return vm.runInContext(expression, current);
      },
      delay: async (milliseconds) => delays.push(milliseconds),
    },
  };
}

test("wait-only readiness rejects an old ready document and waits through school-ready parsing and absent bank APIs", async () => {
  const old = documentContext({ old: true });
  const loading = documentContext({ readyState: "loading", read: undefined });
  delete loading.EduQuestionBankRepository;
  const missingBank = documentContext();
  delete missingBank.EduQuestionBankRepository;
  const complete = documentContext();
  const f = documentFixture([old, loading, missingBank, complete]);
  await reloadReady.waitReady(f.tools, { marker: "__beforeScopedSchoolWipe" });
  assert.equal(f.calls.length, 5);
  assert.deepEqual(f.delays, [100, 100, 100]);
  assert.equal(f.current(), complete);
  assert.equal(typeof complete.__unlockRecordedSessionForAudit, "function");
  for (const premature of [old, loading, missingBank])
    assert.equal(premature.__unlockRecordedSessionForAudit, undefined);
  assert.equal(old.__beforeScopedSchoolWipe, true);
});

for (const missing of ["read", "readBackup", "open"])
  test(
    "a complete school-ready document times out when the bank API is missing: " +
      missing,
    async () => {
      const document = documentContext();
      const owner =
        missing === "open"
          ? document.EduQuestionBankUI
          : document.EduQuestionBankRepository;
      delete owner[missing];
      const f = documentFixture([document]);
      await assert.rejects(
        reloadReady.waitReady(f.tools, {
          attempts: 3,
          marker: "__beforeScopedSchoolWipe",
        }),
        /fresh, ready application context/,
      );
      assert.equal(f.calls.length, 3);
      assert.deepEqual(f.delays, [100, 100, 100]);
      assert.equal(document.__unlockRecordedSessionForAudit, undefined);
      assert.ok(f.calls.every((expression) => !expression.includes(" = ")));
    },
  );
