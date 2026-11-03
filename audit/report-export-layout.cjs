"use strict";
const fs = require("node:fs");
const path = require("node:path");
module.exports = async ({ cdp, evaluate, cases }) => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/reports/periodic/document.js"),
    "utf8",
  );
  const markup = source.match(
    /`(<div class="periodic-export-actions[\s\S]*?<\/div>)/,
  )[1];
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
        return {
          sameRow: exports.every(b => Math.abs(b.top - exports[0].top) < 1),
          persistentCopy: copies.length === 1 && copies[0].closest('.periodic-controls') !== null && copy.width > 0 && copy.height >= 44,
          separateCopy: copy?.bottom <= exports[0]?.top,
          exportCount: exports.length,
          noClipping: buttons.every(b => b.scrollWidth <= b.clientWidth + 1),
          columns: getComputedStyle(host.querySelector('.periodic-export-actions')).gridTemplateColumns
        };
      })()`);
      cases.push({
        id: "export-row-" + width,
        name:
          "Persistent deputy action and four responsive report exports at " +
          width,
        pass:
          (width <= 1000 || observed.sameRow) &&
          observed.persistentCopy &&
          observed.exportCount === 4 &&
          observed.separateCopy &&
          observed.noClipping,
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
