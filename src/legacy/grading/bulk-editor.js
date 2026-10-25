      function openBulkScoreModal(lessonId) {
        const c = getClassObj(state.schoolId, state.classId);
        const lesson = getLessonObj(c, lessonId);
        if (!c || !lesson) return;
        if (lesson.gradeMode === "kardanesh") {
          showModal(
            "ثبت نمرات کاردانش — " + lesson.name,
            buildKardaneshGradesHtml(c, lesson),
          );
          return;
        }
        let h = `<p class="muted">در این بخش می‌توانید نمرات مستمر و پایانی را برای همه دانش‌آموزان به یکباره ثبت کنید. هر پودمان/واحد جداگانه ذخیره می‌شود.</p>`;
        lesson.poudmans.forEach((p) => {
          p.units.forEach((u) => {
            const ao = u.applyOptions || {};
            h += `<div class="unit-block">
        <div class="unit-title">
          <span>📚 ${esc(p.name)} — ${esc(u.name)}</span>
        </div>
        <div class="unit-options">
          <span style="font-weight:600;color:#475569">اعمال در نمره نهایی این واحد:</span>
          <label><input type="checkbox" ${ao.pos ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','pos',this.checked)"> ➕ مثبت</label>
          <label><input type="checkbox" ${ao.neg ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','neg',this.checked)"> ➖ منفی</label>
          <label><input type="checkbox" ${ao.hw ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','hw',this.checked)"> 📝 تکلیف</label>
          <label><input type="checkbox" ${ao.present ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','present',this.checked)"> ✅ حضور</label>
          <label><input type="checkbox" ${ao.late ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','late',this.checked)"> ⏰ تأخیر</label>
        </div>
        <table class="bulk-score-table"><thead><tr>
          <th>#</th><th>دانش‌آموز</th><th>مستمر (0-20)</th><th>پایانی (0-20)</th>
        </tr></thead><tbody>`;
            const sortedStudents = getSortedStudents(c);
            sortedStudents.forEach((st, i) => {
              const existing = ownScoreRecord(u.unitScores, st.id) || {};
              h += `<tr>
          <td>${i + 1}</td>
          <td>${esc(st.name)}</td>
          <td><input type="number" step="0.25" min="0" max="20" value="${existing.m ?? ""}"
               onchange="saveBulkScore('${lesson.id}','${p.id}','${u.id}','${st.id}','m',this.value)"></td>
          <td><input type="number" step="0.25" min="0" max="20" value="${existing.p ?? ""}"
               onchange="saveBulkScore('${lesson.id}','${p.id}','${u.id}','${st.id}','p',this.value)"></td>
        </tr>`;
            });
            h += `</tbody></table></div>`;
          });
        });
        h += `<div class="row" style="justify-content:flex-end;margin-top:14px">
    <button onclick="closeModal()">بستن</button>
  </div>`;
        showModal(`📝 ثبت گروهی نمرات — ${lesson.name}`, h);
      }

      function saveBulkScore(lessonId, pId, uId, stId, field, value) {
        const c = getClassObj(state.schoolId, state.classId);
        const lesson = getLessonObj(c, lessonId);
        if (!lesson) return;
        const p = lesson.poudmans.find((x) => x.id === pId);
        const u = p?.units.find((x) => x.id === uId);
        if (!u) return;
        if (!u.unitScores) u.unitScores = {};
        u.unitScores[stId] = writableScoreRecord(u.unitScores, stId);
        const v = value === "" ? null : parseFloat(value);
        if (v === null || isNaN(v)) delete u.unitScores[stId][field];
        else {
          if (!Number.isFinite(v) || v < 0 || v > 20) {
            alert("نمره باید صفر تا بیست باشد.");
            return;
          }
          u.unitScores[stId][field] = v;
        }
        saveDB();
      }

      async function toggleUnitApplyDirect(lessonId, pId, uId, key, checked) {
        const c = getClassObj(state.schoolId, state.classId);
        const lesson = getLessonObj(c, lessonId);
        if (!lesson) return;
        const p = lesson.poudmans.find((x) => x.id === pId);
        const u = p?.units.find((x) => x.id === uId);
        if (!u) return;
        if (!u.applyOptions) u.applyOptions = {};
        u.applyOptions[key] = checked;
        await saveDB({ classId: c.id });

        const area = document.getElementById("lessonGradesArea");
        if (area && state.view === "lesson" && state.lessonId === lessonId) {
          const c2 = getClassObj(state.schoolId, state.classId);
          const l2 = getLessonObj(c2, lessonId);
          if (c2 && l2) area.innerHTML = buildLessonGradesHtml(c2, l2);
        }
      }

      async function toggleUnitApply(lessonId, pId, uId, key, checked) {
        const c = findClassById(karnamehFilter.classId);
        if (!c) return;
        const lesson = getLessonObj(c.classObj, lessonId);
        if (!lesson) return;
        const p = lesson.poudmans.find((x) => x.id === pId);
        const u = p?.units.find((x) => x.id === uId);
        if (!u) return;
        if (!u.applyOptions) u.applyOptions = {};
        u.applyOptions[key] = checked;
        await saveDB({ classId: c.classObj.id });
        renderKarnamehTabReports();
      }

      // ==================== محاسبه نمرات اصلاح‌شده ====================
