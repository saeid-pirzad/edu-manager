"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const context = vm.createContext({
  esc: (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;"),
});
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "../src/workspace/students/csv-import.js"),
    "utf8",
  ),
  context,
);
test("CSV preview escapes names, class and filename and labels each decision", () => {
  const html = context.csvPreviewHtml(
    [{ row: 2, name: "<img onerror=alert(1)>", code: "001", choice: "add" }],
    { name: "<script>" },
    '<input name="file">',
  );
  assert.doesNotMatch(html, /<img|<script|<input/);
  assert.match(html, /&lt;img/);
  assert.match(html, /for="csvDecision0"/);
  assert.match(html, /data-csv-row="0"/);
  assert.match(html, /data-review-mode="none"/);
});
test("existing and archived identities default to skip and cannot be added again", () => {
  for (const archived of [false, true]) {
    const html = context.csvPreviewHtml(
      [
        {
          row: 2,
          name: "هنرجوی موجود",
          code: "001",
          existingId: "student",
          archived,
          choice: "skip",
        },
      ],
      { name: "کلاس" },
      "test.csv",
    );
    assert.match(html, /value="skip" selected/);
    assert.doesNotMatch(html, /value="add"/);
    assert.equal(html.includes('value="update"'), !archived);
  }
});
