function sessionRoster(c, x) {
  return x.roster || c.students.map((st) => ({ id: st.id, name: st.name }));
}

function preserveSessionAction(id) {
  assertEntityWritable();
  const origin = workspace.id,
    sourceData = db,
    sourceInstallation =
      typeof installationToken === "undefined" ? "" : installationToken,
    sourceConnection = connection;
  return () =>
    db === sourceData &&
    workspace.id === origin &&
    (typeof installationToken === "undefined" ? "" : installationToken) ===
      sourceInstallation &&
    connection === sourceConnection &&
    currentSessionId === id &&
    !periodLoading &&
    !resetBusy &&
    !connectionRetired;
}

async function toggleAttendanceV24(button, status) {
  if (button.isConnected === false)
    throw Error("کنترل حضور مربوط به صفحهٔ قبلی است؛ جلسه را دوباره باز کنید.");
  const id = currentSessionId,
    isCurrent = preserveSessionAction(id),
    session = getSessionById(id),
    wrap = button.parentElement,
    studentId = wrap?.dataset.sid;
  if (!session) throw Error("جلسه دیگر وجود ندارد.");
  const cls = findClass(session.classId);
  if (
    !cls ||
    !sessionRoster(cls, session).some((student) => student.id === studentId)
  )
    throw Error("هنرجو در فهرست این جلسه وجود ندارد.");
  if (!["present", "absent", "late", "leave"].includes(status))
    throw Error("وضعیت حضور نامعتبر است.");
  const previous = session.attendance[studentId],
    selected =
      status === "late" ? previous?.startsWith("late") : previous === status;
  let value = status;
  if (!selected && status === "late") {
    const answer = prompt("دقیقه تأخیر: عدد صحیح صفر تا ۹۹۹", "10");
    if (answer === null) return false;
    const minutes = asciiDigits(answer);
    if (!/^\d{1,3}$/.test(minutes)) throw Error("دقیقه نامعتبر است.");
    value = "late:" + Number(minutes);
  }
  assertEntityWritable();
  if (!isCurrent() || getSessionById(id) !== session)
    throw Error("جلسه یا اتصال بانک تغییر کرده است؛ حضور ثبت نشد.");
  if (selected) delete session.attendance[studentId];
  else session.attendance[studentId] = value;
  await saveDBV24({ sessionId: id, action: "ثبت حضور و غیاب هنرجو" });
  if (isCurrent() && button.isConnected !== false) {
    const saved = getSessionById(id)?.attendance[studentId];
    for (const control of wrap.querySelectorAll("button")) {
      const kind = ["present", "absent", "late", "leave"].find((name) =>
        control.classList.contains(name),
      );
      control.classList.remove("active");
      control.setAttribute("aria-pressed", "false");
      if (kind === "present") control.textContent = "حاضر";
      if (kind === "absent") control.textContent = "غایب";
      if (kind === "leave") control.textContent = "مرخصی";
      if (kind === "late") control.textContent = "تأخیر";
      if (
        kind &&
        (kind === "late" ? saved?.startsWith("late") : saved === kind)
      ) {
        control.classList.add("active");
        control.setAttribute("aria-pressed", "true");
        if (kind === "late" && saved.includes(":"))
          control.textContent = "تأخیر (" + Number(saved.split(":")[1]) + "د)";
      }
    }
  }
  if (isCurrent() && typeof refreshSessionAttendanceProgress === "function")
    refreshSessionAttendanceProgress();
  return true;
}

async function removeSessionScoreV24(id, index) {
  const isCurrent = preserveSessionAction(id);
  const session = getSessionById(id);
  if (!session) throw Error("جلسه دیگر وجود ندارد.");
  if (!Number.isInteger(index) || index < 0 || index >= session.scores.length)
    throw Error("امتیاز انتخاب‌شده دیگر وجود ندارد.");
  session.scores.splice(index, 1);
  await saveDBV24({ sessionId: id, action: "حذف امتیاز جلسه" });
  if (isCurrent()) openSessionModal(getSessionById(id));
}

function validateSessionDate(date) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(date + "T00:00:00.000Z")
    : null;
  if (
    !parsed ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw Error("تاریخ معتبر نیست.");
  return date;
}

function validateSessionSchedule(session) {
  EduSessionSlots.assertScheduled({ guarded: [{ value: session }] }, db);
}

