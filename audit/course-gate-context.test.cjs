"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/ui/course/copy-gate.js"),
  "utf8",
);
test("gate rejects malformed values before creating or flushing any grade state", async () => {
  let flushed = false;
  const context = vm.createContext({
    writable() {},
    api: {
      flushDrafts: async () => {
        flushed = true;
      },
    },
  });
  vm.runInContext(source, context);
  await assert.rejects(
    context.gate("lesson", "pod", "student", "invalid"),
    /وضعیت معیار نامعتبر/,
  );
  assert.equal(flushed, false);
});
test("gate cannot retarget a different workspace or class while awaiting drafts", async () => {
  for (const switched of ["workspace", "class"]) {
    let workspace = "one",
      classId = "class-one",
      lookedUp = false;
    const context = vm.createContext({
      writable() {},
      currentClass: () => {
        lookedUp = true;
      },
      api: {
        context: () => ({ id: workspace }),
        actionContext: () => ({}),
        state: () => ({ classId }),
        year: () => "1405-1406",
        flushDrafts: async () => {
          if (switched === "workspace") workspace = "two";
          else classId = "class-two";
        },
      },
    });
    vm.runInContext(source, context);
    await assert.rejects(
      context.gate("lesson", "pod", "student", "yes"),
      /ترم یا کلاس/,
    );
    assert.equal(lookedUp, false);
  }
});

test("gate rejects a replaced installation, connection or data before changing a grade", async () => {
  for (const changed of ["installation", "connection", "data"]) {
    const identity = {
      installation: "original",
      connection: {},
      data: {},
    };
    let lookedUp = false;
    const context = vm.createContext({
      writable() {},
      currentClass: () => {
        lookedUp = true;
      },
      api: {
        context: () => ({ id: "same-period" }),
        actionContext: () => ({ ...identity }),
        state: () => ({ view: "lesson", classId: "same-class" }),
        year: () => "1405-1406",
        flushDrafts: async () => {
          identity[changed] = changed === "installation" ? "restored" : {};
        },
      },
    });
    vm.runInContext(source, context);
    await assert.rejects(
      context.gate("lesson", "pod", "student", "yes"),
      /ترم یا کلاس/,
    );
    assert.equal(lookedUp, false, changed);
  }
});

test("a completed gate save cannot reopen a modal after leaving its table", async () => {
  const state = { view: "lesson", tab: "grades", classId: "class" },
    scores = { student: { m: 0, c: 2 } },
    pod = { id: "pod", podScores: scores },
    classroom = {
      id: "class",
      students: [{ id: "student" }],
      lessons: [
        { id: "lesson", gradingPolicy: { requireGate: true }, poudmans: [pod] },
      ],
    };
  let rendered = false,
    reopened = false,
    saved = false;
  const context = vm.createContext({
    writable() {},
    writableScoreRecord: (values, id) => values[id],
    currentClass: () => classroom,
    document: { querySelector: () => ({}) },
    table() {
      throw Error("stale table reopened");
    },
    api: {
      context: () => ({ id: "period" }),
      actionContext: () => ({}),
      state: () => state,
      year: () => "1405-1406",
      flushDrafts: async () => {},
      saveDB: async () => {
        saved = true;
        state.view = "schools";
      },
      render: () => {
        rendered = true;
      },
      showModal: () => {
        reopened = true;
      },
    },
  });
  vm.runInContext(source, context);
  await assert.rejects(
    context.gate("lesson", "pod", "student", "yes"),
    /ترم یا کلاس/,
  );
  assert.equal(saved, true);
  assert.equal(scores.student.gate, true);
  assert.equal(scores.student.m, 0);
  assert.equal(scores.student.c, 2);
  assert.equal(rendered, false);
  assert.equal(reopened, false);
});
