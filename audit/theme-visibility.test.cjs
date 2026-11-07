"use strict";
const assert = require("node:assert/strict"),
  test = require("node:test"),
  vm = require("node:vm"),
  { isVisibleThemeElement, inspectTheme } = require("./theme-browser.cjs");

function element(tagName, parentElement = null, options = {}) {
  const node = {
    tagName: tagName.toUpperCase(),
    parentElement,
    children: [],
    classList: [],
    isConnected: true,
    open: false,
    style: {
      visibility: "visible",
      color: "rgb(45, 52, 64)",
      backgroundColor: "rgba(0, 0, 0, 0)",
      backgroundImage: "none",
      fontSize: "12px",
      fontWeight: "400",
      getPropertyValue: () => "",
    },
    getClientRects: () => [{ width: 80, height: 44 }],
    closest(selector) {
      for (let current = this; current; current = current.parentElement) {
        if (selector === ":disabled" ? current.disabled : current.excluded)
          return current;
      }
      return null;
    },
    contains(other) {
      for (let current = other; current; current = current.parentElement)
        if (current === this) return true;
      return false;
    },
    ...options,
  };
  parentElement?.children.push(node);
  return node;
}

function visible(node) {
  return vm.runInNewContext(
    "(" + isVisibleThemeElement.toString() + ")(node)",
    {
      node,
      getComputedStyle: (item) => item.style,
    },
  );
}

function disclosure(open = false) {
  const details = element("details", null, { open }),
    summary = element("summary", details),
    summaryLabel = element("span", summary),
    content = element("div", details),
    button = element("button", content),
    label = element("span", button);
  return { details, summary, summaryLabel, content, button, label };
}

test("ordinary connected text and controls remain eligible for contrast sampling", () => {
  assert.equal(visible(element("span")), true);
  assert.equal(visible(element("input")), true);
});

test("closed details content is excluded even when Chromium retains nonzero layout boxes", () => {
  const f = disclosure();
  assert.equal(f.button.getClientRects().length, 1);
  for (const node of [f.content, f.button, f.label])
    assert.equal(visible(node), false);
});

test("the first direct summary and its nested label remain visible while closed", () => {
  const f = disclosure();
  assert.equal(visible(f.summary), true);
  assert.equal(visible(f.summaryLabel), true);
});

test("the first direct summary need not be the first element child", () => {
  const details = element("details");
  element("p", details);
  const summary = element("summary", details);
  assert.equal(visible(summary), true);
});

test("a second summary is content, not an alternate visible disclosure heading", () => {
  const f = disclosure(),
    second = element("summary", f.details),
    label = element("span", second);
  assert.equal(visible(second), false);
  assert.equal(visible(label), false);
});

test("a nested summary cannot substitute for the first direct summary", () => {
  const details = element("details"),
    wrapper = element("div", details),
    summary = element("summary", wrapper);
  assert.equal(visible(summary), false);
});

test("closed details without a direct summary do not expose ordinary content", () => {
  const details = element("details"),
    text = element("span", details);
  assert.equal(visible(text), false);
});

test("direct ordinary text of a closed details element is not summary text", () => {
  assert.equal(visible(disclosure().details), false);
});

test("open details content and additional summaries remain eligible", () => {
  const f = disclosure(true),
    second = element("summary", f.details);
  for (const node of [f.content, f.button, f.label, second])
    assert.equal(visible(node), true);
});

test("an open inner disclosure does not escape its closed outer content", () => {
  const outer = disclosure(),
    inner = element("details", outer.content, { open: true }),
    summary = element("summary", inner),
    label = element("span", summary);
  assert.equal(visible(summary), false);
  assert.equal(visible(label), false);
});

test("a closed inner disclosure retains its summary inside an open outer disclosure", () => {
  const outer = disclosure(true),
    inner = element("details", outer.content),
    summary = element("summary", inner),
    content = element("button", inner);
  assert.equal(visible(summary), true);
  assert.equal(visible(content), false);
});

test("nested disclosure content is sampled when all containing disclosures are open", () => {
  const outer = disclosure(true),
    inner = element("details", outer.content, { open: true }),
    content = element("button", inner);
  assert.equal(visible(content), true);
});

