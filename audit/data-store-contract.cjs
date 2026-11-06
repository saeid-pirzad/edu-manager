"use strict";

// Guards the persistence boundary before its incremental extraction from legacy core.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { Linter } = require("eslint");

const source = fs.readFileSync(
  path.join(__dirname, "..", "assets", "scripts", "workspace-runtime.js"),
  "utf8",
);
const schema = fs.readFileSync(
  path.join(__dirname, "..", "assets", "scripts", "data-store-schema.js"),
  "utf8",
);
const stores = [
  "catalog",
  "records",
  "events",
  "undo",
  "backups",
  "reports",
  "drafts",
];

const context = vm.createContext({});
vm.runInContext(schema, context);
const contract = context.EduDataStoreSchema;
assert.equal(
  contract.databaseName,
  "EduManagerProfessional",
  "stable IndexedDB database name",
);
assert.equal(
  contract.minimumVersion,
  2,
  "minimum supported IndexedDB schema version",
);
assert.equal(contract.workspaceIndexName, "workspace", "workspace index name");
assert.equal(
  contract.workspaceIndexKeyPath,
  "workspace",
  "workspace index key path",
);
const definitions = contract.stores;
assert.deepEqual(
  Array.from(definitions, (definition) => definition.name).sort(),
  [...stores].sort(),
);
assert.equal(
  new Set(definitions.map((definition) => definition.name)).size,
  stores.length,
);
for (const definition of definitions) {
  assert.equal(
    definition.keyPath,
    ["records", "drafts"].includes(definition.name) ? "key" : "id",
  );
  assert.equal(!!definition.autoIncrement, definition.name === "events");
  assert.equal(
    !!definition.workspaceIndex,
    ["events", "drafts"].includes(definition.name),
  );
}
// Inspect executable syntax, not formatting-sensitive substrings, comments or
// strings. Compact output must keep the same real persistence boundary.
const declarations = {
  openDatabase: [],
  retireConnection: [],
  backupStores: [],
  validateFullBackup: [],
};
const validationCalls = [];
let scopes;
const parseMessages = new Linter().verify(source, {
  languageOptions: { ecmaVersion: "latest", sourceType: "script" },
  linterOptions: { reportUnusedDisableDirectives: "off" },
  plugins: {
    contract: {
      rules: {
        inspect: {
          create(ruleContext) {
            return {
              FunctionDeclaration(node) {
                if (
                  ["openDatabase", "retireConnection"].includes(node.id?.name)
                )
                  declarations[node.id.name].push(node);
              },
              VariableDeclarator(node) {
                if (
                  ["backupStores", "validateFullBackup"].includes(node.id?.name)
                )
                  declarations[node.id.name].push(node);
              },
              CallExpression(node) {
                if (
                  node.callee.type === "Identifier" &&
                  node.callee.name === "validateFullBackup"
                )
                  validationCalls.push(node);
              },
              "Program:exit"() {
                scopes = ruleContext.sourceCode.scopeManager.scopes;
              },
            };
          },
        },
      },
    },
  },
  rules: { "contract/inspect": "error" },
});
assert.deepEqual(
  parseMessages,
  [],
  "built persistence code parses successfully",
);
for (const [name, nodes] of Object.entries(declarations))
  assert.equal(
    nodes.length,
    1,
    "exactly one executable declaration for " + name,
  );
function memberCall(node, object, method) {
  return (
    node?.type === "CallExpression" &&
    !node.optional &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    !node.callee.optional &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === object &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === method
  );
}
const openBody = declarations.openDatabase[0].body.body;
assert.equal(
  openBody.length,
  1,
  "database opening has one direct return statement",
);
assert.equal(openBody[0].type, "ReturnStatement");
const openCall = openBody[0].argument;
assert.ok(
  memberCall(openCall, "EduDataStore", "open"),
  "real database adapter opens the connection",
);
assert.equal(openCall.arguments.length, 1);
const options = openCall.arguments[0];
assert.equal(options.type, "ObjectExpression");
assert.equal(
  options.properties.length,
  1,
  "only the explicit connection-retirement option is supplied",
);
const option = options.properties[0];
assert.equal(option.type, "Property");
assert.equal(option.computed, false);
assert.equal(option.kind, "init");
assert.equal(option.method, false);
assert.equal(option.key.type, "Identifier");
assert.equal(option.key.name, "onVersionChange");
assert.equal(option.value.type, "Identifier");
assert.equal(option.value.name, "retireConnection");
const retirementReference = scopes
  .flatMap((scope) => scope.references)
  .find((reference) => reference.identifier === option.value);
assert.ok(
  retirementReference?.resolved?.defs.some(
    (definition) => definition.node === declarations.retireConnection[0],
  ),
  "version changes bind the actual retirement function",
);
const backupDeclaration = declarations.backupStores[0];
assert.equal(backupDeclaration.parent.kind, "const");
assert.equal(backupDeclaration.init.type, "ArrayExpression");
const backup = backupDeclaration.init.elements.map((element) => {
  assert.equal(
    element?.type,
    "Literal",
    "backup store names are literal values, never arbitrary code",
  );
  assert.equal(typeof element.value, "string");
  return element.value;
});
assert.deepEqual(
  Array.from(backup).sort(),
  ["records", "catalog", "events", "backups", "undo", "reports"].sort(),
);

const validator = declarations.validateFullBackup[0].init;
assert.ok(
  memberCall(validator, "EduFullBackupValidator", "create"),
  "full restore uses the real full-backup validator factory",
);
assert.ok(
  validationCalls.length > 0,
  "full-backup validation is actually invoked",
);

console.log(
  `Data-store contract verified for ${stores.length} IndexedDB stores.`,
);
