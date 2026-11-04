"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");

async function setup() {
  const original = await EduV24.snapshotInstallation(),
    fixture = structuredClone(original),
    ids = {
      first: "karnameh_excel_first",
      second: "karnameh_excel_second",
      school: "karnameh_excel_school",
      classroom: "karnameh_excel_class",
      otherClass: "karnameh_excel_other_class",
    },
    students = [
      { id: "karnameh_excel_a", name: "آراد هنرجوی مصنوعی", code: "1" },
      { id: "karnameh_excel_b", name: "بهرام هنرجوی آزمایشی", code: "2" },
      { id: "karnameh_excel_archived", name: "سعید هنرجوی بایگانی", code: "3" },
    ],
    year = "1405-1406",
    teacher = "دبیر مصنوعی کارنامه",
    collect = EduWorkspaceRecords.create({
      clone: structuredClone,
    }).collectRecords;
  fixture.activeWorkspace = ids.second;
  fixture.gradeDrafts = [];
  fixture.reportDrafts = {};
  fixture.snapshotNotes = [];
  for (const key of Object.keys(fixture.stores)) fixture.stores[key] = [];
  for (const [id, term, termKind] of [
    [ids.first, "اول", "first"],
    [ids.second, "دوم", "second"],
  ]) {
    const first = termKind === "first",
      dualScores = {
        [students[0].id]: first
          ? {
              midtermPractical: 0,
              midtermTheory: 20,
              practical: 18,
              theory: 12,
            }
          : { midtermPractical: 20, midtermTheory: 10, practical: 14 },
        [students[1].id]: {
          midtermPractical: 12,
          midtermTheory: 12,
          practical: 18,
          theory: 18,
        },
        [students[2].id]: {
          midtermPractical: 0,
          midtermTheory: 0,
          practical: 0,
          theory: 0,
        },
      },
      dualPolicy = {
        ...EduPolicy.defaults("dual", year),
        code: "KARNAMEH-XLSX",
        confirmed: true,
      },
      lessons = [
        {
          id: "karnameh_excel_dual",
          name: "کاربر گرافیک عملی و نظری",
          teacher,
          gradeMode: "kardanesh",
          gradingPolicy: dualPolicy,
          kardaneshScores: dualScores,
          poudmans: [],
        },
        {
          id: "karnameh_excel_general",
          name: "درس عمومی آزمایشی",
          teacher,
          gradeMode: "kardanesh",
          gradingPolicy: {
            ...dualPolicy,
            subjectType: "general",
            code: "KARNAMEH-GENERAL",
          },
          kardaneshScores: Object.fromEntries(
            students.map((student) => [
              student.id,
              { midtermTheory: first ? 11 : 13, theory: first ? 12 : 14 },
            ]),
          ),
          poudmans: [],
        },
        {
          id: "karnameh_excel_modular",
          name: "درس فنی پودمانی آزمایشی",
          teacher,
          gradeMode: "standard",
          gradingPolicy: {
            ...EduPolicy.defaults("modular", year),
            code: "KARNAMEH-MODULAR",
            confirmed: true,
          },
          kardaneshScores: {},
          poudmans: [0, 1].map((index) => ({
            id: "karnameh_excel_pod_" + index,
            name: index ? "پودمان دوم آزمایشی" : "پودمان اول آزمایشی",
            podScores: Object.fromEntries(
              students.map((student) => [
                student.id,
                { m: index ? 4 : 0, c: index ? 3 : 2 },
              ]),
            ),
            units: [
              {
                id: "karnameh_excel_unit_" + index,
                name: "واحد کار آزمایشی",
                unitScores: {},
              },
            ],
          })),
        },
      ],
      data = EduV24.normalizeDB({
        ...defaultDB(),
        settings: {
          ...db.settings,
          academicYear: year,
          academicTerm: term,
          password: "",
        },
        schools: [
          {
            id: ids.school,
            name: "هنرستان مصنوعی خروجی کارنامه",
            classes: [
              {
                id: ids.classroom,
                name: "یازدهم کلاس آزمایش اکسل",
                students: structuredClone(students.slice(0, 2)),
                archivedStudents: [structuredClone(students[2])],
                lessons,
              },
              {
                id: ids.otherClass,
                name: "کلاس خارج از محدوده",
                students: [
                  {
                    id: "karnameh_excel_other",
                    name: "هنرجوی خارج از کلاس",
                    code: "1",
                  },
                ],
                archivedStudents: [],
                lessons: [],
              },
            ],
          },
        ],
        sessions: [],
        masterSchedule: {},
        migrationWarnings: [],
      });
    fixture.stores.catalog.push({
      id,
      year,
      term,
      termKind,
      closed: false,
      revision: 1,
      createdAt: "2026-11-04T08:00:00Z",
      updatedAt: "2026-11-04T08:00:00Z",
    });
    for (const [logical, value] of collect(data))
      fixture.stores.records.push({
        key: id + "|" + logical,
        workspace: id,
        logical,
        value,
      });
  }
  globalThis.__karnamehExcelAudit = {
    original,
    fixture,
    ids,
    students,
    teacher,
    oldPrompt: window.prompt,
    oldVerify: verifyPassword,
  };
  return { ids, students, teacher, year };
}

