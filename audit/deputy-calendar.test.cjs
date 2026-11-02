"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  const state = { from: "", to: "", dateErrors: { from: "", to: "" } };
  const nodes = new Map();
  const c = vm.createContext({
    state,
    Date,
    document: { getElementById: (id) => nodes.get(id) || null },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/domain/calendar.js"), "utf8"),
    c,
  );
  vm.runInContext(
    "(function(root){" +
      fs.readFileSync(
        path.join(__dirname, "../src/deputy/calendar.js"),
        "utf8",
      ) +
      "\nroot.calendarTest={jalaliText,validCalendarISO,setReportDate,reportDateError,syncDeputyDateProxy};})(globalThis);",
    c,
  );
  return { api: c.calendarTest, state, nodes };
}

test("deputy calendar adapter validates exact ISO calendar dates without silently rolling invalid days", () => {
  const { api } = fixture();
  for (const value of ["2026-11-01", "2024-02-29"])
    assert.equal(api.validCalendarISO(value), true);
  for (const value of [
    "2026-02-30",
    "2025-02-29",
    "2026-13-01",
    "2026-11-00",
    "2026-1-1",
    "1405/08/10",
    "۱۴۰۵۰۸۱۰",
    null,
  ])
    assert.equal(api.validCalendarISO(value), false, String(value));
});

test("deputy uses shared calendar math only to synchronize a read-only Jalali display from ISO", () => {
  const { api } = fixture();
  assert.equal(api.jalaliText("2026-11-01"), "۱۴۰۵/۰۸/۱۰");
  assert.equal(api.jalaliText("2026-10-31"), "۱۴۰۵/۰۸/۰۹");
  assert.equal(api.jalaliText("2026-02-30"), "");
});

test("invalid native date changes block reports and explicit clearing restores an unbounded endpoint", () => {
  const { api, state } = fixture();
  api.setReportDate("from", "2026-10-31");
  api.setReportDate("to", "2026-11-01");
  assert.equal(state.from, "2026-10-31");
  api.setReportDate("from", "2026-02-30");
  assert.ok(api.reportDateError());
  assert.equal(state.from, "");
  api.setReportDate("from", "");
  assert.equal(api.reportDateError(), "");
  assert.equal(state.to, "2026-11-01");
  api.setReportDate("from", "2026-11-02");
  assert.match(api.reportDateError(), /تاریخ شروع/);
});

test("clearing the deputy endpoint clears both shared proxy text and cached Jalali parts", () => {
  const { api, state, nodes } = fixture();
  const native = { value: "", dataset: {} };
  const attributes = new Map();
  const proxy = {
    value: "",
    dataset: {},
    setAttribute: (name, value) => attributes.set(name, value),
    readOnly: true,
  };
  nodes.set("deputyFrom", native);
  nodes.set("deputyFrom-shamsi", proxy);
  state.from = "2026-11-01";
  api.syncDeputyDateProxy("from");
  assert.equal(native.value, "2026-11-01");
  assert.equal(proxy.value, "۱۴۰۵/۰۸/۱۰");
  assert.equal(proxy.dataset.jm, "8");
  assert.equal(proxy.readOnly, true);
  state.from = "";
  api.syncDeputyDateProxy("from");
  assert.equal(native.value, "");
  assert.equal(proxy.value, "");
  assert.deepEqual(Object.keys(proxy.dataset), []);
  assert.equal(attributes.get("aria-describedby"), "deputyFromHint");
});

test("actual shared picker creates a read-only proxy without a teacher runtime or legacy event registry", () => {
  let proxy;
  const attributes = new Map();
  const native = {
    id: "deputyFrom",
    value: "2026-11-01",
    dataset: {},
    style: { cssText: "" },
    className: "",
    readOnly: false,
    matches: () => false,
    getAttribute: () => null,
    labels: [{ textContent: "از تاریخ" }],
  };
  native.parentNode = {
    insertBefore: (node) => {
      proxy = node;
      native.nextElementSibling = node;
    },
  };
  const popup = { classList: { remove() {}, contains: () => false } };
  const c = vm.createContext({
    window: {},
    document: {
      getElementById: () => popup,
      addEventListener() {},
      querySelectorAll: () => [native],
      createElement: () => ({
        style: { cssText: "" },
        dataset: {},
        setAttribute: (name, value) => attributes.set(name, value),
        addEventListener() {},
      }),
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/domain/calendar.js"), "utf8") +
      "\n" +
      fs.readFileSync(path.join(__dirname, "../src/ui/calendar.js"), "utf8"),
    c,
  );
  c.initShamsiPickers();
  assert.equal(proxy.id, "deputyFrom-shamsi");
  assert.equal(proxy.readOnly, true);
  assert.equal(proxy.value, "۱۴۰۵/۰۸/۱۰");
  assert.equal(attributes.get("aria-controls"), "calPopup");
  native.readOnly = true;
  c.syncShamsiDisabledInputs();
  assert.equal(proxy.disabled, true);
});
