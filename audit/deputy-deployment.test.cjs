"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  vm = require("node:vm");
const { applicationFiles } = require("../scripts/application-files.cjs"),
  { deputyFiles, writeDeployment } = require("../scripts/deploy-deputy.cjs");
const root = path.resolve(__dirname, "..");
test("standalone deputy deployment includes only its runtime and opens deputy from the root", () => {
  const files = deputyFiles(root);
  assert.equal(files.has("Deputy.html"), false);
  for (const forbidden of [
    "EduManager.html",
    "app.webmanifest",
    "assets/scripts/legacy-ui.js",
    "assets/scripts/pwa-ui.js",
  ])
    assert.equal(files.has(forbidden), false, forbidden);
  assert.match(files.get("index.html"), /id="deputyApp"/);
  assert.doesNotMatch(files.get("index.html"), /EduManager.html/);
  const manifest = JSON.parse(files.get("deputy.webmanifest"));
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.id, "./deputy");
  assert.equal(manifest.start_url, "./");
  const worker = files.get("service-worker.js");
  assert.match(worker, /const APP = new URL\(".\/", BASE\).href/);
  const cached = Array.from(
    vm.runInNewContext(worker.match(/const FILES\s*=\s*(\[[\s\S]*?\]);/)[1]),
  );
  assert.deepEqual(
    cached.sort(),
    [...files.keys()]
      .filter(
        (n) =>
          !["service-worker.js", "_headers", "_redirects", "404.html"].includes(
            n,
          ),
      )
      .map((name) => (name === "index.html" ? "./" : name))
      .sort(),
  );
  for (const name of cached)
    assert.ok(files.has(name === "./" ? "index.html" : name), name);
  assert.doesNotMatch(worker, /new URL\("EduManager.html", BASE\)/);
  assert.ok(!cached.includes("index.html"));
  assert.ok(!cached.includes("404.html"));
  assert.match(files.get("_redirects"), /Deputy.html \/ 302/);
});
test("deployment selection rejects unknown roles and keeps combined GitHub output unchanged", () => {
  const both = applicationFiles(root),
    deputy = applicationFiles(root, { role: "deputy" });
  assert.ok(both.has("EduManager.html"));
  assert.ok(both.has("Deputy.html"));
  assert.ok(deputy.size < both.size);
  assert.equal(deputy.has("app.webmanifest"), false);
  assert.throws(
    () => applicationFiles(root, { role: "../../private" }),
    /Unknown deployment role/,
  );
});
test("deployment is reproducible, fingerprints runtime changes and excludes stray JSON backups", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "edu-deputy-package-"));
  try {
    for (const name of applicationFiles(root).keys()) {
      const target = path.join(temp, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, name), target);
    }
    fs.writeFileSync(
      path.join(temp, "EduManager-data.json"),
      '{"private":"PERSONAL-DATA-SENTINEL-728"}',
    );
    fs.writeFileSync(
      path.join(temp, "private.json"),
      '{"private":"PERSONAL-DATA-SENTINEL-728"}',
    );
    const before = deputyFiles(temp);
    assert.deepEqual([...before], [...deputyFiles(temp)]);
    assert.equal(
      [...before.values()].some((v) =>
        v.includes("PERSONAL-DATA-SENTINEL-728"),
      ),
      false,
    );
    const result = writeDeployment(temp);
    assert.equal(result.target, path.join(temp, "dist", "deputy"));
    fs.writeFileSync(path.join(result.target, "stale.txt"), "old");
    writeDeployment(temp);
    assert.equal(fs.existsSync(path.join(result.target, "stale.txt")), false);
    fs.appendFileSync(
      path.join(temp, "assets/scripts/deputy.js"),
      "\n// changed deployment\n",
    );
    assert.notEqual(
      deputyFiles(temp).get("service-worker.js"),
      before.get("service-worker.js"),
    );
  } finally {
    if (temp.startsWith(path.join(os.tmpdir(), "edu-deputy-package-")))
      fs.rmSync(temp, { recursive: true, force: true });
  }
});