async function resetFixture(options = {}) {
  const { partial = false } = options || {};
  const audit = globalThis.__karnamehExcelAudit,
    fixture = structuredClone(audit.fixture);
  window.prompt = () => null;
  verifyPassword = audit.oldVerify;
  if (partial) {
    fixture.stores.catalog = fixture.stores.catalog.filter(
      (row) => row.id !== audit.ids.first,
    );
    fixture.stores.records = fixture.stores.records.filter(
      (row) => row.workspace !== audit.ids.first,
    );
  }
  closeModal();
  EduV24.previewFullBackup(fixture);
  document.getElementById("fullRestoreConfirmed").checked = true;
  await EduV24.restoreFullBackup();
  await EduV24.test.settle();
  EduV24.openKarnamehStudent(audit.ids.classroom, audit.students[1].id);
}

async function uiState() {
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const report = document.querySelector(
      "#karnamehTabOutput .karnameh-student-sheet",
    ),
    entry = document.querySelector('[data-workspace-action="karnameh-excel"]');
  return {
    html: report?.outerHTML || "",
    tables: report
      ? [...report.querySelectorAll("table")].map((table) => table.outerHTML)
      : [],
    stage: report
      ? [
          ...report.querySelectorAll(
            "[data-karnameh-stage][aria-pressed=true]",
          ),
        ].map((button) => button.dataset.karnamehStage)
      : [],
    selection: JSON.stringify(karnamehFilter),
    position: report?.querySelector(".karnameh-student-position")?.textContent,
    printCount: report?.querySelectorAll('[data-workspace-action="print"]')
      .length,
    next: !!report?.querySelector('[data-karnameh-nav="next"]'),
    previous: !!report?.querySelector('[data-karnameh-nav="previous"]'),
    entryCount: document.querySelectorAll(
      '[data-workspace-action="karnameh-excel"]',
    ).length,
    entryOutsideReport:
      !!entry &&
      !!entry.closest(".karnameh-controls") &&
      !entry.closest(".karnameh-student-sheet"),
  };
}

async function protectPeer() {
  const audit = globalThis.__karnamehExcelAudit,
    tx = EduV24.test
      .getConnection()
      .transaction(["records", "catalog"], "readwrite"),
    done = EduDataStoreRuntime.transactionDone(tx),
    records = tx.objectStore("records"),
    request = records.get(audit.ids.first + "|meta"),
    catalog = tx.objectStore("catalog"),
    current = catalog.get(audit.ids.first);
  request.onsuccess = () => {
    const row = request.result;
    row.value.settings.password = "synthetic-peer-password";
    records.put(row);
  };
  current.onsuccess = () => {
    const row = current.result;
    row.revision++;
    catalog.put(row);
  };
  await done;
}

