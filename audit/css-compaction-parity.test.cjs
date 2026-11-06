"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  canonicalValue,
  meaningfulDifferences,
} = require("./css-compaction-browser.cjs");

for (const [original, compacted] of [
  ["var(--ink, red)", "var(--ink,\nred)"],
  [
    "max(8px, env(safe-area-inset-bottom))",
    "max(8px,env(safe-area-inset-bottom))",
  ],
  ["0 2px 8px red, 0 24px 70px blue", "0\n2px 8px red,0 24px 70px blue"],
  ["calc(1px + 2px)", "calc(1px\n+\n2px)"],
  ["calc(1px * 2)", "calc(1px*2)"],
  ["calc(1px / 2)", "calc(1px/2)"],
])
  test("only optional CSS formatting is canonicalized: " + original, () => {
    assert.equal(canonicalValue(original), canonicalValue(compacted));
  });

for (const [original, changed] of [
  ['var(--name, "a  b")', 'var(--name, "a b")'],
  ['"  هنرجو  "', '" هنرجو "'],
  ["var(--fallback, a b)", "var(--fallback, ab)"],
  ["var(--fallback, 1px 2px)", "var(--fallback, 1px2px)"],
  ["var(--Tone, red)", "var(--tone, red)"],
  ["var(--tone, red)", "var(--tone, blue)"],
  ["calc(1px + 2px)", "calc(1px+2px)"],
  ["calc(1px + 2px)", "calc(1px +2px)"],
  ["calc(1px + 2px)", "calc(1px - 2px)"],
  ["calc(1px - 2px)", "calc(1px-2px)"],
  ["calc(1px * (2 + 3))", "calc((1px * 2) + 3)"],
  ["9007199254740993px", "9007199254740992px"],
  ['url("data:font/woff2;base64,AAEC")', 'url("data:font/woff2;base64,AAED")'],
])
  test("meaningful CSS token changes remain mismatches: " + original, () => {
    assert.notEqual(canonicalValue(original), canonicalValue(changed));
    const difference = {
      location: "rules.0.declarations.0.1",
      source: original,
      compacted: changed,
    };
    assert.deepEqual(meaningfulDifferences([difference]), [difference]);
  });

test("value canonicalization cannot excuse a selector, condition, property, priority or order change", () => {
  const differences = [
    "rules.0.selectorText",
    "rules.0.conditionText",
    "rules.0.type",
    "rules.0.declarations.0.0",
    "rules.0.declarations.0.2",
    "rules.0.declarations.length",
  ].map((location) => ({ location, source: "1  2", compacted: "1 2" }));
  assert.deepEqual(meaningfulDifferences(differences), differences);
});

test("all mismatches are checked before the public diagnostic is shortened", () => {
  const differences = Array.from({ length: 50 }, (_, index) => ({
    location: "rules." + index + ".declarations.0.1",
    source: "var(--ink, red)",
    compacted: "var(--ink,\nred)",
  }));
  differences.push({
    location: "rules.51.declarations.0.1",
    source: 'var(--name, "a  b")',
    compacted: 'var(--name, "a b")',
  });
  assert.deepEqual(meaningfulDifferences(differences), differences.slice(-1));
});

test("a value that parses into extra declarations is rejected rather than partially compared", () => {
  assert.throws(() => canonicalValue("red; other: blue"));
  const difference = {
    location: "rules.0.declarations.0.1",
    source: "red",
    compacted: "red; other: blue",
  };
  assert.deepEqual(meaningfulDifferences([difference]), [difference]);
});
