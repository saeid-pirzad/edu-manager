"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");

function fixture({ pending = true, assessment = false } = {}) {
  let keydown,
    resolve,
    reject,
    closes = 0,
    hidden = false;
  const errors = [],
    body = { firstChild: {} },
    overlay = { classList: { contains: () => hidden } },
    elements = new Map([
      ["modal", overlay],
      ["modalBody", body],
    ]),
    completion = new Promise((success, failure) => {
      resolve = success;
      reject = failure;
    });
  const c = vm.createContext({
    window: { addEventListener() {} },
    document: {
      addEventListener(name, handler) {
        if (name === "keydown") keydown = handler;
      },
      getElementById: (id) => elements.get(id),
    },
    installWorkspaceActions() {},
    installGradeEvents() {},
    installAttendanceReminderClock() {},
    beforeReportPrint() {},
    channel: null,
    drafts: new Map(pending && !assessment ? [["pending", {}]] : []),
    assessmentContext: { hasDrafts: () => pending && assessment },
    flushDrafts: () => completion,
    closeModal() {
      closes++;
      hidden = true;
    },
    handleError: (error) => errors.push(error),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/ui/install.js"),
      "utf8",
    ),
    c,
  );
  c.installUI();
  return {
    body,
    elements,
    errors,
    resolve,
    reject,
    escape: () => keydown({ key: "Escape", preventDefault() {} }),
    hide: () => {
      hidden = true;
    },
    closes: () => closes,
    settle: () => new Promise((done) => setImmediate(done)),
  };
}

for (const assessment of [false, true]) {
  test(`Escape closes its original modal after ${assessment ? "assessment" : "session"} drafts save`, async () => {
    const f = fixture({ assessment });
    f.escape();
    assert.equal(f.closes(), 0);
    f.resolve();
    await f.settle();
    assert.equal(f.closes(), 1);
  });
}
for (const [name, change] of [
  [
    "a replacement form",
    (f) => {
      f.body.firstChild = {};
    },
  ],
  [
    "a replacement body",
    (f) => {
      f.elements.set("modalBody", { firstChild: f.body.firstChild });
    },
  ],
  ["an already closed dialog", (f) => f.hide()],
]) {
  test(`a pending Escape cannot close ${name}`, async () => {
    const f = fixture();
    f.escape();
    change(f);
    f.resolve();
    await f.settle();
    assert.equal(f.closes(), 0);
  });
}
test("failed draft saving keeps the dialog open and reports the error", async () => {
  const f = fixture(),
    error = Error("Write failed");
  f.escape();
  f.reject(error);
  await f.settle();
  assert.equal(f.closes(), 0);
  assert.deepEqual(f.errors, [error]);
});
test("Escape without pending drafts closes immediately", () => {
  const f = fixture({ pending: false });
  f.escape();
  assert.equal(f.closes(), 1);
});
