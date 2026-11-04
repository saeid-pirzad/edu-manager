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

function feedbackFixture({ icons = true } = {}) {
  class Node extends EventTarget {
    constructor(tag) {
      super();
      this.tagName = tag.toUpperCase();
      this.childNodes = [];
      this.dataset = {};
      this.attributes = new Map();
      this._text = "";
      this._html = "";
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    append(...nodes) {
      for (const node of nodes) {
        if (node.parentElement) {
          const siblings = node.parentElement.childNodes;
          siblings.splice(siblings.indexOf(node), 1);
        }
        node.parentElement = this;
        this.childNodes.push(node);
      }
    }
    replaceChildren(...nodes) {
      for (const child of this.childNodes) child.parentElement = null;
      this.childNodes = [];
      this._text = this._html = "";
      this.append(...nodes);
    }
    set textContent(value) {
      this.replaceChildren();
      this._text = String(value);
    }
    get textContent() {
      return (
        this._text + this.childNodes.map((node) => node.textContent).join("")
      );
    }
    set innerHTML(value) {
      this.replaceChildren();
      this._html = String(value);
    }
    get innerHTML() {
      return this._html;
    }
  }
  let now = 0,
    id = 0;
  const timers = new Map(),
    copied = [],
    c = vm.createContext({
      document: { createElement: (tag) => new Node(tag) },
      window: { isSecureContext: true },
      navigator: {
        clipboard: { writeText: async (text) => copied.push(text) },
      },
      setTimeout: (callback, delay) => {
        timers.set(++id, { callback, due: now + delay });
        return id;
      },
      clearTimeout: (key) => timers.delete(key),
    });
  if (icons)
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/core/icons.js"), "utf8"),
      c,
    );
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/ui/clipboard.js"),
      "utf8",
    ),
    c,
  );
  const button = new Node("button"),
    icon = new Node("span"),
    label = new Node("span");
  icon.className = "control-icon";
  icon.innerHTML = '<svg aria-hidden="true"><path/></svg>';
  label.className = "ui-button-label";
  label.textContent = "کپی برای معاون";
  button.append(icon, label);
  return {
    c,
    button,
    icon,
    label,
    copied,
    copy: async (text = "متن گزارش", target = button) => {
      c.copyToClipboard(text, target);
      await new Promise((resolve) => setImmediate(resolve));
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      for (;;) {
        const next = [...timers]
          .filter(([, timer]) => timer.due <= end)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = end;
    },
  };
}

test("successful copy restores the exact original icon/label nodes and their listeners after feedback", async () => {
  const f = feedbackFixture(),
    original = [...f.button.childNodes];
  let labelClicks = 0,
    buttonClicks = 0;
  f.label.addEventListener("click", () => labelClicks++);
  f.button.addEventListener("click", () => buttonClicks++);
  await f.copy();
  assert.deepEqual(f.copied, ["متن گزارش"]);
  assert.equal(f.button.dataset.copyState, "done");
  assert.equal(f.button.textContent, "کپی شد");
  assert.doesNotMatch(f.button.textContent, /✅/u);
  assert.match(f.button.childNodes[0].childNodes[0].innerHTML, /<svg\b/);
  f.advance(2000);
  assert.deepEqual(f.button.childNodes, original);
  assert.equal(f.button.childNodes[0], f.icon);
  assert.equal(f.button.childNodes[1], f.label);
  assert.equal(f.button.textContent, "کپی برای معاون");
  assert.equal(f.button.dataset.copyState, undefined);
  f.label.dispatchEvent(new Event("click"));
  f.button.dispatchEvent(new Event("click"));
  assert.equal(labelClicks, 1);
  assert.equal(buttonClicks, 1);
});

test("a repeated successful copy extends feedback without an earlier timer restoring stale markup", async () => {
  const f = feedbackFixture(),
    original = [...f.button.childNodes];
  await f.copy("گزارش اول");
  f.advance(1100);
  await f.copy("گزارش دوم");
  f.advance(900);
  assert.equal(f.button.dataset.copyState, "done");
  assert.equal(f.button.textContent, "کپی شد");
  assert.ok(!f.button.childNodes.includes(f.label));
  f.advance(1099);
  assert.equal(f.button.dataset.copyState, "done");
  f.advance(1);
  assert.deepEqual(f.button.childNodes, original);
  assert.equal(f.button.textContent, "کپی برای معاون");
  assert.equal(f.button.dataset.copyState, undefined);
  assert.deepEqual(f.copied, ["گزارش اول", "گزارش دوم"]);
});

test("copy feedback remains text-only without the icon library and independently restores each button", async () => {
  const f = feedbackFixture({ icons: false }),
    second = f.c.document.createElement("button"),
    secondLabel = f.c.document.createElement("span");
  secondLabel.textContent = "دریافت متن";
  second.append(secondLabel);
  await f.copy();
  f.advance(1000);
  await f.copy("متن دوم", second);
  assert.equal(second.dataset.copyState, "done");
  assert.equal(second.textContent, "کپی شد");
  assert.equal(
    second.childNodes[0].childNodes.length,
    1,
    "plain feedback contains only its readable label",
  );
  f.advance(1000);
  assert.equal(f.button.textContent, "کپی برای معاون");
  assert.equal(f.button.dataset.copyState, undefined);
  assert.equal(second.dataset.copyState, "done");
  f.advance(1000);
  assert.equal(second.childNodes[0], secondLabel);
  assert.equal(second.dataset.copyState, undefined);
});
