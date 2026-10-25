        async function exportBackupV24() {
          let excludedDrafts = 0;
          try {
            await flushDrafts({ strict: true });
          } catch (error) {
            excludedDrafts = drafts.size;
            setStatus(
              "پشتیبان از آخرین ثبت سالم تهیه می‌شود؛ ویرایش‌های ذخیره‌نشده داخل آن نیستند.",
              "error",
            );
          }
          await writer.catch(() => {});
          const durable = (await readWorkspace(workspace.id)).data;
          const content = {
              version: 25,
              exportedAt: new Date().toISOString(),
              excludedDrafts,
              period: { year: workspace.year, term: workspace.term },
              db: durable,
            },
            name =
              "مدرسه-" +
              workspace.year +
              "-" +
              workspace.term +
              "-" +
              todayISO() +
              ".json";
          let confirmed = false;
          if (window.showSaveFilePicker) {
            try {
              const handle = await window.showSaveFilePicker({
                suggestedName: name,
                types: [
                  {
                    description: "پشتیبان مدرسه",
                    accept: { "application/json": [".json"] },
                  },
                ],
              });
              const writable = await handle.createWritable();
              await writable.write(JSON.stringify(content, null, 2));
              await writable.close();
              confirmed = true;
            } catch (error) {
              if (error.name === "AbortError") return false;
              downloadJSON(content, name);
            }
          } else downloadJSON(content, name);
          try {
            localStorage.setItem(
              "Edu24.externalBackup." + workspace.id,
              JSON.stringify({ date: todayISO(), confirmed }),
            );
          } catch (ignore) {}
          setStatus(
            confirmed
              ? "فایل پشتیبان مستقل ذخیره شد."
              : "دانلود پشتیبان درخواست شد؛ وجود فایل را بررسی کنید.",
            "saved",
          );
          render();
          return confirmed ? "confirmed" : "downloaded";
        }

        async function openBackups() {
          await writer.catch(() => {});
          const rows = (await allFrom("backups"))
            .filter((x) => x.workspace === workspace.id || x.workspace === null)
            .sort((a, b) => b.at.localeCompare(a.at));
          let estimate = "";
          if (navigator.storage?.estimate) {
            const e = await navigator.storage.estimate();
            estimate =
              "مصرف تقریبی فضای این مبدا: " +
              Math.round((e.usage || 0) / 1048576) +
              " مگابایت از " +
              Math.round((e.quota || 0) / 1048576) +
              " مگابایت.";
          }
          showModal(
            "پشتیبان و بازیابی",
            "<p>پشتیبان داخلی روی همین دستگاه است. یک فایل مستقل در پوشه امن یا حافظه دیگر نگه دارید.</p><p>" +
              esc(estimate) +
              '</p><div class="row"><button onclick="exportBackup()">ذخیره فایل همین دوره</button><button onclick="EduV24.exportFullBackup().catch(EduV24.course.error)">پشتیبان کامل همه دوره‌ها</button><button class="ghost" onclick="document.getElementById(\'importFile\').click()">بازیابی از فایل</button></div><p>' +
              esc(lastExternalBackupLabel()) +
              "</p><table><thead><tr><th>زمان</th><th>نوع</th><th>عملیات</th></tr></thead><tbody>" +
              rows
                .map(
                  (x) =>
                    "<tr><td>" +
                    esc(new Date(x.at).toLocaleString("fa-IR")) +
                    "</td><td>" +
                    esc(x.label) +
                    '</td><td><button class="ghost" onclick="EduV24.downloadInternalBackup(\'' +
                    x.id +
                    '\')">دریافت فایل</button><button class="ghost" onclick="EduV24.previewInternalBackup(\'' +
                    x.id +
                    "')\">پیش‌نمایش بازیابی</button></td></tr>",
                )
                .join("") +
              "</tbody></table>",
          );
        }

        async function downloadInternalBackup(id) {
          const b = await readRecord("backups", id);
          if (!b) throw Error("پشتیبان موجود نیست.");
          if (b.full) {
            downloadJSON(b.full, "پشتیبان-کامل-" + b.at.slice(0, 10) + ".json");
            return;
          }
          downloadJSON(
            {
              version: b.label.includes("انتقال") ? 23 : 24,
              exportedAt: b.at,
              db: b.db,
            },
            "پشتیبان-" + b.at.slice(0, 10) + ".json",
          );
        }

        async function previewInternalBackup(id) {
          const b = await readRecord("backups", id);
          if (b?.full) {
            previewFullBackup(b.full);
            return;
          }
          if (b)
            previewImport(
              normalizeDB(b.db, { legacy: b.label.includes("انتقال") }),
              b.label,
            );
        }

        function previewImport(candidate, label) {
          pendingImport = { candidate, label, workspace: workspace?.id };
          const classes = candidate.schools.flatMap((s) => s.classes),
            students = classes.reduce((n, c) => n + c.students.length, 0);
          showModal(
            "پیش‌نمایش بازیابی",
            "<p>منبع: " +
              esc(label) +
              "</p><p>" +
              candidate.schools.length +
              " مدرسه، " +
              classes.length +
              " کلاس، " +
              students +
              " دانش‌آموز فعال، " +
              candidate.sessions.length +
              " جلسه.</p>" +
              (candidate.migrationWarnings?.length
                ? '<p role="alert">' +
                  esc(candidate.migrationWarnings.join(" | ")) +
                  "</p>"
                : "") +
              "<p>سال پشتیبان: " +
              esc(
                candidate.settings.academicYear +
                  " / " +
                  (candidate.settings.academicTerm || "نامشخص"),
              ) +
              '</p><label>مقصد <select id="restoreMode"><option value="new" ' +
              (candidate.settings.academicYear !== workspace.year
                ? "selected"
                : "") +
              '>دوره مستقل جدید</option><option value="current" ' +
              (candidate.settings.academicYear === workspace.year
                ? "selected"
                : "") +
              '>جایگزینی دوره فعلی</option></select></label><p>در حالت جایگزینی، این کار اطلاعات دوره فعلی را جایگزین می‌کند. دوره‌های دیگر حفظ می‌شوند. پیش از جایگزینی فایل مستقل تهیه کنید.</p><button onclick="exportBackup()">۱. ذخیره پشتیبان مستقلِ اطلاعات فعلی</button><p><label><input id="restoreExternalConfirmed" type="checkbox"> فایل پشتیبان فعلی را بیرون از برنامه ذخیره و بررسی کرده‌ام.</label></p><button data-mutating="1" onclick="EduV24.confirmImport()">۲. جایگزینی اطلاعات این دوره</button><p id="operationError" role="alert"></p>',
          );
        }

        async function handleImportV24(e) {
          const file = e.target.files[0];
          if (!file) return;
          try {
            if (file.size > 100 * 1024 * 1024)
              throw Error("حداکثر حجم فایل پشتیبان صد مگابایت است.");
            const parsed = JSON.parse(await file.text());
            if (parsed.format === "EduManager.FullBackup") {
              previewFullBackup(parsed);
              return;
            }
            if (
              parsed.version !== undefined &&
              (!Number.isInteger(parsed.version) ||
                parsed.version > 26 ||
                parsed.version < 1)
            )
              throw Error("نسخه پشتیبان پشتیبانی نمی‌شود.");
            const source = parsed.db || parsed;
            if (source.schemaVersion > 26)
              throw Error("نسخه ساختار جدیدتر پشتیبانی نمی‌شود.");
            const candidate = normalizeDB(source, {
              legacy: (source.schemaVersion ?? parsed.version ?? 23) < 24,
            });
            if (!ready) {
              if (!connection) connection = await openDatabase();
              workspace = await installWorkspace(candidate, {
                id: uid(),
                year: candidate.settings.academicYear,
                term: candidate.settings.academicTerm,
              });
              const loaded = await readWorkspace(workspace.id);
              db = loaded.data;
              committed = loaded.records;
              ready = true;
              blocked = false;
              storageBlocked = false;
              isAuthenticated = false;
              rememberPeriod(workspace.id);
              render();
              return;
            }
            await flushDrafts({ strict: true });
            previewImport(candidate, file.name);
          } catch (error) {
            handleError(error);
          } finally {
            e.target.value = "";
          }
        }

        async function confirmImport() {
          if (fileMode)
            throw Error(
              "این عملیات را در نسخه نصب‌شده برنامه یا نشانی HTTPS آن انجام دهید.",
            );
          if (!pendingImport || pendingImport.workspace !== workspace.id)
            throw Error("پیش‌نمایش بازیابی منقضی شده است.");
          if (document.getElementById("restoreMode").value === "new") {
            const candidate = normalizeDB(pendingImport.candidate);
            const created = await installWorkspace(candidate, {
              year: candidate.settings.academicYear,
              term: recoveryPeriodTerm(
                candidate.settings.academicTerm || "بازیابی",
                uid(),
              ),
            });
            pendingImport = null;
            await switchPeriod(created.id);
            return;
          }
          if (!document.getElementById("restoreExternalConfirmed").checked) {
            handleError(
              Error("ابتدا نسخه مستقل را ذخیره و وجود فایل را تأیید کنید."),
            );
            return;
          }
          if (workspace.closed)
            throw Error(
              "دوره بسته است؛ برای بازیابی در آن ابتدا دوره را بازگشایی کنید.",
            );
          if (!confirm("اطلاعات این دوره با نسخه پیش‌نمایش جایگزین شود؟"))
            return;
          await flushDrafts({ strict: true });
          await writer.catch(() => {});
          const candidate = normalizeDB(pendingImport.candidate);
          candidate.settings.academicYear = workspace.year;
          candidate.settings.academicTerm = workspace.term;
          try {
            await putBackup(db, "پیش از بازیابی");
          } catch (error) {
            setStatus(
              "پشتیبان داخلی جا نشد؛ نسخه مستقلِ تأییدشده مسیر بازیابی است.",
              "pending",
            );
          }
          busy++;
          paintStatus();
          try {
            await commitRecords(collectRecords(candidate), {
              action: "بازیابی پشتیبان: " + pendingImport.label,
              replace: true,
              keepUndo: false,
            });
            db = candidate;
            drafts.clear();
            storeDrafts();
            pendingImport = null;
            isAuthenticated = false;
            state = {
              view: "schools",
              schoolId: null,
              classId: null,
              lessonId: null,
              tab: "students",
              reportTab: "comprehensive",
            };
            closeModal();
            setStatus("بازیابی تراکنشی انجام شد.", "saved");
          } catch (error) {
            handleError(error);
          } finally {
            busy--;
            render();
          }
        }

