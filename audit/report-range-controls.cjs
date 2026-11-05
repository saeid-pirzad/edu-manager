"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
async function run(env) {
  const { evaluate, cases, cdp, delay } = env;
  const page = (fn) => evaluate("(" + fn.toString() + ")()");
  const previews = fs.mkdtempSync(path.join(os.tmpdir(), "edu-report-range-"));
  await require("./browser-ready.cjs")(env);
  await evaluate(
    "(" + require("./report-surface-layout.cjs").setup.toString() + ")()",
  );
  try {
    const result = await page(async () => {
      closeModal();
      goReports();
      EduPeriodicReports.selectScope(window.__reportSurfaceIds.school);
      setReportTab("weekly");
      const change = (key, value) => {
        const field = document.querySelector(
          '[data-legacy-change-arg2="' + key + '"]',
        );
        field.value = value;
        field.dispatchEvent(new Event("change", { bubbles: true }));
      };
      change("startDate", "2026-11-02");
      change("endDate", "2026-11-02");
      await EduPeriodicReports.generate();
      const weekly = EduPeriodicReports.getLast(),
        expected = db.sessions.filter(
          (item) =>
            item.date === "2026-11-02" &&
            item.schoolId === window.__reportSurfaceIds.school,
        ).length;
      const weeklyExact =
        !!weekly &&
        weekly.start === "2026-11-02" &&
        weekly.end === "2026-11-02" &&
        weekly.sessions.length === expected;
      const oldEnd = EduPeriodicReports.filters.endDate;
      EduPeriodicReports.set("endDate", "2026-11-01");
      const invalidRejected =
        EduPeriodicReports.filters.endDate === oldEnd &&
        document.getElementById("periodicError").textContent.includes("پایان");
      setReportTab("monthly");
      const field = document.querySelector(
        '.periodic-controls [data-legacy-change="reports-periodic-render:1"]',
      );
      const monthlyPicker =
        field.nextElementSibling.dataset.gregorianTarget === "true" &&
        !field.min &&
        !field.max &&
        !field.dataset.sessionCalendar &&
        !document.querySelector("[data-report-month]");
      const pickMonth = (year, month) => {
        document
          .querySelector(
            '.periodic-controls [data-legacy-change="reports-periodic-render:1"]',
          )
          .nextElementSibling.click();
        calViewYear = year;
        calViewMonth = month;
        renderShamsiCalendar();
        document.querySelector('#calPopup [data-calendar-day="10"]').click();
      };
      pickMonth(1405, 8);
      await EduPeriodicReports.generate();
      const aban = EduPeriodicReports.getLast();
      const monthlyExact =
        !!aban &&
        aban.start === "2026-10-23" &&
        aban.end === "2026-11-21" &&
        aban.sessions.length ===
          db.sessions.filter(
            (item) =>
              item.date >= aban.start &&
              item.date <= aban.end &&
              item.schoolId === window.__reportSurfaceIds.school,
          ).length;
      pickMonth(1405, 9);
      const invalidated = EduPeriodicReports.getLast() === null;
      await EduPeriodicReports.generate();
      const azar = EduPeriodicReports.getLast();
      const changedMonth =
        !!azar &&
        azar.start === "2026-11-22" &&
        azar.end === "2026-12-21" &&
        azar.sessions.length === 0;
      pickMonth(1406, 8);
      await EduPeriodicReports.generate();
      const future = EduPeriodicReports.getLast();
      const yearFlexible =
        !!future &&
        future.start === "2027-10-23" &&
        future.end === "2027-11-21" &&
        future.sessions.length === 0;
      return {
        weeklyExact,
        invalidRejected,
        monthlyPicker,
        monthlyExact,
        invalidated,
        changedMonth,
        yearFlexible,
      };
    });
    for (const [name, pass] of Object.entries(result))
      cases.push({
        id: "REPORT_RANGE_" + name,
        name: "Report date controls: " + name,
        pass,
      });
    for (const width of [320, 390, 768, 1024, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      for (const mode of ["weekly", "monthly"]) {
        await evaluate("setReportTab('" + mode + "');scrollTo(0,0)");
        await delay(80);
        const fits = await page(() => {
          const root = document.querySelector(".periodic-controls");
          return (
            document.documentElement.scrollWidth <= innerWidth + 1 &&
            root.scrollWidth <= root.clientWidth + 1
          );
        });
        cases.push({
          id: "REPORT_RANGE_LAYOUT_" + mode + "_" + width,
          name: "Report range controls fit " + mode + " at " + width,
          pass: fits,
        });
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(previews, mode + "-" + width + ".png"),
          Buffer.from(shot.data, "base64"),
        );
      }
    }
  } finally {
    console.log("Report range previews: " + previews);
    await evaluate("globalThis.__reportSurfaceCleanup?.()");
    await cdp("Emulation.clearDeviceMetricsOverride");
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "report-range-controls", runExtra: run })
    .catch((error) => {
      console.error(error);
      process.exitCode = 2;
    });