// Native sharing is replaced only inside the isolated profile. No OS picker,
// external application or message is opened by this regression.
async function shareFlow({ cdp, evaluate, cases, delay, directory, fixture }) {
  let preparation = 0;
  const page = (fn, value = null) =>
      evaluate("(" + fn.toString() + ")(" + JSON.stringify(value) + ")"),
    check = (id, name, pass, observed = {}) =>
      cases.push({
        id: "KARNAMEH_XLSX_SHARE_" + id,
        name,
        pass: !!pass,
        observed,
      }),
    files = () =>
      fs
        .readdirSync(directory)
        .filter(
          (name) =>
            name.endsWith(".xlsx") && !name.startsWith("captured-shared-"),
        )
        .sort(),
    wait = async (predicate, message) => {
      for (let attempt = 0; attempt < 160; attempt++) {
        if (await predicate()) return;
        await delay(50);
      }
      throw Error(message);
    },
    status = () =>
      page(() => {
        const panel = document.getElementById("karnamehExcelPanel"),
          send = panel?.querySelector(
            '[data-workspace-action="karnameh-excel-send"]',
          ),
          save = panel?.querySelector(
            '[data-workspace-action="karnameh-excel-save"]',
          ),
          ready = panel?.querySelector("[data-karnameh-excel-ready]"),
          message = panel?.querySelector("[data-karnameh-excel-status]");
        return {
          ready: !!ready && !ready.hidden,
          sendHidden: !send || send.hidden,
          sendDisabled: !send || send.disabled,
          saveVisible: !!save && !save.hidden,
          saveDisabled: !save || save.disabled,
          state: message?.dataset.state,
          text: message?.textContent || "",
        };
      }),
    close = async () => {
      await page(() => closeModal());
      await wait(
        () =>
          page(
            () =>
              !!document.querySelector(
                "#karnamehTabOutput .karnameh-student-sheet",
              ),
          ),
        "Report did not return after sharing modal",
      );
      await delay(80);
    },
    prepare = async (scope, options = {}) => {
      await close();
      const before = files();
      await page((options) => {
        Object.assign(
          globalThis.__karnamehExcelAudit.share,
          { supported: true, mode: "success" },
          options,
        );
        document
          .querySelector('[data-workspace-action="karnameh-excel"]')
          .click();
      }, options);
      await wait(
        () =>
          page(
            () =>
              !!document.querySelector(
                "#modal:not(.hidden) #karnamehExcelPanel",
              ),
          ),
        "Sharing export modal did not open",
      );
      await page(() =>
        document
          .querySelector(
            '[data-workspace-action="karnameh-excel-mode"][data-delivery="share"]',
          )
          .click(),
      );
      await page(
        (scope) =>
          document
            .querySelector('#karnamehExcelPanel [data-scope="' + scope + '"]')
            .click(),
        scope,
      );
      await wait(async () => {
        const current = await status();
        return current.ready && current.saveVisible && !current.saveDisabled;
      }, "Share preparation did not reveal an explicit fallback");
      check(
        "PREPARE_" + scope + "_" + ++preparation,
        "Preparing " +
          scope +
          " sharing never automatically downloads a workbook",
        JSON.stringify(files()) === JSON.stringify(before),
      );
    },
    trustedClick = async (selector) => {
      let point;
      await wait(async () => {
        point = await page((selector) => {
          const button = document.querySelector(selector);
          if (!button || button.disabled || button.hidden) return null;
          button.scrollIntoView({ block: "center", inline: "nearest" });
          const r = button.getBoundingClientRect(),
            x = r.left + r.width / 2,
            y = r.top + r.height / 2;
          return button.contains(document.elementFromPoint(x, y))
            ? { x, y }
            : null;
        }, selector);
        return !!point;
      }, "Sharing action is not pointer-ready: " + selector);
      await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
      await cdp("Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...point,
        button: "left",
        buttons: 1,
        clickCount: 1,
      });
      await cdp("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...point,
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
    },
    sendSelector = '[data-workspace-action="karnameh-excel-send"]',
    saveSelector = '[data-workspace-action="karnameh-excel-save"]';
  await page(() => {
    const share = {
      descriptors: ["share", "canShare"].map((key) => [
        key,
        Object.getOwnPropertyDescriptor(navigator, key),
      ]),
      supported: true,
      mode: "success",
      calls: [],
      afterMicrotask: true,
    };
    globalThis.__karnamehExcelAudit.share = share;
    share.capture = (event) => {
      if (
        !event.target.closest?.('[data-workspace-action="karnameh-excel-send"]')
      )
        return;
      share.nativeCheckInClick = true;
      share.trusted = event.isTrusted;
    };
    document.addEventListener("click", share.capture, true);
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: (payload) => {
        // Chromium may drain microtasks between separate DOM listeners. Start
        // this checkpoint inside the application's send-time capability probe.
        if (share.nativeCheckInClick) {
          share.nativeCheckInClick = false;
          share.afterMicrotask = false;
          queueMicrotask(() => {
            share.afterMicrotask = true;
          });
        }
        return (
          share.supported &&
          payload?.files?.length === 1 &&
          payload.files[0] instanceof File
        );
      },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload) => {
        const file = payload?.files?.[0],
          call = {
            activation: navigator.userActivation?.isActive === true,
            beforeAwait: !share.afterMicrotask,
            trusted: share.trusted,
            fileCount: payload?.files?.length || 0,
            isFile: file instanceof File,
            name: file?.name || "",
            type: file?.type || "",
            size: file?.size || 0,
            base64: "",
            complete: false,
            mode: share.mode,
          };
        share.calls.push(call);
        if (file) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let start = 0; start < bytes.length; start += 32768)
            binary += String.fromCharCode(
              ...bytes.subarray(start, start + 32768),
            );
          call.base64 = btoa(binary);
        }
        call.complete = true;
        if (call.mode === "abort")
          throw new DOMException("Synthetic user cancellation", "AbortError");
        if (call.mode === "denied")
          throw new DOMException("Synthetic policy refusal", "NotAllowedError");
      },
    });
  });
  try {
    const reportBefore = await page(uiState);
    for (const scope of ["student", "class"]) {
      await prepare(scope);
      if (scope === "student") {
        for (const width of [320, 390, 768]) {
          await cdp("Emulation.setDeviceMetricsOverride", {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: width < 1000,
          });
          const geometry = await page(() => {
            const panel = document.getElementById("karnamehExcelPanel"),
              dialog = panel.closest(".modal-dialog"),
              rect = dialog.getBoundingClientRect(),
              buttons = [
                ...panel.querySelectorAll(
                  '[data-workspace-action="karnameh-excel-send"],[data-workspace-action="karnameh-excel-save"]',
                ),
              ].filter((button) => !button.hidden);
            return {
              fits:
                panel.scrollWidth <= panel.clientWidth + 1 &&
                rect.left >= -1 &&
                rect.right <= innerWidth + 1 &&
                rect.height <= innerHeight + 1 &&
                document.documentElement.scrollWidth <= innerWidth + 1,
              touch:
                buttons.length === 2 &&
                buttons.every(
                  (button) =>
                    button.getBoundingClientRect().height >= 44 &&
                    button.scrollWidth <= button.clientWidth + 1,
                ),
            };
          });
          const screenshot = path.join(
              directory,
              "share-modal-" + width + ".png",
            ),
            image = await cdp("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(screenshot, Buffer.from(image.data, "base64"));
          check(
            "LAYOUT_" + width,
            "Prepared share controls fit at " + width,
            geometry.fits && geometry.touch,
            { ...geometry, screenshot },
          );
        }
      }
      const before = files(),
        count = await page(
          () => globalThis.__karnamehExcelAudit.share.calls.length,
        );
      await trustedClick(sendSelector);
      await wait(
        () =>
          page(
            () => globalThis.__karnamehExcelAudit.share.calls.at(-1)?.complete,
          ),
        "Synthetic share did not receive its File",
      );
      await wait(
        async () => !(await status()).sendDisabled,
        "Share controls did not return after native handoff",
      );
      const call = await page(() =>
          globalThis.__karnamehExcelAudit.share.calls.at(-1),
        ),
        bytes = Buffer.from(call.base64, "base64"),
        sharedPath = path.join(directory, "captured-shared-" + scope + ".xlsx");
      fs.writeFileSync(sharedPath, bytes);
      const workbook = require("./xlsx-reader.cjs")(sharedPath),
        cells = workbook.sheets.flatMap((sheet) =>
          sheet.rows.flatMap((row) => Object.values(row.cells)),
        ),
        includes = (name) =>
          cells.some((value) => String(value).includes(name));
      check(
        "FILE_" + scope.toUpperCase(),
        "A trusted click shares the complete " +
          scope +
          " XLSX synchronously with activation",
        call.activation &&
          call.beforeAwait &&
          call.trusted &&
          call.isFile &&
          call.fileCount === 1 &&
          call.type ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
          call.size === bytes.length &&
          bytes.readUInt32LE(0) === 0x04034b50 &&
          (await page(
            () => globalThis.__karnamehExcelAudit.share.calls.length,
          )) ===
            count + 1 &&
          (scope === "student"
            ? includes(fixture.students[1].name) &&
              !includes(fixture.students[0].name) &&
              !includes(fixture.students[2].name)
            : fixture.students.every((student) => includes(student.name))) &&
          JSON.stringify(
            files().filter((name) => !name.startsWith("captured-shared-")),
          ) === JSON.stringify(before),
        {
          activation: call.activation,
          beforeAwait: call.beforeAwait,
          fileCount: call.fileCount,
          name: call.name,
          bytes: bytes.length,
        },
      );
      const beforeFallback = new Set(files());
      await trustedClick(saveSelector);
      let downloaded;
      await wait(() => {
        downloaded = files().find((name) => !beforeFallback.has(name));
        return !!downloaded;
      }, "Explicit prepared-file fallback was not downloaded");
      check(
        "IDENTICAL_FALLBACK_" + scope.toUpperCase(),
        "Explicit fallback downloads exactly the same bytes as the shared File",
        fs.readFileSync(path.join(directory, downloaded)).equals(bytes),
        { downloaded },
      );
    }
    for (const mode of ["abort", "denied"]) {
      await prepare("student", { mode });
      const before = files(),
        count = await page(
          () => globalThis.__karnamehExcelAudit.share.calls.length,
        );
      await trustedClick(sendSelector);
      await wait(async () => {
        const current = await status();
        return (
          !current.sendDisabled &&
          current.state !== "working" &&
          current.text.includes(mode === "abort" ? "لغو" : "انجام نشد")
        );
      }, "Rejected native share did not expose its explicit fallback");
      const current = await status();
      check(
        mode.toUpperCase(),
        "Native " +
          mode +
          " leaves fallback available without downloading automatically",
        current.saveVisible &&
          !current.saveDisabled &&
          (await page(
            () => globalThis.__karnamehExcelAudit.share.calls.length,
          )) ===
            count + 1 &&
          JSON.stringify(files()) === JSON.stringify(before),
        current,
      );
    }
    await prepare("class", { supported: false });
    const unsupported = await status(),
      count = await page(
        () => globalThis.__karnamehExcelAudit.share.calls.length,
      ),
      beforeUnsupported = new Set(files());
    await trustedClick(saveSelector);
    await wait(
      () => files().some((name) => !beforeUnsupported.has(name)),
      "Unsupported-browser fallback did not download",
    );
    check(
      "UNSUPPORTED",
      "Unsupported file sharing retains download without invoking native sharing",
      unsupported.sendHidden &&
        unsupported.saveVisible &&
        !unsupported.saveDisabled &&
        (await page(
          () => globalThis.__karnamehExcelAudit.share.calls.length,
        )) === count,
      unsupported,
    );
    await close();
    const reportAfter = await page(uiState);
    check(
      "PRESERVE_REPORT",
      "All sharing and fallback flows leave report HTML, student and stage selection unchanged",
      reportBefore.html === reportAfter.html &&
        reportBefore.selection === reportAfter.selection &&
        JSON.stringify(reportBefore.stage) ===
          JSON.stringify(reportAfter.stage),
    );
    for (const reason of ["selection", "local-revision"]) {
      await prepare("student");
      const before = files(),
        calls = await page(
          () => globalThis.__karnamehExcelAudit.share.calls.length,
        );
      await page((reason) => {
        const share = globalThis.__karnamehExcelAudit.share;
        if (reason === "selection") {
          share.previousStudent = karnamehFilter.studentId;
          karnamehFilter.studentId =
            globalThis.__karnamehExcelAudit.students[0].id;
        } else {
          share.owner = EduV24.test.getState().workspace;
          share.previousRevision = share.owner.revision;
          share.owner.revision++;
        }
      }, reason);
      await trustedClick(sendSelector);
      await wait(
        async () => (await status()).state === "error",
        "A stale prepared share was not rejected",
      );
      check(
        "STALE_" + reason.toUpperCase(),
        "Changed " + reason + " cannot send or download a prepared workbook",
        (await page(
          () => globalThis.__karnamehExcelAudit.share.calls.length,
        )) === calls && JSON.stringify(files()) === JSON.stringify(before),
      );
      await page(() => {
        const share = globalThis.__karnamehExcelAudit.share;
        if (share.previousStudent) {
          karnamehFilter.studentId = share.previousStudent;
          delete share.previousStudent;
        }
        if (share.owner) {
          share.owner.revision = share.previousRevision;
          delete share.owner;
        }
      });
    }
    await prepare("class");
    const peerBefore = files(),
      peerCalls = await page(
        () => globalThis.__karnamehExcelAudit.share.calls.length,
      );
    await page(async () => {
      const audit = globalThis.__karnamehExcelAudit,
        tx = EduV24.test.getConnection().transaction("catalog", "readwrite"),
        done = EduDataStoreRuntime.transactionDone(tx),
        store = tx.objectStore("catalog"),
        request = store.get(audit.ids.first);
      request.onsuccess = () => {
        const row = request.result;
        row.revision++;
        store.put(row);
      };
      await done;
    });
    await trustedClick(saveSelector);
    await wait(
      async () => (await status()).state === "error",
      "A stale peer snapshot was not rejected by explicit fallback",
    );
    check(
      "STALE_PEER_FALLBACK",
      "Explicit fallback revalidates persisted peer revisions before downloading",
      files().length === peerBefore.length &&
        (await page(
          () => globalThis.__karnamehExcelAudit.share.calls.length,
        )) === peerCalls,
    );
    await page(resetFixture);
    await wait(
      () =>
        page(
          () =>
            !!document.querySelector(
              "#karnamehTabOutput .karnameh-student-sheet",
            ),
        ),
      "Peer notification fixture did not render",
    );
    await prepare("class");
    const notifiedBefore = files(),
      notifiedCalls = await page(
        () => globalThis.__karnamehExcelAudit.share.calls.length,
      );
    await page(async () => {
      const audit = globalThis.__karnamehExcelAudit,
        tx = EduV24.test.getConnection().transaction("catalog", "readwrite"),
        done = EduDataStoreRuntime.transactionDone(tx),
        store = tx.objectStore("catalog"),
        request = store.get(audit.ids.first);
      let revision;
      request.onsuccess = () => {
        const row = request.result;
        revision = ++row.revision;
        store.put(row);
      };
      await done;
      const peer = new BroadcastChannel("EduManager24");
      peer.postMessage({ workspace: audit.ids.first, revision });
      peer.close();
    });
    await wait(async () => {
      const current = await status();
      return (
        current.state === "error" &&
        !current.ready &&
        current.sendDisabled &&
        current.saveDisabled
      );
    }, "Peer revision notification did not revoke the prepared workbook");
    check(
      "PEER_NOTIFICATION",
      "A normal peer revision notification revokes both native send and cached-file download",
      files().length === notifiedBefore.length &&
        (await page(
          () => globalThis.__karnamehExcelAudit.share.calls.length,
        )) === notifiedCalls,
      await status(),
    );
  } finally {
    await page(() => {
      const share = globalThis.__karnamehExcelAudit?.share;
      if (!share) return;
      if (share.previousStudent)
        karnamehFilter.studentId = share.previousStudent;
      if (share.owner) share.owner.revision = share.previousRevision;
      document.removeEventListener("click", share.capture, true);
      for (const [key, descriptor] of share.descriptors) {
        if (descriptor) Object.defineProperty(navigator, key, descriptor);
        else delete navigator[key];
      }
      delete globalThis.__karnamehExcelAudit.share;
      closeModal();
    });
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
}
async function run(env) {
  const { cdp, evaluate, cases, delay } = env,
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "edu-karnameh-excel-")),
    page = (fn, value = null) =>
      evaluate("(" + fn.toString() + ")(" + JSON.stringify(value) + ")"),
    check = (id, name, pass, observed = {}) =>
      cases.push({ id: "KARNAMEH_XLSX_" + id, name, pass: !!pass, observed }),
    wait = async (predicate, message) => {
      for (let attempt = 0; attempt < 160; attempt++) {
        if (await predicate()) return;
        await delay(50);
      }
      throw Error(message);
    },
    files = () =>
      fs
        .readdirSync(directory)
        .filter((name) => name.endsWith(".xlsx"))
        .sort(),
    waitSheet = () =>
      wait(
        () =>
          page(
            () =>
              !!document.querySelector(
                "#karnamehTabOutput .karnameh-student-sheet",
              ),
          ),
        "Student report did not render",
      ),
    open = async () => {
      await page(() =>
        document
          .querySelector('[data-workspace-action="karnameh-excel"]')
          .click(),
      );
      await wait(
        () =>
          page(
            () =>
              !!document.querySelector(
                "#modal:not(.hidden) #karnamehExcelPanel",
              ),
          ),
        "Actual export button did not open its modal",
      );
    },
    download = async (scope) => {
      const before = files();
      await page(
        (value) =>
          document
            .querySelector(
              '#karnamehExcelPanel [data-workspace-action="karnameh-excel-download"][data-scope="' +
                value +
                '"]',
            )
            .click(),
        scope,
      );
      let name;
      await wait(() => {
        name = files().find((file) => !before.includes(file));
        return !!name;
      }, "Karnameh XLSX was not downloaded: " + scope);
      const filename = path.join(directory, name),
        bytes = fs.readFileSync(filename),
        workbook = require("./xlsx-reader.cjs")(filename);
      return {
        filename,
        name,
        bytes,
        workbook,
        cells: workbook.sheets.flatMap((sheet) =>
          sheet.rows.flatMap((row) => Object.values(row.cells)),
        ),
      };
    },
    close = async () => {
      await page(
        () =>
          document
            .querySelector('#modalBody [data-workspace-action="close"]')
            ?.click() || closeModal(),
      );
      await waitSheet();
      await delay(80);
    };
  await require("./browser-ready.cjs")(env);
  await cdp("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: directory,
  });
  let fixture;
  try {
    fixture = await page(setup);
    await page(resetFixture);
    await waitSheet();
    await page(async () => {
      const assessment = document.querySelector(
          '[data-karnameh-stage="second-final"]',
        ),
        module = document.querySelector('[data-karnameh-stage="module-1"]');
      assessment?.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      module?.click();
    });
    await delay(80);
    const baseline = await page(uiState);
    check(
      "ENTRY",
      "One export control is added to filters while existing report controls stay intact",
      baseline.entryCount === 1 &&
        baseline.entryOutsideReport &&
        baseline.printCount === 1 &&
        baseline.next &&
        baseline.previous &&
        baseline.tables.length === 3,
      { ...baseline, html: undefined, tables: baseline.tables.length },
    );
    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      const before = await page(uiState);
      await open();
      await delay(80);
      const geometry = await page(() => {
        const panel = document.getElementById("karnamehExcelPanel"),
          buttons = [
            ...panel.querySelectorAll(
              '[data-workspace-action="karnameh-excel-download"]',
            ),
          ];
        return {
          fits:
            document.documentElement.scrollWidth <= innerWidth + 1 &&
            panel.scrollWidth <= panel.clientWidth + 1 &&
            buttons.every(
              (button) => button.scrollWidth <= button.clientWidth + 1,
            ),
          scopes: buttons.map((button) => button.dataset.scope).sort(),
          touch: buttons.every(
            (button) => button.getBoundingClientRect().height >= 44,
          ),
          student: panel.textContent.includes(
            globalThis.__karnamehExcelAudit.students[1].name,
          ),
          status: !!panel.querySelector(
            '[data-karnameh-excel-status][role="status"][aria-live]',
          ),
        };
      });
      check(
        "MODAL_" + width,
        "Export modal has both scopes and usable controls at " + width,
        geometry.fits &&
          geometry.touch &&
          geometry.student &&
          geometry.status &&
          geometry.scopes.join(",") === "class,student",
        geometry,
      );
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(directory, "modal-" + width + ".png"),
        Buffer.from(shot.data, "base64"),
      );
      await close();
      const after = await page(uiState);
      check(
        "PRESERVE_" + width,
        "Opening export preserves all report HTML, stages, pagination and print controls",
        before.html === after.html &&
          before.selection === after.selection &&
          JSON.stringify(before.stage) === JSON.stringify(after.stage),
        {
          stages: after.stage,
          position: after.position,
          tables: after.tables.length,
        },
      );
    }
    await cdp("Network.enable");
    await cdp("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    const beforeExport = await page(uiState);
    await open();
    const student = await download("student"),
      wholeClass = await download("class");
    const validZip = (file) =>
      file.bytes.readUInt32LE(0) === 0x04034b50 &&
      file.workbook.sheets.length > 0;
    const contains = (file, value) =>
      file.cells.some((cell) => String(cell).includes(value));
    check(
      "STUDENT_FILE",
      "Actual offline individual XLSX contains only the selected student's complete lesson data",
      validZip(student) &&
        contains(student, fixture.students[1].name) &&
        !contains(student, fixture.students[0].name) &&
        !contains(student, fixture.students[2].name) &&
        [
          "کاربر گرافیک عملی و نظری",
          "درس عمومی آزمایشی",
          "درس فنی پودمانی آزمایشی",
        ].every((name) => contains(student, name)),
      {
        filename: student.name,
        sheets: student.workbook.sheets.map((sheet) => sheet.name),
        bytes: student.bytes.length,
      },
    );
    check(
      "CLASS_FILE",
      "Actual offline class XLSX includes active and archived students, weighted/zero grades and no other class",
      validZip(wholeClass) &&
        fixture.students.every((person) => contains(wholeClass, person.name)) &&
        !contains(wholeClass, "هنرجوی خارج از کلاس") &&
        wholeClass.cells.includes("0") &&
        wholeClass.cells.includes("6") &&
        contains(wholeClass, "پودمان اول آزمایشی"),
      {
        filename: wholeClass.name,
        sheets: wholeClass.workbook.sheets.map((sheet) => sheet.name),
        bytes: wholeClass.bytes.length,
      },
    );
    check(
      "FILENAMES",
      "Downloaded filenames include teacher and Persian date",
      [student, wholeClass].every(
        (file) =>
          file.name.includes(fixture.teacher) &&
          /_1[34][0-9]{2}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}_/.test(
            file.name,
          ) &&
          !/[<>:"/\\|?*]/.test(file.name),
      ),
      { student: student.name, classroom: wholeClass.name },
    );
    await close();
    const afterExport = await page(uiState);
    check(
      "EXPORT_PRESERVES_REPORT",
      "Both downloads preserve exact report document, selected student and stage preferences",
      beforeExport.html === afterExport.html &&
        beforeExport.selection === afterExport.selection &&
        JSON.stringify(beforeExport.stage) ===
          JSON.stringify(afterExport.stage),
    );
    await shareFlow({ cdp, evaluate, cases, delay, directory, fixture });
    await page(() =>
      EduV24.openKarnamehStudent(
        globalThis.__karnamehExcelAudit.ids.classroom,
        globalThis.__karnamehExcelAudit.students[2].id,
      ),
    );
    await waitSheet();
    await open();
    const archived = await download("student");
    check(
      "ARCHIVED",
      "An individually selected archived student can be exported without leaking another student",
      contains(archived, fixture.students[2].name) &&
        !contains(archived, fixture.students[0].name) &&
        !contains(archived, fixture.students[1].name) &&
        archived.cells.includes("0"),
    );
    await close();
    await page(resetFixture);
    await waitSheet();
    await page(protectPeer);
    await page(() => {
      window.prompt = () => null;
    });
    await open();
    const protectedBefore = files().length;
    await page(() =>
      document
        .querySelector('#karnamehExcelPanel [data-scope="student"]')
        .click(),
    );
    await wait(
      () =>
        page(() =>
          /دسترسی|تأیید|رمز/.test(
            document.querySelector("[data-karnameh-excel-status]")
              ?.textContent || "",
          ),
        ),
      "Protected peer denial was not shown in the modal",
    );
    check(
      "AUTH_DENIED",
      "A protected peer term cannot be exported after password cancellation",
      files().length === protectedBefore,
    );
    await page(resetFixture);
    await waitSheet();
    await page(protectPeer);
    await page(() => {
      const audit = globalThis.__karnamehExcelAudit;
      audit.entered = false;
      audit.exited = false;
      window.prompt = () => "synthetic-peer-password";
      verifyPassword = async () => {
        audit.entered = true;
        await new Promise((resolve) => {
          audit.release = resolve;
        });
        audit.exited = true;
        return true;
      };
    });
    await open();
    const staleBefore = files().length;
    await page(() =>
      document
        .querySelector('#karnamehExcelPanel [data-scope="student"]')
        .click(),
    );
    await wait(
      () => page(() => globalThis.__karnamehExcelAudit.entered),
      "Expected peer-authentication checkpoint was not reached",
    );
    await page(() => {
      karnamehFilter.studentId = globalThis.__karnamehExcelAudit.students[0].id;
      globalThis.__karnamehExcelAudit.release();
    });
    await wait(
      () => page(() => globalThis.__karnamehExcelAudit.exited),
      "Paused peer authentication did not finish",
    );
    await delay(300);
    check(
      "STALE_SELECTION",
      "Changing the selected student while authentication waits prevents any download",
      files().length === staleBefore,
    );
    await page(resetFixture);
    await waitSheet();
    await page(protectPeer);
    await page(() => {
      const audit = globalThis.__karnamehExcelAudit;
      audit.entered = false;
      audit.exited = false;
      window.prompt = () => "synthetic-peer-password";
      verifyPassword = async () => {
        audit.entered = true;
        await new Promise((resolve) => {
          audit.release = resolve;
        });
        audit.exited = true;
        return true;
      };
    });
    await open();
    const revisionBefore = files().length;
    await page(() =>
      document
        .querySelector('#karnamehExcelPanel [data-scope="class"]')
        .click(),
    );
    await wait(
      () => page(() => globalThis.__karnamehExcelAudit.entered),
      "Expected revision-race checkpoint was not reached",
    );
    await page(async () => {
      const audit = globalThis.__karnamehExcelAudit,
        tx = EduV24.test.getConnection().transaction("catalog", "readwrite"),
        done = EduDataStoreRuntime.transactionDone(tx),
        store = tx.objectStore("catalog"),
        request = store.get(audit.ids.first);
      request.onsuccess = () => {
        const row = request.result;
        row.revision++;
        store.put(row);
      };
      await done;
      audit.release();
    });
    await wait(
      () =>
        page(() =>
          /تغییر|دوباره/.test(
            document.querySelector("[data-karnameh-excel-status]")
              ?.textContent || "",
          ),
        ),
      "Peer revision conflict was not shown",
    );
    check(
      "STALE_PEER_REVISION",
      "A peer revision changed during authentication cannot produce a stale class workbook",
      files().length === revisionBefore,
    );
    await page(resetFixture, { partial: true });
    await waitSheet();
    await open();
    const partial = await download("student"),
      partialText = partial.cells.join(" ");
    check(
      "PARTIAL_YEAR",
      "Partial-year export remains available with an explicit missing-first-term explanation",
      validZip(partial) &&
        /نوبت اول/.test(partialText) &&
        /شروع|ثبت|دسترس|موجود|ناقص/.test(partialText),
    );
    check(
      "ARTIFACTS",
      "Real XLSX downloads and mobile modal screenshots were captured locally",
      true,
      { directory },
    );
  } finally {
    await cdp("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    }).catch(() => {});
    await cdp("Browser.setDownloadBehavior", { behavior: "default" });
    await cdp("Emulation.clearDeviceMetricsOverride");
    await page(async () => {
      const audit = globalThis.__karnamehExcelAudit;
      if (!audit) return;
      audit.release?.();
      window.prompt = () => null;
      verifyPassword = audit.oldVerify;
      closeModal();
      EduV24.previewFullBackup(audit.original);
      document.getElementById("fullRestoreConfirmed").checked = true;
      await EduV24.restoreFullBackup();
      await EduV24.test.settle();
      window.prompt = audit.oldPrompt;
      delete globalThis.__karnamehExcelAudit;
    });
  }
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "academic-karnameh-excel", runExtra: run })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    });
