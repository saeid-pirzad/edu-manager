"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const read = (name) =>
  fs.readFileSync(
    path.join(__dirname, "../src/workspace/reports", name),
    "utf8",
  );
function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}
function fixture({ paused = false } = {}) {
  const entered = deferred(),
    gate = deferred(),
    prepared = [],
    printed = [],
    validations = [],
    errors = [],
    report = { isConnected: true },
    output = { contains: (node) => node === report && report.isConnected },
    context = {
      id: "first",
      revision: 4,
      karnamehYear: "1405-1406",
      members: [
        { id: "first", revision: 4 },
        { id: "second", revision: 7 },
      ],
    };
  let currentOutput = output;
  const button = {
    isConnected: true,
    closest: (selector) =>
      selector === ".karnameh-year-document" ? report : null,
  };
  const c = vm.createContext({
    fileMode: false,
    __EDU_PRINT_TEST__: false,
    workspace: { id: "first", revision: 4, year: "1405-1406" },
    state: { view: "reports", reportTab: "karnameh" },
    karnamehFilter: { schoolId: "school", classId: "class", studentId: "" },
    document: {
      getElementById: (id) =>
        id === "karnamehTabOutput" ? currentOutput : null,
    },
    captureWorkspaceContext: () => ({ id: "first", revision: 4 }),
    flushDrafts: async (options) => {
      assert.equal(options.strict, true);
      entered.resolve();
      if (paused) await gate.promise;
    },
    writer: Promise.resolve(),
    assertReportSnapshot: async (value) => validations.push(value),
    handleError: (error) => errors.push(error),
    window: { print: () => printed.push(true) },
  });
  vm.runInContext(read("student.js"), c, { filename: "student.js" });
  vm.runInContext(read("printing.js"), c, { filename: "printing.js" });
  vm.runInContext("karnamehSnapshots", c).set(report, context);
  c.preparePrint = (source) => {
    prepared.push({ source, filter: { ...c.karnamehFilter } });
  };
  return {
    c,
    report,
    output,
    button,
    context,
    prepared,
    printed,
    validations,
    errors,
    entered: entered.promise,
    resume: gate.resolve,
    moveReportOutsideCurrentOutput: () => {
      currentOutput = { contains: () => false };
    },
  };
}

test("printing an unchanged Karnameh preserves its full annual durable context and selected scope", async () => {
  const f = fixture();
  assert.equal(await f.c.printCurrentKarnameh(f.button), true);
  assert.equal(f.validations.length, 1);
  assert.equal(f.validations[0], f.context);
  assert.equal(f.validations[0].members[1].revision, 7);
  assert.equal(f.prepared.length, 1);
  assert.equal(f.prepared[0].source, f.button);
  assert.equal(f.printed.length, 1);
  assert.equal(f.errors.length, 0);
});

for (const [reason, change] of [
  ["school selection", (f) => (f.c.karnamehFilter.schoolId = "other-school")],
  ["class selection", (f) => (f.c.karnamehFilter.classId = "other-class")],
  [
    "one-pupil parent selection",
    (f) => (f.c.karnamehFilter.studentId = "one-pupil"),
  ],
  ["button detached", (f) => (f.button.isConnected = false)],
  ["report detached", (f) => (f.report.isConnected = false)],
  [
    "report replaced in the current output",
    (f) => f.moveReportOutsideCurrentOutput(),
  ],
  ["another report tab", (f) => (f.c.state.reportTab = "daily")],
  ["navigation away from reports", (f) => (f.c.state.view = "schools")],
])
  test(
    "a queued class-wide print cannot continue after " +
      reason +
      " changes during validation",
    async () => {
      const f = fixture({ paused: true }),
        operation = f.c.printCurrentKarnameh(f.button);
      await f.entered;
      change(f);
      f.resume();
      await assert.rejects(operation);
      assert.equal(
        f.prepared.length,
        0,
        "wrong-scope HTML must never be cloned",
      );
      assert.equal(
        f.printed.length,
        0,
        "native print must never open for the stale selection",
      );
    },
  );

test("Karnameh printing rejects a changed annual member even when the local selected scope is unchanged", async () => {
  const f = fixture();
  f.c.assertReportSnapshot = async (value) => {
    assert.equal(value, f.context);
    throw Error("second term changed");
  };
  await assert.rejects(
    f.c.printCurrentKarnameh(f.button),
    /second term changed/,
  );
  assert.equal(f.prepared.length + f.printed.length, 0);
});

test("printing an individual pupil preserves only its already-selected report scope", async () => {
  const f = fixture();
  f.c.karnamehFilter.studentId = "selected-pupil";
  assert.equal(await f.c.printCurrentKarnameh(f.button), true);
  assert.equal(f.prepared.length, 1);
  assert.equal(f.prepared[0].filter.studentId, "selected-pupil");
  assert.equal(f.printed.length, 1);
});

test("unrelated print routes retain their existing printReport fallback", async () => {
  const f = fixture(),
    button = { isConnected: true, closest: () => null };
  assert.equal(await f.c.printCurrentKarnameh(button), true);
  assert.equal(f.prepared[0].source, button);
  assert.equal(f.printed.length, 1);
  assert.equal(f.validations[0].id, "first");
  assert.equal(f.validations[0].members, undefined);
});
