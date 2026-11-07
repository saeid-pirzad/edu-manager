"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const {
  unlockExistingTimetableForAudit,
} = require("./timetable-edit-test-helpers.cjs");

function fixture() {
  const effects = [],
    durable = Object.freeze({ revision: 4, records: "unchanged" }),
    element = (extra = {}) => ({
      isConnected: true,
      blockedAncestor: false,
      rects: [{}],
      style: { display: "block", visibility: "visible" },
      closest() {
        return this.blockedAncestor ? {} : null;
      },
      getClientRects() {
        return this.rects;
      },
      ...extra,
    }),
    selects = [element({ disabled: true }), element({ disabled: true })],
    root = element({ dataset: { configMode: "view" } }),
    button = element({
      tagName: "BUTTON",
      disabled: false,
      inheritedDisabled: false,
      matches() {
        return this.disabled || this.inheritedDisabled;
      },
      click() {
        effects.push("native-click");
        root.dataset.configMode = "edit";
        for (const select of selects) select.disabled = false;
      },
    }),
    modal = {
      hidden: false,
      classList: { contains: () => modal.hidden },
    },
    current = { modal, root, button, selects },
    document = {
      getElementById: (id) => (id === "modal" ? current.modal : null),
      querySelector: (selector) =>
        selector === "#modalBody .week-config-editor" ? current.root : null,
    };
  root.querySelectorAll = (selector) =>
    selector === "select" ? current.selects : [];
  root.querySelector = (selector) =>
    selector === '[data-legacy-click="week-config-enable-edit"]'
      ? current.button
      : null;
  root.contains = (target) => target === current.button;
  const forbidden = () => {
      throw Error("The audit helper must not bypass the native button");
    },
    context = vm.createContext({
      document,
      getComputedStyle: (target) => target.style,
      db: durable,
      EduV24: new Proxy({}, { get: forbidden, set: forbidden }),
      enableMasterConfigEditing: forbidden,
      saveMasterConfig: forbidden,
      clearMasterConfig: forbidden,
    }),
    run = () =>
      vm.runInContext(
        '"use strict";(' + unlockExistingTimetableForAudit.toString() + ")()",
        context,
      );
  return { effects, durable, root, button, selects, modal, current, run };
}

test("serialized timetable helper uses exactly one native click without saving", () => {
  const f = fixture();
  assert.equal(f.run(), true);
  assert.deepEqual(f.effects, ["native-click"]);
  assert.equal(f.root.dataset.configMode, "edit");
  assert.ok(f.selects.every((select) => !select.disabled));
  assert.deepEqual(f.durable, { revision: 4, records: "unchanged" });
});

for (const [name, change, expected] of [
  ["missing modal", (f) => (f.current.modal = null), /not visible/],
  ["hidden modal", (f) => (f.modal.hidden = true), /not visible/],
  ["missing editor", (f) => (f.current.root = null), /not visible/],
  ["detached editor", (f) => (f.root.isConnected = false), /not visible/],
  [
    "hidden editor ancestor",
    (f) => (f.root.blockedAncestor = true),
    /not visible/,
  ],
  ["editor without layout", (f) => (f.root.rects = []), /not visible/],
  [
    "display-none editor",
    (f) => (f.root.style.display = "none"),
    /not visible/,
  ],
  ["hidden editor", (f) => (f.root.style.visibility = "hidden"), /not visible/],
  [
    "collapsed editor",
    (f) => (f.root.style.visibility = "collapse"),
    /not visible/,
  ],
  [
    "unknown editor mode",
    (f) => (f.root.dataset.configMode = "unknown"),
    /read-only/,
  ],
  [
    "already editable",
    (f) => (f.root.dataset.configMode = "edit"),
    /read-only/,
  ],
  ["missing fields", (f) => (f.current.selects = []), /initially be locked/],
  [
    "one unlocked field",
    (f) => (f.selects[0].disabled = false),
    /initially be locked/,
  ],
  [
    "missing edit button",
    (f) => (f.current.button = null),
    /button is unavailable/,
  ],
  [
    "non-button edit control",
    (f) => (f.button.tagName = "A"),
    /button is unavailable/,
  ],
  [
    "disabled edit button",
    (f) => (f.button.disabled = true),
    /button is unavailable/,
  ],
  [
    "fieldset-disabled edit button",
    (f) => (f.button.inheritedDisabled = true),
    /button is unavailable/,
  ],
  [
    "detached edit button",
    (f) => (f.button.isConnected = false),
    /button is unavailable/,
  ],
  ["hidden edit button", (f) => (f.button.rects = []), /button is unavailable/],
  [
    "inert edit button",
    (f) => (f.button.blockedAncestor = true),
    /button is unavailable/,
  ],
  [
    "foreign edit button",
    (f) => (f.root.contains = () => false),
    /button is unavailable/,
  ],
])
  test(`timetable helper rejects ${name} before clicking`, () => {
    const f = fixture();
    change(f);
    assert.throws(f.run, expected);
    assert.deepEqual(f.effects, []);
    assert.deepEqual(f.durable, { revision: 4, records: "unchanged" });
  });

for (const [name, change, expected] of [
  ["no-op click", () => {}, /did not enable editing/],
  [
    "unexpected mode",
    (f) => (f.root.dataset.configMode = "unknown"),
    /did not enable editing/,
  ],
  ["closed modal", (f) => (f.modal.hidden = true), /dialog changed/],
  ["replaced modal", (f) => (f.current.modal = {}), /dialog changed/],
  ["detached editor", (f) => (f.root.isConnected = false), /dialog changed/],
  ["hidden editor", (f) => (f.root.rects = []), /dialog changed/],
  ["replaced editor", (f) => (f.current.root = {}), /dialog changed/],
  [
    "still-locked fields",
    (f) => (f.root.dataset.configMode = "edit"),
    /did not unlock/,
  ],
  [
    "replaced field",
    (f) => {
      f.root.dataset.configMode = "edit";
      f.current.selects = [{ ...f.selects[0], disabled: false }, f.selects[1]];
    },
    /did not unlock/,
  ],
  [
    "removed field",
    (f) => {
      f.root.dataset.configMode = "edit";
      f.current.selects = [];
    },
    /did not unlock/,
  ],
  [
    "detached field",
    (f) => {
      f.root.dataset.configMode = "edit";
      for (const select of f.selects) select.disabled = false;
      f.selects[0].isConnected = false;
    },
    /did not unlock/,
  ],
])
  test(`timetable helper rejects ${name} after the native click`, () => {
    const f = fixture();
    f.button.click = () => {
      f.effects.push("native-click");
      change(f);
    };
    assert.throws(f.run, expected);
    assert.deepEqual(f.effects, ["native-click"]);
    assert.deepEqual(f.durable, { revision: 4, records: "unchanged" });
  });
