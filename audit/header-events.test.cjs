"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
test("classes navigation opens the school class list instead of a class lesson list", () => {
  const calls = [],
    state = {},
    db = {
      schools: [
        { id: "s1", classes: [{ id: "c1" }] },
        { id: "s2", classes: [{ id: "c2" }] },
      ],
    };
  const context = vm.createContext({
    state,
    db,
    document: { addEventListener() {} },
    goSchool: (id) => calls.push(id),
    goSchools: () => calls.push("schools"),
    goClass: () => assert.fail("must not enter a class"),
  });
  vm.runInContext(
    fs.readFileSync(
      path.resolve(__dirname, "../src/legacy/ui/header-menus.js"),
      "utf8",
    ),
    context,
  );
  for (const [schoolId, classId, expected] of [
    ["s2", "c2", "s2"],
    ["s2", null, "s2"],
    [null, "c2", "s2"],
    ["deleted", "deleted", "s1"],
    [null, null, "s1"],
  ]) {
    Object.assign(state, { schoolId, classId });
    context.goCurrentClass();
    assert.equal(calls.pop(), expected);
  }
  db.schools = [{ id: "empty", classes: [] }];
  context.goCurrentClass();
  assert.equal(calls.pop(), "empty");
  db.schools = [];
  context.goCurrentClass();
  assert.equal(calls.pop(), "schools");
});
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "src/ui/header-events.js"),
  "utf8",
);
function fixture() {
  const calls = [];
  let listener;
  const app = {
    contains: (button) => !button.outside,
    addEventListener: (type, handler) => {
      assert.equal(type, "click");
      listener = handler;
    },
  };
  const context = {
    document: {
      getElementById: (id) =>
        id === "app" ? app : { click: () => calls.push("file") },
    },
  };
  for (const name of [
    "goSchools",
    "goReports",
    "goMaster",
    "goQuestionBank",
    "openSettingsModal",
  ])
    context[name] = (...args) => calls.push([name, ...args]);
  vm.runInNewContext(source, context);
  return {
    calls,
    click(action, options = {}) {
      const button = {
        dataset: { headerAction: action },
        ...options,
        closest: (selector) =>
          selector === ".topbar" ? !options.noHeader : !!options.inert,
      };
      const event = { target: { closest: () => button } };
      listener(event);
      return event;
    },
  };
}
test("header preserves navigation and ignores removed data commands", () => {
  const f = fixture();
  for (const action of [
    "schools",
    "reports",
    "master",
    "question-bank",
    "settings",
    "export",
    "import",
    "wipe",
  ])
    f.click(action);
  assert.deepEqual(f.calls, [
    ["goSchools"],
    ["goReports"],
    ["goMaster"],
    ["goQuestionBank"],
    ["openSettingsModal"],
  ]);
});
test("removed, unknown, inert and unrelated header commands do nothing", () => {
  const f = fixture();
  for (const action of ["toggle-data", "export", "import", "wipe"])
    f.click(action);
  for (const action of ["toString", "constructor", "goSchools()", "unknown"])
    f.click(action);
  for (const options of [
    { disabled: true },
    { inert: true },
    { outside: true },
    { noHeader: true },
  ])
    f.click("wipe", options);
  assert.equal(f.calls.length, 0);
});
test("rendered header contains only the declared action tokens and no inline handlers", () => {
  const context = vm.createContext({
    state: { view: "schools" },
    document: { addEventListener() {} },
  });
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/legacy/ui/header-menus.js"), "utf8"),
    context,
  );
  const html = context.headerHtml();
  assert.equal(
    (html.match(/data-workspace-action="backups"/g) || []).length,
    1,
  );
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.deepEqual(
    [...html.matchAll(/data-header-action="([^"]+)"/g)].map(
      (match) => match[1],
    ),
    ["schools", "reports", "master", "question-bank", "settings"],
  );
});

test("question bank is a main header destination and preserves the selected class context", () => {
  const calls = [],
    context = vm.createContext({
      state: {
        view: "class",
        schoolId: "school-1",
        classId: "class-1",
        lessonId: "lesson-1",
        tab: "lessons",
      },
      render: () => calls.push("render"),
      document: { addEventListener() {} },
    });
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/legacy/ui/navigation.js"), "utf8"),
    context,
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/legacy/ui/header-menus.js"), "utf8"),
    context,
  );
  context.goQuestionBank();
  assert.deepEqual(calls, ["render"]);
  assert.equal(context.state.view, "question-bank");
  assert.equal(context.state.schoolId, "school-1");
  assert.equal(context.state.classId, "class-1");
  assert.equal(context.state.lessonId, "lesson-1");
  assert.match(
    context.headerHtml(),
    /class="question-bank-entry header-action is-active" data-header-action="question-bank" aria-current="page"/,
  );
});

