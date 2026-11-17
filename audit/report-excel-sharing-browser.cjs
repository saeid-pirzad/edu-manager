"use strict";

// Called inside the existing synthetic, offline Excel fixture. Native sharing
// is always replaced with a local spy; no OS picker or message is sent.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");

module.exports = async function run({
  cdp,
  evaluate,
  cases,
  delay,
  directory,
  setup,
}) {
  const artifacts = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-excel-sharing-"),
  );
  const page = (fn, value = null) =>
    evaluate("(" + fn.toString() + ")(" + JSON.stringify(value) + ")");
  const check = (id, name, pass, observed = {}) =>
    cases.push({ id, name, pass: !!pass, observed });
  const files = () => fs.readdirSync(directory).sort();
  const wait = async (fn, message) => {
    for (let attempt = 0; attempt < 160; attempt++) {
      if (await fn()) return;
      await delay(50);
    }
    throw Error(message);
  };
  const key = async (value, code, modifiers = 0) => {
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: value,
      code,
      modifiers,
    });
    await cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: value,
      code,
      modifiers,
    });
  };
  const trustedClick = async (selector) => {
    let readiness;
    try {
      await wait(async () => {
        readiness = await page(async (target) => {
          const button = document.querySelector(target),
            modal = document.getElementById("modal");
          if (!button) return { ready: false, selector: target, missing: true };
          if (!button.disabled && !button.hidden)
            button.scrollIntoView({ block: "center", inline: "nearest" });
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const rect = button.getBoundingClientRect(),
            x = rect.left + rect.width / 2,
            y = rect.top + rect.height / 2,
            hit = document.elementFromPoint(x, y),
            modalHidden = !modal || modal.classList.contains("hidden");
          return {
            ready:
              button.isConnected &&
              !button.disabled &&
              !button.hidden &&
              !modalHidden &&
              rect.width > 0 &&
              rect.height > 0 &&
              x >= 0 &&
              x < innerWidth &&
              y >= 0 &&
              y < innerHeight &&
              button.contains(hit),
            x,
            y,
            selector: target,
            disabled: button.disabled,
            hidden: button.hidden,
            modalHidden,
            rect: rect.toJSON(),
            target: button.outerHTML.slice(0, 250),
            hit: hit?.outerHTML.slice(0, 250) || null,
          };
        }, selector);
        return readiness.ready;
      }, "The share control did not become pointer-ready");
    } catch (error) {
      throw Error(error.message + ": " + JSON.stringify(readiness), {
        cause: error,
      });
    }
    const point = { x: readiness.x, y: readiness.y };
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...point,
    });
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
  };
  const open = async ({ supported = true, mode = "success" } = {}) => {
    await page(
      (options) => {
        window.__excelShareAudit.previousPanel = document.querySelector(
          "#reportExcelSharePanel",
        );
        closeModal();
        Object.assign(window.__excelShareAudit, options);
        const button = document.querySelector("[data-periodic-excel-share]");
        if (!button || button.disabled)
          throw Error("The real report Excel-share button is unavailable");
        button.focus({ preventScroll: true });
        button.click();
      },
      { supported, mode },
    );
    await wait(
      () =>
        page(() => {
          const panel = document.querySelector("#reportExcelSharePanel"),
            modal = document.getElementById("modal");
          return (
            !!panel &&
            panel !== window.__excelShareAudit.previousPanel &&
            !!modal &&
            !modal.classList.contains("hidden") &&
            panel.getBoundingClientRect().width > 0
          );
        }),
      "The actual report-share button did not open its modal",
    );
  };
  const status = () =>
    page(() => {
      const panel = document.querySelector("#reportExcelSharePanel"),
        send = panel?.querySelector("[data-report-share-send]"),
        download = panel?.querySelector("[data-report-share-download]"),
        state = panel?.querySelector("[data-report-share-status]");
      return {
        text: state?.textContent || "",
        state: state?.dataset.state || "",
        sendHidden: !!send?.hidden,
        sendDisabled: !!send?.disabled,
        downloadVisible:
          !!download &&
          !download.hidden &&
          download.getBoundingClientRect().width > 0,
        downloadDisabled: !!download?.disabled,
      };
    });

  try {
    await page(() => {
      const state = {
        shareDescriptor: Object.getOwnPropertyDescriptor(navigator, "share"),
        canShareDescriptor: Object.getOwnPropertyDescriptor(
          navigator,
          "canShare",
        ),
        supported: true,
        mode: "success",
        calls: [],
        scope: null,
        revisionOwner: null,
        previousRevision: null,
      };
      window.__excelShareAudit = state;
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: (payload) =>
          state.supported &&
          Array.isArray(payload?.files) &&
          payload.files.length === 1 &&
          payload.files[0] instanceof File,
      });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (payload) => {
          const file = payload?.files?.[0],
            call = {
              activation: navigator.userActivation?.isActive === true,
              fileCount: payload?.files?.length || 0,
              isFile: file instanceof File,
              name: file?.name || "",
              type: file?.type || "",
              size: file?.size || 0,
              base64: "",
              complete: false,
              mode: state.mode,
            };
          state.calls.push(call);
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
          if (call.mode === "pending")
            await new Promise((resolve) => {
              state.releaseShare = resolve;
            });
          call.settled = true;
          if (call.mode === "abort")
            throw new DOMException("Synthetic cancellation", "AbortError");
          if (call.mode === "denied")
            throw new DOMException(
              "Synthetic permission refusal",
              "NotAllowedError",
            );
        },
      });
    });

    await open();
    for (const width of [320, 390, 768, 1280]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 1000,
      });
      const observed = await page(() => {
        const panel = document.querySelector("#reportExcelSharePanel"),
          dialog = panel.closest(".modal-dialog"),
          native = panel.querySelector("[data-report-share-send]"),
          fallback = panel.querySelector("[data-report-share-download]"),
          exports = document.querySelector(".periodic-export-actions"),
          actions = [...exports.querySelectorAll("button")],
          rect = dialog.getBoundingClientRect();
        return {
          modalFits:
            panel.scrollWidth <= panel.clientWidth + 1 &&
            rect.left >= -1 &&
            rect.right <= innerWidth + 1 &&
            rect.height <= innerHeight + 1,
          pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
          buttonsFit: [native, fallback].every((button) => {
            const bounds = button.getBoundingClientRect();
            return (
              !button.hidden &&
              bounds.height >= 44 &&
              bounds.width > 0 &&
              button.scrollWidth <= button.clientWidth + 1
            );
          }),
          exportsFit:
            actions.length === 5 &&
            exports.scrollWidth <= exports.clientWidth + 1 &&
            actions.every(
              (button) =>
                button.getBoundingClientRect().height >= 44 &&
                button.scrollWidth <= button.clientWidth + 1,
            ),
          nativeAvailable: !native.hidden && !native.disabled,
        };
      });
      const screenshot = path.join(artifacts, "sharing-" + width + ".png"),
        capture = await cdp("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
      fs.writeFileSync(screenshot, Buffer.from(capture.data, "base64"));
      check(
        "XLSX_SHARE_LAYOUT_" + width,
        "Sharing modal and five export controls fit " + width + " pixels",
        observed.modalFits &&
          observed.pageFits &&
          observed.buttonsFit &&
          observed.exportsFit &&
          observed.nativeAvailable,
        { ...observed, screenshot },
      );
    }

    const semantics = await page(() => {
      const panel = document.querySelector("#reportExcelSharePanel"),
        dialog = panel.closest(".modal-dialog"),
        status = panel.querySelector("[data-report-share-status]");
      return {
        labelledDialog:
          dialog.getAttribute("role") === "dialog" &&
          dialog.getAttribute("aria-modal") === "true" &&
          document
            .getElementById(dialog.getAttribute("aria-labelledby"))
            ?.textContent.includes("اشتراک‌گذاری اکسل"),
        liveStatus:
          status.getAttribute("role") === "status" &&
          status.getAttribute("aria-live") === "polite",
        inertBackground: document.getElementById("app").inert,
        buttonOnly: !panel.querySelector(
          'input,textarea,select,[contenteditable="true"]',
        ),
        isolatedFilename: !!panel.querySelector("[data-report-share-file] bdi"),
      };
    });
    check(
      "XLSX_SHARE_ACCESSIBILITY",
      "Sharing exposes a labelled modal, live status and isolated filename without an on-screen keyboard field",
      Object.values(semantics).every(Boolean),
      semantics,
    );
    await page(() => {
      const nodes = modalFocusableElements();
      nodes.at(-1).focus();
    });
    await key("Tab", "Tab");
    const forward = await page(
      () => document.activeElement === modalFocusableElements()[0],
    );
    await key("Tab", "Tab", 8);
    const backward = await page(
      () => document.activeElement === modalFocusableElements().at(-1),
    );
    check(
      "XLSX_SHARE_FOCUS_TRAP",
      "Tab and Shift+Tab keep focus inside the real sharing modal",
      forward && backward,
      { forward, backward },
    );
    await key("Escape", "Escape");
    let returnFocusState = null;
    try {
      await wait(async () => {
        returnFocusState = await page(() => {
          const modalHidden = document
              .getElementById("modal")
              .classList.contains("hidden"),
            backgroundInert = document.getElementById("app").inert,
            active = document.activeElement,
            opener = document.querySelector("[data-periodic-excel-share]"),
            openerFocused = active === opener;
          return {
            ready: modalHidden && !backgroundInert && openerFocused,
            modalHidden,
            backgroundInert,
            openerFocused,
            activeElement: active?.outerHTML.slice(0, 300) || null,
            opener: opener?.outerHTML.slice(0, 300) || null,
            openerDisabled: !!opener?.disabled,
          };
        });
        return returnFocusState.ready;
      }, "Escape did not close sharing and return focus to its report button");
    } catch (error) {
      returnFocusState = { ...returnFocusState, error: error.message };
    }
    check(
      "XLSX_SHARE_ESCAPE_RETURN_FOCUS",
      "Escape closes sharing, unlocks the report and restores focus to its opener",
      returnFocusState?.ready,
      returnFocusState,
    );
    await open();
    const originalLabels = await page(() => {
      const panel = document.querySelector("#reportExcelSharePanel"),
        filename = panel.querySelector("[data-report-share-file] bdi"),
        identity = panel.querySelector(".report-share-heading p"),
        original = {
          filename: filename.textContent,
          identity: identity.textContent,
        };
      // DOM-only presentation probes never alter the real File or report scope.
      filename.textContent =
        "هنرستان_" + "VeryLongSchoolAndTeacherName".repeat(12) + "_گزارش.xlsx";
      identity.textContent =
        "هنرستان نمونه با نام طولانی و کلاس یازدهم شبکه ".repeat(4);
      return original;
    });
    for (const [width, height] of [
      [320, 568],
      [844, 390],
      [844, 250],
    ]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: true,
      });
      // Resize and visualViewport events update --app-viewport asynchronously.
      // Settle that layout before measuring or scrolling in the new viewport.
      await page(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const observed = await page(async () => {
        const panel = document.querySelector("#reportExcelSharePanel"),
          dialog = panel.closest(".modal-dialog"),
          overlay = document.getElementById("modal"),
          body = document.getElementById("modalBody"),
          header = dialog.querySelector(".modal-header"),
          bounds = dialog.getBoundingClientRect(),
          initialBodyBounds = body.getBoundingClientRect(),
          buttons = [...panel.querySelectorAll("button:not([hidden])")];
        const reachable = [],
          buttonBounds = [];
        for (const button of buttons) {
          button.scrollIntoView({ block: "center", inline: "nearest" });
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const rect = button.getBoundingClientRect(),
            bodyRect = body.getBoundingClientRect(),
            x = rect.left + rect.width / 2,
            y = rect.top + rect.height / 2,
            hit = document.elementFromPoint(x, y);
          reachable.push(
            rect.height >= 44 &&
              rect.top >= bodyRect.top - 1 &&
              rect.bottom <= bodyRect.bottom + 1 &&
              button.contains(hit),
          );
          buttonBounds.push({
            text: button.textContent.trim(),
            rect: rect.toJSON(),
            body: bodyRect.toJSON(),
            scrollTop: body.scrollTop,
            hit: hit?.outerHTML.slice(0, 150) || null,
            reachable: reachable.at(-1),
          });
        }
        return {
          dialogFits:
            bounds.left >= -1 &&
            bounds.right <= innerWidth + 1 &&
            bounds.top >= -1 &&
            bounds.bottom <= innerHeight + 1,
          contentFits:
            panel.scrollWidth <= panel.clientWidth + 1 &&
            body.scrollWidth <= body.clientWidth + 1,
          scrollable: /auto|scroll/.test(getComputedStyle(body).overflowY),
          allButtonsReachable: reachable.every(Boolean),
          viewport: { width: innerWidth, height: innerHeight },
          rects: {
            overlay: overlay.getBoundingClientRect().toJSON(),
            dialog: bounds.toJSON(),
            header: header.getBoundingClientRect().toJSON(),
            initialBody: initialBodyBounds.toJSON(),
            body: body.getBoundingClientRect().toJSON(),
          },
          styles: {
            appViewport: getComputedStyle(
              document.documentElement,
            ).getPropertyValue("--app-viewport"),
            visualViewport: window.visualViewport?.height,
            overlayPadding: getComputedStyle(overlay).padding,
            dialogMaxHeight: getComputedStyle(dialog).maxHeight,
            bodyPadding: getComputedStyle(body).padding,
          },
          buttons: buttonBounds,
        };
      });
      if (height <= 390) {
        const screenshot = path.join(
            artifacts,
            "sharing-long-name-" + width + "x" + height + ".png",
          ),
          capture = await cdp("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
          });
        fs.writeFileSync(screenshot, Buffer.from(capture.data, "base64"));
        observed.screenshot = screenshot;
      }
      check(
        "XLSX_SHARE_LONG_NAME_" + width + "_" + height,
        "Long RTL/Latin names wrap and sharing actions remain reachable in a short viewport",
        observed.dialogFits &&
          observed.contentFits &&
          observed.scrollable &&
          observed.allButtonsReachable,
        observed,
      );
    }
    await page((original) => {
      const panel = document.querySelector("#reportExcelSharePanel");
      panel.querySelector("[data-report-share-file] bdi").textContent =
        original.filename;
      panel.querySelector(".report-share-heading p").textContent =
        original.identity;
      document.getElementById("modalBody").scrollTop = 0;
    }, originalLabels);
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });

    await open({ mode: "pending" });
    const beforePending = files(),
      pendingCalls = await page(() => window.__excelShareAudit.calls.length);
    await trustedClick("[data-report-share-send]");
    await wait(
      () =>
        page(() => typeof window.__excelShareAudit.releaseShare === "function"),
      "The pending synthetic share did not reach its local gate",
    );
    const pending = await status();
    await page(() => {
      document.querySelector("[data-report-share-send]").click();
      document.querySelector("[data-report-share-download]").click();
    });
    const pendingCount = await page(
      () => window.__excelShareAudit.calls.length,
    );
    await page(() => {
      window.__excelShareAudit.releaseShare();
      delete window.__excelShareAudit.releaseShare;
    });
    await wait(
      async () => !(await status()).sendDisabled,
      "The finished share did not unlock its actions",
    );
    check(
      "XLSX_SHARE_PENDING_ACTIONS",
      "A pending share disables competing actions, ignores repeated clicks and unlocks after completion",
      pending.sendDisabled &&
        pending.downloadDisabled &&
        pendingCount === pendingCalls + 1 &&
        JSON.stringify(files()) === JSON.stringify(beforePending),
      {
        sendDisabled: pending.sendDisabled,
        downloadDisabled: pending.downloadDisabled,
        sharesAdded: pendingCount - pendingCalls,
      },
    );
    await open();

    await open({ mode: "pending" });
    await trustedClick("[data-report-share-send]");
    await wait(
      () =>
        page(() => typeof window.__excelShareAudit.releaseShare === "function"),
      "The replaceable share did not reach its local gate",
    );
    const beforeReplacement = files();
    await open();
    const replacementBefore = await status();
    await page(() => {
      window.__excelShareAudit.releaseShare();
      delete window.__excelShareAudit.releaseShare;
    });
    await wait(
      () => page(() => window.__excelShareAudit.calls.at(-1)?.settled),
      "The replaced sharing session did not settle",
    );
    // Let the old handler's await/finally finish before reading the new dialog.
    await page(() => new Promise(requestAnimationFrame));
    const replacementAfter = await status();
    check(
      "XLSX_SHARE_REPLACED_PENDING_DIALOG",
      "Closing and replacing a pending sharing dialog isolates its later status and control updates",
      JSON.stringify(replacementAfter) === JSON.stringify(replacementBefore) &&
        !replacementAfter.sendDisabled &&
        !replacementAfter.downloadDisabled &&
        JSON.stringify(files()) === JSON.stringify(beforeReplacement),
      { before: replacementBefore, after: replacementAfter },
    );

    const beforeNative = files();
    await trustedClick("[data-report-share-send]");
    await wait(
      async () =>
        (await status()).text.includes("سپرده") &&
        (await page(() => window.__excelShareAudit.calls.at(-1)?.complete)),
      "The synthetic native file share did not complete",
    );
    const shared = await page(() => window.__excelShareAudit.calls.at(-1)),
      bytes = Buffer.from(shared.base64, "base64"),
      sharedPath = path.join(artifacts, "shared-workbook.xlsx");
    fs.writeFileSync(sharedPath, bytes);
    const workbook = require("./xlsx-reader.cjs")(sharedPath),
      rows = (name) =>
        workbook.sheets
          .find((sheet) => sheet.name === name)
          ?.rows.filter((row) => row.number > 4).length || 0;
    check(
      "XLSX_SHARE_NATIVE_FILE",
      "A real pointer click shares one complete offline XLSX File with user activation",
      shared.activation &&
        shared.isFile &&
        shared.fileCount === 1 &&
        shared.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
        shared.name.endsWith("_گزارش-روزانه.xlsx") &&
        shared.size === bytes.length &&
        bytes.length > 4 &&
        bytes.readUInt32LE(0) === 0x04034b50 &&
        bytes.includes(Buffer.from("محمدرضا", "utf8")) &&
        rows("حضور و غیاب") === setup.participants &&
        rows("فعالیت‌ها") === setup.marks &&
        JSON.stringify(files()) === JSON.stringify(beforeNative),
      {
        activation: shared.activation,
        fileCount: shared.fileCount,
        name: shared.name,
        type: shared.type,
        bytes: bytes.length,
        attendanceRows: rows("حضور و غیاب"),
        activityRows: rows("فعالیت‌ها"),
      },
    );

    for (const mode of ["abort", "denied"]) {
      await open({ mode });
      const before = files(),
        calls = await page(() => window.__excelShareAudit.calls.length);
      await trustedClick("[data-report-share-send]");
      await wait(async () => {
        const current = await status();
        return (
          !current.sendDisabled &&
          current.text.includes(mode === "abort" ? "لغو شد" : "انجام نشد")
        );
      }, "The rejected synthetic share did not return to its fallback controls");
      await delay(250);
      const observed = await status(),
        next = await page(() => ({
          calls: window.__excelShareAudit.calls.length,
          activation: window.__excelShareAudit.calls.at(-1).activation,
        }));
      check(
        "XLSX_SHARE_" + mode.toUpperCase(),
        "Native " +
          mode +
          " keeps an explicit fallback without automatically downloading",
        next.calls === calls + 1 &&
          next.activation &&
          observed.downloadVisible &&
          !observed.downloadDisabled &&
          JSON.stringify(files()) === JSON.stringify(before) &&
          (mode === "abort"
            ? observed.state === "ready"
            : observed.state === "error"),
        {
          activation: next.activation,
          fallbackVisible: observed.downloadVisible,
          automaticDownload: JSON.stringify(files()) !== JSON.stringify(before),
          state: observed.state,
        },
      );
    }

    await open({ supported: false });
    const unsupported = await status(),
      callsBeforeFallback = await page(
        () => window.__excelShareAudit.calls.length,
      ),
      downloadsBefore = new Set(files());
    await trustedClick("[data-report-share-download]");
    let downloaded = null;
    await wait(async () => {
      downloaded =
        files().find(
          (name) => name.endsWith(".xlsx") && !downloadsBefore.has(name),
        ) || null;
      return !!downloaded;
    }, "The explicit unsupported-browser Excel fallback did not download");
    const fallbackWorkbook = require("./xlsx-reader.cjs")(
      path.join(directory, downloaded),
    );
    check(
      "XLSX_SHARE_UNSUPPORTED_DOWNLOAD",
      "Unsupported native sharing hides send and downloads the complete workbook only on request",
      unsupported.sendHidden &&
        unsupported.downloadVisible &&
        !unsupported.downloadDisabled &&
        (await page(() => window.__excelShareAudit.calls.length)) ===
          callsBeforeFallback &&
        (fallbackWorkbook.sheets
          .find((sheet) => sheet.name === "حضور و غیاب")
          ?.rows.filter((row) => row.number > 4).length || 0) ===
          setup.participants &&
        (fallbackWorkbook.sheets
          .find((sheet) => sheet.name === "فعالیت‌ها")
          ?.rows.filter((row) => row.number > 4).length || 0) === setup.marks,
      { nativeHidden: unsupported.sendHidden, file: downloaded },
    );

    for (const reason of ["scope", "revision"]) {
      await open();
      const count = await page(() => window.__excelShareAudit.calls.length),
        before = files();
      await page((changed) => {
        const state = window.__excelShareAudit;
        if (changed === "scope") {
          state.scope = { ...EduPeriodicReports.filters };
          EduPeriodicReports.filters.classId = "unrelated-share-scope";
        } else {
          state.revisionOwner = EduV24.test.getState().workspace;
          state.previousRevision = state.revisionOwner.revision;
          state.revisionOwner.revision++;
        }
      }, reason);
      await trustedClick("[data-report-share-send]");
      await wait(
        async () => (await status()).state === "error",
        "A stale share scope was not rejected",
      );
      const observed = await status();
      check(
        "XLSX_SHARE_STALE_" + reason.toUpperCase(),
        "Changed " + reason + " prevents sending a prepared report",
        (await page(() => window.__excelShareAudit.calls.length)) === count &&
          observed.sendDisabled &&
          observed.downloadDisabled &&
          observed.text.includes("تغییر") &&
          JSON.stringify(files()) === JSON.stringify(before),
        {
          sendDisabled: observed.sendDisabled,
          downloadDisabled: observed.downloadDisabled,
          callsAdded:
            (await page(() => window.__excelShareAudit.calls.length)) - count,
        },
      );
      await page(() => {
        const state = window.__excelShareAudit;
        if (state.scope) {
          Object.assign(EduPeriodicReports.filters, state.scope);
          state.scope = null;
        }
        if (state.revisionOwner) {
          state.revisionOwner.revision = state.previousRevision;
          state.revisionOwner = null;
        }
        closeModal();
      });
    }

    await page(() => {
      const state = window.__excelShareAudit,
        selectedSchool = db.schools.find(
          (school) => school.id === EduPeriodicReports.filters.schoolId,
        ),
        selectedClass =
          selectedSchool?.classes.find(
            (classroom) => classroom.id === EduPeriodicReports.filters.classId,
          ) || selectedSchool?.classes[0],
        selectedStudent = selectedClass?.students[0];
      if (!selectedStudent)
        throw Error("The synthetic parent-sharing fixture has no pupil");
      state.scope = { ...EduPeriodicReports.filters };
      state.parent = {
        name: selectedStudent.name,
        peers: selectedClass.students
          .filter((student) => student.id !== selectedStudent.id)
          .map((student) => student.name),
      };
      Object.assign(EduPeriodicReports.filters, {
        audience: "parent",
        classId: selectedClass.id,
        studentId: selectedStudent.id,
        detailLevel: "full",
      });
    });
    await page(async () => {
      closeModal();
      render();
      if (!(await EduPeriodicReports.generate()))
        throw Error(
          document.getElementById("periodicError")?.textContent ||
            "Cannot prepare the parent-sharing report",
        );
    });
    await open();
    const parentExpected = await page(() => {
      const model = EduPeriodicReports.getLast();
      return {
        ...window.__excelShareAudit.parent,
        participants: model.sessions.reduce(
          (total, session) => total + session.participants.length,
          0,
        ),
        marks: model.sessions.reduce(
          (total, session) => total + session.marks.length,
          0,
        ),
      };
    });
    await trustedClick("[data-report-share-send]");
    await wait(
      async () =>
        (await status()).text.includes("سپرده") &&
        (await page(() => window.__excelShareAudit.calls.at(-1)?.complete)),
      "The synthetic parent file share did not complete",
    );
    const parentCall = await page(() => window.__excelShareAudit.calls.at(-1)),
      parentPath = path.join(artifacts, "parent-shared-workbook.xlsx");
    fs.writeFileSync(parentPath, Buffer.from(parentCall.base64, "base64"));
    const parentWorkbook = require("./xlsx-reader.cjs")(parentPath),
      parentCells = parentWorkbook.sheets.flatMap((sheet) =>
        sheet.rows.flatMap((row) => Object.values(row.cells)),
      ),
      parentRows = (name) =>
        parentWorkbook.sheets
          .find((sheet) => sheet.name === name)
          ?.rows.filter((row) => row.number > 4).length || 0;
    check(
      "XLSX_SHARE_PARENT_PRIVACY",
      "A parent-shared File contains the selected pupil without classmates in its decoded workbook",
      parentCall.activation &&
        parentCall.fileCount === 1 &&
        parentCells.includes(parentExpected.name) &&
        parentExpected.peers.length > 0 &&
        parentExpected.peers.every(
          (name) => !parentCells.some((cell) => String(cell).includes(name)),
        ) &&
        parentRows("حضور و غیاب") === parentExpected.participants &&
        parentRows("فعالیت‌ها") === parentExpected.marks,
      {
        activation: parentCall.activation,
        classmatesExcluded: parentExpected.peers.length,
        attendanceRows: parentRows("حضور و غیاب"),
        activityRows: parentRows("فعالیت‌ها"),
      },
    );
  } catch (error) {
    check(
      "XLSX_SHARE_FLOW_ERROR",
      "Offline Excel sharing audit completed",
      false,
      { error: error.stack || error.message, artifacts },
    );
  } finally {
    await page(() => {
      const state = window.__excelShareAudit;
      if (!state) return;
      state.releaseShare?.();
      if (state.scope) Object.assign(EduPeriodicReports.filters, state.scope);
      if (state.revisionOwner)
        state.revisionOwner.revision = state.previousRevision;
      closeModal();
      for (const [key, descriptor] of [
        ["share", state.shareDescriptor],
        ["canShare", state.canShareDescriptor],
      ]) {
        if (descriptor) Object.defineProperty(navigator, key, descriptor);
        else delete navigator[key];
      }
      delete window.__excelShareAudit;
    }).catch(() => {});
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
};
