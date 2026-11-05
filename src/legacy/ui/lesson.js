// Opt-in date policy for session fields only; reports and week origins stay free.
function sessionCalendarDateAllowed(input, date) {
  if (!EduAcademicYear.contains(db.settings.academicYear, date)) return false;
  let target,
    period = null,
    day = null;
  const mode = input.dataset.sessionCalendar;
  if (mode === "lesson") {
    const form = input.closest(".session-create-form");
    if (!form) return false;
    target = {
      schoolId: form.dataset.sessionSchool,
      classId: form.dataset.sessionClass,
      lessonId: form.dataset.sessionLesson,
      date,
    };
  } else if (mode === "edit") {
    const session = getSessionById(input.dataset.sessionId);
    if (!session || input.dataset.sessionId !== currentSessionId) return false;
    if (date === session.date) return true;
    target = { ...session, date };
  } else if (mode === "master") {
    const root = input.closest(".session-start-panel");
    if (!root) return false;
    const classId = root.querySelector("#sessNewClass")?.value,
      lessonId = root.querySelector("#sessNewLesson")?.value,
      school = db.schools.find((item) =>
        item.classes.some((cls) => cls.id === classId),
      );
    if (!school || !lessonId) return false;
    target = { schoolId: school.id, classId, lessonId, date };
    period = Number(root.dataset.sessionPeriod);
    day = Number(root.dataset.sessionDay);
    if (getDayIdxFromDate(date) !== day) return false;
  } else return false;
  const periods = EduSessionSlots.matchingPeriods(db, target);
  if (period === null ? periods.length > 0 : periods.includes(period))
    return true;
  // Continuing a stored session must remain possible after its schedule changes.
  return (
    mode !== "edit" &&
    db.sessions.some(
      (session) =>
        session.schoolId === target.schoolId &&
        session.classId === target.classId &&
        session.lessonId === target.lessonId &&
        session.date === date &&
        (period === null || session.period === period),
    )
  );
}

function sessionScheduleSelection(target, selected = "", existing = []) {
  const allowed = EduSessionSlots.matchingPeriods(db, target);
  const periods = new Set(allowed);
  for (const session of existing)
    if (
      session.schoolId === target.schoolId &&
      session.classId === target.classId &&
      session.lessonId === target.lessonId &&
      session.date === target.date
    )
      periods.add(session.period);
  const options = [...periods]
    .sort((a, b) => a - b)
    .map(
      (period) =>
        '<option value="' +
        (period + 1) +
        '"' +
        (String(period + 1) === String(selected) ? " selected" : "") +
        ">زنگ " +
        (period + 1).toLocaleString("fa-IR") +
        (allowed.includes(period) ? "" : " · ثبت‌شده") +
        "</option>",
    )
    .join("");
  const day = getDayIdxFromDate(target.date);
  const summary = !Number.isInteger(day)
    ? "تاریخ جلسه را انتخاب کنید."
    : allowed.length
      ? DAYS[day] +
        " · زنگ‌های این درس: " +
        allowed.map((p) => (p + 1).toLocaleString("fa-IR")).join("، ")
      : DAYS[day] + " · این درس در این روز و هفته، زنگی در برنامه ندارد.";
  return {
    options: options || '<option value="">زنگی تعریف نشده</option>',
    summary,
  };
}

function refreshLessonSessionSchedule(form) {
  if (!form?.isConnected) return;
  const target = {
    schoolId: form.dataset.sessionSchool,
    classId: form.dataset.sessionClass,
    lessonId: form.dataset.sessionLesson,
    date: form.elements.date.value,
  };
  const selection = sessionScheduleSelection(
    target,
    form.elements.period.value,
    db.sessions,
  );
  form.elements.period.innerHTML = selection.options;
  form
    .closest(".session-create")
    .querySelector("[data-session-schedule-status]").textContent =
    selection.summary;
}

