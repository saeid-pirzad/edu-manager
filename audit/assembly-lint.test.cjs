"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { SourceMap } = require("node:module");
const { Linter } = require("eslint");
const { assembleBundle } = require("../scripts/assemble-bundle.cjs");
const makeMap = require("../scripts/source-maps.cjs");

test("readable assembly retains source lint directives that are intentionally absent from compacted runtime", () => {
  const fragment =
      "// eslint-disable-next-line no-control-regex -- XML excludes these characters.\nconst invalid = /[\\x00-\\x08]/g;\n",
    { code } = assembleBundle(
      { scope: "global", sources: ["src/validation.js"] },
      [fragment],
    ),
    linter = new Linter(),
    options = {
      languageOptions: { ecmaVersion: "latest", sourceType: "script" },
      rules: { "no-control-regex": "error" },
    };
  assert.deepEqual(linter.verify(code, options), []);
  assert.equal(
    linter.verify(
      code.replace(/\/\/ eslint-disable-next-line[^\n]+\n/, ""),
      options,
    )[0].ruleId,
    "no-control-regex",
  );
  assert.ok(code.includes(fragment));
});

test("assembled source diagnostics retain the actual file, source line and column", () => {
  const bundle = {
      output: "assets/scripts/test.js",
      scope: "workspace",
      sources: ["src/a.js", "src/b.js"],
    },
    fragments = ["const a = 3;\n", "  missingFunction(a);\n"],
    { code, prefix } = assembleBundle(bundle, fragments),
    message = new Linter().verify(code, {
      languageOptions: { ecmaVersion: "latest", sourceType: "script" },
      rules: { "no-undef": "error" },
    })[0],
    map = new SourceMap(
      JSON.parse(makeMap(bundle.output, bundle.sources, fragments, prefix)),
    ),
    entry = map.findEntry(message.line - 1, message.column - 1);
  assert.equal(message.ruleId, "no-undef");
  assert.equal(entry.originalSource, "../../src/b.js");
  assert.equal(entry.originalLine, 0);
  assert.equal(
    entry.originalColumn + message.column - entry.generatedColumn,
    3,
  );
});

test("assembly keeps shared private bindings internal while preserving global and course API contracts", () => {
  const context = vm.createContext({});
  for (const [scope, fragments] of [
    ["global", ["function globalEntry(){return 2;}\n"]],
    [
      "workspace",
      ["const privateValue=3;\n", "globalThis.readPrivate=()=>privateValue;\n"],
    ],
    ["course", ["return api + 1;\n"]],
  ]) {
    const { code } = assembleBundle(
      { scope, sources: fragments.map((_, i) => "src/f" + i + ".js") },
      fragments,
    );
    vm.runInContext(code, context);
  }
  assert.equal(context.globalEntry(), 2);
  assert.equal(context.readPrivate(), 3);
  assert.equal(vm.runInContext("typeof privateValue", context), "undefined");
  assert.equal(context.EduCourseUI(4), 5);
  assert.throws(
    () => assembleBundle({ scope: "unsupported", sources: [] }, []),
    /Unknown source scope/,
  );
});
