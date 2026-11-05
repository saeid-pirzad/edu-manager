"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const c = vm.createContext({
    root: {},
    esc: String,
    faDate: String,
    modeLabel: String,
  });
  for (const file of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/reporting/attendance.js",
    "domain/reporting/date-ranges.js",
    "domain/reporting/periodic-model.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  Object.assign(c.root, {
    EduReportDates: c.EduReportDates,
    EduReportModel: c.EduReportModel,
    EduReportAttendance: c.EduReportAttendance,
  });
  for (const file of [
    "reports/periodic/date-range.js",
    "reports/periodic/model.js",
    "reports/periodic/text.js",
    "reports/periodic/document.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      c,
    );
  const data = {
    settings: { academicYear: "1405-1406", academicTerm: "دوم" },
    schools: [
      {
        id: "school",
        name: "SCHOOL",
        classes: [{ id: "class", name: "CLASS", students: [], lessons: [] }],
      },
    ],
    sessions: [],
  };
  return { c, data };
}

for (const mode of ["daily", "weekly", "monthly"]) {
  test(`${mode} empty report explicitly retains selected term in JSON, HTML, text and deputy output`, () => {
    const { c, data } = fixture(),
      before = JSON.stringify(data),
      model = c.build(data, {
        mode,
        date: "2026-10-31",
        schoolId: "school",
        audience: "management",
      });
    assert.equal(JSON.parse(JSON.stringify(model)).academicTerm, "دوم");
    assert.equal(model.summary.sessions, 0);
    assert.match(c.documentHtml(model), /ترم دوم/);
    assert.match(c.textReport(model), /ترم: دوم/);
    assert.match(c.deputyReport(model), /ترم: دوم/);
    assert.equal(JSON.stringify(data), before);
  });
}

test("annual report labels both terms rather than implying the selected term only", () => {
  const { c, data } = fixture();
  data.settings.academicTerm = "اول و دوم";
  const model = c.build(data, {
    mode: "annual",
    date: "2026-10-31",
    schoolId: "school",
    audience: "management",
  });
  assert.equal(model.academicTerm, "اول و دوم");
  assert.match(c.documentHtml(model), /ترم اول و دوم/);
  assert.match(c.textReport(model), /ترم: اول و دوم/);
  assert.match(c.deputyReport(model), /ترم: اول و دوم/);
});

