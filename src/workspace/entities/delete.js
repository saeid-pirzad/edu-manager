        let deletionContext = null,
          deletionBusy = false;
        function deletionTarget(kind, id, schoolId, classId) {
          const school = getSchool(schoolId),
            cls = school?.classes.find((x) => x.id === classId);
          const item =
            kind === "school"
              ? school
              : kind === "class"
                ? cls
                : cls?.lessons.find((x) => x.id === id);
          if (!item || item.id !== id)
            throw Error("مورد انتخاب‌شده دیگر وجود ندارد.");
          const classes = kind === "school" ? school.classes : [cls];
          const classIds = new Set(classes.map((x) => x.id));
          const lessons =
            kind === "lesson" ? [item] : classes.flatMap((x) => x.lessons);
          const lessonIds = new Set(lessons.map((x) => x.id));
          const matches = (x) =>
            kind === "school"
              ? x.schoolId === school.id ||
                classIds.has(x.classId) ||
                lessonIds.has(x.lessonId)
              : kind === "class"
                ? x.classId === cls.id || lessonIds.has(x.lessonId)
                : x.lessonId === id;
          return { school, cls, item, matches, classes, lessons };
        }
        function openDeletion(kind, id) {
          try {
            assertEntityWritable();
            const schoolId = kind === "school" ? id : state.schoolId;
            const classId = kind === "class" ? id : state.classId;
            const target = deletionTarget(kind, id, schoolId, classId);
            const context = {
              kind,
              id,
              schoolId,
              classId,
              workspace: workspace.id,
              revision: workspace.revision,
            };
            const students =
              kind === "lesson"
                ? 0
                : target.classes.reduce(
                    (n, c) =>
                      n +
                      (c.students || []).length +
                      (c.archivedStudents || []).length,
                    0,
                  );
            const sessions = db.sessions.filter(target.matches).length;
            const slots = Object.values(db.masterSchedule || {}).filter(
              target.matches,
            ).length;
            const label =
              kind === "school" ? "مدرسه" : kind === "class" ? "کلاس" : "درس";
            const html =
              '<form class="record-editor" onsubmit="event.preventDefault();EduV24.confirmDeletion()"><p>حذف ' +
              label +
              " «" +
              esc(target.item.name) +
              "» شامل سوابق زیر است:</p><ul>" +
              (kind === "school"
                ? "<li>" + target.classes.length + " کلاس</li>"
                : "") +
              (kind !== "lesson"
                ? "<li>" + students + " هنرجوی فعال و بایگانی‌شده</li>"
                : "") +
              "<li>" +
              target.lessons.length +
              " درس و نمرات وابسته</li><li>" +
              sessions +
              " جلسه و سوابق حضور و فعالیت</li><li>" +
              slots +
              " خانه برنامه هفتگی</li></ul>" +
              "<p>پیش از حذف، پشتیبان داخلی از کل دوره ذخیره می‌شود. برای بازیابی از بخش پشتیبان‌ها استفاده کنید؛ بلافاصله پس از حذف، بازگردانی آخرین تغییر نیز در دسترس است. پشتیبان داخلی جای فایل مستقل را نمی‌گیرد.</p>" +
              '<label for="deleteEntityName">برای تأیید، نام ' +
              label +
              " را وارد کنید: " +
              esc(target.item.name) +
              '</label><input id="deleteEntityName" autocomplete="off" maxlength="500"><p id="deleteEntityError" role="alert"></p><div class="row"><button type="button" class="ghost" onclick="closeModal()">انصراف</button><button type="submit" class="danger">ذخیره پشتیبان و حذف</button></div></form>';
            if (showModal("بررسی حذف " + label, html) !== false)
              deletionContext = context;
          } catch (error) {
            handleError(error);
          }
        }
        async function confirmDeletion() {
          if (deletionBusy) return;
          const form = document.querySelector(
            "#modal:not(.hidden) #deleteEntityName",
          )?.form;
          if (!form) return;
          deletionBusy = true;
          const finish = beginRecordEditorSave(form);
          try {
            const context = deletionContext;
            const check = () => {
              assertEntityWritable();
              if (
                !context ||
                context.workspace !== workspace.id ||
                context.revision !== workspace.revision
              )
                throw Error(
                  "اطلاعات یا دوره تغییر کرده است؛ پنجره حذف را دوباره باز کنید.",
                );
              return deletionTarget(
                context.kind,
                context.id,
                context.schoolId,
                context.classId,
              );
            };
            let target = check();
            if (
              document.getElementById("deleteEntityName").value.trim() !==
              target.item.name.trim()
            )
              throw recordFieldError(
                "نام واردشده با نام مورد انتخاب‌شده یکسان نیست.",
                "deleteEntityName",
              );
            await flushDrafts({ strict: true });
            await writer.catch(() => {});
            target = check();
            await putBackup(
              db,
              "پیش از حذف: " + target.item.name,
              context.workspace,
            );
            target = check();
            const name = target.item.name;
            if (context.kind === "school")
              db.schools = db.schools.filter((x) => x.id !== context.id);
            else if (context.kind === "class")
              target.school.classes = target.school.classes.filter(
                (x) => x.id !== context.id,
              );
            else
              target.cls.lessons = target.cls.lessons.filter(
                (x) => x.id !== context.id,
              );
            db.sessions = db.sessions.filter((x) => !target.matches(x));
            Object.keys(db.masterSchedule || {}).forEach((key) => {
              if (target.matches(db.masterSchedule[key]))
                delete db.masterSchedule[key];
            });
            await saveDBV24({ action: "حذف " + name + " و سوابق مرتبط" });
            finish();
            rememberRecordEditor();
            deletionContext = null;
            if (context.kind === "school" && state.schoolId === context.id) {
              state.view = "schools";
              state.schoolId = null;
              state.classId = null;
            }
            if (context.kind === "class" && state.classId === context.id) {
              state.view = "school";
              state.classId = null;
            }
            if (context.kind === "lesson" && state.lessonId === context.id) {
              state.view = "class";
              state.lessonId = null;
            }
            render();
            closeModal();
            setStatus(
              "حذف انجام شد؛ پشتیبان پیش از حذف ذخیره شده است.",
              "saved",
            );
          } catch (error) {
            if (!showRecordEditorError(error, "deleteEntityError"))
              handleError(error);
          } finally {
            deletionBusy = false;
            finish();
          }
        }
