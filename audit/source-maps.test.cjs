"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const makeMap = require("../scripts/source-maps.cjs");
test("source maps track generated headers, source transitions and original lines", () => {
  const map = JSON.parse(makeMap("assets/scripts/test.js", ["src/a.js", "src/b.js"], ["one\ntwo\n", "three\n"], "// header\n"));
  assert.deepEqual(map.sources, ["../../src/a.js", "../../src/b.js"]);
  assert.deepEqual(map.sourcesContent, ["one\ntwo\n", "three\n"]);
  assert.equal(map.mappings, ";;AAAA;AACA;;ACDA");
});
test("every generated bundle maps each original source line to its actual output", () => {
  const root = path.resolve(__dirname, "..");
  const layout = JSON.parse(fs.readFileSync(path.join(root, "source-map.json"), "utf8"));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (const bundle of layout.bundles) {
    const compiled = fs.readFileSync(path.join(root, bundle.output), "utf8").split("\n");
    const map = JSON.parse(fs.readFileSync(path.join(root, bundle.output + ".map"), "utf8"));
    assert.equal(map.version, 3);
    assert.equal(map.sources.length, bundle.sources.length);
    let source = 0, originalLine = 0;
    map.mappings.split(";").forEach((segment, generatedLine) => {
      if (!segment) return;
      const values = [];
      let value = 0, shift = 0;
      for (const character of segment) {
        const digit = alphabet.indexOf(character);
        assert.ok(digit >= 0);
        value += (digit & 31) * 2 ** shift;
        if (digit & 32) shift += 5;
        else {
          values.push(value & 1 ? -(value >> 1) : value >> 1);
          value = 0; shift = 0;
        }
      }
      source += values[1]; originalLine += values[2];
      assert.equal(compiled[generatedLine], map.sourcesContent[source].split("\n")[originalLine], bundle.output);
    });
  }
});
