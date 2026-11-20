"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = (name) =>
  fs.readFileSync(path.join(__dirname, "../src/workspace", name), "utf8");

function fixture() {
  const failure = Error("disk full"),
    shown = [],
    period = {
      id: "first",
      year: "1405-1406",
      term: "اول",
      termKind: "first",
      revision: 1,
    },
    context = vm.createContext({
      workspace: period,
      connection: {},
      db: { settings: {} },
      state: {},
      ready: true,
      blocked: false,
      installationToken: "initial-installation",
      periodLoading: false,
      resetBusy: false,
      connectionRetired: false,
      fileMode: false,
      writeFailureGeneration: 0,
      writer: Promise.resolve(),
      busy: 0,
      captureSaveFeedback: () => null,
      captureSessionEditRecovery: () => null,
      rebindSessionEditAfterRollback() {},
      invalidateSessionEditRecovery() {},
      paintStatus() {},
      checkScope() {},
      refreshAcademicYearWarnings() {},
      collectRecords: (value) => value,
      setStatus() {},
      render() {},
      scheduleSingleFile() {},
      readWorkspaceSnapshot: async () => ({
        period,
        data: { settings: {}, durable: true },
      }),
      flushDrafts: async () => {},
      allFrom: async () => [period],
      academicTermKind: () => "first",
      esc: String,
      EduIcons: { html: () => "" },
      showModal: (...args) => shown.push(args),
    });
  for (const name of [
    "data/save.js",
    "reports/snapshots.js",
    "core/async-target.js",
    "periods/year-editor.js",
  ])
    vm.runInContext(source(name), context);
  context.commitRecords = async () => {
    throw failure;
  };
  return { context, shown, failure };
}

test("academic year navigation remains available after a failed save has rolled back", async () => {
  const { context, shown, failure } = fixture();
  await assert.rejects(context.saveDBV24(), (error) => error === failure);
  assert.equal(context.db.durable, true);
  assert.equal(context.busy, 0);
  assert.equal(context.blocked, false);
  await context.openAcademicYear();
  assert.equal(shown.length, 1);
  assert.match(shown[0][1], /academic-year-hub/);
});

for (const change of [
  "workspace",
  "connection",
  "installationToken",
  "blocked",
  "periodLoading",
])
  test(
    "academic year navigation rechecks " + change + " after draining writes",
    async () => {
      const { context, shown } = fixture();
      context.flushDrafts = async () => {
        if (change === "workspace")
          context.workspace = { ...context.workspace, id: "second" };
        else if (change === "connection") context.connection = {};
        else if (change === "installationToken")
          context.installationToken = "restored-installation";
        else context[change] = true;
      };
      await assert.rejects(context.openAcademicYear());
      assert.equal(shown.length, 0);
    },
  );

test("academic year navigation still requires unresolved drafts to be corrected", async () => {
  const { context, shown } = fixture(),
    invalidDraft = Error("unresolved grade draft");
  context.flushDrafts = async ({ strict }) => {
    assert.equal(strict, true);
    throw invalidDraft;
  };
  await assert.rejects(
    context.openAcademicYear(),
    (error) => error === invalidDraft,
  );
  assert.equal(shown.length, 0);
});
