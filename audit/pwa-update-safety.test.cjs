"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  },
  tick = () => new Promise((resolve) => setImmediate(resolve));
async function fixture() {
  const handlers = new Map(),
    timers = new Map(),
    elements = new Map(),
    effects = [],
    element = () => ({
      dataset: {},
      disabled: false,
      hidden: false,
      inert: false,
      textContent: "",
      title: "",
      label: { textContent: "" },
      querySelector(selector) {
        return selector === "span" ? this.label : null;
      },
      setAttribute(name, value) {
        this[name] = value;
      },
    }),
    registration = {
      waiting: { postMessage: (message) => effects.push(message.type) },
      update: async () => {},
      addEventListener() {},
    },
    c = vm.createContext({
      workspace: { id: "first" },
      connection: {},
      busy: 0,
      drafts: new Map(),
      writer: Promise.resolve(),
      draftWriter: Promise.resolve(),
      singleFileWriting: null,
      draftWritesPending: 0,
      draftRecoveryFailed: false,
      assertWorkspaceReadable() {},
      flushDrafts: async () => {},
      assessmentContext: { hasDrafts: () => false },
      hasRecordEditorChanges: () => false,
      location: { protocol: "https:", reload: () => effects.push("reload") },
      isSecureContext: true,
      matchMedia: () => ({ matches: false }),
      localStorage: { getItem: () => "seen" },
      navigator: {
        onLine: true,
        serviceWorker: {
          register: async () => registration,
          ready: Promise.resolve(),
          addEventListener: (name, callback) => handlers.set(name, callback),
        },
      },
      document: {
        body: { prepend() {} },
        createElement: element,
        getElementById: (id) => {
          if (!elements.has(id)) elements.set(id, element());
          return elements.get(id);
        },
        addEventListener() {},
      },
      addEventListener: (name, callback) => handlers.set(name, callback),
      confirm: () => {
        effects.push("confirm");
        return true;
      },
      setTimeout: (callback, delay) => {
        const id = timers.size + 1;
        timers.set(id, { callback, delay });
        return id;
      },
      clearTimeout() {},
    });
  c.window = c;
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/core/public-api.js"),
      "utf8",
    ),
    c,
  );
  let prepares = 0;
  c.EduV24 = {
    prepareForUpdate: async () => {
      prepares++;
      return c.prepareForUpdate();
    },
  };
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/pwa/install-update.js"),
      "utf8",
    ),
    c,
  );
  await handlers.get("load")();
  return {
    c,
    effects,
    elements,
    registration,
    handlers,
    timers,
    update: () => elements.get("mobileUpdate").onclick(),
    prepares: () => prepares,
  };
}
for (const kind of ["writer", "draftWriter", "singleFileWriting"])
  test("PWA activation waits for the actual " + kind + " promise", async () => {
    const f = await fixture(),
      pending = deferred();
    f.c[kind] = pending.promise;
    const update = f.update();
    await tick();
    assert.deepEqual(f.effects, []);
    assert.equal(f.elements.get("mobileUpdate").disabled, true);
    pending.resolve();
    await update;
    assert.deepEqual(f.effects, ["confirm", "APPLY_UPDATE"]);
    assert.equal(f.prepares(), 2);
  });
