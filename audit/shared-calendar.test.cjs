"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(root, name), "utf8");

function calendarFixture(extra = {}) {
  const handlers = {};
  const classes = new Set();
  const popup = {
    innerHTML: "",
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
    },
    addEventListener: (name, handler) => (handlers[name] = handler),
    querySelector: () => null,
    contains: () => true,
  };
  const context = vm.createContext({
    document: {
      getElementById: (id) => (id === "calPopup" ? popup : null),
      addEventListener() {},
      querySelectorAll: () => [],
    },
    Event: class {
      constructor(type, options) {
        this.type = type;
        this.bubbles = options.bubbles;
      }
    },
    requestAnimationFrame: (callback) => callback(),
    ...extra,
  });
  context.window = context;
  vm.runInContext(source("src/domain/calendar.js"), context);
  vm.runInContext(source("src/ui/calendar.js"), context);
  vm.runInContext(source("src/ui/events-calendar.js"), context);
  return { context, popup, handlers };
}

test("application loads its calendar bundle and a persistent popup outside their render roots", () => {
  for (const entry of ["EduManager.html"]) {
    const html = source(entry);
    assert.equal(
      [...html.matchAll(/src="\.\/assets\/scripts\/calendar-ui\.js"/g)].length,
      1,
    );
    assert.equal([...html.matchAll(/id="calPopup"/g)].length, 1);
    assert.ok(html.indexOf('id="calPopup"') < html.indexOf("<main"));
    assert.ok(
      html.indexOf("scripts/calendar-math.js") <
        html.indexOf("scripts/calendar-ui.js"),
    );
  }
});

test("shared calendar renders standalone without teacher formatting, event registry or database globals", () => {
  const { context, popup } = calendarFixture();
  vm.runInContext(
    "calViewYear=1405;calViewMonth=8;calSelectedJalali=[1405,8,9];renderShamsiCalendar();",
    context,
  );
  assert.match(popup.innerHTML, /آبان ۱۴۰۵/);
  assert.match(
    popup.innerHTML,
    /class="selected"[^>]*aria-pressed="true"[^>]*data-calendar-day="9"/,
  );
  assert.equal(
    [...popup.innerHTML.matchAll(/data-calendar-action="select"/g)].length,
    30,
  );
  assert.match(popup.innerHTML, /بستن تقویم/);
  assert.doesNotMatch(popup.innerHTML, /data-legacy-/);
});

test("one shared popup handler changes a month exactly once and selects an ISO date with native events", () => {
  const { context, handlers, popup } = calendarFixture();
  vm.runInContext("calViewYear=1405;calViewMonth=8;", context);
  const click = (dataset) => {
    const button = { dataset, disabled: false };
    handlers.click({
      target: { closest: () => button },
      stopPropagation() {},
    });
  };
  click({ calendarAction: "next" });
  assert.equal(vm.runInContext("calViewMonth", context), 9);
  click({ calendarAction: "prev" });
  assert.equal(vm.runInContext("calViewMonth", context), 8);
  const events = [];
  const proxy = { dataset: { gregorianTarget: "true" }, setAttribute() {} };
  context.nativeDate = {
    dataset: {},
    nextSibling: proxy,
    nextElementSibling: proxy,
    dispatchEvent: (event) => events.push([event.type, event.bubbles]),
  };
  vm.runInContext("calTargetInput=nativeDate;", context);
  popup.classList.add("open");
  click({ calendarAction: "select", calendarDay: "9" });
  assert.equal(context.nativeDate.value, "2026-10-31");
  assert.equal(proxy.value, "۱۴۰۵/۰۸/۰۹");
  assert.deepEqual(events, [
    ["input", true],
    ["change", true],
  ]);
  assert.equal(popup.classList.contains("open"), false);
});

test("calendar disabled-state coordination retains teacher locks and has a standalone fallback", () => {
  const calls = [];
  const withTeacher = calendarFixture({
    setControlDisabled: (control, disabled) => calls.push([control, disabled]),
  });
  withTeacher.context.control = {};
  vm.runInContext(
    "setShamsiPickerDisabled(control,true);",
    withTeacher.context,
  );
  assert.deepEqual(calls, [[withTeacher.context.control, true]]);
  const standalone = calendarFixture();
  standalone.context.control = {};
  vm.runInContext("setShamsiPickerDisabled(control,true);", standalone.context);
  assert.equal(standalone.context.control.disabled, true);
  vm.runInContext(
    "setShamsiPickerDisabled(control,false);",
    standalone.context,
  );
  assert.equal(standalone.context.control.disabled, false);
});

function selectableCalendar(changes = {}) {
  const f = calendarFixture();
  const events = [];
  const proxy = {
    dataset: { gregorianTarget: "true" },
    setAttribute() {},
  };
  const input = {
    value: "2026-10-31",
    dataset: {},
    nextSibling: proxy,
    nextElementSibling: proxy,
    isConnected: true,
    readOnly: false,
    min: "2026-10-31",
    max: "2026-11-02",
    matches: () => false,
    closest: () => null,
    dispatchEvent: (event) => events.push(event.type),
    ...changes,
  };
  f.context.nativeDate = input;
  vm.runInContext(
    "calViewYear=1405;calViewMonth=8;calTargetInput=nativeDate;",
    f.context,
  );
  f.popup.classList.add("open");
  return { ...f, input, proxy, events };
}
test("calendar disables dates outside the native field bounds, including both boundary days", () => {
  const f = selectableCalendar();
  vm.runInContext("renderShamsiCalendar();", f.context);
  const button = (day) =>
    f.popup.innerHTML.match(
      new RegExp('<button[^>]*data-calendar-day="' + day + '"[^>]*>'),
    )?.[0];
  assert.match(button(8), /\sdisabled(?:\s|>)/);
  assert.doesNotMatch(button(9), /\sdisabled(?:\s|>)/);
  assert.doesNotMatch(button(11), /\sdisabled(?:\s|>)/);
  assert.match(button(12), /\sdisabled(?:\s|>)/);
});
for (const day of [8, 12]) {
  test(
    "calendar refuses out-of-range selection without dispatching or changing dates: " +
      day,
    () => {
      const f = selectableCalendar();
      f.context.calSelectDay(day);
      assert.equal(f.input.value, "2026-10-31");
      assert.equal(f.proxy.value, undefined);
      assert.deepEqual(f.events, []);
    },
  );
}
for (const [name, change] of [
  ["detached", { isConnected: false }],
  ["disabled", { matches: () => true }],
  ["readonly", { readOnly: true }],
  ["inert", { closest: () => ({ inert: true }) }],
]) {
  test(
    "calendar cannot change a field made " + name + " after the popup opens",
    () => {
      const f = selectableCalendar(change);
      f.context.calSelectDay(10);
      assert.equal(f.input.value, "2026-10-31");
      assert.deepEqual(f.events, []);
      assert.equal(f.popup.classList.contains("open"), false);
    },
  );
}
test("calendar applies inclusive range endpoints and keeps both events on the originating input", () => {
  for (const [day, iso] of [
    [9, "2026-10-31"],
    [11, "2026-11-02"],
  ]) {
    const f = selectableCalendar();
    const otherEvents = [];
    f.context.otherInput = {
      dispatchEvent: (event) => otherEvents.push(event.type),
    };
    f.input.dispatchEvent = (event) => {
      f.events.push(event.type);
      vm.runInContext("calTargetInput=otherInput;", f.context);
    };
    f.context.calSelectDay(day);
    assert.equal(f.input.value, iso);
    assert.deepEqual(f.events, ["input", "change"]);
    assert.deepEqual(otherEvents, []);
  }
});
