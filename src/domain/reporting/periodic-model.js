// Pure report projection. Time, audience and source are supplied by the host.
(function (root) {
  "use strict";
  const { range, isoDate, addDays } = root.EduReportDates;
  const {
    emptyCounts,
    normalize: attendance,
    tally,
    attendanceRate,
  } = root.EduReportAttendance;
  function build(
    source,
    options,
    { generatedAt, collisionScope = "class" } = {},
  ) {
    if (
      typeof generatedAt !== "string" ||
      !Number.isFinite(Date.parse(generatedAt))
    )
      throw Error("زمان تهیهٔ گزارش معتبر نیست.");
    if (!["class", "teacher"].includes(collisionScope))
      throw Error("محدودهٔ بررسی تداخل جلسه معتبر نیست.");
    const f = { ...options },
      dates = range(f.mode, f.date, source.settings.academicYear, f),
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
    // These indexes live only for this projection; source objects remain mutable.
    const classIndex = new Map();
    for (const classroom of classes) {
      if (classIndex.has(classroom.id)) continue;
      const known = new Map(),
        first = new Map(),
        lessonIndex = new Map();
      for (const student of [
        ...(classroom.students || []),
        ...(classroom.archivedStudents || []),
      ]) {
        known.set(student.id, student);
        if (!first.has(student.id)) first.set(student.id, student);
      }
      for (const lesson of classroom.lessons || [])
        if (!lessonIndex.has(lesson.id)) lessonIndex.set(lesson.id, lesson);
      classIndex.set(classroom.id, { classroom, known, first, lessonIndex });
    }
    const relevantSessions = source.sessions.filter(
      (session) =>
        session.schoolId === school.id &&
        classIndex.has(session.classId) &&
        !(session.date < dates.start || session.date > dates.end),
    );
    const warnings = new Set(),
      seen = new Set(),
      slots = new Set(),
      students = new Map(),
      lessons = new Map(),
      byDate = new Map(),
      sessions = [];
    const total = emptyCounts();
    for (const x of relevantSessions.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.period - b.period ||
        a.id.localeCompare(b.id),
    )) {
      if (seen.has(x.id)) {
        warnings.add("یک شناسه جلسه تکراری فقط یک بار شمارش شد.");
        continue;
      }
      seen.add(x.id);
      const info = classIndex.get(x.classId),
        c = info.classroom,
        lesson = info.lessonIndex.get(x.lessonId),
        historicalStudents = new Map(),
        scoreBuckets = new Map();
      for (const student of x.roster || []) {
        const current = info.first.get(student.id);
        historicalStudents.set(student.id, {
          ...current,
          ...student,
          code: student.code || current?.code || "",
        });
      }
      for (const score of x.scores || []) {
        const id = score.studentId;
        if (!scoreBuckets.has(id)) scoreBuckets.set(id, []);
        scoreBuckets.get(id).push(score);
      }
      const roster = Array.isArray(x.roster) ? x.roster : c.students || [];
      const ids = new Set([
        ...roster.map((st) => st.id),
        ...Object.keys(x.attendance || {}),
        ...scoreBuckets.keys(),
      ]);
      if (f.audience === "parent" && !ids.has(f.studentId)) continue;
      if (!Array.isArray(x.roster) || x.rosterInferred)
        warnings.add(
          x.rosterInferred
            ? "فهرست تاریخی برخی جلسات موجود نیست؛ برای آن جلسات از فهرست کلاس در همان نوبت و سوابق ثبت‌شده استفاده شده است."
            : "فهرست تاریخی برخی جلسات موجود نیست؛ برای آن جلسات از فهرست فعلی کلاس و سوابق ثبت‌شده استفاده شده است.",
        );
      // A teacher cannot teach different classes at the same bell. A school
      // report may include parallel classes; its host selects that scope.
      const slot = JSON.stringify([
        school.id,
        ...(collisionScope === "class" ? [c.id] : []),
        x.date,
        x.period,
      ]);
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
        const st = historicalStudents.get(sid) || info.known.get(sid),
          a = attendance(x.attendance?.[sid]);
        tally(total, a);
        tally(sessionCounts, a);
        const key = JSON.stringify([c.id, sid]);
        if (!students.has(key))
          students.set(key, {
            studentId: sid,
            classId: c.id,
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
        const own = scoreBuckets.get(sid) || [];
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
      const lessonKey = JSON.stringify([c.id, x.lessonId]);
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
      const historical = x.annualMetadata || null;
      sessions.push({
        id: x.id,
        date: x.date,
        period: x.period,
        classId: c.id,
        className: historical?.className ?? c.name,
        lessonName: historical?.lessonName ?? lesson?.name ?? "درس فاقد تعریف",
        moduleName: historical?.moduleName ?? pod?.name ?? "",
        unitName: historical?.unitName ?? unit?.name ?? "",
        teacher: historical?.teacher ?? lesson?.teacher ?? "",
        ...(f.mode === "annual" && x.academicTerm
          ? { academicTerm: x.academicTerm, sourcePeriodId: x.sourcePeriodId }
          : {}),
        counts: sessionCounts,
        participants,
        marks,
      });
    }
    return {
      format: "EduManager.PeriodicReport",
      version: 1,
      generatedAt,
      academicYear: source.settings.academicYear,
      academicTerm: source.settings.academicTerm || "",
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
        attendanceRate: attendanceRate(total),
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
        "در نمایش گزارش، حاضر شامل هنرجویان با تأخیر است؛ تعداد تأخیر زیرمجموعه حاضر است و جداگانه به مجموع اضافه نمی‌شود. در فایل JSON، present حضور بدون تأخیر و late حضور با تأخیر است؛ مجموع این دو، کل حاضرین است.",
        "حضور و غیاب با واحد نفرـجلسه شمارش شده است؛ یک هنرجو در دو زنگ، دو مشاهده دارد.",
        "نرخ حضور = حاضر و دارای تأخیر، تقسیم بر موارد تعیین‌شده؛ موارد تعیین‌نشده در مخرج نیستند.",
        "گزارش فقط جلسات ثبت‌شده را پوشش می‌دهد؛ نبود جلسه یا نمره به معنی غیبت یا نمره صفر نیست.",
        "نمرات و امتیازهای جلسات این بازه، نمره نهایی درس محسوب نمی‌شوند.",
      ],
    };
  }

  root.EduReportModel = Object.freeze({ build });
})(globalThis);
