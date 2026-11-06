"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { SourceMap } = require("node:module");
const { assembleBundle } = require("./assemble-bundle.cjs");
const sourceMap = require("./source-maps.cjs");
const { Linter } = require("eslint");
const recommended = require("@eslint/js").configs.recommended.rules;
const globals = require("globals");
const { applicationFiles } = require("./application-files.cjs");
const root = path.resolve(__dirname, "..");
const layout = JSON.parse(
  fs.readFileSync(path.join(root, "source-map.json"), "utf8"),
);
const files = [...applicationFiles(root).keys()].filter(
  (name) => name.endsWith(".js") && name !== "service-worker.js",
);
const namespaces = {};
const sections = [];
let line = 1;
const combined = files
  .map((name) => {
    const bundle = layout.bundles.find((item) => item.output === name);
    if (!bundle) throw Error("Unmapped application bundle: " + name);
    const fragments = bundle.sources.map((source) =>
      fs
        .readFileSync(path.join(root, source), "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/\n?$/, "\n"),
    );
    const { code, prefix } = assembleBundle(bundle, fragments);
    sections.push({
      name,
      line,
      map: new SourceMap(
        JSON.parse(sourceMap(name, bundle.sources, fragments, prefix)),
      ),
    });
    line += code.split("\n").length;
    for (const match of code.matchAll(
      /\b(?:globalThis|window|root)\.(Edu[A-Za-z0-9_]+)\s*=/g,
    ))
      namespaces[match[1]] = "readonly";
    return code;
  })
  .join("\n");
const appGlobals = {};
const linter = new Linter();
const capture = {
  rules: {
    globals: {
      create(context) {
        return {
          "Program:exit"() {
            for (const variable of context.sourceCode.scopeManager.globalScope
              .variables)
              appGlobals[variable.name] = "writable";
          },
        };
      },
    },
  },
};
let failures = 0;
function check(name, code, environment, extra = {}) {
  const messages = linter.verify(code, {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: environment,
    },
    rules: {
      ...recommended,
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-redeclare": ["error", { builtinGlobals: false }],
      ...extra.rules,
    },
    ...extra,
  });
  for (const message of messages) {
    let location = `${name}:${message.line}:${message.column}`;
    if (name === "application") {
      const section = sections.findLast((item) => item.line <= message.line);
      const generatedLine = message.line - section.line;
      const original = section.map.findEntry(
        generatedLine,
        Math.max(0, message.column - 1),
      );
      location = original.originalSource
        ? `${path.relative(root, path.resolve(root, path.dirname(section.name), original.originalSource)).replaceAll("\\", "/")}:${original.originalLine + 1}:${original.originalColumn + message.column - original.generatedColumn}`
        : `${section.name}:${generatedLine + 1}:${message.column}`;
    }
    console.error(
      `${location} ${message.ruleId || "parse"} ${message.message}`,
    );
    failures++;
  }
}
check(
  "application",
  combined,
  { ...globals.browser, ...namespaces },
  {
    plugins: { capture },
    rules: {
      ...recommended,
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "capture/globals": "error",
    },
  },
);
function walk(directory) {
  return fs
    .readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(directory + "/" + entry.name)
        : entry.name.endsWith(".cjs")
          ? [directory + "/" + entry.name]
          : [],
    );
}
for (const name of [...walk("scripts"), ...walk("audit")])
  check(name, fs.readFileSync(path.join(root, name), "utf8"), {
    ...globals.node,
    ...(name.startsWith("audit/")
      ? {
          ...globals.browser,
          ...appGlobals,
          ...namespaces,
          auditFixture: "readonly",
          auditInstallation: "readonly",
        }
      : {}),
  });
check(
  "service-worker.js",
  fs.readFileSync(path.join(root, "service-worker.js"), "utf8"),
  globals.serviceworker,
);
if (failures) process.exitCode = 1;
else
  console.log(
    "ESLint verified application, service worker, build scripts and tests.",
  );
