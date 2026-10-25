        function gradeCell(
          c,
          l,
          st,
          field,
          { kind = "k", pid = "", uid: unitId = "", value = null } = {},
        ) {
          const d = {
              kind,
              classId: c.id,
              lid: l.id,
              sid: st.id,
              pid,
              uid: unitId,
              field,
            },
            key = inputKey(d),
            draft = drafts.get(key),
            shown = draft ? draft.value : (value ?? "");
          return (
            '<div class="grade-editor"><input type="text" inputmode="decimal" autocomplete="off" dir="ltr" data-grade="1" data-kind="' +
            kind +
            '" data-class="' +
            c.id +
            '" data-lesson="' +
            l.id +
            '" data-student="' +
            st.id +
            '" data-pod="' +
            pid +
            '" data-unit="' +
            unitId +
            '" data-field="' +
            field +
            '" value="' +
            esc(shown) +
            '" aria-label="' +
            esc(
              st.name +
                " " +
                (field === "practical"
                  ? "عملی"
                  : field === "theory"
                    ? "تئوری"
                    : field === "c"
                      ? "شایستگی"
                      : field === "m"
                        ? "مستمر"
                        : "پایانی"),
            ) +
            '" oninput="EduV24.gradeInput(this)" onblur="EduV24.flushDrafts().catch(()=>{})"><button type="button" class="ghost grade-clear no-print" aria-label="پاک‌کردن نمره" onclick="EduV24.clearGrade(this.previousElementSibling)">پاک‌کردن</button><small class="grade-note" aria-live="polite">' +
            esc(draft ? draft.error || "در انتظار ذخیره" : "") +
            "</small></div>"
          );
        }

        function applyDrafts() {
          document.querySelectorAll("[data-grade]").forEach((input) => {
            const item = drafts.get(inputKey(contextFromInput(input)));
            if (item) {
              input.value = item.value;
              input.setAttribute("aria-invalid", item.error ? "true" : "false");
              const note = input.parentElement.querySelector(".grade-note");
              if (note) note.textContent = item.error || "در انتظار ذخیره";
            }
          });
        }

