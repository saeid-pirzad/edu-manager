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
    faDate: (value) =>
      new Intl.DateTimeFormat("fa-IR", { timeZone: "UTC" }).format(
        new Date(value + "T12:00:00Z"),
      ),
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
  const populated = {
    ...session,
    period: 1,
    participants: Array.from({ length: 80 }, (_, index) => ({
      name: "سیدمحمدحسین عبدالحسینی " + index,
      attendance: { status: "late", label: "با تأخیر", minutes: 10 },
      scores: [
        { label: "فعالیت کلاسی", value: 18, note: "انجام تمرین عملی" },
        { type: "positive", label: "امتیاز مثبت", value: 0.5, note: "" },
        { type: "negative", label: "امتیاز منفی", value: 3, note: "پرسش" },
        {
          label: "تکلیف",
          value: 0,
          note: "یادداشت بلند برای بررسی نمایش چند فعالیت هم‌زمان",
        },
      ],
    })),
  };
  const sessions = Array.from({ length: 19 }, (_, index) => ({
    ...session,
    id: "session-" + index,
    date: "2026-11-0" + (1 + Math.floor(index / 4)),
    period: index % 4,
    participants: index === 0 ? populated.participants : [],
  }));
  const markup = context.sessionDisclosureHtml(model, sessions.reverse());
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
      host.querySelector('.report-session-disclosure').open = true;
    })()`);
    const toggles = await evaluate(`(() => {
      const items = [...document.querySelectorAll('#auditSessionLayout details.periodic-session')];
      const initiallyClosed = items.length === 19 && items.every(n => !n.open && getComputedStyle(n.querySelector('.report-session-content')).display === 'none');
      items[0].querySelector('summary').click();
      items[1].querySelector('summary').click();
      const independent = items[0].open && items[1].open && !items[2].open;
      items[0].querySelector('summary').click();
      const closesOnlyItself = !items[0].open && items[1].open;
      return { initiallyClosed, independent, closesOnlyItself };
    })()`);
    cases.push({
      id: "SESSION_INDEPENDENT_TOGGLES",
      name: "Nineteen independent session toggles start closed and allow comparison",
      pass: Object.values(toggles).every(Boolean),
      observed: toggles,
    });
    for (const width of [320, 390, 768, 1024, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      await evaluate(
        "document.querySelectorAll('#auditSessionLayout details.periodic-session').forEach(n => n.open=false);document.querySelector('#auditSessionLayout').scrollTop=0",
      );
      const closed = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(previews, width + "-closed.png"),
        Buffer.from(closed.data, "base64"),
      );
      await evaluate(
        "document.querySelectorAll('#auditSessionLayout details.periodic-session').forEach(n => n.open=true)",
      );
      const observed = await evaluate(`(() => {
        const host = document.querySelector('#auditSessionLayout');
        const cards = [...host.querySelectorAll('.periodic-session')];
        return {
          cards: cards.length,
          dayGroups: host.querySelectorAll('.report-session-day').length,
          compactIdentity: [...host.querySelectorAll('.report-session-identity')].every(n => n.getBoundingClientRect().height < 100),
          noOverflow: [host, ...cards, ...host.querySelectorAll('.report-session-counts,.report-session-table,.report-session-table th,.report-session-table td')].every(e => e.scrollWidth <= e.clientWidth + 1),
          statuses: host.querySelectorAll('.report-session-counts dt').length,
          tableRows: host.querySelectorAll('.report-session-table tbody tr').length,
          tableLayout: getComputedStyle(host.querySelector('.report-session-table')).display === 'table',
          narrowAttendance: [...host.querySelectorAll('.report-session-table tr')].every(row => row.cells[1].getBoundingClientRect().width <= 73),
          consistentGrid: (() => {
            const table = host.querySelector('.report-session-table');
            const header = [...table.tHead.rows[0].cells].map(cell => cell.getBoundingClientRect());
            return getComputedStyle(table).borderCollapse === 'collapse' && [...table.tBodies[0].rows].every(row => [...row.cells].every((cell, index) => Math.abs(cell.getBoundingClientRect().left - header[index].left) < 1 && Math.abs(cell.getBoundingClientRect().width - header[index].width) < 1 && parseFloat(getComputedStyle(cell).borderBottomWidth) === 1));
          })(),
          activityCount: host.querySelectorAll('.report-session-scores li').length,
          scoreColors: getComputedStyle(host.querySelector('[data-score-kind="positive"] strong')).color !== getComputedStyle(host.querySelector('[data-score-kind="negative"] strong')).color,
          clearHierarchy: getComputedStyle(host.querySelector('.report-session-day-heading')).backgroundColor !== getComputedStyle(cards[0]).backgroundColor && parseFloat(getComputedStyle(cards[0]).borderTopWidth) === 0 && parseFloat(getComputedStyle(cards[1]).borderTopWidth) === 1 && cards.every(n => parseFloat(getComputedStyle(n).borderInlineStartWidth) === 0 && getComputedStyle(n).boxShadow === 'none'),
          distinctBells: cards.every(n => {
            const heading = n.querySelector('.report-session-heading');
            return getComputedStyle(heading).backgroundColor !== getComputedStyle(n).backgroundColor && getComputedStyle(heading).backgroundColor !== getComputedStyle(host.querySelector('.report-session-day-heading')).backgroundColor && heading.getBoundingClientRect().height >= 38 && !!heading.querySelector('.report-session-period').textContent.trim();
          }) && parseFloat(getComputedStyle(cards[1]).marginTop) >= 24,
          alternatingRows: getComputedStyle(host.querySelector('.report-session-table tbody tr:nth-child(odd)')).backgroundColor !== getComputedStyle(host.querySelector('.report-session-table tbody tr:nth-child(even)')).backgroundColor,
          boxedActivities: [...host.querySelectorAll('.report-session-scores li')].every(n => parseFloat(getComputedStyle(n).borderTopWidth) >= 1),
          noPanHint: !host.querySelector('.table-pan-hint'),
          nameNotHeader: getComputedStyle(host.querySelector('.report-session-table tbody th')).backgroundColor !== getComputedStyle(host.querySelector('.report-session-table thead th')).backgroundColor,
          score: host.querySelector('.report-session-scores strong').textContent
          , present: host.querySelector('.report-session-counts .report-metric-present dd').textContent
        };
      })()`);
      cases.push({
        id: "session-layout-" + width,
        name: "Compact activity table without horizontal overflow at " + width,
        pass:
          observed.cards === 19 &&
          observed.dayGroups === 5 &&
          observed.compactIdentity &&
          observed.noOverflow &&
          observed.statuses === 95 &&
          observed.tableRows === 80 &&
          observed.tableLayout &&
          observed.narrowAttendance &&
          observed.consistentGrid &&
          observed.activityCount === 320 &&
          observed.scoreColors &&
          observed.clearHierarchy &&
          observed.distinctBells &&
          observed.alternatingRows &&
          observed.boxedActivities &&
          observed.noPanHint &&
          observed.nameNotHeader &&
          observed.score === "18" &&
          observed.present === "۱۹",
        observed,
      });
      await evaluate(
        "document.querySelector('#auditSessionLayout').scrollTop = 0",
      );
      const screenshot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(previews, width + ".png"),
        Buffer.from(screenshot.data, "base64"),
      );
      await evaluate(
        "document.querySelectorAll('#auditSessionLayout .periodic-session')[1].scrollIntoView({block:'center'})",
      );
      const boundary = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(previews, width + "-bell-boundary.png"),
        Buffer.from(boundary.data, "base64"),
      );
    }
    await evaluate(`(() => {
      const host = document.querySelector('#auditSessionLayout');
      host.querySelectorAll('details.periodic-session').forEach(n => n.open=false);
      const button = document.createElement('button');
      host.prepend(button);
      EduV24.preparePrint(button);
      button.remove();
    })()`);
    await cdp("Emulation.setEmulatedMedia", { media: "print" });
    const printed = await evaluate(`(() => {
      const table = document.querySelector('#printRoot .report-session-table');
      return {
        allSessions: document.querySelectorAll('#printRoot .periodic-session[data-print-expanded="true"]').length === 19 && !document.querySelector('#printRoot details.periodic-session'),
        allBodies: [...document.querySelectorAll('#printRoot .report-session-content')].every(n => n.getClientRects().length > 0 && getComputedStyle(n).display !== 'none'),
        sourceClosed: [...document.querySelectorAll('#auditSessionLayout details.periodic-session')].every(n => !n.open),
        rows: table.tBodies[0].rows.length === 80,
        table: getComputedStyle(table).display === 'table',
        repeatedHead: getComputedStyle(table.tHead).display === 'table-header-group',
        unsplitRows: getComputedStyle(table.tBodies[0].rows[0]).breakInside === 'avoid',
        notes: table.textContent.includes('یادداشت بلند'),
      };
    })()`);
    cases.push({
      id: "session-table-print",
      name: "Printed activity table retains every row and notes with repeating headers",
      pass: Object.values(printed).every(Boolean),
      observed: printed,
    });
    console.log("Session UI previews: " + previews);
  } finally {
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    await evaluate("document.getElementById('printRoot')?.remove()");
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
if (require.main === module)
  require("./data-integrity.cjs")
    .main({
      stage: "report-session-table",
      runExtra: module.exports,
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 2;
    });
