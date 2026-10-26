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
      <button class="success" data-legacy-click="grading-lesson-editor:0" data-legacy-click-arg1="${esc(lesson.id)}">📝 ثبت گروهی همه نمرات</button>
    </div>
    <p class="muted" style="font-size:.85em">نمره واحد = میانگین وزنی مستمر و پایانی با امتیازات انتخاب‌شده (صفر تا ۲۰). آخرین نمره تاریخ‌دار ملاک است؛ ثبت گروهی اولویت دارد. نهایی درس پس از تکمیل همه واحدها صادر می‌شود.</p>
    <div class="filter-units-box no-print">
      <div style="font-weight:700;color:#3730a3;font-size:.9em">⚙️ اعمال در نمره هر واحد (اعمال روی همه واحدها):</div>
      <div class="chips">
        <label><input type="checkbox" ${allPos ? "checked" : ""} data-legacy-change="grading-lesson-editor:1" data-legacy-change-arg3="${esc(lesson.id)}"> ➕ مثبت‌ها</label>
        <label><input type="checkbox" ${allNeg ? "checked" : ""} data-legacy-change="grading-lesson-editor:2" data-legacy-change-arg5="${esc(lesson.id)}"> ➖ منفی‌ها</label>
        <label><input type="checkbox" ${allHw ? "checked" : ""} data-legacy-change="grading-lesson-editor:3" data-legacy-change-arg7="${esc(lesson.id)}"> 📝 تکالیف</label>
        <label><input type="checkbox" ${allPresent ? "checked" : ""} data-legacy-change="grading-lesson-editor:4" data-legacy-change-arg9="${esc(lesson.id)}"> ✅ حضور</label>
        <label><input type="checkbox" ${allLate ? "checked" : ""} data-legacy-change="grading-lesson-editor:5" data-legacy-change-arg11="${esc(lesson.id)}"> ⏰ تأخیر</label>
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
      if (ui === 0) h += `<td rowspan="${p.units.length}">${esc(p.name)}</td>`;
      h += `<td>${esc(u.name)}</td>
        <td><input type="checkbox" ${ao.pos ? "checked" : ""} data-legacy-change="grading-lesson-editor:6" data-legacy-change-arg2="${esc(lesson.id)}" data-legacy-change-arg3="${esc(p.id)}" data-legacy-change-arg4="${esc(u.id)}"></td>
        <td><input type="checkbox" ${ao.neg ? "checked" : ""} data-legacy-change="grading-lesson-editor:7" data-legacy-change-arg6="${esc(lesson.id)}" data-legacy-change-arg7="${esc(p.id)}" data-legacy-change-arg8="${esc(u.id)}"></td>
        <td><input type="checkbox" ${ao.hw ? "checked" : ""} data-legacy-change="grading-lesson-editor:8" data-legacy-change-arg10="${esc(lesson.id)}" data-legacy-change-arg11="${esc(p.id)}" data-legacy-change-arg12="${esc(u.id)}"></td>
        <td><input type="checkbox" ${ao.present ? "checked" : ""} data-legacy-change="grading-lesson-editor:9" data-legacy-change-arg14="${esc(lesson.id)}" data-legacy-change-arg15="${esc(p.id)}" data-legacy-change-arg16="${esc(u.id)}"></td>
        <td><input type="checkbox" ${ao.late ? "checked" : ""} data-legacy-change="grading-lesson-editor:10" data-legacy-change-arg18="${esc(lesson.id)}" data-legacy-change-arg19="${esc(p.id)}" data-legacy-change-arg20="${esc(u.id)}"></td></tr>`;
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
