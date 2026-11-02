"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const load = (context, file) =>
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
    context,
  );

test("locked grade inputs and explicit clear cannot create or alter drafts", () => {
  const context = vm.createContext({
    assessmentContext: { handles: () => false, flush: async () => {} },
    resetBusy: false,
    connectionRetired: false,
    periodLoading: false,
    db: { settings: { password: "protected-hash" } },
    isAuthenticated: false,
  });
  load(context, "workspace/drafts/inputs.js");
  context.contextFromInput = () => {
    throw Error("must not inspect or accept a locked input");
  };
  assert.doesNotThrow(() => context.gradeInput({}));
  assert.doesNotThrow(() => context.clearGrade({}));
});

test("locked valid drafts remain recoverable and cannot mutate score records", async () => {
  const item = { classId: "class", value: "18" },
    drafts = new Map([["grade", item]]),
    context = vm.createContext({
      assessmentContext: { handles: () => false, flush: async () => {} },
      resetBusy: false,
      connectionRetired: false,
      draftTimer: null,
      clearTimeout() {},
      flushing: null,
      drafts,
      parseDraft: () => ({ ok: true }),
      db: { settings: { password: "protected-hash" } },
      isAuthenticated: false,
      findClass: () => {
        throw Error("must not mutate locked score records");
      },
    });
  load(context, "workspace/drafts/flush.js");
  await assert.rejects(context.flushDrafts({ strict: true }), /وارد ترم/);
  assert.equal(drafts.get("grade"), item);
  assert.equal(context.flushing, null);
});

test("entity write authorization rejects locked sessions and permits verified ones", () => {
  const context = vm.createContext({
    fileMode: false,
    ready: true,
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    blocked: false,
    workspace: { closed: false },
    db: { settings: { password: "protected-hash" } },
    isAuthenticated: false,
  });
  load(context, "workspace/entities/edit.js");
  assert.throws(() => context.assertEntityWritable(), /وارد ترم/);
  context.isAuthenticated = true;
  assert.doesNotThrow(() => context.assertEntityWritable());
  context.workspace.closed = true;
  assert.throws(() => context.assertEntityWritable(), /قابل ویرایش نیست/);
});

function loginFixture({ password = "legacy-hash", closed = false } = {}) {
  const effects = [],
    input = { value: "verified-password" },
    context = vm.createContext({
      db: { settings: { password } },
      isAuthenticated: false,
      periodId: "source",
      document: { getElementById: () => input },
      setControlLock() {},
      verifyPassword: async () => true,
      hashPassword: async () => "pbkdf2$new-hash",
      saveDB: async () => {
        assert.equal(context.isAuthenticated, true);
        effects.push("save");
      },
      render: () => effects.push("render"),
      alert: (message) => effects.push(message),
      EduV24: {
        getReportContext: () => ({ id: context.periodId, closed }),
      },
    });
  load(context, "legacy/ui/login-render.js");
  const login = () =>
    context.legacy_checkPassword({
      preventDefault() {},
      target: { querySelector: () => ({}) },
    });
  return { context, effects, input, login };
}

test("verified legacy login authorizes hash migration before guarded persistence", async () => {
  const f = loginFixture();
  await f.login();
  assert.deepEqual(f.effects, ["save", "render"]);
  assert.equal(f.context.db.settings.password, "pbkdf2$new-hash");
  assert.equal(f.context.isAuthenticated, true);
});

test("failed legacy migration restores the previous locked password and session", async () => {
  const f = loginFixture();
  f.context.saveDB = async () => {
    throw Error("quota");
  };
  await f.login();
  assert.equal(f.context.db.settings.password, "legacy-hash");
  assert.equal(f.context.isAuthenticated, false);
  assert.equal(f.input.value, "verified-password");
  assert.equal(f.effects.length, 2);
  assert.equal(f.effects[0], "render");
  assert.match(f.effects[1], /quota/);
});

test("failed legacy migration re-renders the login after durable rollback rendered protected content", async () => {
  const f = loginFixture(),
    renderedAuthentication = [];
  f.context.render = () =>
    renderedAuthentication.push(f.context.isAuthenticated);
  f.context.saveDB = async () => {
    f.context.db = { settings: { password: "legacy-hash" } };
    f.context.render();
    throw Error("quota after durable rollback");
  };
  await f.login();
  assert.equal(f.context.isAuthenticated, false);
  assert.equal(f.context.db.settings.password, "legacy-hash");
  assert.deepEqual(renderedAuthentication, [true, false]);
});

test("closed-period login succeeds without a password-migration write", async () => {
  const f = loginFixture({ closed: true });
  await f.login();
  assert.deepEqual(f.effects, ["render"]);
  assert.equal(f.context.db.settings.password, "legacy-hash");
  assert.equal(f.context.isAuthenticated, true);
});

test("login verification and hashing cannot authenticate a different selected period", async () => {
  for (const phase of ["verifyPassword", "hashPassword"]) {
    const f = loginFixture();
    const destination = { settings: { password: "other-hash" } };
    f.context[phase] = async () => {
      f.context.db = destination;
      f.context.periodId = "destination";
      return phase === "verifyPassword" ? true : "pbkdf2$new-hash";
    };
    await f.login();
    assert.equal(f.context.isAuthenticated, false);
    assert.equal(f.context.db, destination);
    assert.equal(destination.settings.password, "other-hash");
    assert.equal(f.effects.length, 1);
  }
});

test("stale login attempts never restore an old password over a newer one", async () => {
  const f = loginFixture();
  f.context.verifyPassword = async () => {
    f.context.db.settings.password = "replacement-hash";
    return true;
  };
  await f.login();
  assert.equal(f.context.isAuthenticated, false);
  assert.equal(f.context.db.settings.password, "replacement-hash");
  assert.equal(f.effects.length, 1);
});
