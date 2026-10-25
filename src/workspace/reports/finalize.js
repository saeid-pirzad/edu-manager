        function finalReportData() {
          const classes = [];
          let missing = [];
          for (const school of db.schools)
            for (const c of school.classes) {
              const students = getSortedStudents(c).map((st) => {
                const lessons = c.lessons.map((l) => {
                  const result = calcV24(c, l, st.id);
                  const assessments =
                    l.gradeMode === "kardanesh"
                      ? {
                          version: 1,
                          midterm: assessmentResult(l, st.id, "midterm"),
                          final: assessmentResult(l, st.id, "final"),
                        }
                      : null;
                  if (assessments)
                    for (const [stage, r] of [
                      ["میان‌ترم", assessments.midterm],
                      ["پایان‌ترم", assessments.final],
                    ]) {
                      if (r.practical === null)
                        missing.push(
                          c.name +
                            " / " +
                            st.name +
                            " / " +
                            l.name +
                            " / " +
                            stage +
                            " / عملی",
                        );
                      if (r.theory === null)
                        missing.push(
                          c.name +
                            " / " +
                            st.name +
                            " / " +
                            l.name +
                            " / " +
                            stage +
                            " / تئوری",
                        );
                    }
                  if (l.gradingPolicy && !l.gradingPolicy.confirmed)
                    missing.push(
                      c.name + " / " + l.name + " / قواعد ابلاغیه تأیید نشده",
                    );
                  if (result.final === null && result.passed !== false)
                    missing.push(c.name + " / " + st.name + " / " + l.name);
                  return {
                    id: l.id,
                    name: l.name,
                    mode: l.gradeMode,
                    ...(assessments ? { assessments } : {}),
                    policy: l.gradingPolicy ? clone(l.gradingPolicy) : null,
                    courseInfo: EduPolicy.identity(l, workspace.year),
                    modules: result.modules || null,
                    reason: result.reason || "",
                    teacher: l.teacher || "",
                    practical: result.practical ?? null,
                    theory: result.theory ?? null,
                    mostamar: result.avgM,
                    payani: result.avgP,
                    final: result.final,
                    passed: result.passed ?? null,
                  };
                });
                return {
                  id: st.id,
                  name: st.name,
                  code: st.code || "",
                  lessons,
                  average:
                    lessons.length && lessons.every((l) => l.final !== null)
                      ? lessons.reduce((n, l) => n + l.final, 0) /
                        lessons.length
                      : null,
                };
              });
              if (c.students.length && !c.lessons.length)
                missing.push(c.name + " / بدون درس");
              classes.push({ school: school.name, name: c.name, students });
            }
          if (!classes.some((c) => c.students.length))
            missing.push("دانش‌آموزی برای صدور کارنامه وجود ندارد.");
          return { classes, missing };
        }

        async function finalizePeriod() {
          assertWorkspaceReadable();
          assertEntityWritable();
          const origin = workspace.id;
          if (fileMode)
            throw Error(
              "این عملیات را در نسخه نصب‌شده برنامه یا نشانی HTTPS آن انجام دهید.",
            );
          await flushDrafts({ strict: true });
          await writer.catch(() => {});
          if (workspace.id !== origin)
            throw Error("دوره هنگام بستن تغییر کرد؛ دوباره تلاش کنید.");
          const context = captureWorkspaceContext();
          const report = finalReportData();
          if (report.missing.length) {
            handleError(
              Error(
                "بستن دوره ممکن نیست؛ نمرات ناقص: " +
                  report.missing.slice(0, 10).join(" | ") +
                  (report.missing.length > 10 ? " و موارد دیگر" : ""),
              ),
            );
            return;
          }
          if (
            !confirm(
              "دوره " +
                workspace.year +
                " / " +
                workspace.term +
                " بسته و کارنامه ثابت ثبت شود؟",
            )
          )
            return;
          await putBackup(db, "پیش از بستن دوره");
          assertWorkspaceContext(context, { write: true });
          if (busy || drafts.size)
            throw Error(
              "ویرایش تازه‌ای هنگام بستن دوره ایجاد شد؛ ابتدا آن را ذخیره و دوباره تلاش کنید.",
            );
          const at = new Date().toISOString(),
            snapshot = {
              id: uid(),
              workspace: context.id,
              year: workspace.year,
              term: workspace.term,
              at,
              classes: report.classes,
            };
          validateFrozenReport(snapshot);
          let finalizedWorkspace;
          const tx = connection.transaction(
              ["catalog", "reports", "events", "undo"],
              "readwrite",
            ),
            done = transactionDone(tx);
          const request = tx.objectStore("catalog").get(context.id);
          request.onsuccess = () => {
            if (
              !request.result ||
              request.result.closed ||
              request.result.revision !== context.revision ||
              workspace.id !== context.id
            ) {
              tx.abort();
              return;
            }
            finalizedWorkspace = {
              ...request.result,
              closed: true,
              closedAt: at,
              revision: request.result.revision + 1,
            };
            tx.objectStore("catalog").put(finalizedWorkspace);
            tx.objectStore("reports").put(snapshot);
            tx.objectStore("undo").delete(context.id);
            tx.objectStore("events").add({
              workspace: workspace.id,
              at,
              revision: finalizedWorkspace.revision,
              action: "بستن دوره و ثبت کارنامه ثابت",
              changes: [],
            });
          };
          await done;
          workspace = finalizedWorkspace;
          broadcast({
            workspace: workspace.id,
            revision: workspace.revision,
          });
          await openPeriods();
          render();
        }

        async function reopenPeriod() {
          if (fileMode)
            throw Error(
              "این عملیات را در نسخه نصب‌شده برنامه یا نشانی HTTPS آن انجام دهید.",
            );
          if (!workspace.closed) return;
          if (
            !confirm(
              "دوره بازگشایی شود؟ کارنامه ثابت قبلی حفظ می‌شود و تغییرات جدید جدا ثبت می‌شوند.",
            )
          )
            return;
          let reopenedWorkspace;
          const tx = connection.transaction(["catalog", "events"], "readwrite"),
            done = transactionDone(tx),
            request = tx.objectStore("catalog").get(workspace.id);
          request.onsuccess = () => {
            if (request.result.revision !== workspace.revision) {
              tx.abort();
              return;
            }
            reopenedWorkspace = {
              ...request.result,
              closed: false,
              revision: request.result.revision + 1,
            };
            tx.objectStore("catalog").put(reopenedWorkspace);
            tx.objectStore("events").add({
              workspace: workspace.id,
              at: new Date().toISOString(),
              revision: reopenedWorkspace.revision,
              action: "بازگشایی دوره؛ کارنامه ثابت پیشین محفوظ است",
              changes: [],
            });
          };
          await done;
          workspace = reopenedWorkspace;
          broadcast({
            workspace: workspace.id,
            revision: workspace.revision,
          });
          await openPeriods();
          render();
        }

