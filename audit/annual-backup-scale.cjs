"use strict";
// Synthetic real-browser test: private profile, loopback site and temporary downloads.
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { performance } = require("node:perf_hooks"),
  { main } = require("./data-integrity.cjs"),
  buildFixture = require("./flows/annualBackupScaleFixture.cjs");

function installScaleTools() {
  const stable = (item) => {
    if (Array.isArray(item)) return item.map(stable);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(
      Object.keys(item)
        .sort()
        .map((key) => [key, stable(item[key])]),
    );
  };
  function strict(value) {
    const copy = structuredClone(value);
    delete copy.exportedAt;
    return JSON.stringify(stable(copy));
  }
  async function marker() {
    const tx = EduV24.test.getConnection().transaction("records", "readonly"),
      done = EduDataStoreRuntime.transactionDone(tx);
    const [value] = await Promise.all([
      EduDataStoreRuntime.requestPromise(
        tx.objectStore("records").get("@installation-reset"),
      ),
      done,
    ]);
    return value.value.token;
  }
  function canonical(value) {
    const copy = structuredClone(value),
      revisions = new Map(
        copy.stores.catalog.map((row) => [row.id, row.revision]),
      );
    delete copy.exportedAt;
    for (const row of copy.stores.undo) {
      if (row.revision === revisions.get(row.id)) row.revision = "current";
      for (const peer of row.recoveredPeers || [])
        if (peer.revision === revisions.get(peer.id)) peer.revision = "current";
    }
    for (const row of copy.stores.catalog) {
      row.revision = 0;
      delete row.reportSource;
      row.reportNotesRecovery = {
        ...row.reportNotesRecovery,
        ...copy.reportDrafts?.[row.id],
      };
    }
    for (const rows of Object.values(copy.stores))
      rows.sort((a, b) =>
        JSON.stringify(a.key ?? a.id).localeCompare(
          JSON.stringify(b.key ?? b.id),
        ),
      );
    copy.gradeDrafts.sort((a, b) => a.key.localeCompare(b.key));
    for (const row of copy.gradeDrafts) {
      delete row.owner;
      for (const entry of row.entries) {
        delete entry.review;
        delete entry.error;
      }
    }
    if (copy.deputyExportIdentity) copy.deputyExportIdentity.token = "rotated";
    return JSON.stringify(stable(copy));
  }
  async function hash(value) {
    const result = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical(value)),
    );
    return Array.from(new Uint8Array(result), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }
  async function restore(value) {
    closeModal();
    EduV24.previewFullBackup(value);
    document.getElementById("fullRestoreConfirmed").checked = true;
    await EduV24.restoreFullBackup();
    await EduV24.test.settle();
  }
  globalThis.__annualScaleTools = { canonical, strict, marker, hash, restore };
}

