"use strict";

const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  {
    inspectService,
    checkArchitecture,
  } = require("../scripts/architecture-boundaries.cjs");

const inspect = (source) => inspectService(source, "EduExample");
const direct = (body) => `globalThis.EduExample = function (api) { ${body} };`;
const wrapped = (body) =>
  `(function (root) { root.EduExample = function (api) { ${body} }; })(globalThis);`;

test("service factories keep state per instance and accept explicit dependencies", () => {
  assert.deepEqual(
    inspect(
      direct(
        "let pending = null; return Object.freeze({ read: () => api.read(pending) });",
      ),
    ),
    [],
  );
  assert.deepEqual(
    inspect(
      wrapped(
        "const values = new Map(); return { read: () => api.read(values) };",
      ),
    ),
    [],
  );
});

test("service boundaries reject ambient application state even when combined application lint would resolve it", () => {
  for (const source of [
    direct("return db.settings;"),
    direct("workspace = api.read();"),
    wrapped("return installationToken;"),
    direct("return EduPolicy.lesson(api.lesson); "),
  ]) {
    assert.ok(
      inspect(source).some((item) => /Inject application/.test(item.message)),
      source,
    );
  }
});

test("pure services cannot acquire the DOM, browser storage or timers", () => {
  for (const name of [
    "window",
    "document",
    "localStorage",
    "indexedDB",
    "setTimeout",
    "navigator",
  ])
    assert.ok(inspect(direct(`return ${name};`)).length > 0, name);
});

test("export roots cannot hide shared state behind properties or computed access", () => {
  for (const body of [
    "return root.db;",
    "return root['db'];",
    "root.workspace = {};",
    "return root[api.name];",
  ])
    assert.ok(
      inspect(wrapped(body)).some((item) =>
        /global root may only publish/.test(item.message),
      ),
      body,
    );
  assert.ok(inspect(direct("return globalThis.document;")).length > 0);
});

test("global roots cannot escape into a local alias, dependency callback or destructuring", () => {
  for (const body of [
    "const alias = root; return alias.db;",
    "return api.read(root);",
    "const { db } = root; return db;",
  ])
    assert.ok(
      inspect(wrapped(body)).some((item) => /cannot escape/.test(item.message)),
      body,
    );
});

test("new services cannot introduce top-level shared state or additional public exports", () => {
  assert.ok(
    inspect("let shared; " + direct("return shared;")).some((item) =>
      /global scope/.test(item.message),
    ),
  );
  assert.ok(
    inspect(direct("return api;") + " globalThis.EduOther = {};").some((item) =>
      /global root may only publish/.test(item.message),
    ),
  );
});

test("an export wrapper cannot hide state shared by independent factory instances", () => {
  for (const declaration of [
    "let shared = 0;",
    "const shared = new Map();",
    "function shared() { return 1; }",
  ]) {
    const source = `(function (root) { ${declaration} root.EduExample = function (api) { return shared; }; })(globalThis);`;
    assert.ok(
      inspect(source).some((item) => /shared outer scope/.test(item.message)),
      declaration,
    );
  }
});

test("boundary checks require exactly one callable dependency factory", () => {
  for (const source of [
    "globalThis.EduExample = {};",
    "globalThis.EduExample = function () {};",
    direct("return api;") + direct("return api;"),
    "(function () {})();",
  ])
    assert.ok(inspect(source).length > 0, source);
});

test("dynamic functions and invalid JavaScript cannot bypass dependency checks", () => {
  assert.ok(
    inspect(direct("return eval(api.code);")).some(
      (item) => item.ruleId === "no-eval",
    ),
  );
  assert.ok(
    inspect(direct("return new Function(api.code);")).some(
      (item) => item.ruleId === "no-new-func",
    ),
  );
  assert.ok(
    inspect("globalThis.EduExample = function (").some((item) => item.fatal),
  );
});

test("all real services retain isolated boundaries and load before their adapters", () => {
  assert.deepEqual(checkArchitecture(path.resolve(__dirname, "..")), []);
});
