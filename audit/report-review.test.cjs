"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = (name) =>
  fs.readFileSync(path.join(__dirname, "..", name), "utf8");
function fixture() {
  const c = {
    id: "class",
    name: "کلاس",
    students: [{ id: "s", name: "علی" }],
    lessons: [],
  };
  const context = vm.createContext({
    workspace: { year: "1405", term: "اول" },
    esc: (v) => String(v),
    getSortedStudents: (c) => c.students,
    knownStudents: (c) => c.students,
    assessmentWeights: () => ({ practical: 70, theory: 30 }),
    getStudentObj: (c, id) => c.students.find((s) => s.id === id),
    assessmentResult: (l, sid, stage) =>
      stage === "midterm"
        ? { practical: 0, theory: 0, final: 0, complete: true }
        : { practical: null, theory: 18, final: null, complete: false },
    finalText: (r) => (r.final == null ? "—" : r.final.toFixed(2)),
    gradeStatus: (r) => (r.complete ? "تکمیل" : "در انتظار ثبت نمره"),
  });
  vm.runInContext(source("src/workspace/reports/student.js"), context);
  return { context, c };
}
test("term reports show zero and distinguish missing final scores from midterm scores", () => {
  const { context, c } = fixture();
  const html = context.termAssessmentReport(c, {
    name: "مهارت",
    gradingPolicy: {},
  });
  assert.match(html, /میان‌ترم/);
  assert.match(html, /پایان‌ترم/);
  assert.match(html, /<strong>0\.00<\/strong>/);
  assert.match(html, /در انتظار ثبت نمره/);
  assert.match(html, /scope="col">عملی/);
});
test("general report shows one grade per stage and no vocational component columns", () => {
  const { context, c } = fixture();
  const html = context.termAssessmentReport(c, {
    name: "ریاضی",
    gradingPolicy: { subjectType: "general" },
  });
  assert.doesNotMatch(html, /scope="col">عملی|scope="col">نظری/);
  assert.match(html, /<strong>0\.00<\/strong>/);
  assert.match(html, /نوبت اول/);
});
test("grade status styling distinguishes missing, failed and passed scores without treating zero as missing", () => {
  const { context } = fixture();
  assert.match(
    context.gradeReportStatus(
      { final: 0, complete: true, passed: false },
      "جبران",
    ),
    /is-remedial/,
  );
  assert.match(
    context.gradeReportStatus({ final: null, complete: false }, "ناقص"),
    /is-pending/,
  );
  assert.match(
    context.gradeReportStatus(
      { final: 18, complete: true, passed: true },
      "قبول",
    ),
    /is-passed/,
  );
  assert.match(
    context.gradeReportStatus({ final: 18, complete: true }, "ثبت شده"),
    /is-complete/,
  );
});

test("empty class report does not display a misleading average or empty grade grid", () => {
  const { context, c } = fixture();
  assert.match(context.overviewV24(c), /ابتدا دروس کلاس/);
  c.students = [];
  assert.match(context.overviewV24(c), /هنوز دانش‌آموزی/);
  assert.doesNotMatch(context.overviewV24(c), /<table|میانگین/);
});

test("year report adapts to variable lesson counts without dropping lesson cells", () => {
  const { context, c } = fixture();
  context.calcV24 = () => ({ final: null, complete: false });
  for (const count of [1, 2, 3, 6, 15, 30]) {
    c.lessons = Array.from({ length: count }, (_, i) => ({
      id: "lesson-" + i,
      name: "درس " + i,
      gradeMode: "kardanesh",
    }));
    const html = context.overviewV24(c, { parts: [] });
    assert.equal((html.match(/data-report-lesson=/g) || []).length, count);
    assert.equal(
      (html.match(/class="report-lesson-stage"/g) || []).length,
      count * 4,
    );
    assert.equal(html.includes("karnameh-many-lessons"), count > 2);
    assert.doesNotMatch(html, /report-average-cell/);
    assert.doesNotMatch(html, /report-grade-status|نیازمند جبران|قبول/);
  }
  c.lessons = [];
  assert.doesNotMatch(context.overviewV24(c, { parts: [] }), /<table/);
});

