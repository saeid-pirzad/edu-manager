        let studentCreationBusy = false,
          studentEditing = null,
          studentSaving = false;
        function studentIdentity(
          nameValue,
          codeValue,
          previous = null,
          nameId = "editStudentName",
          codeId = "editStudentCode",
        ) {
          const name = String(nameValue || "").trim(),
            code = asciiDigits(codeValue);
          if (
            !normalizedName(name) ||
            (name.length > 200 && name !== previous?.name)
          )
            throw recordFieldError(
              "نام معتبر با حداکثر ۲۰۰ نویسه وارد کنید.",
              nameId,
            );
          if (code.length > 120 && code !== previous?.code)
            throw recordFieldError(
              "کد هنرجو باید حداکثر ۱۲۰ نویسه باشد.",
              codeId,
            );
          return { name, code };
        }
        function applyStudentIdentity(c, student, { name, code }) {
          student.name = name;
          student.code = code;
          if (student.recovered && !name.startsWith("دانش‌آموز بازیابی‌شده")) {
            student.recovered = false;
            for (const session of db.sessions.filter((x) => x.classId === c.id))
              for (const member of session.roster || [])
                if (member.id === student.id && member.recovered) {
                  member.name = name;
                  member.recovered = false;
                }
            const unresolved = db.schools.some((s) =>
              s.classes.some((cl) =>
                knownStudents(cl).some(
                  (x) => x.id === student.id && x.recovered,
                ),
              ),
            );
            if (!unresolved)
              db.migrationWarnings = (db.migrationWarnings || []).filter(
                (message) => !message.includes(student.id),
              );
          }
        }
        async function addStudentV24(event) {
          event.preventDefault();
          if (studentCreationBusy) return false;
          const form = event.target;
          const values = {
            name: form.elements.namedItem("name").value,
            code: form.elements.namedItem("code")?.value || "",
          };
          const target = {
            workspace: workspace?.id,
            schoolId: state.schoolId,
            classId: state.classId,
          };
          const sameTarget = () =>
            target.workspace === workspace?.id &&
            target.schoolId === state.schoolId &&
            target.classId === state.classId;
          studentCreationBusy = true;
          const finish = beginRecordEditorSave(form);
          try {
            assertEntityWritable();
            const { name, code } = studentIdentity(
              values.name,
              values.code,
              null,
              "studentCreateName",
              "studentCreateCode",
            );
            await flushDrafts({ strict: true });
            await writer.catch(() => {});
            assertEntityWritable();
            if (!sameTarget())
              throw Error("کلاس یا دوره تغییر کرده است؛ ثبت انجام نشد.");
            const c = getClassObj(target.schoolId, target.classId);
            if (!c) throw Error("کلاس مقصد دیگر وجود ندارد.");
            if (code && knownStudents(c).some((st) => st.code === code))
              throw recordFieldError(
                "این کد در فهرست فعال یا بایگانی کلاس وجود دارد؛ رکورد موجود را بررسی کنید.",
                "studentCreateCode",
              );
            freezeClassRosters(c);
            c.students.push({ id: uid(), name, ...(code ? { code } : {}) });
            await saveDBV24({ action: "افزودن هنرجو: " + name });
            render();
            return true;
          } catch (error) {
            const current = sameTarget()
              ? document.querySelector('form[data-entity-create="student"]')
              : null;
            if (current) {
              current.elements.namedItem("name").value = values.name;
              current.elements.namedItem("code").value = values.code;
              current.querySelector('[role="alert"]').textContent =
                error.message;
              const input = document.getElementById(
                error.fieldId || "studentCreateName",
              );
              if (error.fieldId) input?.setAttribute("aria-invalid", "true");
              current.closest("details").open = true;
              requestAnimationFrame(() => {
                if (current.isConnected) current.closest("details").open = true;
                if (input?.isConnected && !input.disabled)
                  input.focus({ preventScroll: true });
              });
            } else handleError(error);
            return false;
          } finally {
            studentCreationBusy = false;
            finish();
          }
        }
        async function editStudentV24(studentId) {
          try {
            const origin = {
              workspace: workspace?.id,
              schoolId: state.schoolId,
              classId: state.classId,
            };
            assertEntityWritable();
            await flushDrafts({ strict: true });
            assertEntityWritable();
            if (
              origin.workspace !== workspace.id ||
              origin.schoolId !== state.schoolId ||
              origin.classId !== state.classId
            )
              throw Error(
                "کلاس یا دوره تغییر کرده است؛ ویرایش را دوباره باز کنید.",
              );
            const c = getClassObj(origin.schoolId, origin.classId),
              student = c && getStudentObj(c, studentId);
            if (!student) throw Error("هنرجو دیگر در این کلاس وجود ندارد.");
            const context = {
              ...origin,
              studentId,
              revision: workspace.revision,
            };
            const html =
              '<form class="record-editor" id="studentEditor" novalidate onsubmit="event.preventDefault();EduV24.saveStudent()"><div class="record-editor-context"><h4>' +
              esc(student.name) +
              "</h4><p>" +
              esc(getSchool(origin.schoolId).name + " / " + c.name) +
              (c.students.some((x) => x.id === studentId)
                ? " · هنرجوی فعال"
                : " · سوابق بایگانی‌شده") +
              '</p></div><label for="editStudentName">نام و نام خانوادگی</label><input id="editStudentName" name="name" required autocomplete="off" aria-describedby="studentEditError" value="' +
              esc(student.name) +
              '"><label for="editStudentCode">کد هنرجو (اختیاری)</label><input id="editStudentCode" name="code" inputmode="numeric" autocomplete="off" aria-describedby="studentEditError" value="' +
              esc(student.code || "") +
              '"><p>شناسه، نمرات و نام تاریخی جلسات قبلی حفظ می‌شوند. اصلاح نام موقت بازیابی‌شده، فقط نام‌های نیازمند بررسی همان هنرجو در جلسات این کلاس را نیز اصلاح می‌کند.</p><p id="studentEditError" class="entity-create-error" role="alert"></p><div class="row record-editor-actions"><button type="button" class="ghost" onclick="closeModal()">انصراف</button><button type="submit">ذخیره مشخصات</button></div></form>';
            if (showModal("ویرایش مشخصات هنرجو", html) !== false) {
              studentEditing = context;
              rememberRecordEditor();
            }
          } catch (error) {
            handleError(error);
          }
        }
        async function saveStudent(studentId) {
          if (studentSaving) return;
          const form = document.querySelector(
            "#modal:not(.hidden) #studentEditor",
          );
          if (!form) return;
          studentSaving = true;
          const finish = beginRecordEditorSave(form);
          try {
            const context = studentEditing;
            const check = () => {
              assertEntityWritable();
              if (
                !context ||
                (studentId && studentId !== context.studentId) ||
                context.workspace !== workspace.id ||
                context.revision !== workspace.revision ||
                context.schoolId !== state.schoolId ||
                context.classId !== state.classId
              )
                throw Error(
                  "کلاس، دوره یا اطلاعات تغییر کرده است؛ فرم را دوباره باز کنید.",
                );
              const c = getClassObj(context.schoolId, context.classId),
                student = c && getStudentObj(c, context.studentId);
              if (!student) throw Error("هنرجو دیگر در این کلاس وجود ندارد.");
              return { c, student };
            };
            let { student } = check();
            const { name, code } = studentIdentity(
              document.getElementById("editStudentName").value,
              document.getElementById("editStudentCode").value,
              student,
            );
            await flushDrafts({ strict: true });
            await writer.catch(() => {});
            const current = check(),
              c = current.c;
            student = current.student;
            if (
              code &&
              knownStudents(c).some(
                (x) => x.id !== student.id && x.code === code,
              )
            )
              throw recordFieldError(
                "این کد در فهرست فعال یا بایگانی کلاس وجود دارد.",
                "editStudentCode",
              );
            if (
              student.name !== name ||
              (student.code || "") !== code ||
              (student.recovered && !name.startsWith("دانش‌آموز بازیابی‌شده"))
            ) {
              freezeClassRosters(c);
              applyStudentIdentity(c, student, { name, code });
              await saveDBV24({ action: "اصلاح مشخصات هنرجو: " + name });
            }
            finish();
            rememberRecordEditor();
            studentEditing = null;
            closeModal();
            render();
          } catch (error) {
            if (!showRecordEditorError(error, "studentEditError"))
              handleError(error);
          } finally {
            studentSaving = false;
            finish();
          }
        }

