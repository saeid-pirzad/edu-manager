"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { parsers } = require("prettier/plugins/postcss");
const { hasSystemFocus } = require("./forced-colors-focus-browser.cjs");

const source = fs.readFileSync(
  path.join(__dirname, "../src/styles/surfaces.css"),
  "utf8",
);
const sheets = parsers.css
  .parse(source)
  .nodes.filter((node) => node.name === "media");
const declarations = (rule) =>
  Object.fromEntries(
    rule.nodes
      .filter((node) => node.type === "css-decl")
      .map((node) => [node.prop, [node.value.text, !!node.important]]),
  );
const compact = (selector) => selector.replace(/\s+/g, "");
const selectorText = (selector) =>
  compact(source.slice(selector.source.startOffset, selector.source.endOffset));

// :is() and :not() take the maximum branch, not the matching branch. Parsing
// selectors independently catches the specificity mismatch that caused the bug.
function specificity(node) {
  const sum = (a, b) => a.map((value, index) => value + b[index]);
  const maximum = (nodes) =>
    nodes
      .map(specificity)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
      .at(-1) || [0, 0, 0];
  if (["selector-root", "selector-selector"].includes(node.type))
    return node.nodes.map(specificity).reduce(sum, [0, 0, 0]);
  if (node.type === "selector-id") return [1, 0, 0];
  if (["selector-class", "selector-attribute"].includes(node.type))
    return [0, 1, 0];
  if (node.type === "selector-tag") return [0, 0, 1];
  if (node.type === "selector-pseudo") {
    if ([":is", ":not"].includes(node.value)) return maximum(node.nodes);
    if (node.value === ":where") return [0, 0, 0];
    assert.equal(node.nodes.length, 0, "unsupported functional pseudo-class");
    return [0, 1, 0];
  }
  assert.ok(
    ["selector-combinator", "selector-universal"].includes(node.type),
    node.type,
  );
  return [0, 0, 0];
}

test("forced-colors focus has parity with both important normal and error selectors", () => {
  const normalRules = sheets
    .filter((sheet) => sheet.params.value === "screen")
    .flatMap((sheet) => sheet.nodes.filter((node) => node.type === "css-rule"));
  const normal = normalRules.find(
    (rule) => declarations(rule).outline?.[0] === "none",
  );
  const invalid = normalRules.find((rule) =>
    declarations(rule)["box-shadow"]?.[0].includes("--field-error-ring"),
  );
  const forced = sheets
    .filter(
      (sheet) => sheet.params.value === "screen and (forced-colors: active)",
    )
    .flatMap((sheet) => sheet.nodes.filter((node) => node.type === "css-rule"))
    .find((rule) => declarations(rule).outline?.[0] === "2px solid Highlight");
  assert.ok(normal && invalid && forced);
  assert.equal(forced.selector.nodes.length, 3);
  assert.equal(
    selectorText(forced.selector.nodes[0]),
    compact(normal.raws.selector),
  );
  assert.equal(
    selectorText(forced.selector.nodes[1]),
    compact(invalid.raws.selector),
  );
  assert.deepEqual(specificity(normal.selector.nodes[0]), [1, 2, 1]);
  assert.deepEqual(specificity(invalid.selector.nodes[0]), [1, 3, 1]);
  assert.deepEqual(specificity(forced.selector.nodes[0]), [1, 2, 1]);
  assert.deepEqual(specificity(forced.selector.nodes[1]), [1, 3, 1]);
  assert.equal(
    selectorText(forced.selector.nodes[2]),
    ':is(#app,#modalBody,#calPopup,#pwaWelcome)input:is([type="checkbox"],[type="radio"],[type="range"],[type="hidden"]):focus',
  );
  assert.ok(forced.source.start.offset > invalid.source.end.offset);
  assert.deepEqual(declarations(forced), {
    outline: ["2px solid Highlight", true],
    "outline-offset": ["2px", false],
    "border-color": ["Highlight", true],
    "box-shadow": ["none", true],
  });
  assert.deepEqual(declarations(normal), {
    outline: ["none", true],
    "outline-offset": ["0", false],
    "border-color": ["var(--field-focus-line)", true],
    "box-shadow": ["0 0 0 3px var(--field-focus-ring)", true],
  });
  assert.deepEqual(declarations(invalid), {
    "box-shadow": ["0 0 0 3px var(--field-error-ring)", true],
  });
});

test("browser focus acceptance requires actual system colors, outline geometry, and no shadow", () => {
  const observed = {
    forcedColors: true,
    focused: true,
    focusVisible: true,
    outlineStyle: "solid",
    outlineWidth: "2px",
    outlineOffset: "2px",
    outlineColor: "rgb(0, 0, 128)",
    highlight: "rgb(0, 0, 128)",
    borders: Array(4).fill("rgb(0, 0, 128)"),
    boxShadow: "none",
  };
  assert.equal(hasSystemFocus(observed), true);
  for (const change of [
    { forcedColors: false },
    { focused: false },
    { focusVisible: false },
    { outlineStyle: "none" },
    { outlineWidth: "0px" },
    { outlineOffset: "0px" },
    { outlineColor: "rgb(192, 20, 27)" },
    { borders: ["rgb(192, 20, 27)", ...observed.borders.slice(1)] },
    { boxShadow: "rgb(192, 20, 27) 0px 0px 0px 3px" },
  ])
    assert.equal(hasSystemFocus({ ...observed, ...change }), false);
});
