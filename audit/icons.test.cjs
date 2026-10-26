"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../src/core/icons.js"), "utf8"),
  context,
);
test("local icon registry has distinct trusted SVGs with accessible decoration", () => {
  const icons = context.EduIcons;
  assert.ok(icons.names.length >= 24);
  assert.equal(
    new Set(icons.names.map((name) => icons.html(name))).size,
    icons.names.length,
  );
  for (const name of icons.names) {
    assert.match(icons.html(name), /viewBox="0 0 24 24"/);
    assert.match(icons.html(name), /aria-hidden="true" focusable="false"/);
    assert.doesNotMatch(icons.html(name), /onload|onclick|<script|https?:/);
  }
  assert.equal(Object.isFrozen(icons), true);
});
test("unknown and inherited icon names cannot inject markup", () => {
  for (const name of [
    "constructor",
    "__proto__",
    "toString",
    '<img src=x onerror="alert(1)">',
    null,
  ])
    assert.equal(context.EduIcons.html(name), "");
});
