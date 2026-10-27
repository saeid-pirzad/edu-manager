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
test("empty class report does not display a misleading average or empty grade grid", () => {
  const { context, c } = fixture();
  assert.match(context.overviewV24(c), /ابتدا دروس کلاس/);
  c.students = [];
  assert.match(context.overviewV24(c), /هنوز دانش‌آموزی/);
  assert.doesNotMatch(context.overviewV24(c), /<table|میانگین/);
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
  const clickedReport = { cloneNode: () => copy };
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
test("annual selectors keep first and second terms separate and retain unclassified restored periods", () => {
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
    "a,restored",
  );
  assert.equal(
    context
      .annualPeriodOptions("annualSecondId")
      .map((r) => r.id)
      .join(","),
    "b,restored",
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
  await assert.rejects(context.prepareAnnualReportSnapshot(), /چند دوره/);
  await assert.rejects(
    context.prepareAnnualReportSnapshot({ first: "second", second: "first" }),
    /مطابقت ندارد/,
  );
  await assert.rejects(
    context.prepareAnnualReportSnapshot({ first: "first", second: "first" }),
    /متمایز/,
  );
});
