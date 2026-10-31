"use strict";
const fs = require("node:fs");
const path = require("node:path");
module.exports = async ({ cdp, evaluate, cases }) => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/reports/periodic/document.js"),
    "utf8",
  );
  const markup = source.match(
    /`(<div class="periodic-export-actions[\s\S]*?<\/div>)`/,
  )[1];
  const summarySource = source.slice(
    source.indexOf("  h +=\n    '<section class=\"periodic-summary"),
    source.indexOf("  if (!m.sessions.length)"),
  );
  try {
    await cdp("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await evaluate(`(() => {
      const host = document.createElement('div');
      host.id = 'auditExportLayout';
      host.className = 'periodic-document';
      host.innerHTML = ${JSON.stringify(markup)};
      const m = { summary: { sessions: 2, present: 39, absent: 7, leave: 2, late: 2, unknown: 0, attendanceRate: 81.25 } };
      const num = value => Number(value).toLocaleString('fa-IR');
      let h = '';
      ${summarySource}
      host.insertAdjacentHTML('beforeend', h);
      document.querySelector('#app').append(host);
    })()`);
    for (const width of [320, 360, 390, 768]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: true,
      });
      const observed = await evaluate(`(() => {
        const host = document.querySelector('#auditExportLayout');
        const buttons = [...host.querySelectorAll('button')];
        const [copy, ...exports] = buttons.map(b => b.getBoundingClientRect().toJSON());
        const cards = [...host.querySelectorAll('.periodic-summary > div')];
        return {
          sameRow: exports.every(b => Math.abs(b.top - exports[0].top) < 1),
          separateCopy: copy.bottom <= exports[0].top,
          noClipping: buttons.every(b => b.scrollWidth <= b.clientWidth + 1),
          summarySingleRow: cards.length === 6 && cards.every(c => Math.abs(c.getBoundingClientRect().top - cards[0].getBoundingClientRect().top) < 1),
          summaryColors: new Set(cards.map(c => getComputedStyle(c).backgroundColor)).size,
          summaryFits: cards.every(c => c.scrollWidth <= c.clientWidth + 1) && host.querySelector('.periodic-summary').scrollWidth <= host.querySelector('.periodic-summary').clientWidth + 1,
          equalCards: cards.every(c => Math.abs(c.getBoundingClientRect().width - cards[0].getBoundingClientRect().width) < 1 && Math.abs(c.getBoundingClientRect().height - cards[0].getBoundingClientRect().height) < 1),
          columns: getComputedStyle(host.firstElementChild).gridTemplateColumns
        };
      })()`);
      cases.push({
        id: "export-row-" + width,
        name: "Report exports share one mobile row at " + width,
        pass:
          observed.sameRow &&
          observed.separateCopy &&
          observed.noClipping &&
          observed.summarySingleRow &&
          observed.summaryFits &&
          observed.equalCards &&
          observed.summaryColors === 6,
        observed,
      });
    }
  } finally {
    await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
    await evaluate("document.querySelector('#auditExportLayout')?.remove()");
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
};
