"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
test("release verification and CI include the isolated complete-year backup file roundtrip", () => {
  const root = path.join(__dirname, "..");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  assert.equal(
    manifest.scripts["test:annual-backup"],
    "node audit/annual-backup-scale.cjs",
  );
  assert.ok(
    manifest.scripts["check:release"]
      .split(/\s*&&\s*/)
      .includes("npm run test:annual-backup"),
    "the full-year roundtrip must stop a failed release",
  );
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/ci.yml"),
    "utf8",
  );
  const verify = workflow.indexOf("- run: npm run check:release");
  assert.ok(verify >= 0, "CI must run the same release verification");
  assert.ok(
    workflow.indexOf("- run: npm run release:package") > verify,
    "packaging must follow successful verification",
  );
});