function orchestrationFixture(mode = "daily", audience = "management") {
  const { c, data } = fixture(),
    elements = new Map(),
    storage = new Map(),
    calls = [],
    assertions = [],
    downloads = [],
    copies = [],
    prints = [],
    buttons = {
      build: { disabled: false },
      deputy: { disabled: true },
      export: { disabled: false },
    },
    context = {
      id: "second",
      revision: 2,
      year: "1405-1406",
      yearScopeId: "1405-1406",
      notesWorkspaceId: "first",
      notesWorkspaceIds: ["first", "second"],
    },
    annualContext = {
      id: "second",
      revision: 2,
      yearScope: "1405-1406",
      members: [
        { id: "first", revision: 1 },
        { id: "second", revision: 2 },
      ],
    };
  data.schools[0].classes[0].students = [{ id: "student", name: "STUDENT" }];
  data.schools[0].classes[0].lessons = [{ id: "lesson", name: "LESSON" }];
  const session = (id, status, note, period) => ({
    id,
    date: "2026-10-31",
    period,
    schoolId: "school",
    classId: "class",
    lessonId: "lesson",
    roster: [{ id: "student", name: "STUDENT" }],
    attendance: { student: status },
    scores: [{ studentId: "student", type: "positive", value: 1, note }],
  });
  data.sessions = [
    session("selected-session", "late:7", "CURRENT-ACTIVITY", 1),
  ];
  const annualData = structuredClone(data);
  annualData.settings.academicTerm = "اول و دوم";
  annualData.sessions.unshift(
    session("peer-session", "absent", "PEER-ACTIVITY", 0),
  );
  const parts = [
    { period: { id: "first", term: "اول", revision: 1 }, data: annualData },
    { period: { id: "second", term: "دوم", revision: 2 }, data },
  ];
  c.db = data;
  c.Blob = Blob;
  c.setTimeout = () => {};
  c.globalFilter = {};
  c.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  };
  c.document = {
    querySelectorAll(selector) {
      return [
        ...(selector.includes(".periodic-build") ? [buttons.build] : []),
        ...(selector.includes("[data-deputy-copy]") ? [buttons.deputy] : []),
        ...(selector.includes(".periodic-export-actions")
          ? [buttons.export]
          : []),
      ];
    },
    querySelector: (selector) =>
      selector === "[data-deputy-copy]"
        ? buttons.deputy
        : elements.get("periodicReportOutput"),
    getElementById(id) {
      if (!elements.has(id))
        elements.set(id, { innerHTML: "", textContent: "" });
      return elements.get(id);
    },
  };
  c.downloadLocalFile = (blob, name) => downloads.push({ blob, name });
  c.copyToClipboard = (text, button, html) => copies.push({ text, html });
  const renderControls = () => {
    const html = c.root.EduPeriodicReports.render(
      c.root.EduPeriodicReports.filters.mode,
    );
    for (const [name, marker] of [
      ["build", "periodic-build"],
      ["deputy", "data-deputy-copy"],
    ]) {
      const tag = html.match(
        new RegExp("<button\\b[^>]*" + marker + "[^>]*>"),
      )?.[0];
      assert.ok(tag, marker);
      buttons[name].disabled = /\sdisabled(?:[=\s>])/.test(tag);
    }
    return html;
  };
  c.root.render = renderControls;
  c.root.addEventListener = () => {};
  c.root.EduV24 = {
    getReportContext: () => context,
    canWriteReportNotes: () => true,
    async prepareReportSnapshot(options) {
      calls.push(structuredClone(options));
      return options.annual
        ? { data: structuredClone(annualData), parts, context: annualContext }
        : {
            data: structuredClone(data),
            context: { id: "second", revision: 2 },
          };
    },
    async assertReportSnapshot(value) {
      assertions.push(value);
    },
    periodicKarnamehHtml: () => "",
    annualGradeRows: (values) => {
      assert.equal(values, parts);
      return [];
    },
    annualTechnicalRows: (values) => {
      assert.equal(values, parts);
      return [];
    },
    async printReport(element, options) {
      assert.equal(options.validate(), true);
      prints.push({ html: element.innerHTML, context: options.context });
      return true;
    },
  };
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/legacy/students/roster.js"),
      "utf8",
    ),
    c,
  );
  for (const file of [
    "notes.js",
    "filters.js",
    "render.js",
    "excel-sharing.js",
    "generate.js",
    "output.js",
  ])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../src/reports/periodic", file),
        "utf8",
      ),
      c,
    );
  Object.assign(c.root.EduPeriodicReports.filters, {
    mode,
    audience,
    date: "2026-10-31",
    schoolId: "school",
    classId: "class",
    studentId: audience === "parent" ? "student" : "",
  });
  return {
    api: c.root.EduPeriodicReports,
    c,
    data,
    annualData,
    context,
    annualContext,
    calls,
    assertions,
    downloads,
    copies,
    prints,
    elements,
    buttons,
    renderControls,
  };
}

for (const mode of ["daily", "weekly", "monthly"]) {
  test(`${mode} production orchestration requests only selected-term sessions and exports that same scope`, async () => {
    const f = orchestrationFixture(mode),
      model = await f.api.generate();
    assert.ok(model, f.elements.get("periodicError")?.textContent);
    assert.deepEqual(f.calls, [{ annual: false }]);
    assert.equal(model.summary.sessions, 1);
    assert.equal(model.summary.absent, 0);
    assert.equal(model.summary.late, 1);
    assert.equal(model.summary.recordedMarks, 1);
    assert.equal(model.academicTerm, "دوم");
    assert.deepEqual(
      Array.from(model.periods, (part) => part.id),
      ["second"],
    );
    assert.equal(model.annualGrades, undefined);
    for (const kind of ["json", "txt", "deputy", "print"])
      assert.equal(await f.api.output(kind), true);
    const exported = JSON.parse(await f.downloads[0].blob.text());
    assert.equal(exported.academicTerm, "دوم");
    assert.deepEqual(
      exported.sessions.map((item) => item.id),
      ["selected-session"],
    );
    assert.deepEqual(
      exported.periods.map((part) => part.id),
      ["second"],
    );
    const text = await f.downloads[1].blob.text();
    assert.match(text, /ترم: دوم/);
    assert.match(text, /CURRENT-ACTIVITY/);
    assert.doesNotMatch(text, /PEER-ACTIVITY/);
    assert.match(f.copies[0].text, /ترم: دوم/);
    assert.match(f.prints[0].html, /ترم دوم/);
    assert.doesNotMatch(f.prints[0].html, /PEER-ACTIVITY/);
    assert.ok(f.calls.every((options) => options.annual === false));
  });
}

