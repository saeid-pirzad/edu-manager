"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { spawnSync } = require("node:child_process");

test("build detects stale artifacts, regenerates missing output and fingerprints source changes", (t) => {
  const root = path.resolve(__dirname, "..");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "edu-build-test-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  for (const name of [
    "src",
    "assets",
    "source-map.json",
    "EduManager.html",
    "index.html",
    "app.webmanifest",
    "service-worker.js",
  ])
    fs.cpSync(path.join(root, name), path.join(temporary, name), {
      recursive: true,
    });
  for (const name of [
    "scripts/build.cjs",
    "scripts/source-maps.cjs",
    "scripts/application-files.cjs",
    "audit/application-files.cjs",
  ]) {
    fs.mkdirSync(path.dirname(path.join(temporary, name)), { recursive: true });
    fs.copyFileSync(path.join(root, name), path.join(temporary, name));
  }
  const run = (...args) =>
    spawnSync(process.execPath, ["scripts/build.cjs", ...args], {
      cwd: temporary,
      encoding: "utf8",
      windowsHide: true,
    });
  assert.equal(run("--check").status, 0);
  const originalWorker = fs.readFileSync(
    path.join(temporary, "service-worker.js"),
    "utf8",
  );
  const htmlPath = path.join(temporary, "EduManager.html");
  const html = fs.readFileSync(htmlPath, "utf8").replace(/\r\n/g, "\n");
  for (const text of [html, html.replace(/\n/g, "\r\n")]) {
    fs.writeFileSync(htmlPath, text);
    assert.equal(
      run("--check").status,
      0,
      "line endings must not invalidate a release",
    );
  }
  const artifact = path.join(temporary, "assets/scripts/grade-math.js");
  fs.appendFileSync(artifact, "\n// stale output\n");
  assert.notEqual(run("--check").status, 0);
  fs.unlinkSync(artifact);
  assert.equal(run().status, 0, "build must regenerate missing output");
  assert.equal(run("--check").status, 0);
  assert.equal(
    fs.readFileSync(path.join(temporary, "service-worker.js"), "utf8"),
    originalWorker,
  );
  fs.writeFileSync(
    path.join(temporary, "service-worker.js"),
    originalWorker.replace("self.skipWaiting()", "Promise.resolve()"),
  );
  assert.notEqual(
    run("--check").status,
    0,
    "worker-only logic changes must invalidate the release",
  );
  assert.equal(run().status, 0);
  const workerOnly = fs.readFileSync(
    path.join(temporary, "service-worker.js"),
    "utf8",
  );
  assert.notEqual(
    workerOnly.match(/const VERSION = "([^"]+)"/)[1],
    originalWorker.match(/const VERSION = "([^"]+)"/)[1],
  );
  assert.equal(
    run("--check").status,
    0,
    "worker fingerprint must not be self-referential",
  );
  fs.appendFileSync(
    path.join(temporary, "src/domain/grade-math.js"),
    "\n// source change\n",
  );
  assert.notEqual(run("--check").status, 0);
  assert.equal(run().status, 0);
  const updatedWorker = fs.readFileSync(
    path.join(temporary, "service-worker.js"),
    "utf8",
  );
  assert.notEqual(
    updatedWorker.match(/const VERSION = "([^"]+)"/)[1],
    originalWorker.match(/const VERSION = "([^"]+)"/)[1],
  );
  assert.equal(run().status, 0);
  assert.equal(
    fs.readFileSync(path.join(temporary, "service-worker.js"), "utf8"),
    updatedWorker,
  );
  fs.writeFileSync(
    path.join(temporary, "src/unmapped.js"),
    "// not listed in source-map.json\n",
  );
  const unmapped = run("--check");
  assert.notEqual(unmapped.status, 0);
  assert.match(unmapped.stderr, /Unmapped source/);
});
