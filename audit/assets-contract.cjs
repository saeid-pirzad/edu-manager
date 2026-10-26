"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { applicationFiles } = require("./application-files.cjs");

const root = path.resolve(__dirname, "..");
const files = applicationFiles(root);
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const declaration = worker.match(/const FILES\s*=\s*(\[[\s\S]*?\]);/);
assert.ok(declaration, "Service worker cache list is missing");
const cached = Array.from(vm.runInNewContext(declaration[1]));
assert.equal(
  new Set(cached).size,
  cached.length,
  "Duplicate offline cache entry",
);
assert.deepEqual(
  [...cached].sort(),
  [...files.keys()].filter((name) => name !== "service-worker.js").sort(),
  "Offline cache must contain exactly the application shell and its dependencies",
);
for (const name of files.keys()) {
  if (name.endsWith(".js"))
    new vm.Script(fs.readFileSync(path.join(root, name), "utf8"), {
      filename: name,
    });
}
console.log(`Asset contract verified for ${files.size - 4} external assets.`);
