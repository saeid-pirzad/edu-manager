"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture(kind = "session") {
  const alerts = [],
    formErrors = [];
  const notice = {
    dataset: {},
    textContent: "",
    hidden: true,
    classList: { add() {} },
    setAttribute() {},
  };
  const header = { dataset: {}, textContent: "", hidden: true };
  const dateTools = { open: false };
  const host = {
    dataset: { sessionId: "session-a" },
    querySelector: (selector) =>
      selector === "[data-modal-save-feedback]" ? notice : null,
  };
  const grade = {
    dataset: { class: "class-a", lesson: "lesson-a" },
    closest: () => host,
  };
  const body = {
    querySelector: (selector) =>
      selector === ".session-workspace"
        ? kind === "session"
          ? host
          : null
        : selector === "[data-grade]" && kind === "grades"
          ? grade
          : null,
  };
  const modal = {
    classList: { contains: () => kind === "page" },
    querySelector: () => (kind === "session" ? dateTools : null),
  };
  const c = vm.createContext({
    installationToken: "installation-a",
    workspace: { id: "workspace-a" },
    busy: 0,
    status: { message: "", type: "saved" },
    document: {
      querySelector: (selector) =>
        selector === "#modal:not(.hidden) #modalBody" && kind !== "page"
          ? body
          : null,
      getElementById: (id) =>
        id === "saveStatus" ? header : id === "modal" ? modal : null,
    },
    syncControlLocks() {},
    showSessionFormError: (node, error) => {
      node.open = true;
      formErrors.push(error);
    },
    alert: (message) => alerts.push(message),
  });
  for (const file of ["ui/save-status.js", "backups/local.js"])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/workspace", file), "utf8"),
      c,
    );
  return { c, alerts, formErrors, notice, dateTools };
}
for (const kind of ["session", "grades"]) {
  test(
    kind +
      " validation errors stay inside the current editor without opening date tools or browser alerts",
    () => {
      const f = fixture(kind);
      f.c.handleError(Error("Invalid entered value"));
      assert.equal(f.notice.hidden, false);
      assert.equal(f.notice.dataset.state, "error");
      assert.equal(f.notice.textContent, "Invalid entered value");
      assert.equal(f.c.status.feedbackScope, f.c.captureSaveFeedback());
      assert.equal(f.dateTools.open, false);
      assert.deepEqual(f.alerts, []);
      assert.deepEqual(f.formErrors, []);
      f.c.handleError(Error("Different correction required"));
      assert.equal(f.notice.textContent, "Different correction required");
    },
  );
}
test("a rejected asynchronous session save retains the persistence explanation in its original inline feedback", async () => {
  const f = fixture();
  Object.assign(f.c, {
    connection: {},
    db: { settings: {}, sessions: [] },
    periodLoading: false,
    resetBusy: false,
    connectionRetired: false,
    fileMode: false,
    writeFailureGeneration: 0,
    writer: Promise.resolve(),
    checkScope() {},
    refreshAcademicYearWarnings() {},
    collectRecords: (value) => value,
    readWorkspace: async () => ({ data: { settings: {}, sessions: [] } }),
    render() {},
    scheduleSingleFile() {},
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/data/save.js"),
      "utf8",
    ),
    f.c,
  );
  f.c.commitRecords = async () => {
    throw Error("Disk full");
  };
  await f.c
    .saveDBV24({ sessionId: "session-a" })
    .catch((error) => f.c.handleError(error));
  assert.equal(f.c.busy, 0);
  assert.equal(f.notice.dataset.state, "error");
  assert.equal(f.notice.textContent, "تغییر ذخیره نشد: Disk full");
  assert.equal(f.c.status.feedbackScope, f.c.captureSaveFeedback());
  assert.equal(f.dateTools.open, false);
  assert.deepEqual(f.alerts, []);
  assert.deepEqual(f.formErrors, []);
});
test("grade draft preservation context survives the generic rejection handler", () => {
  const f = fixture("grades"),
    scope = f.c.captureSaveFeedback();
  f.c.setStatus(
    "Grades were not saved; drafts remain available. Disk full",
    "error",
    scope,
  );
  f.c.handleError(Error("Disk full"));
  assert.equal(
    f.notice.textContent,
    "Grades were not saved; drafts remain available. Disk full",
  );
  assert.equal(f.c.status.feedbackScope, scope);
  assert.deepEqual(f.alerts, []);
});
for (const kind of ["report", "page"]) {
  test(
    kind +
      " failures preserve the generic error route without creating editor status",
    () => {
      const f = fixture(kind);
      f.c.handleError(Error("Backup operation failed"));
      assert.equal(f.c.status.feedbackScope, null);
      assert.deepEqual(f.alerts, ["Backup operation failed"]);
      assert.deepEqual(f.formErrors, []);
      assert.equal(f.notice.hidden, true);
    },
  );
}
test("generic operationError fields continue to show errors without a browser alert", () => {
  const f = fixture("report"),
    errorField = {};
  const old = f.c.document.getElementById;
  f.c.document.getElementById = (id) =>
    id === "operationError" ? errorField : old(id);
  f.c.handleError(Error("Import validation failed"));
  assert.equal(errorField.textContent, "Import validation failed");
  assert.deepEqual(f.alerts, []);
});