test("a disclosure inside a closed outer summary still applies its own closed-content rule", () => {
  const outer = disclosure(),
    inner = element("details", outer.summary),
    summary = element("summary", inner),
    content = element("button", inner);
  assert.equal(visible(summary), true);
  assert.equal(visible(content), false);
});

test("hidden and aria-hidden content and decorative nontext roots remain excluded", () => {
  for (const tag of ["div", "svg", "script", "style"]) {
    const parent = element(tag, null, { excluded: true }),
      child = element("span", parent);
    assert.equal(visible(child), false);
  }
});

test("a hidden first summary cannot make its text sampleable", () => {
  const f = disclosure();
  f.summary.excluded = true;
  assert.equal(visible(f.summaryLabel), false);
});

test("disabled controls and their labels remain excluded independently of disclosure state", () => {
  const f = disclosure(true);
  f.button.disabled = true;
  assert.equal(visible(f.button), false);
  assert.equal(visible(f.label), false);
});

test("visibility-hidden text remains excluded inside an open disclosure", () => {
  const f = disclosure(true);
  f.label.style.visibility = "hidden";
  assert.equal(visible(f.label), false);
});

test("unlaid-out, disconnected and missing elements remain excluded", () => {
  assert.equal(
    visible(element("span", null, { getClientRects: () => [] })),
    false,
  );
  assert.equal(visible(element("span", null, { isConnected: false })), false);
  assert.equal(visible(null), false);
});

test("the serialized visibility observer does not open, rewrite or mutate disclosure nodes", () => {
  const f = disclosure();
  for (const node of Object.values(f)) {
    Object.freeze(node.children);
    Object.freeze(node);
  }
  assert.equal(visible(f.label), false);
  assert.equal(visible(f.summaryLabel), true);
  assert.equal(f.details.open, false);
});

function sampleDisclosure({ open, background = "rgb(254, 240, 240)" }) {
  const body = element("body"),
    f = disclosure(open);
  f.details.parentElement = body;
  body.children.push(f.details);
  f.label.textContent = "انتخاب فایل";
  f.button.style.backgroundColor = background;
  f.label.style.color = "rgb(255, 255, 255)";
  body.querySelector = (selector) =>
    selector === ".backup-automatic" ? f.details : null;
  body.querySelectorAll = () => [];
  f.details.querySelector = () => f.button;
  const document = {
    body,
    documentElement: element("html", null, { scrollWidth: 390 }),
    querySelector: () => null,
    createTreeWalker() {
      let visited = false;
      return {
        nextNode() {
          if (visited) return null;
          visited = true;
          return { parentElement: f.label, textContent: f.label.textContent };
        },
      };
    },
  };
  return vm.runInNewContext(
    "(" +
      inspectTheme.toString() +
      ")(" +
      isVisibleThemeElement.toString() +
      ")",
    {
      document,
      window: { showSaveFilePicker() {} },
      innerWidth: 390,
      NodeFilter: { SHOW_TEXT: 4 },
      getComputedStyle: (item) => item.style,
    },
  );
}

test("the serialized theme inspector excludes retained closed-content text from actual samples", () => {
  const observed = sampleDisclosure({ open: false });
  assert.equal(observed.sampled, 0);
  assert.equal(observed.samples.length, 0);
  assert.equal(observed.failed.length, 0);
  assert.equal(observed.backupAutomatic.open, false);
  assert.equal(observed.backupAutomatic.chooseVisible, false);
});

test("opening the same low-contrast content exposes a genuine failure at the unchanged 4.5 threshold", () => {
  const observed = sampleDisclosure({ open: true });
  assert.equal(observed.sampled, 1);
  assert.equal(observed.samples[0].text, "انتخاب فایل");
  assert.equal(observed.failed.length, 1);
  assert.equal(observed.failed[0].minimum, 4.5);
  assert.equal(observed.failed[0].ratio, 1.109);
  assert.equal(observed.backupAutomatic.chooseVisible, true);
});

test("opened high-contrast automatic backup text is included and passes without a color exception", () => {
  const observed = sampleDisclosure({
    open: true,
    background: "rgb(192, 20, 27)",
  });
  assert.equal(observed.sampled, 1);
  assert.equal(observed.samples[0].text, "انتخاب فایل");
  assert.equal(observed.samples[0].minimum, 4.5);
  assert.ok(observed.samples[0].ratio >= 4.5);
  assert.equal(observed.failed.length, 0);
});
