        function handleError(error) {
          setStatus(error.message || String(error), "error");
          const el = document.getElementById("operationError");
          if (el) el.textContent = status.message;
          else alert(status.message);
        }

        async function putBackup(data, label, workspaceId = workspace?.id) {
          const backup = {
            id: uid(),
            workspace: workspaceId,
            at: new Date().toISOString(),
            label,
            db: clone(data),
          };
          const tx = connection.transaction("backups", "readwrite"),
            done = transactionDone(tx);
          tx.objectStore("backups").put(backup);
          await done;
          const all = (await allFrom("backups"))
            .filter(
              (x) => x.workspace === workspaceId && !x.label.includes("انتقال"),
            )
            .sort((a, b) => b.at.localeCompare(a.at));
          if (all.length > 8) {
            const cleanup = connection.transaction("backups", "readwrite"),
              finished = transactionDone(cleanup);
            all
              .slice(8)
              .forEach((x) => cleanup.objectStore("backups").delete(x.id));
            await finished;
          }
          return backup;
        }

        async function ensureDailyBackup() {
          try {
            const existing = (await allFrom("backups")).filter(
              (x) => x.workspace === workspace.id,
            );
            if (!existing.some((x) => x.at.slice(0, 10) === todayISO()))
              await putBackup(db, "خودکار روزانه");
          } catch (error) {
            setStatus(
              "اطلاعات خوانده شد؛ پشتیبان داخلی ساخته نشد. پشتیبان فایل تهیه کنید.",
              "error",
            );
          }
        }

        function lastExternalBackupLabel() {
          let item;
          try {
            item = JSON.parse(
              localStorage.getItem("Edu24.externalBackup." + workspace.id) ||
                "null",
            );
          } catch (ignore) {}
          if (!item) return "هنوز فایل مستقل تأیید نشده";
          return (
            faDate(item.date) +
            (item.confirmed
              ? " · ذخیره فایل تأیید شد"
              : " · دانلود درخواست شده؛ فایل را بررسی کنید")
          );
        }

        function downloadJSON(value, name) {
          downloadLocalFile(
            new Blob([JSON.stringify(value, null, 2)], {
              type: "application/json;charset=utf-8",
            }),
            name,
          );
        }

        // One transaction captures a consistent installation snapshot.
        const backupStores = [
          "records",
          "catalog",
          "events",
          "backups",
          "undo",
          "reports",
        ];
        let automaticBackupTimer = null,
          automaticBackupBusy = false;
