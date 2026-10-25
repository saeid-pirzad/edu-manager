      async function deleteSchool(id) {
        if (!confirm("مدرسه و تمام داده‌هایش حذف شوند؟")) return;
        const school = db.schools.find((s) => s.id === id);
        const classIds = (school?.classes || []).map((c) => c.id);
        db.schools = db.schools.filter((s) => s.id !== id);
        db.sessions = db.sessions.filter((x) => x.schoolId !== id);
        Object.keys(db.masterSchedule || {}).forEach((k) => {
          const e = db.masterSchedule[k];
          if (e.schoolId === id || classIds.includes(e.classId))
            delete db.masterSchedule[k];
        });
        await saveDB();
        render();
      }
      async function deleteClass(id) {
        if (!confirm("کلاس و تمام داده‌هایش حذف شوند؟")) return;
        const s = getSchool(state.schoolId);
        s.classes = s.classes.filter((c) => c.id !== id);
        db.sessions = db.sessions.filter((x) => x.classId !== id);
        Object.keys(db.masterSchedule || {}).forEach((k) => {
          if (db.masterSchedule[k].classId === id) delete db.masterSchedule[k];
        });
        await saveDB();
        render();
      }
      function addStudent(e) {
        e.preventDefault();
        const c = getClassObj(state.schoolId, state.classId);
        if (!c) return;
        const n = e.target.name.value.trim();
        if (!n) return;
        c.students.push({ id: uid(), name: n });
        saveDB();
        e.target.reset();
        render();
      }
      async function deleteStudent(stId) {
        if (!confirm("دانش‌آموز از فهرست فعال خارج و سوابق بایگانی شود؟"))
          return;
        const c = getClassObj(state.schoolId, state.classId),
          st = getStudentObj(c, stId);
        if (st) {
          archiveStudent(c, st);
          await saveDB({ classId: c.id });
          render();
        }
      }

      async function addLesson(e) {
        e.preventDefault();
        const c = getClassObj(state.schoolId, state.classId);
        if (!c) return;
        const n = e.target.name.value.trim();
        if (!n) return;
        const teacher = e.target.teacher.value.trim();
        const periods = parseInt(e.target.periods.value) || 2;
        c.lessons.push({
          id: uid(),
          name: n,
          teacher,
          periodsPerWeek: periods,
          gradeMode: e.target.gradeMode.value,
          kardaneshScores: {},
          weightMostamar: 40,
          weightPayani: 60,
          applyPosNegToFinal: false,
          poudmans:
            e.target.gradeMode.value === "kardanesh"
              ? []
              : makeDefaultPoudmans(),
        });
        await saveDB({ classId: c.id });
        e.target.reset();
        render();
      }
      async function deleteLesson(id) {
        if (!confirm("درس و تمام نمراتش حذف شوند؟")) return;
        const c = getClassObj(state.schoolId, state.classId);
        c.lessons = c.lessons.filter((l) => l.id !== id);
        db.sessions = db.sessions.filter((x) => x.lessonId !== id);
        Object.keys(db.masterSchedule || {}).forEach((k) => {
          if (db.masterSchedule[k].lessonId === id) delete db.masterSchedule[k];
        });
        await saveDB({ action: "حذف درس و جلسات مرتبط" });
        render();
      }

      function openTransferModal(stId) {
        const c = getClassObj(state.schoolId, state.classId);
        const student = getStudentObj(c, stId);
        if (!student) return;
        let h = `<p>دانش‌آموز: <strong>${esc(student.name)}</strong></p>
    <div class="form-row"><label>کلاس مقصد:</label><select id="transferTarget" style="flex:1">`;
        let hasTarget = false;
        db.schools.forEach((s) =>
          s.classes.forEach((cl) => {
            if (cl.id === c.id) return;
            hasTarget = true;
            h += `<option value="${cl.id}">${esc(s.name)} → ${esc(cl.name)}</option>`;
          }),
        );
        h += `</select></div>`;
        if (!hasTarget)
          h += `<p class="muted">کلاس دیگری وجود ندارد</p><button onclick="closeModal()">بستن</button>`;
        else
          h += `<div class="row" style="justify-content:flex-end">
    <button class="ghost" onclick="closeModal()">انصراف</button>
    <button class="ghost" onclick="doTransfer('${stId}',true)">📋 کپی</button>
    <button onclick="doTransfer('${stId}',false)">📤 انتقال</button></div>`;
        showModal("انتقال/کپی دانش‌آموز", h);
      }
      async function doTransfer(stId, isCopy) {
        const targetId = document.getElementById("transferTarget").value;
        const srcC = getClassObj(state.schoolId, state.classId);
        const student = srcC.students.find((s) => s.id === stId);
        if (!student || !targetId) return;
        let targetC = null;
        for (const s of db.schools) {
          const t = s.classes.find((c) => c.id === targetId);
          if (t) {
            targetC = t;
            break;
          }
        }
        if (!targetC) return;
        if (student.code && knownStudentCode(targetC, student.code, student.id))
          return alert("کد دانش‌آموز در مقصد تکراری است.");
        if (isCopy)
          targetC.students.push({
            id: uid(),
            name: student.name,
            ...(student.code ? { code: student.code } : {}),
          });
        else {
          if (targetC.students.some((s) => s.id === student.id))
            return alert("دانش‌آموز در مقصد وجود دارد.");
          targetC.archivedStudents = (targetC.archivedStudents || []).filter(
            (s) => s.id !== student.id,
          );
          targetC.students.push({
            id: student.id,
            name: student.name,
            ...(student.code ? { code: student.code } : {}),
          });
          archiveStudent(srcC, student);
        }
        await saveDB();
        closeModal();
        render();
      }

