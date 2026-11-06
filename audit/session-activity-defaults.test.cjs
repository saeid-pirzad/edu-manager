"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture(type = "classGrade", amount = "") {
  const handlers = new Map(),
    next = {},
    form = {
      isConnected: true,
      dataset: {},
      elements: {},
      querySelector: () => next,
    };
  for (const [name, value] of Object.entries({
    studentId: "student-a",
    type,
    value: amount,
    note: "Synthetic pending note",
  }))
    form.elements[name] = { name, value, form, dataset: {} };
  Object.assign(form.elements.studentId, {
    selectedIndex: 1,
    options: [{ value: "" }, { value: "student-a" }, { value: "student-b" }],
  });
  const c = vm.createContext({
    EduLegacyEvents: { register: (id, fn) => handlers.set(id, fn) },
    setControlLock: (control, _reason, locked) => {
      control.disabled = locked;
    },
    document: { querySelector: () => form },
  });
  for (const file of [
    "src/legacy/sessions/dialog.js",
    "src/legacy/events/sessions-dialog.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
      c,
    );
  return {
    c,
    form,
    next,
    refresh: () => c.refreshSessionActivityInput(form),
    change(name, value) {
      const control = form.elements[name];
      control.value = value;
      return handlers.get("sessions-dialog:entry-change").call(control);
    },
    amount: () => form.elements.value.value,
  };
}

for (const [type, expected] of [
  ["positive", "0.25"],
  ["negative", "0.5"],
]) {
  test(`${type} initializes a blank next-entry form with ${expected}`, () => {
    const f = fixture(type);
    f.refresh();
    assert.equal(f.amount(), expected);
    assert.equal(f.form.elements.note.value, "Synthetic pending note");
    assert.equal(f.form.elements.studentId.value, "student-a");
  });

  test(`selecting ${type} uses its own ${expected} default`, () => {
    const f = fixture();
    f.refresh();
    f.change("type", type);
    assert.equal(f.amount(), expected);
  });

  test(`${type} preserves a manual amount when selecting another student`, () => {
    const f = fixture(type);
    f.refresh();
    f.form.elements.value.value = "0.75";
    f.change("studentId", "student-b");
    assert.equal(f.amount(), "0.75");
    assert.equal(f.form.elements.note.value, "Synthetic pending note");
  });

  test(`${type} preserves a manually entered zero across refreshes`, () => {
    const f = fixture(type, "0");
    f.refresh();
    f.change("studentId", "student-b");
    f.refresh();
    assert.equal(f.amount(), "0");
  });

  test(`${type} leaves an existing manual one-point entry unchanged`, () => {
    const f = fixture(type, "1");
    f.refresh();
    assert.equal(f.amount(), "1");
    f.change("studentId", "student-b");
    assert.equal(f.amount(), "1");
  });
}

test("switching positive and negative applies their distinct defaults", () => {
  const f = fixture();
  f.refresh();
  f.change("type", "positive");
  assert.equal(f.amount(), "0.25");
  f.change("type", "negative");
  assert.equal(f.amount(), "0.5");
  f.change("type", "positive");
  assert.equal(f.amount(), "0.25");
});

test("an explicit positive or negative type selection applies its default even after a manual amount", () => {
  const f = fixture("classGrade", "18");
  f.refresh();
  f.change("type", "positive");
  assert.equal(f.amount(), "0.25");
  f.form.elements.value.value = "0.75";
  f.change("type", "negative");
  assert.equal(f.amount(), "0.5");
});

test("selecting a non-count activity keeps the current manual value", () => {
  const f = fixture("positive", "0.75");
  f.refresh();
  f.change("type", "classGrade");
  assert.equal(f.amount(), "0.75");
  f.change("type", "homework");
  assert.equal(f.amount(), "0.75");
});

for (const type of ["classGrade", "mostamar", "payani", "activity", "homework"])
  test(`${type} does not acquire a positive or negative default`, () => {
    const f = fixture(type);
    f.refresh();
    assert.equal(f.amount(), "");
  });

test("a same-session form capture retains the exact manual amount and note", () => {
  const f = fixture("negative", "۰٫۷۵");
  f.refresh();
  const captured = f.c.captureSessionActivityForm();
  assert.equal(captured.value, "۰٫۷۵");
  assert.equal(captured.type, "negative");
  assert.equal(captured.note, "Synthetic pending note");
  assert.equal(captured.studentId, "student-a");
});

test("the existing next-student button lock remains independent of defaults", () => {
  const f = fixture("positive");
  f.refresh();
  assert.equal(f.next.disabled, false);
  f.form.elements.studentId.selectedIndex = 2;
  f.change("studentId", "student-b");
  assert.equal(f.next.disabled, true);
  assert.equal(f.amount(), "0.25");
});

test("a disconnected form is left untouched", () => {
  const f = fixture("positive");
  f.form.isConnected = false;
  f.refresh();
  assert.equal(f.amount(), "");
});
