"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = (file) =>
  fs.readFileSync(path.join(__dirname, "../", file), "utf8");

function fixture({ actualForm = false, onFlush = () => {} } = {}) {
  const opened = [],
    state = {
      view: "class",
      tab: "lessons",
      schoolId: "school",
      classId: "class",
      lessonId: null,
    },
    period = { id: "first", revision: 1, closed: false, readOnly: false },
    identity = { installation: "original", connection: {}, data: {} },
    app = { firstElementChild: {} };
  let sequence = 0,
    flushes = 0,
    lookups = 0,
    shows = 0,
    year = "1405-1406";
  const context = vm.createContext({
    structuredClone,
    saving: false,
    document: {
      getElementById: (id) => (id === "app" ? app : null),
      querySelector: () => null,
    },
    writable: () => {
      if (period.readOnly || period.closed) throw Error("readonly");
    },
    api: {
      context: () => ({ ...period }),
      actionContext: () => ({ ...identity }),
      state: () => state,
      year: () => year,
      uid: () => "new-" + ++sequence,
      flushDrafts: async () => onFlush(++flushes),
      showCourseClass: () => {
        shows++;
      },
    },
    open: async (...args) => opened.push(args),
  });
  vm.runInContext(source("src/domain/grade-policy.js"), context);
  context.P = context.EduPolicy;
  const lesson = {
    id: "shared-lesson",
    name: "source",
    gradingPolicy: context.P.defaults("modular", year),
    kardaneshScores: { student: { theory: 0 } },
    poudmans: [
      {
        id: "pod",
        name: "module",
        podScores: { student: { m: 0, c: 2 } },
        units: [
          {
            id: "unit",
            unitScores: { student: { m: 0, p: 18 } },
            competencyScores: { student: { m: 0, c: 3 } },
          },
        ],
      },
    ],
  };
  const classroom = { id: "class", lessons: [lesson] };
  context.currentClass = () => {
    lookups++;
    return classroom;
  };
  vm.runInContext(source("src/ui/course/copy-gate.js"), context);
  if (actualForm) vm.runInContext(source("src/ui/course/form.js"), context);
  return {
    context,
    period,
    identity,
    app,
    state,
    classroom,
    lesson,
    opened,
    setYear: (value) => {
      year = value;
    },
    get lookups() {
      return lookups;
    },
    get shows() {
      return shows;
    },
  };
}

test("copy remains on its original workspace, class and page while drafts settle", async () => {
  const changes = {
    workspace: (f) => {
      f.period.id = "second";
      f.lesson.name = "destination term";
    },
    class: (f) => {
      f.state.classId = "other-class";
    },
    school: (f) => {
      f.state.schoolId = "other-school";
    },
    view: (f) => {
      f.state.view = "schools";
    },
    tab: (f) => {
      f.state.tab = "students";
    },
    lesson: (f) => {
      f.state.lessonId = "other-lesson";
    },
    year: (f) => f.setYear("1406-1407"),
    installation: (f) => {
      f.identity.installation = "restored";
    },
    connection: (f) => {
      f.identity.connection = {};
    },
    data: (f) => {
      f.identity.data = {};
    },
  };
  for (const [name, change] of Object.entries(changes)) {
    const f = fixture({ onFlush: () => change(f) });
    await assert.rejects(f.context.copy("shared-lesson"), /ترم یا کلاس/, name);
    assert.equal(f.lookups, 0, name);
    assert.equal(f.opened.length, 0, name);
  }
});

test("copy rechecks write access after draft saving", async () => {
  for (const field of ["closed", "readOnly"]) {
    const f = fixture({
      onFlush: () => {
        f.period[field] = true;
      },
    });
    await assert.rejects(f.context.copy("shared-lesson"), /readonly/);
    assert.equal(f.lookups, 0);
    assert.equal(f.opened.length, 0);
  }
});

test("successful draft revision and render changes allow a clean copy without changing source grades", async () => {
  const f = fixture({
      onFlush: () => {
        f.period.revision++;
        f.app.firstElementChild = {};
      },
    }),
    before = JSON.stringify(f.lesson);
  await f.context.copy("shared-lesson");
  assert.equal(f.opened.length, 1);
  const [id, copied, options] = f.opened[0];
  assert.equal(id, "");
  assert.equal(copied.name, "source (کپی)");
  assert.notEqual(copied.id, f.lesson.id);
  assert.notEqual(copied.poudmans[0].id, "pod");
  assert.notEqual(copied.poudmans[0].units[0].id, "unit");
  for (const scores of [
    copied.kardaneshScores,
    copied.poudmans[0].podScores,
    copied.poudmans[0].units[0].unitScores,
    copied.poudmans[0].units[0].competencyScores,
  ])
    assert.equal(Object.keys(scores).length, 0);
  assert.equal(JSON.stringify(f.lesson), before);
  assert.equal(typeof options.assertCurrent, "function");
});

test("copy guards the second asynchronous flush inside the actual form opener", async () => {
  for (const changed of ["view", "class", "installation"]) {
    const f = fixture({
      actualForm: true,
      onFlush: (number) => {
        if (number !== 2) return;
        if (changed === "view") f.state.view = "reports";
        else if (changed === "class") f.state.classId = "other-class";
        else f.identity.installation = "restored";
      },
    });
    await assert.rejects(f.context.copy("shared-lesson"), /ترم یا کلاس/);
    assert.equal(f.shows, 0, changed);
  }
});

test("the actual copy form still opens after both normal draft flushes", async () => {
  const f = fixture({
    actualForm: true,
    onFlush: () => {
      f.period.revision++;
      f.app.firstElementChild = {};
    },
  });
  await f.context.copy("shared-lesson");
  assert.equal(f.shows, 1);
});
