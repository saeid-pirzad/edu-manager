        function installUI() {
          installGradeEvents();
          window.addEventListener("storage", (event) => {
            if (
              event.key === RESET_EPOCH_KEY &&
              event.newValue &&
              event.newValue !== installationToken &&
              !resetBusy
            )
              invalidateInstallation();
          });
          window.addEventListener("beforeunload", (event) => {
            if (
              busy ||
              drafts.size ||
              draftRecoveryFailed ||
              draftWritesPending ||
              hasRecordEditorChanges() ||
              document.querySelector(
                '.record-editor[aria-busy="true"],[data-entity-create][aria-busy="true"]',
              )
            ) {
              event.preventDefault();
              event.returnValue = "";
            }
          });
          window.addEventListener("pagehide", () => {
            if (ready) storeDrafts();
            tabClaimed = false;
            channel?.close();
          });
          window.addEventListener("pageshow", (event) => {
            if (event.persisted) location.reload();
          });
          window.addEventListener("unhandledrejection", (event) => {
            event.preventDefault();
            handleError(
              event.reason instanceof Error
                ? event.reason
                : Error(String(event.reason)),
            );
          });
          window.addEventListener("beforeprint", () => {
            if (!document.getElementById("printRoot") && ready) {
              if (drafts.size) {
                const root = document.createElement("div");
                root.id = "printRoot";
                root.textContent =
                  "چاپ انجام نشد: ابتدا ورودی‌های ذخیره‌نشده را اصلاح یا لغو کنید.";
                document.body.append(root);
              } else preparePrint(null);
            }
          });
          window.addEventListener("afterprint", () => {
            document.getElementById("printRoot")?.remove();
            document.getElementById("printPageStyle")?.remove();
          });
          document.addEventListener("keydown", (event) => {
            const overlay = document.getElementById("modal");
            if (overlay.classList.contains("hidden")) return;
            if (event.key === "Escape") {
              event.preventDefault();
              if (drafts.size) {
                flushDrafts({ strict: true })
                  .then(() => closeModal())
                  .catch(handleError);
              } else closeModal();
              return;
            }
            if (event.key === "Tab") {
              const nodes = modalFocusableElements();
              if (nodes.length) {
                const first = nodes[0],
                  last = nodes[nodes.length - 1];
                if (
                  event.shiftKey &&
                  (document.activeElement === first ||
                    !nodes.includes(document.activeElement))
                ) {
                  event.preventDefault();
                  last.focus();
                } else if (
                  !event.shiftKey &&
                  (document.activeElement === last ||
                    !nodes.includes(document.activeElement))
                ) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }
          });
          if (channel)
            channel.onmessage = (event) => {
              const message = event.data;
              if (message.type === "installation-reset" && !resetBusy) {
                invalidateInstallation();
                return;
              }
              if (tabMessage(message)) return;
              window.EduPeriodicReports?.workspaceChanged?.(message);
              if (
                workspace &&
                message.workspace === workspace.id &&
                message.revision > workspace.revision
              ) {
                markWorkspaceConflict();
              }
            };
        }

        function showModalV24(title, html) {
          if (old.showModal(title, html) === false) return false;
          setTimeout(() => {
            applyDrafts();
            lockControls();
            if (!document.getElementById("modal").classList.contains("hidden"))
              (
                modalFocusableElements().find((element) =>
                  element.closest("#modalBody"),
                ) || document.querySelector("#modal .modal-dialog")
              )?.focus({ preventScroll: true });
          }, 0);
          return true;
        }

        async function loginV24(e) {
          if (fileMode) {
            e.preventDefault();
            const input = document.getElementById("loginPass");
            if (await verifyPassword(input.value, db.settings.password)) {
              isAuthenticated = true;
              render();
            } else {
              input.value = "";
              alert("رمز عبور اشتباه است.");
            }
            return;
          }
          await old.checkPassword(e);
          if (isAuthenticated) await recoverDrafts();
        }