test("individual vocational report shows actual practical and theory fields, not modular averages", () => {
  const { context, c } = fixture();
  c.lessons = [{ id: "dual", name: "مهارت", gradeMode: "kardanesh" }];
  context.calcV24 = () => ({
    practical: 18,
    theory: 12,
    avgP: null,
    avgM: null,
    final: 15.6,
    complete: true,
    passed: true,
    att: {},
  });
  const html = context.detailedV24(c, "s");
  assert.match(html, /<td>18<\/td><td>12<\/td>/);
  assert.match(html, /15\.60/);
  assert.match(html, /میان‌ترم/);
  assert.match(html, /پایان‌ترم/);
});

test("class and frozen reports preserve practical, theory and weighted result for each stage", () => {
  const { context } = fixture();
  const html = context.assessmentOverviewCell({ gradeMode: "kardanesh" }, "s");
  assert.equal((html.match(/report-lesson-stage/g) || []).length, 2);
  assert.match(html, /عملی/);
  assert.match(html, /نظری/);
  assert.match(html, /میانگین/);
  const lesson = {
    name: "درس",
    mode: "kardanesh",
    assessments: {
      midterm: { practical: 10, theory: 20, final: 14, complete: true },
      final: { practical: 18, theory: 12, final: 15.6, complete: true },
    },
  };
  const frozen = context.frozenLessonRows(lesson);
  assert.match(frozen, /میان‌ترم<\/td><td>10<\/td><td>20<\/td><td>14\.00/);
  assert.match(frozen, /پایان‌ترم<\/td><td>18<\/td><td>12<\/td><td>15\.60/);
});

