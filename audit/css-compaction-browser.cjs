"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parsers } = require("prettier/plugins/postcss");

// Constructed sheets are never adopted or attached to the document. This checks
// the actual browser's canonical rules at every level, including print queries,
// container queries, nested rules, keyframes, priorities and font descriptors.
// Keep the separate source/fallback tests: CSSOM intentionally canonicalizes
// repeated declarations to the values supported by this browser.
function inspectCssCompaction({ original, compacted }) {
  function snapshot(css) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    const counts = { rules: 0, declarations: 0, fonts: 0, fontBytes: 0 };
    const fonts = [];
    function rules(list) {
      return [...list].map((rule) => {
        counts.rules++;
        const result = {
          type: rule.type,
          kind: rule.constructor.name,
        };
        for (const key of [
          "selectorText",
          "conditionText",
          "name",
          "keyText",
          "containerName",
          "containerQuery",
          "href",
        ])
          if (typeof rule[key] === "string") result[key] = rule[key];
        if (rule.media) result.media = rule.media.mediaText;
        if (rule.style) {
          result.declarations = [...rule.style].map((property) => {
            counts.declarations++;
            return [
              property,
              rule.style.getPropertyValue(property),
              rule.style.getPropertyPriority(property),
            ];
          });
          if (rule.type === CSSRule.FONT_FACE_RULE) {
            counts.fonts++;
            const src = rule.style.getPropertyValue("src");
            for (const match of src.matchAll(
              /url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g,
            )) {
              const url = (match[1] ?? match[2] ?? match[3]).trim();
              if (!url.startsWith("data:")) continue;
              const comma = url.indexOf(",");
              if (comma < 0) throw Error("Malformed inline font data URL");
              const metadata = url.slice(0, comma);
              const bytes = /;base64$/i.test(metadata)
                ? atob(url.slice(comma + 1))
                : decodeURIComponent(url.slice(comma + 1));
              counts.fontBytes += bytes.length;
              fonts.push({ metadata, bytes });
            }
          }
        }
        if (rule.cssRules) result.rules = rules(rule.cssRules);
        if (!rule.style && !rule.cssRules) result.text = rule.cssText;
        return result;
      });
    }
    return { rules: rules(sheet.cssRules), counts, fonts };
  }
  const source = snapshot(original);
  const compact = snapshot(compacted);
  const differences = [];
  function compare(a, b, location) {
    if (Object.is(a, b)) return;
    if (
      a === null ||
      b === null ||
      typeof a !== "object" ||
      typeof b !== "object"
    ) {
      differences.push({
        location,
        source: a,
        compacted: b,
      });
      return;
    }
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    if (Array.isArray(a) && a.length !== b.length)
      differences.push({
        location: location + ".length",
        source: a.length,
        compacted: b.length,
      });
    for (const key of keys) compare(a[key], b[key], location + "." + key);
  }
  compare(source.rules, compact.rules, "rules");
  return {
    fontBytesMatch:
      JSON.stringify(source.fonts) === JSON.stringify(compact.fonts),
    source: source.counts,
    compacted: compact.counts,
    differences,
  };
}

// CSSOM retains formatting in unresolved var() and custom-property values.
// Independently compare their parsed tokens, not whitespace-stripped strings.
// Spaces required between tokens and around binary +/- remain significant;
// quoted contents, numeric precision, functions and grouping remain untouched.
function canonicalValue(value) {
  const parsed = parsers.css.parse(".audit { value: " + value + "; }");
  if (
    parsed.nodes.length !== 1 ||
    parsed.nodes[0].type !== "css-rule" ||
    parsed.nodes[0].nodes.length !== 1 ||
    parsed.nodes[0].nodes[0].type !== "css-decl"
  )
    throw Error(
      "The native value did not parse as one complete CSS declaration",
    );
  const declaration = parsed.nodes[0].nodes[0];
  function clean(node) {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(clean);
    const result = {};
    for (const [key, child] of Object.entries(node)) {
      if (["raws", "source", "sourceIndex", "inputs"].includes(key)) continue;
      if (key === "text" && node.type === "value-root") continue;
      result[key] = clean(child);
    }
    if (node.type === "value-comma_group" && Array.isArray(node.groups)) {
      result.separators = node.groups.slice(1).map((child, index) => {
        const previous = node.groups[index];
        if (
          [previous, child].some(
            (item) =>
              item.type === "value-operator" && ["*", "/"].includes(item.value),
          )
        )
          return null;
        return /[\t\n\f\r ]/.test(
          (previous.raws?.after || "") + (child.raws?.before || ""),
        );
      });
    }
    return result;
  }
  return JSON.stringify(clean(declaration.value));
}

function meaningfulDifferences(differences) {
  return differences.filter((difference) => {
    if (
      !/\.declarations\.\d+\.1$/.test(difference.location) ||
      typeof difference.source !== "string" ||
      typeof difference.compacted !== "string"
    )
      return true;
    try {
      return (
        canonicalValue(difference.source) !==
        canonicalValue(difference.compacted)
      );
    } catch {
      // An unrecognized value must fail rather than silently pass the audit.
      return true;
    }
  });
}

async function run({ evaluate, cases, root }) {
  const layout = JSON.parse(
    fs.readFileSync(path.join(root, "source-map.json"), "utf8"),
  );
  const bundles = layout.bundles.filter((bundle) => bundle.scope === "css");
  if (!bundles.length)
    throw Error("No CSS bundles registered for parity audit");
  for (const bundle of bundles) {
    const original = bundle.sources
      .map(
        (file) =>
          "/* Source: " +
          file +
          " */\n" +
          fs
            .readFileSync(path.join(root, file), "utf8")
            .replace(/\r\n/g, "\n")
            .replace(/\n?$/, "\n"),
      )
      .join("");
    const compacted = fs.readFileSync(path.join(root, bundle.output), "utf8");
    const result = await evaluate(
      "(" +
        inspectCssCompaction.toString() +
        ")(" +
        JSON.stringify({ original, compacted }) +
        ")",
    );
    const mismatches = meaningfulDifferences(result.differences);
    const describe = (value) => {
      const text = JSON.stringify(value);
      return text?.length > 180 ? text.slice(0, 180) + "…" : text;
    };
    const name = path.basename(bundle.output, ".css");
    cases.push({
      id: "CSS_COMPACT_NATIVE_RULES_" + name,
      name:
        "All native CSSOM rules, selectors, conditions, declarations and priorities match source: " +
        bundle.output,
      pass:
        result.source.rules > 0 &&
        result.source.declarations > 0 &&
        mismatches.length === 0,
      observed: {
        source: result.source,
        compacted: result.compacted,
        mismatchCount: mismatches.length,
        mismatches: mismatches.slice(0, 8).map((difference) => ({
          location: difference.location,
          source: describe(difference.source),
          compacted: describe(difference.compacted),
        })),
      },
    });
    cases.push({
      id: "CSS_COMPACT_INLINE_FONT_BYTES_" + name,
      name: "Inline font data bytes are unchanged: " + bundle.output,
      pass: result.fontBytesMatch,
      observed: {
        sourceFonts: result.source.fonts,
        compactedFonts: result.compacted.fonts,
        sourceBytes: result.source.fontBytes,
        compactedBytes: result.compacted.fontBytes,
      },
    });
  }
}

module.exports = { run, canonicalValue, meaningfulDifferences };
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "css-compaction-native-parity", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