function refreshSessionDateSchedule() {
  const session = getSessionById(currentSessionId);
  const date = document.getElementById("sessDate");
  const period = document.getElementById("sessPeriod");
  if (!session || !date || !period) return;
  const selection = sessionScheduleSelection(
    { ...session, date: date.value },
    period.value,
    [session],
  );
  period.innerHTML = selection.options;
  document.getElementById("sessScheduleStatus").textContent = selection.summary;
}
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
  h += classroomTabsHtml(
    "بخش‌های درس",
    [
      {
        tab: "sessions",
        action: "ui-lesson:4",
        icon: "attendance",
        title: "جلسات",
        detail: "و حضور و غیاب",
      },
      { tab: "grades", action: "ui-lesson:5", icon: "grades", title: "نمرات" },
    ],
    true,
  );
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
        h += `<th colspan="5" style="text-align:center;border-right:2px solid var(--theme-line, #e4e4e7)">${esc(p.name)} / ${esc(u.name)}</th>`;
      });
    });
    h += `<th colspan="2" style="background:var(--theme-primary-soft, #fef0f0);color:var(--theme-primary-hover, #921019);text-align:center">کل درس</th></tr><tr>`;
    lesson.poudmans.forEach((p) => {
      p.units.forEach((u) => {
        h += `<th style="font-size:.75em;color:var(--status-success, #16664e)">➕ مثبت</th><th style="font-size:.75em;color:var(--status-danger, #9f2635)">➖ منفی</th><th style="font-size:.75em">📝 تکلیف</th><th style="font-size:.75em;color:var(--status-success, #16664e)">✅ حاضر</th><th style="font-size:.75em;color:var(--status-warning, #7c5105)">⏰ تأخیر</th>`;
      });
    });
    h += `<th style="font-size:.75em;color:var(--status-success, #16664e);background:var(--theme-primary-soft, #fef0f0)">➕ مثبت</th><th style="font-size:.75em;color:var(--status-danger, #9f2635);background:var(--theme-primary-soft, #fef0f0)">➖ منفی</th>`;
    h += `</tr></thead><tbody>`;

    sortedStudents.forEach((s, i) => {
      const stats = calcStudentLesson(c, lesson, s.id);
      h += `<tr><td>${i + 1}</td><td>${esc(s.name)}</td>`;
      lesson.poudmans.forEach((p) => {
        p.units.forEach((u) => {
          const d = stats.details[p.id][u.id];
          h += `<td style="color:var(--status-success, #16664e);text-align:center">${d.pos || 0}</td><td style="color:var(--status-danger, #9f2635);text-align:center">${d.neg || 0}</td><td style="text-align:center">${d.hw || 0}</td><td style="color:var(--status-success, #16664e);text-align:center">${d.att.present || 0}</td><td style="color:var(--status-warning, #7c5105);text-align:center">${d.att.late || 0}</td>`;
        });
      });
      h += `<td style="color:var(--status-success, #16664e);text-align:center;background:var(--theme-primary-soft, #fef0f0);font-weight:bold">${stats.posCount}</td><td style="color:var(--status-danger, #9f2635);text-align:center;background:var(--theme-primary-soft, #fef0f0);font-weight:bold">${stats.negCount}</td>`;
      h += `</tr>`;
    });
    h += `</tbody></table>`;
  }
  h += `</div>`;
  return h;
}

