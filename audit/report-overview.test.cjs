"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
test("removed overview sections are absent while student follow-up and session details remain", () => {
  const read = (name) =>
    fs.readFileSync(
      path.join(__dirname, "../src/reports/periodic", name),
      "utf8",
    );
  const document = read("document.js");
  const text = read("text.js");
  assert.doesNotMatch(
    document,
    /attendanceOverviewHtml|periodic-overview|جمع‌بندی کلاس‌ها و درس‌ها|dayTitle/,
  );
  assert.doesNotMatch(text, /displayedDays|جمع‌بندی درس‌ها|مرور روز/);
  assert.match(document, /h \+= studentFollowupHtml\(m\)/);
  assert.match(document, /periodic-session/);
  assert.match(text, /وضعیت هنرجویان/);
  assert.match(text, /جزئیات جلسات/);
});
