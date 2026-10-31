let last = null,
  busy = false;
const noteKey = (f) =>
  [
    context().id,
    f.mode,
    f.mode === "weekly"
      ? "week:" + range("weekly", f.date).start
      : f.mode === "monthly"
        ? "month:" + range("monthly", f.date).start
        : f.mode === "annual"
          ? "academic-year:" +
            (f.annualFirstId || "auto") +
            ":" +
            (f.annualSecondId || "auto")
          : f.date,
    f.schoolId,
    f.classId,
    f.audience,
    f.audience === "parent" ? f.studentId : "",
  ].join("|");
const inputSnapshot = () => ({
  ...filters,
  workspaceId: context().id,
  note: readNote(noteKey(filters)),
});
const reportSignature = () =>
  JSON.stringify({ input: inputSnapshot(), context: context() });
const emptyCounts = () => ({
  present: 0,
  absent: 0,
  leave: 0,
  late: 0,
  unknown: 0,
  lateMinutes: 0,
  lateMinutesRecorded: 0,
});
function attendance(value) {
  if (value === "present")
    return { status: "present", label: "حاضر", minutes: null };
  if (value === "absent")
    return { status: "absent", label: "غایب", minutes: null };
  if (value === "leave")
    return { status: "leave", label: "مرخصی", minutes: null };
  const match =
    typeof value === "string" ? value.match(/^late(?::(\d+))?$/) : null;
  if (match)
    return {
      status: "late",
      label: "با تأخیر",
      minutes: match[1] === undefined ? null : Number(match[1]),
    };
  return { status: "unknown", label: "تعیین نشده", minutes: null };
}
function tally(counts, a) {
  counts[a.status]++;
  if (a.minutes !== null && Number.isSafeInteger(a.minutes)) {
    counts.lateMinutes += a.minutes;
    counts.lateMinutesRecorded++;
  }
}
function build(source, options) {
  const f = { ...options },
    dates = range(f.mode, f.date, source.settings.academicYear),
    school = source.schools.find((s) => s.id === f.schoolId);
  if (!school) throw Error("مدرسه گزارش را انتخاب کنید.");
  if (!["management", "parent"].includes(f.audience))
    throw Error("مخاطب گزارش نامعتبر است.");
  const classes = school.classes.filter(
    (c) => !f.classId || c.id === f.classId,
  );
  if (f.classId && !classes.length)
    throw Error("کلاس انتخاب‌شده متعلق به این مدرسه نیست.");
  let selected = null;
  if (f.audience === "parent") {
    if (!f.classId || !f.studentId)
      throw Error("برای گزارش اولیا، کلاس و یک هنرجو را انتخاب کنید.");
    const c = classes[0];
    selected = [...(c.students || []), ...(c.archivedStudents || [])].find(
      (st) => st.id === f.studentId,
    );
    if (!selected) {
      for (const x of source.sessions.filter(
        (x) => x.schoolId === school.id && x.classId === c.id,
      )) {
        selected = x.roster?.find((st) => st.id === f.studentId);
        if (selected) break;
      }
    }
    if (!selected) throw Error("هنرجو در کلاس انتخاب‌شده پیدا نشد.");
  }
  const warnings = new Set(),
    seen = new Set(),
    slots = new Set(),
    students = new Map(),
    lessons = new Map(),
    byDate = new Map(),
    sessions = [];
  const total = emptyCounts();
  for (const x of [...source.sessions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.period - b.period ||
      a.id.localeCompare(b.id),
  )) {
    if (
      x.schoolId !== school.id ||
      !classes.some((c) => c.id === x.classId) ||
      x.date < dates.start ||
      x.date > dates.end
    )
      continue;
    if (seen.has(x.id)) {
      warnings.add("یک شناسه جلسه تکراری فقط یک بار شمارش شد.");
      continue;
    }
    seen.add(x.id);
    const c = classes.find((c) => c.id === x.classId),
      lesson = (c.lessons || []).find((l) => l.id === x.lessonId);
    const known = new Map(
      [
        ...(c.students || []),
        ...(c.archivedStudents || []),
        ...(x.roster || []).map((st) => ({
          ...[...(c.students || []), ...(c.archivedStudents || [])].find(
            (current) => current.id === st.id,
          ),
          ...st,
          code:
            st.code ||
            [...(c.students || []), ...(c.archivedStudents || [])].find(
              (current) => current.id === st.id,
            )?.code ||
            "",
        })),
      ].map((st) => [st.id, st]),
    );
    const roster = Array.isArray(x.roster) ? x.roster : c.students || [];
    const ids = new Set([
      ...roster.map((st) => st.id),
      ...Object.keys(x.attendance || {}),
      ...(x.scores || []).map((sc) => sc.studentId),
    ]);
    if (f.audience === "parent" && !ids.has(f.studentId)) continue;
    if (!Array.isArray(x.roster))
      warnings.add(
        "فهرست تاریخی برخی جلسات موجود نیست؛ برای آن جلسات از فهرست فعلی کلاس و سوابق ثبت‌شده استفاده شده است.",
      );
    const slot = [x.date, x.classId, x.period].join("|");
    if (slots.has(slot))
      warnings.add(
        "برای برخی زنگ‌ها بیش از یک جلسه ثبت شده است؛ شمار جلسات را بررسی کنید.",
      );
    slots.add(slot);
    if (!lesson)
      warnings.add(
        "تعریف بعضی درس‌های دارای جلسه در دسترس نیست؛ سوابق جلسه حفظ شده‌اند.",
      );
    const sessionCounts = emptyCounts(),
      participants = [],
      marks = [];
    for (const sid of ids) {
      if (f.audience === "parent" && sid !== f.studentId) continue;
      const st = known.get(sid),
        a = attendance(x.attendance?.[sid]);
      tally(total, a);
      tally(sessionCounts, a);
      const key = c.id + "|" + sid;
      if (!students.has(key))
        students.set(key, {
          studentId: sid,
          name: st?.name || "هنرجوی فاقد مشخصات",
          code: st?.code || "",
          className: c.name,
          sessions: 0,
          ...emptyCounts(),
          markCount: 0,
        });
      const row = students.get(key);
      row.sessions++;
      tally(row, a);
      const own = (x.scores || []).filter((sc) => sc.studentId === sid);
      row.markCount += own.length;
      const scores = own.map((sc) => ({
        type: sc.type,
        value: sc.value ?? null,
        note: String(sc.note || ""),
        label:
          {
            mostamar: "مستمر",
            payani: "پایانی",
            positive: "امتیاز مثبت",
            negative: "امتیاز منفی",
            homework: "تکلیف",
            classGrade: "نمره کلاسی",
            activity: "امتیاز فعالیت",
          }[sc.type] || "ثبت دیگر",
      }));
      participants.push({
        studentId: sid,
        name: st?.name || "هنرجوی فاقد مشخصات",
        code: st?.code || "",
        attendance: a,
        ...(scores.length ? { scores } : { scores: [] }),
      });
      for (const score of scores)
        marks.push({
          studentId: sid,
          name: st?.name || "هنرجوی فاقد مشخصات",
          ...score,
        });
    }
    const lessonKey = c.id + "|" + x.lessonId;
    if (!lessons.has(lessonKey))
      lessons.set(lessonKey, {
        className: c.name,
        lessonName: lesson?.name || "درس فاقد تعریف",
        sessions: 0,
        ...emptyCounts(),
        markCount: 0,
      });
    const lessonRow = lessons.get(lessonKey);
    lessonRow.sessions++;
    lessonRow.markCount += marks.length;
    for (const key of Object.keys(sessionCounts))
      lessonRow[key] += sessionCounts[key];
    if (!byDate.has(x.date))
      byDate.set(x.date, {
        date: x.date,
        sessions: 0,
        ...emptyCounts(),
        markCount: 0,
      });
    const day = byDate.get(x.date);
    day.sessions++;
    day.markCount += marks.length;
    for (const key of Object.keys(sessionCounts))
      day[key] += sessionCounts[key];
    const pod = lesson?.poudmans?.find((p) => p.id === x.poudmanId),
      unit = pod?.units?.find((u) => u.id === x.unitId);
    sessions.push({
      id: x.id,
      date: x.date,
      period: x.period,
      className: c.name,
      lessonName: lesson?.name || "درس فاقد تعریف",
      moduleName: pod?.name || "",
      unitName: unit?.name || "",
      teacher: lesson?.teacher || "",
      counts: sessionCounts,
      participants,
      marks,
    });
  }
  const known = total.present + total.absent + total.late;
  return {
    format: "EduManager.PeriodicReport",
    version: 1,
    generatedAt: new Date().toISOString(),
    academicYear: source.settings.academicYear,
    mode: f.mode,
    audience: f.audience,
    detailLevel:
      f.audience === "parent"
        ? "full"
        : f.detailLevel === "full"
          ? "full"
          : "summary",
    start: dates.start,
    end: dates.end,
    school: { id: school.id, name: school.name },
    class: f.classId ? { id: classes[0].id, name: classes[0].name } : null,
    student: selected
      ? {
          id: selected.id,
          name: selected.name,
          code: selected.code || "",
        }
      : null,
    author: String(f.author || "").slice(0, 200),
    note: String(f.note || ""),
    summary: {
      sessions: sessions.length,
      students: students.size,
      ...total,
      attendanceRate: known
        ? Number((((total.present + total.late) * 100) / known).toFixed(1))
        : null,
      recordedMarks: sessions.reduce((n, s) => n + s.marks.length, 0),
    },
    days: Array.from(
      {
        length:
          Math.round((isoDate(dates.end) - isoDate(dates.start)) / 86400000) +
          1,
      },
      (_, i) =>
        byDate.get(addDays(dates.start, i)) || {
          date: addDays(dates.start, i),
          sessions: 0,
          ...emptyCounts(),
          markCount: 0,
        },
    ),
    students: [...students.values()],
    lessons: [...lessons.values()],
    sessions,
    currentGrades: [],
    warnings: [...warnings],
    definitions: [
      "حضور و غیاب با واحد نفرـجلسه شمارش شده است؛ یک هنرجو در دو زنگ، دو مشاهده دارد.",
      "نرخ حضور = حاضر و دارای تأخیر، تقسیم بر موارد تعیین‌شده؛ موارد تعیین‌نشده در مخرج نیستند.",
      "گزارش فقط جلسات ثبت‌شده را پوشش می‌دهد؛ نبود جلسه یا نمره به معنی غیبت یا نمره صفر نیست.",
      "نمرات و امتیازهای جلسات این بازه، نمره نهایی درس محسوب نمی‌شوند.",
    ],
  };
}