async function prepareScale(build) {
  const tools = globalThis.__annualScaleTools,
    seed = build(),
    started = performance.now();
  await tools.restore(seed);
  const installMs = performance.now() - started;
  // A real scoped edit creates executable undo, not an artificial history stub.
  const meeting = db.sessions[0];
  meeting.scores[0].note += " / scoped undo fixture";
  await EduV24.saveDB({
    sessionId: meeting.id,
    action: "Annual backup roundtrip audit",
  });
  const snapshotStart = performance.now(),
    source = await EduV24.snapshotInstallation(),
    snapshotMs = performance.now() - snapshotStart,
    parts = EduV24.validateFullBackup(source),
    first = parts.find((part) => part.period.termKind === "first"),
    second = parts.find((part) => part.period.termKind === "second"),
    classes = second.data.schools.flatMap((school) => school.classes),
    known = classes.flatMap((classroom) => [
      ...classroom.students,
      ...classroom.archivedStudents,
    ]),
    sessions = parts.flatMap((part) => part.data.sessions),
    attendance = { present: 0, absent: 0, leave: 0, late: 0, unset: 0 };
  for (const session of sessions)
    for (const member of session.roster) {
      const value = session.attendance[member.id];
      attendance[
        !value ? "unset" : value.startsWith("late:") ? "late" : value
      ]++;
    }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
    shared = (data) => ({
      schedule: data.masterSchedule,
      schools: data.schools.map((school) => ({
        id: school.id,
        name: school.name,
        classes: school.classes.map((classroom) => ({
          id: classroom.id,
          name: classroom.name,
          students: classroom.students,
          archivedStudents: classroom.archivedStudents,
          lessons: classroom.lessons.map((lesson) => ({
            id: lesson.id,
            name: lesson.name,
            gradeMode: lesson.gradeMode,
            policy: lesson.gradingPolicy,
          })),
        })),
      })),
    }),
    slotIds = sessions.map((session) => session.date + "|" + session.period),
    draftValues = source.gradeDrafts.flatMap((row) =>
      row.entries.map((entry) => entry.value),
    );
  globalThis.__annualScaleState = {
    source,
    expectedHash: await tools.hash(source),
  };
  return {
    expectedHash: globalThis.__annualScaleState.expectedHash,
    counts: {
      terms: parts.length,
      schools: second.data.schools.length,
      classes: classes.length,
      knownStudents: known.length,
      activeStudents: classes.reduce((n, c) => n + c.students.length, 0),
      sessions: sessions.length,
      personSessions: Object.values(attendance).reduce((a, b) => a + b, 0),
      scoreRecords: sessions.reduce(
        (n, session) => n + session.scores.length,
        0,
      ),
      modules: classes
        .flatMap((c) => c.lessons)
        .reduce((n, lesson) => n + lesson.poudmans.length, 0),
      units: classes
        .flatMap((c) => c.lessons)
        .flatMap((lesson) => lesson.poudmans)
        .reduce((n, pod) => n + pod.units.length, 0),
      lessons: classes.reduce((n, c) => n + c.lessons.length, 0),
      perTermSessions: parts.map((part) => part.data.sessions.length),
      ordinaryBackups: source.stores.backups.length,
      frozenReports: source.stores.reports.length,
      undo: source.stores.undo.length,
      pendingDrafts: draftValues.length,
    },
    sourceRevisions: Object.fromEntries(
      source.stores.catalog.map((row) => [row.id, row.revision]),
    ),
    sourceIdentityToken: source.deputyExportIdentity.token,
    sourceInstallationToken: await tools.marker(),
    attendance,
    sharedDefinitions: same(shared(first.data), shared(second.data)),
    uniqueSlots: new Set(slotIds).size === slotIds.length,
    independentTermGrades: !same(
      first.data.schools[0].classes[0].lessons[0].kardaneshScores,
      second.data.schools[0].classes[0].lessons[0].kardaneshScores,
    ),
    longDraft: draftValues.includes("9".repeat(101)),
    zeroDraft: draftValues.includes("0"),
    noWarnings: source.snapshotNotes.length === 0,
    currentUndo: source.stores.undo.some(
      (row) =>
        row.id === source.activeWorkspace &&
        row.revision ===
          source.stores.catalog.find((part) => part.id === row.id).revision,
    ),
    timings: { installMs, snapshotMs },
  };
}

async function installDifferentDestination() {
  const source = globalThis.__annualScaleState.source,
    destination = structuredClone(source),
    id = "destination-only-period",
    active = source.activeWorkspace,
    period = source.stores.catalog.find((row) => row.id === active);
  destination.activeWorkspace = id;
  destination.stores.catalog = [{ ...period, id, reportNotesRecovery: {} }];
  destination.stores.records = destination.stores.records
    .filter((row) => row.workspace === active)
    .map((row) => ({ ...row, workspace: id, key: id + "|" + row.logical }));
  destination.stores.events = [
    {
      id: 90001,
      workspace: id,
      at: new Date().toISOString(),
      action: "Destination-only history",
      changes: [],
      revision: period.revision,
    },
  ];
  for (const name of ["backups", "reports", "undo"])
    destination.stores[name] = [];
  destination.gradeDrafts = [];
  destination.reportDrafts = { [id]: {} };
  destination.deputyExportIdentity.token = "destination-only-token";
  await globalThis.__annualScaleTools.restore(destination);
  const current = await EduV24.snapshotInstallation();
  globalThis.__annualScaleState.destinationStrict =
    globalThis.__annualScaleTools.strict(current);
  globalThis.__annualScaleState.destinationEpoch =
    await globalThis.__annualScaleTools.marker();
  return {
    id: EduV24.getReportContext().id,
    terms: current.stores.catalog.length,
  };
}

