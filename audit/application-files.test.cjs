"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const {
  applicationFiles,
  contentType,
  assetBytes,
} = require("../scripts/application-files.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "edu-asset-catalog-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, text) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  };
  write("EduManager.html", '<script src="./assets/scripts/app.js"></script>');
  write("index.html", "entry");
  write("app.webmanifest", "{}");
  write("service-worker.js", "worker");
  write("assets/scripts/app.js", "app();\n//# sourceMappingURL=app.js.map\n");
  write("assets/scripts/app.js.map", '{"sourcesContent":["app();"]}');
  write("assets/scripts/unused.js", "unused();");
  return root;
}

test("debug release assets remain available while offline dependencies exclude maps and unused bundles", (t) => {
  const root = fixture(t);
  const release = applicationFiles(root);
  const runtime = applicationFiles(root, { includeSourceMaps: false });
  assert.equal(release.has("assets/scripts/app.js.map"), true);
  assert.equal(runtime.has("assets/scripts/app.js.map"), false);
  assert.equal(runtime.has("assets/scripts/app.js"), true);
  assert.equal(release.has("assets/scripts/unused.js"), false);
  assert.deepEqual(
    [...runtime.keys()],
    [
      "EduManager.html",
      "index.html",
      "app.webmanifest",
      "service-worker.js",
      "assets/scripts/app.js",
    ],
  );
});

test("unavailable developer maps do not prevent runtime asset discovery", (t) => {
  const root = fixture(t);
  fs.unlinkSync(path.join(root, "assets/scripts/app.js.map"));
  assert.equal(
    applicationFiles(root, { includeSourceMaps: false }).has(
      "assets/scripts/app.js",
    ),
    true,
  );
  assert.throws(() => applicationFiles(root), /ENOENT|Missing source map/);
});

test("one local PNG may serve manifest, favicon, touch icon and repeated images without duplicate cache entries", (t) => {
  const root = fixture(t);
  fs.appendFileSync(
    path.join(root, "EduManager.html"),
    '<link rel="icon" href="./assets/logo.png"><link rel="apple-touch-icon" href="./assets/logo.png"><img src="./assets/logo.png"><img src="./assets/logo.png">',
  );
  fs.writeFileSync(
    path.join(root, "app.webmanifest"),
    JSON.stringify({
      icons: [
        { src: "./assets/logo.png", sizes: "192x192" },
        { src: "./assets/logo.png", sizes: "512x512" },
      ],
    }),
  );
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255, 0]);
  fs.writeFileSync(path.join(root, "assets/logo.png"), bytes);
  for (const includeSourceMaps of [true, false]) {
    const catalog = applicationFiles(root, { includeSourceMaps });
    assert.equal(catalog.get("assets/logo.png"), "image/png");
    assert.equal(
      [...catalog.keys()].filter((name) => name === "assets/logo.png").length,
      1,
    );
  }
});

test("a manifest-only local icon becomes a required offline dependency", (t) => {
  const root = fixture(t);
  fs.writeFileSync(
    path.join(root, "app.webmanifest"),
    JSON.stringify({ icons: [{ src: "./assets/manifest-icon.png" }] }),
  );
  assert.throws(
    () => applicationFiles(root),
    /ENOENT|Missing application asset/,
  );
  fs.writeFileSync(path.join(root, "assets/manifest-icon.png"), "PNG fixture");
  assert.equal(
    applicationFiles(root, { includeSourceMaps: false }).get(
      "assets/manifest-icon.png",
    ),
    "image/png",
  );
});

test("manifest image discovery cannot widen the release allowlist to remote, traversal or data files", (t) => {
  const root = fixture(t);
  for (const src of [
    "https://another.test/logo.png",
    "//another.test/logo.png",
    "../logo.png",
    "./assets/../private.png",
    "./assets/%2e%2e/private.png",
    "./docs/School-doc/private.png",
    "./assets/backup.json",
    "data:text/html;base64,PHNjcmlwdD4=",
  ]) {
    fs.writeFileSync(
      path.join(root, "app.webmanifest"),
      JSON.stringify({ icons: [{ src }] }),
    );
    assert.throws(
      () => applicationFiles(root),
      /Unsupported application manifest icon|Unsafe application asset/,
      src,
    );
  }
});

test("embedded legacy PNG icons remain supported without becoming filesystem assets", (t) => {
  const root = fixture(t);
  fs.writeFileSync(
    path.join(root, "app.webmanifest"),
    JSON.stringify({ icons: [{ src: "data:image/png;base64,iVBORw0KGgo=" }] }),
  );
  assert.equal(
    [...applicationFiles(root).keys()].some((name) => name.startsWith("data:")),
    false,
  );
});

test("duplicate script execution is still rejected when image references are deduplicated", (t) => {
  const root = fixture(t);
  fs.appendFileSync(
    path.join(root, "EduManager.html"),
    '<script src="./assets/scripts/app.js"></script>',
  );
  assert.throws(() => applicationFiles(root), /Duplicate application asset/);
});

test("binary fingerprints preserve invalid UTF-8 and embedded CRLF while text stays checkout-independent", () => {
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255, 0]);
  assert.equal(contentType("assets/logo.png"), "image/png");
  assert.deepEqual(assetBytes("assets/logo.png", bytes), bytes);
  assert.notDeepEqual(
    assetBytes("assets/logo.png", bytes),
    Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n")),
  );
  assert.deepEqual(
    assetBytes("EduManager.html", Buffer.from("one\r\ntwo\r\n")),
    assetBytes("EduManager.html", "one\ntwo\n"),
  );
  assert.throws(() => contentType("assets/backup.json"), /Unsupported/);
});

test("startup keeps backup identity behavior without loading the unused exchange implementation", () => {
  const root = path.resolve(__dirname, "..");
  const layout = JSON.parse(
    fs.readFileSync(path.join(root, "source-map.json"), "utf8"),
  );
  const live = layout.bundles.find(
    (bundle) => bundle.output === "assets/scripts/deputy-exchange.js",
  );
  const retired = layout.bundles.find(
    (bundle) => bundle.output === "assets/scripts/deputy-exchange-legacy.js",
  );
  assert.deepEqual(live.sources, ["src/domain/deputy-export-identity.js"]);
  assert.deepEqual(retired.sources, ["src/domain/deputy-exchange.js"]);
  const context = vm.createContext({
    EduAcademicYear: { normalize: (year) => year },
  });
  for (const name of live.sources)
    vm.runInContext(fs.readFileSync(path.join(root, name), "utf8"), context);
  assert.equal(context.EduDeputyExchange, undefined);
  const identity = context.EduDeputyExportIdentity;
  const source = {
    version: 1,
    token: "token",
    sender: { code: "teacher", name: "Teacher" },
    schools: [],
  };
  const row = identity.row(source);
  assert.equal(row.key, "EduDeputy.teacherIdentity.v2");
  assert.equal(identity.fromRows([row]).sender.code, "TEACHER");
  assert.equal(identity.fromRows([]), null);
});