function validateAcademicSessionDate(date) {
  return EduAcademicYear.assertDate(workspace.year, validateSessionDate(date));
}

let sessionDeletionBusy = false;
async function deleteSessionsV24({ id, classId, lessonId }) {
  if (sessionDeletionBusy) return false;
  sessionDeletionBusy = true;
  try {
    assertEntityWritable();
    const origin = workspace.id,
      sourceConnection = connection,
      schoolId = state.schoolId,
      selectedClass = state.classId,
      selectedLesson = state.lessonId,
      selectedSession = currentSessionId;
    const isCurrent = () =>
      workspace.id === origin &&
      connection === sourceConnection &&
      state.schoolId === schoolId &&
      state.classId === selectedClass &&
      state.lessonId === selectedLesson &&
      currentSessionId === selectedSession &&
      !periodLoading &&
      !resetBusy &&
      !connectionRetired;
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    assertEntityWritable();
    if (!isCurrent()) throw Error("صفحه یا ترم تغییر کرده است؛ حذف انجام نشد.");
    const matches = id
      ? (session) => session.id === id
      : (session) =>
          session.classId === classId && session.lessonId === lessonId;
    const targets = db.sessions.filter(matches);
    if (!targets.length) return false;
    if (
      !confirm(
        id
          ? "آیا از حذف این جلسه مطمئن هستید؟ اطلاعات حضور و نمرات آن پاک خواهد شد."
          : "⚠️ هشدار: آیا از حذف تمام جلسات این درس مطمئن هستید؟ تمام حضور و غیاب‌ها و نمرات ثبت شده در این جلسات برای همیشه پاک می‌شوند.",
      )
    )
      return false;
    db.sessions = db.sessions.filter((session) => !matches(session));
    await saveDBV24({ action: id ? "حذف جلسه" : "حذف گروهی جلسات درس" });
    if (isCurrent()) {
      if (targets.some((session) => session.id === selectedSession)) {
        closeModal();
        currentSessionId = null;
      }
      render();
    }
    return true;
  } finally {
    sessionDeletionBusy = false;
  }
}
function deleteSessionV24(id) {
  return deleteSessionsV24({ id });
}
function deleteAllSessionsV24(classId, lessonId) {
  return deleteSessionsV24({ classId, lessonId });
}

let manualSessionBusy = false;
async function addManualSessionV24(event, lessonId) {
  event.preventDefault();
  if (manualSessionBusy) return false;
  manualSessionBusy = true;
  try {
    assertEntityWritable();
    const date = validateAcademicSessionDate(event.target.date.value),
      text = asciiDigits(event.target.period.value);
    if (!/^\d{1,2}$/.test(text) || Number(text) < 1 || Number(text) > 12)
      throw Error("شماره زنگ باید عدد صحیح یک تا دوازده باشد.");
    const period = Number(text) - 1,
      origin = workspace.id,
      sourceConnection = connection,
      schoolId = state.schoolId,
      classId = state.classId,
      selectedLesson = state.lessonId,
      selectedSession = currentSessionId;
    const isCurrent = () =>
      workspace.id === origin &&
      connection === sourceConnection &&
      state.schoolId === schoolId &&
      state.classId === classId &&
      state.lessonId === selectedLesson &&
      currentSessionId === selectedSession &&
      !periodLoading &&
      !resetBusy &&
      !connectionRetired;
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    assertEntityWritable();
    if (!isCurrent()) throw Error("صفحه یا ترم تغییر کرده است؛ جلسه ثبت نشد.");
    if (
      event.target.isConnected === false ||
      event.target.date.value !== date ||
      asciiDigits(event.target.period.value) !== text
    )
      throw Error(
        "انتخاب تاریخ یا زنگ هنگام ثبت تغییر کرده است؛ انتخاب جدید را بررسی و دوباره تلاش کنید.",
      );
    const cls = getClassObj(schoolId, classId);
    if (!cls || !getLessonObj(cls, lessonId))
      throw Error("کلاس یا درس مقصد دیگر وجود ندارد.");
    const existing = db.sessions.find(
      (session) => session.date === date && session.period === period,
    );
    if (existing) {
      if (existing.classId !== classId)
        throw Error(
          "تداخل جلسه: در این تاریخ و زنگ، جلسهٔ کلاس دیگری ثبت شده است. ابتدا تاریخ یا شمارهٔ زنگ را اصلاح کنید.",
        );
      if (existing.lessonId !== lessonId)
        throw Error(
          "تداخل جلسه: این تاریخ و زنگ قبلاً برای درس دیگری ثبت شده است؛ درس یا زنگ درست را انتخاب کنید.",
        );
      // Start / continue is already an explicit request to reopen this lesson.
      if (isCurrent()) openSessionModal(existing);
      return false;
    }
    validateSessionSchedule({ schoolId, classId, lessonId, date, period });
    const session = {
      id: uid(),
      schoolId,
      classId,
      date,
      period,
      lessonId,
      poudmanId: null,
      unitId: null,
      attendance: {},
      scores: [],
      roster: snapshotRoster(cls),
    };
    db.sessions.push(session);
    await saveDBV24({ sessionId: session.id, action: "ایجاد جلسه دستی" });
    if (isCurrent()) openSessionModal(getSessionById(session.id));
    return true;
  } finally {
    manualSessionBusy = false;
  }
}

