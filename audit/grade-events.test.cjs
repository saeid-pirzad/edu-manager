"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "src/workspace/grading/events.js"),
  "utf8",
);
function fixture() {
  const listeners = new Map(),
    calls = [];
  const context = vm.createContext({
    document: {
      addEventListener: (name, handler) => listeners.set(name, handler),
    },
    gradeInput: (input) => calls.push(["input", input]),
    clearGrade: (input) => calls.push(["clear", input]),
    flushDrafts: async () => {
      calls.push(["flush"]);
      throw Error("handled by draft layer");
    },
  });
  vm.runInContext(source, context);
  context.installGradeEvents();
  return { listeners, calls };
}
const input = (options = {}) => ({
  matches: (selector) =>
    selector === ":disabled" ? !!options.disabled : !options.unrelated,
  closest: () => !!options.inert,
});
test("gradebook search normalizes Persian names without submitting or replacing grade fields", () => {
  const f = fixture();
  const grade = { value: "17.5" };
  const rows = [
    { dataset: { assessmentName: "علی کریمی" }, grade },
    { dataset: { assessmentName: "محمد رضایی" } },
  ];
  const message = { hidden: true };
  const root = {
    querySelectorAll: () => rows,
    querySelector: (selector) => selector === "[data-assessment-search]" ? search :
      selector === ".gradebook-no-results" ? message : null,
  };
  const search = {
    dataset: { assessmentSearch: "" },
    value: "كريمي",
    closest: (selector) => selector === ".gradebook" ? root : null,
  };
  const filter = () => f.listeners.get("input")({ target: search });
  filter();
  assert.equal(rows[0].hidden, false);
  assert.equal(rows[1].hidden, true);
  assert.equal(message.hidden, true);
  search.value = "نام ناموجود";
  filter();
  assert.equal(message.hidden, false);
  search.value = "";
  filter();
  assert.equal(rows.every((row) => !row.hidden), true);
  assert.equal(message.hidden, true);
  assert.equal(rows[0].grade, grade);
  assert.equal(grade.value, "17.5");
  assert.deepEqual(f.calls, []);
});
test("incomplete filter combines with search and keeps completed zero grades out", () => {
  const f = fixture();
  const search = { value: "" };
  const toggle = { checked: true };
  const message = {};
  const rows = [
    { dataset: { assessmentName: "علی رضایی", assessmentComplete: "true" } },
    { dataset: { assessmentName: "رضا کریمی", assessmentComplete: "false" } },
  ];
  const root = {
    querySelector: (selector) => selector === "[data-assessment-search]" ? search :
      selector === "[data-assessment-incomplete]" ? toggle :
      selector === ".gradebook-no-results" ? message : null,
    querySelectorAll: () => rows,
  };
  const target = { dataset: { assessmentIncomplete: "" }, closest: (selector) => selector === ".gradebook" ? root : null };
  const filter = () => f.listeners.get("change")({ target });
  filter();
  assert.equal(rows[0].hidden, true);
  assert.equal(rows[1].hidden, false);
  search.value = "رضایی";
  filter();
  assert.equal(rows.every((r) => r.hidden), true);
  assert.equal(message.hidden, false);
  toggle.checked = false;
  filter();
  assert.equal(rows[0].hidden, false);
  assert.equal(rows[1].hidden, true);
});
test("Enter and Shift+Enter navigate visible editable grades without selecting hidden or disabled fields", () => {
  const f = fixture();
  const calls = [];
  const root = { querySelectorAll: () => fields };
  const field = (name, options = {}) => ({
    disabled: !!options.disabled,
    readOnly: false,
    matches: (selector) => selector === ":disabled" ? !!options.disabled : true,
    closest: (selector) => selector === ".gradebook" ? root : selector === "[hidden]" && options.hidden ? {} : null,
    getClientRects: () => [{}],
    focus: () => calls.push("focus:" + name),
    select: () => calls.push("select:" + name),
    scrollIntoView: () => calls.push("scroll:" + name),
  });
  const first = field("first"), second = field("second");
  const fields = [first, field("hidden", { hidden: true }), field("disabled", { disabled: true }), second];
  const press = (target, extra = {}) => f.listeners.get("keydown")({ key: "Enter", target, preventDefault: () => calls.push("prevent"), ...extra });
  press(first);
  assert.deepEqual(calls, ["prevent", "focus:second", "select:second", "scroll:second"]);
  calls.length = 0;
  press(second, { shiftKey: true });
  assert.deepEqual(calls, ["prevent", "focus:first", "select:first", "scroll:first"]);
  calls.length = 0;
  press(first, { isComposing: true });
  assert.deepEqual(calls, []);
});
test("grade delegation accepts replacement inputs, flushes focusout and clears the paired input", async () => {
  const f = fixture(),
    first = input(),
    replacement = input();
  f.listeners.get("input")({ target: first });
  f.listeners.get("input")({ target: replacement });
  f.listeners.get("focusout")({ target: replacement });
  const button = {
    previousElementSibling: replacement,
    matches: () => false,
    closest: () => null,
  };
  f.listeners.get("click")({ target: { closest: () => button } });
  await Promise.resolve();
  assert.deepEqual(f.calls, [
    ["input", first],
    ["input", replacement],
    ["flush"],
    ["clear", replacement],
  ]);
});
test("Enter keeps an invalid grade focused for correction", () => {
  const f = fixture();
  const target = input();
  target.getAttribute = () => "true";
  let prevented = false;
  f.listeners.get("keydown")({ key: "Enter", target, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(f.calls, []);
});
test("grade delegation ignores disabled, inert and unrelated inputs and clear controls", () => {
  const f = fixture();
  for (const options of [
    { disabled: true },
    { inert: true },
    { unrelated: true },
  ]) {
    const target = input(options);
    f.listeners.get("input")({ target });
    f.listeners.get("focusout")({ target });
    f.listeners.get("click")({
      target: {
        closest: () => ({
          previousElementSibling: target,
          matches: () => false,
          closest: () => null,
        }),
      },
    });
  }
  f.listeners.get("click")({ target: { closest: () => null } });
  assert.deepEqual(f.calls, []);
});
test("grade cell template escapes identifiers and contains no executable handlers", () => {
  const context = vm.createContext({
    drafts: new Map(),
    inputKey: () => "key",
    esc: (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;"),
  });
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/workspace/grading/cells.js"), "utf8"),
    context,
  );
  const html = context.gradeCell(
    { id: 'class"' },
    { id: 'lesson"' },
    { id: 'student"', name: "name" },
    'field"',
  );
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.match(html, /data-class="class&quot;"/);
  assert.match(html, /data-clear-grade/);
});
