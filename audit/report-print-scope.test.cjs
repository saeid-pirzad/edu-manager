"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  let resume;
  const gate = new Promise((resolve) => (resume = resolve)),
    prepared = [],
    printed = [],
    errors = [],
    button = { isConnected: true };
  const c = vm.createContext({
    scope: "lesson-A",
    connection: {},
    fileMode: false,
    document: { fonts: { ready: gate } },
    writer: Promise.resolve(),
    captureWorkspaceContext: () => ({ id: "term", revision: 1 }),
    flushDrafts: async () => {},
    assertReportSnapshot: async () => {},
    reportCopyScope: () => c.scope,
    handleError: (error) => errors.push(error.message),
    window: { print: () => printed.push(true) },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/reports/printing.js"),
      "utf8",
    ),
    c,
  );
  c.preparePrint = (value) => prepared.push(value);
  return { c, button, resume, prepared, printed, errors };
}

test("unchanged lesson and activity reports print after their durable validation", async () => {
  const f = fixture(),
    result = f.c.printReport(f.button);
  f.resume();
  assert.equal(await result, true);
  assert.deepEqual(f.prepared, [f.button]);
  assert.equal(f.printed.length, 1);
  assert.deepEqual(f.errors, []);
});

for (const [label, change] of [
  ["lesson, pupil or navigation selection", (f) => (f.c.scope = "lesson-B")],
  ["detached print button", (f) => (f.button.isConnected = false)],
  ["replaced database connection", (f) => (f.c.connection = {})],
])
  test("queued legacy report print stops after " + label, async () => {
    const f = fixture(),
      result = f.c.printReport(f.button);
    change(f);
    f.resume();
    assert.equal(await result, false);
    assert.equal(f.prepared.length, 0);
    assert.equal(f.printed.length, 0);
    assert.match(f.errors[0], /محدودهٔ گزارش تغییر/);
  });

test("an explicit prepared context retains its custom scope validator", async () => {
  const f = fixture(),
    result = f.c.printReport(f.button, {
      context: { id: "term", revision: 1 },
      validate: () => false,
    });
  f.resume();
  await assert.rejects(result, /محدوده یا متن گزارش تغییر/);
  assert.equal(f.prepared.length + f.printed.length, 0);
});
