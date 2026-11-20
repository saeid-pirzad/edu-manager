"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(root, name), "utf8");

// These fields have their own DOM listeners. Tests exercise the real picker
// initialization and dispatched native events rather than replacing its sync.
function fixture({ deferFrames = false } = {}) {
  const handlers = new WeakMap();
  const elements = [];
  const frames = [];
  const doc = {
    activeElement: null,
    getElementById: (id) =>
      elements.find((item) => item.id === id && item.isConnected !== false) ||
      null,
    querySelectorAll: (selector) =>
      selector.includes('input[type="date"]') &&
      (!selector.includes("data-shamsi-applied") || input.dataset.shamsiApplied)
        ? [input]
        : [],
    querySelector: () => null,
  };
  const listen = (target) => {
    handlers.set(target, new Map());
    target.addEventListener = (type, callback) => {
      const events = handlers.get(target);
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(callback);
    };
    target.dispatchEvent = (event) => {
      if (!event.target) event.target = target;
      for (const callback of handlers.get(target).get(event.type) || [])
        callback.call(target, event);
      if (event.bubbles && !event.cancelBubble && target !== doc) {
        if (target !== form) {
          for (const callback of handlers.get(form).get(event.type) || [])
            callback.call(form, event);
        }
        for (const callback of handlers.get(doc).get(event.type) || [])
          callback.call(doc, event);
      }
      return true;
    };
    return target;
  };
  const makeInput = () => {
    const attributes = new Map();
    const field = listen({
      tagName: "INPUT",
      id: "",
      type: "text",
      className: "field",
      value: "",
      disabled: false,
      readOnly: false,
      isConnected: false,
      style: { cssText: "", display: "" },
      dataset: {},
      min: "",
      max: "",
      labels: [],
      getAttribute: (key) => attributes.get(key) ?? null,
      setAttribute: (key, value) => attributes.set(key, String(value)),
      removeAttribute: (key) => attributes.delete(key),
      hasAttribute: (key) => attributes.has(key),
      matches: (selector) => selector === ":disabled" && field.disabled,
      closest: (selector) => (selector === "form" ? form : null),
      focus: () => (doc.activeElement = field),
    });
    field.click = () =>
      field.dispatchEvent({
        type: "click",
        bubbles: true,
        stopPropagation() {
          this.cancelBubble = true;
        },
        preventDefault() {},
      });
    elements.push(field);
    return field;
  };
  listen(doc);
  const form = listen({
    dataset: { reviewMode: "none" },
    getAttribute: () => null,
    matches: (selector) => selector === ".record-editor",
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const input = makeInput();
  input.id = "sampleDate";
  input.type = "date";
  input.isConnected = true;
  input.value = "2026-10-31";
  input.form = form;
  const label = { htmlFor: input.id, textContent: "تاریخ جلسه" };
  input.labels.push(label);
  input.parentNode = {
    insertBefore: (proxy) => {
      input.nextElementSibling = proxy;
      proxy.isConnected = true;
      proxy.form = form;
    },
  };
  const classes = new Set();
  const popup = listen({
    id: "calPopup",
    innerHTML: "",
    offsetWidth: 336,
    offsetHeight: 420,
    style: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    setAttribute() {},
    querySelector: () => null,
    contains: () => false,
  });
  elements.push(popup);
  doc.body = { append: (element) => (element.parentElement = doc.body) };
  doc.createElement = makeInput;
  const context = vm.createContext({
    document: doc,
    innerWidth: 390,
    innerHeight: 844,
    requestAnimationFrame: (callback) =>
      deferFrames ? frames.push(callback) : callback(),
    queueMicrotask,
    setTimeout,
    clearTimeout,
    Event: class {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = Boolean(options.bubbles);
      }
    },
    addEventListener() {},
  });
  context.window = context;
  vm.runInContext(source("src/domain/calendar.js"), context);
  vm.runInContext(source("src/ui/calendar.js"), context);
  context.initShamsiPickers();
  form.elements = [input, input.nextElementSibling];
  return {
    context,
    input,
    proxy: input.nextElementSibling,
    form,
    label,
    doc,
    popup,
    frames,
  };
}

test("reopening a calendar reads the current native ISO value instead of cached Persian date metadata", () => {
  const f = fixture();
  assert.equal(f.proxy.value, "۱۴۰۵/۰۸/۰۹");
  f.input.value = "2027-03-21";
  f.proxy.click();
  assert.equal(f.proxy.value, "۱۴۰۶/۰۱/۰۱");
  assert.equal(vm.runInContext("calViewYear", f.context), 1406);
  assert.equal(vm.runInContext("calViewMonth", f.context), 1);
  assert.equal(
    vm.runInContext("calSelectedJalali.join('-')", f.context),
    "1406-1-1",
  );
});

for (const type of ["input", "change"]) {
  test(
    "native date " + type + " synchronizes the visible Persian field",
    () => {
      const f = fixture();
      f.input.value = "2027-03-21";
      f.input.dispatchEvent({ type, bubbles: true });
      assert.equal(f.proxy.value, "۱۴۰۶/۰۱/۰۱");
      f.input.value = "";
      f.input.dispatchEvent({ type, bubbles: true });
      assert.equal(f.proxy.value, "");
      assert.equal(f.proxy.dataset.jy, undefined);
      assert.equal(f.proxy.dataset.jm, undefined);
      assert.equal(f.proxy.dataset.jd, undefined);
    },
  );
}

test("an explicit date label targets the visible accessible Persian control", () => {
  const f = fixture();
  assert.notEqual(f.label.htmlFor, f.input.id);
  assert.equal(f.doc.getElementById(f.label.htmlFor), f.proxy);
  assert.equal(f.proxy.getAttribute("aria-label"), "تاریخ جلسه");
  assert.equal(f.input.style.display, "none");
});

test("form reset synchronizes after native controls receive their reset values", async () => {
  const f = fixture();
  f.input.value = "2027-03-21";
  f.input.dispatchEvent({ type: "change", bubbles: true });
  assert.equal(f.proxy.value, "۱۴۰۶/۰۱/۰۱");
  f.form.dispatchEvent({ type: "reset", bubbles: true });
  // A browser's reset event occurs before its default reset action.
  f.input.value = "2026-10-31";
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.proxy.value, "۱۴۰۵/۰۸/۰۹");
});

