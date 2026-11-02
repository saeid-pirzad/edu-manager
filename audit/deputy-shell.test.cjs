"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { applicationFiles } = require("../scripts/application-files.cjs");
const root = path.resolve(__dirname, "..");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "edu-shell-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, "assets"));
  const write = (name, value) =>
    fs.writeFileSync(path.join(directory, name), value);
  for (const name of [
    "index.html",
    "app.webmanifest",
    "deputy.webmanifest",
    "service-worker.js",
  ])
    write(name, "");
  write("assets/shared.js", "// shared\n//# sourceMappingURL=shared.js.map");
  write("assets/shared.js.map", "{}");
  write("assets/deputy.js", "// deputy");
  write("EduManager.html", '<script src="./assets/shared.js"></script>');
  write(
    "Deputy.html",
    '<script src="./assets/shared.js"></script><script src="./assets/deputy.js"></script>',
  );
  return { directory, write };
}

test("both entries share one cache reference while deputy-only assets and maps remain included", (t) => {
  const { directory } = fixture(t);
  const files = applicationFiles(directory);
  assert.equal(files.size, 9);
  assert.equal(files.get("Deputy.html"), "text/html; charset=utf-8");
  assert.equal(files.get("deputy.webmanifest"), "application/manifest+json");
  for (const name of [
    "assets/shared.js",
    "assets/shared.js.map",
    "assets/deputy.js",
  ])
    assert.ok(files.has(name));
});

test("asset duplication within a deputy entry remains a build error", (t) => {
  const { directory, write } = fixture(t);
  write("Deputy.html", '<script src="./assets/shared.js"></script>'.repeat(2));
  assert.throws(() => applicationFiles(directory), /Duplicate.*Deputy\.html/);
});

test("missing deputy dependencies cannot produce an apparently valid release", (t) => {
  const { directory, write } = fixture(t);
  write("Deputy.html", '<script src="./assets/missing.js"></script>');
  assert.throws(() => applicationFiles(directory), /ENOENT|Missing/);
});

test("deputy references cannot traverse outside the deployment root", (t) => {
  const { directory, write } = fixture(t);
  write("Deputy.html", '<script src="./assets/../../private.js"></script>');
  assert.throws(() => applicationFiles(directory), /Unsafe application asset/);
});

test("deputy shell has an independent install identity and no teacher state scripts", () => {
  const html = fs.readFileSync(path.join(root, "Deputy.html"), "utf8");
  const teacherManifest = JSON.parse(
    fs.readFileSync(path.join(root, "app.webmanifest"), "utf8"),
  );
  const deputyManifest = JSON.parse(
    fs.readFileSync(path.join(root, "deputy.webmanifest"), "utf8"),
  );
  assert.equal(deputyManifest.start_url, "./Deputy.html");
  assert.notEqual(deputyManifest.id, teacherManifest.id);
  assert.equal(deputyManifest.theme_color, teacherManifest.theme_color);
  assert.equal(
    deputyManifest.background_color,
    teacherManifest.background_color,
  );
  assert.match(
    html,
    new RegExp(
      'name="theme-color" content="' + deputyManifest.theme_color + '"',
    ),
  );
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(
    html,
    /assets\/scripts\/(?:workspace-runtime|storage|app)\.js/,
  );
  assert.match(html, /\.\/deputy\.webmanifest/);
  for (const match of html.matchAll(/<script\b[^>]*src="([^"]+)"/g))
    assert.ok(match[1].startsWith("./assets/"));
});

test("teacher and deputy load exactly one shared icon bundle without importing teacher event infrastructure", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "source-map.json"), "utf8"),
  );
  const iconBundles = manifest.bundles.filter((bundle) =>
    bundle.sources.includes("src/core/icons.js"),
  );
  assert.equal(iconBundles.length, 1);
  assert.equal(iconBundles[0].output, "assets/scripts/icons.js");
  for (const entry of ["EduManager.html", "Deputy.html"]) {
    const html = fs.readFileSync(path.join(root, entry), "utf8");
    assert.equal(
      [...html.matchAll(/src="\.\/assets\/scripts\/icons\.js"/g)].length,
      1,
    );
  }
  const deputy = fs.readFileSync(path.join(root, "Deputy.html"), "utf8");
  assert.ok(
    deputy.indexOf("scripts/icons.js") < deputy.indexOf("scripts/deputy.js"),
  );
  assert.doesNotMatch(deputy, /scripts\/runtime-api\.js/);
});

