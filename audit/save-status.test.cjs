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

function modalFixture() {
  const f = fixture();
  let active = null;
  let created = 0;
  const element = () => ({
    dataset: {},
    hidden: true,
    textContent: "",
    classList: { add() {} },
    setAttribute(name, value) {
      this[name] = value;
    },
  });
  f.context.installationToken = "installation-a";
  f.context.workspace = { id: "workspace-a" };
  f.context.document.createElement = () => {
    created++;
    return element();
  };
  f.context.document.querySelector = () =>
    active
      ? {
          querySelector(selector) {
            if (selector === ".session-workspace")
              return active.kind === "session" ? active.host : null;
            if (selector === "[data-grade]") return active.input || null;
            return null;
          },
        }
      : null;
  function open(kind, id, stage = "") {
    const notice = element();
    const host = {
      dataset: { sessionId: id },
      querySelector: (selector) =>
        selector === "[data-modal-save-feedback]" ? notice : null,
      prepend() {},
    };
    active = { kind, host, notice };
    if (kind === "grades")
      active.input = {
        dataset: { class: "class-a", lesson: id, assessmentContext: stage },
        closest: () => host,
      };
    if (kind === "report") active.input = null;
    return notice;
  }
  return {
    ...f,
    open,
    close: () => {
      active = null;
    },
    created: () => created,
  };
}
test("session modal shows its pending, successful and failed writes while the saved header stays compact", () => {
  const f = modalFixture(),
    notice = f.open("session", "session-a");
  const scope = f.context.captureSaveFeedback();
  f.context.busy = 1;
  f.context.paintStatus(scope);
  assert.equal(notice.hidden, false);
  assert.equal(notice.dataset.state, "pending");
  f.context.setStatus("saved-session-a", "saved", scope);
  f.context.busy = 0;
  f.context.paintStatus();
  assert.equal(notice.textContent, "saved-session-a");
  assert.equal(notice.dataset.state, "saved");
  assert.equal(f.element.hidden, true);
  f.context.setStatus("failed-session-a", "error", scope);
  assert.equal(notice.textContent, "failed-session-a");
  assert.equal(notice.dataset.state, "error");
});
test("late session save feedback cannot appear in a different session or installation", () => {
  const f = modalFixture();
  f.open("session", "session-a");
  const scope = f.context.captureSaveFeedback();
  f.context.busy = 1;
  f.context.paintStatus(scope);
  const other = f.open("session", "session-b");
  f.context.setStatus("saved-a", "saved", scope);
  assert.equal(other.hidden, true);
  f.context.busy = 0;
  const same = f.open("session", "session-a");
  f.context.installationToken = "installation-b";
  f.context.paintStatus();
  assert.equal(same.hidden, true);
});
test("grade feedback is bound to the exact assessment stage and survives same-editor rendering", () => {
  const f = modalFixture();
  f.open("grades", "lesson-a", "midterm-token");
  const scope = f.context.captureSaveFeedback();
  f.context.setStatus("saved-midterm", "saved", scope);
  const replacement = f.open("grades", "lesson-a", "midterm-token");
  f.context.paintStatus();
  assert.equal(replacement.textContent, "saved-midterm");
  assert.equal(replacement.hidden, false);
  const final = f.open("grades", "lesson-a", "final-token");
  f.context.paintStatus();
  assert.equal(final.hidden, true);
});
test("unrelated backup statuses and read-only report modals receive no editor feedback", () => {
  const f = modalFixture(),
    grades = f.open("grades", "lesson-a");
  f.context.setStatus("backup delivered", "saved");
  assert.equal(grades.hidden, true);
  f.open("report", "report");
  assert.equal(f.context.captureSaveFeedback(), null);
  f.context.paintStatus();
  assert.equal(f.created(), 0);
  f.close();
  assert.equal(f.context.captureSaveFeedback(), null);
});
