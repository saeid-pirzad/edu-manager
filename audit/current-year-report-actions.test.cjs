"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const messages = [],
    context = vm.createContext({
      workspace: {
        id: "second",
        year: "1405-1406",
        term: "عنوان قدیمی",
        termKind: "second",
        revision: 1,
        closed: false,
      },
      fileMode: false,
      connection: {},
      writer: Promise.resolve(),
      assertWorkspaceReadable() {},
      assertEntityWritable() {},
      flushDrafts: async () => {},
      captureWorkspaceContext: () => ({ ...context.workspace }),
      confirm: (message) => {
        messages.push(message);
        return false;
      },
    });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/reports/finalize.js"),
      "utf8",
    ),
    context,
  );
  context.finalReportData = () => ({ classes: [], missing: [] });
  return { context, messages };
}

test("closing confirmation identifies the fixed term of the current year without renaming stored data", async () => {
  const { context, messages } = fixture(),
    before = JSON.stringify(context.workspace);
  await context.finalizePeriod();
  assert.equal(messages.length, 1);
  assert.match(messages[0], /نوبت دوم سال تحصیلی 1405-1406/);
  assert.doesNotMatch(messages[0], /عنوان قدیمی|دوره/);
  assert.equal(JSON.stringify(context.workspace), before);
});

test("reopening messages use the current term and preserve previously issued reports", async () => {
  const { context, messages } = fixture();
  context.workspace.closed = true;
  await context.reopenPeriod();
  assert.equal(messages.length, 1);
  assert.match(messages[0], /نوبت جاری.*کارنامه ثابت قبلی حفظ می‌شود/);
  assert.doesNotMatch(messages[0], /دوره/);
  assert.equal(context.workspace.closed, true);
});
