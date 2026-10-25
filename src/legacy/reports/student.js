      function renderKarnamehTabHtml() {
        const allClasses = [];
        db.schools.forEach((s) =>
          s.classes.forEach((c) => allClasses.push({ school: s, class: c })),
        );
        let h = `<div class="card">
    <h3>📋 کارنامه</h3>
    <div class="row">
      <select onchange="updateKarnamehFilter('schoolId', this.value)">
        <option value="">انتخاب مدرسه</option>
        ${db.schools.map((s) => `<option value="${s.id}" ${karnamehFilter.schoolId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
      </select>
      <select onchange="updateKarnamehFilter('classId', this.value)">
        <option value="">انتخاب کلاس</option>
        ${allClasses
          .filter(
            (x) =>
              !karnamehFilter.schoolId ||
              x.school.id === karnamehFilter.schoolId,
          )
          .map(
            (x) =>
              `<option value="${x.class.id}" ${karnamehFilter.classId === x.class.id ? "selected" : ""}>${esc(x.school.name)} / ${esc(x.class.name)}</option>`,
          )
          .join("")}
      </select>
      <select onchange="updateKarnamehFilter('studentId', this.value)">
        <option value="">همه دانش‌آموزان (نمای کلی)</option>
        ${allClasses
          .filter(
            (x) =>
              (!karnamehFilter.schoolId ||
                x.school.id === karnamehFilter.schoolId) &&
              (!karnamehFilter.classId ||
                x.class.id === karnamehFilter.classId),
          )
          .map((x) =>
            getSortedStudents({
              students: [
                ...x.class.students,
                ...(x.class.archivedStudents || []),
              ],
            })
              .map(
                (st) =>
                  `<option value="${st.id}" ${karnamehFilter.studentId === st.id ? "selected" : ""}>${esc(st.name)}</option>`,
              )
              .join(""),
          )
          .join("")}
      </select>
    </div>
  </div>
  <div id="karnamehTabOutput"></div>`;
        return h;
      }
      function updateKarnamehFilter(key, val) {
        karnamehFilter[key] = val;
        if (key === "schoolId") {
          karnamehFilter.classId = "";
          karnamehFilter.studentId = "";
        }
        if (key === "classId") {
          karnamehFilter.studentId = "";
        }
        render();
      }
      function renderKarnamehTabReports() {
        const out = document.getElementById("karnamehTabOutput");
        if (!out) return;
        if (!karnamehFilter.classId) {
          out.innerHTML = `<div class="card"><div class="empty">لطفاً یک کلاس انتخاب کنید.</div></div>`;
          return;
        }
        const cls = findClassById(karnamehFilter.classId);
        if (!cls) {
          out.innerHTML = `<div class="card"><div class="empty">کلاس یافت نشد.</div></div>`;
          return;
        }
        const c = cls.classObj;
        if (karnamehFilter.studentId)
          out.innerHTML = buildDetailedKarnamehHtml(
            c,
            karnamehFilter.studentId,
          );
        else out.innerHTML = buildOverviewKarnamehHtml(c);
      }

      function buildOverviewKarnamehHtml(c) {
        const lessons = c.lessons || [];
        let h = `<div class="card"><h3>📋 نمای کلی کارنامه کلاس ${esc(c.name)}</h3>
    <div class="row no-print" style="justify-content:flex-end;margin-bottom:14px">
      <button onclick="EduV24.printReport(this)">🖨️ چاپ / PDF</button>
    </div>`;
        if (!lessons.length) {
          h += `<div class="empty">درسی تعریف نشده</div></div>`;
          return h;
        }
        h += `<div style="overflow-x:auto"><table class="karnameh-table"><thead><tr>
    <th>#</th><th>دانش‌آموز</th>`;
        lessons.forEach((l) => {
          h += `<th>${esc(l.name)}</th>`;
        });
        h += `<th style="background:#eef2ff;color:#4338ca">میانگین کل</th></tr></thead><tbody>`;
        const sortedStudents = getSortedStudents(c);
        sortedStudents.forEach((st, i) => {
          let sum = 0,
            count = 0;
          h += `<tr><td>${i + 1}</td><td>${esc(st.name)}</td>`;
          lessons.forEach((l) => {
            const s = calcStudentLesson(c, l, st.id);
            h += `<td>${s.final !== null ? s.final.toFixed(2) : "—"}</td>`;
            if (s.final !== null) {
              sum += s.final;
              count++;
            }
          });
          const avg = count > 0 ? (sum / count).toFixed(2) : "—";
          h += `<td style="background:#eef2ff;font-weight:700;color:#4338ca">${avg}</td></tr>`;
        });
        h += `</tbody></table></div></div>`;
        return h;
      }

      function buildDetailedKarnamehHtml(c, stId) {
        const student = getStudentObj(c, stId);
        if (!student)
          return `<div class="card"><div class="empty">دانش‌آموز یافت نشد</div></div>`;
        const lessons = c.lessons || [];
        let h = `<div class="card"><h3>📋 کارنامه تفصیلی — ${esc(student.name)}</h3>
    <div class="row no-print" style="justify-content:flex-end;margin-bottom:14px">
      <button onclick="EduV24.printReport(this)">🖨️ چاپ / PDF</button>
    </div>`;
        if (!lessons.length) {
          h += `<div class="empty">درسی تعریف نشده</div></div>`;
          return h;
        }

        h += `<h4>خلاصه کلی دروس</h4>
    <div style="overflow-x:auto"><table class="karnameh-table"><thead><tr>
      <th>درس</th><th>دبیر</th><th>مستمر / تئوری</th><th>پایانی / عملی</th><th>نهایی</th>
      <th>➕</th><th>➖</th><th>📝</th><th>حاضر</th><th>غایب</th><th>میانگین کل</th>
    </tr></thead><tbody>`;
        const stats = {};
        let sumFinal = 0,
          countFinal = 0;
        lessons.forEach((l) => {
          stats[l.id] = calcStudentLesson(c, l, stId);
          const s = stats[l.id];
          if (s.final !== null) {
            sumFinal += s.final;
            countFinal++;
          }
          h += `<tr><td>${esc(l.name)}</td><td>${esc(l.teacher || "—")}</td>
      <td>${s.avgM !== null ? s.avgM.toFixed(2) : "—"}</td>
      <td>${s.avgP !== null ? s.avgP.toFixed(2) : "—"}</td>
      <td><b>${s.final !== null ? s.final.toFixed(2) : "—"}</b></td>
      <td style="color:#059669">${s.posCount}</td><td style="color:#dc2626">${s.negCount}</td><td>${s.hwCount}</td>
      <td>${s.att.present}</td><td>${s.att.absent}</td>
      <td style="background:#eef2ff;font-weight:700;color:#4338ca">${s.final !== null ? s.final.toFixed(2) : "—"}</td></tr>`;
        });
        const overallAvg =
          countFinal > 0 ? (sumFinal / countFinal).toFixed(2) : "—";
        h += `</tbody></table></div>`;
        h += `<p style="text-align:left;font-size:1em;margin-top:8px;background:#eef2ff;padding:10px;border-radius:8px">
    <b style="color:#4338ca">📊 میانگین کل نمرات این دانش‌آموز: ${overallAvg}</b></p>`;

        lessons.forEach((l) => {
          const s = stats[l.id];
          if (l.gradeMode === "kardanesh") {
            h += buildKardaneshSummaryHtml(c, l, stId);
            return;
          }
          h += `<h4 style="margin-top:24px">📚 ${esc(l.name)}</h4>
      <p class="muted" style="font-size:.85em">نمره واحد = میانگین وزنی مستمر و پایانی به همراه امتیازات انتخاب‌شده. نهایی درس نیازمند تکمیل همه واحدهاست.</p>
      <div class="filter-units-box no-print">
        <div style="font-weight:700;color:#3730a3;font-size:.9em">⚙️ اعمال در نمره هر واحد (با کلیک روی هر واحد به‌صورت خودکار ذخیره می‌شود):</div>
        <div class="chips">
          <label><input type="checkbox" onchange="toggleAllApplyForLesson('${l.id}','pos',this.checked)"> ➕ مثبت‌ها</label>
          <label><input type="checkbox" onchange="toggleAllApplyForLesson('${l.id}','neg',this.checked)"> ➖ منفی‌ها</label>
          <label><input type="checkbox" onchange="toggleAllApplyForLesson('${l.id}','hw',this.checked)"> 📝 تکالیف</label>
          <label><input type="checkbox" onchange="toggleAllApplyForLesson('${l.id}','present',this.checked)"> ✅ حضور</label>
          <label><input type="checkbox" onchange="toggleAllApplyForLesson('${l.id}','late',this.checked)"> ⏰ تأخیر</label>
        </div>
      </div>
      <div style="overflow-x:auto"><table class="karnameh-table"><thead><tr>
        <th>پودمان</th><th>واحد</th><th>مستمر / تئوری</th><th>پایانی / عملی</th>
        <th>➕</th><th>➖</th><th>📝</th><th>حاضر</th><th>غایب</th>
        <th>⚙️ اعمال</th><th>نمره واحد</th>
      </tr></thead><tbody>`;
          l.poudmans.forEach((p) => {
            p.units.forEach((u, ui) => {
              const d = s.details[p.id]?.[u.id] || {
                m: null,
                p: null,
                pos: 0,
                neg: 0,
                hw: 0,
                att: { present: 0, absent: 0, late: 0 },
                final: null,
              };
              const ao = u.applyOptions || {};
              h += `<tr>`;
              if (ui === 0)
                h += `<td rowspan="${p.units.length}">${esc(p.name)}</td>`;
              h += `<td>${esc(u.name)}</td>
          <td>${d.m !== null ? d.m : "—"}</td><td>${d.p !== null ? d.p : "—"}</td>
          <td style="color:#059669">${d.pos || 0}</td><td style="color:#dc2626">${d.neg || 0}</td><td>${d.hw || 0}</td>
          <td>${d.att ? d.att.present : 0}</td><td>${d.att ? d.att.absent : 0}</td>
          <td class="no-print"><div style="display:flex;gap:4px;flex-wrap:wrap">
            <label title="مثبت" style="cursor:pointer"><input type="checkbox" ${ao.pos ? "checked" : ""} onchange="toggleUnitApply('${l.id}','${p.id}','${u.id}','pos',this.checked)"></label>
            <label title="منفی" style="cursor:pointer"><input type="checkbox" ${ao.neg ? "checked" : ""} onchange="toggleUnitApply('${l.id}','${p.id}','${u.id}','neg',this.checked)"></label>
            <label title="تکلیف" style="cursor:pointer"><input type="checkbox" ${ao.hw ? "checked" : ""} onchange="toggleUnitApply('${l.id}','${p.id}','${u.id}','hw',this.checked)"></label>
            <label title="حضور" style="cursor:pointer"><input type="checkbox" ${ao.present ? "checked" : ""} onchange="toggleUnitApply('${l.id}','${p.id}','${u.id}','present',this.checked)"></label>
            <label title="تأخیر" style="cursor:pointer"><input type="checkbox" ${ao.late ? "checked" : ""} onchange="toggleUnitApply('${l.id}','${p.id}','${u.id}','late',this.checked)"></label>
          </div></td>
          <td style="background:#f0fdf4;font-weight:600;color:#166534">${d.final !== null ? d.final.toFixed(2) : "—"}</td></tr>`;
            });
          });
          h += `</tbody></table></div>
      <p style="text-align:left;font-size:.9em;background:#fef3c7;padding:8px;border-radius:8px;margin-top:6px">
        <b>📊 نمره نهایی این درس: ${s.final !== null ? s.final.toFixed(2) : "—"}</b>
        <span class="muted" style="font-size:.85em"> (میانگین نمرات نهایی واحدها)</span>
      </p>`;
        });
        h += `</div>`;
        return h;
      }

      async function toggleAllApplyForLesson(lessonId, key, checked) {
        const c = findClassById(karnamehFilter.classId);
        if (!c) return;
        const lesson = getLessonObj(c.classObj, lessonId);
        if (!lesson) return;
        lesson.poudmans.forEach((p) =>
          p.units.forEach((u) => {
            if (!u.applyOptions) u.applyOptions = {};
            u.applyOptions[key] = checked;
          }),
        );
        await saveDB({ classId: c.classObj.id });
        renderKarnamehTabReports();
      }

      function generateParentReportText(student, c) {
        let text = `📋 گزارش وضعیت دانش‌آموز\n👤 نام: ${student.name} | کلاس: ${c.name}\n`;
        text += `📅 تاریخ گزارش: ${faDate(todayISO())}\n================================\n\n`;
        let hasData = false;
        (c.lessons || []).forEach((lesson) => {
          const stats = calcStudentLesson(c, lesson, student.id);
          if (
            stats.att.present + stats.att.absent + stats.att.late > 0 ||
            stats.posCount + stats.negCount > 0 ||
            stats.final !== null
          ) {
            hasData = true;
            text += `📚 درس: ${lesson.name} (دبیر: ${lesson.teacher || "---"})\n`;
            text += `- حضور: حاضر ${stats.att.present} | غایب ${stats.att.absent} | تأخیر ${stats.att.late}\n`;
            text += `- امتیازات: ➕ ${stats.posCount} | ➖ ${stats.negCount} | 📝 ${stats.hwCount}\n`;
            text += `- نمرات: ${lesson.gradeMode === "kardanesh" ? "تئوری" : "مستمر"} ${stats.avgM !== null ? stats.avgM.toFixed(2) : "---"} | ${lesson.gradeMode === "kardanesh" ? "عملی" : "پایانی"} ${stats.avgP !== null ? stats.avgP.toFixed(2) : "---"}\n`;
            text += `- نمره نهایی: ${stats.final !== null ? stats.final.toFixed(2) : "---"}${lesson.gradeMode === "kardanesh" ? " | " + gradeStatus(stats) : ""}\n--------------------------------\n`;
          }
        });
        if (!hasData)
          text += `هنوز هیچ اطلاعاتی برای این دانش‌آموز ثبت نشده است.\n`;
        text += `\n✅ تولید شده توسط سامانه مدیریت مدرسه`;
        return text;
      }

      // ==================== ثبت گروهی نمرات ====================
