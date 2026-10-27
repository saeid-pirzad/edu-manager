"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const element = { dataset: {}, textContent: "", hidden: false };
  const context = vm.createContext({
    document: { getElementById: () => element },
    busy: 0,
    status: { message: "اطلاعات ذخیره‌شده خوانده شد.", type: "saved" },
    syncControlLocks() {},
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/ui/save-status.js"),
      "utf8",
    ),
    context,
  );
  return { context, element };
}
test("routine loaded and saved messages do not occupy the workspace header", () => {
  const { context, element } = fixture();
  context.paintStatus();
  assert.equal(element.hidden, true);
  context.setStatus("ذخیره شد.", "saved");
  assert.equal(element.hidden, true);
});
test("pending writes, recovered drafts and errors remain visible", () => {
  const { context, element } = fixture();
  context.busy = 1;
  context.paintStatus();
  assert.equal(element.hidden, false);
  assert.equal(element.dataset.state, "pending");
  context.busy = 0;
  context.setStatus("ذخیره نشد", "error");
  assert.equal(element.hidden, false);
  assert.equal(element.textContent, "ذخیره نشد");
  context.setStatus("پیش‌نویس بازیابی شد", "pending");
  assert.equal(element.hidden, false);
});
