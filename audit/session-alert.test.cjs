"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
function fixture() {
  const messages = [],
    p = {},
    notice = {
      setAttribute() {},
      querySelector: () => p,
      focus() {},
      scrollIntoView() {},
    };
  const host = {
    isConnected: true,
    querySelector: () => null,
    append: (n) => messages.push(n),
  };
  const c = vm.createContext({ document: { createElement: () => notice } });
  const source = fs.readFileSync(
    path.join(__dirname, "../src/legacy/sessions/dialog.js"),
    "utf8",
  );
  vm.runInContext(
    source.slice(0, source.indexOf("function showSessionPanel")),
    c,
  );
  return { c, messages, p, host, control: { closest: () => host } };
}
test("session validation displays an accessible inline alert with literal error text", async () => {
  const f = fixture(),
    text = "<img src=x onerror=alert(1)>";
  assert.equal(
    await f.c.runSessionFormAction(f.control, async () => {
      throw Error(text);
    }),
    false,
  );
  assert.equal(f.messages.length, 1);
  assert.equal(f.p.textContent, text);
  assert.ok(!f.messages[0].innerHTML.includes(text));
});
test("late validation failure does not paint an alert in a detached session form", async () => {
  const f = fixture();
  f.host.isConnected = false;
  await f.c.runSessionFormAction(f.control, async () => {
    throw Error("Invalid");
  });
  assert.equal(f.messages.length, 0);
});
test("successful session action is returned without showing an alert", async () => {
  const f = fixture();
  assert.equal(
    await f.c.runSessionFormAction(f.control, async () => true),
    true,
  );
  assert.equal(f.messages.length, 0);
});
