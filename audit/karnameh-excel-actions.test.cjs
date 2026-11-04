"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  { File } = require("node:buffer");
const source = fs.readFileSync(
  path.join(__dirname, "../src/workspace/reports/karnameh-excel.js"),
  "utf8",
);
const mime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const plain = (value) => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}
function fixture({
  pause = "",
  selectedStudent = "a",
  rejectModal = false,
} = {}) {
  const gates = { snapshot: deferred(), validation: deferred() },
    entered = { snapshot: deferred(), validation: deferred() },
    preparations = [],
    validations = [],
    builders = [],
    workbooks = [],
    downloads = [],
    shares = [],
    observers = [],
    modalCalls = [],
    writes = [],
    entry = { isConnected: true },
    modal = { hidden: true, classList: { contains: () => modal.hidden } },
    student = { id: "a", name: "سعید پیرزاد", code: "1" },
    classroom = {
      id: "class",
      name: "یازدهم شبکه",
      students: [student, { id: "b", name: "رضا", code: "2" }],
      archivedStudents: [{ id: "archived", name: "بایگانی", code: "3" }],
      lessons: [{ id: "shared", name: "درس مشترک", teacher: "پیرزاد" }],
    },
    school = { id: "school", name: "هنرستان آزمایشی", classes: [classroom] },
    snapshot = {
      context: {
        id: "first",
        revision: 4,
        karnamehYear: "1405-1406",
        members: [
          { id: "first", revision: 4 },
          { id: "second", revision: 7 },
        ],
      },
      parts: [
        {
          period: { id: "first", term: "اول", year: "1405-1406", revision: 4 },
          data: {
            settings: {},
            schools: [structuredClone(school)],
            sessions: [],
          },
        },
        {
          period: { id: "second", term: "دوم", year: "1405-1406", revision: 7 },
          data: {
            settings: {},
            schools: [
              {
                ...structuredClone(school),
                classes: [
                  {
                    ...structuredClone(classroom),
                    lessons: [
                      structuredClone(classroom.lessons[0]),
                      {
                        id: "second-only",
                        name: "درس نوبت دوم",
                        teacher: "پیرزاد",
                      },
                    ],
                  },
                ],
              },
            ],
            sessions: [],
          },
        },
      ],
    };
  let panel,
    currentPanel,
    readable = true,
    rejected = rejectModal;
  const c = vm.createContext({
    Blob,
    File,
    isSecureContext: true,
    navigator: {
      canShare: ({ files }) =>
        files.length === 1 &&
        files[0] instanceof File &&
        files[0].type === mime,
      share: async (payload) => {
        shares.push(payload);
      },
    },
    busy: 0,
    drafts: new Map(),
    assessmentContext: { hasDrafts: () => false },
    draftWritesPending: false,
    draftRecoveryFailed: false,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
    Intl,
    Date,
    workspace: { id: "first", revision: 4, year: "1405-1406" },
    connection: {
      transaction() {
        writes.push("transaction");
        throw Error("unexpected database write");
      },
    },
    installationToken: "installation-a",
    state: { view: "reports", reportTab: "karnameh" },
    karnamehFilter: {
      schoolId: "school",
      classId: "class",
      studentId: selectedStudent,
    },
    assertWorkspaceReadable() {
      if (!readable) throw Error("workspace unreadable");
    },
    assertWorkspaceContext(context) {
      if (
        !readable ||
        context.id !== c.workspace.id ||
        context.revision !== c.workspace.revision
      )
        throw Error("snapshot context changed");
    },
    findClassById: (id) =>
      id === classroom.id ? { school, classObj: classroom } : null,
    karnamehReportStudents: (value) => [
      ...value.students,
      ...(value.archivedStudents || []),
    ],
    karnamehSheetNumber: String,
    esc: (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    EduIcons: { html: () => "" },
    document: {
      getElementById: (id) =>
        id === "modal"
          ? modal
          : id === "karnamehExcelPanel"
            ? currentPanel
            : null,
      querySelector() {
        throw Error("visible DOM grades must not be read");
      },
    },
    showModal(title, html) {
      modalCalls.push({ title, html });
      if (rejected) return false;
      if (panel) panel.isConnected = false;
      let ownerPanel;
      const element = (dataset = {}) => {
        const tokens = new Set(),
          attributes = new Map();
        return {
          isConnected: true,
          hidden: false,
          disabled: false,
          dataset,
          textContent: "",
          innerHTML: "",
          attributes,
          classList: {
            add: (...values) => values.forEach((value) => tokens.add(value)),
            remove: (...values) =>
              values.forEach((value) => tokens.delete(value)),
            contains: (value) => tokens.has(value),
            toggle(value, force) {
              const next = force === undefined ? !tokens.has(value) : !!force;
              if (next) tokens.add(value);
              else tokens.delete(value);
              return next;
            },
          },
          querySelector: () => null,
          closest: (selector) =>
            selector === "#karnamehExcelPanel" ? ownerPanel : null,
          setAttribute: (name, value) => attributes.set(name, value),
          removeAttribute: (name) => attributes.delete(name),
        };
      };
      const status = element(),
        nodes = ["student", "class"].map((scope) => {
          const button = element({ scope });
          button.disabled = scope === "student" && !selectedStudent;
          return button;
        }),
        modes = ["download", "share"].map((delivery) => element({ delivery })),
        send = element({ workspaceAction: "karnameh-excel-send" }),
        save = element({ workspaceAction: "karnameh-excel-save" }),
        ready = element(),
        filename = element(),
        size = element(),
        attributes = new Map(),
        allButtons = [...nodes, ...modes, send, save];
      ready.hidden = true;
      send.hidden = true;
      send.disabled = true;
      save.disabled = true;
      panel = {
        isConnected: true,
        nodes,
        modes,
        send,
        save,
        ready,
        filename,
        size,
        status,
        attributes,
        querySelectorAll(selector) {
          if (selector === "button[data-scope]") return nodes;
          if (selector === "button[data-delivery]") return modes;
          if (selector.includes("button")) return allButtons;
          return [];
        },
        querySelector(selector) {
          if (selector === "[data-karnameh-excel-status]") return status;
          if (selector === "[data-karnameh-excel-ready]") return ready;
          if (selector === "[data-karnameh-excel-file]") return filename;
          if (selector === "[data-karnameh-excel-file-size]") return size;
          if (selector.includes("karnameh-excel-send")) return send;
          if (selector.includes("karnameh-excel-save")) return save;
          return null;
        },
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: (name) => attributes.delete(name),
      };
      ownerPanel = panel;
      currentPanel = panel;
      modal.hidden = false;
      return true;
    },
    prepareKarnamehSnapshot: async () => {
      preparations.push(true);
      entered.snapshot.resolve();
      if (pause === "snapshot") await gates.snapshot.promise;
      return snapshot;
    },
    assertAnnualLessonCompatibility: (parts, schoolId, classId) => {
      assert.equal(parts, snapshot.parts);
      assert.equal(schoolId, "school");
      assert.equal(classId, "class");
    },
    karnamehLessons: (parts, schoolId, selectedClass) => {
      const lessons = new Map(
        selectedClass.lessons.map((lesson) => [lesson.id, lesson]),
      );
      for (const part of parts)
        for (const lesson of part.data.schools
          .find((item) => item.id === schoolId)
          ?.classes.find((item) => item.id === selectedClass.id)?.lessons || [])
          if (!lessons.has(lesson.id)) lessons.set(lesson.id, lesson);
      return [...lessons.values()];
    },
    karnamehExcelSheets: (options) => {
      builders.push(options);
      return [{ name: options.studentId ? "student" : "class", rows: [] }];
    },
    window: {
      EduPeriodicReports: {
        createWorkbook: (sheets) => {
          const blob = new Blob(
            [Uint8Array.of(0x50, 0x4b, 3, 4, 0, 255, 128, 19)],
            { type: mime },
          );
          workbooks.push({ sheets, blob });
          return blob;
        },
      },
    },
    assertReportSnapshot: async (context) => {
      validations.push(context);
      entered.validation.resolve();
      if (pause === "validation") await gates.validation.promise;
    },
    downloadLocalFile: (blob, name) => downloads.push({ blob, name }),
    saveDB() {
      writes.push("saveDB");
      throw Error("unexpected save");
    },
    commitRecords() {
      writes.push("commitRecords");
      throw Error("unexpected commit");
    },
  });
  vm.runInContext(source, c, { filename: "karnameh-excel.js" });
  return {
    c,
    entry,
    modal,
    classroom,
    school,
    snapshot,
    preparations,
    validations,
    builders,
    workbooks,
    downloads,
    shares,
    observers,
    modalCalls,
    writes,
    open: () => c.openKarnamehExcel(entry),
    panel: () => panel,
    button: (scope = "student") =>
      panel.nodes.find((node) => node.dataset.scope === scope),
    status: () => panel.status,
    mode: (delivery) =>
      panel.modes.find((node) => node.dataset.delivery === delivery),
    send: () => panel.send,
    save: () => panel.save,
    ready: () => panel.ready,
    close: () => {
      modal.hidden = true;
      for (const observer of observers)
        if (!observer.disconnected) observer.callback();
    },
    entered: (stage) => entered[stage].promise,
    resume: (stage) => gates[stage].resolve(),
    makeUnreadable: () => (readable = false),
    replacePanel: () => (currentPanel = { isConnected: true }),
    rejectNextModal: () => (rejected = true),
  };
}

test("Karnameh Excel opens synchronously without reading grades or creating any file", () => {
  const f = fixture();
  assert.equal(f.open(), true);
  assert.equal(f.modalCalls.length, 1);
  assert.match(f.modalCalls[0].html, /data-scope="student"/);
  assert.match(f.modalCalls[0].html, /data-scope="class"/);
  assert.equal(
    f.preparations.length + f.builders.length + f.downloads.length,
    0,
  );
  assert.equal(f.button().disabled, false);
  assert.equal(f.button("class").disabled, false);
  assert.deepEqual(f.writes, []);
});

for (const scope of ["student", "class"])
  test(
    "Karnameh Excel downloads a fresh annual " +
      scope +
      " workbook in the requested scope",
    async () => {
      const f = fixture(),
        before = JSON.stringify(f.snapshot);
      f.open();
      assert.equal(await f.c.downloadKarnamehExcel(f.button(scope)), true);
      assert.equal(f.preparations.length, 1);
      assert.equal(f.builders.length, 1);
      assert.equal(f.builders[0].parts, f.snapshot.parts);
      assert.equal(f.builders[0].schoolId, "school");
      assert.equal(f.builders[0].studentId, scope === "student" ? "a" : "");
      assert.equal(f.builders[0].year, "1405-1406");
      assert.deepEqual(
        plain(f.builders[0].classroom.lessons.map((lesson) => lesson.id)),
        ["shared", "second-only"],
      );
      assert.equal(f.validations.length, 1);
      assert.equal(f.validations[0], f.snapshot.context);
      assert.equal(f.validations[0].members[1].revision, 7);
      assert.equal(f.downloads.length, 1);
      assert.equal(f.downloads[0].blob, f.workbooks[0].blob);
      assert.equal(f.downloads[0].blob.type, mime);
      assert.match(f.downloads[0].name, /\.xlsx$/);
      assert.match(
        f.downloads[0].name,
        scope === "student" ? /سعید پیرزاد/ : /کل-کلاس-یازدهم شبکه/,
      );
      assert.equal(f.status().dataset.state, "saved");
      assert.equal(f.panel().attributes.has("aria-busy"), false);
      assert.equal(f.button().disabled, false);
      assert.equal(f.button("class").disabled, false);
      assert.equal(JSON.stringify(f.snapshot), before);
      assert.deepEqual(f.writes, []);
    },
  );

test("each download rereads the annual snapshot instead of reusing the previous file", async () => {
  const f = fixture();
  f.open();
  assert.equal(await f.c.downloadKarnamehExcel(f.button()), true);
  f.snapshot.parts[0].data.schools[0].classes[0].lessons.push({
    id: "new",
    name: "درس جدید",
    teacher: "پیرزاد",
  });
  assert.equal(await f.c.downloadKarnamehExcel(f.button("class")), true);
  assert.equal(f.preparations.length, 2);
  assert.equal(f.downloads.length, 2);
  assert.equal(
    f.builders[1].classroom.lessons.some((lesson) => lesson.id === "new"),
    true,
  );
  assert.notEqual(f.downloads[0].blob, f.downloads[1].blob);
});

test("a missing second term is allowed and never invents a companion snapshot", async () => {
  const f = fixture();
  f.snapshot.parts.pop();
  f.snapshot.context.members.pop();
  f.open();
  assert.equal(await f.c.downloadKarnamehExcel(f.button()), true);
  assert.equal(f.builders[0].parts.length, 1);
  assert.deepEqual(
    plain(f.builders[0].classroom.lessons.map((lesson) => lesson.id)),
    ["shared"],
  );
  assert.equal(f.downloads.length, 1);
});

test("without a selected pupil only the class action is enabled and remains so after download", async () => {
  const f = fixture({ selectedStudent: "" });
  f.open();
  assert.equal(f.button().disabled, true);
  assert.equal(await f.c.downloadKarnamehExcel(f.button()), false);
  assert.equal(f.preparations.length, 0);
  assert.equal(await f.c.downloadKarnamehExcel(f.button("class")), true);
  assert.equal(f.builders[0].studentId, "");
  assert.equal(f.button().disabled, true);
  assert.equal(f.button("class").disabled, false);
});

test("a rapid duplicate click cannot prepare or download a second workbook", async () => {
  const f = fixture({ pause: "snapshot" });
  f.open();
  const operation = f.c.downloadKarnamehExcel(f.button());
  await f.entered("snapshot");
  assert.equal(f.button().disabled, true);
  assert.equal(f.button("class").disabled, true);
  assert.equal(f.panel().attributes.get("aria-busy"), "true");
  assert.equal(await f.c.downloadKarnamehExcel(f.button("class")), false);
  assert.equal(f.preparations.length, 1);
  f.resume("snapshot");
  assert.equal(await operation, true);
  assert.equal(f.downloads.length, 1);
  assert.equal(f.button().disabled, false);
  assert.equal(f.button("class").disabled, false);
});

const changes = [
  ["school selection", (f) => (f.c.karnamehFilter.schoolId = "other")],
  ["class selection", (f) => (f.c.karnamehFilter.classId = "other")],
  ["student selection", (f) => (f.c.karnamehFilter.studentId = "b")],
  ["any additional filter property", (f) => (f.c.karnamehFilter.extra = true)],
  ["workspace", (f) => (f.c.workspace.id = "other")],
  ["academic year", (f) => (f.c.workspace.year = "1406-1407")],
  ["database connection", (f) => (f.c.connection = {})],
  ["installation identity", (f) => (f.c.installationToken = "replacement")],
  ["report page", (f) => (f.c.state.view = "schools")],
  ["report tab", (f) => (f.c.state.reportTab = "daily")],
  ["entry button detached", (f) => (f.entry.isConnected = false)],
  ["panel detached", (f) => (f.panel().isConnected = false)],
  ["panel replaced", (f) => f.replacePanel()],
  ["modal closed", (f) => (f.modal.hidden = true)],
  ["read access revoked", (f) => f.makeUnreadable()],
];
for (const phase of ["snapshot", "validation"])
  for (const [reason, change] of changes)
    test(
      "no Karnameh Excel file escapes after " +
        reason +
        " changes during " +
        phase,
      async () => {
        const f = fixture({ pause: phase });
        f.open();
        const operation = f.c.downloadKarnamehExcel(f.button());
        await f.entered(phase);
        change(f);
        f.resume(phase);
        assert.equal(await operation, false);
        assert.equal(f.downloads.length, 0);
        assert.equal(f.preparations.length, 1);
        assert.equal(f.builders.length, phase === "snapshot" ? 0 : 1);
        assert.equal(f.button().disabled, false);
        assert.equal(f.button("class").disabled, false);
        assert.equal(f.panel().attributes.has("aria-busy"), false);
        assert.deepEqual(f.writes, []);
      },
    );

for (const [reason, change] of [
  ["no selected class", (f) => (f.c.karnamehFilter.classId = "")],
  ["unknown student", (f) => (f.c.karnamehFilter.studentId = "missing")],
  ["school mismatch", (f) => (f.c.karnamehFilter.schoolId = "other")],
  [
    "empty class roster",
    (f) => {
      f.classroom.students = [];
      f.classroom.archivedStudents = [];
    },
  ],
  ["detached entry", (f) => (f.entry.isConnected = false)],
  ["unreadable workspace", (f) => f.makeUnreadable()],
])
  test(
    "opening Karnameh Excel rejects " + reason + " before showing a dialog",
    () => {
      const f = fixture();
      change(f);
      assert.throws(() => f.open());
      assert.equal(f.modalCalls.length, 0);
      assert.equal(
        f.preparations.length + f.builders.length + f.downloads.length,
        0,
      );
      assert.deepEqual(f.writes, []);
    },
  );

test("a cancelled modal never creates a usable Excel session", async () => {
  const f = fixture({ rejectModal: true });
  assert.equal(f.open(), false);
  assert.equal(
    await f.c.downloadKarnamehExcel({ dataset: { scope: "class" } }),
    false,
  );
  assert.equal(f.preparations.length + f.downloads.length, 0);
});

for (const scope of ["invalid", ""])
  test(
    "an invalid export scope cannot start snapshot preparation: " +
      JSON.stringify(scope),
    async () => {
      const f = fixture();
      f.open();
      f.button().dataset.scope = scope;
      assert.equal(await f.c.downloadKarnamehExcel(f.button(scope)), false);
      assert.equal(f.preparations.length + f.downloads.length, 0);
      assert.equal(f.status().dataset.state, "error");
    },
  );

test("a stale choice from a previous modal cannot act on a new dialog", async () => {
  const f = fixture();
  f.open();
  const oldButton = f.button();
  f.open();
  assert.equal(await f.c.downloadKarnamehExcel(oldButton), false);
  assert.equal(f.preparations.length + f.downloads.length, 0);
});

for (const failure of [
  "protected or cancelled snapshot",
  "annual conflict",
  "workbook builder",
  "workbook writer",
  "final snapshot validation",
  "download delivery",
])
  test(
    "Karnameh Excel fails safely on " + failure + " and permits a later retry",
    async () => {
      const f = fixture(),
        error = Error(failure);
      f.open();
      const field = {
          "protected or cancelled snapshot": [f.c, "prepareKarnamehSnapshot"],
          "annual conflict": [f.c, "assertAnnualLessonCompatibility"],
          "workbook builder": [f.c, "karnamehExcelSheets"],
          "workbook writer": [f.c.window.EduPeriodicReports, "createWorkbook"],
          "final snapshot validation": [f.c, "assertReportSnapshot"],
          "download delivery": [f.c, "downloadLocalFile"],
        }[failure],
        [owner, key] = field,
        original = owner[key];
      owner[key] = () => {
        throw error;
      };
      assert.equal(await f.c.downloadKarnamehExcel(f.button()), false);
      assert.equal(f.downloads.length, 0);
      assert.equal(f.status().dataset.state, "error");
      assert.equal(f.status().textContent, failure);
      assert.equal(f.button().disabled, false);
      assert.equal(f.button("class").disabled, false);
      owner[key] = original;
      assert.equal(await f.c.downloadKarnamehExcel(f.button()), true);
      assert.equal(f.downloads.length, 1);
      assert.deepEqual(f.writes, []);
    },
  );

test("a deleted source class cannot produce a workbook from the old visible report", async () => {
  const f = fixture();
  f.open();
  f.snapshot.parts[0].data.schools[0].classes = [];
  assert.equal(await f.c.downloadKarnamehExcel(f.button()), false);
  assert.equal(f.builders.length + f.downloads.length, 0);
});

test("a class with no annual lessons cannot create an empty workbook", async () => {
  const f = fixture();
  f.open();
  for (const part of f.snapshot.parts)
    part.data.schools[0].classes[0].lessons = [];
  assert.equal(await f.c.downloadKarnamehExcel(f.button()), false);
  assert.equal(f.builders.length + f.downloads.length, 0);
});

test("a pupil removed from the snapshot cannot leak a class-wide workbook", async () => {
  const f = fixture();
  f.open();
  for (const part of f.snapshot.parts)
    part.data.schools[0].classes[0].students = [];
  assert.equal(await f.c.downloadKarnamehExcel(f.button()), false);
  assert.equal(f.downloads.length, 0);
});

test("filename uses the Persian calendar and Tehran date at UTC midnight boundaries", () => {
  const f = fixture();
  const before = f.c.karnamehExcelFilename({
    classroom: f.classroom,
    studentId: "a",
    year: "1405-1406",
    generatedAt: "2026-11-04T20:29:59Z",
  });
  const after = f.c.karnamehExcelFilename({
    classroom: f.classroom,
    studentId: "",
    year: "1405-1406",
    generatedAt: "2026-11-04T20:30:00Z",
  });
  assert.equal(
    before,
    "پیرزاد_1405-08-13_23-59-59_نمرات-سعید پیرزاد_1405-1406.xlsx",
  );
  assert.equal(
    after,
    "پیرزاد_1405-08-14_00-00-00_نمرات-کل-کلاس-یازدهم شبکه_1405-1406.xlsx",
  );
});

test("filename sanitizes teacher, pupil, class and year without dropping the requested scope", () => {
  const f = fixture(),
    classroom = structuredClone(f.classroom);
  classroom.name = 'شبکه/رایانه:*?"<>|\\' + String.fromCharCode(0, 31, 127);
  classroom.students[0].name =
    'سعید/پیرزاد:*?"<>|\\' + String.fromCharCode(0, 31, 127);
  classroom.lessons[0].teacher =
    'دبیر/نام:*?"<>|\\' + String.fromCharCode(0, 31, 127);
  for (const studentId of ["a", ""]) {
    const name = f.c.karnamehExcelFilename({
      classroom,
      studentId,
      year: "1405/1406",
      generatedAt: "2026-11-04T08:00:00Z",
    });
    assert.doesNotMatch(name, /[\\/:*?"<>|]/);
    for (const character of name) {
      const point = character.codePointAt(0);
      assert.equal(point >= 32 && point !== 127, true);
    }
    assert.match(name, /دبیر-نام/);
    assert.match(
      name,
      studentId ? /نمرات-سعید-پیرزاد/ : /نمرات-کل-کلاس-شبکه-رایانه/,
    );
    assert.match(name, /_1405-1406\.xlsx$/);
  }
});

test("filename rejects a missing individual and accurately labels absent or multiple teachers", () => {
  const f = fixture(),
    args = {
      classroom: f.classroom,
      studentId: "",
      year: "1405-1406",
      generatedAt: "2026-11-04T08:00:00Z",
    };
  assert.throws(() =>
    f.c.karnamehExcelFilename({ ...args, studentId: "missing" }),
  );
  f.classroom.lessons[0].teacher = "";
  assert.match(f.c.karnamehExcelFilename(args), /^دبیر_/);
  f.classroom.lessons[0].teacher = "الف";
  f.classroom.lessons.push({ id: "two", teacher: "ب" });
  assert.match(f.c.karnamehExcelFilename(args), /^چند دبیر_/);
});

async function prepareShare(f, scope = "student") {
  const delivered = f.downloads.length + f.shares.length;
  assert.equal(f.open(), true);
  assert.equal(f.c.setKarnamehExcelDelivery(f.mode("share")), true);
  assert.equal(await f.c.downloadKarnamehExcel(f.button(scope)), true);
  assert.equal(f.ready().hidden, false);
  assert.equal(f.downloads.length + f.shares.length, delivered);
}

for (const scope of ["student", "class"])
  test(
    "messenger preparation and direct-click sharing preserve exact XLSX bytes for " +
      scope,
    async () => {
      const f = fixture();
      await prepareShare(f, scope);
      assert.equal(f.builders[0].studentId, scope === "student" ? "a" : "");
      assert.equal(f.send().hidden, false);
      assert.equal(f.send().disabled, false);
      assert.equal(f.save().disabled, false);
      const validations = f.validations.length;
      let active = true,
        invoked = false;
      f.c.navigator.share = async (payload) => {
        assert.equal(
          active,
          true,
          "native share must run before activation is lost",
        );
        invoked = true;
        f.shares.push(payload);
      };
      const operation = f.c.shareKarnamehExcel(f.send());
      active = false;
      assert.equal(invoked, true);
      assert.equal(await operation, true);
      assert.equal(
        f.validations.length,
        validations,
        "direct share must not await a durable read",
      );
      assert.equal(f.shares.length, 1);
      const file = f.shares[0].files[0];
      assert.ok(file instanceof File);
      assert.equal(file.type, mime);
      assert.equal(file.name, f.panel().filename.textContent);
      assert.deepEqual(
        Buffer.from(await file.arrayBuffer()),
        Buffer.from(await f.workbooks[0].blob.arrayBuffer()),
      );
      assert.equal(f.downloads.length, 0);
      assert.match(f.status().textContent, /پنجره.*اشتراک|پیام‌رسان/);
      assert.deepEqual(f.writes, []);
    },
  );

test("prepared manual attachment revalidates and downloads the exact cached XLSX without rebuilding", async () => {
  const f = fixture();
  await prepareShare(f);
  const validations = f.validations.length;
  assert.equal(await f.c.downloadPreparedKarnamehExcel(f.save()), true);
  assert.equal(f.validations.length, validations + 1);
  assert.equal(f.validations.at(-1), f.snapshot.context);
  assert.equal(f.builders.length, 1);
  assert.equal(f.downloads[0].blob, f.workbooks[0].blob);
  assert.equal(f.downloads[0].name, f.panel().filename.textContent);
  assert.equal(f.downloads[0].blob.type, mime);
  assert.equal(f.shares.length, 0);
});

for (const [reason, setup] of [
  ["unsupported XLSX", (c) => (c.navigator.canShare = () => false)],
  [
    "canShare exception",
    (c) =>
      (c.navigator.canShare = () => {
        throw Error("policy");
      }),
  ],
  ["missing share API", (c) => (c.navigator.share = undefined)],
  ["missing canShare API", (c) => (c.navigator.canShare = undefined)],
  ["missing File", (c) => (c.File = undefined)],
  [
    "throwing File constructor",
    (c) =>
      (c.File = class {
        constructor() {
          throw Error("File blocked");
        }
      }),
  ],
  ["insecure context", (c) => (c.isSecureContext = false)],
])
  test(
    "unsupported messenger delivery keeps an explicit original-file fallback: " +
      reason,
    async () => {
      const f = fixture();
      setup(f.c);
      await prepareShare(f);
      assert.equal(f.send().hidden, true);
      assert.equal(f.save().disabled, false);
      assert.equal(await f.c.shareKarnamehExcel(f.send()), false);
      assert.equal(f.shares.length + f.downloads.length, 0);
      assert.match(f.status().textContent, /دریافت|پشتیبانی|دسترس/);
      assert.equal(await f.c.downloadPreparedKarnamehExcel(f.save()), true);
      assert.equal(f.downloads[0].blob, f.workbooks[0].blob);
      assert.equal(f.downloads[0].name, f.panel().filename.textContent);
      assert.equal(f.downloads[0].blob.type, mime);
    },
  );

test("cancelling native share retains the same file for retry without automatic download", async () => {
  const f = fixture(),
    attempts = [];
  await prepareShare(f);
  f.c.navigator.share = async ({ files }) => {
    attempts.push(files[0]);
    throw Object.assign(Error("cancelled"), { name: "AbortError" });
  };
  assert.equal(await f.c.shareKarnamehExcel(f.send()), false);
  assert.match(f.status().textContent, /لغو/);
  assert.equal(f.send().disabled, false);
  assert.equal(f.save().disabled, false);
  assert.equal(f.downloads.length, 0);
  f.c.navigator.share = async ({ files }) => attempts.push(files[0]);
  assert.equal(await f.c.shareKarnamehExcel(f.send()), true);
  assert.equal(attempts[0], attempts[1]);
  assert.equal(f.builders.length, 1);
  assert.equal(f.downloads.length, 0);
});

test("permission denial after positive canShare retains an honest explicit attachment fallback", async () => {
  const f = fixture();
  await prepareShare(f);
  f.c.navigator.share = async () => {
    throw Object.assign(Error("denied"), { name: "NotAllowedError" });
  };
  assert.equal(await f.c.shareKarnamehExcel(f.send()), false);
  assert.equal(f.downloads.length, 0);
  assert.match(f.status().textContent, /انجام نشد.*دریافت/);
  assert.equal(f.save().disabled, false);
  assert.equal(await f.c.downloadPreparedKarnamehExcel(f.save()), true);
  assert.equal(f.downloads[0].blob, f.workbooks[0].blob);
});

test("a changed file-sharing capability is rechecked at the actual send click", async () => {
  const f = fixture();
  await prepareShare(f);
  f.c.navigator.canShare = () => false;
  assert.equal(await f.c.shareKarnamehExcel(f.send()), false);
  assert.equal(f.send().hidden, true);
  assert.equal(f.shares.length, 0);
  assert.equal(await f.c.downloadPreparedKarnamehExcel(f.save()), true);
});

const preparedChanges = [
  ...changes,
  ["local durable revision", (f) => f.c.workspace.revision++],
  ["pending write", (f) => (f.c.busy = 1)],
  ["pending grade draft", (f) => f.c.drafts.set("pending", {})],
  [
    "pending assessment draft",
    (f) => (f.c.assessmentContext.hasDrafts = () => true),
  ],
  ["pending draft storage", (f) => (f.c.draftWritesPending = true)],
  ["failed draft recovery", (f) => (f.c.draftRecoveryFailed = true)],
];
for (const [reason, change] of preparedChanges)
  test(
    "cached messenger output refuses sharing and fallback download after " +
      reason,
    async () => {
      for (const action of ["share", "download"]) {
        const f = fixture();
        await prepareShare(f);
        change(f);
        const result =
          action === "share"
            ? await f.c.shareKarnamehExcel(f.send())
            : await f.c.downloadPreparedKarnamehExcel(f.save());
        assert.equal(result, false, action);
        assert.equal(f.shares.length + f.downloads.length, 0, action);
        assert.deepEqual(f.writes, []);
      }
    },
  );

for (const [reason, message] of [
  ["local member advanced", { workspace: "first", revision: 5 }],
  ["peer member advanced", { workspace: "second", revision: 8 }],
  ["new member appeared", { workspace: "new-term", revision: 1 }],
  ["member deleted", { type: "period-deleted", workspace: "second" }],
])
  test(
    "annual invalidation revokes both prepared delivery actions when " + reason,
    async () => {
      const f = fixture();
      await prepareShare(f);
      f.c.invalidateKarnamehExcelShare(message);
      assert.equal(f.ready().hidden, true);
      assert.equal(f.send().disabled, true);
      assert.equal(f.save().disabled, true);
      assert.equal(await f.c.shareKarnamehExcel(f.send()), false);
      assert.equal(await f.c.downloadPreparedKarnamehExcel(f.save()), false);
      assert.equal(f.shares.length + f.downloads.length, 0);
    },
  );

for (const [reason, message] of [
  ["matching peer revision", { workspace: "second", revision: 7 }],
  ["older peer revision", { workspace: "second", revision: 6 }],
  ["zero unknown revision", { workspace: "other", revision: 0 }],
  ["missing workspace", { revision: 9 }],
])
  test(
    "non-advancing notifications preserve the prepared file: " + reason,
    async () => {
      const f = fixture();
      await prepareShare(f);
      f.c.invalidateKarnamehExcelShare(message);
      assert.equal(f.ready().hidden, false);
      assert.equal(await f.c.shareKarnamehExcel(f.send()), true);
      assert.equal(f.shares.length, 1);
    },
  );

test("a native share in flight locks both modes, both scopes and fallback against competing clicks", async () => {
  const f = fixture(),
    gate = deferred();
  await prepareShare(f);
  f.c.navigator.share = async (payload) => {
    f.shares.push(payload);
    await gate.promise;
  };
  const operation = f.c.shareKarnamehExcel(f.send());
  assert.equal(f.send().disabled, true);
  assert.equal(f.save().disabled, true);
  assert.equal(f.button().disabled, true);
  assert.equal(f.button("class").disabled, true);
  assert.equal(f.mode("download").disabled, true);
  assert.equal(f.mode("share").disabled, true);
  assert.equal(await f.c.shareKarnamehExcel(f.send()), false);
  assert.equal(await f.c.downloadPreparedKarnamehExcel(f.save()), false);
  assert.equal(await f.c.downloadKarnamehExcel(f.button("class")), false);
  assert.equal(f.c.setKarnamehExcelDelivery(f.mode("download")), false);
  gate.resolve();
  assert.equal(await operation, true);
  assert.equal(f.shares.length, 1);
  assert.equal(f.downloads.length, 0);
  assert.equal(f.send().disabled, false);
  assert.equal(f.save().disabled, false);
});

test("a cached fallback download locks sharing and cannot duplicate while durable validation is pending", async () => {
  const f = fixture(),
    gate = deferred(),
    entered = deferred();
  await prepareShare(f);
  f.c.assertReportSnapshot = async () => {
    entered.resolve();
    await gate.promise;
  };
  const operation = f.c.downloadPreparedKarnamehExcel(f.save());
  await entered.promise;
  assert.equal(f.send().disabled, true);
  assert.equal(f.save().disabled, true);
  assert.equal(await f.c.downloadPreparedKarnamehExcel(f.save()), false);
  assert.equal(await f.c.shareKarnamehExcel(f.send()), false);
  gate.resolve();
  assert.equal(await operation, true);
  assert.equal(f.downloads.length, 1);
  assert.equal(f.shares.length, 0);
});

test("a silent durable peer conflict stops manual attachment delivery and revokes the cached file", async () => {
  const f = fixture();
  await prepareShare(f);
  f.c.assertReportSnapshot = async () => {
    throw Error("peer changed");
  };
  assert.equal(await f.c.downloadPreparedKarnamehExcel(f.save()), false);
  assert.equal(f.downloads.length + f.shares.length, 0);
  assert.equal(f.ready().hidden, true);
  assert.equal(f.send().disabled, true);
  assert.equal(f.save().disabled, true);
});

for (const [reason, change] of preparedChanges)
  test(
    "prepared attachment cannot escape after " +
      reason +
      " changes during final durable revalidation",
    async () => {
      const f = fixture(),
        gate = deferred(),
        entered = deferred();
      await prepareShare(f);
      f.c.assertReportSnapshot = async () => {
        entered.resolve();
        await gate.promise;
      };
      const operation = f.c.downloadPreparedKarnamehExcel(f.save());
      await entered.promise;
      change(f);
      gate.resolve();
      assert.equal(await operation, false);
      assert.equal(f.shares.length + f.downloads.length, 0);
      assert.equal(f.send().disabled, true);
      assert.equal(f.save().disabled, true);
    },
  );

test("a newer annual invalidation during native share cannot be overwritten by its late completion", async () => {
  const f = fixture(),
    gate = deferred();
  await prepareShare(f);
  f.c.navigator.share = async (payload) => {
    f.shares.push(payload);
    await gate.promise;
  };
  const operation = f.c.shareKarnamehExcel(f.send());
  f.c.invalidateKarnamehExcelShare({ workspace: "second", revision: 8 });
  const staleMessage = f.status().textContent;
  assert.equal(f.ready().hidden, true);
  gate.resolve();
  await operation;
  assert.equal(f.status().textContent, staleMessage);
  assert.equal(f.send().disabled, true);
  assert.equal(f.save().disabled, true);
  assert.equal(f.downloads.length, 0);
});

test("switching delivery revokes any cached file and keeps default download behavior", async () => {
  const f = fixture();
  await prepareShare(f);
  assert.equal(f.c.setKarnamehExcelDelivery(f.mode("download")), true);
  assert.equal(f.ready().hidden, true);
  assert.equal(f.send().disabled, true);
  assert.equal(f.save().disabled, true);
  assert.equal(await f.c.shareKarnamehExcel(f.send()), false);
  assert.equal(await f.c.downloadKarnamehExcel(f.button("class")), true);
  assert.equal(f.downloads.length, 1);
  assert.equal(f.shares.length, 0);
});

test("repreparing another scope clears the old private file before the new snapshot resolves", async () => {
  const f = fixture(),
    gate = deferred(),
    entered = deferred();
  await prepareShare(f);
  f.c.prepareKarnamehSnapshot = async () => {
    entered.resolve();
    await gate.promise;
    return f.snapshot;
  };
  const operation = f.c.downloadKarnamehExcel(f.button("class"));
  await entered.promise;
  assert.equal(f.ready().hidden, true);
  assert.equal(await f.c.shareKarnamehExcel(f.send()), false);
  gate.resolve();
  assert.equal(await operation, true);
  assert.equal(f.builders.at(-1).studentId, "");
  assert.equal(f.ready().hidden, false);
  assert.equal(await f.c.shareKarnamehExcel(f.send()), true);
  assert.match(f.shares[0].files[0].name, /کل-کلاس/);
  assert.equal(f.downloads.length, 0);
});

test("a modal close discards cached bytes and old action reuse even after it is reopened", async () => {
  const f = fixture();
  await prepareShare(f);
  const oldSend = f.send();
  f.close();
  assert.equal(await f.c.shareKarnamehExcel(oldSend), false);
  assert.equal(await f.c.downloadPreparedKarnamehExcel(f.save()), false);
  assert.ok(f.observers.every((observer) => observer.disconnected));
  f.open();
  assert.equal(await f.c.shareKarnamehExcel(oldSend), false);
  assert.equal(f.shares.length + f.downloads.length, 0);
});

test("an older native share cannot overwrite or revoke a newly prepared dialog", async () => {
  const f = fixture(),
    gate = deferred();
  await prepareShare(f);
  f.c.navigator.share = async (payload) => {
    f.shares.push(payload);
    await gate.promise;
  };
  const older = f.c.shareKarnamehExcel(f.send());
  await prepareShare(f, "class");
  const newerMessage = f.status().textContent;
  gate.resolve();
  await older;
  assert.equal(f.status().textContent, newerMessage);
  assert.equal(f.ready().hidden, false);
  assert.equal(f.send().disabled, false);
  f.c.navigator.share = async (payload) => f.shares.push(payload);
  assert.equal(await f.c.shareKarnamehExcel(f.send()), true);
  assert.match(f.shares[1].files[0].name, /کل-کلاس/);
});

test("share preparation accepts a revision advanced by its own successful draft flush", async () => {
  const f = fixture(),
    original = f.c.prepareKarnamehSnapshot;
  f.c.prepareKarnamehSnapshot = async () => {
    f.c.workspace.revision = 5;
    f.snapshot.context.revision = 5;
    f.snapshot.context.members[0].revision = 5;
    return original();
  };
  await prepareShare(f);
  assert.equal(await f.c.shareKarnamehExcel(f.send()), true);
  assert.equal(f.shares.length, 1);
});
