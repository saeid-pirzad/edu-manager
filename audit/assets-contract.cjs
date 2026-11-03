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
