// Keep session validation errors beside the originating form, including on mobile.
async function runSessionFormAction(control, action) {
  const host = control.closest(
    ".session-create,.session-date-tools,.session-start-panel,.today-agenda-row",
  );
  if (!host) return action();
  host.querySelector(".session-validation-alert")?.remove();
  try {
    return await action();
  } catch (error) {
    return showSessionFormError(host, error);
  }
}

function showSessionFormError(host, error) {
  if (!host.isConnected) return false;
  if (host.tagName === "DETAILS") host.open = true;
  host.querySelector(".session-validation-alert")?.remove();
  const notice = document.createElement("div");
  notice.className = "session-validation-alert";
  notice.setAttribute("role", "alert");
  notice.tabIndex = -1;
  notice.innerHTML =
    '<span class="session-validation-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M10.3 3.8a2 2 0 0 1 3.4 0l8 13.7a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3l8-13.7Z" fill="currentColor" opacity=".16"/><path d="M12 8v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.1" fill="currentColor"/></svg></span><div class="session-validation-body"><strong>ثبت جلسه نیاز به بررسی دارد</strong><p></p><small>اطلاعات فرم حفظ شده است؛ پس از اصلاح، دوباره ثبت کنید.</small></div>';
  notice.querySelector("p").textContent = error.message || String(error);
  host.append(notice);
  notice.focus({ preventScroll: true });
  notice.scrollIntoView({ block: "nearest", behavior: "instant" });
  return false;
}

