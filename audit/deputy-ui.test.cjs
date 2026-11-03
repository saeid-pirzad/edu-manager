"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function packet() {
  return {
    format: "EduManager.DeputyExchange",
    version: 1,
    id: "packet",
    exportedAt: "2026-11-02T09:00:00.000Z",
    sender: { code: "teacher", name: "دبیر نمونه" },
    school: { id: "school", code: "school", name: "مدرسه نمونه" },
    academicYear: "1405-1406",
    periods: [
      {
        id: "first",
        termKind: "first",
        revision: 1,
        school: {
          classes: [
            {
              id: "class",
              name: "کلاس نمونه",
              students: [{ id: "student", name: "هنرجو", code: "1" }],
              archivedStudents: [],
              lessons: [{ id: "lesson", name: "درس نمونه", teacher: "دبیر" }],
            },
          ],
        },
        sessions: [
          {
            id: "session",
            classId: "class",
            lessonId: "lesson",
            date: "2026-11-02",
            period: 0,
            roster: [{ id: "student", name: "هنرجو" }],
            attendance: { student: "late:5" },
            scores: [],
          },
        ],
      },
    ],
  };
}

function fixture({
  rows = [],
  notes = [],
  commitError = null,
  gradeRows = [],
  planChanged = null,
} = {}) {
  const handlers = {},
    nodes = new Map(),
    calls = {
      open: 0,
      commit: 0,
      restore: 0,
      notes: [],
      confirm: 0,
      pickerInit: 0,
      pickerSync: 0,
      pickerClose: [],
    };
  const host = {
    innerHTML: "",
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
    contains: () => true,
  };
  const field = (id, value = "") => {
    const node = { id, value, focus() {}, click() {}, disabled: false };
    nodes.set(id, node);
    return node;
  };
  nodes.set("deputyApp", host);
  nodes.set("deputyMessage", { textContent: "" });
  nodes.set("deputyBackupDialog", {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  });
  const plan = {
    status: "new",
    counts: { classes: 1, students: 1, lessons: 1, sessions: 1 },
    added: {},
    removed: {},
    updatedPeriods: [],
  };
  if (planChanged) plan.changed = planChanged;
  const storage = {
    list: async () => structuredClone(rows),
    followups: async () => structuredClone(notes),
    close() {},
    preview: async (value) => ({
      key: value.sender.code === "teacher-b" ? "stream-b" : "stream",
      version: 0,
      packet: value,
      plan,
    }),
    commit: async (preview) => {
      calls.commit++;
      if (commitError) throw commitError;
      const row = {
        key: preview.key,
        packet: preview.packet,
        version: 1,
        receivedAt: "2026-11-02T09:00:00.000Z",
      };
      rows.push(row);
      return row;
    },
    saveFollowup: async (value) => {
      calls.notes.push(structuredClone(value));
    },
    backup: async () => ({ revision: 2 }),
    safetyBackupInfo: async () => null,
    lastSafetyBackup: async () => null,
    restore: async () => {
      calls.restore++;
    },
  };
  const rootEvents = {};
  const bodyClasses = new Set();
  const context = vm.createContext({
    console,
    Date,
    Blob,
    URL,
    Map,
    Set,
    Promise,
    structuredClone,
    initShamsiPickers: () => {
      calls.pickerInit++;
    },
    syncShamsiDisabledInputs: () => {
      calls.pickerSync++;
    },
    closeShamsiCalendar: (restore) => {
      calls.pickerClose.push(restore);
    },
    document: {
      readyState: "loading",
      body: {
        classList: {
          add: (name) => bodyClasses.add(name),
          remove: (name) => bodyClasses.delete(name),
          toggle: (name, active) =>
            active ? bodyClasses.add(name) : bodyClasses.delete(name),
        },
      },
      getElementById: (id) => nodes.get(id) || null,
      querySelector: () => null,
      addEventListener() {},
    },
    addEventListener: (name, handler) => {
      rootEvents[name] = handler;
    },
    confirm: () => {
      calls.confirm++;
      return false;
    },
    EduDeputyExchange: {
      maxBytes: 32 * 1024 * 1024,
      gradeRows: () => gradeRows,
    },
    EduDeputyStore: {
      open: async () => {
        calls.open++;
        return storage;
      },
      maxBackupBytes: 128 * 1024 * 1024,
      validateBackup: (value) => {
        if (value.invalid || value.format !== "EduManager.DeputyBackup")
          throw Error("INVALID BACKUP");
        return value;
      },
    },
  });
  const fragments = [
    "ui-state.js",
    "calendar.js",
    "render-inbox.js",
    "render-reports.js",
    "events.js",
    "app.js",
  ];
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/core/icons.js"), "utf8"),
    context,
  );
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/domain/calendar.js"), "utf8"),
    context,
  );
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/domain/reporting/attendance.js"),
      "utf8",
    ),
    context,
  );
  vm.runInContext(
    '(function(root){\n"use strict";\n' +
      fragments
        .map((name) =>
          fs.readFileSync(path.join(__dirname, "../src/deputy", name), "utf8"),
        )
        .join("\n") +
      "\n})(globalThis);",
    context,
  );
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise(setImmediate);
  };
  const click = async (action, extras = {}) => {
    const target = {
      dataset: { deputyAction: action, ...extras },
      disabled: false,
    };
    handlers.click({ target: { closest: () => target } });
    await flush();
  };
  const tab = async (name) => {
    const target = { dataset: { deputyTab: name }, disabled: false };
    handlers.click({ target: { closest: () => target } });
    await flush();
  };
  const change = async (id, value) => {
    const node = field(id, value);
    handlers.change({ target: node });
    await flush();
  };
  const file = async (id, value, size = 100) => {
    const target = {
      id,
      files: [{ size, text: async () => JSON.stringify(value) }],
    };
    handlers.change({ target });
    await flush();
  };
  return {
    context,
    host,
    calls,
    nodes,
    field,
    click,
    tab,
    change,
    file,
    flush,
    handlers,
    rootEvents,
    bodyClasses,
  };
}

