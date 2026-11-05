"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { applicationFiles } = require("../scripts/application-files.cjs");
const { packageRelease } = require("../scripts/package-release.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "edu-release-package-"));
  // Only this generated fixture is ever removed, never a project directory.
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, text) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  write(
    "EduManager.html",
    '<link href="./assets/styles/app.css"><script src="./assets/scripts/app.js"></script>',
  );
  write("index.html", "redirect");
  write("app.webmanifest", "{}");
  write("service-worker.js", "offline worker");
  write("assets/styles/app.css", "body{}");
  write("assets/scripts/app.js", "app();\n//# sourceMappingURL=app.js.map\n");
  write("assets/scripts/app.js.map", '{"sourcesContent":["app();"]}');
  write("docs/School-doc/EduManager-data.json", '{"private":"backup"}');
  write("docs/School-doc/roster.csv", "private roster");
  write(".git/config", "private git metadata");
  write("src/private.js", "development source");
  return { root, write };
}
test("static release copies only application allowlist including offline dependencies, never backup/roster/git/docs", (t) => {
  const { root } = fixture(t);
  const result = packageRelease(root);
  assert.equal(result.output, path.join(root, "dist"));
  assert.deepEqual(
    result.files.sort(),
    [
      "EduManager.html",
      "index.html",
      "app.webmanifest",
      "service-worker.js",
      "assets/styles/app.css",
      "assets/scripts/app.js",
      "assets/scripts/app.js.map",
    ].sort(),
  );
  const walk = (dir, prefix = "") =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? walk(path.join(dir, entry.name), prefix + entry.name + "/")
          : [prefix + entry.name],
      );
  assert.deepEqual(walk(result.output).sort(), result.files);
  for (const name of result.files)
    assert.deepEqual(
      fs.readFileSync(path.join(result.output, name)),
      fs.readFileSync(path.join(root, name)),
    );
  for (const privateName of ["docs", ".git", "src"])
    assert.equal(fs.existsSync(path.join(result.output, privateName)), false);
  assert.equal(
    fs.existsSync(path.join(root, "docs/School-doc/EduManager-data.json")),
    true,
  );
});
test("unexpected existing dist files stop packaging before overwriting any asset or deleting any file", (t) => {
  const { root, write } = fixture(t);
  write("dist/index.html", "old version");
  write("dist/backup.json", "do not remove");
  assert.throws(() => packageRelease(root), /Unexpected file/);
  assert.equal(
    fs.readFileSync(path.join(root, "dist/index.html"), "utf8"),
    "old version",
  );
  assert.equal(
    fs.readFileSync(path.join(root, "dist/backup.json"), "utf8"),
    "do not remove",
  );
});
test("plain existing release output can be refreshed deterministically", (t) => {
  const { root, write } = fixture(t);
  const first = packageRelease(root);
  write(
    "assets/scripts/app.js",
    "updated();\n//# sourceMappingURL=app.js.map\n",
  );
  const second = packageRelease(root);
  assert.deepEqual(first.files, second.files);
  assert.match(
    fs.readFileSync(path.join(second.output, "assets/scripts/app.js"), "utf8"),
    /updated/,
  );
});