test("an active grade flush finishes before confirmation or worker activation", async () => {
  const f = await fixture(),
    pending = deferred();
  f.c.flushDrafts = () => pending.promise;
  const update = f.update();
  await tick();
  assert.deepEqual(f.effects, []);
  pending.resolve();
  await update;
  assert.deepEqual(f.effects, ["confirm", "APPLY_UPDATE"]);
});
test("a writer queued during an earlier writer drain is awaited too", async () => {
  const f = await fixture(),
    first = deferred(),
    second = deferred();
  f.c.writer = first.promise;
  const update = f.update();
  await tick();
  f.c.writer = second.promise;
  first.resolve();
  await tick();
  assert.deepEqual(f.effects, []);
  second.resolve();
  await update;
  assert.deepEqual(f.effects, ["confirm", "APPLY_UPDATE"]);
});
test("a mutation queued by confirmation is drained before APPLY_UPDATE", async () => {
  const f = await fixture(),
    pending = deferred();
  f.c.confirm = () => {
    f.effects.push("confirm");
    f.c.writer = pending.promise;
    return true;
  };
  const update = f.update();
  await tick();
  assert.deepEqual(f.effects, ["confirm"]);
  pending.resolve();
  await update;
  assert.deepEqual(f.effects, ["confirm", "APPLY_UPDATE"]);
});
test("a failed pending save blocks activation, displays its error and permits retry", async () => {
  const f = await fixture(),
    pending = deferred();
  f.c.writer = pending.promise;
  const update = f.update();
  await tick();
  pending.reject(Error("ordinary write failed"));
  await update;
  assert.deepEqual(f.effects, []);
  assert.match(
    f.elements.get("mobileStatus").textContent,
    /ordinary write failed/,
  );
  assert.equal(f.elements.get("mobileUpdate").disabled, false);
  f.c.writer = Promise.resolve();
  await f.update();
  assert.deepEqual(f.effects, ["confirm", "APPLY_UPDATE"]);
});
for (const kind of ["grade", "record", "assessment", "draftRecovery"])
  test("an unresolved " + kind + " edit blocks update activation", async () => {
    const f = await fixture();
    if (kind === "grade")
      f.c.flushDrafts = async () => {
        throw Error("invalid grade");
      };
    else if (kind === "record") f.c.hasRecordEditorChanges = () => true;
    else if (kind === "assessment")
      f.c.assessmentContext.hasDrafts = () => true;
    else f.c.draftRecoveryFailed = true;
    await f.update();
    assert.deepEqual(f.effects, []);
    assert.equal(f.elements.get("mobileUpdate").disabled, false);
    assert.ok(f.elements.get("mobileStatus").textContent);
  });
test("switching the installation context while saves drain aborts activation", async () => {
  const f = await fixture(),
    pending = deferred();
  f.c.writer = pending.promise;
  const update = f.update();
  await tick();
  f.c.connection = {};
  pending.resolve();
  await update;
  assert.deepEqual(f.effects, []);
  assert.match(f.elements.get("mobileStatus").textContent, /اطلاعات/);
});
test("repeated clicks cannot create overlapping update preparations", async () => {
  const f = await fixture(),
    pending = deferred();
  f.c.writer = pending.promise;
  const first = f.update();
  await tick();
  await f.update();
  assert.equal(f.prepares(), 1);
  pending.resolve();
  await first;
  assert.deepEqual(f.effects, ["confirm", "APPLY_UPDATE"]);
});
test("declining confirmation leaves the waiting worker untouched", async () => {
  const f = await fixture();
  f.c.confirm = () => false;
  await f.update();
  assert.deepEqual(f.effects, []);
  assert.equal(f.prepares(), 1);
  assert.equal(f.elements.get("mobileUpdate").disabled, false);
});
test("an app without the safe persistence barrier never activates an update", async () => {
  const f = await fixture();
  delete f.c.EduV24.prepareForUpdate;
  await f.update();
  assert.deepEqual(f.effects, []);
  assert.equal(f.elements.get("mobileUpdate").disabled, false);
});

for (const ending of ["blocked", "postFailure"])
  test(
    "update surfaces lock until activation and restore exact state/focus after " +
      ending,
    async () => {
      const f = await fixture(),
        app = f.c.document.getElementById("app"),
        modal = f.c.document.getElementById("modal"),
        nav = f.c.document.getElementById("uiBottomNav"),
        help = f.elements.get("mobileHelp"),
        install = f.elements.get("mobileInstall");
      app.inert = true;
      help.disabled = true;
      let focuses = 0;
      f.c.document.activeElement = {
        isConnected: true,
        closest: () => null,
        focus: () => {
          focuses++;
        },
      };
      if (ending === "postFailure")
        f.registration.waiting.postMessage = () => {
          throw Error("worker retired");
        };
      await f.update();
      if (ending !== "postFailure") {
        assert.equal(modal.inert, true);
        assert.equal(nav.inert, true);
        assert.equal(install.disabled, true);
        f.handlers.get("message")({ data: { type: "UPDATE_BLOCKED" } });
      }
      assert.equal(app.inert, true);
      assert.equal(modal.inert, false);
      assert.equal(nav.inert, false);
      assert.equal(help.disabled, true);
      assert.equal(install.disabled, false);
      assert.equal(f.elements.get("mobileUpdate").disabled, false);
      assert.equal(focuses, 1);
    },
  );
