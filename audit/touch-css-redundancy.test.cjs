const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parsers } = require("prettier/plugins/postcss");

// Only compare identical selectors inside identical media ancestry. In
// particular, keep fallback values, !important and nested media independent.
function redundantDeclarations(css) {
  const declarations = [];
  function visit(node, media = []) {
    if (node.type === "css-atrule") {
      if (node.name !== "media") return;
      media = [...media, node.params.value];
    }
    if (node.type === "css-rule") {
      for (const declaration of node.nodes) {
        if (declaration.type !== "css-decl") continue;
        declarations.push({
          key: JSON.stringify([
            media,
            node.raws.selector,
            declaration.prop,
            !!declaration.important,
          ]),
          value: declaration.raws.value,
          line: declaration.source.start.line,
        });
      }
      return;
    }
    for (const child of node.nodes || []) visit(child, media);
  }
  visit(parsers.css.parse(css));
  const laterValues = new Map();
  const redundant = [];
  for (const declaration of declarations.toReversed()) {
    if (laterValues.get(declaration.key) === declaration.value) {
      redundant.push(declaration);
    } else {
      laterValues.set(declaration.key, declaration.value);
    }
  }
  return redundant.reverse();
}

test("touch CSS has no earlier exact duplicate declaration in the same media and selector", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../src/styles/workflow/touch.css"),
    "utf8",
  );
  assert.deepEqual(redundantDeclarations(css), []);
});

test("the duplicate audit finds a later identical declaration across separate screen blocks", () => {
  const duplicate = redundantDeclarations(`
    @media screen { #app .sample { gap: 4px; color: red; } }
    @media screen { #app .other { gap: 9px; } }
    @media screen { #app .sample { gap: 4px; } }
  `);
  assert.equal(duplicate.length, 1);
  assert.equal(duplicate[0].value, "4px");
  assert.match(duplicate[0].key, /#app \.sample/);
});

test("different queries, nested queries, specificity, importance, fallback values and custom-property case are kept", () => {
  assert.deepEqual(
    redundantDeclarations(`
      @media screen {
        .sample { gap: 4px; color: red; display: block; --Tone: red; }
        #app .sample { gap: 4px; color: red; }
        .sample { color: red !important; display: grid; --tone: red; }
        @media (max-width: 700px) { .sample { gap: 4px; } }
      }
      @media print { .sample { gap: 4px; color: red; } }
    `),
    [],
  );
});