// A rejected write belongs to the form that started it.
async function runSessionEditorAction(control, action) {
  const root = control.closest(".session-workspace");
  const id = currentSessionId;
  try {
    return await action();
  } catch (error) {
    if (
      root?.isConnected &&
      root.dataset.sessionId === id &&
      currentSessionId === id
    )
      EduV24.course.error(error);
    return false;
  }
}

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
function filterSessionAttendance(input) {
  const root = input.closest(".session-workspace");
  if (!root) return;
  const normalize = (value) =>
    String(value)
      .normalize("NFKC")
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[\u200c\u200d]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("fa");
  const query = normalize(input.value);
  let visible = 0;
  for (const row of root.querySelectorAll(".att-row")) {
    row.hidden = !normalize(row.dataset.search).includes(query);
    if (!row.hidden) visible++;
  }
  const empty = root.querySelector(".session-attendance-no-results");
  if (empty) empty.hidden = !query || visible > 0;
}
function sessionAttendanceProgress(session, classroom) {
  const roster = sessionStudents(classroom, session);
  const unset = roster.filter(
    (student) => !session.attendance[student.id],
  ).length;
  return { total: roster.length, unset };
}
function refreshSessionAttendanceProgress() {
  const root = document.querySelector("#modalBody .session-workspace");
  if (!root || root.dataset.sessionId !== currentSessionId) return;
  const session = getSessionById(currentSessionId);
  const classroom = session && getClassObj(session.schoolId, session.classId);
  if (!session || !classroom) return;
  const progress = sessionAttendanceProgress(session, classroom);
  const label = root.querySelector("[data-session-attendance-progress]");
  if (label)
    label.textContent =
      (progress.total - progress.unset).toLocaleString("fa-IR") +
      " از " +
      progress.total.toLocaleString("fa-IR") +
      " نفر ثبت شده · تعیین‌نشده: " +
      progress.unset.toLocaleString("fa-IR");
  const fill = root.querySelector('[data-legacy-click="sessions-dialog:6"]');
  const meter = root.querySelector("[data-session-attendance-meter]");
  if (meter) {
    meter.max = Math.max(progress.total, 1);
    meter.value = progress.total - progress.unset;
  }
  if (fill) setControlLock(fill, "attendance-complete", progress.unset === 0);
  const reuse = root.querySelector(
    '[data-legacy-click="sessions-dialog:reuse-previous"]',
  );
  if (reuse) setControlLock(reuse, "attendance-complete", progress.unset === 0);
}
function refreshSessionActivityInput(form, changedControl = null) {
  if (!form?.isConnected) return;
  const type = form.elements.type.value;
  const value = form.elements.value;
  const count = ["positive", "negative"].includes(type);
  if (count && (value.value === "" || changedControl?.name === "type"))
    value.value = type === "positive" ? "0.25" : "0.5";
  value.placeholder = ["classGrade", "mostamar", "payani"].includes(type)
    ? "۰ تا ۲۰"
    : "۰ تا ۱۰۰۰";
  const students = form.elements.studentId;
  const next = form.querySelector("[data-session-next]");
  if (next)
    setControlLock(
      next,
      "student-last",
      students.selectedIndex < 1 ||
        students.selectedIndex >= students.options.length - 1,
    );
}
function captureSessionActivityForm() {
  const form = document.querySelector("#modalBody .session-entry-form");
  if (!form) return null;
  return Object.fromEntries(
    ["studentId", "type", "value", "note"].map((name) => [
      name,
      form.elements[name].value,
    ]),
  );
}
function legacy_openSessionModal(session, { activitySaved = null } = {}) {
  const selectedPanel =
    !document.getElementById("modal").classList.contains("hidden") &&
    currentSessionId === session.id
      ? document.querySelector(
          "#modalBody [data-session-tab][aria-pressed=true]",
        )?.dataset.sessionTab
      : null;
  const entry = selectedPanel ? captureSessionActivityForm() : null;
  const attendanceQuery = selectedPanel
    ? document.querySelector("#modalBody .session-attendance-search input")
        ?.value || ""
    : "";
  const scroll = selectedPanel
    ? document.getElementById("modalBody").scrollTop
    : 0;
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
  const previousAttendance =
    typeof previousSessionAttendance === "function"
      ? previousSessionAttendance(session)
      : null;
  const school = getSchool(session.schoolId);
  let h = `<div class="session-workspace" data-session-id="${esc(session.id)}"><header class="session-context"><span class="session-context-icon" aria-hidden="true">${EduIcons.html("book")}</span><div class="session-context-copy"><p class="session-context-path">${esc(school?.name || "")} / ${esc(c.name)}</p><h4>${esc(lesson.name)}</h4><p class="session-context-meta">${esc(DAYS[dIdx])} · ${esc(faDate(session.date))} · زنگ ${(session.period + 1).toLocaleString("fa-IR")}</p>${lesson.teacher ? `<p class="session-context-teacher">دبیر: ${esc(lesson.teacher)}</p>` : ""}</div></header>`;
  h +=
    '<div data-modal-save-feedback role="status" aria-live="polite" hidden></div>';
  const academicRange = EduAcademicYear.range(db.settings.academicYear);
  if (!EduAcademicYear.contains(db.settings.academicYear, session.date))
    h +=
      '<aside class="session-year-warning" role="status"><strong>جلسهٔ قدیمی خارج از سال تحصیلی</strong><p>سوابق این جلسه حفظ شده‌اند. این تاریخ در گزارش سالانهٔ ' +
      esc(db.settings.academicYear) +
      " قرار نمی‌گیرد؛ تاریخ را بررسی و در صورت نیاز اصلاح کنید.</p></aside>";
  const sessionSelection = sessionScheduleSelection(
    session,
    String(session.period + 1),
    [session],
  );
  h += `<details class="session-date-tools"><summary>${EduIcons.html("edit")}<span>ویرایش تاریخ و زنگ</span></summary><div class="form-row session-date-grid">
    <label class="session-field"><span>تاریخ جلسه</span>
      <input type="date" id="sessDate" data-session-calendar="edit" data-session-id="${esc(session.id)}" value="${session.date}" min="${academicRange.start}" max="${academicRange.end}" data-legacy-change="sessions-dialog:0">
      <span class="shamsi-display" id="shamsiSessDate">${toShamsi(session.date)}</span>
    </label>
    <label class="session-field"><span>زنگ طبق برنامه</span><select id="sessPeriod">${sessionSelection.options}</select></label>
    <button type="button" class="ghost" data-legacy-click="sessions-dialog:1" data-legacy-click-arg3="${esc(session.id)}">ذخیره تغییرات</button>
  </div><p class="session-schedule-hint" id="sessScheduleStatus" role="status">${esc(sessionSelection.summary)}</p></details>`;
  if (lesson.gradeMode !== "kardanesh")
    h += `<div class="form-row session-unit-fields">
    <label class="session-field"><span>پودمان</span>
    <select id="sessPoudman" data-legacy-change="sessions-dialog:2">
      <option value="">— انتخاب —</option>
      ${lesson.poudmans.map((p) => `<option value="${p.id}" ${p.id === session.poudmanId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select></label>
    <label class="session-field"><span>واحد یادگیری</span>
    <select id="sessUnit" data-legacy-change="sessions-dialog:3">
      <option value="">— انتخاب —</option>
      ${(lesson.poudmans.find((p) => p.id === session.poudmanId)?.units || []).map((u) => `<option value="${u.id}" ${u.id === session.unitId ? "selected" : ""}>${esc(u.name)}</option>`).join("")}
    </select></label>
  </div>`;
  h += `<div class="session-mode-picker"><button type="button" aria-pressed="true" data-session-tab="attendance" data-legacy-click="sessions-dialog:4">${EduIcons.html("attendance")}<span>حضور و غیاب</span></button><button type="button" aria-pressed="false" data-session-tab="activity" data-legacy-click="sessions-dialog:5">${EduIcons.html("grades")}<span>نمره و فعالیت</span></button></div><section data-session-panel="attendance"><div class="session-attendance-heading">
    <div><h4>حضور و غیاب</h4><p data-session-attendance-progress role="status"></p><progress data-session-attendance-meter aria-label="تکمیل ثبت حضور و غیاب" max="1" value="0"></progress></div>
    <div class="session-attendance-bulk" role="group" aria-label="ثبت گروهی حضور و غیاب">
      <button type="button" class="success" data-mutating="1" data-legacy-click="sessions-dialog:6" aria-label="ثبت حاضر برای هنرجویان تعیین‌نشده" title="فقط وضعیت‌های تعیین‌نشده حاضر می‌شوند؛ ثبت‌های قبلی حفظ می‌شوند.">باقی‌ها حاضر</button>
      <button type="button" class="ghost" data-mutating="1" data-legacy-click="sessions-dialog:all-present">همه حاضر</button>
      <button type="button" class="danger" data-mutating="1" data-legacy-click="sessions-dialog:7">همه غایب</button>
    </div>
  </div>${previousAttendance ? `<div class="session-attendance-reuse"><button type="button" class="ghost" data-mutating="1" data-legacy-click="sessions-dialog:reuse-previous" data-session-target="${esc(session.id)}">${EduIcons.html("copy")}از زنگ ${(previousAttendance.period + 1).toLocaleString("fa-IR")} بگیر</button><small>فقط تعیین‌نشده‌ها؛ تأخیر قبلی «حاضر» می‌شود.</small></div>` : ""}<label class="session-attendance-search"><span>جست‌وجوی هنرجو</span><input type="search" placeholder="نام یا کد دانش‌آموزی…" value="${esc(attendanceQuery)}" data-legacy-input="sessions-dialog:attendance-search"></label><p class="session-attendance-no-results" role="status" hidden>هنرجویی پیدا نشد.</p><div class="session-attendance-list">`;
  const sortedStudents = getSortedStudents({
    students: sessionStudents(c, session),
  });
  if (!sortedStudents.length)
    h += `<div class="empty">دانش‌آموزی در این جلسه نیست</div>`;
  sortedStudents.forEach((s, i) => {
    const st = session.attendance[s.id] || "";
    const isPresent = st === "present";
    const isAbsent = st === "absent";
    const isLeave = st === "leave";
    const isLate = st.startsWith("late");
    const lateMins = isLate && st.includes(":") ? Number(st.split(":")[1]) : "";
    h += `<div class="att-row" data-search="${esc(s.name + " " + (s.code || ""))}">
      <div class="att-name" title="${esc(s.name)}"><span class="attendance-number" aria-hidden="true">${(i + 1).toLocaleString("fa-IR")}</span><span>${esc(s.name)}</span></div>
      <div class="att-btns" data-sid="${s.id}" role="group" aria-label="وضعیت حضور ${esc(s.name)}">
        <button type="button" aria-pressed="${isPresent}" class="present ${isPresent ? "active" : ""}" data-legacy-click="sessions-dialog:8">حاضر</button>
        <button type="button" aria-pressed="${isLate}" class="late ${isLate ? "active" : ""}" data-legacy-click="sessions-dialog:9">تأخیر ${isLate && st.includes(":") ? `(${lateMins}د)` : ""}</button>
        <button type="button" aria-pressed="${isLeave}" class="leave ${isLeave ? "active" : ""}" data-legacy-click="sessions-dialog:leave">مرخصی</button>
        <button type="button" aria-pressed="${isAbsent}" class="absent ${isAbsent ? "active" : ""}" data-legacy-click="sessions-dialog:10">غایب</button>
      </div>
    </div>`;
  });
  h += `</div></section><section data-session-panel="activity" hidden><h4>ثبت فعالیت کلاس</h4><p class="muted">نمرات رسمی عملی، تئوری یا پودمان در بخش نمرات درس ثبت می‌شوند.</p>
    <form data-legacy-submit="sessions-dialog:11" data-legacy-submit-arg0="${esc(session.id)}" class="row session-entry-form" data-mutating="1">
      <label class="session-field session-field-wide"><span>هنرجو</span><select name="studentId" data-legacy-change="sessions-dialog:entry-change" aria-label="دانش‌آموز" required><option value="">دانش‌آموز</option>
      ${getSortedStudents({ students: sessionStudents(c, session) })
        .map((s) => `<option value="${s.id}">${esc(s.name)}</option>`)
        .join("")}</select></label>
      <label class="session-field"><span>نوع فعالیت</span><select name="type" data-legacy-change="sessions-dialog:entry-change" aria-label="نوع فعالیت" required>
        ${!lesson.gradingPolicy && lesson.gradeMode !== "kardanesh" ? `<option value="mostamar">مستمر</option><option value="payani">پایانی</option>` : ""}
        <option value="classGrade">نمره کلاسی (۰ تا ۲۰)</option><option value="activity">امتیاز فعالیت</option><option value="positive">مثبت</option><option value="negative">منفی</option>
        <option value="homework">تکلیف</option>
      </select></label>
      <label class="session-field"><span>نمره یا مقدار</span><input name="value" aria-label="مقدار" type="text" inputmode="decimal" placeholder="مثلاً ۱۸ یا ۱" required></label>
      <label class="session-field session-field-wide"><span>توضیح <small>(اختیاری)</small></span><input name="note" aria-label="توضیح فعالیت" placeholder="موضوع تمرین یا توضیح فعالیت"></label>
      <div class="session-entry-actions"><button type="submit">ثبت فعالیت</button><button type="submit" class="ghost" data-session-next>ثبت و نفر بعد</button></div>
    </form><div class="session-activity-records">${sessionActivityRecordsHtml(session, c)}`;
  h += `</div></section><div class="session-workspace-footer">
    <button type="button" class="success" data-legacy-click="sessions-dialog:13" data-legacy-click-arg0="${esc(session.id)}" data-legacy-click-arg1="${esc(session.schoolId)}" data-legacy-click-arg2="${esc(session.classId)}" data-legacy-click-arg3="${esc(session.schoolId)}" data-legacy-click-arg4="${esc(session.classId)}" data-legacy-click-arg5="${esc(session.lessonId)}">کپی برای معاون</button>
    <button type="button" class="ghost" data-legacy-click="sessions-dialog:14">بستن</button></div></div>`;
  if (showModal("ثبت اطلاعات جلسه", h) === false) return false;
  if (selectedPanel) showSessionPanel(selectedPanel);
  const form = document.querySelector("#modalBody .session-entry-form");
  if (entry) {
    for (const [name, value] of Object.entries(entry))
      form.elements[name].value = value;
  }
  bindSessionActivityRecords(session);
  if (
    !entry ||
    !activitySaved ||
    !finishSessionActivitySave(form, activitySaved)
  )
    refreshSessionActivityInput(form);
  refreshSessionAttendanceProgress();
  filterSessionAttendance(
    document.querySelector("#modalBody .session-attendance-search input"),
  );
  if (selectedPanel) document.getElementById("modalBody").scrollTop = scroll;
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

async function legacy_toggleAtt(btn, status) {
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

async function legacy_changeSessionDate(sessionId) {
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
async function legacy_removeSessionScore(sessionId, idx) {
  const sess = db.sessions.find((s) => s.id === sessionId);
  if (!sess) return;
  sess.scores.splice(idx, 1);
  await saveDB({ sessionId: sess.id });
  openSessionModal(sess);
}
