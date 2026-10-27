function renderLesson() {
  const c = getClassObj(state.schoolId, state.classId);
  if (!c) {
    state.view = "class";
    return renderClass();
  }
  const lesson = getLessonObj(c, state.lessonId);
  if (!lesson) {
    state.view = "class";
    return renderClass();
  }
  if (!["sessions", "grades"].includes(state.tab)) state.tab = "sessions";
  const school = getSchool(state.schoolId);
  let h = headerHtml();
  h += breadcrumbHtml([
    { label: "مدرسه‌ها", action: "ui-lesson:0" },
    { label: school.name, action: "ui-lesson:1", schoolId: school.id },
    { label: c.name, action: "ui-lesson:2" },
    { label: lesson.name },
  ]);
  h += `<div class="tabs">
    <button class="${state.tab === "sessions" ? "active" : ""}" data-legacy-click="ui-lesson:4">📅 جلسات و حضور‌وغیاب</button>
    <button class="${state.tab === "grades" ? "active" : ""}" data-legacy-click="ui-lesson:5">📝 نمرات</button>
  </div>`;
  if (state.tab === "sessions") h += renderLessonSessions(c, lesson);
  else h += `<div id="lessonGradesArea"></div>`;
  return h;
}

function legacy_renderLessonStudents(c, lesson) {
  if (lesson.gradeMode === "kardanesh")
    return buildKardaneshSummaryHtml(c, lesson);
  let h = `<div class="card"><h3>👥 دانش‌آموزان این درس</h3>
    <p class="muted" style="font-size:.85em">آمار عملکرد دانش‌آموزان در هر درس به تفکیک پودمان و واحد.</p>
  </div><div class="card" style="overflow-x:auto">`;
  if (!c.students.length) h += `<div class="empty">دانش‌آموزی نیست</div>`;
  else {
    const sortedStudents = getSortedStudents(c);
    h += `<table class="karnameh-table"><thead><tr>
      <th rowspan="2">#</th><th rowspan="2">نام</th>`;
    lesson.poudmans.forEach((p) => {
      p.units.forEach((u) => {
        h += `<th colspan="5" style="text-align:center;border-right:2px solid #cbd5e1">${esc(p.name)} / ${esc(u.name)}</th>`;
      });
    });
    h += `<th colspan="2" style="background:#eef2ff;color:#4338ca;text-align:center">کل درس</th></tr><tr>`;
    lesson.poudmans.forEach((p) => {
      p.units.forEach((u) => {
        h += `<th style="font-size:.75em;color:#059669">➕ مثبت</th><th style="font-size:.75em;color:#dc2626">➖ منفی</th><th style="font-size:.75em">📝 تکلیف</th><th style="font-size:.75em;color:#059669">✅ حاضر</th><th style="font-size:.75em;color:#d97706">⏰ تأخیر</th>`;
      });
    });
    h += `<th style="font-size:.75em;color:#059669;background:#eef2ff">➕ مثبت</th><th style="font-size:.75em;color:#dc2626;background:#eef2ff">➖ منفی</th>`;
    h += `</tr></thead><tbody>`;

    sortedStudents.forEach((s, i) => {
      const stats = calcStudentLesson(c, lesson, s.id);
      h += `<tr><td>${i + 1}</td><td>${esc(s.name)}</td>`;
      lesson.poudmans.forEach((p) => {
        p.units.forEach((u) => {
          const d = stats.details[p.id][u.id];
          h += `<td style="color:#059669;text-align:center">${d.pos || 0}</td><td style="color:#dc2626;text-align:center">${d.neg || 0}</td><td style="text-align:center">${d.hw || 0}</td><td style="color:#059669;text-align:center">${d.att.present || 0}</td><td style="color:#d97706;text-align:center">${d.att.late || 0}</td>`;
        });
      });
      h += `<td style="color:#059669;text-align:center;background:#eef2ff;font-weight:bold">${stats.posCount}</td><td style="color:#dc2626;text-align:center;background:#eef2ff;font-weight:bold">${stats.negCount}</td>`;
      h += `</tr>`;
    });
    h += `</tbody></table>`;
  }
  h += `</div>`;
  return h;
}

