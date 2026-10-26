"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Linter } = require("eslint");
const recommended = require("@eslint/js").configs.recommended.rules;
const globals = require("globals");
const { applicationFiles } = require("./application-files.cjs");
const root = path.resolve(__dirname, "..");
const files = [...applicationFiles(root).keys()].filter(
  (name) => name.endsWith(".js") && name !== "service-worker.js",
);
const namespaces = {};
const sections = [];
let line = 1;
const combined = files
  .map((name) => {
    const code = fs.readFileSync(path.join(root, name), "utf8");
    sections.push({ name, line, lines: code.split("\n") });
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
      const banner = section.lines
        .slice(0, generatedLine + 1)
        .findLastIndex((text) => text.startsWith("// Source: "));
      location =
        banner >= 0
          ? `${section.lines[banner].slice(11)}:${generatedLine - banner}:${message.column}`
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
