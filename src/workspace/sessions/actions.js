function sessionRoster(c, x) {
  return x.roster || c.students.map((st) => ({ id: st.id, name: st.name }));
}

function preserveSessionAction(id) {
  assertEntityWritable();
  const origin = workspace.id,
    sourceConnection = connection;
  return () =>
    workspace.id === origin &&
    connection === sourceConnection &&
    currentSessionId === id &&
    !periodLoading &&
    !resetBusy &&
    !connectionRetired;
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

let manualSessionBusy = false;
async function addManualSessionV24(event, lessonId) {
  event.preventDefault();
  if (manualSessionBusy) return false;
  manualSessionBusy = true;
  try {
    assertEntityWritable();
    const date = validateSessionDate(event.target.date.value),
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
    if (!isCurrent()) throw Error("صفحه یا دوره تغییر کرده است؛ جلسه ثبت نشد.");
    const cls = getClassObj(schoolId, classId);
    if (!cls || !getLessonObj(cls, lessonId))
      throw Error("کلاس یا درس مقصد دیگر وجود ندارد.");
    const existing = db.sessions.find(
      (session) =>
        session.classId === classId &&
        session.date === date &&
        session.period === period,
    );
    if (existing) {
      const message =
        existing.lessonId === lessonId
          ? "جلسه همین درس در این تاریخ و زنگ وجود دارد. ادامه داده شود؟"
          : "این زنگ به درس دیگری تعلق دارد؛ وارد جلسهٔ ثبت‌شده شوید؟";
      if (confirm(message) && isCurrent()) openSessionModal(existing);
      return false;
    }
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
  if (date === session.date) return;
  const conflict = db.sessions.find(
    (other) =>
      other.id !== id &&
      other.classId === session.classId &&
      other.date === date &&
      other.period === session.period,
  );
  if (conflict) {
    if (
      confirm("برای این تاریخ و زنگ جلسه‌ای ثبت شده. آن را باز کنیم؟") &&
      isCurrent()
    )
      openSessionModal(conflict);
    return;
  }
  session.date = date;
  await saveDBV24({ sessionId: id, action: "تغییر تاریخ جلسه" });
  if (isCurrent()) openSessionModal(getSessionById(id));
}

async function setAllAttendanceV24(statusValue) {
  const isCurrent = preserveSessionAction(currentSessionId);
  if (
    typeof statusValue !== "string" ||
    !/^(present|absent|late(?::\d{1,3})?)$/.test(statusValue)
  )
    throw Error("وضعیت حضور نامعتبر است.");
  const x = getSessionById(currentSessionId),
    c = findClass(x?.classId);
  if (!x || !c) return;
  for (const st of sessionRoster(c, x)) x.attendance[st.id] = statusValue;
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
  if (!pid) saveSessionUnitV24().catch(handleError);
}

async function addSessionScoreV24(e, id) {
  e.preventDefault();
  const isCurrent = preserveSessionAction(id);
  const x = getSessionById(id);
  if (!x) throw Error("جلسه دیگر وجود ندارد.");
  const c = findClass(x.classId);
  if (!c) throw Error("کلاس جلسه دیگر وجود ندارد.");
  const l = getLessonObj(c, x.lessonId);
  if (!l) throw Error("درس جلسه دیگر وجود ندارد.");
  const f = e.target,
    type = f.type.value,
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
  if (isCurrent()) openSessionModal(getSessionById(id));
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
