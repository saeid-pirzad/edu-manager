"use strict";
// Developer audit only. Starts a loopback server and a fresh temporary Edge profile.
// It never opens the user's browser profile or changes application source files.
// Node.js 22+; Windows with Edge, or set EDUMANAGER_EDGE to a Chromium executable.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { matrix, backupMatrix, orphanRestore, malformedFrozenReport, refactorFlows, contextFlows, workflowChecks, monthlyChecks, annualChecks, assessmentChecks } = require("./flows/index.cjs");

async function main({ runExtra, stage = "3-simple-workflow-mobile-and-four-assessments" } = {}) {
  if (process.argv.includes("--help")) {
    console.log(
      "node audit/data-integrity.cjs\nDeveloper audit: temporary loopback server + isolated Edge profile; no application source changes.\nRequires Node.js 22+ and Edge. Override browser executable with EDUMANAGER_EDGE.\nExit 1 means a required integrity check failed; exit 2 means the audit runner could not complete.",
    );
    return;
  }
  const application = path.join(root, "EduManager.html");
  if (!fs.existsSync(application))
    throw Error("Run the audit file from the edu-manager/audit directory.");
  const browserPath =
    process.env.EDUMANAGER_EDGE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (!fs.existsSync(browserPath))
    throw Error("Browser executable not found. Set EDUMANAGER_EDGE.");
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-integrity-audit-"),
  );
  const applicationFiles = require("./application-files.cjs").applicationFiles(root);
  const files = new Map([...applicationFiles].map(([name, type]) => ["/edu-manager/" + name, [name, type]]));
  files.set("/edu-manager/", ["index.html", "text/html; charset=utf-8"]);
  const server = http.createServer((request, response) => {
    const file = files.get(new URL(request.url, "http://localhost").pathname);
    if (!file) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader("Content-Type", file[1]);
    response.setHeader("Cache-Control", "no-store");
    response.end(fs.readFileSync(path.join(root, file[0])));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser, ws, cdp;
  const pending = new Map();
  try {
    browser = spawn(
      browserPath,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-proxy-server",
        "--disable-background-networking",
        "--disable-extensions",
        "--no-first-run",
        "--remote-debugging-port=0",
        "--user-data-dir=" + profile,
        "about:blank",
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    let launchError;
    browser.once("error", (error) => {
      launchError = error;
    });
    const devTools = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 200 && !fs.existsSync(devTools); i++) {
      if (launchError) throw launchError;
      await delay(100);
    }
    if (!fs.existsSync(devTools))
      throw Error("Browser debugging endpoint did not start.");
    const port = fs.readFileSync(devTools, "utf8").split("\n")[0];
    const pages = await (
      await fetch("http://127.0.0.1:" + port + "/json")
    ).json();
    ws = new WebSocket(
      pages.find((page) => page.type === "page").webSocketDebuggerUrl,
    );
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    let sequence = 0;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      message.error
        ? request.reject(Error(JSON.stringify(message.error)))
        : request.resolve(message.result);
    };
    cdp = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          if (pending.delete(id)) reject(Error("Browser timeout: " + method));
        }, 25000);
        timer.unref();
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const result = await cdp("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails)
        throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await cdp("Page.enable");
    await cdp("Page.addScriptToEvaluateOnNewDocument", {
      source:
        "window.__EDU_TEST_MODE__=true;window.confirm=()=>true;window.alert=()=>{};",
    });
    await cdp("Page.navigate", {
      url:
        "http://127.0.0.1:" +
        server.address().port +
        "/edu-manager/EduManager.html",
    });
    let ready = false;
    for (let i = 0; i < 150; i++) {
      ready = await evaluate("!!window.EduV24?.test?.getState().ready");
      if (ready) break;
      await delay(100);
    }
    if (!ready)
      throw Error("Application did not become ready in the isolated profile.");
    const data = await evaluate("(" + matrix.toString() + ")()");
    const grades = await evaluate("(" + assessmentChecks.toString() + ")()");
    const backup = await evaluate("(" + backupMatrix.toString() + ")()");
    const integration = await evaluate("(" + orphanRestore.toString() + ")()");
    const frozenReport = await evaluate(
      "(" + malformedFrozenReport.toString() + ")()",
    );
    const flows = await evaluate("(" + refactorFlows.toString() + ")()");
    const cases = [
      ...data,
      ...grades,
      ...backup,
      integration,
      frozenReport,
      ...flows,
    ];
    for (let i = 0; i < 100; i++) {
      if (
        await evaluate(
          "!!(window.EduPWA?.getStatus().offlineReady && navigator.serviceWorker.controller)",
        )
      )
        break;
      await delay(100);
    }
    await cdp("Network.enable");
    await cdp("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await cdp("Page.reload");
    await delay(500);
    for (let i = 0; i < 100; i++) {
      if (
        await evaluate(
          "!!(window.EduV24?.test?.getState().ready && window.EduPWA?.getStatus().offlineReady)",
        )
      )
        break;
      await delay(100);
    }
    const reload = await evaluate(
      "({ready:!!window.EduV24?.test?.getState().ready,offline:!navigator.onLine,closed:window.EduV24?.getReportContext().closed,grade:db.schools[0]?.classes[0]?.lessons[0]?.kardaneshScores.student_b?.theory})",
    );
    cases.push({
      id: "F12",
      name: "restored data and closed period survive an offline reload",
      pass:
        reload.ready && reload.offline && reload.closed && reload.grade === 12,
      ...reload,
    });
    await cdp("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    cases.push(...(await evaluate("(" + monthlyChecks.toString() + ")()")));
    for (const width of [360, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 850,
        deviceScaleFactor: 1,
        mobile: false,
      });
      cases.push(
        ...(await evaluate(
          "(" + workflowChecks.toString() + ")(" + width + ")",
        )),
      );
      if (width === 390) {
        await evaluate(
          'openSessionModal(db.sessions[0]);showSessionPanel("activity")',
        );
        await delay(100);
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(profile, "mobile-session.png"),
          Buffer.from(shot.data, "base64"),
        );
        await evaluate(
          'closeModal();goSchool("school_a");goClass("class_a");goLesson("lesson_dual");setTab("grades")',
        );
        await delay(100);
        const gradesShot = await cdp("Page.captureScreenshot", {
          format: "png",
        });
        fs.writeFileSync(
          path.join(profile, "mobile-grades.png"),
          Buffer.from(gradesShot.data, "base64"),
        );
        await evaluate('setTab("sessions")');
        await delay(100);
        const sessionsShot = await cdp("Page.captureScreenshot", {
          format: "png",
        });
        fs.writeFileSync(
          path.join(profile, "mobile-sessions.png"),
          Buffer.from(sessionsShot.data, "base64"),
        );
        await evaluate("goSchools()");
        await delay(100);
        const homeShot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(profile, "mobile-home.png"),
          Buffer.from(homeShot.data, "base64"),
        );
      }
    }
    cases.push(...(await evaluate("(" + annualChecks.toString() + ")()")));
    cases.push(...(await evaluate("(" + contextFlows.toString() + ")()")));
    cases.push(
      ...(await evaluate(
        "(" + require("./data-store-browser.cjs").toString() + ")()",
      )),
    );
    if (runExtra) await runExtra({ cdp, evaluate, cases, root, ws, delay });
    const hash = crypto.createHash("sha256");
    for (const file of [
      ...new Set([...files.values()].map(([name]) => name)),
    ].sort()) {
      hash.update(file + "\0").update(fs.readFileSync(path.join(root, file)));
    }
    const release = hash.digest("hex").slice(0, 16);
    const result = {
      stage,
      applicationRelease: release,
      executedAt: new Date().toISOString(),
      profile,
      total: cases.length,
      passed: cases.filter((test) => test.pass).length,
      failed: cases.filter((test) => !test.pass).length,
      cases,
    };
    const resultFile = path.join(profile, "data-integrity-results.json");
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ ...result, resultFile }, null, 2));
    if (result.failed) process.exitCode = 1;
  } finally {
    if (cdp && ws?.readyState === WebSocket.OPEN) {
      try {
        await cdp("Browser.close");
      } catch {}
    }
    if (ws) ws.close();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error("Audit browser closed."));
    }
    pending.clear();
    if (browser && browser.exitCode === null) browser.kill();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
module.exports = { main };
if (require.main === module) main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 2;
});
