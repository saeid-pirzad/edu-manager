function sessionRoster(c, x) {
  return x.roster || c.students.map((st) => ({ id: st.id, name: st.name }));
}

async function setAllAttendanceV24(statusValue) {
  const x = getSessionById(currentSessionId),
    c = findClass(x?.classId);
  if (!x || !c) return;
  for (const st of sessionRoster(c, x)) x.attendance[st.id] = statusValue;
  await saveDBV24({ sessionId: x.id, action: "حضور و غیاب گروهی" });
  openSessionModal(getSessionById(x.id));
}

async function saveSessionUnitV24() {
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
  const c = findClass(x.classId),
    l = getLessonObj(c, x.lessonId),
    p = l.poudmans.find((p) => p.id === pid),
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
  openSessionModal(getSessionById(x.id));
}

function updateSessionUnitsV24() {
  const x = getSessionById(currentSessionId),
    c = findClass(x.classId),
    l = getLessonObj(c, x.lessonId),
    pid = document.getElementById("sessPoudman").value,
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
  const x = getSessionById(id),
    c = findClass(x.classId),
    l = getLessonObj(c, x.lessonId),
    f = e.target,
    type = f.type.value,
    sid = f.studentId.value;
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
    note: f.note.value.trim(),
    recordedAt: new Date().toISOString(),
  });
  await saveDBV24({
    sessionId: id,
    action: "ثبت یا اصلاح " + TYPE_LABELS[type],
  });
  openSessionModal(getSessionById(id));
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
