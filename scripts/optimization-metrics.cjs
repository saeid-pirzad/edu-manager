"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { Linter } = require("eslint");

function attributes(tag) {
  const result = new Map();
  for (const match of tag.matchAll(
    /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )) {
    const name = match[1].toLowerCase();
    if (!result.has(name))
      result.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function initialReferences(html) {
  const result = [];
  const seen = new Set();
  for (const [tag] of html
    .replace(/<!--[\s\S]*?-->/g, "")
    .matchAll(/<(?:script|link)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    const isScript = /^<script\b/i.test(tag);
    const attrs = attributes(tag);
    if (
      !isScript &&
      !attrs.get("rel")?.toLowerCase().split(/\s+/).includes("stylesheet")
    )
      continue;
    const reference = attrs.get(isScript ? "src" : "href");
    if (!reference || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) continue;
    const file = reference.replace(/^\.\//, "").split(/[?#]/, 1)[0];
    if (
      !/^assets\/[A-Za-z0-9_./-]+\.(?:js|css)$/.test(file) ||
      file.includes("..") ||
      !file.endsWith(isScript ? ".js" : ".css")
    )
      throw Error("Unsupported initial code reference: " + reference);
    if (seen.has(file)) continue;
    seen.add(file);
    result.push(file);
  }
  return result;
}

function countFunctions(code, filename) {
  const counts = { declarations: 0, expressions: 0, arrows: 0, total: 0 };
  const messages = new Linter().verify(code, {
    languageOptions: { ecmaVersion: "latest", sourceType: "script" },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    plugins: {
      metrics: {
        rules: {
          functions: {
            create() {
              return {
                FunctionDeclaration() {
                  counts.declarations++;
                },
                FunctionExpression() {
                  counts.expressions++;
                },
                ArrowFunctionExpression() {
                  counts.arrows++;
                },
              };
            },
          },
        },
      },
    },
    rules: { "metrics/functions": "error" },
  });
  if (messages.length)
    throw Error(
      "Cannot measure JavaScript: " + filename + ": " + messages[0].message,
    );
  counts.total = counts.declarations + counts.expressions + counts.arrows;
  return counts;
}

function measure(root) {
  const layout = JSON.parse(
    fs.readFileSync(path.join(root, "source-map.json"), "utf8"),
  );
  const mapped = new Map();
  const scopes = new Map();
  const allSources = new Set();
  for (const bundle of layout.bundles) {
    if (
      !/^assets\/(?:scripts|styles)\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(
        bundle.output,
      ) ||
      mapped.has(bundle.output) ||
      !Array.isArray(bundle.sources) ||
      !bundle.sources.length ||
      typeof bundle.scope !== "string"
    )
      throw Error("Invalid source layout bundle: " + bundle.output);
    const scope = scopes.get(bundle.scope) ?? {
      scope: bundle.scope,
      bundles: 0,
      sourceFiles: 0,
      functions: 0,
    };
    for (const source of bundle.sources) {
      if (
        !/^src\/[A-Za-z0-9_./-]+\.(?:js|css)$/.test(source) ||
        source.includes("..") ||
        allSources.has(source)
      )
        throw Error("Invalid or duplicate source: " + source);
      allSources.add(source);
    }
    scope.bundles++;
    scope.sourceFiles += bundle.sources.length;
    scopes.set(bundle.scope, scope);
    mapped.set(bundle.output, bundle);
  }
  const measured = new Map();
  function asset(file) {
    if (measured.has(file)) return measured.get(file);
    const text = fs
      .readFileSync(path.join(root, file), "utf8")
      .replace(/\r\n/g, "\n");
    const bytes = Buffer.from(text);
    const bundle = mapped.get(file);
    const row = {
      file,
      kind: file.endsWith(".js") ? "javascript" : "stylesheet",
      rawBytes: bytes.length,
      gzipBytes: zlib.gzipSync(bytes, { level: 9 }).length,
      ...(file.endsWith(".js")
        ? { functions: countFunctions(text, file) }
        : {}),
      scope: bundle?.scope ?? null,
      sourceFiles: bundle?.sources.length ?? 0,
    };
    measured.set(file, row);
    return row;
  }
  const initial = initialReferences(
    fs.readFileSync(path.join(root, "EduManager.html"), "utf8"),
  ).map(asset);
  for (const bundle of layout.bundles)
    scopes.get(bundle.scope).functions +=
      asset(bundle.output).functions?.total ?? 0;
  function total(kind) {
    return initial
      .filter((row) => row.kind === kind)
      .reduce(
        (sum, row) => ({
          files: sum.files + 1,
          rawBytes: sum.rawBytes + row.rawBytes,
          gzipBytes: sum.gzipBytes + row.gzipBytes,
          functions: sum.functions + (row.functions?.total ?? 0),
        }),
        { files: 0, rawBytes: 0, gzipBytes: 0, functions: 0 },
      );
  }
  return {
    schemaVersion: 1,
    entry: "EduManager.html",
    method: {
      initialScope:
        "Unique static external script and stylesheet references in the entry HTML; excludes inline code, dynamic imports, workers, maps, images and user data.",
      rawBytes:
        "UTF-8 text with CRLF normalized to LF, matching release asset hashing.",
      gzipBytes:
        "Sum of independent gzip level 9 encodings, not observed HTTP transfer bytes or browser cache usage.",
      functions:
        "AST function declarations, expressions and arrows in built JavaScript, including generated wrappers. Source-layout scopes are build groups, not lexical scopes.",
      limitations:
        "These are code inventory and payload measurements, not device timing, business correctness, maintainability scores or percentages of optimization.",
    },
    initial: {
      javascript: total("javascript"),
      stylesheets: total("stylesheet"),
      assets: initial,
    },
    sourceLayout: {
      bundles: layout.bundles.length,
      sourceFiles: allSources.size,
      scopes: [...scopes.values()].sort((a, b) =>
        a.scope.localeCompare(b.scope, "en"),
      ),
    },
  };
}

if (require.main === module)
  console.log(JSON.stringify(measure(path.resolve(__dirname, "..")), null, 2));

module.exports = { initialReferences, countFunctions, measure };
