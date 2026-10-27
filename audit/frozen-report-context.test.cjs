"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function fixture() {
  const modals = [],
    validations = [];
  const report = {
    id: "report",
    workspace: "first",
    year: "1405-1406",
    term: "اول",
    at: "2026-10-27",
    classes: [],
  };
  const c = vm.createContext({
    workspace: { id: "first" },
    connection: {},
    state: {},
    readable: true,
    assertWorkspaceReadable() {
      if (!c.readable) throw Error("unavailable");
    },
    readRecord: async () => report,
    showModal: (...args) => modals.push(args),
    esc: String,
  });
  for (const file of ["core/async-target.js", "reports/student.js"])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src/workspace", file), "utf8"),
      c,
    );
  c.validateFrozenReport = (value) => validations.push(value);
  return { c, report, modals, validations };
}
for (const kind of ["workspace", "connection", "readability"]) {
  test(`frozen report is not displayed after ${kind} changes during its read`, async () => {
    const f = fixture();
    f.c.readRecord = async () => {
      if (kind === "workspace") f.c.workspace.id = "second";
      else if (kind === "connection") f.c.connection = {};
      else f.c.readable = false;
      return f.report;
    };
    await assert.rejects(f.c.showFrozenReport("report"));
    assert.equal(f.modals.length + f.validations.length, 0);
  });
}
test("another period's frozen report cannot be opened by directly passing its id", async () => {
  const f = fixture();
  f.report.workspace = "other";
  await assert.rejects(f.c.showFrozenReport("report"), /متعلق/);
  assert.equal(f.modals.length + f.validations.length, 0);
});
test("missing frozen report produces a clear error without opening a modal", async () => {
  const f = fixture();
  f.c.readRecord = async () => null;
  await assert.rejects(f.c.showFrozenReport("missing"), /موجود نیست/);
  assert.equal(f.modals.length, 0);
});
test("valid historical report preserves its frozen period labels", async () => {
  const f = fixture();
  f.report.year = "1404-1405";
  f.report.term = "عنوان تاریخی";
  await f.c.showFrozenReport("report");
  assert.equal(f.validations.length, 1);
  assert.ok(f.modals[0][1].includes("1404-1405 / عنوان تاریخی"));
});
test("malformed frozen report is rejected before rendering", async () => {
  const f = fixture();
  f.c.validateFrozenReport = () => {
    throw Error("invalid report");
  };
  await assert.rejects(f.c.showFrozenReport("report"), /invalid report/);
  assert.equal(f.modals.length, 0);
});