async function changeSessionDateV24(id) {
  const isCurrent = preserveSessionAction(id);
  const session = getSessionById(id);
  if (!session) throw Error("جلسه دیگر وجود ندارد.");
  const date = validateSessionDate(document.getElementById("sessDate").value);
  const periodInput = document.getElementById("sessPeriod");
  const periodText = ["number", "select-one"].includes(periodInput?.type)
    ? asciiDigits(periodInput.value)
    : String(session.period + 1);
  if (
    !/^\d{1,2}$/.test(periodText) ||
    Number(periodText) < 1 ||
    Number(periodText) > 12
  )
    throw Error("شماره زنگ باید عدد صحیح یک تا دوازده باشد.");
  const period = Number(periodText) - 1;
  if (date === session.date && period === session.period) return;
  if (date !== session.date) validateAcademicSessionDate(date);
  const conflict = db.sessions.find(
    (other) =>
      other.id !== id && other.date === date && other.period === period,
  );
  if (conflict) {
    if (conflict.classId !== session.classId)
      throw Error(
        "تداخل جلسه: این تاریخ و زنگ برای کلاس دیگری ثبت شده است؛ تغییر اعمال نشد.",
      );
    throw Error(
      "تداخل جلسه: این تاریخ و زنگ قبلاً ثبت شده است. تاریخ یا شمارهٔ زنگ دیگری انتخاب کنید؛ اطلاعات جلسه تغییر نکرد.",
    );
  }
  validateSessionSchedule({ ...session, date, period });
  session.date = date;
  session.period = period;
  await saveDBV24({ sessionId: id, action: "تغییر تاریخ یا زنگ جلسه" });
  if (isCurrent()) openSessionModal(getSessionById(id));
}

function previousSessionAttendanceV24(session) {
  const classroom = session && findClass(session.classId);
  if (!classroom) return null;
  const targetIds = new Set(
    sessionRoster(classroom, session).map((student) => student.id),
  );
  return (
    db.sessions
      .filter(
        (candidate) =>
          candidate.id !== session.id &&
          candidate.schoolId === session.schoolId &&
          candidate.classId === session.classId &&
          candidate.date === session.date &&
          candidate.period < session.period &&
          sessionRoster(classroom, candidate).some(
            (student) =>
              targetIds.has(student.id) &&
              /^(present|absent|leave|late(?::\d{1,3})?)$/.test(
                candidate.attendance?.[student.id] || "",
              ),
          ),
      )
      .sort((a, b) => b.period - a.period)[0] || null
  );
}

