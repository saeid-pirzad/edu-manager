        let periodLabelEditing = null,
          periodLabelSaving = false;
        async function editPeriodLabel() {
          assertEntityWritable();
          const previous = periodLabelEditing;
          periodLabelEditing = {
            id: workspace.id,
            revision: workspace.revision,
          };
          const opened = showModal(
            "اصلاح عنوان نوبت",
            '<form id="periodLabelEditor" class="record-editor" novalidate onsubmit="event.preventDefault();EduV24.savePeriodLabel()"><div class="record-editor-context"><span>دوره فعال</span><h4>' +
              esc(workspace.year + " / " + workspace.term) +
              '</h4><p>کلاس‌ها، نمرات و سوابق این دوره حفظ می‌شوند.</p></div><label class="course-field">سال تحصیلی<input id="editYear" value="' +
              esc(workspace.year) +
              '" readonly aria-describedby="periodYearHint"></label><p id="periodYearHint" class="muted">سال این دوره ثابت است؛ برای سال دیگر از «دوره جدید» استفاده کنید تا سوابق و قواعد سالانه مستقل بمانند.</p><label class="course-field">عنوان نوبت<input id="editTerm" value="' +
              esc(workspace.term) +
              '" maxlength="60" aria-describedby="periodLabelError" autocomplete="off"></label><p class="muted">این عنوان در فهرست دوره‌ها و گزارش‌های جاری نمایش داده می‌شود؛ کارنامه‌های ثابت قبلی تغییر نمی‌کنند.</p><p id="periodLabelError" role="alert"></p><div class="record-editor-actions"><button type="submit" data-mutating="1">ذخیره عنوان نوبت</button><button type="button" class="ghost" onclick="closeModal()">انصراف</button></div></form>',
          );
          if (opened === false) {
            periodLabelEditing = previous;
            return false;
          }
          rememberRecordEditor();
          return true;
        }
        async function savePeriodLabel() {
          if (periodLabelSaving) return false;
          periodLabelSaving = true;
          const form = document.querySelector(
            "#modal:not(.hidden) #periodLabelEditor",
          );
          const finishSave = beginRecordEditorSave(form);
          try {
            assertEntityWritable();
            const edit = periodLabelEditing;
            if (
              !form ||
              !edit ||
              edit.id !== workspace.id ||
              edit.revision !== workspace.revision
            )
              throw Error(
                "دوره یا اطلاعات از زمان باز شدن فرم تغییر کرده است؛ فرم را دوباره باز کنید.",
              );
            const year = asciiDigits(document.getElementById("editYear").value);
            const term = document
              .getElementById("editTerm")
              .value.trim()
              .replace(/\s+/g, " ");
            if (year !== workspace.year)
              throw recordFieldError(
                "سال دوره از این فرم قابل تغییر نیست؛ برای سال دیگر دوره مستقل بسازید.",
                "editYear",
              );
            if (!normalizedName(term) || term.length > 60)
              throw recordFieldError(
                "عنوان نوبت را با حداکثر ۶۰ نویسه وارد کنید.",
                "editTerm",
              );
            await flushDrafts({ strict: true });
            assertEntityWritable();
            if (
              edit.id !== workspace.id ||
              edit.revision !== workspace.revision
            )
              throw Error(
                "دوره یا اطلاعات تغییر کرده است؛ فرم را دوباره باز کنید.",
              );
            if (term !== workspace.term) {
              db.settings.academicTerm = term;
              await saveDBV24({ action: "اصلاح عنوان نوبت" });
            }
            periodLabelEditing = null;
            finishSave();
            rememberRecordEditor();
            await openPeriods();
            return true;
          } catch (error) {
            if (error.message?.includes("عنوان نوبت وجود دارد"))
              error.fieldId = "editTerm";
            if (!showRecordEditorError(error, "periodLabelError"))
              handleError(error);
            return false;
          } finally {
            periodLabelSaving = false;
            finishSave();
          }
        }