test("teacher navigation and exchange form have no route to the deputy application", () => {
  const source = fs.readFileSync(
    path.join(root, "src/legacy/ui/header-menus.js"),
    "utf8",
  );
  const state = { view: "schools" },
    context = { state };
  vm.runInNewContext(
    source.slice(0, source.indexOf("function setHeaderMenu")),
    context,
  );
  const html = context.headerHtml();
  assert.doesNotMatch(html, /Deputy\.html|کارتابل معاون/);
  const exporter = fs.readFileSync(
    path.join(root, "src/workspace/reports/deputy-export.js"),
    "utf8",
  );
  assert.doesNotMatch(exporter, /href=["'](?:\.\/)?Deputy\.html/);
  assert.deepEqual(state, { view: "schools" });
});

test("two install identities are preserved while their navigation scopes no longer overlap", () => {
  const teacher = JSON.parse(
    fs.readFileSync(path.join(root, "app.webmanifest"), "utf8"),
  );
  const deputy = JSON.parse(
    fs.readFileSync(path.join(root, "deputy.webmanifest"), "utf8"),
  );
  assert.equal(teacher.id, "./");
  assert.equal(deputy.id, "./deputy");
  const base = "https://example.test/edu-manager/";
  for (const [own, other] of [
    [teacher, deputy],
    [deputy, teacher],
  ]) {
    const scope = new URL(own.scope, base).pathname;
    assert.ok(new URL(own.start_url, base).pathname.startsWith(scope));
    assert.equal(
      new URL(other.start_url, base).pathname.startsWith(scope),
      false,
    );
    assert.ok(
      new URL(own.start_url + "?installed=1", base).pathname.startsWith(scope),
    );
  }
});

function workerHarness() {
  const handlers = {},
    matches = [],
    network = [],
    base = "https://example.test/edu-manager/";
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "service-worker.js"), "utf8"),
    {
      URL,
      self: {
        location: { href: base + "service-worker.js" },
        registration: { scope: base },
        addEventListener(name, callback) {
          handlers[name] = callback;
        },
      },
      caches: {
        async open() {
          return {
            async match(key) {
              const value = typeof key === "string" ? key : key.url;
              matches.push(value);
              return { cached: value };
            },
          };
        },
      },
      async fetch(request) {
        network.push(request.url);
        throw Error("offline");
      },
    },
  );
  async function navigate(relative, mode = "navigate", method = "GET") {
    let response;
    handlers.fetch({
      request: { url: new URL(relative, base).href, mode, method },
      respondWith(value) {
        response = value;
      },
    });
    return await response;
  }
  return { base, matches, network, navigate };
}

test("offline deputy navigation with a query never falls back to the teacher shell", async () => {
  const worker = workerHarness();
  for (const url of ["Deputy.html", "Deputy.html?installed=1#receive"]) {
    const response = await worker.navigate(url);
    assert.equal(response.cached, worker.base + "Deputy.html");
  }
  assert.equal(worker.network.length, 0);
});

test("offline teacher and index navigation still use the original teacher shell", async () => {
  const worker = workerHarness();
  for (const url of [
    "",
    "index.html?installed=1",
    "EduManager.html?installed=1",
  ])
    assert.equal(
      (await worker.navigate(url)).cached,
      worker.base + "EduManager.html",
    );
});

test("worker does not claim foreign URLs, writes, or unrelated pages as deputy navigation", async () => {
  const worker = workerHarness();
  for (const url of ["https://foreign.test/Deputy.html", "missing.html"])
    assert.equal(await worker.navigate(url), undefined);
  assert.equal(
    await worker.navigate("Deputy.html", "navigate", "POST"),
    undefined,
  );
});
