"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  vm = require("node:vm");
module.exports = async ({ cdp, evaluate, cases }) => {
  const context = vm.createContext({
    esc: (value) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;"),
    num: (value) => Number(value).toLocaleString("fa-IR"),
    faDate: () => "۱۴۰۵/۸/۹",
    reportParticipants: (m, s) => s.participants,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/reports/periodic/document.js"),
      "utf8",
    ),
    context,
  );
  const session = {
    date: "2026-10-31",
    period: 0,
    className: "یازدهم تصویرسازی",
    lessonName: "رایانه کار پیشرفته",
    teacher: "پیرزاد",
    counts: { present: 18, absent: 5, leave: 1, late: 1, unknown: 0 },
    participants: [],
  };
  const model = { audience: "management", detailLevel: "summary" };
  const markup =
    "<h3>جزئیات جلسات و ثبت‌ها</h3>" +
    context.sessionDetailsHtml(model, session) +
    context.sessionDetailsHtml(model, {
      ...session,
      period: 1,
      participants: [
        {
          name: "سیدمحمدحسین عبدالحسینی",
          attendance: { status: "late", label: "با تأخیر", minutes: 10 },
          scores: [
            { label: "فعالیت کلاسی", value: 18, note: "انجام تمرین عملی" },
          ],
        },
      ],
    });
  const previews = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-session-preview-"),
  );
  try {
    await cdp("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await evaluate(`(() => {
      const host = document.createElement('div');
      host.id = 'auditSessionLayout';
      host.className = 'periodic-document';
      host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#fff;box-sizing:border-box';
      host.innerHTML = ${JSON.stringify(markup)};
      document.querySelector('#app').append(host);
    })()`);
    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      const observed = await evaluate(`(() => {
        const host = document.querySelector('#auditSessionLayout');
        const cards = [...host.querySelectorAll('.periodic-session')];
        return {
          cards: cards.length,
          noOverflow: [host, ...cards, ...host.querySelectorAll('.report-session-counts')].every(e => e.scrollWidth <= e.clientWidth + 1),
          statuses: host.querySelectorAll('.report-session-counts dt').length,
          noEmptyTable: !host.querySelector('table'),
          score: host.querySelector('.report-session-scores strong').textContent
          , present: host.querySelector('.report-session-counts .report-metric-present dd').textContent
        };
      })()`);
      cases.push({
        id: "session-layout-" + width,
        name: "Readable session cards without horizontal overflow at " + width,
        pass:
          observed.cards === 2 &&
          observed.noOverflow &&
          observed.statuses === 10 &&
          observed.noEmptyTable &&
          observed.score === "18" &&
          observed.present === "۱۹",
        observed,
      });
      const screenshot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(previews, width + ".png"),
        Buffer.from(screenshot.data, "base64"),
      );
    }
    console.log("Session UI previews: " + previews);
  } finally {
    await evaluate("document.querySelector('#auditSessionLayout')?.remove()");
    await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
};
