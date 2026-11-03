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

// Installed identities must stay stable while each role owns a disjoint URL range.
const base = new URL("https://example.test/edu-manager/");
const roleManifests = ["app.webmanifest", "deputy.webmanifest"].map((name) => {
  const data = JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
  const url = new URL(name, base);
  return {
    id: new URL(data.id, url),
    start: new URL(data.start_url, url),
    scope: new URL(data.scope, url),
  };
});
assert.equal(
  roleManifests[0].id.href,
  new URL("./", base).href,
  "Keep existing teacher installation identity",
);
assert.equal(
  roleManifests[1].id.href,
  new URL("./deputy", base).href,
  "Keep existing deputy installation identity",
);
for (const [index, manifest] of roleManifests.entries()) {
  assert.equal(manifest.scope.origin, base.origin);
  assert.ok(
    manifest.start.href.startsWith(manifest.scope.href),
    "Start must stay inside its role scope",
  );
  assert.ok(
    !roleManifests[1 - index].start.href.startsWith(manifest.scope.href),
    "An installed role must never capture the other role",
  );
  assert.notEqual(
    manifest.scope.pathname,
    base.pathname,
    "Root scope captures both installed roles",
  );
}
console.log(
  `Asset contract verified for ${[...files.keys()].filter((name) => name.startsWith("assets/")).length} external assets and both application entries.`,
);
