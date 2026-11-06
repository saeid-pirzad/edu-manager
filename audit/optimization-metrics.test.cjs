"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const {
  initialReferences,
  countFunctions,
  measure,
} = require("../scripts/optimization-metrics.cjs");

test("initial inventory includes only unique static executable and stylesheet references", () => {
  assert.deepEqual(
    initialReferences(`
      <!-- <script src="./assets/scripts/comment.js"></script> -->
      <SCRIPT defer data-src="./assets/scripts/wrong.js" SRC='./assets/scripts/a.js?v=3#x'></SCRIPT>
      <script src=assets/scripts/a.js></script>
      <link title="a > b" href="./assets/styles/a.css?x=1&amp;y=2" rel="alternate stylesheet">
      <link rel="preload" href="./assets/scripts/preload.js" as="script">
      <link rel="icon" href="./assets/icon.png">
      <script src="https://example.org/external.js"></script>
      <script src="//example.org/external.js"></script>
      <script>const inline = 1;</script>
    `),
    ["assets/scripts/a.js", "assets/styles/a.css"],
  );
});

test("initial inventory rejects local traversal and wrong asset types", () => {
  for (const file of [
    "../secrets.js",
    "assets/../secret.js",
    "/assets/a.js",
    "assets/code.js.map",
    "assets/a.css",
  ])
    assert.throws(
      () => initialReferences(`<script src="${file}"></script>`),
      /Unsupported initial code reference/,
    );
});

test("function counts use the syntax tree rather than comment, string or regex matches", () => {
  assert.deepEqual(
    countFunctions(
      `
      /* eslint-disable no-control-regex */
      // function fake() {}
      const text = "function fake() {}", expression = /function fake/;
      function declared() {}
      const anonymous = function () {}, arrow = () => {};
      const obj = { method() {} };
    `,
      "fixture.js",
    ),
    { declarations: 1, expressions: 2, arrows: 1, total: 4 },
  );
  assert.throws(
    () => countFunctions("function (", "bad.js"),
    /Cannot measure JavaScript: bad\.js/,
  );
});

function fixture(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-optimization-metrics-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (file, content) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  const bundles = [
    { output: "assets/scripts/a.js", scope: "global", sources: ["src/a.js"] },
    { output: "assets/styles/a.css", scope: "css", sources: ["src/a.css"] },
    {
      output: "assets/scripts/unused.js",
      scope: "workspace",
      sources: ["src/unused.js"],
    },
  ];
  put("source-map.json", JSON.stringify({ version: 1, bundles }));
  put(
    "EduManager.html",
    '<script src="./assets/scripts/a.js"></script><link rel="stylesheet" href="./assets/styles/a.css">',
  );
  put("assets/scripts/a.js", "function a() {}\n");
  put("assets/styles/a.css", "a { color: red; }\n");
  put("assets/scripts/unused.js", "(() => {})();\n");
  return { root, put, bundles };
}

test("measurement is deterministic, totals independent gzip files and excludes unused output from initial bytes", (t) => {
  const { root, put } = fixture(t);
  const result = measure(root);
  assert.deepEqual(result, measure(root));
  assert.deepEqual(result.initial.javascript, {
    files: 1,
    rawBytes: Buffer.byteLength("function a() {}\n"),
    gzipBytes: zlib.gzipSync("function a() {}\n", { level: 9 }).length,
    functions: 1,
  });
  assert.equal(result.initial.stylesheets.files, 1);
  assert.deepEqual(result.sourceLayout, {
    bundles: 3,
    sourceFiles: 3,
    scopes: [
      { scope: "css", bundles: 1, sourceFiles: 1, functions: 0 },
      { scope: "global", bundles: 1, sourceFiles: 1, functions: 1 },
      { scope: "workspace", bundles: 1, sourceFiles: 1, functions: 1 },
    ],
  });
  put("assets/scripts/a.js", "function a() {}\r\n");
  put("assets/styles/a.css", "a { color: red; }\r\n");
  assert.deepEqual(
    measure(root),
    result,
    "LF and CRLF checkouts have the same payload metrics",
  );
});

test("measurement fails clearly on absent output instead of reporting partial success", (t) => {
  const { root } = fixture(t);
  fs.unlinkSync(path.join(root, "assets/scripts/unused.js"));
  assert.throws(() => measure(root), /ENOENT/);
});

test("source inventory rejects traversal and duplicate source ownership", (t) => {
  const { root, put, bundles } = fixture(t);
  for (const source of ["src/../secret.js", "src/a.js"]) {
    bundles[2].sources = [source];
    put("source-map.json", JSON.stringify({ version: 1, bundles }));
    assert.throws(() => measure(root), /Invalid or duplicate source/);
  }
  bundles[2].output = "assets/scripts/../secret.js";
  put("source-map.json", JSON.stringify({ version: 1, bundles }));
  assert.throws(() => measure(root), /Invalid source layout bundle/);
});
