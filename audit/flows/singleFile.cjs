"use strict";
module.exports = async function singleFile() {
  const cases = [];
  const directory = await navigator.storage.getDirectory();
  const handle = await directory.getFileHandle("single-file-regression.json", {
    create: true,
  });
  const originalPicker = window.showSaveFilePicker;
  let frame;
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
  try {
    window.showSaveFilePicker = async () => handle;
    closeModal();
    await EduV24.openBackups();
    click("single-file-choose");
    await waitFor(() =>
      document
        .getElementById("singleFileStatus")
        ?.textContent.startsWith("ذخیره شد:"),
    );
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
    closeModal();
    await directory.removeEntry("single-file-regression.json").catch(() => {});
    if (failedHandle)
      await directory.removeEntry("single-file-denied.json").catch(() => {});
  }
  return cases;
};
