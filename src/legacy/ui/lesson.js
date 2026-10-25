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
        const school = getSchool(state.schoolId);
        let h = headerHtml();
        h += `<div class="breadcrumb">
    <a onclick="goSchools()">مدارس</a> ←
    <a onclick="goSchool('${school.id}')">${esc(school.name)}</a> ←
    <a onclick="backToClass()">${esc(c.name)}</a> ←
    <strong>${esc(lesson.name)}</strong>${lesson.teacher ? ` <span class="muted">(${esc(lesson.teacher)})</span>` : ""}
  </div>`;
        h += `<div class="tabs">
    <button class="${state.tab === "students" ? "active" : ""}" onclick="setTab('students')">👥 دانش‌آموزان</button>
    <button class="${state.tab === "sessions" ? "active" : ""}" onclick="setTab('sessions')">📅 جلسات</button>
    <button class="${state.tab === "grades" ? "active" : ""}" onclick="setTab('grades')">📝 نمرات</button>
  </div>`;
        if (state.tab === "students") h += renderLessonStudents(c, lesson);
        else if (state.tab === "sessions") h += renderLessonSessions(c, lesson);
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
          '<section class="card session-create"><h3>شروع جلسه</h3><form class="session-create-form" onsubmit="addManualSession(event,\'' +
          lessonId +
          "')\">" +
          '<label>تاریخ جلسه<input type="date" name="date" required value="' +
          todayISO() +
          '"></label>' +
          '<label>شماره زنگ<input type="number" name="period" min="1" max="12" required value="1" inputmode="numeric"></label>' +
          '<button type="submit">شروع / ادامه جلسه</button></form></section>';
        h +=
          '<section class="card session-directory"><header class="session-list-heading"><h3>جلسات درس <span class="lesson-count">' +
          sessions.length.toLocaleString("fa-IR") +
          "</span></h3>";
        if (sessions.length)
          h +=
            '<details class="session-list-actions"><summary>گزینه‌ها</summary><div><button class="danger" onclick="deleteAllSessions(\'' +
            classId +
            "','" +
            lessonId +
            "')\">حذف همه جلسات</button></div></details>";
        h += "</header>";
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
            '<article class="session-card"><button type="button" class="session-open" onclick="openExistingSession(\'' +
            id +
            '\')" aria-label="ورود به جلسه ' +
            esc(title) +
            '"><strong>' +
            esc(title) +
            "</strong>";
          if (pod || unit)
            h +=
              '<span class="session-unit">' +
              esc([pod?.name, unit?.name].filter(Boolean).join(" / ")) +
              "</span>";
          h +=
            '<span class="session-counts"><span>حاضر ' +
            counts.present.toLocaleString("fa-IR") +
            "</span><span>غایب " +
            counts.absent.toLocaleString("fa-IR") +
            "</span><span>تأخیر " +
            counts.late.toLocaleString("fa-IR") +
            "</span><span>" +
            session.scores.length.toLocaleString("fa-IR") +
            ' فعالیت</span></span></button><button type="button" class="session-delete" onclick="deleteSession(\'' +
            id +
            '\')" aria-label="حذف جلسه ' +
            esc(title) +
            '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button></article>';
        }
        return h + "</section>";
      }

