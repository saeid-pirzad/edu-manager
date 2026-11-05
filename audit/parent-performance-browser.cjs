"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
async function run(env) {
  const { evaluate, cdp, cases } = env;
  await require("./browser-ready.cjs")(env);
  await evaluate(
    "(" + require("./report-surface-layout.cjs").setup.toString() + ")()",
  );
  const previews = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-parent-performance-"),
  );
  try {
    await evaluate(`(() => {
      closeModal(); goReports();
      EduPeriodicReports.selectScope(__reportSurfaceIds.school, __reportSurfaceIds.a);
      setReportTab('daily');
      EduPeriodicReports.set('audience', 'parent');
      EduPeriodicReports.set('studentId', __reportSurfaceIds.a + '_student_1');
      EduPeriodicReports.set('date', '2026-11-02');
    })()`);
    for (const mode of ["daily", "annual"]) {
      const generated = await evaluate(`(async () => {
        setReportTab('${mode}');
        const m = await EduPeriodicReports.generate();
        if (!m) throw Error(document.querySelector('#periodicError').textContent);
        const doc = document.querySelector('.periodic-document');
        return {
          full: m.detailLevel === 'full',
          overview: !!doc.querySelector('.report-parent-performance'),
          detailsOpen: !!doc.querySelector('.report-session-disclosure[open]'),
          allActivities: doc.querySelectorAll('.report-session-scores li').length === m.sessions.reduce((n,s) => n + s.participants.reduce((sum,p) => sum + p.scores.length, 0), 0),
          allSessions: doc.querySelectorAll('.periodic-session').length === m.sessions.length,
          noPeer: !doc.textContent.includes('سیدمحمدحسین دانش‌آموز نمونه') && !doc.textContent.includes('علی هنرجوی آزمایشی'),
          onlySelected: m.sessions.every(s => s.participants.every(p => p.studentId === m.student.id)),
          grades: m.annualGrades.length > 0,
          sharedKarnameh: !!doc.querySelector('.periodic-karnameh .karnameh-student-sheet .karnameh-assessment-table'),
          oldGradeCardsRemoved: !doc.querySelector('.annual-grades,.assessment-student'),
          noNestedActions: !doc.querySelector('.periodic-karnameh .karnameh-report-actions,.periodic-karnameh .karnameh-student-pagination'),
        };
      })()`);
      cases.push({
        id: "PARENT_COMPLETE_" + mode,
        name: "Complete isolated parent performance: " + mode,
        pass: Object.values(generated).every(Boolean),
        observed: generated,
      });
      for (const width of [320, 390, 768, 1024, 1280]) {
        await cdp("Emulation.setDeviceMetricsOverride", {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: width < 1000,
        });
        const fits = await evaluate(`(() => {
          const doc = document.querySelector('.periodic-document');
          const toggle = doc.querySelector('.report-session-toggle');
          return toggle.getBoundingClientRect().height >= 52 && toggle.getBoundingClientRect().height <= 84 && getComputedStyle(toggle).backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(getComputedStyle(toggle).borderTopWidth) === 1 && !!toggle.querySelector('.report-session-toggle-label small').textContent.trim() && document.documentElement.scrollWidth <= innerWidth + 1 && [doc, toggle, ...doc.querySelectorAll('.report-session-table,.report-session-table td,.report-session-table th')].every(n => n.scrollWidth <= n.clientWidth + 1);
        })()`);
        cases.push({
          id: "PARENT_LAYOUT_" + mode + "_" + width,
          name: "Parent performance fits " + mode + " at " + width,
          pass: fits,
        });
        await evaluate(
          "document.querySelector('.report-parent-performance').scrollIntoView({block:'start'})",
        );
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(previews, mode + "-" + width + ".png"),
          Buffer.from(shot.data, "base64"),
        );
        await evaluate(
          "document.querySelector('.periodic-karnameh').scrollIntoView({block:'start'})",
        );
        const gradeShot = await cdp("Page.captureScreenshot", {
          format: "png",
        });
        fs.writeFileSync(
          path.join(previews, mode + "-grades-" + width + ".png"),
          Buffer.from(gradeShot.data, "base64"),
        );
      }
    }
    const gradeChecks = await evaluate(`(async () => {
      const report = document.querySelector('.periodic-karnameh .karnameh-student-sheet');
      const signature = node => JSON.stringify([...node.querySelectorAll('.karnameh-sheet-score')].map(cell => [cell.dataset.karnamehField, cell.dataset.gradeComplete, cell.textContent]));
      const embedded = signature(report);
      report.querySelector('[data-karnameh-stage="second-final"]').click();
      for (let i=0; i<40 && report.querySelector('[data-karnameh-stage="second-final"]').getAttribute('aria-pressed') !== 'true'; i++) await new Promise(r=>setTimeout(r,25));
      const switched = report.querySelector('[data-karnameh-stage="second-final"]').getAttribute('aria-pressed') === 'true';
      EduV24.preparePrint(document.querySelector('[data-periodic-print]'));
      const printed = document.querySelector('#printRoot .karnameh-student-sheet');
      const printComplete = signature(printed) === embedded && [...printed.querySelectorAll('[data-karnameh-group]')].every(cell => cell.style.display !== 'none');
      document.getElementById('printRoot').remove();
      EduV24.openKarnamehStudent(__reportSurfaceIds.a, __reportSurfaceIds.a + '_student_1');
      for(let i=0;i<80 && !document.querySelector('#karnamehTabOutput .karnameh-student-sheet');i++) await new Promise(r=>setTimeout(r,25));
      const standalone = document.querySelector('#karnamehTabOutput .karnameh-student-sheet');
      return { switched, printComplete, matchesStandalone: !!standalone && signature(standalone) === embedded };
    })()`);
    cases.push({
      id: "PARENT_KARNAMEH_PARITY",
      name: "Embedded karnameh matches standalone, switches stage and prints all stages",
      pass: Object.values(gradeChecks).every(Boolean),
      observed: gradeChecks,
    });
  } finally {
    console.log("Parent performance previews: " + previews);
    await evaluate("globalThis.__reportSurfaceCleanup?.()");
    await cdp("Emulation.clearDeviceMetricsOverride");
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "parent-performance", runExtra: run })
    .catch((error) => {
      console.error(error);
      process.exitCode = 2;
    });