async function copyPreviousAttendanceV24(targetId) {
  const id = currentSessionId,
    isCurrent = preserveSessionAction(id);
  if (targetId !== id)
    throw Error("این دکمه مربوط به جلسهٔ قبلی است؛ جلسه را دوباره باز کنید.");
  const session = getSessionById(id),
    source = previousSessionAttendanceV24(session);
  if (!source)
    throw Error(
      "حضور ثبت‌شده‌ای از زنگ قبلی همین کلاس در همین روز وجود ندارد.",
    );
  const classroom = findClass(session.classId),
    sourceIds = new Set(
      sessionRoster(classroom, source).map((student) => student.id),
    );
  const updates = [];
  for (const student of sessionRoster(classroom, session)) {
    const value = source.attendance[student.id];
    if (
      session.attendance[student.id] ||
      !sourceIds.has(student.id) ||
      !/^(present|absent|leave|late(?::\d{1,3})?)$/.test(value || "")
    )
      continue;
    updates.push([student.id, value.startsWith("late") ? "present" : value]);
  }
  if (!updates.length) return false;
  assertEntityWritable();
  if (!isCurrent() || getSessionById(id) !== session)
    throw Error("جلسه یا اتصال بانک تغییر کرده است؛ حضور منتقل نشد.");
  for (const [studentId, value] of updates)
    session.attendance[studentId] = value;
  await saveDBV24({
    sessionId: id,
    action: "تکمیل حضور از زنگ قبلی همین کلاس و روز",
  });
  if (isCurrent()) openSessionModal(getSessionById(id));
  return true;
}

async function setAllAttendanceV24(statusValue, { onlyUnset = false } = {}) {
  const isCurrent = preserveSessionAction(currentSessionId);
  if (
    typeof statusValue !== "string" ||
    !/^(present|absent|leave|late(?::\d{1,3})?)$/.test(statusValue)
  )
    throw Error("وضعیت حضور نامعتبر است.");
  const x = getSessionById(currentSessionId),
    c = findClass(x?.classId);
  if (!x || !c) return;
  let changed = false;
  for (const st of sessionRoster(c, x)) {
    if (
      (onlyUnset && x.attendance[st.id]) ||
      x.attendance[st.id] === statusValue
    )
      continue;
    x.attendance[st.id] = statusValue;
    changed = true;
  }
  if (!changed) return false;
  await saveDBV24({ sessionId: x.id, action: "حضور و غیاب گروهی" });
  if (isCurrent()) openSessionModal(getSessionById(x.id));
}

async function saveSessionUnitV24() {
  const isCurrent = preserveSessionAction(currentSessionId);
  const x = getSessionById(currentSessionId);
  if (!x) return;
  const pid = document.getElementById("sessPoudman").value || null,
    unitId = document.getElementById("sessUnit").value || null;
  if (pid === x.poudmanId && unitId === x.unitId) return;
  if (x.scores.length && (!pid || !unitId)) {
    alert("جلسه دارای نمره باید پودمان و واحد معتبر داشته باشد.");
    openSessionModal(x);
    return;
  }
  const c = findClass(x.classId);
  if (!c) throw Error("کلاس جلسه دیگر وجود ندارد.");
  const l = getLessonObj(c, x.lessonId);
  if (!l) throw Error("درس جلسه دیگر وجود ندارد.");
  const p = l.poudmans.find((p) => p.id === pid),
    u = p?.units.find((u) => u.id === unitId);
  if ((pid && !p) || (unitId && !u)) throw Error("واحد نامعتبر");
  if (
    (x.scores.length || Object.keys(x.attendance).length) &&
    !confirm(
      "تغییر واحد، " +
        x.scores.length +
        " نمره/امتیاز و " +
        Object.keys(x.attendance).length +
        " وضعیت حضور این جلسه را به " +
        (u ? p.name + " / " + u.name : "بدون واحد") +
        " نسبت می‌دهد. ادامه؟ این تغییر در تاریخچه و بازگردانی ثبت می‌شود.",
    )
  ) {
    openSessionModal(x);
    return;
  }
  x.poudmanId = pid;
  x.unitId = unitId;
  await saveDBV24({
    sessionId: x.id,
    action: "تغییر واحد جلسه با تأیید اثر بر سوابق",
  });
  if (isCurrent()) openSessionModal(getSessionById(x.id));
}

function updateSessionUnitsV24() {
  assertEntityWritable();
  const x = getSessionById(currentSessionId);
  if (!x) throw Error("جلسه دیگر وجود ندارد.");
  const c = findClass(x.classId);
  if (!c) throw Error("کلاس جلسه دیگر وجود ندارد.");
  const l = getLessonObj(c, x.lessonId);
  if (!l) throw Error("درس جلسه دیگر وجود ندارد.");
  const pid = document.getElementById("sessPoudman").value,
    p = l.poudmans.find((p) => p.id === pid);
  document.getElementById("sessUnit").innerHTML =
    '<option value="">— انتخاب واحد برای اعمال تغییر —</option>' +
    (p
      ? p.units
          .map(
            (u) => '<option value="' + u.id + '">' + esc(u.name) + "</option>",
          )
          .join("")
      : "");
  return !pid ? saveSessionUnitV24() : undefined;
}

