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

function historyCount(html) {
  return (
    html.match(
      /attendance-reminder-history-count[^>]*>([\s\S]*?)<\/span>/,
    )?.[1] || ""
  )
    .replace(/<[^>]*>/g, "")
    .trim();
}

function historyKeys(html) {
  return Array.from(
    html.matchAll(
      /data-workspace-action="attendance-reminder-restore" data-key="([^"]+)"/g,
    ),
    (match) => match[1],
  );
}

function historyDates(html) {
  return Array.from(
    html.matchAll(
      /class="attendance-reminder-history-day" data-date="([^"]+)"/g,
    ),
    (match) => match[1],
  );
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

test("reminder footer separates action labels and Persian counts in an accessible group", () => {
  const c = fixture(),
    model = {
      items: Array.from({ length: 4 }, (_, index) =>
        item({ key: "key-" + index }),
      ),
      notHeld: [{ id: "not-held-one" }, { id: "not-held-two" }],
    },
    before = JSON.stringify(model),
    html = c.renderAttendanceReminders(model),
    footer = html.slice(
      html.indexOf('<footer class="attendance-reminders-footer">'),
    );
  assert.match(footer, /role="group" aria-label="فهرست‌های پیگیری حضور‌وغیاب"/);
  assert.equal((footer.match(/data-ui-icon="none"/g) || []).length, 2);
  assert.equal(
    (footer.match(/<svg aria-hidden="true"><\/svg>/g) || []).length,
    2,
  );
  assert.match(footer, /attendance-reminders-action-label">همهٔ موارد<\/span>/);
  assert.match(
    footer,
    /attendance-reminders-action-label">برگزارنشده‌ها<\/span>/,
  );
  assert.match(
    footer,
    /<bdi class="attendance-reminders-action-count">۴<\/bdi>/,
  );
  assert.match(
    footer,
    /<bdi class="attendance-reminders-action-count">۲<\/bdi>/,
  );
  assert.match(footer, /<\/div><small>نمایش ۳ مورد اخیر<\/small>/);
  assert.equal(JSON.stringify(model), before);
});

for (const historyOnly of [true, false])
  test(`reminder footer keeps only the relevant ${historyOnly ? "history" : "all items"} action`, () => {
    const c = fixture(),
      html = c.renderAttendanceReminders({
        items: historyOnly ? [] : [item()],
        notHeld: historyOnly ? [{ id: "marker" }] : [],
      }),
      footer = html.slice(
        html.indexOf('<footer class="attendance-reminders-footer">'),
      );
    assert.equal((footer.match(/<button /g) || []).length, 1);
    assert.match(
      footer,
      /<bdi class="attendance-reminders-action-count">۱<\/bdi>/,
    );
    assert.equal(
      footer.includes('data-workspace-action="attendance-reminders-all"'),
      !historyOnly,
    );
    assert.equal(
      footer.includes('data-workspace-action="attendance-reminders-not-held"'),
      historyOnly,
    );
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

test("missing sessions offer not-held marking; content-bearing incomplete sessions only offer completion", () => {
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

test("unstarted empty sessions explain the protected replacement and offer both held and not-held choices", () => {
  const c = fixture(),
    row = c.attendanceReminderRowHtml(item({ kind: "empty" })),
    html = c.attendanceReminderDialogHtml(item({ kind: "empty" }));
  assert.match(row, /attendance-reminder-item is-empty is-missing/);
  assert.match(row, /ثبت شروع نشده/);
  assert.doesNotMatch(row, /ناقص/);
  assert.match(html, /attendance-reminder-dialog is-empty is-missing/);
  assert.match(html, /ثبت شروع نشده/);
  assert.match(html, /جلسه فقط باز شده/);
  assert.match(html, /هیچ حضور، نمره یا فعالیتی ثبت نشده/);
  assert.match(html, /با تأیید شما، فقط همین رکورد خالی/);
  assert.match(html, /این انتخاب، غیبت هنرجویان را ثبت نمی‌کند/);
  assert.match(html, /جلسه برگزار شده/);
  assert.match(html, /جلسه برگزار نشده/);
  assert.match(
    html,
    /data-workspace-action="attendance-reminder-record" data-key="reminder-key" data-session="session-one" data-workspace="active"/,
  );
  assert.match(
    html,
    /data-mutating="1" data-workspace-action="attendance-reminder-not-held" data-key="reminder-key" data-session="session-one" data-workspace="active"/,
  );
  assert.match(html, /ویرایش را فعال کنید/);
  assert.match(html, /این زنگ برگزار نشده است<\/button>/);
  assert.doesNotMatch(html, /<svg|ناقص/);
});

test("an empty peer session offers navigation for status review without claiming a current-workspace mutation", () => {
  const c = fixture(),
    html = c.attendanceReminderDialogHtml(
      item({ kind: "empty", sourcePeriodId: "peer", sessionId: "peer-one" }),
    ),
    buttons = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.match(html, /باز کردن برای تعیین وضعیت/);
  assert.match(
    html,
    /data-workspace-action="attendance-reminder-not-held" data-key="reminder-key" data-session="peer-one" data-workspace="peer"/,
  );
  assert.ok(
    buttons.some(
      (button) =>
        button.includes(
          'data-workspace-action="attendance-reminder-not-held"',
        ) && !button.includes("data-mutating"),
    ),
  );
  assert.doesNotMatch(html, /data-mutating/);
});

test("empty review escapes its historical identity and never renders any roster or score details", () => {
  const c = fixture(),
    html = c.attendanceReminderDialogHtml(
      item({
        kind: "empty",
        key: 'key" onclick="bad()',
        sourcePeriodId: 'peer" onclick="bad()',
        sessionId: 'session" onclick="bad()',
        className: "<script>bad()</script>",
        roster: [{ name: "نام خصوصی هنرجو" }],
        scores: [{ text: "فعالیت خصوصی" }],
      }),
    );
  assert.doesNotMatch(html, /<script>|نام خصوصی هنرجو|فعالیت خصوصی/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(html, /data-session="session&quot; onclick=&quot;bad\(\)"/);
  assert.match(html, /data-workspace="peer&quot; onclick=&quot;bad\(\)"/);
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

test("not-held history separates its date, status, class, lesson and school without changing marker records", () => {
  const c = fixture(),
    markers = [
      item({ id: "history-one", sourcePeriodId: "active" }),
      item({
        id: "history-two",
        date: "2026-11-05",
        sourcePeriodId: "other",
        closed: true,
      }),
    ],
    before = JSON.stringify(markers),
    html = c.renderNotHeldRemindersHtml(markers);
  assert.equal(JSON.stringify(markers), before);
  assert.ok(
    html.indexOf('data-key="history-two"') <
      html.indexOf('data-key="history-one"'),
  );
  assert.match(html, /attendance-reminder-history-heading/);
  assert.ok(historyCount(html).startsWith("۲"));
  for (const css of [
    "attendance-reminder-history-item",
    "attendance-reminder-history-details",
    "attendance-reminder-history-meta",
    "attendance-reminder-history-identity",
    "attendance-reminder-lesson",
    "attendance-reminder-school",
    "attendance-reminder-history-restore",
  ])
    assert.equal(
      (html.match(new RegExp(css + '(?=[\\s"])', "g")) || []).length,
      2,
      css,
    );
  for (const value of [
    "شمسی:2026-11-04",
    "زنگ ۱",
    "برگزار نشده",
    "نوبت بسته",
    "کلاس آزمون",
    "درس آزمون",
    "مدرسه آزمون",
  ])
    assert.ok(html.includes(value), value);
});

test("not-held history escapes imported marker identities and target attributes", () => {
  const c = fixture(),
    html = c.renderNotHeldRemindersHtml([
      item({
        id: 'marker" autofocus="true',
        sourcePeriodId: 'peer" onclick="bad()',
        schoolName: '<img src=x onerror="bad()">',
        className: "<script>bad()</script>",
        lessonName: "درس & آزمون",
        students: [{ name: "نام خصوصی هنرجو" }],
      }),
    ]);
  assert.doesNotMatch(html, /<script>|<img|نام خصوصی هنرجو/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(html, /درس &amp; آزمون/);
  assert.match(html, /data-key="marker&quot; autofocus=&quot;true"/);
  assert.match(html, /data-workspace="peer&quot; onclick=&quot;bad\(\)"/);
});

test("not-held history groups shuffled dates newest first and orders bells numerically within each day", () => {
  const c = fixture(),
    markers = [
      item({ id: "older-bell-one", date: "2026-11-03", period: 0 }),
      item({ id: "newer-bell-eleven", date: "2026-11-05", period: 10 }),
      item({ id: "newer-bell-three", date: "2026-11-05", period: 2 }),
      item({ id: "middle-bell-two", date: "2026-11-04", period: 1 }),
      item({ id: "newer-bell-two", date: "2026-11-05", period: 1 }),
      item({ id: "newer-bell-one", date: "2026-11-05", period: 0 }),
    ],
    before = JSON.stringify(markers),
    html = c.renderNotHeldRemindersHtml(markers);
  assert.deepEqual(historyDates(html), [
    "2026-11-05",
    "2026-11-04",
    "2026-11-03",
  ]);
  assert.deepEqual(historyKeys(html), [
    "newer-bell-one",
    "newer-bell-two",
    "newer-bell-three",
    "newer-bell-eleven",
    "middle-bell-two",
    "older-bell-one",
  ]);
  assert.match(
    html,
    /attendance-reminder-history-groups attendance-reminder-scroll/,
  );
  assert.equal(
    (html.match(/attendance-reminder-history-day-title/g) || []).length,
    3,
  );
  for (const date of historyDates(html)) {
    assert.match(
      html,
      new RegExp(
        '<time dir="ltr" datetime="' + date + '">شمسی:' + date + "</time>",
      ),
    );
    assert.equal(
      (html.match(new RegExp(">شمسی:" + date + "<", "g")) || []).length,
      1,
    );
  }
  assert.match(html, /class="attendance-reminder-date">زنگ ۱۱<\/span>/);
  assert.equal(JSON.stringify(markers), before);
});

test("equal natural-sort IDs and fallback marker keys keep a total order across shuffled inputs", () => {
  const c = fixture(),
    markers = [
      item({ id: "item-1" }),
      item({ id: "item-01" }),
      item({ id: undefined, key: "key-1" }),
      item({ id: undefined, key: "key-01" }),
    ];
  for (const rows of [markers, [...markers].reverse()])
    assert.deepEqual(historyKeys(c.renderNotHeldRemindersHtml(rows)), [
      "item-01",
      "item-1",
      "key-01",
      "key-1",
    ]);
});

test("same-day same-bell history has deterministic Persian school, class, lesson and source identity order", () => {
  const c = fixture(),
    markers = [
      item({
        id: "school-b",
        schoolName: "ب",
        className: "الف",
        lessonName: "الف",
      }),
      item({
        id: "class-b",
        schoolName: "الف",
        className: "ب",
        lessonName: "الف",
      }),
      item({
        id: "lesson-b",
        schoolName: "الف",
        className: "الف",
        lessonName: "ب",
      }),
      item({
        id: "source-other",
        schoolName: "الف",
        className: "الف",
        lessonName: "الف",
        sourcePeriodId: "other",
      }),
      item({
        id: "id-b",
        schoolName: "الف",
        className: "الف",
        lessonName: "الف",
        sourcePeriodId: "active",
      }),
      item({
        id: "id-a",
        schoolName: "الف",
        className: "الف",
        lessonName: "الف",
        sourcePeriodId: "active",
      }),
    ],
    expected = [
      "id-a",
      "id-b",
      "source-other",
      "lesson-b",
      "class-b",
      "school-b",
    ],
    before = JSON.stringify(markers);
  for (const permutation of [
    markers,
    [...markers].reverse(),
    [...markers.slice(2), ...markers.slice(0, 2)],
  ]) {
    Object.freeze(permutation);
    permutation.forEach(Object.freeze);
    const html = c.renderNotHeldRemindersHtml(permutation);
    assert.deepEqual(historyKeys(html), expected);
    assert.deepEqual(historyDates(html), ["2026-11-04"]);
    assert.match(html, /data-key="source-other" data-workspace="other"/);
    assert.match(
      html,
      /data-mutating="1" data-workspace-action="attendance-reminder-restore" data-key="id-a" data-workspace="active"/,
    );
  }
  assert.equal(JSON.stringify(markers), before);
});

test("not-held history paginates markers before grouping and repeats a split-day heading without dropping or duplicating rows", () => {
  const c = fixture(),
    markers = Array.from({ length: 105 }, (_, index) =>
      item({
        id: "boundary-" + String(index).padStart(3, "0"),
        date:
          index < 45 ? "2026-11-06" : index < 55 ? "2026-11-05" : "2026-11-04",
        className: "کلاس " + String(index).padStart(3, "0"),
      }),
    ).reverse(),
    before = JSON.stringify(markers),
    pages = [0, 1, 2].map((page) =>
      c.renderNotHeldRemindersHtml(markers, page),
    );
  assert.deepEqual(
    pages.map((html) => historyKeys(html).length),
    [50, 50, 5],
  );
  assert.deepEqual(historyDates(pages[0]), ["2026-11-06", "2026-11-05"]);
  assert.deepEqual(historyDates(pages[1]), ["2026-11-05", "2026-11-04"]);
  assert.deepEqual(historyDates(pages[2]), ["2026-11-04"]);
  assert.deepEqual(
    pages.flatMap(historyKeys),
    Array.from(
      { length: 105 },
      (_, index) => "boundary-" + String(index).padStart(3, "0"),
    ),
  );
  assert.equal(new Set(pages.flatMap(historyKeys)).size, 105);
  assert.equal(JSON.stringify(markers), before);
});

test("not-held history empty state has a zero count, helpful title and no restore action", () => {
  const c = fixture();
  for (const value of [undefined, null, []]) {
    const html = c.renderNotHeldRemindersHtml(value);
    assert.ok(historyCount(html).startsWith("۰"));
    assert.match(html, /class="[^"]*attendance-reminder-history-empty[^"]*"/);
    assert.match(html, /class="[^"]*attendance-reminders-empty[^"]*"/);
    assert.match(html, /<(?:strong|h4)>[^<]+<\/(?:strong|h4)>/);
    assert.doesNotMatch(
      html,
      /data-workspace-action="attendance-reminder-restore"|attendance-reminder-history-item/,
    );
    assert.match(html, /data-workspace-action="close"/);
    assert.match(html, /id="operationError" role="alert"/);
  }
});

test("single-page not-held history keeps its total in the header without repeating a pagination summary", () => {
  const c = fixture(),
    html = c.renderNotHeldRemindersHtml([item({ id: "single-marker" })]);
  assert.ok(historyCount(html).startsWith("۱"));
  assert.doesNotMatch(html, /attendance-reminder-pagination|موارد ۱ تا ۱ از ۱/);
  assert.match(html, /data-key="single-marker"/);
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

test("compact reminders keep the full identity and status without decorative checkmarks or arrows", () => {
  const c = fixture(),
    row = c.attendanceReminderRowHtml(item()),
    card = c.renderAttendanceReminders({
      items: [],
      notHeld: [item()],
    });
  assert.match(row, /data-ui-icon="none"/);
  for (const value of ["کلاس آزمون", "درس آزمون", "مدرسه آزمون", "زنگ ۱"])
    assert.ok(row.includes(value));
  assert.match(row, /attendance-reminder-meta/);
  assert.match(row, /attendance-reminder-status/);
  assert.doesNotMatch(row, /<svg|attendance-reminder-arrow/);
  assert.doesNotMatch(card, /attendance-reminders-symbol/);
});

test("review choices are distinct and iconless while existing sessions explain explicit editing", () => {
  const c = fixture(),
    missing = c.attendanceReminderDialogHtml(item()),
    incomplete = c.attendanceReminderDialogHtml(item({ kind: "incomplete" }));
  assert.match(missing, /attendance-reminder-dialog is-missing/);
  assert.match(missing, /attendance-reminder-summary-meta/);
  assert.match(missing, /attendance-reminder-choice is-record/);
  assert.match(missing, /جلسه برگزار شده/);
  assert.match(missing, /جلسه برگزار نشده/);
  assert.match(incomplete, /attendance-reminder-dialog is-incomplete/);
  assert.match(incomplete, /ویرایش را فعال کنید/);
  for (const html of [missing, incomplete]) {
    assert.doesNotMatch(html, /<svg/);
    assert.match(html, /data-ui-icon="none"/);
    assert.match(html, /id="operationError" role="alert"/);
  }
});

for (const kind of ["pending", "not-held"]) {
  test(`${kind} list renders only rows 51–100 on the second page and retains total count`, () => {
    const c = fixture(),
      rows = Array.from({ length: 120 }, (_, index) =>
        item({
          key: "key-" + index,
          id: "key-" + index,
          className: "class-" + String(index).padStart(3, "0"),
        }),
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
    if (kind === "not-held") assert.ok(historyCount(html).startsWith("۱۲۰"));
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
