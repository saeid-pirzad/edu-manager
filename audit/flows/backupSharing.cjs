"use strict";
module.exports = async function backupSharing() {
  const cases = [],
    shares = [],
    downloads = [];
  const record = (id, name, pass) => cases.push({ id, name, pass: !!pass });
  const originalShare = Object.getOwnPropertyDescriptor(navigator, "share"),
    originalCanShare = Object.getOwnPropertyDescriptor(navigator, "canShare"),
    originalDownload = downloadLocalFile;
  let cancel = false;
  const click = (action) =>
    document.querySelector('[data-workspace-action="' + action + '"]').click();
  const wait = async (check) => {
    for (let i = 0; i < 200; i++) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error("Backup sharing UI did not become ready");
  };
  try {
    closeModal();
    await EduV24.test.settle();
    const before = JSON.stringify(db);
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: ({ files }) => files?.[0] instanceof File,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        shares.push(data);
        if (cancel) throw new DOMException("Cancelled", "AbortError");
      },
    });
    downloadLocalFile = (blob, name) => downloads.push({ blob, name });
    await EduV24.openBackups();
    click("prepare-share-backup");
    await wait(
      () =>
        document.querySelector('[data-workspace-action="share-backup-file"]')
          ?.disabled === false,
    );
    record(
      "BKS01",
      "actual backup dialog prepares without sharing or downloading",
      shares.length === 0 && downloads.length === 0,
    );
    click("share-backup-file");
    await wait(() => shares.length === 1);
    const file = shares[0].files[0],
      parsed = JSON.parse(await file.text());
    const validated = EduV24.validateFullBackup(parsed);
    record(
      "BKS02",
      "shared TXT contains validated JSON with unchanged active-period data",
      file.name.endsWith(".txt") &&
        file.type === "text/plain" &&
        JSON.stringify(
          validated.find((row) => row.period.id === parsed.activeWorkspace)
            .data,
        ) === before,
    );
    cancel = true;
    await wait(
      () =>
        !document.querySelector('[data-workspace-action="share-backup-file"]')
          .disabled,
    );
    click("share-backup-file");
    await wait(() =>
      document
        .querySelector("[data-backup-share-status]")
        .textContent.includes("لغو"),
    );
    record(
      "BKS03",
      "cancelled native sharing never downloads or changes stored data",
      downloads.length === 0 && JSON.stringify(db) === before,
    );
    click("download-share-backup");
    record(
      "BKS04",
      "manual attachment uses the exact same bytes as the shared file",
      downloads.length === 1 &&
        (await downloads[0].blob.text()) === (await file.text()),
    );
    closeModal();
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    });
    await EduV24.openBackupShare();
    record(
      "BKS05",
      "unsupported JSON sharing offers download without opening native sharing",
      document.querySelector('[data-workspace-action="share-backup-file"]')
        .hidden &&
        !document.querySelector(
          '[data-workspace-action="download-share-backup"]',
        ).hidden &&
        shares.length === 2,
    );
    const beforeCount = downloads.length;
    closeModal();
    record(
      "BKS06",
      "closing discards prepared backup without downloading",
      EduV24.downloadPreparedBackup() === false &&
        downloads.length === beforeCount,
    );
    const origin = EduV24.getReportContext().id;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.getElementById("importFile");
      input.files = transfer.files;
      await handleImport({ target: input });
      record(
        "BKS08",
        "the restore picker accepts shared TXT and opens the full-backup import preview",
        input.accept.includes(".txt") &&
          !!document.querySelector("[data-full-restore]"),
      );
      await EduV24.restoreFullBackup();
      const restoredData = structuredClone(db);
      // Restoring beside the source intentionally gives the period a new label.
      restoredData.settings.academicTerm =
        JSON.parse(before).settings.academicTerm;
      record(
        "BKS07",
        "the exact shared file restores into independent periods with unchanged school, class, grade and attendance data",
        EduV24.getReportContext().id !== origin &&
          JSON.stringify(restoredData) === before,
      );
    } finally {
      closeModal();
      await EduV24.switchPeriod(origin);
      closeModal();
    }
  } catch (error) {
    record(
      "BKS99",
      "backup sharing browser workflow completed: " + error.message,
      false,
    );
  } finally {
    downloadLocalFile = originalDownload;
    if (originalShare) Object.defineProperty(navigator, "share", originalShare);
    else delete navigator.share;
    if (originalCanShare)
      Object.defineProperty(navigator, "canShare", originalCanShare);
    else delete navigator.canShare;
    closeModal();
  }
  return cases;
};