test("parent attendance stays term-local while annual grades keep a separate year-wide revision guard", async () => {
  const f = orchestrationFixture("daily", "parent"),
    model = await f.api.generate();
  assert.ok(model, f.elements.get("periodicError")?.textContent);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0], { annual: false });
  assert.equal(f.calls[1].annual, true);
  assert.equal(f.calls[1].yearWide, true);
  assert.equal(model.summary.sessions, 1);
  assert.equal(model.summary.absent, 0);
  assert.equal(model.academicTerm, "دوم");
  assert.deepEqual(
    Array.from(model.periods, (part) => part.id),
    ["second"],
  );
  assert.deepEqual(
    Array.from(model.gradePeriods, (part) => part.id),
    ["first", "second"],
  );
  assert.ok(
    model.definitions.some((text) =>
      text.includes("فقط مربوط به ترم انتخاب‌شده"),
    ),
  );
  assert.equal(f.assertions.at(-1), f.annualContext);
  assert.equal(await f.api.output("json"), true);
  assert.equal(f.assertions.at(-1), f.annualContext);
});

test("a protected peer term is not requested for management but blocks parent annual grades if access is denied", async () => {
  for (const audience of ["management", "parent"]) {
    const f = orchestrationFixture("daily", audience),
      prepare = f.c.root.EduV24.prepareReportSnapshot;
    f.c.root.EduV24.prepareReportSnapshot = async (options) => {
      if (options.annual) throw Error("PROTECTED-PEER-DENIED");
      return prepare(options);
    };
    const model = await f.api.generate();
    if (audience === "management") assert.equal(model?.summary.sessions, 1);
    else {
      assert.equal(model, null);
      assert.equal(f.api.getLast(), null);
      assert.match(
        f.elements.get("periodicError").textContent,
        /PROTECTED-PEER-DENIED/,
      );
    }
  }
});

test("parent report rejects a selected-term revision change between attendance and annual-grade snapshots", async () => {
  const f = orchestrationFixture("daily", "parent");
  f.annualContext.revision++;
  assert.equal(await f.api.generate(), null);
  assert.equal(f.api.getLast(), null);
  assert.match(
    f.elements.get("periodicError").textContent,
    /اطلاعات هنگام تهیه گزارش تغییر کرد/,
  );
});

test("parent report rejects a concurrent peer-term grade change before any export is prepared", async () => {
  const f = orchestrationFixture("daily", "parent");
  f.c.root.EduV24.assertReportSnapshot = async (context) => {
    if (context.members) throw Error("PEER-REVISION-CHANGED");
  };
  assert.equal(await f.api.generate(), null);
  assert.equal(f.api.getLast(), null);
  assert.match(
    f.elements.get("periodicError").textContent,
    /PEER-REVISION-CHANGED/,
  );
  assert.equal(f.downloads.length, 0);
});

test("annual orchestration remains year-wide and supports a year with only the first term", async () => {
  for (const partial of [false, true]) {
    const f = orchestrationFixture("annual");
    if (partial) {
      f.annualData.settings.academicTerm = "اول";
      f.annualData.sessions.splice(1);
      f.c.root.EduV24.prepareReportSnapshot = async (options) => {
        f.calls.push(structuredClone(options));
        return {
          data: f.annualData,
          parts: [{ period: { id: "first", term: "اول", revision: 1 } }],
          context: f.annualContext,
        };
      };
      f.c.root.EduV24.annualGradeRows = () => [];
      f.c.root.EduV24.annualTechnicalRows = () => [];
    }
    const model = await f.api.generate();
    assert.ok(model, f.elements.get("periodicError")?.textContent);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].annual, true);
    assert.equal(f.calls[0].yearWide, true);
    assert.equal(model.summary.sessions, partial ? 1 : 2);
    assert.equal(model.periods.length, partial ? 1 : 2);
    assert.equal(model.academicTerm, partial ? "اول" : "اول و دوم");
  }
});

