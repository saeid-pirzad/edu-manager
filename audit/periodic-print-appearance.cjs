"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
module.exports = async ({ cdp, evaluate, cases }) => {
  await cdp("Page.reload", { ignoreCache: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate("!!globalThis.EduV24?.getReportContext?.().ready"))
      break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-print-preview-"),
  );
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 768,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  try {
    const before = await evaluate(`(() => {
      const source = document.createElement('article');
      source.id = 'auditPrintSource';
      source.className = 'report-document periodic-document card';
      source.innerHTML = '<header class="periodic-document-heading"><h2>گزارش روزانه</h2><h3>هنرستان حافظ</h3></header><button data-audit-print>چاپ</button><section class="periodic-summary"><div data-summary-status="present"><strong>۱۸</strong><span>حاضر</span></div><div data-summary-status="absent"><strong>۵</strong><span>غایب</span></div></section><section class="periodic-session"><header class="report-session-heading"><span class="report-session-date">۱۴۰۵/۸/۹</span><span class="report-session-period">زنگ ۱</span></header><div class="report-session-identity"><h4>یازدهم تصویرسازی</h4><div class="report-session-lesson"><strong>رایانه کار پیشرفته</strong></div><p class="report-session-teacher">دبیر: پیرزاد</p></div></section>';
      document.querySelector('#app').append(source);
      const selectors = ['.periodic-summary > div', '.periodic-summary strong', '.periodic-session', '.report-session-period', '.periodic-document-heading h2'];
      return selectors.map(selector => {
        const style = getComputedStyle(source.querySelector(selector));
        return { selector, color: style.color, background: style.backgroundColor, fontSize: style.fontSize, borderRadius: style.borderRadius, padding: style.padding };
      });
    })()`);
    const prepared = await evaluate(`(async () => {
      globalThis.__EDU_PRINT_TEST__ = true;
      return await EduV24.printReport(document.querySelector('[data-audit-print]'));
    })()`);
    if (!prepared) throw Error("Print report preparation failed");
    await cdp("Emulation.setEmulatedMedia", { media: "print" });
    const after = await evaluate(`(() => {
      const root = document.querySelector('#printRoot');
      const selectors = ${JSON.stringify(before.map((x) => x.selector))};
      return {
        styles: selectors.map(selector => {
          const style = getComputedStyle(root.querySelector(selector));
          return { selector, color: style.color, background: style.backgroundColor, fontSize: style.fontSize, borderRadius: style.borderRadius, padding: style.padding };
        }),
        extraHeader: !!root.querySelector(':scope > header'),
        buttons: root.querySelectorAll('button').length,
        basis: !!root.querySelector('.report-basis'),
        legacyBasis: !!root.querySelector('.report-basis-print'),
        colorAdjust: getComputedStyle(root.querySelector('.periodic-session')).printColorAdjust
      };
    })()`);
    cases.push({
      id: "print-appearance",
      name: "PDF preserves report colors, typography and cards without extra controls or obsolete report footers",
      pass:
        JSON.stringify(before) === JSON.stringify(after.styles) &&
        !after.extraHeader &&
        !after.buttons &&
        !after.basis &&
        !after.legacyBasis &&
        after.colorAdjust === "exact",
      observed: { before, after },
    });
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(directory, "print.png"),
      Buffer.from(shot.data, "base64"),
    );
    const result = await cdp("Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });
    const bytes = Buffer.from(result.data, "base64");
    fs.writeFileSync(path.join(directory, "report.pdf"), bytes);
    cases.push({
      id: "print-pdf",
      name: "A real PDF is generated from the report",
      pass: bytes.subarray(0, 5).toString() === "%PDF-" && bytes.length > 1000,
      observed: { bytes: bytes.length },
    });
    console.log("PDF appearance preview: " + directory);
  } finally {
    await cdp("Emulation.setEmulatedMedia", { media: "" });
    await evaluate(
      "document.querySelector('#auditPrintSource')?.remove(); document.querySelector('#printRoot')?.remove(); delete globalThis.__EDU_PRINT_TEST__;",
    );
  }
};