async function inspectScale(expectedHash) {
  const started = performance.now(),
    value = await EduV24.snapshotInstallation(),
    snapshotMs = performance.now() - started,
    actualHash = await globalThis.__annualScaleTools.hash(value),
    entries = value.gradeDrafts.flatMap((row) => row.entries),
    parts = EduV24.validateFullBackup(value),
    active = parts.find((part) => part.period.id === value.activeWorkspace),
    sid = active.data.schools[0].classes[0].students[0].id,
    storedPractical =
      active.data.schools[0].classes[0].lessons[0].kardaneshScores[sid]
        .practical;
  return {
    equal: actualHash === expectedHash,
    actualHash,
    snapshotMs,
    ids: value.stores.catalog.map((row) => row.id),
    gradesRemainDrafts:
      entries.some((item) => item.value === "9".repeat(101)) &&
      entries.some((item) => item.value === "99") &&
      entries.some((item) => item.value === "0") &&
      entries.every(
        (item) => item.review === true && typeof item.error === "string",
      ) &&
      storedPractical >= 0 &&
      storedPractical <= 20,
    noWarnings: value.snapshotNotes.length === 0,
    noDestination:
      !value.stores.events.some(
        (row) => row.action === "Destination-only history",
      ) &&
      !value.stores.records.some(
        (row) => row.workspace === "destination-only-period",
      ),
    revisions: Object.fromEntries(
      value.stores.catalog.map((row) => [row.id, row.revision]),
    ),
    identityToken: value.deputyExportIdentity.token,
    installationToken: await globalThis.__annualScaleTools.marker(),
  };
}

