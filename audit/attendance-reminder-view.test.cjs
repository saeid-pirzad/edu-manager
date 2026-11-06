"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

function fixture() {
  const context = vm.createContext({
    workspace: { id: "active" },
    esc: (value) =>
      String(value ?? "").replace(
        /[&<>"']/g,
        (char) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[char],
      ),
    faDate: (date) => "شمسی:" + date,
    EduIcons: { html: () => '<svg aria-hidden="true"></svg>' },
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/workspace/sessions/reminder-view.js"),
      "utf8",
    ),
    context,
  );
  return context;
}

function item(overrides = {}) {
  return {
    key: "reminder-key",
    kind: "missing",
    date: "2026-11-04",
    day: 4,
    period: 0,
    schoolName: "مدرسه آزمون",
    className: "کلاس آزمون",
    lessonName: "درس آزمون",
    unknown: 3,
    total: 20,
    sourcePeriodId: "active",
    sessionId: "session-one",
    sessions: [],
    ...overrides,
  };
}

test("home reminder card shows at most three latest items while full list keeps all items", () => {
  const c = fixture(),
    items = Array.from({ length: 8 }, (_, index) =>
      item({
        key: "key-" + index,
        date: "2026-11-0" + (index + 1),
        className: "class-" + index,
      }),
    ),
    model = { start: "2026-09-23", end: "2026-11-08", items };
  const card = c.renderAttendanceReminders(model),
    list = c.attendanceReminderListHtml(model);
  assert.equal(
    (card.match(/data-workspace-action="attendance-reminder-open"/g) || [])
      .length,
    3,
  );
  assert.equal(
    (list.match(/data-workspace-action="attendance-reminder-open"/g) || [])
      .length,
    8,
  );
  assert.ok(card.indexOf("class-7") < card.indexOf("class-6"));
  assert.doesNotMatch(card, /class-0/);
  assert.match(card, /data-workspace-action="attendance-reminders-all"/);
  assert.match(card, /data-workspace-action="attendance-reminders-refresh"/);
  assert.equal(items[0].key, "key-0");
});

test("reminder content and reference attributes are escaped without leaking student names", () => {
  const c = fixture(),
    unsafe = item({
      key: 'key" onclick="alert(1)',
      schoolName: '<img src="x" onerror="alert(1)">',
      className: "<script>bad()</script>",
      lessonName: "درس & آزمون",
      students: [{ name: "نام خصوصی هنرجو" }],
      presentNames: ["نام خصوصی حاضر"],
    });
  for (const html of [
    c.renderAttendanceReminders({ items: [unsafe] }),
    c.attendanceReminderListHtml({ items: [unsafe] }),
    c.attendanceReminderDialogHtml(unsafe),
  ]) {
    assert.doesNotMatch(html, /<script>|<img|نام خصوصی/);
    assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
    assert.match(html, /key&quot; onclick=&quot;alert\(1\)/);
  }
});

test("only missing sessions offer not-held marking; incomplete sessions only offer completion", () => {
  const c = fixture(),
    missing = c.attendanceReminderDialogHtml(item()),
    incomplete = c.attendanceReminderDialogHtml(item({ kind: "incomplete" }));
  assert.match(missing, /data-workspace-action="attendance-reminder-not-held"/);
  assert.match(missing, /این انتخاب، غیبت هنرجویان را ثبت نمی‌کند/);
  assert.match(
    incomplete,
    /data-workspace-action="attendance-reminder-record"/,
  );
  assert.match(incomplete, /data-session="session-one"/);
  assert.match(incomplete, /data-workspace="active"/);
  assert.doesNotMatch(incomplete, /attendance-reminder-not-held|حذف/);
  assert.match(incomplete, /۳ نفر از ۲۰ نفر/);
});

test("conflicting reminders route each actual session by its own workspace and cannot mark not-held", () => {
  const c = fixture(),
    html = c.attendanceReminderDialogHtml(
      item({
        kind: "conflict",
        sessions: [
          { sourcePeriodId: "first", sessionId: "one" },
          { sourcePeriodId: "second", sessionId: "two" },
        ],
      }),
    );
  assert.match(html, /data-session="one" data-workspace="first"/);
  assert.match(html, /data-session="two" data-workspace="second"/);
  assert.equal(
    (html.match(/data-workspace-action="attendance-reminder-record"/g) || [])
      .length,
    2,
  );
  assert.doesNotMatch(html, /attendance-reminder-not-held/);
});

test("not-held history distinguishes restoring the active workspace from opening another workspace", () => {
  const c = fixture(),
    markers = [
      item({ id: "active-marker", sourcePeriodId: "active" }),
      item({ id: "other-marker", sourcePeriodId: "other", closed: true }),
    ],
    html = c.renderNotHeldRemindersHtml(markers),
    card = c.renderAttendanceReminders({ items: [], notHeld: markers });
  assert.match(
    html,
    /data-mutating="1" data-workspace-action="attendance-reminder-restore" data-key="active-marker" data-workspace="active"/,
  );
  assert.match(
    html,
    /data-workspace-action="attendance-reminder-restore" data-key="other-marker" data-workspace="other"/,
  );
  assert.match(html, /بازگرداندن یادآور/);
  assert.match(html, /باز کردن برای اصلاح/);
  assert.match(html, /نوبت بسته/);
  assert.match(card, /data-workspace-action="attendance-reminders-not-held"/);
});

test("empty state never manufactures a session, absence or a clock time", () => {
  const c = fixture(),
    empty = c.renderAttendanceReminders({ items: [] }),
    dialog = c.attendanceReminderDialogHtml(item({ period: 2 }));
  assert.equal(empty, "");
  assert.doesNotMatch(
    empty,
    /attendance-reminder-open|attendance-reminders-all/,
  );
  assert.match(dialog, /زنگ ۳/);
  assert.doesNotMatch(dialog, /\d{1,2}:\d{2}/);
});

for (const kind of ["pending", "not-held"]) {
  test(`${kind} list renders only rows 51–100 on the second page and retains total count`, () => {
    const c = fixture(),
      rows = Array.from({ length: 120 }, (_, index) =>
        item({ key: "key-" + index, id: "key-" + index }),
      ),
      render = (page) =>
        kind === "pending"
          ? c.attendanceReminderListHtml({ items: rows }, page)
          : c.renderNotHeldRemindersHtml(rows, page),
      html = render(1),
      action =
        kind === "pending"
          ? "attendance-reminder-open"
          : "attendance-reminder-restore";
    assert.equal(
      (
        html.match(new RegExp('data-workspace-action="' + action + '"', "g")) ||
        []
      ).length,
      50,
    );
    assert.match(html, /data-key="key-50"/);
    assert.match(html, /data-key="key-99"/);
    assert.doesNotMatch(html, /data-key="key-49"|data-key="key-100"/);
    assert.match(html, /موارد ۵۱ تا ۱۰۰ از ۱۲۰/);
    assert.match(html, /صفحهٔ ۲ از ۳/);
    assert.match(
      html,
      /data-workspace-action="attendance-reminders-page" data-page="0"/,
    );
    assert.match(
      html,
      /data-workspace-action="attendance-reminders-page" data-page="2"/,
    );
    const last = render(999);
    assert.match(last, /موارد ۱۰۱ تا ۱۲۰ از ۱۲۰/);
    assert.match(last, /data-page="2" disabled>بعدی/);
    assert.match(render(-1), /data-page="0" disabled>قبلی/);
  });
}
