"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { applicationFiles } = require("./application-files.cjs");

const root = path.resolve(__dirname, "..");
const files = applicationFiles(root);
const runtimeFiles = applicationFiles(root, { includeSourceMaps: false });
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
  [...runtimeFiles.keys()]
    .filter((name) => name !== "service-worker.js")
    .sort(),
  "Offline cache must contain exactly the application shell and its dependencies",
);
assert.ok(
  !cached.some((name) => name.endsWith(".map")),
  "Debug maps are not runtime dependencies",
);
const integrityDeclaration = worker.match(
  /const INTEGRITY\s*=\s*(\{[\s\S]*?\});/,
);
assert.ok(integrityDeclaration, "Service worker integrity metadata is missing");
const integrity = JSON.parse(integrityDeclaration[1]);
assert.deepEqual(Object.keys(integrity).sort(), [...cached].sort());
for (const name of cached) {
  const text = fs
    .readFileSync(path.join(root, name), "utf8")
    .replace(/\r\n/g, "\n");
  assert.equal(
    integrity[name][0],
    crypto.createHash("sha256").update(text).digest("hex"),
    "Wrong runtime fingerprint: " + name,
  );
  assert.equal(
    integrity[name][1],
    runtimeFiles.get(name).split(";")[0],
    "Wrong runtime MIME: " + name,
  );
}
assert.ok(
  ![...files.keys()].some((name) => name.includes("deputy-exchange-legacy")),
);
const identityContext = vm.createContext({});
vm.runInContext(
  fs.readFileSync(path.join(root, "assets/scripts/deputy-exchange.js"), "utf8"),
  identityContext,
);
assert.equal(
  typeof identityContext.EduDeputyExportIdentity?.fromRows,
  "function",
);
assert.equal(
  identityContext.EduDeputyExchange,
  undefined,
  "The unused exchange must not execute at startup",
);
for (const name of files.keys()) {
  if (name.endsWith(".js"))
    new vm.Script(fs.readFileSync(path.join(root, name), "utf8"), {
      filename: name,
    });
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "app.webmanifest"), "utf8"),
);
const base = new URL("https://example.test/edu-manager/");
assert.equal(new URL(manifest.id, base).href, base.href);
assert.equal(
  new URL(manifest.start_url, base).pathname,
  "/edu-manager/EduManager.html",
);
assert.ok(
  new URL(manifest.start_url, base).href.startsWith(
    new URL(manifest.scope, base).href,
  ),
);
assert.ok(
  ![...files.keys()].some((name) =>
    /Deputy.html|deputy.webmanifest|deputy-(?:store|auto-backup|pwa)\.js|\/deputy\.(?:js|css)/.test(
      name,
    ),
  ),
);
assert.ok(!fs.existsSync(path.join(root, "Deputy.html")));
assert.match(
  fs.readFileSync(path.join(root, "src/reports/periodic/render.js"), "utf8"),
  /data-deputy-copy/,
);
assert.doesNotMatch(
  fs.readFileSync(path.join(root, "src/reports/periodic/render.js"), "utf8"),
  /data-workspace-action="deputy-export"/,
);
assert.doesNotMatch(worker, /deputyNavigation|new URL\("Deputy.html"/);
console.log("Teacher-only application and offline asset contract verified.");
