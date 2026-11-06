"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { SourceMap } = require("node:module");
const makeMap = require("../scripts/source-maps.cjs");
test("source maps track generated headers, source transitions and original lines", () => {
  const map = JSON.parse(
    makeMap(
      "assets/scripts/test.js",
      ["src/a.js", "src/b.js"],
      ["one\ntwo\n", "three\n"],
      "// header\n",
    ),
  );
  assert.deepEqual(map.sources, ["../../src/a.js", "../../src/b.js"]);
  assert.deepEqual(map.sourcesContent, ["one\ntwo\n", "three\n"]);
  assert.equal(map.mappings, ";;AAAA;AACA;;ACDA");
});
function decodeMappings(mappings) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let source = 0,
    originalLine = 0,
    originalColumn = 0,
    name = 0;
  return mappings.split(";").flatMap((line, generatedLine) => {
    let generatedColumn = 0;
    return line.split(",").flatMap((segment) => {
      if (!segment) return [];
      const values = [];
      let value = 0,
        shift = 0;
      for (const character of segment) {
        const digit = alphabet.indexOf(character);
        assert.ok(digit >= 0, "source-map VLQ uses base64 digits");
        value += (digit & 31) * 2 ** shift;
        assert.ok(
          Number.isSafeInteger(value) && shift <= 50,
          "finite VLQ integer",
        );
        if (digit & 32) shift += 5;
        else {
          values.push(value % 2 ? -Math.floor(value / 2) : value / 2);
          value = 0;
          shift = 0;
        }
      }
      assert.equal(shift, 0, "VLQ integer is terminated");
      assert.ok(
        [1, 4, 5].includes(values.length),
        "standard source-map segment arity",
      );
      assert.ok(
        values[0] >= 0,
        "generated columns are ordered within each line",
      );
      generatedColumn += values[0];
      if (values.length === 1)
        return [{ generatedLine, generatedColumn, unmapped: true }];
      source += values[1];
      originalLine += values[2];
      originalColumn += values[3];
      if (values.length === 5) name += values[4];
      return [
        {
          generatedLine,
          generatedColumn,
          source,
          originalLine,
          originalColumn,
          ...(values.length === 5 ? { name } : {}),
        },
      ];
    });
  });
}

test("source-map decoder handles multiple columns, negative deltas and unmapped segments", () => {
  assert.deepEqual(decodeMappings("AAAA,KAAK;AACL,C,CAAA"), [
    {
      generatedLine: 0,
      generatedColumn: 0,
      source: 0,
      originalLine: 0,
      originalColumn: 0,
    },
    {
      generatedLine: 0,
      generatedColumn: 5,
      source: 0,
      originalLine: 0,
      originalColumn: 5,
    },
    {
      generatedLine: 1,
      generatedColumn: 0,
      source: 0,
      originalLine: 1,
      originalColumn: 0,
    },
    { generatedLine: 1, generatedColumn: 1, unmapped: true },
    {
      generatedLine: 1,
      generatedColumn: 2,
      source: 0,
      originalLine: 1,
      originalColumn: 0,
    },
  ]);
  for (const invalid of ["g", "!", "AA", "AAAAAA", "D"])
    assert.throws(() => decodeMappings(invalid));
});

test("every generated bundle has valid original identities and column-accurate standard source mappings", () => {
  const root = path.resolve(__dirname, "..");
  const layout = JSON.parse(
    fs.readFileSync(path.join(root, "source-map.json"), "utf8"),
  );
  for (const bundle of layout.bundles) {
    const compiled = fs
      .readFileSync(path.join(root, bundle.output), "utf8")
      .split("\n");
    const map = JSON.parse(
      fs.readFileSync(path.join(root, bundle.output + ".map"), "utf8"),
    );
    assert.equal(map.version, 3);
    assert.equal(map.file, path.posix.basename(bundle.output));
    assert.ok(Array.isArray(map.sources) && map.sources.length > 0);
    assert.equal(map.sourcesContent.length, map.sources.length);
    assert.ok(
      Array.isArray(map.names) &&
        map.names.every((name) => typeof name === "string"),
    );
    const sourcePaths = map.sources.map((source) =>
      path.posix.normalize(
        path.posix.join(
          path.posix.dirname(bundle.output),
          map.sourceRoot || "",
          source,
        ),
      ),
    );
    assert.equal(
      new Set(sourcePaths).size,
      sourcePaths.length,
      "no duplicate original sources",
    );
    const sourceLines = sourcePaths.map((source, index) => {
      assert.ok(
        bundle.sources.includes(source),
        `${bundle.output} only maps its registered sources: ${source}`,
      );
      const original = fs
        .readFileSync(path.join(root, source), "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/\n?$/, "\n");
      assert.equal(
        map.sourcesContent[index],
        original,
        source + " is preserved for debugging",
      );
      return original.split("\n");
    });
    for (const source of bundle.sources) {
      if (sourcePaths.includes(source)) continue;
      const text = fs.readFileSync(path.join(root, source), "utf8");
      assert.equal(
        text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").trim(),
        "",
        "only comment-only sources may be absent from a compacted map: " +
          source,
      );
    }
    const segments = decodeMappings(map.mappings);
    const sourceUsage = new Set();
    const standardMap = new SourceMap(map);
    let mapped = 0;
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const { generatedLine, generatedColumn } = segment;
      assert.ok(
        generatedLine >= 0 && generatedLine < compiled.length,
        "mapped generated line exists",
      );
      assert.ok(
        generatedColumn >= 0 &&
          generatedColumn <= compiled[generatedLine].length,
        "mapped generated column exists: " + bundle.output,
      );
      if (segment.unmapped) continue;
      mapped++;
      const { source, originalLine, originalColumn } = segment;
      assert.ok(
        source >= 0 && source < sourceLines.length,
        "mapped original source exists",
      );
      assert.ok(
        originalLine >= 0 && originalLine < sourceLines[source].length,
        "mapped original line exists",
      );
      assert.ok(
        originalColumn >= 0 &&
          originalColumn <= sourceLines[source][originalLine].length,
        "mapped original column exists: " + sourcePaths[source],
      );
      if (segment.name !== undefined)
        assert.ok(
          segment.name >= 0 && segment.name < map.names.length,
          "mapped original name exists",
        );
      sourceUsage.add(source);
      // Cross-check representative entries against Node's standard source-map
      // consumer, including column changes on compacted output lines.
      if (index === 0 || index === segments.length - 1 || index % 37 === 0) {
        const resolved = standardMap.findEntry(generatedLine, generatedColumn);
        assert.equal(resolved.originalSource, map.sources[source]);
        assert.equal(resolved.originalLine, originalLine);
        assert.equal(resolved.originalColumn, originalColumn);
      }
    }
    assert.ok(mapped > 0, bundle.output + " has original-source mappings");
    for (let source = 0; source < sourceLines.length; source++)
      if (
        sourceLines[source]
          .join("\n")
          .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
          .trim()
      )
        assert.ok(
          sourceUsage.has(source),
          "source with code has mappings: " + sourcePaths[source],
        );
  }
});