function bankRouteFixture({ leave = "pending" } = {}) {
  const app = { innerHTML: "" },
    host = {},
    calls = { mounts: 0, leaves: 0, disposals: 0 },
    context = vm.createContext({
      state: {
        view: "question-bank",
        schoolId: "school-1",
        classId: "class-1",
        lessonId: "lesson-1",
        tab: "lessons",
        reportTab: "daily",
      },
      db: { settings: { password: "" } },
      isAuthenticated: true,
      storageBlocked: false,
      document: {
        getElementById: (id) => (id === "app" ? app : host),
      },
      headerHtml: () => "<header>navigation</header>",
      renderSchools: () => "<section>schools</section>",
      initShamsiPickers() {},
      setTimeout() {},
    });
  let mounted = false,
    pending;
  const dispose = () => {
    calls.disposals++;
    mounted = false;
  };
  context.EduQuestionBankUI = {
    isMounted: () => mounted,
    mount: (target) => {
      assert.equal(target, host);
      mounted = true;
      calls.mounts++;
    },
    dispose,
    requestLeave: (action) => {
      calls.leaves++;
      if (leave === "clean") {
        dispose();
        action();
      } else pending = action;
    },
  };
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/legacy/ui/navigation.js"), "utf8"),
    context,
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/legacy/ui/login-render.js"), "utf8"),
    context,
  );
  context.render = () => context.legacy_render();
  context.renderLogin = () => {
    app.innerHTML = "<section>login</section>";
  };
  context.render();
  return {
    context,
    app,
    calls,
    acceptLeave: () => {
      assert.equal(typeof pending, "function");
      dispose();
      pending();
    },
  };
}

test("cancelled or blocked bank navigation restores the current route without replacing its content", () => {
  const f = bankRouteFixture(),
    originalMarkup = f.app.innerHTML,
    originalState = JSON.stringify(f.context.state);
  f.context.goSchools();
  assert.equal(f.calls.leaves, 1);
  assert.equal(f.calls.disposals, 0);
  assert.equal(f.calls.mounts, 1);
  assert.equal(f.app.innerHTML, originalMarkup);
  assert.equal(JSON.stringify(f.context.state), originalState);
});

test("confirmed bank navigation disposes the page before applying the requested destination", () => {
  const f = bankRouteFixture();
  f.context.goSchools();
  f.acceptLeave();
  assert.equal(f.calls.disposals, 1);
  assert.equal(f.context.state.view, "schools");
  assert.equal(f.context.state.schoolId, null);
  assert.equal(f.context.state.classId, null);
  assert.equal(f.app.innerHTML, "<section>schools</section>");
});

test("a clean bank page leaves synchronously without a second outer render", () => {
  const f = bankRouteFixture({ leave: "clean" });
  f.context.state = { view: "schools", schoolId: null };
  assert.equal(f.context.render(), false);
  assert.equal(f.calls.leaves, 1);
  assert.equal(f.calls.disposals, 1);
  assert.equal(f.app.innerHTML, "<section>schools</section>");
});

test("same-page rerenders remount the bank without requesting departure", () => {
  const f = bankRouteFixture();
  f.context.render();
  assert.equal(f.calls.mounts, 2);
  assert.equal(f.calls.leaves, 0);
  assert.equal(f.calls.disposals, 0);
  assert.match(f.app.innerHTML, /id="questionBankPageHost"/);
});

test("authentication loss immediately removes the bank page before showing login", () => {
  const f = bankRouteFixture();
  f.context.db.settings.password = "protected";
  f.context.isAuthenticated = false;
  f.context.goSchools();
  assert.equal(f.calls.disposals, 1);
  assert.equal(f.calls.leaves, 0);
  assert.equal(f.app.innerHTML, "<section>login</section>");
});

function forcedReplacementFixture(withBank) {
  const events = [],
    app = {},
    modal = { classList: { add() {} }, setAttribute() {} },
    modalBody = { replaceChildren() {} };
  Object.defineProperty(app, "innerHTML", {
    set(value) {
      events.push({ kind: "replace", value });
    },
  });
  const context = vm.createContext({
    EduQuestionBankUI: withBank
      ? { dispose: () => events.push({ kind: "dispose-bank-ui" }) }
      : undefined,
    EduQuestionBankFileBackup: {
      service: {
        stop: () =>
          assert.fail("classroom replacement must keep bank backup active"),
        dispose: () =>
          assert.fail("classroom replacement must keep bank service active"),
      },
    },
    EduDataStoreRuntime: {},
    document: {
      getElementById: (id) => ({ app, modal, modalBody })[id],
    },
    setModalBackground() {},
    esc: String,
    claimTab: async () => {
      throw Error("isolated bootstrap failure");
    },
  });
  return { context, events };
}

test("forced classroom reset disposes the bank surface before replacing content and keeps its file service independent", () => {
  for (const withBank of [true, false]) {
    const f = forcedReplacementFixture(withBank);
    vm.runInContext(
      fs.readFileSync(path.join(root, "src/workspace/data/reset.js"), "utf8"),
      f.context,
    );
    f.context.resetScreen("reload required");
    assert.deepEqual(
      f.events.map((event) => event.kind),
      withBank ? ["dispose-bank-ui", "replace"] : ["replace"],
    );
    assert.match(f.events.at(-1).value, /reload required/);
    assert.match(f.events.at(-1).value, /data-workspace-action="reload"/);
  }
});

test("bootstrap failure disposes any bank surface before showing recovery without stopping its file service", async () => {
  for (const withBank of [true, false]) {
    const f = forcedReplacementFixture(withBank);
    vm.runInContext(
      fs.readFileSync(
        path.join(root, "src/workspace/core/bootstrap.js"),
        "utf8",
      ),
      f.context,
    );
    await f.context.bootstrapV24();
    assert.deepEqual(
      f.events.map((event) => event.kind),
      withBank
        ? ["replace", "dispose-bank-ui", "replace"]
        : ["replace", "replace"],
    );
    assert.match(f.events.at(-1).value, /isolated bootstrap failure/);
    assert.match(f.events.at(-1).value, /data-workspace-action="raw-recovery"/);
  }
});
