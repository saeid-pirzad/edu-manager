"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const root = path.resolve(__dirname, "..");
function fixture() {
  const listeners = new Map(),
    errors = [];
  const context = vm.createContext({
    document: {
      getElementById: (id) => ({
        addEventListener: (type, handler) =>
          listeners.set(id + ":" + type, handler),
      }),
    },
    EduV24: { course: { error: (error) => errors.push(error.message) } },
    console,
  });
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/legacy/core/events.js"), "utf8"),
    context,
  );
  const registry = vm.runInContext("EduLegacyEvents", context);
  const element = (key, options = {}) => ({
    getAttribute: (name) => (name === "data-legacy-click" ? key : null),
    matches: () => !!options.disabled,
    closest: () => !!options.inert,
  });
  const click = (elements) => {
    const event = {
      cancelBubble: false,
      defaultPrevented: false,
      composedPath: () => elements,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.cancelBubble = true;
      },
    };
    listeners.get("app:click")(event);
    return event;
  };
  return { registry, element, click, errors };
}
test("legacy dispatch preserves this, target-to-parent order and cancellation semantics", () => {
  const f = fixture(),
    calls = [],
    child = f.element("child"),
    parent = f.element("parent");
  f.registry.register("child", function () {
    calls.push(this);
    return false;
  });
  f.registry.register("parent", () => calls.push("parent"));
  const event = f.click([child, parent]);
  assert.deepEqual(calls, [child]);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.cancelBubble, true);
  assert.throws(
    () => f.registry.register("child", () => {}),
    /Invalid legacy handler/,
  );
});
test("legacy dispatch ignores unknown, inert and disabled controls and reports asynchronous errors", async () => {
  const f = fixture();
  f.registry.register("reject", async () => {
    throw Error("test rejection");
  });
  f.click([
    f.element("constructor"),
    f.element("reject", { disabled: true }),
    f.element("reject", { inert: true }),
  ]);
  assert.deepEqual(f.errors, []);
  f.click([f.element("reject")]);
  await new Promise(setImmediate);
  assert.deepEqual(f.errors, ["test rejection"]);
});
test("application sources contain no executable inline event attributes", () => {
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith(".js"))
        assert.doesNotMatch(
          fs.readFileSync(file, "utf8"),
          /\son[a-z]+\s*=\s*\\?["']/i,
          file,
        );
    }
  };
  walk(path.join(root, "src"));
  const html = fs.readFileSync(path.join(root, "EduManager.html"), "utf8");
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
});
