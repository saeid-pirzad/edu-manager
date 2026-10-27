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
  let h = `<div class="session-workspace"><header class="session-context"><p class="session-context-path">${esc(school?.name || "")} / ${esc(c.name)}</p><h4>${esc(lesson.name)}</h4><p class="session-context-meta">${esc(DAYS[dIdx])} · ${esc(faDate(session.date))} · زنگ ${(session.period + 1).toLocaleString("fa-IR")}</p>${lesson.teacher ? `<p class="session-context-teacher">دبیر: ${esc(lesson.teacher)}</p>` : ""}</header>`;
  h += `<details class="session-date-tools"><summary>تاریخ جلسه: ${esc(faDate(session.date))}</summary><div class="form-row">
    <label>📅 تاریخ جلسه:</label>
    <input type="date" id="sessDate" value="${session.date}" data-legacy-change="sessions-dialog:0" style="flex:1">
    <span class="shamsi-display" id="shamsiSessDate">${toShamsi(session.date)}</span>
    <button class="ghost" data-legacy-click="sessions-dialog:1" data-legacy-click-arg3="${esc(session.id)}" style="font-size:.85em">اعمال تغییر تاریخ</button>
  </div></details>`;
  if (lesson.gradeMode !== "kardanesh")
    h += `<div class="form-row session-unit-fields">
    <label for="sessPoudman">پودمان</label>
    <select id="sessPoudman" data-legacy-change="sessions-dialog:2">
      <option value="">— انتخاب —</option>
      ${lesson.poudmans.map((p) => `<option value="${p.id}" ${p.id === session.poudmanId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>
    <label for="sessUnit">واحد یادگیری</label>
    <select id="sessUnit" data-legacy-change="sessions-dialog:3">
      <option value="">— انتخاب —</option>
      ${(lesson.poudmans.find((p) => p.id === session.poudmanId)?.units || []).map((u) => `<option value="${u.id}" ${u.id === session.unitId ? "selected" : ""}>${esc(u.name)}</option>`).join("")}
    </select>
  </div>`;
  h += `<div class="session-mode-picker"><button type="button" aria-pressed="true" data-session-tab="attendance" data-legacy-click="sessions-dialog:4">حضور و غیاب</button><button type="button" aria-pressed="false" data-session-tab="activity" data-legacy-click="sessions-dialog:5">نمره و فعالیت</button></div><section data-session-panel="attendance"><div class="session-attendance-heading">
    <div><h4>حضور و غیاب</h4><p>وضعیت هر دانش‌آموز را انتخاب کنید.</p></div>
    <div class="session-attendance-bulk">
      <button type="button" class="success" data-legacy-click="sessions-dialog:6">همه حاضر</button>
      <button type="button" class="danger" data-legacy-click="sessions-dialog:7">همه غایب</button>
    </div>
  </div><div class="session-attendance-list">`;
  const sortedStudents = getSortedStudents({
    students: sessionStudents(c, session),
  });
  if (!sortedStudents.length) h += `<div class="empty">دانش‌آموزی در این جلسه نیست</div>`;
  sortedStudents.forEach((s, i) => {
    const st = session.attendance[s.id] || "";
    const isPresent = st === "present";
    const isAbsent = st === "absent";
    const isLate = st.startsWith("late");
    const lateMins = isLate && st.includes(":") ? Number(st.split(":")[1]) : "";
    h += `<div class="att-row">
      <div class="att-name" title="${esc(s.name)}"><span class="attendance-number" aria-hidden="true">${(i + 1).toLocaleString("fa-IR")}</span><span>${esc(s.name)}</span></div>
      <div class="att-btns" data-sid="${s.id}" role="group" aria-label="وضعیت حضور ${esc(s.name)}">
        <button type="button" class="present ${isPresent ? "active" : ""}" data-legacy-click="sessions-dialog:8">حاضر</button>
        <button type="button" class="late ${isLate ? "active" : ""}" data-legacy-click="sessions-dialog:9">تأخیر ${isLate && lateMins ? `(${lateMins}د)` : ""}</button>
        <button type="button" class="absent ${isAbsent ? "active" : ""}" data-legacy-click="sessions-dialog:10">غایب</button>
      </div>
    </div>`;
  });
  h += `</div></section><section data-session-panel="activity" hidden><h4>ثبت نمره کلاسی، مثبت، منفی یا تکلیف</h4><p class="muted">نمرات رسمی عملی، تئوری یا پودمان در بخش نمرات درس ثبت می‌شوند.</p>
    <form data-legacy-submit="sessions-dialog:11" data-legacy-submit-arg0="${esc(session.id)}" class="row session-entry-form">
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
  if (!session.scores.length) h += `<div class="empty">امتیازی ثبت نشده</div>`;
  else {
    h += `<table class="karnameh-table"><thead><tr><th>دانش‌آموز</th><th>نوع</th><th>مقدار</th><th>توضیح</th><th></th></tr></thead><tbody>`;
    session.scores.forEach((sc, idx) => {
      const st = sessionStudent(c, session, sc.studentId);
      h += `<tr><td>${esc(st ? st.name : "—")}</td>
        <td><span class="badge ${sc.type}">${TYPE_LABELS[sc.type]}</span></td>
        <td>${sc.value}</td><td>${esc(sc.note || "")}</td>
        <td><button type="button" class="danger" data-legacy-click="sessions-dialog:12" data-legacy-click-arg5="${esc(session.id)}" data-legacy-click-arg6="${esc(idx)}">×</button></td></tr>`;
    });
    h += `</tbody></table>`;
  }
  h += `</div></section><div class="session-workspace-footer">
    <button type="button" class="success" data-legacy-click="sessions-dialog:13" data-legacy-click-arg0="${esc(session.id)}" data-legacy-click-arg1="${esc(session.schoolId)}" data-legacy-click-arg2="${esc(session.classId)}" data-legacy-click-arg3="${esc(session.schoolId)}" data-legacy-click-arg4="${esc(session.classId)}" data-legacy-click-arg5="${esc(session.lessonId)}">📋 کپی متن برای معاون</button>
    <button type="button" data-legacy-click="sessions-dialog:14">بستن</button></div></div>`;
  showModal("ثبت اطلاعات جلسه", h);
  if (selectedPanel) showSessionPanel(selectedPanel);
}

function getSessionById(id) {
  return db.sessions.find((s) => s.id === id);
}

function legacy_setAllAttendance(status) {
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
function legacy_updateSessionUnits() {
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
function legacy_saveSessionUnit() {
  const sess = db.sessions.find((s) => s.id === currentSessionId);
  if (!sess) return;
  sess.unitId = document.getElementById("sessUnit").value || null;
  saveDB();
}
function legacy_addSessionScore(e, sessionId) {
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
      (sc) => sc.studentId === f.studentId.value && sc.type === f.type.value,
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
