"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "../src/styles/product-tokens.css"),
  "utf8",
);
const tokens = Object.fromEntries(
  [...source.matchAll(/--([\w-]+)\s*:\s*([^;{}]+);/g)].map((match) => [
    match[1],
    match[2].trim(),
  ]),
);
const luminance = (hex) => {
  let value = hex.replace(/^#/, "");
  if (value.length === 3)
    value = [...value].map((part) => part + part).join("");
  return value
    .match(/../g)
    .map((part) => parseInt(part, 16) / 255)
    .map((part) =>
      part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );
};
const contrast = (first, second) => {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

test("Reactium brand is distinct from its accessible interactive red", () => {
  const expected = {
    "theme-brand": "#ed1c24",
    "theme-primary": "#c0141b",
    "theme-primary-hover": "#921019",
    "theme-primary-soft": "#fef0f0",
    "theme-highlight": "#fcaf17",
    "theme-canvas": "#f7f6f4",
    "theme-surface": "#fff",
    "theme-surface-muted": "#f4f4f5",
    "theme-ink": "#2d3440",
    "theme-muted": "#5a6179",
    "theme-line": "#e4e4e7",
    "theme-field": "#f4f4f5",
    "theme-focus": "#c0141b",
  };
  for (const [name, value] of Object.entries(expected))
    assert.equal(tokens[name], value, name);
});

test("normal text and solid buttons meet 4.5:1 across the real theme roles", () => {
  for (const [foreground, background] of [
    ["theme-ink", "theme-canvas"],
    ["theme-ink", "theme-surface"],
    ["theme-muted", "theme-canvas"],
    ["theme-muted", "theme-field"],
    ["theme-primary", "theme-primary-soft"],
    ["theme-ink", "theme-highlight"],
  ])
    assert.ok(
      contrast(tokens[foreground], tokens[background]) >= 4.5,
      `${foreground} / ${background}`,
    );
  assert.ok(
    contrast("#fff", tokens["theme-primary"]) >= 4.5,
    "white on interactive red",
  );
  assert.ok(contrast("#fff", "#58595b") >= 4.5, "white on charcoal navigation");
  assert.ok(
    contrast(tokens["theme-ink"], tokens["theme-highlight"]) >= 4.5,
    "amber requires dark text",
  );
});

test("focus and form boundaries meet non-text contrast without darkening card dividers", () => {
  assert.ok(contrast(tokens["theme-focus"], tokens["theme-surface"]) >= 3);
  assert.ok(contrast(tokens["theme-field-line"], tokens["theme-surface"]) >= 3);
  assert.ok(contrast(tokens["theme-field-line"], tokens["theme-field"]) >= 3);
  assert.equal(
    tokens["theme-line"],
    "#e4e4e7",
    "card separators keep their subtle role",
  );
});

test("placeholders and all attendance states preserve readable semantic colors", () => {
  assert.ok(
    contrast(tokens["theme-placeholder"], tokens["theme-field"]) >= 4.5,
  );
  for (const state of [
    "success",
    "info",
    "warning",
    "danger",
    "leave",
    "unknown",
  ])
    assert.ok(
      contrast(tokens[`status-${state}`], tokens[`status-${state}-soft`]) >=
        4.5,
      state,
    );
  for (const state of ["success", "info", "danger", "leave"])
    assert.ok(contrast("#fff", tokens[`status-${state}-fill`]) >= 4.5, state);
  assert.ok(
    contrast(tokens["theme-ink"], tokens["status-warning-fill"]) >= 4.5,
    "bright amber has dark text instead of white",
  );
});

test("compatibility color roles resolve without cycles or missing dependencies", () => {
  function visit(name, ancestors = []) {
    assert.ok(Object.hasOwn(tokens, name), `undefined token: ${name}`);
    assert.ok(
      !ancestors.includes(name),
      `cyclic token: ${[...ancestors, name].join(" -> ")}`,
    );
    for (const reference of tokens[name].matchAll(/var\(--([\w-]+)\)/g))
      visit(reference[1], [...ancestors, name]);
  }
  for (const name of Object.keys(tokens)) visit(name);
  assert.equal(tokens["surface-paper"], "var(--theme-surface)");
  assert.equal(tokens["form-milk"], "var(--theme-field)");
});
