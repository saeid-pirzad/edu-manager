"use strict";
// Uses real origin-private file handles in the disposable audit browser profile.
// Only the native picker is substituted; filesystem writes and IDB cloning are real.
module.exports = async ({ cdp, evaluate, cases, delay }) => {
  const record = (id, pass, observed = {}) =>
    cases.push({
      id: "AUTO_" + id,
      name: "Deputy automatic backup: " + id,
      pass: !!pass,
      observed,
    });
  const result = await evaluate(
    "(" +
      async function () {
        const wait = async (test) => {
          for (let i = 0; i < 200; i++) {
            if (await test()) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          throw Error("auto backup UI timeout");
        };
        const click = async (action) => {
          document
            .querySelector('[data-deputy-action="' + action + '"]')
            .click();
          await wait(
            () =>
              !EduDeputyUI.status().automaticBackup.busy &&
              !EduDeputyUI.status().busy,
          );
        };
        const store = await EduDeputyStore.open();
        const directory = await navigator.storage.getDirectory();
        const handle = await directory.getFileHandle("deputy-auto-audit.json", {
          create: true,
        });
        const stream = await handle.createWritable();
        await stream.write("");
        await stream.close();
        const originalPicker = window.showSaveFilePicker;
        window.showSaveFilePicker = async () => handle;
        try {
          await click("open-backups");
          await click("auto-choose");
          const saved = JSON.parse(await (await handle.getFile()).text()),
            actual = await store.backup();
          const first = {
            active: EduDeputyUI.status().automaticBackup.active,
            sameData:
              JSON.stringify(saved.streams) ===
                JSON.stringify(actual.streams) &&
              JSON.stringify(saved.followups) ===
                JSON.stringify(actual.followups),
            format: saved.format,
            metadataExcluded: !JSON.stringify(saved).includes(
              "deputy-auto-audit.json",
            ),
            connections: !!(await store.automaticBackupConfig())?.handle,
          };
          const previous = await store.automaticBackupConfig();
          await store.setAutomaticBackupConfig(
            {
              ...previous,
              savedAt: new Date(Date.now() - 21 * 60000).toISOString(),
            },
            previous.connectionId,
          );
          await click("close-backups");
          document.dispatchEvent(new Event("visibilitychange"));
          await wait(
            async () =>
              Date.now() -
                Date.parse((await store.automaticBackupConfig()).savedAt) <
              60000,
          );
          const due = await store.automaticBackupConfig();
          await click("open-backups");
          await click("auto-save");
          return {
            first,
            due: {
              sameConnection: due.connectionId === previous.connectionId,
              fresh: Date.now() - Date.parse(due.savedAt) < 60000,
            },
            manual: EduDeputyUI.status().automaticBackup.active,
          };
        } finally {
          window.showSaveFilePicker = originalPicker;
          store.close();
        }
      }.toString() +
      ")()",
  );
  record(
    "REAL_FILE",
    result.first.active &&
      result.first.sameData &&
      result.first.format === "EduManager.DeputyBackup" &&
      result.first.metadataExcluded &&
      result.first.connections,
    result.first,
  );
  record(
    "DUE_RETURN",
    result.due.sameConnection && result.due.fresh,
    result.due,
  );
  record("MANUAL_SAVE", result.manual);
  await cdp("Page.reload", { ignoreCache: true });
  for (let i = 0; i < 150; i++) {
    try {
      if (
        await evaluate(
          "!!globalThis.EduDeputyUI?.status().ready&&!!globalThis.EduDeputyUI.status().automaticBackup?.active",
        )
      )
        break;
    } catch {}
    await delay(50);
  }
  record(
    "RELOAD",
    await evaluate("!!EduDeputyUI.status().automaticBackup?.active"),
    await evaluate("EduDeputyUI.status().automaticBackup"),
  );
  const stopped = await evaluate(
    "(" +
      async function () {
        const wait = async (test) => {
          for (let i = 0; i < 200; i++) {
            if (await test()) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          throw Error("auto stop timeout");
        };
        const store = await EduDeputyStore.open();
        try {
          const config = await store.automaticBackupConfig(),
            before = await config.handle.getFile();
          document.querySelector('[data-deputy-action="open-backups"]').click();
          document.querySelector('[data-deputy-action="auto-stop"]').click();
          await wait(() => !EduDeputyUI.status().automaticBackup.busy);
          const after = await config.handle.getFile();
          const result = {
            disconnected: (await store.automaticBackupConfig()) === null,
            preserved:
              before.size === after.size &&
              before.lastModified === after.lastModified,
            active: EduDeputyUI.status().automaticBackup.active,
          };
          document
            .querySelector('[data-deputy-action="close-backups"]')
            .click();
          await (
            await navigator.storage.getDirectory()
          ).removeEntry("deputy-auto-audit.json");
          return result;
        } finally {
          store.close();
        }
      }.toString() +
      ")()",
  );
  record(
    "STOP",
    stopped.disconnected && stopped.preserved && !stopped.active,
    stopped,
  );
};
