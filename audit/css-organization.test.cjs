"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parsers } = require("prettier/plugins/postcss");

const root = path.resolve(__dirname, "..");
const layout = JSON.parse(fs.readFileSync(path.join(root, "source-map.json")));
const bundles = layout.bundles.filter((bundle) => bundle.scope === "css");

function files(directory) {
  return fs
    .readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(directory + "/" + entry.name)
        : entry.name.endsWith(".css")
          ? [directory + "/" + entry.name]
          : [],
    );
}

function hasQuestionBankAnchor(node) {
  return (
    (node.type === "selector-class" && node.value.startsWith("qb-")) ||
    (node.type === "selector-id" && node.value === "questionBankPageHost") ||
    (node.nodes || []).some(hasQuestionBankAnchor)
  );
}

test("every stylesheet has one explicit bundle position and the page keeps both cascade phases", () => {
  const sources = bundles.flatMap((bundle) => bundle.sources);
  assert.equal(new Set(sources).size, sources.length);
  assert.deepEqual([...sources].sort(), files("src/styles").sort());
  assert.ok(sources.every((source) => source.startsWith("src/styles/")));
  const html = fs.readFileSync(path.join(root, "EduManager.html"), "utf8");
  const loaded = [
    ...html.matchAll(
      /<link\b[^>]*href="(?:\.\/)?(assets\/styles\/[^"?]+\.css)(?:\?[^" ]*)?"[^>]*>/g,
    ),
  ].map((match) => match[1]);
  assert.deepEqual(
    loaded,
    bundles.map((bundle) => bundle.output),
  );
});

test("feature sources remain bounded, parse independently and introduce no runtime CSS imports", () => {
  for (const source of bundles.flatMap((bundle) => bundle.sources)) {
    const css = fs.readFileSync(path.join(root, source), "utf8");
    assert.ok(css.trim().length, source + " must contain rules");
    // The previous mixed touch sheet exceeded 6,600 lines. Keep feature work
    // discoverable instead of returning to a single append-only stylesheet.
    assert.ok(
      css.trimEnd().split(/\r?\n/).length <= 1200,
      source + " needs a responsibility split",
    );
    const ast = parsers.css.parse(css);
    function visit(node) {
      assert.ok(
        node.type !== "css-atrule" || node.name !== "import",
        source + " must be assembled locally",
      );
      for (const child of node.nodes || []) visit(child);
    }
    visit(ast);
  }
});

test("question-bank feature rules keep each selector anchored to their own workspace", () => {
  const sources = bundles
    .flatMap((bundle) => bundle.sources)
    .filter((source) => source.startsWith("src/styles/question-bank/"));
  assert.ok(sources.length > 0);
  for (const source of sources) {
    const ast = parsers.css.parse(
      fs.readFileSync(path.join(root, source), "utf8"),
    );
    function visit(node) {
      if (node.type === "css-rule") {
        for (const selector of node.selector.nodes) {
          assert.ok(
            hasQuestionBankAnchor(selector),
            source + ": " + node.raws.selector,
          );
        }
      }
      for (const child of node.nodes || []) visit(child);
    }
    visit(ast);
  }
});