function renderLessonSessions(c, lesson) {
  const sessions = db.sessions
    .filter((s) => s.classId === c.id && s.lessonId === lesson.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.period - a.period);
  const lessonId = esc(lesson.id),
    classId = esc(c.id);
  let h =
    `<section class="card session-create"><h3>شروع جلسه</h3><form class="session-create-form" data-legacy-submit="ui-lesson:6" data-legacy-submit-arg0="${esc(lessonId)}">` +
    '<label>تاریخ جلسه<input type="date" name="date" required value="' +
    todayISO() +
    '"></label>' +
    '<label>شماره زنگ<input type="number" name="period" min="1" max="12" required value="1" inputmode="numeric"></label>' +
    '<button type="submit">شروع / ادامه جلسه</button></form></section>';
  h +=
    '<section class="card session-directory"><header class="session-list-heading"><div><h3>جلسات درس <span class="lesson-count">' +
    sessions.length.toLocaleString("fa-IR") +
    "</span></h3><p>جدیدترین جلسه‌ها؛ برای ثبت حضور و فعالیت، وارد جلسه شوید.</p></div>";
  if (sessions.length)
    h += `<details class="session-list-actions"><summary>گزینه‌ها</summary><div><button class="danger" data-legacy-click="ui-lesson:7" data-legacy-click-arg0="${esc(classId)}" data-legacy-click-arg1="${esc(lessonId)}">حذف همه جلسات</button></div></details>`;
  h += '</header><div class="session-list">';
  if (!sessions.length)
    h +=
      '<div class="empty"><strong>اولین جلسه را شروع کنید</strong><p>تاریخ و زنگ را در فرم بالا انتخاب کنید؛ سپس حضور و فعالیت کلاس را ثبت کنید.</p></div>';
  for (const session of sessions) {
    const counts = { present: 0, absent: 0, late: 0 };
    for (const value of Object.values(session.attendance || {})) {
      if (value === "present" || value === "absent") counts[value]++;
      else if (typeof value === "string" && value.startsWith("late"))
        counts.late++;
    }
    const pod = lesson.poudmans.find((p) => p.id === session.poudmanId);
    const unit = pod?.units.find((u) => u.id === session.unitId);
    const id = esc(session.id),
      title =
        faDate(session.date) +
        " · زنگ " +
        (session.period + 1).toLocaleString("fa-IR");
    h +=
      `<article class="session-card${session.date === todayISO() ? " is-today" : ""}"><button type="button" class="session-open" data-legacy-click="ui-lesson:8" data-legacy-click-arg0="${esc(id)}" aria-label="ورود به جلسه ` +
      esc(title) +
      '"><span class="session-identity"><span class="session-calendar" aria-hidden="true">' +
      EduIcons.html("calendar") +
      '</span><span class="session-date"><strong>' +
      esc(faDate(session.date)) +
      '</strong><span class="session-period">زنگ ' +
      (session.period + 1).toLocaleString("fa-IR") +
      '</span></span>' +
      (session.date === todayISO() ? '<span class="session-today">امروز</span>' : "") +
      "</span>";
    if (pod || unit)
      h +=
        '<span class="session-unit">' +
        esc([pod?.name, unit?.name].filter(Boolean).join(" / ")) +
        "</span>";
    h +=
      `<span class="session-counts"><span class="session-present"><b>${counts.present.toLocaleString("fa-IR")}</b> حاضر</span><span class="session-absent"><b>${counts.absent.toLocaleString("fa-IR")}</b> غایب</span><span class="session-late"><b>${counts.late.toLocaleString("fa-IR")}</b> تأخیر</span><span class="session-activities"><b>${session.scores.length.toLocaleString("fa-IR")}</b> فعالیت</span></span><span class="session-enter-label">ورود به جلسه <span aria-hidden="true">${EduIcons.html("arrow")}</span></span></button><button type="button" class="session-delete" data-legacy-click="ui-lesson:9" data-legacy-click-arg4="${esc(id)}" aria-label="حذف جلسه ` +
      esc(title) +
      '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button></article>';
  }
  return h + "</div></section>";
}
