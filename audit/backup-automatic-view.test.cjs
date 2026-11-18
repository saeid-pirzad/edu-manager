"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  const context = vm.createContext({});
  for (const key of ["document", "navigator", "localStorage", "indexedDB"])
    Object.defineProperty(context, key, {
      get() {
        throw Error("The shared view must not access " + key);
      },
    });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/ui/backup-automatic-view.js"),
      "utf8",
    ),
    context,
  );
  return context.EduBackupAutomaticView;
}

test("automatic backup view exposes a frozen presentation-only API", () => {
  const view = fixture();
  assert.deepEqual(Object.keys(view), ["html", "summaryHtml", "noticeHtml"]);
  assert.equal(Object.isFrozen(view), true);
  assert.doesNotThrow(() => view.html());
});

test("automatic backup view preserves the school disclosure and action layout", () => {
  const html = fixture().html();
  assert.match(html, /^<details class="backup-automatic">/);
  assert.match(
    html,
    /<summary><span>ذخیره خودکار<\/span><small>اختیاری<\/small><\/summary>/,
  );
  assert.match(
    html,
    /<p>فایل را یک‌بار انتخاب کنید؛ هنگام باز بودن برنامه، همان فایل به‌روز می‌شود\.<\/p>/,
  );
  assert.match(html, /class="backup-file-summary"/);
  assert.match(html, /class="single-file-notice backup-automatic-notice"/);
  assert.match(html, /class="backup-automatic-fallback" hidden/);
  assert.match(html, /class="row backup-automatic-actions"/);
  assert.deepEqual(
    [...html.matchAll(/data-backup-file-action="([^"]+)"/g)].map(
      (match) => match[1],
    ),
    ["choose", "save", "stop"],
  );
  assert.deepEqual(
    [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(
      (match) => match[1],
    ),
    ["انتخاب فایل", "ذخیره اکنون", "قطع اتصال"],
  );
  assert.equal((html.match(/<button type="button"/g) || []).length, 3);
  assert.doesNotMatch(html, /ui-button|<svg|ui-button-label/);
});

test("automatic backup summary keeps the original unselected metadata", () => {
  assert.equal(
    fixture().summaryHtml(),
    '<span class="schools-file-meta">فایل پشتیبان انتخاب نشده</span>',
  );
});

