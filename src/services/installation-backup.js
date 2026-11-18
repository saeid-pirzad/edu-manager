// A full installation snapshot uses one read transaction. All host access is
// explicit, so independent service instances cannot share workspace state.
(function (root) {
  "use strict";
  root.EduInstallationBackup = function ({
    getState,
    storage,
    drafts,
    reports,
    identity,
  }) {
    // Portable drafts are never silently replaced by an older readable row.
    function portableGradeDrafts(rows, periods, snapshotNotes = []) {
      const storedRows = [],
        ids = new Set(periods.map((period) => period.id));
      let keys;
      try {
        keys = Object.keys(storage.local());
      } catch (error) {
        snapshotNotes.push(
          "خواندن پیش‌نویس‌های محلی ممکن نشد؛ نسخه بانک و حافظه حفظ شد.",
        );
        keys = [];
      }
      for (const key of keys) {
        const match = /^Edu24\.drafts\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/.exec(
          key,
        );
        if (!match || !ids.has(match[1])) continue;
        try {
          const raw = storage.local().getItem(key);
          if (raw !== null) storedRows.push({ key, value: JSON.parse(raw) });
        } catch (error) {
          throw Object.assign(
            Error(
              "یک پیش‌نویس نمره قابل خواندن نیست؛ پشتیبان کامل ساخته نشد. پیش‌نویس‌ها را بررسی کنید یا نسخه خام بگیرید.",
            ),
            { code: "BACKUP_DRAFT_UNREADABLE", cause: error },
          );
        }
      }
      return drafts.portable(rows, periods, storedRows);
    }
    function backupReportDrafts(catalog) {
      const output = {};
      for (const period of catalog) {
        const getDrafts = reports.drafts();
        if (getDrafts) {
          output[period.id] = getDrafts(period.id, period.reportNotesRecovery);
        } else {
          const raw = storage
            .local()
            .getItem("EduManager.periodicDrafts." + period.id);
          output[period.id] = raw === null ? {} : JSON.parse(raw);
        }
      }
      return output;
    }
    function backupExtraData(
      stores,
      snapshotNotes = [],
      currentDrafts = drafts.current(),
    ) {
      const assessmentDraft = drafts.assessment();
      return {
        gradeDrafts: portableGradeDrafts(
          [
            ...stores.drafts,
            currentDrafts,
            ...(assessmentDraft ? [assessmentDraft] : []),
          ],
          stores.catalog,
          snapshotNotes,
        ),
        reportDrafts: backupReportDrafts(stores.catalog),
        deputyExportIdentity: identity(stores.drafts),
      };
    }
    // Catalog revisions cover mutable records; the other portable stores have immutable IDs.
    // Draft timestamps and the mirror's own handle metadata are deliberately not content changes.
    function backupSourceSignature({
      catalog,
      keys,
      gradeDrafts,
      reportDrafts,
      deputyExportIdentity,
      activeWorkspace,
      installation,
    }) {
      return JSON.stringify({
        installation,
        activeWorkspace,
        catalog,
        keys: Object.fromEntries(
          ["backups", "events", "reports", "undo"].map((name) => [
            name,
            [...keys[name]].sort(),
          ]),
        ),
        gradeDrafts: gradeDrafts
          .map(({ key, workspace, generation, entries }) => ({
            key,
            workspace,
            generation,
            entries,
          }))
          .sort((a, b) => a.key.localeCompare(b.key)),
        reportDrafts,
        deputyExportIdentity: deputyExportIdentity || null,
      });
    }
    function scanPortableBackups(store) {
      return new Promise((resolve, reject) => {
        const rows = [],
          keys = [],
          request = store.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return resolve({ rows, keys });
          keys.push(cursor.primaryKey);
          const row = cursor.value;
          if (!row.full) rows.push(row);
          cursor.continue();
        };
      });
    }
    async function readBackupSourceSignature() {
      const initial = getState(),
        origin = initial.workspaceId,
        sourceConnection = initial.connection,
        installation = initial.installation;
      if (
        !initial.ready ||
        initial.periodLoading ||
        initial.resetBusy ||
        initial.connectionRetired
      )
        throw Object.assign(Error("Backup source is changing"), {
          code: "BACKUP_CONTEXT_CHANGED",
        });
      const tx = sourceConnection.transaction(
          [...storage.storeNames(), "drafts"],
          "readonly",
        ),
        done = storage.done(tx);
      const requests = [
        storage.request(tx.objectStore("catalog").getAll()),
        storage.request(tx.objectStore("drafts").getAll()),
        storage.request(
          tx.objectStore("records").get(storage.resetRecordKey()),
        ),
        ...["backups", "events", "reports", "undo"].map((name) =>
          storage.request(tx.objectStore(name).getAllKeys()),
        ),
      ];
      const [catalog, durableDrafts, marker, backups, events, reports, undo] =
        await Promise.all(requests);
      await done;
      const current = getState();
      if (
        current.workspaceId !== origin ||
        current.connection !== sourceConnection ||
        current.installation !== installation ||
        current.periodLoading ||
        current.resetBusy ||
        current.connectionRetired
      )
        throw Object.assign(Error("Backup source changed"), {
          code: "BACKUP_CONTEXT_CHANGED",
        });
      if ((marker?.value?.token || "") !== installation)
        throw Object.assign(
          Error(
            "اطلاعات برنامه در پنجره دیگری جایگزین شده است؛ صفحه را بازخوانی کنید.",
          ),
          { code: "INSTALLATION_CHANGED" },
        );
      return backupSourceSignature({
        catalog,
        keys: { backups, events, reports, undo },
        ...backupExtraData({ catalog, drafts: durableDrafts }),
        activeWorkspace: origin,
        installation,
      });
    }

    async function snapshotInstallation({
      onDurableDrafts,
      onSourceSignature,
    } = {}) {
      const initial = getState(),
        origin = initial.workspaceId,
        sourceConnection = initial.connection,
        sourceInstallation = initial.installation;
      const check = () => {
        const current = getState();
        if (
          !current.ready ||
          current.periodLoading ||
          current.resetBusy ||
          current.connectionRetired ||
          current.workspaceId !== origin ||
          current.connection !== sourceConnection ||
          current.installation !== sourceInstallation
        )
          throw Object.assign(
            Error(
              "بانک یا ترم هنگام تهیه پشتیبان آماده نیست؛ پس از پایان جابه‌جایی دوباره تلاش کنید.",
            ),
            {
              code:
                current.periodLoading || current.workspaceId !== origin
                  ? "BACKUP_CONTEXT_CHANGED"
                  : "BACKUP_NOT_READY",
            },
          );
      };
      check();
      const snapshotNotes = [];
      try {
        await drafts.flush();
      } catch (error) {
        snapshotNotes.push(
          "ثبت نمرات ناتمام نشد؛ داده پایدار و پیش‌نویس‌ها جداگانه حفظ شدند: " +
            error.message,
        );
      }
      await drafts.writes().catch(() => {});
      check();
      await drafts
        .persist()
        .catch((error) =>
          snapshotNotes.push(
            "پیش‌نویس حافظه نیز در فایل قرار گرفت: " + error.message,
          ),
        );
      await drafts.pending().catch(() => {});
      check();
      const activeWorkspace = getState().workspaceId;
      const currentDrafts = drafts.current();
      const names = [...storage.storeNames(), "drafts"];
      const tx = sourceConnection.transaction(names, "readonly"),
        done = storage.done(tx);
      const values = await Promise.all(
        names.map((name) =>
          name === "backups"
            ? scanPortableBackups(tx.objectStore(name))
            : storage.request(tx.objectStore(name).getAll()),
        ),
      );
      await done;
      const backupRows = values[names.indexOf("backups")];
      const stores = Object.fromEntries(
        names.map((name, i) => [
          name,
          name === "backups" ? backupRows.rows : values[i],
        ]),
      );
      check();
      if (
        (stores.records.find((row) => row.key === storage.resetRecordKey())
          ?.value?.token || "") !== sourceInstallation
      )
        throw Error(
          "اطلاعات سیستم در پنجرهٔ دیگری جایگزین شده است؛ پشتیبان را دوباره تهیه کنید.",
        );
      // Restore compares the same durable draft rows inside its replacement lock.
      // The observer is internal metadata and is never serialized into a backup.
      onDurableDrafts?.(stores.drafts);
      // Never embed a full snapshot inside another full snapshot.
      stores.backups = stores.backups.filter((row) => !row.full);
      stores.records = stores.records.filter(
        (row) => row.key !== storage.resetRecordKey(),
      );
      const { gradeDrafts, reportDrafts, deputyExportIdentity } =
        backupExtraData(stores, snapshotNotes, currentDrafts);
      onSourceSignature?.(
        backupSourceSignature({
          catalog: stores.catalog,
          keys: {
            backups: backupRows.keys,
            ...Object.fromEntries(
              ["events", "reports", "undo"].map((name) => [
                name,
                stores[name].map((row) => row.id),
              ]),
            ),
          },
          gradeDrafts,
          reportDrafts,
          deputyExportIdentity,
          activeWorkspace,
          installation: sourceInstallation,
        }),
      );
      delete stores.drafts;
      return {
        format: "EduManager.FullBackup",
        version: 2,
        schemaVersion: 26,
        exportedAt: new Date().toISOString(),
        activeWorkspace,
        snapshotNotes,
        stores,
        reportDrafts,
        gradeDrafts,
        ...(deputyExportIdentity ? { deputyExportIdentity } : {}),
      };
    }

    return Object.freeze({
      snapshot: snapshotInstallation,
      signature: readBackupSourceSignature,
    });
  };
})(globalThis);
