"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const c = vm.createContext({ structuredClone });
  for (const file of [
    "domain/grade-math.js",
    "domain/data-boundary.js",
    "domain/grade-policy.js",
    "workspace/domain/defaults-numbers.js",
    "workspace/grading/results.js",
    "workspace/periods/install.js",
    "workspace/periods/switch-create.js",
    "workspace/reports/finalize.js",
    "validation/frozen-report.js",
    "workspace/reports/student.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  c.workspace = {
    id: "first",
    year: "1405-1406",
    term: "اول",
    termKind: "first",
    revision: 1,
    closed: false,
  };
  c.getSortedStudents = (cls) => cls.students;
  c.old = {
    calcStudentLesson: (_cls, lesson, sid) => ({
      avgM: null,
      avgP: null,
      final: null,
      passed: null,
      practical: lesson.kardaneshScores?.[sid]?.practical ?? null,
      theory: lesson.kardaneshScores?.[sid]?.theory ?? null,
    }),
  };
  return c;
}

function data(c) {
  const module = {
    id: "module",
    name: "پودمان اول",
    podScores: {
      student: { m: 0, c: 2 },
      archived: { m: 5, c: 3 },
      unknown: { m: 4, c: 2 },
    },
    units: [{ id: "unit", unitScores: { student: { m: 12, p: 14 } } }],
  };
  const modular = {
    id: "modular",
    name: "درس سالانه",
    gradeMode: "standard",
    gradingPolicy: c.EduPolicy.defaults("modular", "1405-1406"),
    kardaneshScores: {},
    poudmans: [
      module,
      { id: "pending", name: "پودمان دوم", units: [], podScores: {} },
    ],
  };
  const dual = {
    id: "dual",
    name: "درس عملی و نظری",
    gradeMode: "kardanesh",
    gradingPolicy: c.EduPolicy.defaults("dual", "1405-1406"),
    kardaneshScores: {
      student: {
        practical: 18,
        theory: 12,
        midtermPractical: 16,
        midtermTheory: 12,
      },
    },
    poudmans: [],
  };
  const general = structuredClone(dual);
  general.id = "general";
  general.gradingPolicy.subjectType = "general";
  const legacy = structuredClone(modular);
  legacy.id = "legacy";
  delete legacy.gradingPolicy;
  return {
    settings: { academicYear: "1405-1406", academicTerm: "اول" },
    sessions: [{ id: "session" }],
    schools: [
      {
        id: "school",
        name: "مدرسه",
        classes: [
          {
            id: "class",
            name: "کلاس",
            students: [{ id: "student", name: "هنرجو" }],
            archivedStudents: [{ id: "archived", name: "هنرجوی بایگانی" }],
            lessons: [modular, dual, general, legacy],
          },
        ],
      },
    ],
  };
}

async function create(c, year, term) {
  const saved = [];
  c.db = data(c);
  c.workspace.closed = true;
  const first = structuredClone(c.workspace);
  c.fileMode = false;
  c.document = {
    getElementById: (id) => ({ value: id === "periodYear" ? year : term }),
  };
  c.flushDrafts = async () => {};
  c.writer = Promise.resolve();
  c.allFrom = async () => [first];
  c.readWorkspaceSnapshot = async () => ({ period: first, data: c.db });
  c.captureWorkspaceContext = () => ({ ...c.workspace });
  c.preserveAsyncTarget = () => () => {};
  c.assertWorkspaceContext = () => {};
  c.normalizeDB = (value) => value;
  c.installWorkspace = async (value, details) => {
    saved.push({ value, details });
    return { id: "created" };
  };
  c.switchPeriod = async () => {};
  const before = JSON.stringify(c.db);
  await c.createNewPeriod();
  assert.equal(JSON.stringify(c.db), before, "source term remains unchanged");
  return saved[0].value;
}

test("starting the second term carries annual modular grades, including zero, only for destination students", async () => {
  const c = fixture();
  const created = await create(c, "1405-1406", "دوم");
  const cls = created.schools[0].classes[0];
  assert.equal(cls.archivedStudents.length, 0);
  const module = cls.lessons[0].poudmans[0];
  assert.equal(module.id, "module");
  assert.equal(module.podScores.student.m, 0);
  assert.equal(module.podScores.student.c, 2);
  assert.deepEqual(Object.keys(module.podScores), ["student"]);
  assert.equal(Object.keys(module.units[0].unitScores).length, 0);
  assert.equal(Object.keys(cls.lessons[1].kardaneshScores).length, 0);
  assert.equal(Object.keys(cls.lessons[2].kardaneshScores).length, 0);
  assert.equal(Object.keys(cls.lessons[3].poudmans[0].podScores).length, 0);
  assert.equal(
    Object.keys(cls.lessons[3].poudmans[0].units[0].unitScores).length,
    0,
  );
  assert.equal(created.sessions.length, 0);
});