test("editing remains locked through controller replacement and reload is requested once", async () => {
  const f = await fixture();
  await f.update();
  assert.equal(f.c.document.getElementById("app").inert, true);
  assert.equal(f.c.document.getElementById("modal").inert, true);
  f.handlers.get("controllerchange")();
  assert.deepEqual(f.effects, ["confirm", "APPLY_UPDATE", "reload"]);
});

for (const scope of ["active year", "another year"])
  test(
    "unsaved report notes in " +
      scope +
      " block activation without discarding text",
    async () => {
      const f = await fixture(),
        pending = new Map([[scope, "unsaved report note"]]);
      let retries = 0;
      f.c.EduPeriodicReports = {
        hasPendingNotes: () => pending.size > 0,
        retryNotes: () => {
          retries++;
          return false;
        },
      };
      await f.update();
      assert.deepEqual(f.effects, []);
      assert.equal(retries, 1);
      assert.equal(pending.get(scope), "unsaved report note");
      assert.equal(f.elements.get("mobileUpdate").disabled, false);
      assert.ok(f.elements.get("mobileStatus").textContent);
      f.handlers.get("controllerchange")();
      assert.deepEqual(f.effects, []);
    },
  );
test("report notes saved by retry allow activation only after persistence finishes", async () => {
  const f = await fixture(),
    pending = deferred();
  let unsaved = true;
  f.c.EduPeriodicReports = {
    hasPendingNotes: () => unsaved,
    retryNotes: async () => {
      await pending.promise;
      unsaved = false;
      return true;
    },
  };
  const update = f.update();
  await tick();
  assert.deepEqual(f.effects, []);
  pending.resolve();
  await update;
  assert.equal(unsaved, false);
  assert.deepEqual(f.effects, ["confirm", "APPLY_UPDATE"]);
});
test("a report note introduced during confirmation is checked again before activation", async () => {
  const f = await fixture();
  let unsaved = false;
  f.c.EduPeriodicReports = {
    hasPendingNotes: () => unsaved,
    retryNotes: () => false,
  };
  f.c.confirm = () => {
    f.effects.push("confirm");
    unsaved = true;
    return true;
  };
  await f.update();
  assert.deepEqual(f.effects, ["confirm"]);
  assert.equal(unsaved, true);
  assert.equal(f.elements.get("mobileUpdate").disabled, false);
});

test("a report note queued while an ordinary writer drains is rechecked before confirmation", async () => {
  const f = await fixture(),
    pending = deferred();
  let unsaved = false;
  f.c.EduPeriodicReports = {
    hasPendingNotes: () => unsaved,
    retryNotes: () => false,
  };
  f.c.writer = pending.promise;
  const update = f.update();
  await tick();
  unsaved = true;
  pending.resolve();
  await update;
  assert.deepEqual(f.effects, []);
  assert.equal(unsaved, true);
  assert.equal(f.elements.get("mobileUpdate").disabled, false);
});

test("slow activation keeps editing locked and a late controller replacement reloads once", async () => {
  const f = await fixture();
  await f.update();
  [...f.timers.values()].find((timer) => timer.delay === 15000).callback();
  assert.equal(f.c.document.getElementById("app").inert, true);
  assert.equal(f.c.document.getElementById("modal").inert, true);
  assert.equal(f.elements.get("mobileUpdate").disabled, false);
  assert.equal(
    f.elements.get("mobileUpdate").label.textContent,
    "بازکردن دوباره برنامه",
  );
  f.registration.waiting = null;
  f.handlers.get("online")();
  assert.equal(f.elements.get("mobileUpdate").hidden, false);
  f.handlers.get("controllerchange")();
  f.handlers.get("controllerchange")();
  assert.deepEqual(f.effects, ["confirm", "APPLY_UPDATE", "reload"]);
});

test("an activation that never finishes has an explicit saved-state reopen action", async () => {
  const f = await fixture();
  await f.update();
  [...f.timers.values()].find((timer) => timer.delay === 15000).callback();
  await f.update();
  await f.update();
  assert.equal(f.c.document.getElementById("app").inert, true);
  assert.equal(f.prepares(), 2);
  assert.deepEqual(f.effects, ["confirm", "APPLY_UPDATE", "reload"]);
});
