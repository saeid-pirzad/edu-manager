        async function commitRecords(
          records,
          {
            action = "ویرایش اطلاعات",
            replace = false,
            allowClosed = false,
            keepUndo = true,
          } = {},
        ) {
          if (blocked)
            throw Error("ذخیره مسدود است؛ صفحه را دوباره بارگذاری کنید.");
          if (workspace.closed && !allowClosed)
            throw Error("این دوره بسته است؛ ابتدا آن را بازگشایی کنید.");
          const { changed, removed, before, changes } =
            EduRecordCommitPlan.create(records, committed, { replace });
          if (!changed.length && !removed.length) return;
          if (failNextWrite) {
            failNextWrite = false;
            throw new DOMException("آزمون شکست ذخیره", "QuotaExceededError");
          }
          let nextCatalog;
          try {
            nextCatalog = await EduRecordTransaction.commit({
              connection, workspace, records, changed, removed, before, changes,
              action, keepUndo, normalizedName, academicTermKind,
            });
          } catch (error) {
            if (error.code === "WORKSPACE_CONFLICT") blocked = true;
            throw error;
          }
          for (const [key, json] of changed) committed.set(key, json);
          for (const key of removed) committed.delete(key);
          workspace = nextCatalog;
          broadcast({
            workspace: workspace.id,
            revision: workspace.revision,
          });
          return true;
        }

        function saveDBV24(scope = {}) {
          if (resetBusy || connectionRetired)
            return Promise.reject(
              Error("ثبت هنگام پاک‌سازی یا تغییر بانک متوقف است."),
            );
          if (fileMode)
            return Promise.reject(
              Error(
                "برای ویرایش، نسخه نصب‌شده برنامه یا نشانی HTTPS آن را باز کنید. حالت فایل فقط برای انتقال سوابق است.",
              ),
            );
          const generation = writeFailureGeneration,
            targetWorkspace = workspace?.id;
          busy++;
          paintStatus();
          const operation = writer
            .catch(() => {})
            .then(async () => {
              if (generation !== writeFailureGeneration)
                throw Error(
                  "ثبت قبلی ناموفق بود؛ این درخواست هم ثبت نشده است. تغییر را دوباره اعمال کنید.",
                );
              if (workspace?.id !== targetWorkspace)
                throw Error(
                  "دوره تغییر کرده است؛ این درخواست در دوره دیگری ثبت نشد.",
                );
              checkScope(scope);
              await commitRecords(collectRecords(db, scope), {
                ...scope,
                replace: !scope.classId && !scope.sessionId,
              });
              storageBlocked = false;
              storageProblem = "";
              setStatus("تغییرات ذخیره شد.", "saved");
            })
            .catch(async (error) => {
              try {
                db = (await readWorkspace(workspace.id)).data;
              } catch (ignore) {}
              // Invalidate every request queued against the in-memory data that was rolled back.
              writeFailureGeneration++;
              setStatus("تغییر ذخیره نشد: " + error.message, "error");
              render();
              throw error;
            })
            .finally(() => {
              busy--;
              paintStatus();
            });
          writer = operation;
          return operation;
        }