test("a new academic year never inherits annual modular or term grades", async () => {
  const c = fixture();
  const created = await create(c, "1406-1407", "اول");
  for (const lesson of created.schools[0].classes[0].lessons) {
    assert.equal(Object.keys(lesson.kardaneshScores).length, 0);
    for (const module of lesson.poudmans) {
      assert.equal(Object.keys(module.podScores).length, 0);
      for (const unit of module.units)
        assert.equal(Object.keys(unit.unitScores).length, 0);
    }
    if (lesson.gradingPolicy)
      assert.equal(lesson.gradingPolicy.year, "1406-1407");
  }
});

function finalization(c, termKind = "first") {
  c.db = data(c);
  c.db.schools[0].classes[0].lessons.splice(1);
  c.workspace.termKind = termKind;
  c.workspace.term = termKind === "first" ? "اول" : "دوم";
  c.fileMode = false;
  c.busy = 0;
  c.drafts = new Map();
  c.assertWorkspaceReadable = () => {};
  c.assertEntityWritable = () => {};
  c.assertWorkspaceContext = () => {};
  c.captureWorkspaceContext = () => ({ ...c.workspace });
  c.flushDrafts = async () => {};
  c.writer = Promise.resolve();
  c.confirm = () => true;
  c.putBackup = async () => {};
  c.uid = () => "frozen-report";
  c.broadcast = () => {};
  c.openPeriods = async () => {};
  c.render = () => {};
  const rows = [],
    errors = [];
  c.handleError = (error) => errors.push(error);
  let complete;
  c.transactionDone = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  c.connection = {
    transaction: () => ({
      abort: () => {
        throw Error("unexpected transaction abort");
      },
      objectStore: (store) => ({
        get: () => {
          const request = { result: { ...c.workspace } };
          queueMicrotask(() => {
            request.onsuccess();
            complete();
          });
          return request;
        },
        put: (row) => rows.push({ store, row }),
        add: () => {},
        delete: () => {},
      }),
    }),
  };
  return { rows, errors };
}

test("first-term closing permits unfinished annual modules and preserves their frozen history", async () => {
  const c = fixture();
  const { rows, errors } = finalization(c);
  await c.finalizePeriod();
  assert.equal(errors.length, 0);
  assert.equal(c.workspace.closed, true);
  const report = rows.find(({ store }) => store === "reports").row;
  const lesson = report.classes[0].students[0].lessons[0];
  assert.equal(lesson.modules.length, 2);
  assert.equal(lesson.modules[0].final, 10);
  assert.equal(lesson.modules[1].complete, false);
  assert.equal(lesson.final, null);
  assert.equal(report.classes[0].students[0].average, null);
  assert.equal(c.validateFrozenReport(report), true);
});

test("first-term closing recognizes legacy first-term labels without termKind", () => {
  const c = fixture();
  finalization(c);
  delete c.workspace.termKind;
  assert.equal(c.finalReportData().missing.length, 0);
});

test("second-term closing still rejects unfinished annual modules", async () => {
  const c = fixture();
  const { rows, errors } = finalization(c, "second");
  await c.finalizePeriod();
  assert.equal(c.workspace.closed, false);
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /نمرات ناقص/);
});

test("first-term modular exemption never permits incomplete practical or theory term grades", async () => {
  const c = fixture();
  const { rows, errors } = finalization(c);
  const dual = data(c).schools[0].classes[0].lessons[1];
  delete dual.kardaneshScores.student.midtermTheory;
  c.db.schools[0].classes[0].lessons.push(dual);
  await c.finalizePeriod();
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /میان‌ترم/);
});

test("first-term modular exemption never permits incomplete legacy unit-based grades", () => {
  const c = fixture();
  finalization(c);
  const legacy = data(c).schools[0].classes[0].lessons[3];
  c.db.schools[0].classes[0].lessons.push(legacy);
  assert.ok(
    c.finalReportData().missing.some((item) => item.endsWith(legacy.name)),
  );
});

test("complete failed modular grades remain closable in the second term", async () => {
  const c = fixture();
  const { errors, rows } = finalization(c, "second");
  const modules = c.db.schools[0].classes[0].lessons[0].poudmans;
  modules[0].podScores.student = { m: 5, c: 1 };
  modules[1].podScores.student = { m: 5, c: 3 };
  await c.finalizePeriod();
  assert.equal(errors.length, 0);
  assert.equal(c.workspace.closed, true);
  assert.equal(
    rows.find(({ store }) => store === "reports").row.classes[0].students[0]
      .lessons[0].passed,
    false,
  );
});
