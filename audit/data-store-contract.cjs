"use strict";

// Guards the persistence boundary before its incremental extraction from legacy core.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const vm = require("node:vm");

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

if (!schema.includes('databaseName: "EduManagerProfessional"'))
  throw Error(
    "The expected IndexedDB database name is missing from the schema.",
  );
if (!schema.includes("minimumVersion: 2"))
  throw Error(
    "The minimum IndexedDB schema version is missing from the schema.",
  );
if (!schema.includes('workspaceIndexName: "workspace"'))
  throw Error("The workspace index name is missing from the schema.");
if (!schema.includes('workspaceIndexKeyPath: "workspace"'))
  throw Error("The workspace index key path is missing from the schema.");
if (
  !source.includes("EduDataStore.open({ onVersionChange: retireConnection })")
)
  throw Error("The application does not consume the database schema contract.");

const context = vm.createContext({});
vm.runInContext(schema, context);
const definitions = context.EduDataStoreSchema.stores;
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
const declaration = source.match(/const backupStores\s*=\s*(\[[\s\S]*?\]);/);
assert.ok(declaration, "Full-backup store declaration is missing");
const backup = vm.runInNewContext(declaration[1]);
assert.deepEqual(
  Array.from(backup).sort(),
  ["records", "catalog", "events", "backups", "undo", "reports"].sort(),
);

if (!source.includes("validateFullBackup"))
  throw Error("Full-backup validation must exist before restore is enabled.");

console.log(
  `Data-store contract verified for ${stores.length} IndexedDB stores.`,
);
