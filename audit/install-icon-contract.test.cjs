"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { applicationFiles } = require("../scripts/application-files.cjs");
const root = path.resolve(__dirname, "..");

test("updated install icons change URLs without changing the installed app identity", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "app.webmanifest"), "utf8"),
  );
  assert.equal(manifest.id, "./");
  assert.equal(manifest.start_url, "./EduManager.html");
  assert.equal(manifest.scope, "./EduManager.html");
  assert.equal(manifest.background_color, "#fffaed");
  assert.equal(manifest.icons.length, 4);
  const files = applicationFiles(root);
  for (const purpose of ["any", "maskable"]) {
    const icons = manifest.icons.filter((icon) => icon.purpose === purpose);
    assert.deepEqual(
      icons.map((icon) => icon.sizes),
      ["192x192", "512x512"],
    );
    for (const icon of icons) {
      const size = Number(icon.sizes.split("x")[0]);
      assert.equal(
        icon.src,
        `./assets/icons/app-cream-v2-${purpose === "maskable" ? "maskable-" : ""}${size}.png`,
      );
      assert.equal(icon.type, "image/png");
      assert.ok(files.has(icon.src.slice(2)));
      const bytes = fs.readFileSync(path.join(root, icon.src));
      assert.equal(bytes.subarray(1, 4).toString(), "PNG");
      assert.equal(bytes.readUInt32BE(16), size);
      assert.equal(bytes.readUInt32BE(20), size);
    }
  }
  assert.equal(files.has("assets/icons/logo-512.png"), false);
});

test("favicon and Apple icon use versioned assets while the in-app original reference stays unchanged", () => {
  const html = fs.readFileSync(path.join(root, "EduManager.html"), "utf8");
  assert.match(html, /href="\.\/assets\/icons\/app-cream-v2-180\.png"/);
  assert.match(html, /href="\.\/assets\/icons\/app-cream-v2-32\.png"/);
  assert.match(html, /as="image" href="\.\/assets\/logo3\.png"/);
  const setup = fs.readFileSync(path.join(root, "src/pwa/manifest.js"), "utf8");
  assert.match(setup, /manifest.href = "\.\/app.webmanifest"/);
});
