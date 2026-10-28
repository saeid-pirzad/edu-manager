function renderLessonReportTabHtml() {
  const allClasses = [];
  db.schools.forEach((s) =>
    s.classes.forEach((c) => allClasses.push({ school: s, class: c })),
  );
  let h = `<div class="card">
    <h3>📊 گزارش درس</h3>
    <div class="row">
      <select data-legacy-change="reports-lesson:0">
        <option value="">همه مدارس</option>
        ${db.schools.map((s) => `<option value="${s.id}" ${lessonReportFilter.schoolId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
      </select>
      <select data-legacy-change="reports-lesson:1">
        <option value="">همه کلاس‌ها</option>
        ${allClasses
          .filter(
            (x) =>
              !lessonReportFilter.schoolId ||
              x.school.id === lessonReportFilter.schoolId,
          )
          .map(
            (x) =>
              `<option value="${x.class.id}" ${lessonReportFilter.classId === x.class.id ? "selected" : ""}>${esc(x.school.name)} / ${esc(x.class.name)}</option>`,
          )
          .join("")}
      </select>
      <select data-legacy-change="reports-lesson:2">
        <option value="">همه دروس</option>
        ${allClasses
          .filter(
            (x) =>
              (!lessonReportFilter.schoolId ||
                x.school.id === lessonReportFilter.schoolId) &&
              (!lessonReportFilter.classId ||
                x.class.id === lessonReportFilter.classId),
          )
          .map((x) =>
            (x.class.lessons || [])
              .map(
                (l) =>
                  `<option value="${l.id}" ${lessonReportFilter.lessonId === l.id ? "selected" : ""}>${esc(x.class.name)} - ${esc(l.name)}</option>`,
              )
              .join(""),
          )
          .join("")}
      </select>
    </div>
  </div>
  <div id="lessonReportTabOutput"></div>`;
  return h;
}
function updateLessonReportFilter(key, val) {
  lessonReportFilter[key] = val;
  if (key === "schoolId") {
    lessonReportFilter.classId = "";
    lessonReportFilter.lessonId = "";
  }
  if (key === "classId") {
    lessonReportFilter.lessonId = "";
  }
  if (key === "lessonId" && val) {
    const selected = db.schools
      .flatMap((school) => school.classes.map((c) => ({ school, c })))
      .find(
        ({ school, c }) =>
          (!lessonReportFilter.schoolId ||
            school.id === lessonReportFilter.schoolId) &&
          (!lessonReportFilter.classId ||
            c.id === lessonReportFilter.classId) &&
          c.lessons.some((lesson) => lesson.id === val),
      );
    if (selected) {
      lessonReportFilter.schoolId = selected.school.id;
      lessonReportFilter.classId = selected.c.id;
    } else lessonReportFilter.lessonId = "";
  }
  render();
}
function renderLessonReportTab() {
  const out = document.getElementById("lessonReportTabOutput");
  if (!out) return;
  if (!lessonReportFilter.lessonId) {
    out.innerHTML = `<div class="card"><div class="empty">لطفاً یک درس انتخاب کنید.</div></div>`;
    return;
  }
  const cls = findClassById(lessonReportFilter.classId);
  if (!cls) {
    out.innerHTML = `<div class="card"><div class="empty">کلاس یافت نشد.</div></div>`;
    return;
  }
  const lesson = getLessonObj(cls.classObj, lessonReportFilter.lessonId);
  if (!lesson) {
    out.innerHTML = `<div class="card"><div class="empty">درس یافت نشد.</div></div>`;
    return;
  }
  out.innerHTML = buildLessonReportHtml(cls.classObj, lesson);
}

function legacy_buildLessonReportHtml(c, lesson) {
  const sessions = db.sessions
    .filter((x) => x.classId === c.id && x.lessonId === lesson.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  let h = `<div class="card"><h3>📊 گزارش درس ${esc(lesson.name)}${lesson.teacher ? ` — ${esc(lesson.teacher)}` : ""}</h3>
    <div class="row no-print" style="justify-content:flex-end;margin-bottom:14px">
      <button class="success" data-legacy-click="reports-lesson:3" data-legacy-click-arg2="${esc(lesson.id)}">📋 کپی متن برای معاون</button>
      <button data-legacy-click="reports-lesson:4">🖨️ چاپ / PDF</button>
    </div>
    <p class="muted">${sessions.length} جلسه ثبت شده</p>`;
  if (lesson.gradeMode === "kardanesh")
    h += buildKardaneshSummaryHtml(c, lesson);
  if (!sessions.length) h += `<div class="empty">جلسه‌ای ثبت نشده</div>`;
  else
    sessions.forEach((sess) => {
      const present = [],
        absent = [],
        late = [];
      sessionStudents(c, sess).forEach((s) => {
        const st = sess.attendance[s.id];
        if (st === "present") present.push(s.name);
        else if (st === "absent") absent.push(s.name);
        else if (st && st.startsWith("late")) {
          const mins = st.includes(":") ? st.split(":")[1] : "";
          late.push(`${s.name} ${mins ? `(${mins}د)` : ""}`);
        }
      });
      const pos = sess.scores.filter((x) => x.type === "positive");
      const neg = sess.scores.filter((x) => x.type === "negative");
      const hw = sess.scores.filter((x) => x.type === "homework");
      const poudman = lesson.poudmans.find((p) => p.id === sess.poudmanId);
      const unit = poudman
        ? poudman.units.find((u) => u.id === sess.unitId)
        : null;
      h += `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:10px 0">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <strong>${faDate(sess.date)} — زنگ ${sess.period + 1}</strong>
        <span class="muted">${lesson.gradeMode === "kardanesh" ? "کاردانش: تئوری و عملی" : (poudman ? esc(poudman.name) : "—") + " / " + (unit ? esc(unit.name) : "—")}</span>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.9em;margin-bottom:8px">
        <span>✅ حاضر: <b>${present.length}</b></span><span>❌ غایب: <b>${absent.length}</b></span>
        <span>⏰ تأخیر: <b>${late.length}</b></span>
        <span style="color:#059669">➕ مثبت: <b>${pos.length}</b></span>
        <span style="color:#dc2626">➖ منفی: <b>${neg.length}</b></span>
        <span>📝 تکلیف: <b>${hw.length}</b></span>
      </div>
      ${absent.length ? `<div style="font-size:.85em;color:#dc2626">غایبین: ${absent.map(esc).join("، ")}</div>` : ""}
      ${late.length ? `<div style="font-size:.85em;color:#d97706">تأخیر: ${late.map(esc).join("، ")}</div>` : ""}
      ${present.length ? `<div style="font-size:.85em;color:#059669;margin-top:4px">حاضرین: ${present.map(esc).join("، ")}</div>` : ""}
      ${
        pos.length
          ? `<div style="font-size:.85em;color:#059669;margin-top:4px">➕ مثبت: ${pos
              .map((x) => {
                const s = sessionStudent(c, sess, x.studentId);
                return esc(s ? s.name : "") + `(${esc(x.value)})`;
              })
              .join("، ")}</div>`
          : ""
      }
      ${
        neg.length
          ? `<div style="font-size:.85em;color:#dc2626;margin-top:4px">➖ منفی: ${neg
              .map((x) => {
                const s = sessionStudent(c, sess, x.studentId);
                return esc(s ? s.name : "") + `(${esc(x.value)})`;
              })
              .join("، ")}</div>`
          : ""
      }
      ${
        hw.length
          ? `<div style="font-size:.85em;color:#3730a3;margin-top:4px">📝 تکالیف: ${hw
              .map((x) => {
                const s = sessionStudent(c, sess, x.studentId);
                return esc(s ? s.name : "");
              })
              .join("، ")}</div>`
          : ""
      }
    </div>`;
    });
  h += `<h4>خلاصه هر دانش‌آموز</h4>
    <table class="karnameh-table"><thead><tr>
      <th>دانش‌آموز</th><th>حاضر</th><th>غایب</th><th>تأخیر</th>
      <th>➕ مثبت</th><th>➖ منفی</th><th>📝 تکلیف</th><th>مستمر / تئوری</th><th>پایانی / عملی</th><th>نهایی</th>
    </tr></thead><tbody>`;
  const sortedStudents = getSortedStudents(c);
  sortedStudents.forEach((st) => {
    const s = calcStudentLesson(c, lesson, st.id);
    h += `<tr><td>${esc(st.name)}</td>
      <td>${s.att.present}</td><td>${s.att.absent}</td><td>${s.att.late}</td>
      <td style="color:#059669">${s.posCount}</td><td style="color:#dc2626">${s.negCount}</td><td>${s.hwCount}</td>
      <td>${s.avgM !== null ? s.avgM.toFixed(2) : "—"}</td>
      <td>${s.avgP !== null ? s.avgP.toFixed(2) : "—"}</td>
      <td><b>${s.final !== null ? s.final.toFixed(2) : "—"}</b></td></tr>`;
  });
  h += `</tbody></table></div>`;
  return h;
}

function copyLessonReportForVicePrincipal(lessonId) {
  const cls = findClassById(lessonReportFilter.classId);
  if (!cls) return;
  const c = cls.classObj;
  const lesson = getLessonObj(c, lessonId);
  if (!c || !lesson) return;
  const sessions = db.sessions
    .filter((x) => x.classId === c.id && x.lessonId === lesson.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  let text = `📊 گزارش درس: ${lesson.name} (کلاس ${c.name})\n👨‍🏫 دبیر: ${lesson.teacher || "---"}\n================================\n\n`;
  if (!sessions.length) text += `هنوز جلسه‌ای ثبت نشده است.\n`;
  sessions.forEach((sess) => {
    text += generateSessionReportText(sess, c, lesson) + `\n`;
  });
  text += `================================\n📌 خلاصه وضعیت دانش‌آموزان:\n`;
  getSortedStudents(c).forEach((st) => {
    const s = calcStudentLesson(c, lesson, st.id);
    text += `- ${st.name}: غایب ${s.att.absent} | ➕ ${s.posCount} | ➖ ${s.negCount} | نهایی: ${s.final !== null ? s.final.toFixed(2) : "---"}\n`;
  });
  text += `\n✅ تولید شده توسط کلاس‌یار`;
  const dummyBtn = document.createElement("button");
  copyToClipboard(text, dummyBtn);
}

// ==================== زیربخش ۳: کارنامه ====================
