"use strict";
// Real two-release upgrade on a separate loopback origin; no user profile or source mutation.
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { execFileSync } = require("node:child_process");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
module.exports = async function auditPwaUpgrade({ cdp, debuggerUrl, root }) {
  const cases = [],
    record = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed });
  const oldNames = [
    "EduManager.html",
    "index.html",
    "app.webmanifest",
    "service-worker.js",
  ];
  const names = [
    ...require("./application-files.cjs").applicationFiles(root).keys(),
  ];
  const oldFiles = new Map(
    oldNames.map((name) => [
      name,
      execFileSync("git", ["show", "594217b:" + name], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 5 * 1024 * 1024,
        windowsHide: true,
      }),
    ]),
  );
  const newFiles = new Map(
    names.map((name) => [name, fs.readFileSync(path.join(root, name), "utf8")]),
  );
  const oldVersion = oldFiles
      .get("service-worker.js")
      .match(/const VERSION = "([^"]+)"/)[1],
    newVersion = newFiles
      .get("service-worker.js")
      .match(/const VERSION = "([^"]+)"/)[1];
  if (oldVersion === newVersion)
    throw Error("Upgrade audit requires distinct release identifiers.");
  let phase = "old",
    failDownload = false,
    failedDownloads = 0,
    ws,
    target,
    session;
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, "http://localhost").pathname.replace(
      /^\/edu-manager\//,
      "",
    );
    if (!names.includes(name)) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (phase === "new" && failDownload && name === "EduManager.html") {
      failedDownloads++;
      response.writeHead(503);
      response.end("Synthetic installation failure");
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Type",
      name.endsWith(".html")
        ? "text/html; charset=utf-8"
        : name.endsWith(".css")
          ? "text/css; charset=utf-8"
          : name.endsWith(".js")
            ? "application/javascript"
            : "application/manifest+json",
    );
    response.end((phase === "old" ? oldFiles : newFiles).get(name));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const pending = new Map();
  try {
    target = (await cdp("Target.createTarget", { url: "about:blank" }))
      .targetId;
    const host = new URL(debuggerUrl).host;
    const pages = await (await fetch("http://" + host + "/json")).json();
    ws = new WebSocket(
      pages.find((page) => page.id === target).webSocketDebuggerUrl,
    );
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    let sequence = 0;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data),
        request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      message.error
        ? request.reject(Error(JSON.stringify(message.error)))
        : request.resolve(message.result);
    };
    session = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence,
          timer = setTimeout(() => {
            if (pending.delete(id))
              reject(Error("Upgrade CDP timeout: " + method));
          }, 25000);
        timer.unref();
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const result = await session("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails)
        throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const until = async (expression, label) => {
      for (let i = 0; i < 160; i++) {
        try {
          if (await evaluate(expression)) return;
        } catch {}
        await sleep(100);
      }
      throw Error("Upgrade audit wait failed: " + label);
    };
    await session("Page.enable");
    await session("Page.addScriptToEvaluateOnNewDocument", {
      source:
        "window.__EDU_TEST_MODE__=true;window.confirm=()=>true;window.alert=()=>{};",
    });
    await session("Page.navigate", {
      url:
        "http://127.0.0.1:" +
        server.address().port +
        "/edu-manager/EduManager.html",
    });
    await until(
      "!!(window.EduV24?.test?.getState().ready&&window.EduPWA?.getStatus().offlineReady&&navigator.serviceWorker.controller)",
      "old offline installation",
    );
    await evaluate(
      '(async()=>{db=defaultDB();db.schools=[{id:"upgrade_school",name:"Upgrade school",classes:[{id:"upgrade_class",name:"Upgrade class",students:[{id:"upgrade_student",name:"Upgrade student",code:"001"}],archivedStudents:[],lessons:[{id:"upgrade_lesson",name:"Upgrade lesson",gradeMode:"kardanesh",poudmans:[],kardaneshScores:{upgrade_student:{practical:18,theory:12,midtermPractical:16,midtermTheory:12}}}]}]}];db.sessions=[{id:"upgrade_session",schoolId:"upgrade_school",classId:"upgrade_class",lessonId:"upgrade_lesson",date:"2026-10-25",period:0,poudmanId:null,unitId:null,roster:[{id:"upgrade_student",name:"Upgrade student",code:"001"}],attendance:{upgrade_student:"present"},scores:[{studentId:"upgrade_student",type:"activity",value:1000,note:"old points"}]}];await saveDB();return db.schemaVersion;})()',
    );
    record(
      "W01",
      "previous release installs offline with schema 25",
      await evaluate("db.schemaVersion===25"),
      { oldVersion },
    );
    phase = "new";
    failDownload = true;
    await evaluate(
      "navigator.serviceWorker.getRegistration().then(registration=>registration.update()).then(()=>true).catch(()=>false)",
    );
    for (let i = 0; i < 100 && !failedDownloads; i++) await sleep(100);
    if (!failedDownloads)
      throw Error("Synthetic failed download was not exercised.");
    await until(
      "navigator.serviceWorker.getRegistration().then(registration=>!registration.installing&&!registration.waiting)",
      "failed installation settled",
    );
    const oldCache = await evaluate("caches.keys()");
    record(
      "W02",
      "failed upgrade keeps previous complete offline cache",
      failedDownloads > 0 && oldCache.some((key) => key.endsWith(oldVersion)),
      { caches: oldCache, failedDownloads },
    );
    await session("Network.enable");
    await session("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await session("Page.reload");
    await sleep(500);
    await until(
      "!!(window.EduV24?.test?.getState().ready&&window.EduPWA?.getStatus().offlineReady)",
      "old offline reload after failed upgrade",
    );
    record(
      "W03",
      "previous release and data survive offline after failed upgrade",
      await evaluate(
        "!navigator.onLine&&db.schemaVersion===25&&db.schools[0].classes[0].lessons[0].kardaneshScores.upgrade_student.practical===18",
      ),
    );
    await session("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    failDownload = false;
    await evaluate(
      "navigator.serviceWorker.getRegistration().then(registration=>registration.update()).then(()=>true).catch(()=>false)",
    );
    await until("!!window.EduPWA?.getStatus().waiting", "new release waiting");
    await evaluate(
      'document.getElementById("pwaWelcomeLater")?.click();document.getElementById("mobileUpdate").click();true',
    );
    await until(
      "!!(window.EduV24?.test?.getState().ready&&db.schemaVersion===26&&window.EduPWA?.getStatus().offlineReady)",
      "new release and schema 26",
    );
    record(
      "W04",
      "actual update button loads new release and migrates read model",
      await evaluate(
        "db.schemaVersion===26&&db.schools[0].classes[0].lessons[0].kardaneshScores.upgrade_student.theory===12",
      ),
    );
    await evaluate(
      '(async()=>{openSessionModal(db.sessions[0]);showSessionPanel("activity");const form=document.querySelector(".session-entry-form");form.elements.studentId.value="upgrade_student";form.elements.type.value="classGrade";form.elements.value.value="20";form.elements.note.value="new class grade";await addSessionScore({preventDefault(){},target:form},"upgrade_session");return true;})()',
    );
    record(
      "W05",
      "new type persists while old activity points retain meaning",
      await evaluate(
        'db.sessions[0].scores.some(score=>score.type==="classGrade"&&score.value===20)&&db.sessions[0].scores.some(score=>score.type==="activity"&&score.value===1000)',
      ),
    );
    await session("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await session("Page.reload");
    await sleep(500);
    await until(
      "!!(window.EduV24?.test?.getState().ready&&window.EduPWA?.getStatus().offlineReady)",
      "new offline reload",
    );
    record(
      "W06",
      "new release reloads offline with both old and new score types",
      await evaluate(
        '!navigator.onLine&&db.schemaVersion===26&&db.sessions[0].scores.some(score=>score.type==="classGrade"&&score.value===20)&&db.sessions[0].scores.some(score=>score.type==="activity"&&score.value===1000)',
      ),
      { newVersion },
    );
  } catch (error) {
    record("W99", "two-release PWA upgrade flow completed", false, {
      error: error.stack || error.message,
    });
  } finally {
    if (target)
      try {
        await cdp("Target.closeTarget", { targetId: target });
      } catch {}
    if (ws) ws.close();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error("Upgrade audit closed."));
    }
    pending.clear();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  return cases;
};
