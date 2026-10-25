        async function openHistory(limit = 50) {
          await writer.catch(() => {});
          const tx = connection.transaction("events", "readonly"),
            events = await requestPromise(
              tx.objectStore("events").index("workspace").getAll(workspace.id),
            );
          events.sort((a, b) => b.id - a.id);
          const undo = await readRecord("undo", workspace.id);
          showModal(
            "تاریخچه تغییرات",
            "<p>تغییرات با زمان، مقدار قبل و بعد ثبت می‌شوند. اصلاح نمره و تغییر واحد هم در این فهرست هستند.</p>" +
              (undo
                ? '<button data-mutating="1" onclick="EduV24.undoLast()">بازگردانی آخرین تغییر: ' +
                  esc(undo.action) +
                  "</button>"
                : "") +
              events
                .slice(0, limit)
                .map(
                  (e) =>
                    '<details class="card"><summary>' +
                    esc(
                      new Date(e.at).toLocaleString("fa-IR") + " — " + e.action,
                    ) +
                    "</summary><table><thead><tr><th>مسیر</th><th>قبل</th><th>بعد</th></tr></thead><tbody>" +
                    e.changes
                      .map(
                        (change) =>
                          '<tr><td dir="ltr">' +
                          esc(change.path) +
                          "</td><td>" +
                          esc(JSON.stringify(change.before)) +
                          "</td><td>" +
                          esc(JSON.stringify(change.after)) +
                          "</td></tr>",
                      )
                      .join("") +
                    "</tbody></table></details>",
                )
                .join("") +
              (events.length > limit
                ? '<button onclick="EduV24.openHistory(' +
                  (limit + 50) +
                  ')">نمایش موارد بیشتر</button>'
                : ""),
          );
        }

        function validatedUndoCandidate(undo, records, period) {
          return EduUndoValidator.validate(undo, records, period, {
            assertSafeDataTree, isDataObject, isSafeRecordId, clone, logicalRecordType, validateLogicalValue, decodeWorkspaceRecords,
          });
        }
        let undoBusy = false;
        async function undoLast() {
          if (undoBusy) return false;
          undoBusy = true;
          busy++;
          paintStatus();
          try {
            await flushDrafts({ strict: true });
            await writer.catch(() => {});
            assertEntityWritable();
            const target = { id: workspace.id, revision: workspace.revision };
            const operation = performUndo(target);
            writer = operation;
            return await operation;
          } finally {
            undoBusy = false;
            busy--;
            paintStatus();
          }
        }
        async function performUndo(target) {
          const undo = await readRecord("undo", target.id);
          if (
            !undo ||
            workspace.id !== target.id ||
            workspace.revision !== target.revision ||
            undo.revision !== target.revision
          )
            throw Error("آخرین تغییر قابل بازگردانی نیست.");
          const candidate = validatedUndoCandidate(
            undo,
            new Map(
              [...committed].map(([key, value]) => [key, JSON.parse(value)]),
            ),
            workspace,
          );
          if (!confirm("آخرین تغییر «" + undo.action + "» بازگردانده شود؟"))
            return false;
          assertEntityWritable();
          if (
            workspace.id !== target.id ||
            workspace.revision !== target.revision
          )
            throw Error("دوره یا اطلاعات بازگردانی تغییر کرده است.");
          await commitRecords(candidate, {
            action: "بازگردانی: " + undo.action,
            replace: true,
            keepUndo: false,
          });
          const loaded = await readWorkspace(workspace.id);
          db = loaded.data;
          committed = loaded.records;
          closeModal();
          render();
          setStatus("آخرین تغییر بازگردانده شد.", "saved");
          return true;
        }