test("release copies referenced binary branding bytes without including unreferenced images or private data", (t) => {
  const { root, write } = fixture(t);
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255, 0]);
  write("assets/icons/install.png", bytes);
  write("assets/not-referenced.png", "not part of the application");
  write(
    "app.webmanifest",
    JSON.stringify({ icons: [{ src: "./assets/icons/install.png" }] }),
  );
  const result = packageRelease(root);
  assert.ok(result.files.includes("assets/icons/install.png"));
  assert.deepEqual(
    fs.readFileSync(path.join(result.output, "assets/icons/install.png")),
    bytes,
  );
  assert.equal(
    result.files.some((name) => name.includes("not-referenced")),
    false,
  );
  assert.equal(fs.existsSync(path.join(result.output, "docs")), false);
});
test("release rejects symbolic destination directories instead of copying outside dist", (t) => {
  const { root } = fixture(t);
  const outside = path.join(root, "not-release");
  fs.mkdirSync(outside);
  fs.symlinkSync(
    outside,
    path.join(root, "dist"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(() => packageRelease(root), /plain directory/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("release rejects a symbolic source asset directory and preserves its content", (t) => {
  const { root } = fixture(t);
  const original = path.join(root, "assets/styles");
  const relocated = path.join(root, "source-outside-assets");
  fs.renameSync(original, relocated);
  fs.symlinkSync(
    relocated,
    original,
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(() => packageRelease(root), /Symbolic source/);
  assert.equal(
    fs.readFileSync(path.join(relocated, "app.css"), "utf8"),
    "body{}",
  );
  assert.equal(fs.existsSync(path.join(root, "dist")), false);
});
test("release rejects a nested destination junction before writing any allowed file", (t) => {
  const { root, write } = fixture(t);
  write("dist/index.html", "old version");
  const outside = path.join(root, "outside-destination");
  fs.mkdirSync(outside);
  fs.symlinkSync(
    outside,
    path.join(root, "dist/assets"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(() => packageRelease(root), /Symbolic links/);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(
    fs.readFileSync(path.join(root, "dist/index.html"), "utf8"),
    "old version",
  );
});

test("a missing required source asset leaves the existing release unchanged", (t) => {
  const { root, write } = fixture(t);
  const previous = packageRelease(root);
  const snapshot = new Map(
    previous.files.map((name) => [
      name,
      fs.readFileSync(path.join(previous.output, name)),
    ]),
  );
  write("index.html", "new entry must not be copied after preflight fails");
  write(
    "assets/scripts/app.js",
    "newApp();\n//# sourceMappingURL=app.js.map\n",
  );
  fs.unlinkSync(path.join(root, "assets/scripts/app.js.map"));
  assert.throws(() => packageRelease(root), /ENOENT|Missing source map/);
  for (const [name, bytes] of snapshot)
    assert.deepEqual(
      fs.readFileSync(path.join(previous.output, name)),
      bytes,
      "preflight failure must preserve " + name,
    );
});

test("the complete packaged PWA keeps its existing project-root identity and every offline URL", (t) => {
  const { root, write } = fixture(t);
  const project = path.resolve(__dirname, "..");
  const expected = [...applicationFiles(project).keys()].sort();
  for (const name of expected)
    write(name, fs.readFileSync(path.join(project, name)));
  const packaged = packageRelease(root);
  assert.deepEqual(packaged.files.sort(), expected);
  const base = new URL("https://saeid-pirzad.github.io/edu-manager/");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(packaged.output, "app.webmanifest"), "utf8"),
  );
  assert.equal(
    new URL(manifest.id, base).href,
    base.href,
    "the installed application identity must not change to /dist/",
  );
  const entry = new URL(manifest.start_url, base);
  assert.equal(entry.href, new URL("EduManager.html", base).href);
  assert.ok(entry.href.startsWith(new URL(manifest.scope, base).href));
  assert.match(
    fs.readFileSync(path.join(packaged.output, "index.html"), "utf8"),
    /url=\.\/EduManager\.html/,
  );
  const workerUrl = new URL("service-worker.js", base);
  const worker = fs.readFileSync(
    path.join(packaged.output, "service-worker.js"),
    "utf8",
  );
  const baseExpression = worker.match(/const BASE = ([^;]+);/);
  assert.ok(baseExpression, "the worker must resolve its own hosting base");
  const workerBase = vm.runInNewContext(baseExpression[1], {
    URL,
    self: { location: { href: workerUrl.href } },
  });
  assert.equal(workerBase.href, base.href);
  const cacheDeclaration = worker.match(/const FILES\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(cacheDeclaration);
  const cached = Array.from(vm.runInNewContext(cacheDeclaration[1]));
  for (const name of cached) {
    assert.ok(
      packaged.files.includes(name),
      "offline dependency must exist in the artifact: " + name,
    );
    const url = new URL(name, workerBase);
    assert.equal(url.origin, base.origin);
    assert.ok(
      url.pathname.startsWith(base.pathname),
      "an offline URL must stay inside the current project path",
    );
    assert.equal(url.pathname.includes("/dist/"), false);
  }
  for (const directory of ["docs", "src", ".git", "audit", "scripts"])
    assert.equal(fs.existsSync(path.join(packaged.output, directory)), false);
});
