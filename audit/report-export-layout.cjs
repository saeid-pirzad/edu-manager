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
      const controls = document.createElement('div');
      controls.innerHTML = EduPeriodicReports.render('daily');
      host.append(controls.querySelector('.periodic-controls'));
      host.insertAdjacentHTML('beforeend', ${JSON.stringify(markup)});
      const m = { summary: { sessions: 2, present: 39, absent: 7, leave: 2, late: 2, unknown: 0, attendanceRate: 81.25 } };
      const num = value => Number(value).toLocaleString('fa-IR');
      let h = '';
      ${summarySource}
      host.insertAdjacentHTML('beforeend', h);
      document.querySelector('#app').append(host);
    })()`);
    for (const width of [320, 360, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      const observed = await evaluate(`(() => {
        const host = document.querySelector('#auditExportLayout');
        const copies = [...host.querySelectorAll('[data-deputy-copy]')];
        const buttons = [...host.querySelectorAll('.periodic-export-actions button')];
        const exports = buttons.map(b => b.getBoundingClientRect().toJSON());
        const copy = copies[0]?.getBoundingClientRect();
        const cards = [...host.querySelectorAll('.periodic-summary > div')];
        const summary = host.querySelector('.periodic-summary');
        const summaryRows = new Set(cards.map(c => Math.round(c.getBoundingClientRect().top))).size;
        return {
          sameRow: exports.every(b => Math.abs(b.top - exports[0].top) < 1),
          persistentCopy: copies.length === 1 && copies[0].closest('.periodic-controls') !== null && copy.width > 0 && copy.height >= 44,
          separateCopy: copy?.bottom <= exports[0]?.top,
          exportCount: exports.length,
          noClipping: buttons.every(b => b.scrollWidth <= b.clientWidth + 1),
          summaryCount: cards.length,
          summaryRows,
          summaryColumns: getComputedStyle(summary).gridTemplateColumns.split(' ').length,
          summaryColors: new Set(cards.map(c => getComputedStyle(c).color)).size,
          summaryReadable: cards.every(c => parseFloat(getComputedStyle(c.querySelector('span')).fontSize) >= 11),
          summaryFlat: cards.every(c => parseFloat(getComputedStyle(c).borderLeftWidth) === 0 && parseFloat(getComputedStyle(c).borderRightWidth) === 0),
          summaryFits: cards.every(c => c.scrollWidth <= c.clientWidth + 1) && host.querySelector('.periodic-summary').scrollWidth <= host.querySelector('.periodic-summary').clientWidth + 1,
          equalCardWidths: cards.every(c => Math.abs(c.getBoundingClientRect().width - cards[0].getBoundingClientRect().width) < 1),
          columns: getComputedStyle(host.querySelector('.periodic-export-actions')).gridTemplateColumns
        };
      })()`);
      cases.push({
        id: "export-row-" + width,
        name:
          "Persistent deputy action and three aligned report exports at " +
          width,
        pass:
          observed.sameRow &&
          observed.persistentCopy &&
          observed.exportCount === 3 &&
          observed.separateCopy &&
          observed.noClipping &&
          observed.summaryCount === 6 &&
          observed.summaryColumns === (width <= 1000 ? 3 : 6) &&
          observed.summaryRows === (width <= 1000 ? 2 : 1) &&
          observed.summaryReadable &&
          observed.summaryFlat &&
          observed.summaryFits &&
          observed.equalCardWidths &&
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
