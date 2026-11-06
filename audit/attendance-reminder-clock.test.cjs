"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture({ today = "2026-11-06" } = {}) {
  let day = today,
    reads = 0,
    modalOpen = false,
    assessmentDraft = false,
    readRecords = null;
  const documentListeners = new Map(),
    windowListeners = new Map(),
    intervals = [],
    rendered = [],
    region = { isConnected: true, innerHTML: "" },
    modal = { classList: { contains: () => !modalOpen } },
    modalBody = { firstElementChild: { isConnected: true } },
    source = {
      settings: {
        academicYear: "1405-1406",
        weekStartDate: "2026-10-24",
      },
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      periods: 1,
      schools: [
        {
          id: "school",
          name: "Synthetic school",
          classes: [
            {
              id: "classroom",
              name: "Synthetic class",
              students: [{ id: "student", name: "Synthetic student" }],
              lessons: [{ id: "lesson", name: "Synthetic lesson" }],
            },
          ],
        },
      ],
      masterSchedule: Object.fromEntries(
        Array.from({ length: 7 }, (_, weekday) => [
          weekday + "-0-all",
          { schoolId: "school", classId: "classroom", lessonId: "lesson" },
        ]),
      ),
      sessions: [],
      notHeldSessions: [],
    },
    listen = (listeners, name, callback) => {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    forbidden = () => {
      assert.fail("the passive reminder clock must not write or open a modal");
    },
    context = vm.createContext({
      ready: true,
      busy: false,
      drafts: new Map(),
      assessmentContext: { hasDrafts: () => assessmentDraft },
      fileMode: false,
      periodLoading: false,
      resetBusy: false,
      connectionRetired: false,
      blocked: false,
      isAuthenticated: true,
      connection: {},
      installationToken: "clock-installation",
      workspace: {
        id: "active-term",
        year: "1405-1406",
        termKind: "first",
        revision: 1,
      },
      state: { view: "schools" },
      db: source,
      writer: Promise.resolve(),
      todayISO: () => day,
      decodeWorkspaceRecords: (data) => ({ data }),
      allFrom: async () => [context.workspace],
      esc: (value) => String(value).replace(/</g, "&lt;"),
      renderAttendanceReminders(model) {
        rendered.push(model);
        return "range:" + model.start + "/" + model.end;
      },
      lockControls() {},
      flushDrafts: forbidden,
      saveDBV24: forbidden,
      showModal: forbidden,
      closeModal: forbidden,
      installWorkspaceActions() {},
      installGradeEvents() {},
      channel: null,
      beforeReportPrint() {},
      setInterval(callback, milliseconds) {
        intervals.push({ callback, milliseconds });
        return intervals.length;
      },
      document: {
        visibilityState: "visible",
        getElementById: (id) =>
          ({ attendanceReminderRegion: region, modal, modalBody })[id] || null,
        addEventListener: (name, callback) =>
          listen(documentListeners, name, callback),
      },
      window: {
        addEventListener: (name, callback) =>
          listen(windowListeners, name, callback),
      },
    });
  for (const name of [
    "domain/calendar.js",
    "domain/academic-year.js",
    "domain/data-boundary.js",
    "domain/session-slots.js",
    "domain/attendance-reminders.js",
    "workspace/reports/snapshots.js",
    "workspace/sessions/reminders.js",
    "workspace/ui/install.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
      context,
    );
  context.readAnnualRecordSets = async () => {
    reads++;
    if (readRecords) return readRecords();
    return { periods: [{ ...context.workspace }], recordSets: [source] };
  };
  return {
    c: context,
    region,
    modalBody,
    intervals,
    documentListeners,
    windowListeners,
    rendered,
    get reads() {
      return reads;
    },
    day(value) {
      day = value;
    },
    modal(value) {
      modalOpen = value;
    },
    assessmentDraft(value) {
      assessmentDraft = value;
    },
    reader(callback) {
      readRecords = callback;
    },
    async tick() {
      assert.equal(intervals.length, 1);
      return intervals[0].callback();
    },
    async emit(listeners, name) {
      for (const callback of listeners.get(name) || []) await callback();
      // visibility's pre-existing handler deliberately does not await refresh.
      await new Promise(setImmediate);
    },
  };
}

test("installation owns one minute timer and one visibility/focus listener even when installed twice", async () => {
  const f = fixture();
  f.c.installUI();
  f.c.installUI();
  f.c.installAttendanceReminderClock();
  assert.equal(f.intervals.length, 1);
  assert.equal(f.intervals[0].milliseconds, 60_000);
  assert.equal(f.documentListeners.get("visibilitychange").length, 1);
  assert.equal(f.windowListeners.get("focus").length, 1);
  await f.tick();
  assert.equal(f.reads, 0, "installation does not initiate a record scan");
});

test("an unchanged local day does not rescan records or replace reminder content", async () => {
  const f = fixture();
  await f.c.refreshAttendanceReminders();
  f.c.installAttendanceReminderClock();
  const initial = f.region.innerHTML;
  for (let minute = 0; minute < 120; minute++) await f.tick();
  assert.equal(f.reads, 1);
  assert.equal(f.rendered.length, 1);
  assert.equal(f.region.innerHTML, initial);
  await f.emit(f.windowListeners, "focus");
  assert.equal(f.reads, 1, "same-day focus is also a cheap check");
});

for (const [before, after, end] of [
  ["2026-11-06", "2026-11-07", "2026-11-06"],
  ["2026-11-07", "2026-11-08", "2026-11-07"],
  ["2026-12-31", "2027-01-01", "2026-12-31"],
  ["2027-03-20", "2027-03-21", "2027-03-20"],
])
  test(`local date rollover ${before} → ${after} extends through yesterday without resetting academic start`, async () => {
    const f = fixture({ today: before });
    await f.c.refreshAttendanceReminders();
    f.c.installAttendanceReminderClock();
    f.day(after);
    await f.tick();
    assert.equal(f.reads, 2);
    const model = f.rendered.at(-1);
    assert.equal(
      model.start,
      f.c.EduAcademicYear.range(f.c.workspace.year).start,
    );
    assert.equal(model.end, end);
    assert.ok(model.items.every((item) => item.date < after));
    assert.equal(f.region.innerHTML, "range:" + model.start + "/" + end);
    await f.tick();
    assert.equal(f.reads, 2, "the same new date is scanned only once");
  });

test("academic-year end remains a hard upper boundary when days continue to pass", async () => {
  const f = fixture(),
    bounds = f.c.EduAcademicYear.range(f.c.workspace.year),
    addDays = (date, count) =>
      new Date(Date.parse(date + "T00:00:00Z") + count * 86_400_000)
        .toISOString()
        .slice(0, 10);
  f.day(addDays(bounds.end, 1));
  await f.c.refreshAttendanceReminders();
  f.c.installAttendanceReminderClock();
  f.day(addDays(bounds.end, 8));
  await f.tick();
  const model = f.rendered.at(-1);
  assert.equal(model.start, bounds.start);
  assert.equal(model.end, bounds.end);
  assert.ok(model.items.every((item) => item.date <= bounds.end));
  assert.ok(model.scannedDays <= 366);
});

for (const [name, pause, resume] of [
  [
    "hidden document",
    (f) => (f.c.document.visibilityState = "hidden"),
    (f) => (f.c.document.visibilityState = "visible"),
  ],
  [
    "non-home page",
    (f) => (f.c.state.view = "lesson"),
    (f) => (f.c.state.view = "schools"),
  ],
  [
    "not-ready workspace",
    (f) => (f.c.ready = false),
    (f) => (f.c.ready = true),
  ],
  [
    "disconnected reminder region",
    (f) => (f.region.isConnected = false),
    (f) => (f.region.isConnected = true),
  ],
  [
    "loading workspace",
    (f) => (f.c.periodLoading = true),
    (f) => (f.c.periodLoading = false),
  ],
  [
    "reset in progress",
    (f) => (f.c.resetBusy = true),
    (f) => (f.c.resetBusy = false),
  ],
  [
    "retired connection",
    (f) => (f.c.connectionRetired = true),
    (f) => (f.c.connectionRetired = false),
  ],
  [
    "blocked workspace",
    (f) => (f.c.blocked = true),
    (f) => (f.c.blocked = false),
  ],
  ["file mode", (f) => (f.c.fileMode = true), (f) => (f.c.fileMode = false)],
  [
    "locked workspace",
    (f) => {
      f.c.db.settings.password = "synthetic-password";
      f.c.isAuthenticated = false;
    },
    (f) => {
      delete f.c.db.settings.password;
    },
  ],
  ["write in progress", (f) => (f.c.busy = true), (f) => (f.c.busy = false)],
  ["open modal", (f) => f.modal(true), (f) => f.modal(false)],
  [
    "unfinished session draft",
    (f) => f.c.drafts.set("score", { value: "unfinished" }),
    (f) => f.c.drafts.clear(),
  ],
  [
    "unfinished assessment draft",
    (f) => f.assessmentDraft(true),
    (f) => f.assessmentDraft(false),
  ],
])
  test(`${name} postpones the date scan and catches up when readable idle home returns`, async () => {
    const f = fixture();
    await f.c.refreshAttendanceReminders();
    f.c.installAttendanceReminderClock();
    f.day("2026-11-07");
    pause(f);
    const before = JSON.stringify(f.c.db),
      content = f.region.innerHTML,
      currentModal = f.modalBody.firstElementChild,
      authentication = f.c.isAuthenticated,
      drafts = [...f.c.drafts];
    await f.tick();
    await f.emit(f.windowListeners, "focus");
    assert.equal(f.reads, 1);
    assert.equal(f.region.innerHTML, content);
    assert.equal(JSON.stringify(f.c.db), before);
    assert.equal(f.modalBody.firstElementChild, currentModal);
    assert.equal(f.c.isAuthenticated, authentication);
    assert.deepEqual([...f.c.drafts], drafts);
    resume(f);
    await f.tick();
    assert.equal(f.reads, 2);
    assert.equal(f.rendered.at(-1).end, "2026-11-06");
    assert.equal(f.modalBody.firstElementChild, currentModal);
    assert.equal(f.c.isAuthenticated, authentication);
  });

test("focus catches up a throttled timer without duplicating the next minute scan", async () => {
  const f = fixture();
  await f.c.refreshAttendanceReminders();
  f.c.installAttendanceReminderClock();
  f.day("2026-11-14");
  await f.emit(f.windowListeners, "focus");
  assert.equal(f.reads, 2);
  assert.equal(f.rendered.at(-1).end, "2026-11-13");
  await f.tick();
  assert.equal(f.reads, 2);
});

test("the existing visible-state refresh still runs on the same day and synchronizes the clock", async () => {
  const f = fixture();
  await f.c.refreshAttendanceReminders();
  f.c.installAttendanceReminderClock();
  f.c.document.visibilityState = "hidden";
  await f.emit(f.documentListeners, "visibilitychange");
  assert.equal(f.reads, 1);
  f.c.document.visibilityState = "visible";
  await f.emit(f.documentListeners, "visibilitychange");
  assert.equal(f.reads, 2);
  f.day("2026-11-07");
  await f.emit(f.documentListeners, "visibilitychange");
  assert.equal(f.reads, 3);
  assert.equal(f.rendered.at(-1).end, "2026-11-06");
  await f.tick();
  assert.equal(f.reads, 3);
});

test("ordinary home rendering already refreshed on the new date prevents a duplicate clock scan", async () => {
  const f = fixture();
  await f.c.refreshAttendanceReminders();
  f.c.installAttendanceReminderClock();
  f.day("2026-11-07");
  await f.c.refreshAttendanceReminders();
  await f.tick();
  assert.equal(f.reads, 2);
  assert.equal(f.rendered.at(-1).end, "2026-11-06");
});

test("a rollover refresh retains the existing generation guard against an older pending read", async () => {
  const f = fixture(),
    pending = [];
  f.c.installAttendanceReminderClock();
  f.reader(
    () =>
      new Promise((resolve) => {
        pending.push(() =>
          resolve({
            periods: [{ ...f.c.workspace }],
            recordSets: [f.c.db],
          }),
        );
      }),
  );
  const oldRead = f.c.refreshAttendanceReminders();
  await new Promise(setImmediate);
  assert.equal(pending.length, 1);
  f.day("2026-11-07");
  const rollover = f.tick();
  await new Promise(setImmediate);
  assert.equal(pending.length, 2);
  pending[1]();
  await rollover;
  const current = f.region.innerHTML;
  pending[0]();
  await oldRead;
  assert.equal(f.rendered.length, 1);
  assert.equal(f.rendered[0].end, "2026-11-06");
  assert.equal(f.region.innerHTML, current);
  assert.doesNotMatch(current, /notice/);
});

test("future academic-year home stays empty without a record scan as its first day arrives", async () => {
  const f = fixture(),
    start = f.c.EduAcademicYear.range(f.c.workspace.year).start;
  f.day(
    new Date(Date.parse(start + "T00:00:00Z") - 86_400_000)
      .toISOString()
      .slice(0, 10),
  );
  await f.c.refreshAttendanceReminders();
  f.c.installAttendanceReminderClock();
  f.day(start);
  await f.tick();
  assert.equal(f.reads, 0);
  assert.equal(f.region.innerHTML, "");
  f.day(
    new Date(Date.parse(start + "T00:00:00Z") + 86_400_000)
      .toISOString()
      .slice(0, 10),
  );
  await f.tick();
  assert.equal(f.reads, 1);
  assert.equal(f.rendered.at(-1).start, start);
  assert.equal(f.rendered.at(-1).end, start);
});