test("student report navigation validates membership and supports returning to the same class", () => {
  const { context, c } = fixture();
  c.archivedStudents = [{ id: "archived", name: "بایگانی" }];
  const school = { id: "school" };
  context.assertWorkspaceReadable = () => {};
  context.findClassById = (id) =>
    id === c.id ? { school, classObj: c } : null;
  context.state = {};
  context.closeModal = () => {};
  let renders = 0;
  context.render = () => renders++;
  context.openKarnamehStudent(c.id, "archived");
  assert.equal(context.karnamehFilter.studentId, "archived");
  assert.equal(context.state.reportTab, "karnameh");
  assert.throws(
    () => context.openKarnamehStudent(c.id, "foreign"),
    /در دسترس نیست/,
  );
  assert.equal(context.karnamehFilter.studentId, "archived");
  context.openKarnamehStudent(c.id);
  assert.equal(context.karnamehFilter.studentId, "");
  assert.equal(context.karnamehFilter.classId, c.id);
  assert.equal(renders, 2);
});
test("choosing a lesson without a class resolves its school and class", () => {
  const context = vm.createContext({
    db: {
      schools: [
        {
          id: "school",
          classes: [{ id: "class", lessons: [{ id: "lesson" }] }],
        },
      ],
    },
    lessonReportFilter: { schoolId: "", classId: "", lessonId: "" },
    render: () => {},
  });
  vm.runInContext(source("src/legacy/reports/lesson.js"), context);
  context.updateLessonReportFilter("lessonId", "lesson");
  assert.equal(context.lessonReportFilter.classId, "class");
  assert.equal(context.lessonReportFilter.schoolId, "school");
  context.updateLessonReportFilter("schoolId", "other");
  context.updateLessonReportFilter("lessonId", "lesson");
  assert.equal(context.lessonReportFilter.lessonId, "");
});
test("print uses the clicked report and counts merged columns for page orientation", () => {
  const created = [];
  const copy = {
    style: { removeProperty() {} },
    querySelectorAll: (selector) =>
      selector === "tr" ? [{ children: [{ colSpan: 5 }, { colSpan: 4 }] }] : [],
  };
  const clickedReport = {
    cloneNode: () => copy,
    matches: () => false,
    querySelector: () => null,
  };
  const wrongReport = {
    cloneNode: () => {
      throw Error("Unrelated report printed");
    },
  };
  const context = vm.createContext({
    workspace: { year: "1405", term: "اول" },
    esc: String,
    document: {
      getElementById: (id) =>
        id === "modal"
          ? { classList: { contains: () => true } }
          : id === "karnamehTabOutput"
            ? wrongReport
            : null,
      createElement: () => {
        const node = {
          append(value) {
            this.child = value;
          },
        };
        created.push(node);
        return node;
      },
      body: { append() {} },
      head: { append() {} },
    },
  });
  vm.runInContext(source("src/workspace/reports/printing.js"), context);
  const root = context.preparePrint({
    closest: (selector) =>
      selector.includes(".report-document") ? clickedReport : null,
  });
  assert.equal(root.child, copy);
  assert.match(created.at(-1).textContent, /landscape/);
});
test("periodic print returns failure when the print operation is rejected", async () => {
  const context = vm.createContext({
    generate: async () => ({}),
    last: { context: {} },
    isPreparedCurrent: () => true,
    root: { EduV24: { printReport: async () => false } },
    document: { querySelector: () => ({}) },
    invalidate: () => {},
  });
  vm.runInContext(
    source("src/reports/periodic/output.js").split(
      "root.EduPeriodicReports =",
    )[0],
    context,
  );
  assert.equal(await context.output("print"), false);
});
test("annual selectors expose only classified first and second terms", () => {
  const context = vm.createContext({});
  vm.runInContext(source("src/reports/periodic/filters.js"), context);
  vm.runInContext(
    'annualPeriodList = [{id:"a",termKind:"first"},{id:"b",termKind:"second"},{id:"restored",termKind:null}]',
    context,
  );
  assert.equal(
    context
      .annualPeriodOptions("annualFirstId")
      .map((r) => r.id)
      .join(","),
    "a",
  );
  assert.equal(
    context
      .annualPeriodOptions("annualSecondId")
      .map((r) => r.id)
      .join(","),
    "b",
  );
});
test("annual snapshots reject ambiguous automatic selection and mismatched explicit term roles", async () => {
  const catalog = [
    { id: "first", year: "1405", term: "اول", termKind: "first", revision: 0 },
    {
      id: "restored_first",
      year: "1405",
      term: "اول بازیابی",
      termKind: "first",
      revision: 0,
    },
    {
      id: "second",
      year: "1405",
      term: "دوم",
      termKind: "second",
      revision: 0,
    },
  ];
  const context = vm.createContext({
    workspace: catalog[0],
    db: { settings: {} },
    ready: true,
    periodLoading: false,
    fileMode: false,
    resetBusy: false,
    connectionRetired: false,
    blocked: false,
    busy: 0,
    drafts: new Map(),
    flushDrafts: async () => {},
    writer: Promise.resolve(),
    isSafeRecordId: (id) => typeof id === "string" && !!id,
    requestPromise: async (value) => value,
    transactionDone: async () => {},
    connection: {
      transaction: () => ({
        objectStore: (name) => ({
          getAll: () => {
            const request = { result: name === "catalog" ? catalog : [] };
            queueMicrotask(() => request.onsuccess());
            return request;
          },
        }),
        abort() {},
      }),
    },
  });
  vm.runInContext(source("src/workspace/reports/snapshots.js"), context);
  await assert.rejects(context.prepareAnnualReportSnapshot(), /چند نسخه/);
  await assert.rejects(
    context.prepareAnnualReportSnapshot({ first: "second", second: "first" }),
    /مطابقت ندارد/,
  );
  await assert.rejects(
    context.prepareAnnualReportSnapshot({ first: "first", second: "first" }),
    /متمایز/,
  );
});
