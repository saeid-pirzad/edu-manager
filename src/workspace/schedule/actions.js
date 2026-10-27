function preserveScheduleAction() {
  assertEntityWritable();
  const origin = workspace.id,
    sourceConnection = connection,
    view = state.view;
  return () =>
    workspace.id === origin &&
    connection === sourceConnection &&
    state.view === view &&
    !periodLoading &&
    !resetBusy &&
    !connectionRetired;
}

function validateScheduleSlot(day, period) {
  if (
    !Number.isInteger(day) ||
    day < 0 ||
    day > 6 ||
    !Number.isInteger(period) ||
    period < 0 ||
    period > 11
  )
    throw Error("روز یا زنگ برنامه معتبر نیست.");
}

let scheduleSessionBusy = false;
async function startSessionFromMasterV24(day, period) {
  if (scheduleSessionBusy) return false;
  scheduleSessionBusy = true;
  try {
    const isCurrent = preserveScheduleAction();
    validateScheduleSlot(day, period);
    const dateInput = document.getElementById("sessNewDate"),
      classInput = document.getElementById("sessNewClass"),
      lessonInput = document.getElementById("sessNewLesson"),
      date = validateSessionDate(dateInput.value),
      classId = classInput.value,
      lessonId = lessonInput.value;
    const sameSelection = () =>
      isCurrent() &&
      document.getElementById("sessNewDate") === dateInput &&
      document.getElementById("sessNewClass") === classInput &&
      document.getElementById("sessNewLesson") === lessonInput &&
      dateInput.value === date &&
      classInput.value === classId &&
      lessonInput.value === lessonId;
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    assertEntityWritable();
    if (!sameSelection())
      throw Error("صفحه یا انتخاب جلسه تغییر کرده است؛ دوباره تلاش کنید.");
    const target = classId && findClassById(classId);
    if (
      !target ||
      !target.classObj.lessons.some((lesson) => lesson.id === lessonId)
    )
      throw Error("کلاس و درس مقصد معتبر نیستند.");
    const actualDay = getDayIdxFromDate(date);
    if (
      actualDay !== day &&
      !confirm(
        `تاریخ ${faDate(date)} روز ${DAYS[actualDay]} است، نه ${DAYS[day]}. ادامه می‌دهید؟`,
      )
    )
      return false;
    let session = db.sessions.find(
      (row) =>
        row.classId === classId && row.date === date && row.period === period,
    );
    if (!session) {
      session = {
        id: uid(),
        schoolId: target.school.id,
        classId,
        lessonId,
        date,
        period,
        poudmanId: null,
        unitId: null,
        attendance: {},
        scores: [],
        roster: snapshotRoster(target.classObj),
      };
      db.sessions.push(session);
      await saveDBV24({
        sessionId: session.id,
        action: "ایجاد جلسه از برنامه",
      });
    } else if (session.lessonId !== lessonId) {
      alert(
        "این زنگ برای درس دیگری ثبت شده است؛ برای حفظ سابقه جلسه قبلی باز می‌شود.",
      );
    }
    if (sameSelection()) openSessionModal(getSessionById(session.id));
    return true;
  } finally {
    scheduleSessionBusy = false;
  }
}

async function saveMasterConfigV24(day, period) {
  const isCurrent = preserveScheduleAction();
  validateScheduleSlot(day, period);
  const marker = document.getElementById("cfgAllClass"),
    next = { ...(db.masterSchedule || {}) },
    fields = { all: "All", odd: "Odd", even: "Even" };
  for (const [kind, prefix] of Object.entries(fields)) {
    const classId = document.getElementById("cfg" + prefix + "Class").value,
      lessonId = document.getElementById("cfg" + prefix + "Lesson").value,
      key = `${day}-${period}-${kind}`;
    if (!classId && !lessonId) {
      delete next[key];
      continue;
    }
    const target = classId && findClassById(classId);
    if (
      !target ||
      !lessonId ||
      !target.classObj.lessons.some((lesson) => lesson.id === lessonId)
    )
      throw Error("کلاس و درس هر بخش برنامه را به‌درستی انتخاب کنید.");
    next[key] = { schoolId: target.school.id, classId, lessonId };
  }
  db.masterSchedule = next;
  await saveDBV24({ action: "ثبت برنامه زنگ" });
  if (isCurrent() && document.getElementById("cfgAllClass") === marker) {
    closeModal();
    render();
  }
}

async function clearMasterConfigV24(day, period) {
  const isCurrent = preserveScheduleAction();
  validateScheduleSlot(day, period);
  const marker = document.getElementById("cfgAllClass");
  if (!confirm("کل تنظیمات این زنگ پاک شوند؟")) return false;
  const next = { ...(db.masterSchedule || {}) };
  for (const kind of ["all", "odd", "even"])
    delete next[`${day}-${period}-${kind}`];
  db.masterSchedule = next;
  await saveDBV24({ action: "پاک‌کردن برنامه زنگ" });
  if (isCurrent() && document.getElementById("cfgAllClass") === marker) {
    closeModal();
    render();
  }
  return true;
}

async function saveWeekStartDateV24() {
  const isCurrent = preserveScheduleAction();
  const date = validateSessionDate(
    document.getElementById("weekStartInput").value,
  );
  if (date === db.settings.weekStartDate) return false;
  db.settings.weekStartDate = date;
  await saveDBV24({ action: "تغییر تاریخ شروع محاسبه هفته" });
  if (isCurrent()) {
    render();
    alert("✅ تاریخ شروع محاسبه ذخیره شد");
  }
  return true;
}

async function toggleActiveDayV24(day) {
  const isCurrent = preserveScheduleAction();
  if (!Number.isInteger(day) || day < 0 || day > 6)
    throw Error("روز برنامه باید عدد صحیح صفر تا شش باشد.");
  const days = db.activeDays || [0, 1, 2, 3, 4, 5];
  db.activeDays = days.includes(day)
    ? days.filter((value) => value !== day)
    : [...days, day].sort((a, b) => a - b);
  await saveDBV24({ action: "تغییر روزهای فعال برنامه" });
  if (isCurrent()) render();
}

async function changePeriodsV24(delta) {
  const isCurrent = preserveScheduleAction();
  if (!Number.isInteger(delta))
    throw Error("تغییر تعداد زنگ‌ها باید عدد صحیح باشد.");
  const previous = db.periods || 6,
    next = Math.max(1, Math.min(12, previous + delta));
  if (next === previous) return false;
  const occupied = Object.entries(db.masterSchedule || {}).filter(
    ([key, value]) => value && Number(key.split("-")[1]) >= next,
  );
  if (next < previous && occupied.length) {
    alert(
      "کاهش تعداد زنگ‌ها انجام نشد؛ ابتدا برنامه زنگ‌های " +
        [...new Set(occupied.map(([key]) => Number(key.split("-")[1]) + 1))]
          .sort((a, b) => a - b)
          .join("، ") +
        " را جابه‌جا یا پاک کنید.",
    );
    return false;
  }
  db.periods = next;
  await saveDBV24({ action: "تغییر تعداد زنگ‌های برنامه" });
  if (isCurrent()) render();
  return true;
}
