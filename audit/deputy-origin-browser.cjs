"use strict";
// Runs only against the audit harness's temporary browser profile and loopback origins.
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { contentType } = require("../scripts/application-files.cjs");
async function run({ cdp, evaluate, cases, delay }) {
  const root = path.resolve(__dirname, ".."),
    deployment = path.join(root, "dist", "deputy");
  const allowed = [
    ...require("../scripts/deploy-deputy.cjs").deputyFiles(root).keys(),
  ];
  const server = http.createServer((req, res) => {
    const name =
      new URL(req.url, "http://localhost").pathname.slice(1) || "index.html";
    if (
      new URL(req.url, "http://localhost").pathname !== "/" &&
      ["Deputy", "Deputy.html", "index.html"].includes(name)
    ) {
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    if (name === "404.html") {
      res.writeHead(302, { Location: "/404" });
      res.end();
      return;
    }
    if (!allowed.includes(name) || ["_headers", "_redirects"].includes(name)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader("Content-Type", contentType(name));
    res.setHeader("Cache-Control", "no-store");
    res.end(fs.readFileSync(path.join(deployment, name)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const oldTeacher = await evaluate("location.href"),
    oldOrigin = new URL(oldTeacher).origin;
  const oldDeputy = new URL("Deputy.html", oldTeacher).href;
  const record = (id, pass, observed = {}) =>
    cases.push({
      id: "DEPLOY_" + id,
      name: "Separate-origin deployment: " + id,
      pass: !!pass,
      observed,
    });
  async function navigate(url, role) {
    await evaluate("globalThis.__originAuditLeaving=true");
    await cdp("Page.navigate", { url });
    for (let i = 0; i < 200; i++) {
      try {
        if (
          await evaluate(
            role === "teacher"
              ? "!globalThis.__originAuditLeaving&&!!globalThis.EduV24?.getReportContext().ready"
              : "!globalThis.__originAuditLeaving&&!!globalThis.EduDeputyUI?.status().ready",
          )
        )
          return;
      } catch {}
      await delay(50);
    }
    throw Error("Separate-origin page did not become ready: " + url);
  }
  async function restore(backup) {
    return evaluate(
      "(" +
        async function (value) {
          document.querySelector('[data-deputy-action="open-backups"]').click();
          const transfer = new DataTransfer();
          transfer.items.add(
            new File([JSON.stringify(value)], "migration.json", {
              type: "application/json",
            }),
          );
          const input = document.getElementById("deputyRestoreFile");
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          for (let i = 0; i < 200 && EduDeputyUI.status().busy; i++)
            await new Promise((r) => setTimeout(r, 20));
          if (EduDeputyUI.status().error)
            throw Error(EduDeputyUI.status().message);
          const consent = document.getElementById("deputyRestoreConsent");
          consent.checked = true;
          consent.dispatchEvent(new Event("change", { bubbles: true }));
          document
            .querySelector('[data-deputy-action="confirm-restore"]')
            .click();
          for (let i = 0; i < 200 && EduDeputyUI.status().busy; i++)
            await new Promise((r) => setTimeout(r, 20));
          if (EduDeputyUI.status().error)
            throw Error(EduDeputyUI.status().message);
          document
            .querySelector('[data-deputy-action="close-backups"]')
            .click();
          const s = await EduDeputyStore.open();
          try {
            return await s.backup();
          } finally {
            s.close();
          }
        }.toString() +
        ")(" +
        JSON.stringify(backup) +
        ")",
    );
  }
  const signature = () =>
    "(async()=>{const s=await EduDeputyStore.open();try{const b=await s.backup();return JSON.stringify({streams:b.streams,followups:b.followups})}finally{s.close()}})()";
  try {
    const teacherBefore = await evaluate(
      "(async()=>{await EduV24.test.settle();localStorage.setItem('origin-isolation-marker','teacher');const s=await EduV24.snapshotInstallation();return JSON.stringify({catalog:s.stores.catalog,records:s.stores.records,reports:s.stores.reports})})()",
    );
    await navigate(oldDeputy, "deputy");
    const backup = await evaluate(
      "(" +
        async function () {
          const packet = EduDeputyExchange.build({
            sender: { code: "MIGRATE1", name: "دبیر آزمایشی" },
            schoolId: "school",
            schoolCode: "SCHOOL1",
            packetId: "packet",
            exportedAt: "2026-11-03T10:00:00.000Z",
            parts: [
              {
                period: {
                  id: "first",
                  year: "1405-1406",
                  termKind: "first",
                  revision: 1,
                  closed: false,
                },
                data: {
                  schools: [
                    {
                      id: "school",
                      name: "مدرسه آزمایشی",
                      classes: [
                        {
                          id: "classroom",
                          name: "کلاس آزمایشی",
                          students: [
                            {
                              id: "student",
                              name: "هنرجوی آزمایشی",
                              code: "100",
                            },
                          ],
                          archivedStudents: [],
                          lessons: [
                            {
                              id: "lesson",
                              name: "درس آزمایشی",
                              gradeMode: "kardanesh",
                              kardaneshScores: {
                                student: { practical: 0, theory: 20 },
                              },
                              poudmans: [],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                  sessions: [],
                },
              },
            ],
          });
          const s = await EduDeputyStore.open();
          try {
            const result = await s.commit(await s.preview(packet));
            await s.saveFollowup({
              streamKey: result.key,
              classId: "classroom",
              studentId: "student",
              note: "پیگیری مهاجرت آزمایشی",
              status: "open",
            });
            return await s.backup();
          } finally {
            s.close();
          }
        }.toString() +
        ")()",
    );
    await navigate(origin + "/", "deputy");
    record(
      "ROOT_OPENS_DEPUTY",
      await evaluate(
        "!!EduDeputyUI.status().ready&&!globalThis.EduV24&&location.origin===" +
          JSON.stringify(origin),
      ),
    );
    const before = await evaluate(
      "(" +
        async function () {
          const s = await EduDeputyStore.open();
          try {
            return (await s.list()).length;
          } finally {
            s.close();
          }
        }.toString() +
        ")()",
    );
    record("NEW_ORIGIN_STARTS_EMPTY", before === 0, { rows: before });
    const restored = await restore(backup);
    record(
      "RESTORE_FULL_BACKUP",
      restored.streams.length === 1 &&
        restored.followups[0]?.note === "پیگیری مهاجرت آزمایشی" &&
        restored.streams[0].packet.periods[0].school.classes[0].lessons[0]
          .kardaneshScores.student.practical === 0,
    );
    await evaluate("localStorage.setItem('origin-isolation-marker','deputy')");
    const parsed = await cdp("Page.getAppManifest"),
      manifest = JSON.parse(parsed.data);
    record(
      "SEPARATE_INSTALL",
      new URL(manifest.id, parsed.url).origin === origin &&
        new URL(manifest.scope, parsed.url).pathname === "/" &&
        new URL(manifest.start_url, parsed.url).pathname === "/" &&
        !parsed.errors.length,
      { id: manifest.id, scope: manifest.scope, start: manifest.start_url },
    );
    const databases = await evaluate(
      "(async()=>{return (await indexedDB.databases()).map(db=>db.name)})()",
    );
    record(
      "NO_TEACHER_DATABASE",
      databases.includes("EduManagerDeputy") &&
        !databases.includes("EduManagerProfessional"),
      { databases },
    );
    for (let i = 0; i < 150; i++) {
      if (
        await evaluate(
          "document.getElementById('deputyOfflineBar').dataset.offlineReady==='true'",
        )
      )
        break;
      await delay(100);
    }
    await cdp("Network.enable");
    await cdp("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await navigate(origin + "/", "deputy");
    const offline = await evaluate(
      "(" +
        async function () {
          const s = await EduDeputyStore.open();
          try {
            return {
              ready: EduDeputyUI.status().ready,
              rows: (await s.list()).length,
              notes: (await s.followups()).length,
              blocked: await fetch("/__network_probe", {
                cache: "no-store",
              }).then(
                () => false,
                () => true,
              ),
            };
          } finally {
            s.close();
          }
        }.toString() +
        ")()",
    );
    record(
      "ROOT_OFFLINE",
      offline.ready &&
        offline.rows === 1 &&
        offline.notes === 1 &&
        offline.blocked,
      offline,
    );
    await cdp("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await navigate(oldTeacher, "teacher");
    await cdp("Storage.clearDataForOrigin", { origin, storageTypes: "all" });
    const teacherAfter = await evaluate(
      "(async()=>{await EduV24.test.settle();const s=await EduV24.snapshotInstallation();return {signature:JSON.stringify({catalog:s.stores.catalog,records:s.stores.records,reports:s.stores.reports}),marker:localStorage.getItem('origin-isolation-marker')}})()",
    );
    record(
      "CLEAR_DEPUTY_PRESERVES_TEACHER",
      teacherAfter.signature === teacherBefore &&
        teacherAfter.marker === "teacher",
    );
    await navigate(origin + "/Deputy.html", "deputy");
    record(
      "DEPUTY_WAS_CLEARED",
      (await evaluate(signature())) === '{"streams":[],"followups":[]}',
    );
    await restore(backup);
    await evaluate("localStorage.setItem('origin-isolation-marker','deputy')");
    const deputyBefore = await evaluate(signature());
    await cdp("Storage.clearDataForOrigin", {
      origin: oldOrigin,
      storageTypes: "all",
    });
    await navigate(origin + "/Deputy.html", "deputy");
    record(
      "CLEAR_TEACHER_PRESERVES_DEPUTY",
      (await evaluate(signature())) === deputyBefore &&
        (await evaluate(
          "localStorage.getItem('origin-isolation-marker')==='deputy'",
        )),
    );
  } finally {
    await cdp("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    }).catch(() => {});
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "deputy-separate-origin", runExtra: run })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
