"use strict";
module.exports = async function singleFile() {
  const cases = [];
  const directory = await navigator.storage.getDirectory();
  const handle = await directory.getFileHandle("single-file-regression.json", {
    create: true,
  });
  const originalPicker = window.showSaveFilePicker;
  let frame;
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
    const before = first.exportedAt;
    click("single-file-save");
    await waitFor(async () => (await read()).exportedAt !== before);
    cases.push({
      id: "SF02",
      name: "save now overwrites the selected file instead of creating dated downloads",
      pass: (await read()).format === "EduManager.FullBackup",
      observed: {},
    });
    await waitFor(async () => {
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
    cases.push({
      id: "SF03",
      name: "real FileSystemFileHandle survives an IndexedDB structured clone",
      pass: true,
      observed: {},
    });
    const previous = await (await handle.getFile()).text();
    frame = document.createElement("iframe");
    frame.src = location.href;
    document.body.append(frame);
    await waitFor(() => frame.contentWindow.EduV24?.test.getState().ready);
    await waitFor(() =>
      frame.contentWindow.document
        .getElementById("singleFileBadge")
        ?.textContent.includes(handle.name),
    );
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
  } finally {
    frame?.remove();
    window.showSaveFilePicker = originalPicker;
    closeModal();
    await directory.removeEntry("single-file-regression.json").catch(() => {});
  }
  return cases;
};
