"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const rich = [],
    plain = [],
    successes = [],
    fallback = [];
  const c = vm.createContext({
    Blob,
    ClipboardItem: class {
      constructor(data) {
        this.data = data;
      }
    },
    window: { isSecureContext: true },
    navigator: {
      clipboard: {
        write: async (items) => rich.push(items),
        writeText: async (text) => plain.push(text),
      },
    },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/ui/clipboard.js"),
      "utf8",
    ),
    c,
  );
  c.showSuccessCopy = () => successes.push(true);
  c.fallbackCopyTextToClipboard = (text) => fallback.push(text);
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { c, rich, plain, successes, fallback, settle };
}
test("rich clipboard contains unchanged plain text and formatted HTML", async () => {
  const f = fixture();
  f.c.copyToClipboard("حاضر", null, "<strong>حاضر</strong>");
  await f.settle();
  assert.equal(await f.rich[0][0].data["text/plain"].text(), "حاضر");
  assert.equal(
    await f.rich[0][0].data["text/html"].text(),
    "<strong>حاضر</strong>",
  );
  assert.equal(f.successes.length, 1);
});
test("rejected rich copy falls back to plain text", async () => {
  const f = fixture();
  f.c.navigator.clipboard.write = async () => {
    throw Error("unsupported");
  };
  f.c.copyToClipboard("plain", null, "<b>plain</b>");
  await f.settle();
  assert.deepEqual(f.plain, ["plain"]);
  assert.equal(f.successes.length, 1);
});
test("browsers without rich clipboard retain existing text copying", async () => {
  const f = fixture();
  f.c.ClipboardItem = undefined;
  f.c.copyToClipboard("plain", null, "<b>plain</b>");
  await f.settle();
  assert.deepEqual(f.plain, ["plain"]);
});
test("failure of both clipboard formats keeps the manual-copy fallback", async () => {
  const f = fixture();
  f.c.navigator.clipboard.write = f.c.navigator.clipboard.writeText =
    async () => {
      throw Error("denied");
    };
  f.c.copyToClipboard("plain", null, "<b>plain</b>");
  await f.settle();
  assert.deepEqual(f.fallback, ["plain"]);
});