test("manual record-editor restore updates its date proxy as well as the raw form value", () => {
  const f = fixture();
  f.form.dataset.savedState = JSON.stringify([[f.input.id, "2026-10-31"]]);
  f.input.value = "2027-03-21";
  f.input.dispatchEvent({ type: "change", bubbles: true });
  assert.equal(f.proxy.value, "۱۴۰۶/۰۱/۰۱");
  vm.runInContext(source("src/ui/dialogs.js"), f.context);
  f.context.form = f.form;
  vm.runInContext("resetRecordEditor(form)", f.context);
  assert.equal(f.input.value, "2026-10-31");
  assert.equal(f.proxy.value, "۱۴۰۵/۰۸/۰۹");
});

test("a delayed focus return cannot move focus out of a newly opened calendar", () => {
  const f = fixture({ deferFrames: true });
  f.proxy.click();
  const currentFocus = { id: "new-calendar-day" };
  f.input.addEventListener("input", () => {
    f.context.otherInput = { nextElementSibling: null };
    vm.runInContext("calTargetInput = otherInput", f.context);
    f.popup.classList.add("open");
    f.doc.activeElement = currentFocus;
  });
  assert.equal(f.context.calSelectDay(9), true);
  for (const callback of f.frames.splice(0)) callback();
  assert.equal(f.doc.activeElement, currentFocus);
  assert.equal(f.popup.classList.contains("open"), true);
});
