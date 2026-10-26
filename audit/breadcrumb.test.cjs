"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({
  document: { addEventListener() {} },
  esc: (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;"),
});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/legacy/ui/header-menus.js"),
    "utf8",
  ),
  context,
);
test("breadcrumb uses one ordered semantic trail, isolated names and one current page", () => {
  const html = context.breadcrumbHtml([
    { label: "مدرسه‌ها", action: "ui-lesson:0" },
    { label: "School A", action: "ui-lesson:1", schoolId: "school-a" },
    { label: "کلاس A", action: "ui-lesson:2" },
    { label: "درس" },
  ]);
  assert.match(html, /<nav class="breadcrumb" aria-label="مسیر جاری"><ol>/);
  assert.equal((html.match(/<li>/g) || []).length, 4);
  assert.equal((html.match(/<bdi>/g) || []).length, 4);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /data-legacy-click-arg0="school-a"/);
  assert.doesNotMatch(html, /←|→/);
});
test("breadcrumb escapes names and identifiers instead of creating user markup", () => {
  const html = context.breadcrumbHtml([
    {
      label: '<img src=x onerror="bad()">',
      action: "ui-lesson:1",
      schoolId: 'a" onclick="bad()',
    },
    { label: "کلاس‌ها" },
  ]);
  assert.doesNotMatch(html, /<img| onclick="/);
  assert.match(html, /&lt;img/);
  assert.match(html, /a&quot;/);
});
