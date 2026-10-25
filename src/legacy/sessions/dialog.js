      function showSessionPanel(panel) {
        if (!["attendance", "activity"].includes(panel)) return;
        const root = document.querySelector("#modalBody .session-workspace");
        if (!root) return;
        for (const section of root.querySelectorAll("[data-session-panel]"))
          section.hidden = section.dataset.sessionPanel !== panel;
        for (const button of root.querySelectorAll("[data-session-tab]"))
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.sessionTab === panel),
          );
      }
      function openSessionModal(session) {
        const selectedPanel =
          !document.getElementById("modal").classList.contains("hidden") &&
          currentSessionId === session.id
            ? document.querySelector(
                "#modalBody [data-session-tab][aria-pressed=true]",
              )?.dataset.sessionTab
            : null;
        currentSessionId = session.id;
        const c = getClassObj(session.schoolId, session.classId);
        if (!c) {
          closeModal();
          return;
        }
        const lesson = getLessonObj(c, session.lessonId);
        if (!lesson) {
          closeModal();
          return;
        }
        const dIdx = getDayIdxFromDate(session.date);
        const school = getSchool(session.schoolId);
        let h = `<div class="session-workspace"><div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:14px">
    <span class="badge" style="background:${getClassColor(session.classId)};color:#fff">${esc(school?.name || "")} / ${esc(c.name)}</span>
    <strong style="margin-right:8px">${esc(lesson.name)}</strong>${lesson.teacher ? ` — دبیر: ${esc(lesson.teacher)}` : ""} — ${DAYS[dIdx]} — زنگ ${session.period + 1}
  </div>`;
        h += `<details class="session-date-tools"><summary>تاریخ جلسه: ${esc(faDate(session.date))}</summary><div class="form-row">
    <label>📅 تاریخ جلسه:</label>
    <input type="date" id="sessDate" value="${session.date}" onchange="document.getElementById('shamsiSessDate').textContent=toShamsi(this.value)" style="flex:1">
    <span class="shamsi-display" id="shamsiSessDate">${toShamsi(session.date)}</span>
    <button class="ghost" onclick="changeSessionDate('${session.id}')" style="font-size:.85em">اعمال تغییر تاریخ</button>
  </div></details>`;
        if (lesson.gradeMode !== "kardanesh")
          h += `<div class="form-row">
    <label>پودمان:</label>
    <select id="sessPoudman" onchange="updateSessionUnits()">
      <option value="">— انتخاب —</option>
      ${lesson.poudmans.map((p) => `<option value="${p.id}" ${p.id === session.poudmanId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>
    <label>واحد:</label>
    <select id="sessUnit" onchange="saveSessionUnit()">
      <option value="">— انتخاب —</option>
      ${(lesson.poudmans.find((p) => p.id === session.poudmanId)?.units || []).map((u) => `<option value="${u.id}" ${u.id === session.unitId ? "selected" : ""}>${esc(u.name)}</option>`).join("")}
    </select>
  </div>`;
        h += `<div class="session-mode-picker"><button type="button" aria-pressed="true" data-session-tab="attendance" onclick="showSessionPanel(\'attendance\')">حضور و غیاب</button><button type="button" aria-pressed="false" data-session-tab="activity" onclick="showSessionPanel(\'activity\')">نمره و فعالیت</button></div><section data-session-panel="attendance"><div class="row" style="justify-content:space-between;align-items:center;margin-top:14px">
    <h4 style="margin:0">👥 حضور و غیاب</h4>
    <div>
      <button type="button" class="success" onclick="setAllAttendance('present')" style="font-size:.8em;padding:4px 10px">✅ همه حاضر</button>
      <button type="button" class="danger" onclick="setAllAttendance('absent')" style="font-size:.8em;padding:4px 10px">❌ همه غایب</button>
    </div>
  </div><div>`;
        if (!c.students.length) h += `<div class="empty">دانش‌آموزی نیست</div>`;
        const sortedStudents = getSortedStudents({
          students: sessionStudents(c, session),
        });
        sortedStudents.forEach((s, i) => {
          const st = session.attendance[s.id] || "";
          const isPresent = st === "present";
          const isAbsent = st === "absent";
          const isLate = st.startsWith("late");
          const lateMins =
            isLate && st.includes(":") ? Number(st.split(":")[1]) : "";
          h += `<div class="att-row">
      <div class="att-name">${i + 1}. ${esc(s.name)}</div>
      <div class="att-btns" data-sid="${s.id}">
        <button type="button" class="present ${isPresent ? "active" : ""}" onclick="toggleAtt(this,'present')">حاضر</button>
        <button type="button" class="late ${isLate ? "active" : ""}" onclick="toggleAtt(this,'late')">تأخیر ${isLate && lateMins ? `(${lateMins}د)` : ""}</button>
        <button type="button" class="absent ${isAbsent ? "active" : ""}" onclick="toggleAtt(this,'absent')">غایب</button>
      </div>
    </div>`;
        });
        h += `</div></section><section data-session-panel="activity" hidden><h4>ثبت نمره کلاسی، مثبت، منفی یا تکلیف</h4><p class="muted">نمرات رسمی عملی، تئوری یا پودمان در بخش نمرات درس ثبت می‌شوند.</p>
    <form onsubmit="addSessionScore(event,'${session.id}')" class="row session-entry-form">
      <select name="studentId" aria-label="دانش‌آموز" required style="flex:1"><option value="">دانش‌آموز</option>
      ${getSortedStudents({ students: sessionStudents(c, session) })
        .map((s) => `<option value="${s.id}">${esc(s.name)}</option>`)
        .join("")}</select>
      <select name="type" aria-label="نوع فعالیت" required>
        ${!lesson.gradingPolicy && lesson.gradeMode !== "kardanesh" ? `<option value="mostamar">مستمر</option><option value="payani">پایانی</option>` : ""}
        <option value="classGrade">نمره کلاسی (۰ تا ۲۰)</option><option value="activity">امتیاز فعالیت</option><option value="positive">مثبت</option><option value="negative">منفی</option>
        <option value="homework">تکلیف</option>
      </select>
      <input name="value" aria-label="مقدار" type="text" inputmode="decimal" placeholder="مقدار" required style="width:80px">
      <input name="note" aria-label="توضیح فعالیت" placeholder="توضیح (اختیاری)" style="flex:1">
      <button type="submit">ثبت فعالیت</button>
    </form><div>`;
        if (!session.scores.length)
          h += `<div class="empty">امتیازی ثبت نشده</div>`;
        else {
          h += `<table class="karnameh-table"><thead><tr><th>دانش‌آموز</th><th>نوع</th><th>مقدار</th><th>توضیح</th><th></th></tr></thead><tbody>`;
          session.scores.forEach((sc, idx) => {
            const st = sessionStudent(c, session, sc.studentId);
            h += `<tr><td>${esc(st ? st.name : "—")}</td>
        <td><span class="badge ${sc.type}">${TYPE_LABELS[sc.type]}</span></td>
        <td>${sc.value}</td><td>${esc(sc.note || "")}</td>
        <td><button type="button" class="danger" onclick="removeSessionScore('${session.id}',${idx})">×</button></td></tr>`;
          });
          h += `</tbody></table>`;
        }
        h += `</div></section><div class="row" style="justify-content:flex-end;margin-top:14px">
    <button type="button" class="success" onclick="copyToClipboard(generateSessionReportText(getSessionById('${session.id}'),getClassObj('${session.schoolId}','${session.classId}'),getLessonObj(getClassObj('${session.schoolId}','${session.classId}'),'${session.lessonId}')),this)">📋 کپی متن برای معاون</button>
    <button type="button" onclick="closeModal()">بستن</button></div></div>`;
        showModal("ثبت اطلاعات جلسه", h);
        if (selectedPanel) showSessionPanel(selectedPanel);
      }

      function getSessionById(id) {
        return db.sessions.find((s) => s.id === id);
      }

      function setAllAttendance(status) {
        const sess = db.sessions.find((s) => s.id === currentSessionId);
        if (!sess) return;
        const c = getClassObj(sess.schoolId, sess.classId);
        if (!c) return;
        c.students.forEach((s) => {
          sess.attendance[s.id] = status;
        });
        saveDB();
        document.querySelectorAll(".att-btns").forEach((wrap) => {
          wrap.querySelectorAll("button").forEach((b) => {
            b.classList.remove("active");
            b.innerHTML = b.innerHTML.replace(/\s\(\d+د\)/, "");
            if (b.classList.contains(status)) b.classList.add("active");
          });
        });
      }

      async function toggleAtt(btn, status) {
        const wrap = btn.parentElement;
        const was = btn.classList.contains("active");
        const sess = db.sessions.find((s) => s.id === currentSessionId);
        if (!sess) return;
        const sid = wrap.dataset.sid;
        wrap.querySelectorAll("button").forEach((b) => {
          b.classList.remove("active");
          if (b.classList.contains("late")) b.innerHTML = "تأخیر";
          else if (b.classList.contains("present")) b.innerHTML = "حاضر";
          else if (b.classList.contains("absent")) b.innerHTML = "غایب";
        });
        if (!was) {
          btn.classList.add("active");
          if (status === "late") {
            const mins = prompt("دقیقه تأخیر: عدد صحیح صفر تا ۹۹۹", "10");
            if (mins === null) {
              openSessionModal(sess);
              return;
            }
            if (!/^\d{1,3}$/.test(mins.trim())) {
              alert("دقیقه نامعتبر است.");
              openSessionModal(sess);
              return;
            }
            if (mins !== null && mins.trim() !== "") {
              sess.attendance[sid] = "late:" + Number(mins);
              btn.textContent = `تأخیر (${Number(mins)}د)`;
            } else {
              sess.attendance[sid] = "late:0";
            }
          } else {
            sess.attendance[sid] = status;
          }
        } else {
          delete sess.attendance[sid];
        }
        await saveDB({ sessionId: sess.id });
      }

      async function changeSessionDate(sessionId) {
        const sess = db.sessions.find((s) => s.id === sessionId);
        if (!sess) return;
        const newDate = document.getElementById("sessDate").value;
        if (!newDate) return alert("تاریخ معتبر نیست");
        if (newDate === sess.date) return;
        const conflict = db.sessions.find(
          (s) =>
            s.id !== sessionId &&
            s.classId === sess.classId &&
            s.date === newDate &&
            s.period === sess.period,
        );
        if (conflict) {
          if (confirm("برای این تاریخ و زنگ جلسه‌ای ثبت شده. آن را باز کنیم؟"))
            openSessionModal(conflict);
          return;
        }
        sess.date = newDate;
        await saveDB({ sessionId: sess.id });
        openSessionModal(sess);
      }
      function updateSessionUnits() {
        const sess = db.sessions.find((s) => s.id === currentSessionId);
        if (!sess) return;
        sess.poudmanId = document.getElementById("sessPoudman").value || null;
        sess.unitId = null;
        saveDB();
        const c = getClassObj(sess.schoolId, sess.classId);
        const lesson = getLessonObj(c, sess.lessonId);
        const p = lesson.poudmans.find((x) => x.id === sess.poudmanId);
        document.getElementById("sessUnit").innerHTML =
          '<option value="">— انتخاب —</option>' +
          (p
            ? p.units
                .map((u) => `<option value="${u.id}">${esc(u.name)}</option>`)
                .join("")
            : "");
      }
      function saveSessionUnit() {
        const sess = db.sessions.find((s) => s.id === currentSessionId);
        if (!sess) return;
        sess.unitId = document.getElementById("sessUnit").value || null;
        saveDB();
      }
      function addSessionScore(e, sessionId) {
        e.preventDefault();
        const sess = db.sessions.find((s) => s.id === sessionId);
        if (!sess) return;
        const f = e.target,
          val = parseFloat(f.value.value);
        if (!Number.isFinite(val) || val < 0)
          return alert("مقدار باید عدد نامنفی باشد.");
        if (!Object.hasOwn(TYPE_LABELS, f.type.value))
          return alert("نوع نامعتبر است.");
        const c = getClassObj(sess.schoolId, sess.classId),
          l = getLessonObj(c, sess.lessonId);
        if (!c.students.some((st) => st.id === f.studentId.value))
          return alert("دانش‌آموز نامعتبر است.");
        if (["mostamar", "payani"].includes(f.type.value)) {
          if (l.gradeMode === "kardanesh")
            return alert("عملی و تئوری را در بخش نمرات کاردانش ثبت کنید.");
          if (val > 20) return alert("نمره باید بین صفر و بیست باشد.");
          if (!sess.poudmanId || !sess.unitId)
            return alert("ابتدا پودمان و واحد را انتخاب کنید.");
          const old = sess.scores.find(
            (sc) =>
              sc.studentId === f.studentId.value && sc.type === f.type.value,
          );
          if (old) {
            old.value = val;
            old.note = f.note.value.trim();
            saveDB();
            openSessionModal(getSessionById(sessionId));
            return;
          }
        }
        sess.scores.push({
          studentId: f.studentId.value,
          type: f.type.value,
          value: val,
          note: f.note.value.trim(),
        });
        saveDB();
        openSessionModal(sess);
      }
      async function removeSessionScore(sessionId, idx) {
        const sess = db.sessions.find((s) => s.id === sessionId);
        if (!sess) return;
        sess.scores.splice(idx, 1);
        await saveDB({ sessionId: sess.id });
        openSessionModal(sess);
      }

