"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Linter } = require("eslint");
const globals = require("globals");

// Application services receive every collaborator through their factory. The
// allowlist is deliberately small: adding a service makes its public API an
// explicit review decision instead of adding another shared workspace binding.
const services = Object.freeze({
  "src/services/grading-results.js": "EduGradingResults",
  "src/services/installation-backup.js": "EduInstallationBackup",
  "src/services/karnameh-excel.js": "EduKarnamehExcel",
  "src/services/year-note-scope.js": "EduYearNoteScope",
  "src/services/update-preparation.js": "EduUpdatePreparation",
});

function inspectService(code, exportName) {
  const linter = new Linter();
  const boundary = {
    rules: {
      service: {
        create(context) {
          return {
            "Program:exit"(program) {
              const source = context.sourceCode,
                scope = source.scopeManager.globalScope,
                objects = new WeakSet(),
                rootParameters = new Set(),
                factories = new WeakSet(),
                calls = [],
                members = [],
                identifiers = [],
                report = (node, message) => context.report({ node, message });
              function visit(node) {
                if (!node) return;
                if (node.type === "CallExpression") calls.push(node);
                if (node.type === "MemberExpression") members.push(node);
                if (node.type === "Identifier") identifiers.push(node);
                for (const key of source.visitorKeys[node.type] || []) {
                  const value = node[key];
                  if (Array.isArray(value)) value.forEach(visit);
                  else visit(value);
                }
              }
              visit(program);
              for (const variable of scope.variables) {
                if (variable.defs.length)
                  report(
                    variable.identifiers[0],
                    "Service state must belong to its factory, not the application global scope.",
                  );
                if (variable.name === "globalThis")
                  for (const reference of variable.references)
                    objects.add(reference.identifier);
                if (!variable.defs.length)
                  for (const reference of variable.references)
                    if (reference.isWrite())
                      report(
                        reference.identifier,
                        "Service factories cannot replace language globals.",
                      );
              }
              for (const reference of scope.through) {
                const identifier = reference.identifier;
                if (identifier.name === "globalThis") objects.add(identifier);
                else if (!Object.hasOwn(globals.builtin, identifier.name))
                  report(
                    identifier,
                    `Inject application and platform dependencies through the factory: ${identifier.name}.`,
                  );
              }
              // Recognize the existing (function (root) { ... })(globalThis)
              // convention without allowing a root alias to hide ambient reads.
              for (const call of calls) {
                if (
                  !["FunctionExpression", "ArrowFunctionExpression"].includes(
                    call.callee.type,
                  )
                )
                  continue;
                const functionScope = source.scopeManager.acquire(call.callee);
                call.arguments.forEach((argument, index) => {
                  if (!objects.has(argument)) return;
                  const parameter = call.callee.params[index];
                  if (parameter?.type !== "Identifier") {
                    report(
                      argument,
                      "The global export root cannot be destructured.",
                    );
                    return;
                  }
                  const variable = functionScope?.variables.find(
                    (item) => item.name === parameter.name,
                  );
                  if (variable) rootParameters.add(variable);
                  for (const reference of variable?.references || [])
                    objects.add(reference.identifier);
                });
              }
              let exports = 0;
              for (const member of members) {
                if (!objects.has(member.object)) continue;
                const assignment = member.parent;
                if (
                  member.computed ||
                  member.property.name !== exportName ||
                  assignment?.type !== "AssignmentExpression" ||
                  assignment.operator !== "=" ||
                  assignment.left !== member
                ) {
                  report(
                    member,
                    `The global root may only publish the ${exportName} factory.`,
                  );
                  continue;
                }
                exports++;
                factories.add(assignment.right);
                if (
                  !["FunctionExpression", "ArrowFunctionExpression"].includes(
                    assignment.right.type,
                  ) ||
                  assignment.right.params.length !== 1
                )
                  report(
                    assignment.right,
                    "A service must export a factory with one dependency object.",
                  );
              }
              for (const outer of source.scopeManager.scopes) {
                if (outer === scope) continue;
                for (const variable of outer.variables) {
                  if (!variable.defs.length || rootParameters.has(variable))
                    continue;
                  let container = variable.identifiers[0];
                  while (container && !factories.has(container))
                    container = container.parent;
                  if (!container)
                    report(
                      variable.identifiers[0],
                      "Service state and helpers must belong to the exported factory, not a shared outer scope.",
                    );
                }
              }
              for (const identifier of identifiers) {
                if (!objects.has(identifier)) continue;
                const parent = identifier.parent;
                if (
                  (parent.type === "MemberExpression" &&
                    parent.object === identifier) ||
                  (parent.type === "CallExpression" &&
                    ["FunctionExpression", "ArrowFunctionExpression"].includes(
                      parent.callee.type,
                    ) &&
                    parent.arguments.includes(identifier))
                )
                  continue;
                report(
                  identifier,
                  "The global export root cannot escape into service state or dependencies.",
                );
              }
              if (exports !== 1)
                report(
                  program,
                  `A service must publish exactly one ${exportName} factory; found ${exports}.`,
                );
            },
          };
        },
      },
    },
  };
  return linter.verify(code, {
    languageOptions: { ecmaVersion: "latest", sourceType: "script" },
    plugins: { boundary },
    rules: {
      "boundary/service": "error",
      "no-eval": "error",
      "no-new-func": "error",
    },
  });
}

function checkArchitecture(root) {
  const errors = [],
    directory = path.join(root, "src/services"),
    manifest = JSON.parse(
      fs.readFileSync(path.join(root, "source-map.json"), "utf8"),
    ),
    bundle = manifest.bundles.find(
      (item) => item.output === "assets/scripts/application-services.js",
    );
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const source = "src/services/" + entry.name;
    if (!entry.isFile() || !Object.hasOwn(services, source))
      errors.push(
        `${source}: application service has no public boundary contract.`,
      );
  }
  for (const [source, exportName] of Object.entries(services)) {
    const filename = path.join(root, source);
    if (!fs.existsSync(filename)) {
      errors.push(`${source}: contracted application service is missing.`);
      continue;
    }
    for (const message of inspectService(
      fs.readFileSync(filename, "utf8"),
      exportName,
    ))
      errors.push(
        `${source}:${message.line}:${message.column} ${message.message}`,
      );
    const owners = manifest.bundles.filter((item) =>
      item.sources.includes(source),
    );
    if (
      owners.length !== 1 ||
      owners[0] !== bundle ||
      bundle.scope !== "global"
    )
      errors.push(
        `${source}: service must belong only to the standalone application-services bundle.`,
      );
  }
  const html = fs.readFileSync(path.join(root, "EduManager.html"), "utf8"),
    scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(
      (match) => match[1].replace(/^(?:\.\/)+/, ""),
    ),
    index = scripts.indexOf("assets/scripts/application-services.js");
  if (
    index < 0 ||
    scripts.lastIndexOf("assets/scripts/application-services.js") !== index ||
    index >= scripts.indexOf("assets/scripts/workspace-runtime.js")
  )
    errors.push(
      "EduManager.html: application services must load once before the workspace runtime.",
    );
  return errors;
}

module.exports = { services, inspectService, checkArchitecture };

if (require.main === module) {
  const errors = checkArchitecture(path.resolve(__dirname, ".."));
  for (const error of errors) console.error(error);
  if (errors.length) process.exitCode = 1;
  else
    console.log(
      `Verified ${Object.keys(services).length} isolated application service boundaries.`,
    );
}
