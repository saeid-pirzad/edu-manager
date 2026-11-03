"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture({ prepare = async () => true, confirm = true } = {}) {
  const nodes = new Map(),
    events = {},
    workerEvents = {},
    timers = new Map(),
    sent = [];
  let prepares = 0,
    reloads = 0;
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        id,
        hidden: true,
        disabled: false,
        inert: false,
        dataset: {},
        events: {},
        textContent: "",
        innerHTML: "",
        setAttribute() {},
        focus() {},
        addEventListener(type, fn) {
          this.events[type] = fn;
        },
        getBoundingClientRect() {
          return { left: 0, right: 600, top: 0, bottom: 600 };
        },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      });
    return nodes.get(id);
  };
  const waiting = { postMessage: (value) => sent.push(value) },
    registration = {
      waiting,
      active: null,
      update: async () => {},
      addEventListener() {},
    };
  const context = vm.createContext({
    console,
    navigator: {
      onLine: true,
      serviceWorker: {
        register: async () => registration,
        ready: Promise.resolve(),
        addEventListener: (name, fn) => (workerEvents[name] = fn),
      },
    },
    location: { protocol: "https:", reload: () => reloads++ },
    isSecureContext: true,
    matchMedia: () => ({ matches: false }),
    confirm: () => confirm,
    document: { getElementById: node },
    EduOfflineHelp: { html: () => '<div class="offline-help">shared</div>' },
    EduDeputyUI: {
      prepareForUpdate: async () => {
        prepares++;
        return prepare();
      },
    },
    setTimeout: (fn, ms) => {
      timers.set(ms, fn);
      return ms;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  context.window = context;
  context.addEventListener = (name, fn) => (events[name] = fn);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/deputy/pwa.js"), "utf8"),
    context,
  );
  return {
    node,
    events,
    workerEvents,
    timers,
    sent,
    context,
    init: () => events.load(),
    click: () => node("deputyUpdate").events.click(),
    get prepares() {
      return prepares;
    },
    get reloads() {
      return reloads;
    },
  };
}
test("deputy update prepares twice and sends the shared worker protocol while preventing duplicate clicks", async () => {
  const f = fixture();
  await f.init();
  assert.equal(f.node("deputyUpdate").hidden, false);
  await f.click();
  await f.click();
  assert.equal(f.prepares, 2);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].type, "APPLY_UPDATE");
  assert.equal(f.node("deputyApp").inert, true);
  f.workerEvents.controllerchange();
  assert.equal(f.reloads, 1);
});
test("unsaved deputy work blocks update before worker activation", async () => {
  const f = fixture({
    prepare: async () => {
      throw Error("unsaved note");
    },
  });
  await f.init();
  await f.click();
  assert.equal(f.sent.length, 0);
  assert.equal(f.node("deputyApp").inert, false);
  assert.equal(f.node("deputyUpdate").disabled, false);
  assert.equal(f.node("deputyOfflineStatus").textContent, "unsaved note");
});
test("declining deputy update confirmation leaves the current application usable", async () => {
  const f = fixture({ confirm: false });
  await f.init();
  await f.click();
  assert.equal(f.prepares, 1);
  assert.equal(f.sent.length, 0);
  assert.equal(f.node("deputyApp").inert, false);
});
test("a worker blocked by another window unlocks the deputy without reloading", async () => {
  const f = fixture();
  await f.init();
  await f.click();
  f.workerEvents.message({ data: { type: "UPDATE_BLOCKED" } });
  assert.equal(f.node("deputyApp").inert, false);
  assert.equal(f.node("deputyHelp").disabled, false);
  assert.equal(f.node("deputyUpdate").disabled, false);
  assert.equal(f.reloads, 0);
});
test("a deputy update timeout restores usable controls", async () => {
  const f = fixture();
  await f.init();
  await f.click();
  f.timers.get(15000)();
  assert.equal(f.node("deputyApp").inert, false);
  assert.equal(f.node("deputyUpdate").disabled, false);
  assert.equal(f.reloads, 0);
});
test("deputy installation help uses the shared content and native accessible dialog", async () => {
  const f = fixture();
  f.node("deputyHelp").events.click();
  assert.equal(
    f.node("deputyInstallBody").innerHTML,
    '<div class="offline-help">shared</div>',
  );
  assert.equal(f.node("deputyInstallDialog").open, true);
  f.node("deputyHelpClose").events.click();
  assert.equal(f.node("deputyInstallDialog").open, false);
});
