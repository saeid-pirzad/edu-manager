        let entityEditing = null,
          entitySaving = false;
        function assertEntityWritable() {
          if (
            fileMode ||
            !ready ||
            resetBusy ||
            connectionRetired ||
            blocked ||
            workspace?.closed
          )
            throw Error("دوره فعلی قابل ویرایش نیست.");
        }
        async function openEntityEditor(kind, id, schoolId = "") {
          const requestedWorkspace = workspace?.id;
          assertEntityWritable();
          await flushDrafts({ strict: true });
          assertEntityWritable();
          if (requestedWorkspace !== workspace.id)
            throw Error(
              "دوره هنگام باز شدن فرم تغییر کرد؛ دوباره ویرایش را باز کنید.",
            );
          if (!["school", "class"].includes(kind))
            throw Error("نوع اطلاعات نامعتبر است.");
          const school =
            kind === "school" ? getSchool(id) : getSchool(schoolId);
          const item =
            kind === "school"
              ? school
              : school?.classes.find((c) => c.id === id);
          if (!item) throw Error("اطلاعات پیدا نشد؛ صفحه را تازه کنید.");
          const previousEditing = entityEditing;
          entityEditing = {
            kind,
            id,
            schoolId: school.id,
            workspace: workspace.id,
            revision: workspace.revision,
          };
          const label = kind === "school" ? "مدرسه" : "کلاس";
          const classes = kind === "school" ? item.classes : [item];
          const count = classes.reduce((n, c) => n + c.students.length, 0);
          const opened = showModal(
            "ویرایش مشخصات " + label,
            '<form class="record-editor" onsubmit="event.preventDefault();EduV24.saveEntityEditor()"><div class="record-editor-context"><span>' +
              esc(workspace.year + " · " + workspace.term) +
              "</span><h4>" +
              esc(item.name) +
              "</h4><p>" +
              esc(
                kind === "class"
                  ? school.name
                  : classes.length.toLocaleString("fa-IR") + " کلاس",
              ) +
              " · " +
              count.toLocaleString("fa-IR") +
              ' هنرجو</p></div><label class="course-field">نام ' +
              label +
              '<input id="entityEditName" name="name" value="' +
              esc(item.name) +
              '" required maxlength="500" autocomplete="off" aria-describedby="entityEditHint entityEditError"></label>' +
              '<p id="entityEditHint" class="muted">تغییر نام در همین دوره اعمال می‌شود؛ نمرات، جلسات و برنامه هفتگی حفظ می‌شوند. کارنامه‌های نهایی قبلی تغییر نمی‌کنند.</p><p id="entityEditError" role="alert"></p>' +
              '<div class="record-editor-actions"><button type="submit" data-mutating="1">ذخیره تغییرات</button><button type="button" class="ghost" onclick="closeModal()">انصراف</button></div></form>',
          );
          if (opened === false) {
            entityEditing = previousEditing;
            return false;
          }
          rememberRecordEditor();
        }
        async function saveEntityEditor() {
          if (entitySaving) return;
          entitySaving = true;
          const finishSave = beginRecordEditorSave(
            document.querySelector("#modal .record-editor"),
          );
          try {
            assertEntityWritable();
            if (!document.querySelector("#modal:not(.hidden) #entityEditName"))
              throw Error("فرم ویرایش باز نیست.");
            const edit = entityEditing;
            if (
              !edit ||
              edit.workspace !== workspace.id ||
              edit.revision !== workspace.revision
            )
              throw Error(
                "اطلاعات از زمان باز شدن فرم تغییر کرده است؛ فرم را دوباره باز کنید.",
              );
            const name = document
              .getElementById("entityEditName")
              .value.trim()
              .replace(/\s+/g, " ");
            if (!normalizedName(name) || name.length > 500)
              throw recordFieldError(
                "نام معتبر با حداکثر ۵۰۰ نویسه وارد کنید.",
                "entityEditName",
              );
            await flushDrafts({ strict: true });
            assertEntityWritable();
            if (
              edit.workspace !== workspace.id ||
              edit.revision !== workspace.revision
            )
              throw Error(
                "دوره یا اطلاعات تغییر کرده است؛ فرم را دوباره باز کنید.",
              );
            const school = getSchool(edit.schoolId);
            const item =
              edit.kind === "school"
                ? school
                : school?.classes.find((c) => c.id === edit.id);
            if (!item) throw Error("اطلاعات مقصد دیگر وجود ندارد.");
            const peers = edit.kind === "school" ? db.schools : school.classes;
            if (
              normalizedName(item.name) !== normalizedName(name) &&
              peers.some(
                (x) =>
                  x.id !== item.id &&
                  normalizedName(x.name) === normalizedName(name),
              )
            )
              throw recordFieldError(
                edit.kind === "school"
                  ? "مدرسه‌ای با همین نام وجود دارد."
                  : "کلاسی با همین نام در این مدرسه وجود دارد.",
                "entityEditName",
              );
            if (item.name !== name) {
              item.name = name;
              await saveDBV24({
                ...(edit.kind === "class" ? { classId: item.id } : {}),
                action:
                  "ویرایش نام " + (edit.kind === "school" ? "مدرسه" : "کلاس"),
              });
            }
            entityEditing = null;
            finishSave();
            rememberRecordEditor();
            closeModal();
            render();
          } catch (error) {
            if (!showRecordEditorError(error, "entityEditError"))
              handleError(error);
          } finally {
            entitySaving = false;
            finishSave();
          }
        }

