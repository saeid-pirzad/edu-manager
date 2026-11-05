"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  vm = require("node:vm");
async function run(env) {
  const { cdp, evaluate, cases } = env;
  const c = vm.createContext({
    esc: (s) =>
      String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;"),
    num: (n) => Number(n).toLocaleString("fa-IR"),
    faDate: (d) =>
      new Intl.DateTimeFormat("fa-IR", { timeZone: "UTC" }).format(
        new Date(d + "T12:00:00Z"),
      ),
    reportParticipants: (m, s) => s.participants,
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/reports/periodic/document.js"),
      "utf8",
    ),
    c,
  );
  const sessions = Array.from({ length: 19 }, (_, i) => ({
    id: "pdf-" + i,
    date: "2026-11-0" + (1 + Math.floor(i / 4)),
    period: i % 4,
    className: "یازدهم تصویرسازی",
    lessonName: "رایانه کار پیشرفته",
    teacher: "پیرزاد",
    participants: Array.from({ length: 2 }, (_, n) => ({
      name: "سیدمحمدحسین عبدالحسینی " + n,
      attendance: { status: "late", label: "با تأخیر", minutes: 10 },
      scores: [
        { type: "positive", label: "امتیاز مثبت", value: 0.5, note: "" },
        {
          type: "negative",
          label: "امتیاز منفی",
          value: 3,
          note: "پرسش شفاهی",
        },
        {
          type: "homework",
          label: "تکلیف",
          value: 0,
          note: "انجام تمرین عملی و بررسی توضیحات بلند برای جلوگیری از بریده‌شدن اطلاعات در چاپ",
        },
      ],
    })),
  }));
  const markup =
    '<article class="card report-document periodic-document"><h2>گزارش آزمایشی جزئیات جلسات</h2><button data-print-test>چاپ</button>' +
    c.sessionDisclosureHtml(
      { audience: "parent", detailLevel: "full" },
      sessions,
    ) +
    "</article>";
  const previews = fs.mkdtempSync(path.join(os.tmpdir(), "edu-session-pdf-"));
  await require("./browser-ready.cjs")(env);
  const pageCounts = [];
  try {
    await evaluate(
      "document.getElementById('app').innerHTML=" + JSON.stringify(markup),
    );
    for (const width of [390, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      await cdp("Emulation.setEmulatedMedia", { media: "" });
      await evaluate(
        "(async()=>{globalThis.__EDU_PRINT_TEST__=true;if(!await EduV24.printReport(document.querySelector('[data-print-test]')))throw Error('Print preparation failed');})()",
      );
      await cdp("Emulation.setEmulatedMedia", { media: "print" });
      const layout = await evaluate(`(() => {
        const root=document.querySelector('#printRoot');
        const tableNodes=[...root.querySelectorAll('.report-session-table')];
        const tableHeadsTight=tableNodes.every(n=>getComputedStyle(n.caption).display==='none' && Math.abs(n.tHead.getBoundingClientRect().top-n.getBoundingClientRect().top)<2);
        const noNativeDisclosures=!root.querySelector('details.report-session-compact');
        const allExpanded=root.querySelectorAll('.periodic-session[data-print-expanded="true"]').length===19;
        return { tableHeadsTight, noNativeDisclosures, allExpanded, sessions: root.querySelectorAll('.periodic-session').length, rows: root.querySelectorAll('.report-session-table tbody tr').length, activities:root.querySelectorAll('.report-session-scores li').length, tables:tableNodes.every(n=>n.scrollWidth<=n.clientWidth+1), sourceClosed:[...document.querySelectorAll('#app .periodic-session')].every(n=>!n.open) };
      })()`);
      cases.push({
        id: "SESSION_PDF_CONTENT_" + width,
        name: "Session PDF retains all data at " + width,
        pass:
          layout.sessions === 19 &&
          layout.rows === 38 &&
          layout.activities === 114 &&
          layout.tables &&
          layout.tableHeadsTight &&
          layout.noNativeDisclosures &&
          layout.allExpanded &&
          layout.sourceClosed,
        observed: layout,
      });
      const pdf = await cdp("Page.printToPDF", {
        preferCSSPageSize: true,
        printBackground: true,
      });
      const file = path.join(previews, "sessions-" + width + ".pdf");
      fs.writeFileSync(file, Buffer.from(pdf.data, "base64"));
      const raster = require("./pdf-raster.cjs").rasterizePdf(
        file,
        path.join(previews, "raster-" + width),
        1000,
      );
      pageCounts.push(raster.pageCount);
      cases.push({
        id: "SESSION_PDF_PAGES_" + width,
        name: "Actual session PDF has printable pages",
        pass:
          raster.pageCount >= 3 &&
          raster.pageCount <= 12 &&
          raster.pages.every(
            (page) =>
              page.ink.inkPixels > 1000 &&
              ["topMargin", "bottomMargin", "leftMargin", "rightMargin"].every(
                (key) => page.ink[key] >= 20,
              ),
          ),
        observed: {
          source: raster.source,
          pageCount: raster.pageCount,
          pages: raster.pages.map((page) => ({
            file: page.file,
            inkPixels: page.ink.inkPixels,
            left: page.ink.leftMargin,
            right: page.ink.rightMargin,
            top: page.ink.topMargin,
            bottom: page.ink.bottomMargin,
          })),
        },
      });
    }
    cases.push({
      id: "SESSION_PDF_VIEWPORT_PARITY",
      name: "Mobile and desktop session PDFs have matching pagination",
      pass: pageCounts[0] === pageCounts[1],
      observed: pageCounts,
    });
  } finally {
    console.log("Session PDF previews: " + previews);
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    await cdp("Emulation.clearDeviceMetricsOverride");
    await evaluate(
      "document.getElementById('printRoot')?.remove();document.getElementById('printPageStyle')?.remove();delete globalThis.__EDU_PRINT_TEST__;goSchools()",
    );
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "session-pdf", runExtra: run })
    .catch((error) => {
      console.error(error);
      process.exitCode = 2;
    });