test("periodic deputy copy is disabled until explicit preparation and never prepares on demand", async () => {
  const f = orchestrationFixture();
  f.renderControls();
  assert.equal(f.buttons.build.disabled, false);
  assert.equal(f.buttons.deputy.disabled, true);
  assert.equal(await f.api.output("deputy"), false);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.copies, []);
  assert.ok(f.elements.get("periodicError").textContent);
  const model = await f.api.generate();
  assert.ok(model);
  assert.equal(f.buttons.deputy.disabled, false);
  const preparedCalls = f.calls.length;
  f.c.root.EduV24.prepareReportSnapshot = async () => {
    throw Error("Copy must not prepare a report");
  };
  assert.equal(await f.api.output("deputy"), true);
  assert.equal(f.calls.length, preparedCalls);
  assert.equal(f.copies.length, 1);
  assert.equal(f.api.getLast(), model);
});

test("pending and failed preparation never enable periodic deputy copy", async () => {
  const f = orchestrationFixture();
  assert.ok(await f.api.generate());
  assert.equal(f.buttons.deputy.disabled, false);
  let release;
  f.c.root.EduV24.prepareReportSnapshot = () =>
    new Promise((resolve, reject) => {
      release = () => reject(Error("Synthetic preparation failure"));
    });
  const preparing = f.api.generate();
  f.renderControls();
  assert.equal(f.buttons.build.disabled, true);
  assert.equal(f.buttons.deputy.disabled, true);
  assert.equal(await f.api.output("deputy"), false);
  assert.deepEqual(f.copies, []);
  release();
  assert.equal(await preparing, null);
  assert.equal(f.buttons.build.disabled, false);
  assert.equal(f.buttons.deputy.disabled, true);
  assert.equal(f.api.getLast(), null);
});

for (const [name, change] of [
  ["filter", (f) => f.api.set("date", "2026-11-01")],
  ["author", (f) => f.api.author("Changed author")],
  ["note", (f) => f.api.note("Changed report note")],
  [
    "active context",
    (f) => {
      f.context.revision++;
      f.renderControls();
    },
  ],
  [
    "annual member",
    (f) => f.api.workspaceChanged({ workspace: "first", revision: 2 }),
  ],
]) {
  test(
    "periodic deputy copy is disabled after its " + name + " becomes stale",
    async () => {
      const f = orchestrationFixture(
        name === "annual member" ? "annual" : "daily",
      );
      assert.ok(await f.api.generate());
      assert.equal(f.buttons.deputy.disabled, false);
      const preparedCalls = f.calls.length;
      change(f);
      assert.equal(f.buttons.deputy.disabled, true);
      assert.equal(await f.api.output("deputy"), false);
      assert.equal(f.calls.length, preparedCalls);
      assert.deepEqual(f.copies, []);
    },
  );
}

test("periodic deputy copy rechecks its prepared identity after durable validation", async () => {
  const f = orchestrationFixture();
  assert.ok(await f.api.generate());
  let release;
  f.c.root.EduV24.assertReportSnapshot = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const copying = f.api.output("deputy");
  f.api.set("date", "2026-11-01");
  release();
  assert.equal(await copying, false);
  assert.equal(f.buttons.deputy.disabled, true);
  assert.deepEqual(f.copies, []);
  assert.equal(f.calls.length, 1);
});

test("an old pending deputy copy failure preserves a newer explicitly prepared report", async () => {
  const f = orchestrationFixture();
  assert.ok(await f.api.generate());
  let rejectOld;
  f.c.root.EduV24.assertReportSnapshot = () =>
    new Promise((_resolve, reject) => {
      rejectOld = reject;
    });
  const copying = f.api.output("deputy");
  f.c.root.EduV24.assertReportSnapshot = async () => {};
  f.api.author("Newer author");
  const current = await f.api.generate();
  assert.ok(current);
  rejectOld(Error("Old report validation failed"));
  assert.equal(await copying, false);
  assert.equal(f.api.getLast(), current);
  assert.equal(f.buttons.deputy.disabled, false);
  assert.deepEqual(f.copies, []);
});