function renderLessonSessions(
  c,
  lesson,
  { sourceSessions = db.sessions, annual = false } = {},
) {
  const sessions = sourceSessions
    .filter((s) => s.classId === c.id && s.lessonId === lesson.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.period - a.period);
  const lessonId = esc(lesson.id),
    classId = esc(c.id),
    schoolId =
      db.schools.find((school) => school.classes.some((cls) => cls.id === c.id))
        ?.id || "",
    date = todayISO(),
    selection = sessionScheduleSelection(
      { schoolId, classId: c.id, lessonId: lesson.id, date },
      "",
      sourceSessions,
    );
  let h =
    `<section class="card session-create"><header class="session-setup-heading"><span class="session-setup-symbol" aria-hidden="true">${EduIcons.html("calendar")}</span><div><h3>شروع جلسه</h3><p>جلسهٔ جدید فقط در روز و زنگِ همین درس در برنامهٔ هفتگی ثبت می‌شود.</p></div></header><form class="session-create-form" novalidate data-session-school="${esc(schoolId)}" data-session-class="${classId}" data-session-lesson="${lessonId}" data-legacy-submit="ui-lesson:6" data-legacy-submit-arg0="${lessonId}">` +
    '<label>تاریخ جلسه<input type="date" name="date" required data-session-calendar="lesson" data-legacy-change="ui-lesson:session-date" value="' +
    date +
    '"></label>' +
    '<label>زنگ طبق برنامه<select name="period" required>' +
    selection.options +
    "</select></label>" +
    '<button type="submit">شروع یا ادامه جلسه</button></form><p class="session-schedule-hint" data-session-schedule-status role="status">' +
    esc(selection.summary) +
    "</p></section>";
  h +=
    '<section class="card session-directory"><header class="session-list-heading directory-heading"><div><h3><span class="session-directory-symbol directory-symbol" aria-hidden="true">' +
    EduIcons.html("calendar") +
    '</span>جلسات درس <span class="lesson-count">' +
    sessions.length.toLocaleString("fa-IR") +
    "</span></h3><p>" +
    (annual
      ? "همهٔ جلسات این درس در سال تحصیلی؛ مرتب از جدید به قدیم."
      : "جدیدترین جلسه‌ها؛ برای ثبت حضور و فعالیت، وارد جلسه شوید.") +
    "</p></div>";
  if (sessions.length && !annual)
    h += `<details class="session-list-actions"><summary>گزینه‌ها</summary><div><button class="danger" data-legacy-click="ui-lesson:7" data-legacy-click-arg0="${esc(classId)}" data-legacy-click-arg1="${esc(lessonId)}">حذف همه جلسات</button></div></details>`;
  h += '</header><div class="session-list">';
  if (!sessions.length)
    h +=
      '<div class="empty"><strong>اولین جلسه را شروع کنید</strong><p>تاریخ و زنگ را در فرم بالا انتخاب کنید؛ سپس حضور و فعالیت کلاس را ثبت کنید.</p></div>';
  for (const session of sessions) {
    const counts = { present: 0, absent: 0, late: 0, leave: 0 };
    for (const value of Object.values(session.attendance || {})) {
      if (value === "present" || value === "absent" || value === "leave")
        counts[value]++;
      else if (typeof value === "string" && value.startsWith("late"))
        counts.late++;
    }
    const pod = lesson.poudmans.find((p) => p.id === session.poudmanId);
    const unit = pod?.units.find((u) => u.id === session.unitId);
    const foreign =
      !!session.sourcePeriodId &&
      session.sourcePeriodId !== window.EduV24?.getReportContext().id;
    const id = esc(session.sourceSessionId || session.id),
      title =
        faDate(session.date) +
        " · زنگ " +
        (session.period + 1).toLocaleString("fa-IR");
    h +=
      `<article class="session-card${session.date === todayISO() ? " is-today" : ""}"><button type="button" class="session-open" ${foreign ? `data-workspace-action="year-session" data-workspace="${esc(session.sourcePeriodId)}" data-key="${esc(id)}"` : `data-legacy-click="ui-lesson:8" data-legacy-click-arg0="${esc(id)}"`} aria-label="ورود به جلسه ` +
      esc(title) +
      '"><span class="session-identity"><span class="session-calendar" aria-hidden="true">' +
      EduIcons.html("calendar") +
      '</span><span class="session-date"><strong>' +
      esc(faDate(session.date)) +
      '</strong><span class="session-date-meta"><span class="session-period">زنگ ' +
      (session.period + 1).toLocaleString("fa-IR") +
      "</span>" +
      (session.date === todayISO()
        ? '<span class="session-today">امروز</span>'
        : "") +
      "</span></span></span>";
    if (pod || unit)
      h +=
        '<span class="session-unit">' +
        esc([pod?.name, unit?.name].filter(Boolean).join(" / ")) +
        "</span>";
    h += `<span class="session-counts"><span class="session-present"><b>${counts.present.toLocaleString("fa-IR")}</b> حاضر</span><span class="session-absent"><b>${counts.absent.toLocaleString("fa-IR")}</b> غایب</span><span class="session-late"><b>${counts.late.toLocaleString("fa-IR")}</b> تأخیر</span><span class="session-leave"><b>${counts.leave.toLocaleString("fa-IR")}</b> مرخصی</span><span class="session-activities"><b>${session.scores.length.toLocaleString("fa-IR")}</b> فعالیت</span></span><span class="session-enter-label">ورود به جلسه <span aria-hidden="true">${EduIcons.html("arrow")}</span></span></button>`;
    if (!foreign)
      h +=
        '<button type="button" class="session-delete" data-legacy-click="ui-lesson:9" data-legacy-click-arg4="' +
        esc(id) +
        '" aria-label="حذف جلسه ' +
        esc(title) +
        '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button>';
    h += "</article>";
  }
  return h + "</div></section>";
}
