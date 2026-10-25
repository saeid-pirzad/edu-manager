      function legacy_buildLessonGradesHtml(c, lesson) {
        if (lesson.gradeMode === "kardanesh")
          return buildKardaneshGradesHtml(c, lesson);
        let allPos = true,
          allNeg = true,
          allHw = true,
          allPresent = true,
          allLate = true;
        let hasUnits = false;
        lesson.poudmans.forEach((p) =>
          p.units.forEach((u) => {
            hasUnits = true;
            const ao = u.applyOptions || {};
            if (!ao.pos) allPos = false;
            if (!ao.neg) allNeg = false;
            if (!ao.hw) allHw = false;
            if (!ao.present) allPresent = false;
            if (!ao.late) allLate = false;
          }),
        );
        if (!hasUnits) {
          allPos = false;
          allNeg = false;
          allHw = false;
          allPresent = false;
          allLate = false;
        }

        let h = `<div class="card"><h3>📝 نمرات تفصیلی — ${esc(lesson.name)}</h3>
    <div class="row no-print" style="justify-content:flex-end;margin-bottom:10px">
      <button class="success" onclick="openBulkScoreModal('${lesson.id}')">📝 ثبت گروهی همه نمرات</button>
    </div>
    <p class="muted" style="font-size:.85em">نمره واحد = میانگین وزنی مستمر و پایانی با امتیازات انتخاب‌شده (صفر تا ۲۰). آخرین نمره تاریخ‌دار ملاک است؛ ثبت گروهی اولویت دارد. نهایی درس پس از تکمیل همه واحدها صادر می‌شود.</p>
    <div class="filter-units-box no-print">
      <div style="font-weight:700;color:#3730a3;font-size:.9em">⚙️ اعمال در نمره هر واحد (اعمال روی همه واحدها):</div>
      <div class="chips">
        <label><input type="checkbox" ${allPos ? "checked" : ""} onchange="toggleAllApplyForLessonInLesson('${lesson.id}','pos',this.checked)"> ➕ مثبت‌ها</label>
        <label><input type="checkbox" ${allNeg ? "checked" : ""} onchange="toggleAllApplyForLessonInLesson('${lesson.id}','neg',this.checked)"> ➖ منفی‌ها</label>
        <label><input type="checkbox" ${allHw ? "checked" : ""} onchange="toggleAllApplyForLessonInLesson('${lesson.id}','hw',this.checked)"> 📝 تکالیف</label>
        <label><input type="checkbox" ${allPresent ? "checked" : ""} onchange="toggleAllApplyForLessonInLesson('${lesson.id}','present',this.checked)"> ✅ حضور</label>
        <label><input type="checkbox" ${allLate ? "checked" : ""} onchange="toggleAllApplyForLessonInLesson('${lesson.id}','late',this.checked)"> ⏰ تأخیر</label>
      </div>
    </div>
    <div style="overflow-x:auto"><table class="karnameh-table"><thead><tr>
      <th rowspan="2">دانش‌آموز</th>`;

        lesson.poudmans.forEach((p) => {
          p.units.forEach((u) => {
            h += `<th colspan="3" style="text-align:center;border-right:2px solid #e2e8f0">${esc(p.name)} / ${esc(u.name)}</th>`;
          });
        });
        h += `<th rowspan="2" style="background:#eef2ff;color:#4338ca">نهایی درس</th></tr><tr>`;

        lesson.poudmans.forEach((p) => {
          p.units.forEach((u) => {
            h += `<th style="font-size:.75em;text-align:center">مستمر</th><th style="font-size:.75em;text-align:center">پایانی</th><th style="font-size:.75em;text-align:center;background:#f0fdf4;color:#166534">واحد</th>`;
          });
        });
        h += `</tr></thead><tbody>`;

        const sortedStudents = getSortedStudents(c);
        sortedStudents.forEach((st, i) => {
          const stats = calcStudentLesson(c, lesson, st.id);
          h += `<tr><td>${esc(st.name)}</td>`;
          lesson.poudmans.forEach((p) => {
            p.units.forEach((u) => {
              const d = stats.details[p.id][u.id];
              h += `<td style="text-align:center">${d.m !== null ? d.m : "—"}</td>`;
              h += `<td style="text-align:center">${d.p !== null ? d.p : "—"}</td>`;
              h += `<td style="text-align:center;background:#f0fdf4;font-weight:600;color:#166534">${d.final !== null ? d.final.toFixed(2) : "—"}</td>`;
            });
          });
          h += `<td style="background:#eef2ff;font-weight:700;color:#4338ca;text-align:center">${stats.final !== null ? stats.final.toFixed(2) : "—"}</td></tr>`;
        });
        h += `</tbody></table></div></div>`;

        h += `<div class="card"><h3>⚙️ تنظیمات اعمال هر واحد</h3>
    <p class="muted" style="font-size:.85em">برای هر واحد جداگانه مشخص کنید چه چیزی در نمره نهایی آن واحد تأثیر داشته باشد.</p>
    <div style="overflow-x:auto"><table class="karnameh-table"><thead><tr>
      <th>پودمان</th><th>واحد</th><th>➕ مثبت</th><th>➖ منفی</th><th>📝 تکلیف</th><th>✅ حضور</th><th>⏰ تأخیر</th>
    </tr></thead><tbody>`;
        lesson.poudmans.forEach((p) => {
          p.units.forEach((u, ui) => {
            const ao = u.applyOptions || {};
            h += `<tr>`;
            if (ui === 0)
              h += `<td rowspan="${p.units.length}">${esc(p.name)}</td>`;
            h += `<td>${esc(u.name)}</td>
        <td><input type="checkbox" ${ao.pos ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','pos',this.checked)"></td>
        <td><input type="checkbox" ${ao.neg ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','neg',this.checked)"></td>
        <td><input type="checkbox" ${ao.hw ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','hw',this.checked)"></td>
        <td><input type="checkbox" ${ao.present ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','present',this.checked)"></td>
        <td><input type="checkbox" ${ao.late ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','late',this.checked)"></td></tr>`;
          });
        });
        h += `</tbody></table></div></div>`;
        return h;
      }

      async function toggleAllApplyForLessonInLesson(lessonId, key, checked) {
        const c = getClassObj(state.schoolId, state.classId);
        if (!c) return;
        const lesson = getLessonObj(c, lessonId);
        if (!lesson) return;
        lesson.poudmans.forEach((p) =>
          p.units.forEach((u) => {
            if (!u.applyOptions) u.applyOptions = {};
            u.applyOptions[key] = checked;
          }),
        );
        await saveDB({ classId: c.id });

        const area = document.getElementById("lessonGradesArea");
        if (area) {
          const c2 = getClassObj(state.schoolId, state.classId);
          const l2 = getLessonObj(c2, lessonId);
          if (c2 && l2) area.innerHTML = buildLessonGradesHtml(c2, l2);
        }
      }

