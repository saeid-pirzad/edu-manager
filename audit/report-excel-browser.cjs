"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
async function run({ cdp, evaluate, cases, delay }) {
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-excel-browser-"),
  );
  await cdp("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: directory,
  });
  await evaluate(
    "(" + require("./report-surface-layout.cjs").setup.toString() + ")()",
  );
  const setup = await evaluate(`(async () => {
    closeModal();
    const s = db.sessions[0], school = db.schools.find(x => x.id === s?.schoolId) || db.schools[0];
    if (!school) throw Error("Missing browser report fixture school");
    goReports(); state.reportTab = "daily";
    EduPeriodicReports.selectScope(school.id, s?.classId || "");
    Object.assign(EduPeriodicReports.filters, {mode:"daily",date:s?.date || "2026-10-31",detailLevel:"full"});
    render();
    const m = await EduPeriodicReports.generate();
    if (!m) throw Error(document.getElementById("periodicError")?.textContent || "Cannot prepare Excel report");
    return {sessions:m.sessions.length,school:m.school.name,participants:m.sessions.reduce((n,s)=>n+s.participants.length,0),marks:m.sessions.reduce((n,s)=>n+s.marks.length,0)};
  })()`);
  cases.push({
    id: "XLSX_REPORT_PREPARED",
    pass: !!setup.school && setup.sessions > 0,
    observed: setup,
  });
  for (const width of [320, 390, 768, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 1000,
    });
    const observed = await evaluate(`(() => {
      const b=document.querySelector("[data-periodic-excel]"), bar=b.closest(".periodic-export-actions"), r=b.getBoundingClientRect();
      return {label:b.textContent.trim(),height:r.height,width:r.width,svg:!!b.querySelector("svg"),fits:b.scrollWidth<=b.clientWidth+1&&bar.scrollWidth<=bar.clientWidth+1,documentFits:document.documentElement.scrollWidth<=innerWidth+1};
    })()`);
    cases.push({
      id: "XLSX_BUTTON_" + width,
      pass:
        observed.fits &&
        observed.documentFits &&
        observed.height >= 44 &&
        observed.width > 0 &&
        observed.svg,
      observed,
    });
  }
  await cdp("Network.enable");
  await cdp("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  try {
    const networkOffline = await evaluate(
      `fetch("./__excel_offline_probe__?t="+Date.now()).then(()=>false,()=>true)`,
    );
    await evaluate(`document.querySelector("[data-periodic-excel]").click()`);
    let file;
    for (let i = 0; i < 100; i++) {
      file = fs.readdirSync(directory).find((n) => n.endsWith(".xlsx"));
      if (file) break;
      await delay(100);
    }
    const bytes = file ? fs.readFileSync(path.join(directory, file)) : null;
    const decoded = bytes
      ? require("./xlsx-reader.cjs")(path.join(directory, file))
      : null;
    const countRows = (name) =>
      decoded?.sheets
        .find((s) => s.name === name)
        ?.rows.filter((r) => r.number > 4).length ?? 0;
    const attendanceRows = countRows("حضور و غیاب");
    const activityRows = countRows("فعالیت‌ها");
    cases.push({
      id: "XLSX_ACTUAL_OFFLINE_DOWNLOAD",
      pass:
        networkOffline &&
        attendanceRows === setup.participants &&
        activityRows === setup.marks &&
        !!bytes &&
        bytes.readUInt32LE(0) === 0x04034b50 &&
        bytes.includes(Buffer.from("محمدرضا", "utf8")),
      observed: {
        networkOffline,
        file,
        directory,
        attendanceRows,
        activityRows,
        bytes: bytes?.length,
        deliveryStatus: await evaluate(
          "document.getElementById('periodicExportStatus')?.textContent",
        ),
        error: await evaluate(
          "document.getElementById('periodicError')?.textContent",
        ),
      },
    });
  } finally {
    await cdp("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp("Browser.setDownloadBehavior", { behavior: "default" });
    await evaluate("globalThis.__reportSurfaceCleanup?.()");
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "report-excel-offline", runExtra: run })
    .catch((error) => {
      console.error(error);
      process.exitCode = 2;
    });