const sessionScoreForms = new WeakSet();
async function addSessionScoreV24(e, id) {
  e.preventDefault();
  const f = e.target;
  if (sessionScoreForms.has(f)) return false;
  sessionScoreForms.add(f);
  try {
    const isCurrent = preserveSessionAction(id);
    const x = getSessionById(id);
    if (!x) throw Error("جلسه دیگر وجود ندارد.");
    const c = findClass(x.classId);
    if (!c) throw Error("کلاس جلسه دیگر وجود ندارد.");
    const l = getLessonObj(c, x.lessonId);
    if (!l) throw Error("درس جلسه دیگر وجود ندارد.");
    if (f.isConnected === false || currentSessionId !== id)
      throw Error(
        "فرم فعالیت مربوط به جلسهٔ فعلی نیست؛ جلسه را دوباره باز کنید.",
      );
    const submitted = Object.fromEntries(
      ["studentId", "type", "value", "note"].map((name) => [
        name,
        f[name].value,
      ]),
    );
    const type = f.type.value,
      sid = f.studentId.value;
    const note = f.note.value.trim();
    if (note.length > 10000)
      throw Error("توضیح امتیاز باید حداکثر ۱۰۰۰۰ نویسه باشد.");
    if (
      !Object.hasOwn(TYPE_LABELS, type) ||
      !sessionRoster(c, x).some((st) => st.id === sid)
    )
      throw Error("دانش‌آموز یا نوع امتیاز نامعتبر است.");
    let value;
    if (type === "classGrade") {
      const parsed = parseGrade(f.value.value);
      if (!parsed.ok) throw Error(parsed.message);
      value = parsed.value;
    } else if (["mostamar", "payani"].includes(type)) {
      if (l.gradingPolicy || l.gradeMode === "kardanesh")
        throw Error("نمرات رسمی را در بخش نمرات درس ثبت کنید.");
      if (!x.poudmanId || !x.unitId)
        throw Error("ابتدا پودمان و واحد را مشخص کنید.");
      const parsed = parseGrade(f.value.value);
      if (!parsed.ok) throw Error(parsed.message);
      value = parsed.value;
      x.scores = x.scores.filter(
        (sc) => sc.studentId !== sid || sc.type !== type,
      );
    } else {
      const text = asciiDigits(f.value.value);
      if (!/^\d+(?:\.\d{1,6})?$/.test(text))
        throw Error("مقدار امتیاز عددی و نامنفی باشد.");
      value = Number(text);
      if (!Number.isFinite(value) || value > 1000)
        throw Error("امتیاز باید صفر تا هزار باشد.");
    }
    x.scores.push({
      studentId: sid,
      type,
      value,
      note,
      recordedAt: new Date().toISOString(),
    });
    await saveDBV24({
      sessionId: id,
      action: "ثبت یا اصلاح " + TYPE_LABELS[type],
    });
    if (isCurrent())
      openSessionModal(getSessionById(id), {
        activitySaved: {
          submitted,
          advance: !!e.submitter?.hasAttribute("data-session-next"),
        },
      });
    return true;
  } finally {
    sessionScoreForms.delete(f);
  }
}

function clickMasterV24(day, period) {
  const entry = getMasterEntry(day, period, todayISO());
  if (state.masterFilter && entry && entry.classId !== state.masterFilter) {
    const other = findClass(entry.classId);
    showModal(
      "این زنگ متعلق به کلاس دیگری است",
      "<p>کلاس فیلترشده در این زنگ برنامه‌ای ندارد. زنگ متعلق به " +
        esc(other?.name || "کلاس دیگر") +
        ' است.</p><button data-workspace-action="close">بازگشت</button><button class="ghost" data-workspace-action="unfiltered-session" data-day="' +
        day +
        '" data-period="' +
        period +
        '">نمایش آگاهانه کلاس دیگر</button>',
    );
    return;
  }
  old.clickMasterCell(day, period);
  if (!entry && state.masterFilter) {
    const select = document.getElementById("cfgAllClass");
    if (select) {
      select.value = state.masterFilter;
      updateLessonOptions("cfgAllClass");
    }
  }
}
