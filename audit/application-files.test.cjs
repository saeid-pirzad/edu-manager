"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { applicationFiles } = require("../scripts/application-files.cjs");

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
