"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const copied = [],
    errors = [],
    calls = [];
  const c = vm.createContext({
    workspace: { id: "term", revision: 1 },
    connection: {},
    fileMode: false,
    ready: true,
    blocked: false,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    isAuthenticated: true,
    db: { settings: { password: "hash" } },
    state: { view: "reports", reportTab: "comprehensive" },
    globalFilter: { studentId: "selected" },
    lessonReportFilter: {},
    karnamehFilter: {},
    currentSessionId: null,
    copyToClipboard: (text) => copied.push(text),
    handleError: (error) => errors.push(error.message),
  });
  c.assertWorkspaceReadable = () => {
    if (c.blocked || !c.isAuthenticated) throw Error("unreadable");
  };
  c.prepareReportSnapshot = async () => {
    calls.push("snapshot");
    return { context: { id: c.workspace.id, revision: c.workspace.revision } };
  };
  c.assertReportSnapshot = async (context) => {
    calls.push("validate");
    c.assertWorkspaceReadable();
    if (
      context.id !== c.workspace.id ||
      context.revision !== c.workspace.revision
    )
      throw Error("stale snapshot");
  };
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/reports/copy.js"),
      "utf8",
    ),
    c,
  );
  return { c, copied, errors, calls };
}

test("report copy prepares and validates durable data before delivery", async () => {
  const f = fixture();
  assert.equal(await f.c.copyReportV24(() => "report", {}), true);
  assert.deepEqual(f.calls, ["snapshot", "validate"]);
  assert.deepEqual(f.copied, ["report"]);
});

for (const reason of [
  "blocked",
  "locked",
  "failed-draft",
  "connection",
  "scope",
  "button",
]) {
  test(`report copy rejects ${reason} without producing or delivering text`, async () => {
    const f = fixture();
    let produced = false;
    const original = f.c.prepareReportSnapshot;
    if (reason === "blocked") f.c.blocked = true;
    if (reason === "locked") f.c.isAuthenticated = false;
    if (reason === "failed-draft")
      f.c.prepareReportSnapshot = async () => {
        throw Error("unsaved draft");
      };
    if (reason === "connection" || reason === "scope")
      f.c.prepareReportSnapshot = async () => {
        const snapshot = await original();
        if (reason === "connection") f.c.connection = {};
        else f.c.globalFilter.studentId = "other";
        return snapshot;
      };
    const button = { isConnected: reason !== "button" };
    assert.equal(
      await f.c.copyReportV24(() => {
        produced = true;
        return "private report";
      }, button),
      false,
    );
    assert.equal(produced, false);
    assert.deepEqual(f.copied, []);
    assert.equal(f.errors.length, 1);
  });
}

for (const reason of ["revision", "blocked", "scope", "locked"]) {
  test(`report copy rechecks ${reason} after text generation`, async () => {
    const f = fixture();
    assert.equal(
      await f.c.copyReportV24(() => {
        if (reason === "revision") f.c.workspace.revision++;
        if (reason === "blocked") f.c.blocked = true;
        if (reason === "scope") f.c.globalFilter.studentId = "other";
        if (reason === "locked") f.c.isAuthenticated = false;
        return "stale private report";
      }, {}),
      false,
    );
    assert.deepEqual(f.copied, []);
    assert.equal(f.errors.length, 1);
  });
}

test("empty report producer does not write clipboard content", async () => {
  const f = fixture();
  assert.equal(await f.c.copyReportV24(() => undefined, {}), false);
  assert.deepEqual(f.copied, []);
});

test("local read-only mode can copy authenticated data without writing drafts", async () => {
  const f = fixture();
  f.c.fileMode = true;
  assert.equal(await f.c.copyReportV24(() => "local report", {}), true);
  assert.deepEqual(f.calls, []);
  f.c.isAuthenticated = false;
  assert.equal(await f.c.copyReportV24(() => "hidden report", {}), false);
  assert.deepEqual(f.copied, ["local report"]);
});

test("formatted copy reads the captured durable data and delivers both formats after validation", async () => {
  const f = fixture(),
    data = { name: "DURABLE" };
  f.c.db.name = "LIVE_UNCOMMITTED";
  f.c.prepareReportSnapshot = async () => ({
    context: { id: "term", revision: 1 },
    data,
  });
  const sent = [];
  f.c.copyToClipboard = (...args) => sent.push(args);
  const button = {};
  assert.equal(
    await f.c.copyReportV24(
      (source) => source.name,
      button,
      (text) => '<div dir="rtl">' + text + "</div>",
    ),
    true,
  );
  assert.deepEqual(sent, [["DURABLE", button, '<div dir="rtl">DURABLE</div>']]);
  assert.deepEqual(f.calls, ["validate"]);
});
test("a revision change during HTML formatting stops both clipboard formats", async () => {
  const f = fixture();
  assert.equal(
    await f.c.copyReportV24(
      () => "plain",
      {},
      () => {
        f.c.workspace.revision++;
        return "<b>obsolete</b>";
      },
    ),
    false,
  );
  assert.deepEqual(f.copied, []);
  assert.equal(f.errors.length, 1);
});
test("local read-only formatted copy uses authenticated local data without saving", async () => {
  const f = fixture(),
    sent = [];
  f.c.fileMode = true;
  f.c.db.name = "LOCAL";
  f.c.copyToClipboard = (text, button, html) => sent.push({ text, html });
  assert.equal(
    await f.c.copyReportV24(
      (source) => source.name,
      {},
      (text) => "<b>" + text + "</b>",
    ),
    true,
  );
  assert.deepEqual(f.calls, []);
  assert.deepEqual(sent, [{ text: "LOCAL", html: "<b>LOCAL</b>" }]);
});