const row = (value = packet()) => ({
  key: "stream",
  packet: value,
  version: 1,
  receivedAt: "2026-11-02T09:00:00.000Z",
});

test("deputy startup is idempotent and has receive/files/report/followup tabs", async () => {
  const f = fixture();
  await f.context.EduDeputyUI.start();
  await f.context.EduDeputyUI.start();
  assert.equal(f.calls.open, 1);
  assert.equal(f.context.EduDeputyUI.status().ready, true);
  for (const name of ["receive", "files", "reports", "followups"])
    assert.ok(f.host.innerHTML.includes('data-deputy-tab="' + name + '"'));
});

test("deputy report print explicitly overrides shared teacher body-child hiding", () => {
  const shared = fs.readFileSync(
    path.join(__dirname, "../src/styles/responsive.css"),
    "utf8",
  );
  const deputy = fs.readFileSync(
    path.join(__dirname, "../src/styles/deputy.css"),
    "utf8",
  );
  assert.match(shared, /body\s*>\s*\*\s*\{\s*display:\s*none\s*!important/);
  assert.match(
    deputy,
    /@media print\s*\{\s*\.ed-deputy-page\.ed-print-report\s*>\s*\.deputy-app\s*\{\s*display:\s*block\s*!important/,
  );
  assert.match(
    deputy,
    /\.ed-deputy-page:not\(\.ed-print-report\)\s+\.deputy-app\s*\{\s*display:\s*none/,
  );
});

test("deputy uses shared trusted SVG branding and equivalent desktop/mobile navigation", async () => {
  const f = fixture();
  await f.context.EduDeputyUI.start();
  for (const nav of ["deputyDesktopNav", "deputyBottomNav"]) {
    assert.match(f.host.innerHTML, new RegExp('id="' + nav + '"'));
    for (const tab of ["receive", "files", "reports", "followups"])
      assert.match(
        f.host.innerHTML,
        new RegExp(
          'id="' + nav + "-" + tab + '" data-deputy-tab="' + tab + '"',
        ),
      );
  }
  assert.match(f.host.innerHTML, /<svg class="ui-icon"/);
  assert.match(
    f.host.innerHTML,
    /aria-label="بازخوانی اطلاعات ذخیره‌شده در همین مرورگر"/,
  );
  assert.doesNotMatch(f.host.innerHTML, /[↻↓▤✓◇＋←]/);
  await f.tab("reports");
  assert.match(
    f.host.innerHTML,
    /id="deputyBottomNav-reports"[^>]*aria-current="page"/,
  );
  assert.match(
    f.host.innerHTML,
    /id="deputyDesktopNav-reports"[^>]*aria-current="page"/,
  );
});

test("deputy mobile navigation mirrors teacher coarse tablet breakpoint and preserves print isolation", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../src/styles/deputy.css"),
    "utf8",
  );
  assert.match(
    css,
    /@media screen and \(max-width: 700px\),\s*screen and \(max-width: 1000px\) and \(pointer: coarse\)/,
  );
  assert.match(css, /\.ed-deputy-page \.ed-bottom-nav\s*\{\s*display: grid/);
  assert.match(
    css,
    /\.ed-deputy-page\.ed-keyboard-open \.ed-bottom-nav\s*\{\s*visibility: hidden/,
  );
  assert.match(css, /\.ed-deputy-page\.ed-print-report \.ed-bottom-nav,/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /--ed-accent: var\(--workflow-accent/);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:#app\b|#uiBottomNav\b|\.topbar\b)/);
});

test("virtual keyboard hiding is scoped to deputy body and restores navigation after close", async () => {
  const f = fixture();
  await f.context.EduDeputyUI.start();
  f.context.innerHeight = 844;
  f.context.visualViewport = { height: 500 };
  f.context.document.activeElement = { matches: () => true };
  f.rootEvents.resize();
  assert.equal(f.bodyClasses.has("ed-keyboard-open"), true);
  f.context.visualViewport.height = 844;
  f.rootEvents.resize();
  assert.equal(f.bodyClasses.has("ed-keyboard-open"), false);
});

test("source facet survives rerenders and backup opens separately without changing the active section", async () => {
  const f = fixture({ rows: [row()] });
  await f.context.EduDeputyUI.start();
  await f.click("open-backups");
  assert.equal(f.nodes.get("deputyBackupDialog").open, true);
  await f.click("close-backups");
  assert.equal(f.nodes.get("deputyBackupDialog").open, false);
  await f.tab("reports");
  f.handlers.toggle({ target: { id: "deputySourceOptions", open: true } });
  await f.change("deputyTerm", "first");
  assert.match(
    f.host.innerHTML,
    /id="deputySourceOptions" class="ed-source-options" open/,
  );
  await f.tab("receive");
  await f.click("open-backups");
  assert.equal(f.context.EduDeputyUI.status().tab, "receive");
  assert.equal(f.nodes.get("deputyBackupDialog").open, true);
});

test("file preview distinguishes changed observations and raw grade components from memberships", async () => {
  const f = fixture({
    planChanged: { attendance: 2, assessments: 3, policies: 0 },
  });
  await f.context.EduDeputyUI.start();
  await f.file("deputyImportFile", packet());
  assert.match(
    f.host.innerHTML,
    /تغییر وضعیت حضور: ۲ · مؤلفهٔ نمره: ۳ · قواعد درس\/ترم: ۰/,
  );
  assert.match(f.host.innerHTML, /هنرجو در کلاس: ۱/);
  assert.equal(f.calls.commit, 0);
});

test("teacher file is previewed first and only explicit confirmation commits", async () => {
  const f = fixture();
  await f.context.EduDeputyUI.start();
  await f.file("deputyImportFile", packet());
  assert.equal(f.calls.commit, 0);
  assert.match(f.host.innerHTML, /deputyImportPreview/);
  assert.match(f.host.innerHTML, /هنوز ثبت نشده/);
  await f.click("confirm-import");
  assert.equal(f.calls.commit, 1);
  assert.equal(f.context.EduDeputyUI.status().streams, 1);
  assert.doesNotMatch(f.host.innerHTML, /id="deputyImportPreview"/);
});

test("wrong teacher backup cannot enter deputy exchange and no commit occurs", async () => {
  const f = fixture();
  await f.context.EduDeputyUI.start();
  await f.file("deputyImportFile", { format: "EduManager.FullBackup" });
  assert.equal(f.calls.commit, 0);
  assert.equal(f.context.EduDeputyUI.status().error, true);
  assert.match(f.host.innerHTML, /برای ارسال به معاون نیست/);
});

test("restore fully validates backup before showing confirmation", async () => {
  const f = fixture();
  await f.context.EduDeputyUI.start();
  await f.file("deputyRestoreFile", {
    format: "EduManager.DeputyBackup",
    invalid: true,
    streams: [],
    followups: [],
  });
  assert.match(f.host.innerHTML, /INVALID BACKUP/);
  assert.doesNotMatch(f.host.innerHTML, /id="deputyRestorePreview"/);
  assert.equal(f.calls.restore, 0);
});

test("backup file uses independent larger restore limit while exchange remains bounded", async () => {
  const f = fixture();
  await f.context.EduDeputyUI.start();
  await f.file(
    "deputyRestoreFile",
    { format: "EduManager.DeputyBackup", streams: [], followups: [] },
    40 * 1024 * 1024,
  );
  assert.match(f.host.innerHTML, /id="deputyRestorePreview"/);
  await f.file("deputyImportFile", packet(), 40 * 1024 * 1024);
  assert.equal(f.context.EduDeputyUI.status().error, true);
  assert.equal(f.calls.commit, 0);
});

test("first zero-based bell renders as one and late is included among attendance", async () => {
  const f = fixture({ rows: [row()] });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  assert.match(f.host.innerHTML, /زنگ ۱/);
  assert.doesNotMatch(f.host.innerHTML, /زنگ ۰/);
  assert.match(f.host.innerHTML, /حاضر، شامل تأخیر/);
  assert.match(f.host.innerHTML, /تأخیر، از حاضرین/);
});

test("invalid date range suppresses derived report and disables print", async () => {
  const f = fixture({ rows: [row()] });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  await f.change("deputyFrom", "2026-11-04");
  await f.change("deputyTo", "2026-11-01");
  assert.doesNotMatch(f.host.innerHTML, /id="deputyPrintable"/);
  assert.match(f.host.innerHTML, /data-deputy-action="print"[^>]*disabled/);
});

test("names and notes are HTML escaped without modifying source packet", async () => {
  const source = packet();
  source.school.name = '<img src=x onerror="alert(1)">';
  const before = JSON.stringify(source);
  const f = fixture({ rows: [row(source)] });
  await f.context.EduDeputyUI.start();
  await f.tab("files");
  assert.doesNotMatch(f.host.innerHTML, /<img src=x/);
  assert.match(f.host.innerHTML, /&lt;img/);
  assert.equal(JSON.stringify(source), before);
});

test("orphaned followup remains editable with fixed historical target", async () => {
  const source = packet();
  source.periods[0].school.classes = [];
  source.periods[0].sessions = [];
  const item = {
    id: "note",
    streamKey: "stream",
    classId: "removed-class",
    studentId: "removed-student",
    note: "پیگیری قبلی",
    status: "open",
    version: 2,
    updatedAt: "2026-11-02T09:00:00.000Z",
    snapshot: {
      schoolName: "مدرسه",
      className: "کلاس سابق",
      studentName: "هنرجوی سابق",
      senderName: "دبیر",
    },
  };
  const f = fixture({ rows: [row(source)], notes: [item] });
  await f.context.EduDeputyUI.start();
  await f.tab("followups");
  await f.click("edit-note", { note: "note" });
  assert.match(f.host.innerHTML, /کلاس سابق · هنرجوی سابق/);
  assert.doesNotMatch(f.host.innerHTML, /id="deputyNoteClass"/);
  assert.doesNotMatch(f.host.innerHTML, /id="deputyNoteStudent"/);
  f.field("deputyNoteText", "پیگیری اصلاح‌شده");
  f.handlers.submit({
    target: { id: "deputyFollowupForm" },
    preventDefault() {},
  });
  await f.flush();
  assert.equal(f.calls.notes[0].classId, "removed-class");
  assert.equal(f.calls.notes[0].studentId, "removed-student");
  assert.equal(f.calls.notes[0].version, 2);
  assert.equal(f.calls.notes[0].note, "پیگیری اصلاح‌شده");
});

test("unsaved note cannot be silently discarded by source navigation", async () => {
  const f = fixture({ rows: [row()] });
  await f.context.EduDeputyUI.start();
  await f.tab("followups");
  f.handlers.input({
    target: { id: "deputyNoteText", value: "متن ذخیره نشده" },
  });
  await f.change("deputySender", "different");
  assert.equal(f.calls.confirm, 1);
  assert.equal(f.nodes.get("deputySender").value, "");
  let prevented = false;
  f.rootEvents.beforeunload({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
});

test("concurrent import conflict clears obsolete preview and never reports success", async () => {
  const f = fixture({ commitError: Error("DEPUTY_REVISION_CONFLICT") });
  await f.context.EduDeputyUI.start();
  await f.file("deputyImportFile", packet());
  await f.click("confirm-import");
  assert.match(f.host.innerHTML, /DEPUTY_REVISION_CONFLICT/);
  assert.doesNotMatch(f.host.innerHTML, /id="deputyImportPreview"/);
  assert.equal(f.context.EduDeputyUI.status().streams, 0);
  assert.equal(f.context.EduDeputyUI.status().error, true);
});

test("importing source B preserves editing target A even when local class/student IDs match", async () => {
  const item = {
    id: "note",
    streamKey: "stream",
    classId: "class",
    studentId: "student",
    note: "پیگیری دبیر اول",
    status: "open",
    version: 2,
    updatedAt: "2026-11-02T09:00:00.000Z",
    snapshot: {
      schoolName: "مدرسه",
      className: "کلاس",
      studentName: "هنرجو",
      senderName: "دبیر اول",
    },
  };
  const f = fixture({ rows: [row()], notes: [item] });
  await f.context.EduDeputyUI.start();
  await f.tab("followups");
  await f.click("edit-note", { note: "note" });
  await f.tab("receive");
  const incoming = packet();
  incoming.sender = { code: "teacher-b", name: "دبیر دوم" };
  await f.file("deputyImportFile", incoming);
  await f.click("confirm-import");
  await f.tab("followups");
  assert.match(f.host.innerHTML, /<option value="stream" selected>/);
  assert.doesNotMatch(f.host.innerHTML, /<option value="stream-b" selected>/);
  f.field("deputyNoteText", "اصلاح برای دبیر اول");
  f.handlers.submit({
    target: { id: "deputyFollowupForm" },
    preventDefault() {},
  });
  await f.flush();
  assert.equal(f.calls.notes[0].streamKey, "stream");
  assert.equal(f.calls.notes[0].id, "note");
});

test("automatic import source switch resets empty note targeting without blocking a new B note", async () => {
  const f = fixture({ rows: [row()] });
  await f.context.EduDeputyUI.start();
  await f.tab("followups");
  await f.change("deputyNoteClass", "class");
  await f.change("deputyNoteStudent", "student");
  await f.tab("receive");
  const incoming = packet();
  incoming.sender = { code: "teacher-b", name: "دبیر دوم" };
  await f.file("deputyImportFile", incoming);
  await f.click("confirm-import");
  await f.tab("followups");
  assert.match(f.host.innerHTML, /<option value="stream-b" selected>/);
  assert.match(
    f.host.innerHTML,
    /<option value="" selected>کلاس را انتخاب کنید/,
  );
  await f.change("deputyNoteClass", "class");
  await f.change("deputyNoteStudent", "student");
  f.handlers.input({
    target: { id: "deputyNoteText", value: "پیگیری دبیر دوم" },
  });
  f.field("deputyNoteText", "پیگیری دبیر دوم");
  f.handlers.submit({
    target: { id: "deputyFollowupForm" },
    preventDefault() {},
  });
  await f.flush();
  assert.equal(f.calls.notes[0].streamKey, "stream-b");
  assert.equal(f.calls.confirm, 0);
  assert.equal(f.context.EduDeputyUI.status().error, false);
});

test("source disappearing during refresh preserves draft text but blocks cross-source save", async () => {
  const sources = [row()];
  const f = fixture({ rows: sources });
  await f.context.EduDeputyUI.start();
  await f.tab("followups");
  await f.change("deputyNoteClass", "class");
  await f.change("deputyNoteStudent", "student");
  f.handlers.input({
    target: { id: "deputyNoteText", value: "متن مربوط به دبیر اول" },
  });
  const incoming = packet();
  incoming.sender = { code: "teacher-b", name: "دبیر دوم" };
  sources.splice(0, 1, { ...row(incoming), key: "stream-b" });
  await f.context.EduDeputyUI.refresh();
  assert.match(f.host.innerHTML, /متن مربوط به دبیر اول/);
  assert.match(f.host.innerHTML, /ذخیره مسدود است/);
  assert.doesNotMatch(f.host.innerHTML, /id="deputyFollowupForm"/);
  f.field("deputyNoteText", "متن مربوط به دبیر اول");
  f.handlers.submit({
    target: { id: "deputyFollowupForm" },
    preventDefault() {},
  });
  await f.flush();
  assert.equal(f.calls.notes.length, 0);
  assert.match(f.host.innerHTML, /ثبت یادداشت در پروندهٔ دیگر مجاز نیست/);
});

test("legacy raw unit grades retain zero and do not claim a computed formal final", async () => {
  const f = fixture({
    rows: [row()],
    gradeRows: [
      {
        classId: "class",
        className: "کلاس",
        studentId: "student",
        studentName: "هنرجو",
        lessonId: "lesson",
        lessonName: "درس",
        kind: "legacy",
        stages: [],
        units: [
          {
            termKind: "first",
            poudmanName: "پودمان",
            unitName: "واحد",
            m: 0,
            p: 17,
          },
        ],
      },
    ],
  });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  assert.match(f.host.innerHTML, /نمرات خام ساختار قدیمی/);
  assert.match(f.host.innerHTML, /<small>مستمر<\/small><strong>۰<\/strong>/);
  assert.match(f.host.innerHTML, /<small>پایانی<\/small><strong>۱۷<\/strong>/);
  assert.match(f.host.innerHTML, /نمرهٔ نهایی رسمی درس نیستند/);
});

test("identical sender names remain visibly distinguishable by early stable codes in inbox, native select and report", async () => {
  const first = packet();
  const second = packet();
  first.sender.code = "TEACHER-A";
  second.sender.code = "TEACHER-B";
  const f = fixture({
    rows: [row(first), { ...row(second), key: "stream-b" }],
  });
  await f.context.EduDeputyUI.start();
  await f.tab("files");
  assert.match(f.host.innerHTML, /کد دبیر: <bdi dir="ltr">TEACHER-A<\/bdi>/);
  assert.match(f.host.innerHTML, /کد دبیر: <bdi dir="ltr">TEACHER-B<\/bdi>/);
  assert.match(f.host.innerHTML, /کد مدرسه: <bdi dir="ltr">school<\/bdi>/);
  await f.tab("reports");
  assert.match(
    f.host.innerHTML,
    /<option value="stream" selected>کد دبیر TEACHER-A · دبیر نمونه/,
  );
  assert.match(
    f.host.innerHTML,
    /<option value="stream-b">کد دبیر TEACHER-B · دبیر نمونه/,
  );
  assert.doesNotMatch(f.host.innerHTML, /<option[^>]*>[^<]*<bdi/);
  assert.match(
    f.host.innerHTML,
    /منبع: دبیر نمونه · کد دبیر: <bdi dir="ltr">TEACHER-A<\/bdi>/,
  );
});

test("deputy uses shared calendar hooks and hidden ISO inputs without any teacher navigation link", async () => {
  const f = fixture({ rows: [row()] });
  await f.context.EduDeputyUI.start();
  assert.doesNotMatch(f.host.innerHTML, /EduManager\.html|نسخهٔ دبیر/);
  await f.tab("reports");
  assert.ok(f.host.innerHTML.includes('type="date" hidden id="deputyFrom"'));
  assert.ok(
    f.host.innerHTML.includes(
      'data-deputy-action="calendar-clear" data-field="from"',
    ),
  );
  assert.ok(f.calls.pickerInit > 0);
  assert.equal(f.calls.pickerInit, f.calls.pickerSync);
  assert.ok(f.calls.pickerClose.every((restore) => restore === false));
  await f.change("deputyFrom", "2026-11-01");
  assert.ok(f.host.innerHTML.includes('id="deputyFrom" value="2026-11-01"'));
  assert.doesNotMatch(
    f.host.innerHTML,
    /deputyDateDialog|deputyCalendarDay|deputyFromCalendar/,
  );
});

test("an invalid ISO native change blocks reporting and explicit external clearing restores the range", async () => {
  const f = fixture({ rows: [row()] });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  await f.change("deputyFrom", "2026-02-30");
  assert.equal(f.context.EduDeputyUI.status().error, true);
  assert.doesNotMatch(f.host.innerHTML, /id="deputyPrintable"/);
  await f.click("print");
  await f.click("calendar-clear", { field: "from" });
  assert.match(f.host.innerHTML, /id="deputyPrintable"/);
  assert.equal(f.context.EduDeputyUI.status().error, false);
});

test("student report restricts sessions, attendance, activities, grades and printed content to the selected stable ID", async () => {
  const source = packet();
  const classroom = source.periods[0].school.classes[0];
  classroom.students = [
    { id: "a", name: "هنرجو الف", code: "100" },
    { id: "b", name: "هنرجو ب", code: "200" },
  ];
  source.periods[0].sessions = [
    {
      ...source.periods[0].sessions[0],
      roster: classroom.students,
      attendance: { a: "late:5", b: "absent" },
      scores: [
        { studentId: "a", type: "activity", value: 0, note: "ACTIVITY-A" },
        { studentId: "b", type: "activity", value: 20, note: "PRIVATE-B" },
      ],
    },
    {
      ...source.periods[0].sessions[0],
      id: "only-b",
      period: 1,
      roster: [classroom.students[1]],
      attendance: { b: "present" },
      scores: [],
    },
  ];
  const base = {
    classId: "class",
    className: "کلاس نمونه",
    lessonId: "lesson",
    lessonName: "درس",
    kind: "general",
    stages: [{ termKind: "first", stage: "final", final: 0 }],
  };
  const f = fixture({
    rows: [row(source)],
    gradeRows: [
      { ...base, studentId: "a", studentName: "هنرجو الف" },
      {
        ...base,
        studentId: "b",
        studentName: "هنرجو ب",
        lessonId: "private-b",
        lessonName: "PRIVATE-GRADE-B",
      },
    ],
  });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  assert.match(f.host.innerHTML, /id="deputyStudent" disabled/);
  await f.change("deputyClass", "class");
  await f.change("deputyStudent", "a");
  const printed = f.host.innerHTML.slice(
    f.host.innerHTML.indexOf('<div id="deputyPrintable"'),
  );
  assert.match(printed, /گزارش هنرجو/);
  assert.match(printed, /هنرجو الف/);
  assert.match(printed, /ACTIVITY-A/);
  assert.doesNotMatch(printed, /هنرجو ب|PRIVATE-B|PRIVATE-GRADE-B/);
  assert.equal((printed.match(/class="ed-session"/g) || []).length, 1);
  assert.match(printed, /<strong>۱<\/strong><span>حاضر، شامل تأخیر/);
  assert.match(printed, /<strong>۰<\/strong><span>غایب/);
});

test("archived and roster-only students are selectable without name-based merging", async () => {
  const source = packet();
  const classroom = source.periods[0].school.classes[0];
  classroom.students = [
    { id: "a", name: "نام مشترک", code: "100" },
    { id: "b", name: "نام مشترک", code: "200" },
  ];
  classroom.archivedStudents = [
    { id: "archive", name: "بایگانی", code: "300" },
  ];
  source.periods[0].sessions[0].roster = [
    { id: "historical", name: "سابقهٔ تاریخی", code: "400" },
  ];
  const f = fixture({ rows: [row(source)] });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  await f.change("deputyClass", "class");
  assert.match(f.host.innerHTML, /value="a">نام مشترک · 100/);
  assert.match(f.host.innerHTML, /value="b">نام مشترک · 200/);
  assert.match(f.host.innerHTML, /value="archive">بایگانی · 300 · بایگانی/);
  assert.match(
    f.host.innerHTML,
    /value="historical">سابقهٔ تاریخی · 400 · سابقهٔ جلسه/,
  );
});

test("student target persists into a term without that student and yields an empty report, never all students", async () => {
  const source = packet();
  const second = structuredClone(source.periods[0]);
  second.id = "second";
  second.termKind = "second";
  second.school.classes[0].students = [
    { id: "other", name: "هنرجوی دیگر", code: "OTHER" },
  ];
  second.sessions[0].roster = second.school.classes[0].students;
  second.sessions[0].attendance = { other: "present" };
  source.periods.push(second);
  const f = fixture({ rows: [row(source)] });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  await f.change("deputyClass", "class");
  await f.change("deputyStudent", "student");
  await f.change("deputyTerm", "second");
  assert.match(f.host.innerHTML, /value="student" selected/);
  const printed = f.host.innerHTML.slice(
    f.host.innerHTML.indexOf('<div id="deputyPrintable"'),
  );
  assert.doesNotMatch(printed, /class="ed-session"|هنرجوی دیگر/);
  assert.match(printed, /جلسه‌ای در این محدوده نیست/);
});

test("changing class or source clears student selection even when local student IDs are reused", async () => {
  const source = packet();
  source.periods[0].school.classes.push({
    ...structuredClone(source.periods[0].school.classes[0]),
    id: "class-two",
    name: "کلاس دیگر",
  });
  const incoming = packet();
  incoming.sender.code = "other";
  const f = fixture({
    rows: [row(source), { ...row(incoming), key: "stream-b" }],
  });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  await f.change("deputyClass", "class");
  await f.change("deputyStudent", "student");
  await f.change("deputyClass", "class-two");
  let choices = f.host.innerHTML.match(
    /<select id="deputyStudent"[^>]*>(.*?)<\/select>/s,
  )[1];
  assert.match(choices, /value="" selected/);
  await f.change("deputyStudent", "student");
  await f.change("deputySource", "stream-b");
  assert.match(f.host.innerHTML, /id="deputyStudent" disabled/);
});

test("same-source student or class removal blocks report and print until an explicit audience selection", async () => {
  const source = packet();
  const f = fixture({ rows: [row(source)] });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  await f.change("deputyClass", "class");
  await f.change("deputyStudent", "student");
  source.periods[0].school.classes[0].students = [
    { id: "other", name: "اطلاعات هنرجوی دیگر" },
  ];
  source.periods[0].sessions = [];
  await f.context.EduDeputyUI.refresh();
  assert.match(f.host.innerHTML, /هنرجوی انتخاب‌شده در فایل جدید نیست/);
  assert.match(
    f.host.innerHTML,
    /value="student" selected>هنرجوی انتخاب‌شده دیگر موجود نیست/,
  );
  assert.doesNotMatch(f.host.innerHTML, /id="deputyPrintable"/);
  assert.match(f.host.innerHTML, /data-deputy-action="print"[^>]*disabled/);
  await f.click("print");
  await f.change("deputyStudent", "");
  assert.match(f.host.innerHTML, /id="deputyPrintable"/);
  source.periods[0].school.classes = [];
  await f.context.EduDeputyUI.refresh();
  assert.match(f.host.innerHTML, /کلاس انتخاب‌شده در فایل جدید نیست/);
  assert.doesNotMatch(f.host.innerHTML, /id="deputyPrintable"/);
  await f.change("deputyClass", "");
  assert.match(f.host.innerHTML, /id="deputyPrintable"/);
});

test("external restore removing the selected source cannot automatically broaden an individual report to another source", async () => {
  const old = packet();
  const incoming = packet();
  incoming.sender.code = "other-source";
  incoming.periods[0].school.classes[0].students[0].name =
    "PRIVATE OTHER STUDENT";
  incoming.periods[0].sessions[0].roster[0].name = "PRIVATE OTHER STUDENT";
  const rows = [row(old)];
  const f = fixture({ rows });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  await f.change("deputyClass", "class");
  await f.change("deputyStudent", "student");
  rows.splice(0, 1, { ...row(incoming), key: "stream-b" });
  await f.context.EduDeputyUI.refresh();
  assert.match(
    f.host.innerHTML,
    /value="stream" selected>پروندهٔ انتخاب‌شده دیگر در کارتابل نیست/,
  );
  assert.match(f.host.innerHTML, /فرستنده و مخاطب گزارش را دوباره انتخاب کنید/);
  assert.doesNotMatch(
    f.host.innerHTML,
    /id="deputyPrintable"|PRIVATE OTHER STUDENT/,
  );
  await f.click("print");
  await f.change("deputySource", "stream-b");
  assert.match(f.host.innerHTML, /id="deputyPrintable"/);
  assert.match(f.host.innerHTML, /id="deputyStudent" disabled/);
});

test("same-code physical source rebinding cannot silently reuse an individual target, but a new second term is allowed", async () => {
  const source = packet();
  const f = fixture({ rows: [row(source)] });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  await f.change("deputyClass", "class");
  await f.change("deputyStudent", "student");
  const second = structuredClone(source.periods[0]);
  second.id = "second-original";
  second.termKind = "second";
  source.periods.push(second);
  await f.context.EduDeputyUI.refresh();
  assert.match(f.host.innerHTML, /id="deputyPrintable"/);
  assert.doesNotMatch(
    f.host.innerHTML,
    /شناسهٔ منبع مخاطب در بازیابی جدید تغییر کرده است/,
  );
  source.school.id = "different-school-origin";
  source.periods[0].id = "different-first-origin";
  source.periods[0].school.classes[0].students[0].name =
    "PRIVATE REBOUND PERSON";
  source.periods[0].sessions[0].roster[0].name = "PRIVATE REBOUND PERSON";
  await f.context.EduDeputyUI.refresh();
  assert.match(
    f.host.innerHTML,
    /شناسهٔ منبع مخاطب در بازیابی جدید تغییر کرده است/,
  );
  assert.doesNotMatch(f.host.innerHTML, /id="deputyPrintable"/);
  assert.match(f.host.innerHTML, /data-deputy-action="print"[^>]*disabled/);
  await f.click("print");
  await f.change("deputyStudent", "student");
  assert.match(f.host.innerHTML, /id="deputyPrintable"/);
});

test("deputy calendar adapter does not retain its former independent popup or manual input parser", () => {
  const adapter = fs.readFileSync(
    path.join(__dirname, "../src/deputy/calendar.js"),
    "utf8",
  );
  const app = fs.readFileSync(
    path.join(__dirname, "../src/deputy/app.js"),
    "utf8",
  );
  const css = fs.readFileSync(
    path.join(__dirname, "../src/styles/deputy.css"),
    "utf8",
  );
  assert.doesNotMatch(
    adapter,
    /function (?:parseJalali|calendarDialog|calendarKeys|shiftCalendarMonth)|jalaliMonths|deputyDateDialog/,
  );
  assert.match(app, /root\.initShamsiPickers\(\)/);
  assert.match(app, /root\.syncShamsiDisabledInputs\(\)/);
  assert.doesNotMatch(
    css,
    /ed-calendar-dialog|ed-calendar-days|ed-calendar-header/,
  );
});

test("shared native date change preserves read-only proxy and updates only output plus both field errors", async () => {
  const f = fixture({ rows: [row()] });
  await f.context.EduDeputyUI.start();
  await f.tab("reports");
  const rootHTML = f.host.innerHTML;
  const output = { innerHTML: "previous derived report" };
  f.nodes.set("deputyReportOutput", output);
  const from = f.field("deputyFrom", "2026-11-01");
  const to = f.field("deputyTo", "");
  const fromProxy = f.field("deputyFrom-shamsi");
  const toProxy = f.field("deputyTo-shamsi");
  fromProxy.dataset = {};
  toProxy.dataset = {};
  fromProxy.readOnly = true;
  toProxy.readOnly = true;
  const print = { disabled: true };
  const attributes = new Map();
  let focusCalls = 0;
  fromProxy.focus = () => {
    focusCalls++;
  };
  fromProxy.setAttribute = (name, value) =>
    attributes.set("fromProxy:" + name, value);
  toProxy.setAttribute = (name, value) =>
    attributes.set("toProxy:" + name, value);
  from.setAttribute = (name, value) => attributes.set("from:" + name, value);
  to.setAttribute = (name, value) => attributes.set("to:" + name, value);
  f.host.querySelector = () => print;
  f.nodes.set("deputyFromHint", {
    textContent: "",
    classList: { toggle() {} },
  });
  f.nodes.set("deputyToHint", { textContent: "", classList: { toggle() {} } });
  f.handlers.change({ target: from });
  await f.flush();
  assert.equal(f.host.innerHTML, rootHTML);
  assert.equal(f.nodes.get("deputyFrom-shamsi"), fromProxy);
  assert.equal(fromProxy.value, "۱۴۰۵/۰۸/۱۰");
  assert.equal(from.value, "2026-11-01");
  assert.equal(fromProxy.readOnly, true);
  assert.equal(focusCalls, 0);
  assert.match(output.innerHTML, /id="deputyPrintable"/);
  assert.equal(print.disabled, false);
  from.value = "2026-11-04";
  f.handlers.change({ target: from });
  await f.flush();
  to.value = "2026-11-01";
  f.handlers.change({ target: to });
  await f.flush();
  assert.doesNotMatch(output.innerHTML, /id="deputyPrintable"/);
  assert.equal(attributes.get("fromProxy:aria-invalid"), "true");
  assert.equal(attributes.get("toProxy:aria-invalid"), "true");
  assert.equal(print.disabled, true);
  to.value = "2026-11-06";
  f.handlers.change({ target: to });
  await f.flush();
  assert.match(output.innerHTML, /id="deputyPrintable"/);
  assert.equal(attributes.get("fromProxy:aria-invalid"), "false");
  assert.equal(attributes.get("toProxy:aria-invalid"), "false");
  assert.equal(print.disabled, false);
  await f.click("calendar-clear", { field: "from" });
  assert.equal(from.value, "");
  assert.equal(fromProxy.value, "");
  assert.equal(Object.hasOwn(fromProxy.dataset, "jy"), false);
  assert.equal(f.host.innerHTML, rootHTML);
});

test("home contains receipt only, files are separate, and backup is a modal from every section", async () => {
  const f = fixture({ rows: [row(packet())] });
  await f.context.EduDeputyUI.start();
  assert.doesNotMatch(
    f.host.innerHTML,
    /deputyHomeButton|ed-overview-card|ed-inbox-card/,
  );
  assert.match(f.host.innerHTML, /id="deputyImportFile"/);
  await f.tab("files");
  assert.match(f.host.innerHTML, /ed-inbox-card/);
  assert.doesNotMatch(f.host.innerHTML, /id="deputyImportFile"/);
  await f.tab("reports");
  await f.click("open-backups");
  assert.equal(f.context.EduDeputyUI.status().tab, "reports");
  assert.equal(f.nodes.get("deputyBackupDialog").open, true);
  await f.click("close-backups");
  assert.equal(f.nodes.get("deputyBackupDialog").open, false);
  assert.equal(f.calls.restore, 0);
});

test("deputy update preparation rejects unconfirmed import and unsaved followup work", async () => {
  const f = fixture({ rows: [row(packet())] });
  await f.context.EduDeputyUI.start();
  assert.equal(await f.context.EduDeputyUI.prepareForUpdate(), true);
  await f.file("deputyImportFile", packet());
  await assert.rejects(
    () => f.context.EduDeputyUI.prepareForUpdate(),
    /بازبینی/,
  );
  await f.click("cancel-preview");
  await f.tab("followups");
  f.handlers.input({ target: { id: "deputyNoteText", value: "unsaved note" } });
  await assert.rejects(
    () => f.context.EduDeputyUI.prepareForUpdate(),
    /یادداشت/,
  );
  assert.equal(f.calls.commit, 0);
  assert.equal(f.calls.restore, 0);
});