test("automatic backup summary escapes filenames and preserves their direction", () => {
  const html = fixture().summaryHtml({
    name: 'file<svg onload="bad()">&\'.json',
    needsReview: true,
  });
  assert.match(html, /<bdi class="schools-file-name" dir="auto" title="/);
  assert.match(
    html,
    /file&lt;svg onload=&quot;bad\(\)&quot;&gt;&amp;&#39;\.json/,
  );
  assert.match(html, /هنوز ذخیره نشده · نیاز به بررسی/);
  assert.doesNotMatch(html, /<svg|onload="|<time/);
});

test("automatic backup summary uses one shared Persian date and time formatter", () => {
  const savedAt = "2026-11-17T12:34:56.789Z";
  const expected = new Date(savedAt).toLocaleString("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const html = fixture().summaryHtml({ name: "MySchool.json", savedAt });
  assert.ok(html.includes(expected));
  assert.match(html, /آخرین ذخیره: <time datetime="2026-11-17T12:34:56.789Z">/);
  assert.match(html, /<\/time><\/span>$/);
  assert.doesNotMatch(html, /هنوز ذخیره نشده|نیاز به بررسی/);
});

for (const savedAt of ["not-a-date", Infinity, Symbol("invalid date")])
  test(
    "automatic backup summary safely ignores invalid saved dates: " +
      String(savedAt),
    () => {
      const html = fixture().summaryHtml({ name: "bank.json", savedAt });
      assert.match(html, /هنوز ذخیره نشده/);
      assert.doesNotMatch(html, /<time|Invalid Date/);
    },
  );

test("automatic backup notices always use the shared purpose-file-message structure", () => {
  const html = fixture().noticeHtml({
    purpose: "اطلاعات مدرسه",
    name: "MySchool.json",
    message: "نیاز به بررسی",
  });
  assert.equal(
    html,
    '<span class="single-file-message" role="status"><strong class="backup-file-purpose">اطلاعات مدرسه</strong><bdi class="backup-notice-filename" dir="ltr">MySchool.json</bdi><span class="backup-file-detail">نیاز به بررسی</span></span>',
  );
  assert.doesNotMatch(fixture().noticeHtml(), /backup-notice-filename/);
});

test("automatic backup permission stays a separate explicit, scoped button", () => {
  const html = fixture().noticeHtml({
    purpose: "بانک سؤال و آزمون‌ها",
    name: "Classyar-QuestionBank.json",
    message: "مجوز لازم است.",
    permission: {
      attributes: { "data-qb-backup-action": "permission" },
      ariaLabel: "اجازه مجدد برای فایل بانک سؤال: Classyar-QuestionBank.json",
    },
  });
  assert.match(
    html,
    /<\/span><\/span><button type="button" class="single-file-permission-action"/,
  );
  assert.match(html, /data-qb-backup-action="permission"/);
  assert.match(
    html,
    /aria-label="اجازه مجدد برای فایل بانک سؤال: Classyar-QuestionBank\.json"/,
  );
  assert.match(html, />اجازه مجدد<\/button>$/);
});

test("automatic backup permission accepts an aria label already in its attribute map", () => {
  assert.match(
    fixture().noticeHtml({
      permission: { attributes: { "aria-label": "اجازهٔ فایل مدرسه" } },
    }),
    /aria-label="اجازهٔ فایل مدرسه"/,
  );
});

test("automatic backup renderer escapes all text, ids, aliases, and action attributes", () => {
  const attack = "\"><img src=x onerror=bad()>&'";
  const html = fixture().html({
    purpose: attack,
    name: attack,
    message: attack,
    className: attack,
    ids: { summary: attack, status: attack, fallback: attack },
    aliases: {
      summary: attack,
      status: attack,
      actions: attack,
      choose: attack,
      save: attack,
      stop: attack,
      fallback: attack,
    },
    actions: { choose: { "data-test": attack, title: attack } },
    permission: {
      attributes: { "data-test": attack },
      ariaLabel: attack,
    },
  });
  assert.doesNotMatch(html, /<img|<script|src=x onerror=bad\(\)>/);
  assert.match(html, /&quot;&gt;&lt;img/);
  assert.match(html, /&amp;&#39;/);
});

test("automatic backup action maps cannot inject scripts or replace control semantics", () => {
  const attributes = {
    onclick: "bad()",
    onfocus: "bad()",
    style: "position:fixed",
    href: "javascript:bad()",
    type: "submit",
    class: "malicious",
    'bad" onclick': "bad()",
    "data-null": null,
    "data-undefined": undefined,
    "data-false": false,
    "data-value": 0,
    "aria-label": "safe",
    "data-qb-backup-action": "choose",
  };
  const html = fixture().html({
    actions: { choose: attributes },
    permission: { attributes },
  });
  assert.doesNotMatch(
    html,
    /onclick|onfocus|style=|href=|type="submit"|malicious|data-(?:null|undefined|false)/,
  );
  assert.match(html, /data-value="0"/);
  assert.match(html, /data-qb-backup-action="choose"/);
  assert.equal((html.match(/type="button"/g) || []).length, 3);
});

test("automatic backup disclosure supports adapter ids and compatibility hooks without a new view", () => {
  const html = fixture().html({
    open: true,
    noticeHidden: true,
    fallback: true,
    className: "qb-backup-automatic",
    ids: {
      summary: "bankSummary",
      status: "bankStatus",
      fallback: "bankFallback",
    },
    aliases: { actions: "qb-file-actions", choose: "qb-file-choose" },
    actions: { choose: { "data-qb-backup-action": "choose" } },
  });
  assert.match(
    html,
    /^<details class="backup-automatic qb-backup-automatic" open>/,
  );
  assert.match(html, /class="backup-file-summary" id="bankSummary"/);
  assert.match(html, /id="bankStatus" data-backup-file-status hidden/);
  assert.match(html, /id="bankFallback"><p>/);
  assert.match(html, /class="row backup-automatic-actions qb-file-actions"/);
  assert.match(html, /class="qb-file-choose" data-backup-file-action="choose"/);
});

test("automatic backup controls keep the same labels during permission and busy states", () => {
  const html = fixture().html({
    permission: { attributes: { "data-qb-backup-action": "permission" } },
    disabled: { choose: true, save: true, stop: true },
  });
  assert.match(
    html,
    /data-backup-file-action="choose"[^>]* disabled>انتخاب فایل/,
  );
  assert.match(
    html,
    /data-backup-file-action="save"[^>]* disabled>ذخیره اکنون/,
  );
  assert.match(html, /data-backup-file-action="stop"[^>]* disabled>قطع اتصال/);
  assert.equal((html.match(/>اجازه مجدد<\/button>/g) || []).length, 0);
  assert.equal((html.match(/type="button"/g) || []).length, 3);
});

test("automatic backup unsupported state keeps the original simple school fallback", () => {
  const html = fixture().html({
    supported: false,
    name: "bank.json",
    ids: { status: "bankStatus" },
    message: "This must not replace the shared unsupported guidance.",
    fallback: true,
    permission: { attributes: { "data-qb-backup-action": "permission" } },
  });
  assert.match(
    html,
    /<p role="status" id="bankStatus" data-backup-file-status>ذخیرهٔ خودکار در این مرورگر/,
  );
  assert.match(
    html,
    /از «دریافت فایل» استفاده کنید\.<\/p><div class="backup-file-summary"/,
  );
  assert.equal((html.match(/ disabled>/g) || []).length, 3);
  assert.doesNotMatch(
    html,
    /فایل را یک‌بار|single-file-notice|backup-automatic-fallback|اجازه مجدد<\/button>/,
  );
});

test("automatic backup school and bank adapters produce identical normalized markup for every display state", () => {
  const view = fixture();
  const normalize = (html) =>
    html
      .replaceAll("اطلاعات مدرسه", "SCOPE")
      .replaceAll("بانک سؤال و آزمون‌ها", "SCOPE")
      .replaceAll("MySchool.json", "FILE")
      .replaceAll("Classyar-QuestionBank.json", "FILE")
      .replaceAll("data-workspace-action", "data-backup-action")
      .replaceAll("data-qb-backup-action", "data-backup-action");
  for (const state of [
    { name: "inactive", connected: false },
    { name: "active", connected: true, noticeHidden: true },
    { name: "permission", connected: true, permission: true, open: true },
    { name: "paused", connected: true, needsReview: true, open: true },
    { name: "error", connected: true, fallback: true, open: true },
    {
      name: "busy",
      connected: true,
      disabled: { choose: true, save: true, stop: true },
    },
    { name: "unsupported", supported: false },
  ]) {
    const adapter = (bank) => ({
      ...state,
      purpose: bank ? "بانک سؤال و آزمون‌ها" : "اطلاعات مدرسه",
      name: state.connected
        ? bank
          ? "Classyar-QuestionBank.json"
          : "MySchool.json"
        : "",
      message: state.name,
      savedAt: state.connected ? "2026-11-17T12:34:00.000Z" : "",
      actions: Object.fromEntries(
        ["choose", "save", "stop"].map((key) => [
          key,
          { [bank ? "data-qb-backup-action" : "data-workspace-action"]: key },
        ]),
      ),
      permission: state.permission
        ? {
            attributes: {
              [bank ? "data-qb-backup-action" : "data-workspace-action"]:
                "permission",
            },
          }
        : null,
    });
    assert.equal(
      normalize(view.html(adapter(false))),
      normalize(view.html(adapter(true))),
      state.name,
    );
  }
});
