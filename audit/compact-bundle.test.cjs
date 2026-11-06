"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { SourceMap } = require("node:module");
const makeMap = require("../scripts/source-maps.cjs");
const { compactBundle } = require("../scripts/compact-bundle.cjs");

function compile(sources, fragments, { css = false, wrap = false } = {}) {
  const output = "assets/" + (css ? "styles/test.css" : "scripts/test.js"),
    prefix = css
      ? "/* generated */\n"
      : "// generated\n" + (wrap ? "(function(){\n" : ""),
    body = fragments
      .map(
        (fragment, index) =>
          (css
            ? "/* Source: " + sources[index] + " */\n"
            : "// Source: " + sources[index] + "\n") + fragment,
      )
      .join("");
  return compactBundle(
    output,
    prefix + body + (wrap ? "})();\n" : ""),
    makeMap(output, sources, fragments, prefix),
  );
}

test("compaction preserves cross-script globals, public function names and unused compatibility entry points", () => {
  const source = `
"use strict";
var sharedValue = 2;
function publicHandler(value) { return sharedValue + value; }
function compatibilityOnly() { return "keep this API"; }
globalThis.api = { publicHandler, compatibilityOnly };
`,
    { code } = compile(["src/fixture.js"], [source]),
    context = vm.createContext({});
  vm.runInContext(code, context);
  assert.equal(vm.runInContext("publicHandler(3)", context), 5);
  assert.equal(context.api.publicHandler.name, "publicHandler");
  assert.equal(context.api.compatibilityOnly(), "keep this API");
  vm.runInContext("sharedValue = 9", context);
  assert.equal(context.api.publicHandler(1), 10);
  assert.ok(code.length < source.length + 200);
});

test("whitespace compaction preserves Persian, meaningful spaces, multiline strings, regular expressions and precise numeric values", () => {
  const source = `
globalThis.result = {
  persian: "  حضور هنرجو  ",
  template: \`line  one\nline   two\`,
  regex: /(?:a b|حضور)\\s+/u.test("حضور "),
  decimal: 0.25 + 0.5,
  negativeZero: Object.is(-0, 0),
  exact: (9007199254740993n + 2n).toString(),
  sideEffects: (() => { let n=0; const o={get value(){n++;return 2;}}; return [o?.value, n]; })()
};
`,
    original = {},
    compacted = {};
  vm.runInNewContext(source, original);
  vm.runInNewContext(compile(["src/fixture.js"], [source]).code, compacted);
  assert.equal(
    JSON.stringify(compacted.result),
    JSON.stringify(original.result),
  );
});

test("private wrappers remain private, with no tree shaking or renamed dynamic handler contracts", () => {
  const { code } = compile(
      ["src/one.js", "src/two.js"],
      [
        "let privateState = 4;\nfunction registeredAction(){ return privateState; }\n",
        "globalThis.action = registeredAction;\n",
      ],
      { wrap: true },
    ),
    context = vm.createContext({});
  vm.runInContext(code, context);
  assert.equal(context.action(), 4);
  assert.equal(context.action.name, "registeredAction");
  assert.equal(vm.runInContext("typeof privateState", context), "undefined");
  assert.equal(
    vm.runInContext("typeof registeredAction", context),
    "undefined",
  );
});

test("a minified runtime error maps through the composed map to the real original source and throw line", () => {
  const sources = ["src/first.js", "src/second.js"],
    fragments = [
      "function failHere() {\n  const value = 3;\n  throw Error('mapped-' + value);\n}\n",
      "failHere();\n",
    ],
    { code, map } = compile(sources, fragments);
  const parsed = JSON.parse(map),
    decoded = new SourceMap(parsed);
  assert.deepEqual(parsed.sources, [
    "../../src/first.js",
    "../../src/second.js",
  ]);
  assert.deepEqual(parsed.sourcesContent, fragments);
  assert.equal(parsed.file, "test.js");
  let failure;
  try {
    vm.runInNewContext(code, {}, { filename: "compiled-fixture.js" });
  } catch (error) {
    failure = error;
  }
  assert.match(failure.message, /mapped-3/);
  const location = failure.stack.match(
    /at failHere \(compiled-fixture\.js:(\d+):(\d+)\)/,
  );
  assert.ok(location, failure.stack);
  const entry = decoded.findEntry(
    Number(location[1]) - 1,
    Number(location[2]) - 1,
  );
  assert.equal(entry.originalSource, "../../src/first.js");
  assert.equal(entry.originalLine, 2);
});

test("CSS compaction keeps rule order, fallbacks, priorities, selectors and embedded font data", () => {
  const source = `
@font-face { font-family: "Test Font"; src: url("data:font/woff2;base64,AAEC"); }
.item { display: -webkit-box; display: flex; --gap: 0.25rem; }
@media (max-width: 700px) { #app .item > button:hover { margin: calc(1px + 2px) !important; } }
@media print { .item { display: grid; } }
`,
    { code, map } = compile(["src/styles/test.css"], [source], { css: true });
  assert.match(code, /display:-webkit-box;display:flex/);
  assert.match(code, /--gap:\s*(?:\.25rem|0\.25rem)/);
  assert.match(code, /#app \.item>\s*button:hover/);
  assert.match(code, /calc\(1px \+ 2px\)!important/);
  assert.match(code, /data:font\/woff2;base64,AAEC/);
  assert.ok(code.indexOf("display:flex") < code.indexOf("display:grid"));
  assert.match(code, /@media print/);
  assert.deepEqual(JSON.parse(map).sourcesContent, [source]);
});

test("compaction is deterministic and rejects malformed code instead of producing a broken artifact", () => {
  const source = "function value() { return 3; }\n";
  assert.deepEqual(
    compile(["src/a.js"], [source]),
    compile(["src/a.js"], [source]),
  );
  assert.throws(() => compile(["src/bad.js"], ["function {\n"]));
});