async function run({ cdp, evaluate, cases, delay }) {
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "edu-annual-backup-scale-"),
    ),
    metrics = {
      scope: "Synthetic local Edge/IndexedDB; not physical-phone timings",
      directory,
    },
    check = (id, name, pass, observed = {}) =>
      cases.push({ id: "ANNUAL_SCALE_" + id, name, pass: !!pass, observed });
  const connectionProbe = () =>
    evaluate(`(async () => {
    const observed = { online:navigator.onLine, documentTimeOrigin:performance.timeOrigin, controlled:!!navigator.serviceWorker.controller, fetchBlocked:false };
    // This is neither an application asset nor a navigation. The worker does
    // not serve it, and a fresh URL plus no-store excludes any cached success.
    const url=new URL('__annual_backup_offline_probe__',location.href);
    url.searchParams.set('nonce',crypto.randomUUID());
    try {
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(3000)});
      observed.fetchStatus=response.status;
    } catch(error) {
      observed.fetchError=error.name;
      observed.fetchBlocked=error.name==='TypeError';
    }
    return observed;
  })()`);
  const waitOffline = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate("navigator.onLine === false")) return true;
      await delay(50);
    }
    return false;
  };
  const overrideNetworkState = (offline) =>
    cdp("Network.overrideNetworkState", {
      offline,
      latency: 0,
      downloadThroughput: offline ? 0 : -1,
      uploadThroughput: offline ? 0 : -1,
    });
  const enterOffline = async () => {
    await cdp("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    // Request blocking and the renderer's native connection state are separate
    // CDP controls. Do not replace navigator.onLine with a JavaScript stub.
    await overrideNetworkState(true);
    await waitOffline();
    return connectionProbe();
  };
  await cdp("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: directory,
  });
  try {
    await evaluate("(" + installScaleTools.toString() + ")()");
    const setup = await evaluate(
      "(" + prepareScale.toString() + ")(" + buildFixture.toString() + ")",
    );
    metrics.setup = setup;
    check(
      "FIXTURE",
      "One shared academic year has two terms, 100 known students and 512 non-colliding sessions",
      setup.counts.terms === 2 &&
        setup.counts.schools === 2 &&
        setup.counts.classes === 4 &&
        setup.counts.knownStudents === 100 &&
        setup.counts.activeStudents === 96 &&
        setup.counts.lessons === 8 &&
        setup.counts.modules === 20 &&
        setup.counts.units === 40 &&
        setup.counts.perTermSessions.every((count) => count === 256) &&
        setup.counts.personSessions === 12800 &&
        setup.counts.sessions === 512 &&
        setup.uniqueSlots &&
        setup.sharedDefinitions &&
        setup.independentTermGrades &&
        Object.values(setup.attendance).every((n) => n > 0),
      setup,
    );
    check(
      "HISTORY",
      "Source includes frozen report, ordinary backups, real undo, conflicting long and zero drafts",
      setup.counts.frozenReports === 1 &&
        setup.counts.ordinaryBackups === 2 &&
        setup.currentUndo &&
        setup.counts.pendingDrafts === 3 &&
        setup.longDraft &&
        setup.zeroDraft &&
        setup.noWarnings,
      setup.counts,
    );
    await cdp("Network.enable");
    metrics.onlineControl = await connectionProbe();
    check(
      "ONLINE_NETWORK_CONTROL",
      "The uncached same-origin probe reaches the live server before offline emulation",
      metrics.onlineControl.online &&
        metrics.onlineControl.fetchStatus === 404 &&
        !metrics.onlineControl.fetchBlocked,
      metrics.onlineControl,
    );
    metrics.offlineExport = await enterOffline();
    check(
      "OFFLINE_EXPORT_NETWORK",
      "The actual file export starts with navigator offline and uncached network requests blocked",
      metrics.offlineExport.online === false &&
        metrics.offlineExport.fetchBlocked,
      metrics.offlineExport,
    );
    const exportStart = performance.now();
    await evaluate("EduV24.exportFullBackup()");
    let file;
    for (let attempt = 0; attempt < 150; attempt++) {
      file = fs.readdirSync(directory).find((name) => name.endsWith(".json"));
      if (
        file &&
        !fs.readdirSync(directory).some((name) => name.endsWith(".crdownload"))
      )
        break;
      await delay(100);
    }
    if (!file) throw Error("Actual JSON download did not complete");
    const filePath = path.join(directory, file),
      bytes = fs.readFileSync(filePath),
      parseStart = performance.now(),
      decoded = JSON.parse(bytes.toString("utf8"));
    metrics.exportMs = performance.now() - exportStart;
    metrics.diskParseMs = performance.now() - parseStart;
    metrics.backupBytes = bytes.length;
    const fileHash = await evaluate(
      "globalThis.__annualScaleTools.hash(" + JSON.stringify(decoded) + ")",
    );
    check(
      "DISK_FILE",
      "An actual offline JSON download contains the complete source, without semantic loss",
      bytes.length > 0 &&
        decoded.version === 2 &&
        fileHash === setup.expectedHash,
      { bytes: bytes.length, filePath, hash: fileHash },
    );
    const different = await evaluate(
      "(" + installDifferentDestination.toString() + ")()",
    );
    check(
      "DIFFERENT_DESTINATION",
      "Restore target starts with unrelated term and history",
      different.id === "destination-only-period" && different.terms === 1,
      different,
    );
    const importFile = async () => {
      await evaluate("closeModal()");
      const document = await cdp("DOM.getDocument"),
        input = await cdp("DOM.querySelector", {
          nodeId: document.root.nodeId,
          selector: "#importFile",
        });
      const started = performance.now();
      await cdp("DOM.setFileInputFiles", {
        nodeId: input.nodeId,
        files: [filePath],
      });
      for (let attempt = 0; attempt < 150; attempt++) {
        const previewReady = await evaluate(
          "(() => {const root = document.querySelector('#modal:not(.hidden) .full-restore');" +
            "const input = root?.querySelector('#fullRestoreConfirmed');" +
            "return !!(input && !input.checked && root.textContent.includes(" +
            JSON.stringify(file) +
            "));})()",
        );
        if (previewReady) return performance.now() - started;
        await delay(100);
      }
      throw Error("Actual backup file did not reach full-restore preview");
    };
    metrics.previewMs = await importFile();
    const previewUnchanged = await evaluate(
      "(async()=>globalThis.__annualScaleTools.strict(await EduV24.snapshotInstallation())===globalThis.__annualScaleState.destinationStrict && await globalThis.__annualScaleTools.marker()===globalThis.__annualScaleState.destinationEpoch)()",
    );
    check(
      "PREVIEW_READONLY",
      "Reading the real file and previewing replacement does not modify destination data",
      previewUnchanged,
    );
    const confirm = async () => {
      const started = performance.now();
      await evaluate(
        "(async()=>{document.getElementById('fullRestoreConfirmed').checked=true;await EduV24.restoreFullBackup();await EduV24.test.settle();})()",
      );
      return performance.now() - started;
    };
    metrics.restoreMs = await confirm();
    const restored = await evaluate(
      "(" +
        inspectScale.toString() +
        ")(" +
        JSON.stringify(setup.expectedHash) +
        ")",
    );
    check(
      "FULL_REPLACEMENT",
      "Every meaningful catalog field, record, array order, history, backup, undo, draft and identity field matches after restore",
      restored.equal && restored.noDestination && restored.noWarnings,
      restored,
    );
    check(
      "FIRST_RESTORE_GUARDS",
      "The first replacement advances guards and rotates sender and installation identities",
      Object.keys(restored.revisions).every(
        (id) => restored.revisions[id] > setup.sourceRevisions[id],
      ) &&
        restored.identityToken !== setup.sourceIdentityToken &&
        restored.installationToken !== setup.sourceInstallationToken,
      { before: setup.sourceRevisions, after: restored.revisions },
    );
    check(
      "DRAFT_REVIEW",
      "Conflicting raw input and zero remain reviewed drafts rather than becoming durable grades",
      restored.gradesRemainDrafts,
      restored,
    );
    metrics.repeatPreviewMs = await importFile();
    metrics.repeatRestoreMs = await confirm();
    const repeated = await evaluate(
      "(" +
        inspectScale.toString() +
        ")(" +
        JSON.stringify(setup.expectedHash) +
        ")",
    );
    check(
      "REPEATED_RESTORE",
      "Restoring the same actual file twice produces the same domain data and exactly the same two term IDs",
      repeated.equal &&
        repeated.ids.length === 2 &&
        repeated.ids.includes("scale-first") &&
        repeated.ids.includes("scale-second"),
      repeated,
    );
    check(
      "RESTORE_GUARDS",
      "Each replacement advances both catalog guards and rotates the sender token",
      Object.keys(repeated.revisions).every(
        (id) => repeated.revisions[id] > restored.revisions[id],
      ) &&
        repeated.identityToken !== restored.identityToken &&
        repeated.installationToken !== restored.installationToken,
      { first: restored.revisions, repeated: repeated.revisions },
    );
    metrics.beforeOfflineReload = await enterOffline();
    const reloadStart = performance.now();
    // reloadReady marks the old document and starts exactly one navigation.
    // An additional Page.reload races that navigation and its CDP context.
    await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    // Edge can reset the new renderer's navigator state while network requests
    // remain blocked. Prove that real isolation survived before refreshing the
    // native state override for this fresh document.
    metrics.freshDocumentBeforeStateOverride = await connectionProbe();
    await overrideNetworkState(true);
    await waitOffline();
    metrics.afterOfflineReload = await connectionProbe();
    metrics.offlineReloadMs = performance.now() - reloadStart;
    await evaluate("(" + installScaleTools.toString() + ")()");
    const afterReload = await evaluate(
      "(" +
        inspectScale.toString() +
        ")(" +
        JSON.stringify(setup.expectedHash) +
        ")",
    );
    check(
      "OFFLINE_RELOAD",
      "The complete restored academic year and pending drafts survive a fresh offline document",
      afterReload.equal &&
        afterReload.gradesRemainDrafts &&
        JSON.stringify(afterReload.revisions) ===
          JSON.stringify(repeated.revisions) &&
        afterReload.identityToken === repeated.identityToken &&
        afterReload.installationToken === repeated.installationToken &&
        metrics.beforeOfflineReload.online === false &&
        metrics.beforeOfflineReload.fetchBlocked &&
        metrics.freshDocumentBeforeStateOverride.fetchBlocked &&
        metrics.afterOfflineReload.online === false &&
        metrics.afterOfflineReload.fetchBlocked &&
        metrics.afterOfflineReload.controlled &&
        metrics.beforeOfflineReload.documentTimeOrigin !==
          metrics.afterOfflineReload.documentTimeOrigin,
      {
        ...afterReload,
        beforeConnection: metrics.beforeOfflineReload,
        freshConnectionBeforeStateOverride:
          metrics.freshDocumentBeforeStateOverride,
        afterConnection: metrics.afterOfflineReload,
      },
    );
  } finally {
    fs.writeFileSync(
      path.join(directory, "metrics.json"),
      JSON.stringify(metrics, null, 2) + "\n",
    );
    console.log(
      "Annual backup measurements: " + path.join(directory, "metrics.json"),
    );
    await cdp("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await overrideNetworkState(false);
    await cdp("Browser.setDownloadBehavior", { behavior: "default" });
  }
}

if (require.main === module)
  main({ stage: "annual-backup-file-scale", runExtra: run }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
module.exports = { run };
