"use strict";
module.exports = async function singleFile() {
  const cases = [];
  const directory = await navigator.storage.getDirectory();
  const namingKey = "EduManager.singleFileNames",
    previousNames = localStorage.getItem(namingKey),
    originalPicker = window.showSaveFilePicker,
    originalConfirm = window.confirm,
    createdNames = new Set(),
    pickerNames = [];
  let frame, handle;
  let failedHandle;
  const waitFor = async (check) => {
    for (let i = 0; i < 150; i++) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error(
      "Single-file regression timed out: " +
        document.getElementById("singleFileStatus")?.textContent,
    );
  };
  const click = (action) =>
    document.querySelector('[data-workspace-action="' + action + '"]').click();
  const read = async () => JSON.parse(await (await handle.getFile()).text());
  const readConnection = () =>
    new Promise((resolve, reject) => {
      const request = EduV24.test
        .getConnection()
        .transaction("drafts")
        .objectStore("drafts")
        .get("EduManager.singleFile");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const namedPicker = async (options) => {
    pickerNames.push(options.suggestedName);
    createdNames.add(options.suggestedName);
    return directory.getFileHandle(options.suggestedName, { create: true });
  };
  const waitForSaved = async () => {
    await waitFor(() =>
      document
        .getElementById("singleFileStatus")
        ?.textContent.startsWith("ذخیره شد:"),
    );
    return readConnection();
  };
  try {
    // This runner owns a disposable origin. Reset only the naming ledger, not
    // application data, so suggestions can be asserted independently of prior
    // synthetic flows. Restore its previous value in finally.
    localStorage.removeItem(namingKey);
    window.showSaveFilePicker = async (options) => {
      handle = await namedPicker(options);
      return handle;
    };
    closeModal();
    await EduV24.openBackups();
    click("single-file-choose");
    click("single-file-choose");
    await waitForSaved();
    const localJalaliParts = new Intl.DateTimeFormat(
      "en-US-u-ca-persian-nu-latn",
      { year: "numeric", month: "2-digit", day: "2-digit" },
    ).formatToParts(new Date());
    const datePart = (type) =>
      localJalaliParts.find((part) => part.type === type).value;
    const expectedBase =
      "MySchool-" +
      datePart("year") +
      "-" +
      datePart("month") +
      "-" +
      datePart("day");
    cases.push({
      id: "SF00_JALALI_NAME",
      name: "the real picker suggests MySchool with today's local Jalali date and a JSON extension",
      pass:
        pickerNames[0] === expectedBase + ".json" &&
        handle.name === expectedBase + ".json",
      observed: { suggestedName: pickerNames[0] },
    });
    cases.push({
      id: "SF00_DOUBLE_CLICK",
      name: "two immediate activation clicks open one picker and reserve only one filename",
      pass: pickerNames.length === 1,
      observed: { pickerCalls: pickerNames.length },
    });
    const first = await read();
    const restoredPeriods = EduV24.validateFullBackup(first);
    cases.push({
      id: "SF01",
      name: "single JSON contains all periods and excludes the device-only handle",
      pass:
        first.format === "EduManager.FullBackup" &&
        restoredPeriods.length === first.stores.catalog.length &&
        first.stores.catalog.length > 0 &&
        !first.stores.drafts &&
        !JSON.stringify(first).includes("EduManager.singleFile"),
      observed: {},
    });
    cases.push({
      id: "SF01_DELIVERY",
      name: "the open backup dialog immediately distinguishes a confirmed file write from a download request",
      pass: document
        .getElementById("lastExternalBackupStatus")
        ?.textContent.includes("فایل خودکار تأیید شد"),
      observed: {},
    });
    const before = first.exportedAt;
    const firstNamingLedger = localStorage.getItem(namingKey);
    await waitFor(() => {
      const save = document.querySelector(
        '[data-workspace-action="single-file-save"]',
      );
      return save && !save.matches(":disabled") && !save.closest("[inert]");
    });
    click("single-file-save");
    // Reading a File snapshot during the overwrite can fail with
    // NotReadableError. The durable savedAt is published only after close and
    // nonempty-file verification; wait for that confirmation before getFile.
    await waitFor(async () => {
      if (
        !document
          .getElementById("singleFileStatus")
          ?.textContent.startsWith("ذخیره شد:")
      )
        return false;
      const connection = EduV24.test.getConnection();
      return new Promise((resolve, reject) => {
        const request = connection
          .transaction("drafts")
          .objectStore("drafts")
          .get("EduManager.singleFile");
        request.onsuccess = () =>
          resolve(
            !!request.result?.handle &&
              request.result.savedAt !== first.exportedAt,
          );
        request.onerror = () => reject(request.error);
      });
    });
    const second = await read();
    cases.push({
      id: "SF02",
      name: "save now overwrites the selected file instead of creating dated downloads",
      pass:
        second.exportedAt !== before &&
        second.format === "EduManager.FullBackup",
      observed: {},
    });
    cases.push({
      id: "SF03",
      name: "real FileSystemFileHandle survives an IndexedDB structured clone",
      pass: true,
      observed: {},
    });
    cases.push({
      id: "SF03_SAVE_NAME_STABLE",
      name: "save now updates the same file without reserving another daily filename",
      pass:
        localStorage.getItem(namingKey) === firstNamingLedger &&
        pickerNames.length === 1,
      observed: {},
    });
    const firstHandle = handle,
      firstFileText = await (await firstHandle.getFile()).text();
    window.showSaveFilePicker = namedPicker;
    click("single-file-choose");
    await waitFor(async () => {
      const selected = await readConnection();
      return (
        selected?.savedAt &&
        selected.handle.name === expectedBase + "-2.json" &&
        document
          .getElementById("singleFileStatus")
          ?.textContent.startsWith("ذخیره شد:")
      );
    });
    handle = (await readConnection()).handle;
    const secondNamingLedger = localStorage.getItem(namingKey),
      secondChoiceSnapshot = await read();
    cases.push({
      id: "SF03_SECOND_CHOICE",
      name: "a second explicit choice on the same day selects the numbered second JSON file",
      pass:
        pickerNames[1] === expectedBase + "-2.json" &&
        handle.name === pickerNames[1] &&
        secondChoiceSnapshot.format === "EduManager.FullBackup",
      observed: { suggestedName: pickerNames[1] },
    });
    cases.push({
      id: "SF03_PREVIOUS_UNTOUCHED",
      name: "switching to the newly suggested file preserves every byte of the previous backup",
      pass: (await (await firstHandle.getFile()).text()) === firstFileText,
      observed: {},
    });
    click("single-file-save");
    await waitFor(async () => {
      const selected = await readConnection();
      return (
        selected?.savedAt !== secondChoiceSnapshot.exportedAt &&
        document
          .getElementById("singleFileStatus")
          ?.textContent.startsWith("ذخیره شد:")
      );
    });
    cases.push({
      id: "SF03_SAVE_NEW_ONLY",
      name: "save now updates only the new selected file and does not advance its name counter",
      pass:
        (await read()).exportedAt !== secondChoiceSnapshot.exportedAt &&
        (await (await firstHandle.getFile()).text()) === firstFileText &&
        localStorage.getItem(namingKey) === secondNamingLedger &&
        pickerNames.length === 2,
      observed: {},
    });
    const beforeAutomatic = await read(),
      originalWeekStart = db.settings.weekStartDate,
      shiftedWeekStart = new Date(
        (originalWeekStart || todayISO()) + "T12:00:00Z",
      );
    shiftedWeekStart.setUTCDate(shiftedWeekStart.getUTCDate() + 1);
    db.settings.weekStartDate = shiftedWeekStart.toISOString().slice(0, 10);
    await EduV24.saveDB({ action: "آزمون خودکار نام فایل پشتیبان" });
    await waitFor(async () => {
      const selected = await readConnection();
      return (
        selected?.savedAt !== beforeAutomatic.exportedAt &&
        document
          .getElementById("singleFileStatus")
          ?.textContent.startsWith("ذخیره شد:")
      );
    });
    const automaticallySaved = await read(),
      automaticallyRestored = EduV24.validateFullBackup(automaticallySaved);
    cases.push({
      id: "SF03_AUTOMATIC_NEW_ONLY",
      name: "a real saved setting automatically updates only the current file without allocating a new name",
      pass:
        automaticallyRestored.find(
          (row) => row.period.id === EduV24.test.getState().workspace.id,
        ).data.settings.weekStartDate === db.settings.weekStartDate &&
        automaticallySaved.exportedAt !== beforeAutomatic.exportedAt &&
        (await (await firstHandle.getFile()).text()) === firstFileText &&
        localStorage.getItem(namingKey) === secondNamingLedger &&
        pickerNames.length === 2,
      observed: {},
    });
    db.settings.weekStartDate = originalWeekStart;
    await EduV24.saveDB({ action: "پایان آزمون خودکار نام فایل پشتیبان" });
    click("single-file-save");
    await waitFor(async () => {
      const selected = await readConnection();
      return (
        selected?.savedAt !== automaticallySaved.exportedAt &&
        document
          .getElementById("singleFileStatus")
          ?.textContent.startsWith("ذخیره شد:")
      );
    });
    const secondHandle = handle,
      secondFileText = await (await secondHandle.getFile()).text(),
      secondConnection = (await readConnection()).connectionId;
    window.showSaveFilePicker = async (options) => {
      pickerNames.push(options.suggestedName);
      throw new DOMException("synthetic picker cancellation", "AbortError");
    };
    click("single-file-choose");
    await waitFor(
      () =>
        pickerNames.length === 3 &&
        localStorage.getItem(namingKey) === secondNamingLedger,
    );
    cases.push({
      id: "SF03_CANCEL_PRESERVES",
      name: "canceling a new picker releases its suggested number and keeps both earlier files and the current connection",
      pass:
        pickerNames[2] === expectedBase + "-3.json" &&
        (await readConnection()).connectionId === secondConnection &&
        (await (await firstHandle.getFile()).text()) === firstFileText &&
        (await (await secondHandle.getFile()).text()) === secondFileText &&
        localStorage.getItem(namingKey) === secondNamingLedger,
      observed: {},
    });
    let overwriteConfirmations = 0;
    window.confirm = () => {
      overwriteConfirmations++;
      return false;
    };
    window.showSaveFilePicker = async (options) => {
      pickerNames.push(options.suggestedName);
      return firstHandle;
    };
    click("single-file-choose");
    await waitFor(
      () =>
        overwriteConfirmations === 1 &&
        localStorage.getItem(namingKey) === secondNamingLedger,
    );
    window.confirm = originalConfirm;
    cases.push({
      id: "SF03_REJECT_OVERWRITE",
      name: "rejecting overwrite of an existing backup neither changes files nor replaces the active connection or consumes a number",
      pass:
        pickerNames[3] === expectedBase + "-3.json" &&
        overwriteConfirmations === 1 &&
        (await readConnection()).connectionId === secondConnection &&
        (await (await firstHandle.getFile()).text()) === firstFileText &&
        (await (await secondHandle.getFile()).text()) === secondFileText &&
        localStorage.getItem(namingKey) === secondNamingLedger,
      observed: {},
    });
    click("single-file-stop");
    await waitFor(() =>
      document
        .getElementById("singleFileStatus")
        ?.textContent.includes("اتصال متوقف شد"),
    );
    window.showSaveFilePicker = namedPicker;
    click("single-file-choose");
    await waitFor(async () => {
      const selected = await readConnection();
      return (
        selected?.savedAt &&
        selected.handle.name === expectedBase + "-3.json" &&
        document
          .getElementById("singleFileStatus")
          ?.textContent.startsWith("ذخیره شد:")
      );
    });
    handle = (await readConnection()).handle;
    cases.push({
      id: "SF03_RECONNECT_NEXT_NAME",
      name: "a fresh choice after disconnect uses the next same-day number while canceled attempts and both previous files are preserved",
      pass:
        pickerNames[4] === expectedBase + "-3.json" &&
        handle.name === pickerNames[4] &&
        (await (await firstHandle.getFile()).text()) === firstFileText &&
        (await (await secondHandle.getFile()).text()) === secondFileText,
      observed: { suggestedName: pickerNames[4] },
    });
    frame = document.createElement("iframe");
    frame.src = location.href;
    document.body.append(frame);
    await waitFor(() => frame.contentWindow.EduV24?.test.getState().ready);
    await waitFor(() =>
      frame.contentWindow.document
        .getElementById("singleFileBadge")
        ?.textContent.startsWith("ذخیره شد:"),
    );
    const previous = await (await handle.getFile()).text();
    click("single-file-stop");
    await waitFor(() =>
      document
        .getElementById("singleFileStatus")
        ?.textContent.includes("اتصال متوقف شد"),
    );
    cases.push({
      id: "SF04",
      name: "disconnect preserves the complete file",
      pass: (await (await handle.getFile()).text()) === previous,
      observed: {},
    });
    await waitFor(() =>
      frame.contentWindow.document
        .getElementById("singleFileBadge")
        ?.textContent.includes("پنجره دیگری"),
    );
    await new Promise((resolve) => setTimeout(resolve, 2300));
    const persisted = await new Promise((resolve, reject) => {
      const request = EduV24.test
        .getConnection()
        .transaction("drafts")
        .objectStore("drafts")
        .get("EduManager.singleFile");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    cases.push({
      id: "SF05",
      name: "disconnect propagates to another app document and cannot be resurrected",
      pass: !persisted && (await (await handle.getFile()).text()) === previous,
      observed: {},
    });
    frame.remove();
    frame = null;
    failedHandle = await directory.getFileHandle("single-file-denied.json", {
      create: true,
    });
    const prototype = Object.getPrototypeOf(failedHandle);
    const originalCreate = prototype.createWritable;
    const originalDownload = downloadLocalFile;
    let manualDownloads = 0;
    try {
      prototype.createWritable = async function (...args) {
        if (this.name === failedHandle.name) throw Error("synthetic disk full");
        return originalCreate.apply(this, args);
      };
      downloadLocalFile = () => {
        manualDownloads++;
      };
      window.showSaveFilePicker = async () => failedHandle;
      click("single-file-choose");
      await waitFor(() =>
        document
          .getElementById("singleFileStatus")
          ?.textContent.includes("synthetic disk full"),
      );
      const fallback = document.getElementById("singleFileFallback");
      cases.push({
        id: "SF06",
        name: "disk failure shows manual fallback without claiming an empty file was saved or requesting permission",
        pass:
          !fallback.hidden &&
          (await failedHandle.getFile()).size === 0 &&
          manualDownloads === 0 &&
          !document.querySelector(".single-file-permission-action"),
        observed: {},
      });
      closeModal();
      render();
      cases.push({
        id: "SF06_VISIBLE_WARNING",
        name: "a paused automatic-file warning remains visible outside the closed backup dialog after rendering",
        pass:
          !document.getElementById("singleFileBadge")?.hidden &&
          document
            .getElementById("singleFileBadge")
            ?.textContent.includes("synthetic disk full"),
        observed: {},
      });
      await EduV24.openBackups();
      document
        .querySelector('.backup-manual [data-workspace-action="export-full"]')
        .click();
      await waitFor(() => manualDownloads === 1);
      cases.push({
        id: "SF07",
        name: "manual fallback remains usable and is only downloaded on explicit click",
        pass:
          manualDownloads === 1 &&
          !document.getElementById("singleFileFallback").hidden &&
          document
            .getElementById("lastExternalBackupStatus")
            ?.textContent.includes("دانلود پشتیبان کامل درخواست شد"),
        observed: {},
      });
    } finally {
      prototype.createWritable = originalCreate;
      downloadLocalFile = originalDownload;
    }
    click("single-file-save");
    await waitFor(() =>
      document
        .getElementById("singleFileStatus")
        ?.textContent.startsWith("ذخیره شد:"),
    );
    cases.push({
      id: "SF08",
      name: "successful retry confirms the real file and dismisses the failure fallback",
      pass:
        document.getElementById("singleFileFallback").hidden &&
        (await failedHandle.getFile()).size > 0,
      observed: {},
    });
    const originalPermission = prototype.requestPermission;
    let permissionCalls = 0,
      permissionResult = "denied";
    const beforePermission = await (await failedHandle.getFile()).text();
    try {
      prototype.createWritable = async function (...args) {
        if (this.name === failedHandle.name)
          throw new DOMException(
            "synthetic permission revoked",
            "NotAllowedError",
          );
        return originalCreate.apply(this, args);
      };
      click("single-file-save");
      await waitFor(() =>
        document
          .getElementById("singleFileStatus")
          ?.querySelector(".single-file-permission-action"),
      );
      const badge = document.getElementById("singleFileBadge"),
        modalStatus = document.getElementById("singleFileStatus");
      cases.push({
        id: "SF09_INLINE_PERMISSION",
        name: "permission warning offers one explicit action beside each live status, outside the live region",
        pass: [badge, modalStatus].every((notice) => {
          const message = notice.querySelector('[role="status"]'),
            action = notice.querySelector(".single-file-permission-action");
          return (
            message &&
            action &&
            action.parentElement === message.parentElement &&
            !message.contains(action) &&
            action.type === "button" &&
            action.textContent.trim() === "اجازه مجدد" &&
            notice.querySelectorAll(".single-file-permission-action").length ===
              1
          );
        }),
        observed: {},
      });
      closeModal();
      render();
      const visibleBadge = document.getElementById("singleFileBadge"),
        action = visibleBadge?.querySelector(".single-file-permission-action"),
        rect = action?.getBoundingClientRect(),
        badgeRect = visibleBadge?.getBoundingClientRect();
      cases.push({
        id: "SF10_PERMISSION_LAYOUT_" + innerWidth,
        name: "permission action stays visible after navigation and fits the mobile viewport with a touch-sized target",
        pass:
          !!action &&
          !visibleBadge.hidden &&
          rect.width >= 44 &&
          rect.height >= 44 &&
          rect.left >= 0 &&
          rect.right <= innerWidth + 1 &&
          badgeRect.left >= 0 &&
          badgeRect.right <= innerWidth + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1,
        observed: {
          width: innerWidth,
          actionWidth: rect?.width,
          actionHeight: rect?.height,
        },
      });
      if (window.__eduPermissionActionCaptureEnabled) {
        window.__eduPermissionActionCaptureReady = { width: innerWidth };
        await new Promise((resolve) => {
          window.__eduPermissionActionRelease = resolve;
        });
        delete window.__eduPermissionActionCaptureReady;
        delete window.__eduPermissionActionRelease;
      }
      prototype.requestPermission = function (...args) {
        if (this.name === failedHandle.name) {
          permissionCalls++;
          return Promise.resolve(permissionResult);
        }
        return originalPermission.apply(this, args);
      };
      action.click();
      const requestedInClick = permissionCalls === 1;
      await waitFor(() =>
        document
          .getElementById("singleFileBadge")
          ?.textContent.includes("اجازه نوشتن داده نشد"),
      );
      cases.push({
        id: "SF11_PERMISSION_DENIED",
        name: "the visible action requests permission during its click and denial preserves the file and recovery action",
        pass:
          requestedInClick &&
          permissionCalls === 1 &&
          !document.getElementById("singleFileBadge").hidden &&
          !!document.querySelector(
            "#singleFileBadge .single-file-permission-action",
          ) &&
          (await (await failedHandle.getFile()).text()) === beforePermission,
        observed: { permissionCalls, requestedInClick },
      });
      permissionResult = "granted";
      prototype.createWritable = originalCreate;
      document
        .querySelector("#singleFileBadge .single-file-permission-action")
        .click();
      await waitFor(() =>
        document
          .getElementById("singleFileBadge")
          ?.textContent.startsWith("ذخیره شد:"),
      );
      await EduV24.openBackups();
      cases.push({
        id: "SF12_PERMISSION_RECOVERED",
        name: "inline permission grant confirms a real complete-file write and removes actions from both notices",
        pass:
          permissionCalls === 2 &&
          document.getElementById("singleFileBadge").hidden &&
          !document.querySelector(".single-file-permission-action") &&
          document.getElementById("singleFileFallback").hidden &&
          JSON.parse(await (await failedHandle.getFile()).text()).format ===
            "EduManager.FullBackup",
        observed: { permissionCalls },
      });
    } finally {
      prototype.createWritable = originalCreate;
      prototype.requestPermission = originalPermission;
      delete window.__eduPermissionActionCaptureReady;
      delete window.__eduPermissionActionRelease;
    }
    click("single-file-stop");
    await waitFor(() =>
      document
        .getElementById("singleFileStatus")
        ?.textContent.includes("اتصال متوقف شد"),
    );
  } finally {
    frame?.remove();
    window.showSaveFilePicker = originalPicker;
    window.confirm = originalConfirm;
    if (previousNames === null) localStorage.removeItem(namingKey);
    else localStorage.setItem(namingKey, previousNames);
    closeModal();
    for (const name of createdNames)
      await directory.removeEntry(name).catch(() => {});
    if (failedHandle)
      await directory.removeEntry("single-file-denied.json").catch(() => {});
  }
  return cases;
};
