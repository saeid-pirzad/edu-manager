function excelReportSheets(m) {
  const sheets = [];
  const sheet = (name, headers, rows, widths) =>
    sheets.push({ name, rows: [headers, ...rows], widths });
  const counts = (row) => [
    row.sessions,
    (row.present || 0) + (row.late || 0),
    row.absent,
    row.leave,
    row.late,
    row.unknown,
  ];
  const countHeaders = [
    "جلسه",
    "حاضر با احتساب تأخیر",
    "غایب",
    "مرخصی",
    "تأخیر (زیرمجموعه حاضر)",
    "تعیین‌نشده",
  ];
  const result = (grade) =>
    !grade.complete
      ? "ناقص"
      : grade.passed == null
        ? "تکمیل"
        : grade.passed
          ? "قبول"
          : "نیازمند جبران";
  const safe = (grade) => {
    if (grade.complete !== true || !Number.isFinite(grade.final)) return null;
    // Keep ordinary grades numeric, but do not let Excel's two-decimal format
    // make a below-threshold result appear to meet its acceptance threshold.
    const display = root.EduV24.finalText(grade);
    return display === grade.final.toFixed(2) ? grade.final : display;
  };
  const date = (value) =>
    new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }).format(new Date(value + "T12:00:00Z"));
  const weekday = (value) =>
    new Intl.DateTimeFormat("fa-IR", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(value + "T12:00:00Z"));
  const preparedAt = new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(new Date(m.generatedAt));
  const metadata = [
    [
      "نوع گزارش",
      {
        daily: "روزانه",
        weekly: "هفتگی",
        monthly: "ماهانه",
        annual: "سال تحصیلی",
      }[m.mode],
    ],
    [
      "مخاطب",
      m.audience === "parent"
        ? "اولیا — فقط هنرجوی انتخاب‌شده"
        : "مدیریت مدرسه",
    ],
    [
      "وضعیت داده",
      m.summary.sessions
        ? "جلسات و ثبت‌های همین محدوده در شیت‌های داده آمده‌اند."
        : m.annualGrades?.length || m.technicalGrades?.length
          ? "جلسه‌ای در این محدوده ثبت نشده است؛ نمرات موجود در شیت‌های امتحان آمده‌اند."
          : "هیچ جلسه یا نمره‌ای برای این محدوده در گزارش موجود نیست؛ تاریخ، مدرسه و کلاس انتخاب‌شده را بررسی کنید.",
    ],
    ["مدرسه", m.school.name],
    ["کلاس", m.class?.name || "همه کلاس‌ها"],
    ["هنرجو", m.student?.name || "همه هنرجویان محدوده"],
    ["کد هنرجو", m.student?.code == null ? "" : String(m.student.code)],
    ["سال تحصیلی", m.academicYear],
    ["ترم", m.academicTerm || "هر دو ترم"],
    ["از تاریخ", date(m.start)],
    ["تا تاریخ", date(m.end)],
    ["زمان تهیه (شمسی)", preparedAt],
    ["تنظیم‌کننده", m.author],
    ["توضیحات", m.note],
    ...countHeaders.map((header, i) => [header, counts(m.summary)[i]]),
    ["تعداد هنرجویان با سابقه جلسه", m.summary.students],
    ["نرخ حضور (درصد)", m.summary.attendanceRate],
    ["ثبت‌های فعالیت", m.summary.recordedMarks],
    [
      "نمرات واحد کار",
      "نمرات واحدهای کار جزئیات آموزشی‌اند؛ برای پودمان رسمی، نتیجه از مستمر و شایستگی پودمان محاسبه می‌شود. سلول نمره ترکیبی واحد کار در روش رسمی خالی است.",
    ],
    ...(m.definitions || []).map((text) => ["مبنای گزارش", text]),
    ...(m.warnings || []).map((text) => ["نیازمند بررسی", text]),
    [
      "راهنما",
      "سلول خالی یعنی ثبت‌نشده یا نامرتبط؛ صفر عدد واقعی است. این فایل گزارش است و برای بازیابی سیستم نیست.",
    ],
  ];
  sheet("خلاصه", ["عنوان", "مقدار"], metadata, [38, 95]);
  sheets[0].filter = false;
  sheet(
    "آمار روزها",
    ["تاریخ شمسی", "روز هفته", ...countHeaders, "ثبت فعالیت"],
    m.days
      .filter((d) => d.sessions > 0)
      .map((d) => [date(d.date), weekday(d.date), ...counts(d), d.markCount]),
  );
  sheet(
    "آمار هنرجویان",
    ["کلاس", "کد دانش‌آموزی", "هنرجو", ...countHeaders, "ثبت فعالیت"],
    m.students.map((s) => [
      s.className,
      String(s.code ?? ""),
      s.name,
      ...counts(s),
      s.markCount,
    ]),
  );
  sheet(
    "آمار درس‌ها",
    ["کلاس", "درس", ...countHeaders, "ثبت فعالیت"],
    m.lessons.map((l) => [
      l.className,
      l.lessonName,
      ...counts(l),
      l.markCount,
    ]),
  );
  const attendance = [],
    activities = [],
    sessions = [];
  for (const s of m.sessions) {
    const prefix = [
      date(s.date),
      weekday(s.date),
      s.academicTerm || m.academicTerm || "",
      s.period + 1,
      s.className,
      s.lessonName,
      s.teacher,
      s.moduleName || "",
      s.unitName || "",
    ];
    sessions.push([
      ...prefix,
      ...counts({ ...s.counts, sessions: 1 }).slice(1),
      s.marks.length,
    ]);
    for (const p of s.participants) {
      // Defense in depth: never include another pupil in a parent workbook.
      if (m.audience === "parent" && p.studentId !== m.student?.id) continue;
      attendance.push([
        ...prefix,
        String(p.code ?? ""),
        p.name,
        p.attendance.label,
        p.attendance.minutes,
      ]);
      for (const score of p.scores)
        activities.push([
          ...prefix,
          String(p.code ?? ""),
          p.name,
          score.label,
          score.value,
          score.note,
        ]);
    }
  }
  const contextHeaders = [
    "تاریخ شمسی",
    "روز هفته",
    "ترم",
    "زنگ",
    "کلاس",
    "درس",
    "دبیر",
    "پودمان",
    "واحد کار",
  ];
  sheet(
    "جلسات",
    [...contextHeaders, ...countHeaders.slice(1), "ثبت فعالیت"],
    sessions,
  );
  sheet(
    "حضور و غیاب",
    [...contextHeaders, "کد دانش‌آموزی", "هنرجو", "وضعیت", "دقیقه تأخیر"],
    attendance,
  );
  sheet(
    "فعالیت‌ها",
    [
      ...contextHeaders,
      "کد دانش‌آموزی",
      "هنرجو",
      "نوع فعالیت",
      "نمره یا امتیاز",
      "یادداشت",
    ],
    activities,
  );
  const eligible = (rows) =>
    (rows || []).filter(
      (g) => m.audience !== "parent" || g.studentId === m.student?.id,
    );
  if (m.annualGrades) {
    const rows = [],
      annual = [];
    for (const g of eligible(m.annualGrades)) {
      const identity = [
        g.className,
        String(g.studentCode ?? ""),
        g.studentName,
        g.lessonName,
        g.general ? "عمومی" : "کاردانش",
      ];
      for (const c of g.components)
        rows.push([
          ...identity,
          c.term,
          c.stage === "midterm" ? "میان‌ترم" : "پایان‌ترم",
          c.practical,
          c.theory,
          g.general ? null : c.practicalWeight,
          g.general ? null : 100 - c.practicalWeight,
          safe(c),
          result(c),
        ]);
      annual.push([...identity, ...g.components.map(safe), safe(g), result(g)]);
    }
    const identityHeaders = [
      "کلاس",
      "کد دانش‌آموزی",
      "هنرجو",
      "درس",
      "نوع درس",
    ];
    sheet(
      "امتحانات چهار مرحله",
      [
        ...identityHeaders,
        "ترم",
        "مرحله",
        "عملی",
        "نظری",
        "وزن عملی (%)",
        "وزن نظری (%)",
        "نمره مرحله",
        "وضعیت",
      ],
      rows,
    );
    sheet(
      "نتیجه سالانه",
      [
        ...identityHeaders,
        "میان‌ترم اول",
        "پایان‌ترم اول",
        "میان‌ترم دوم",
        "پایان‌ترم دوم",
        "میانگین چهار مرحله",
        "وضعیت",
      ],
      annual,
    );
  }
  if (m.technicalGrades?.length) {
    const totals = [],
      modules = [],
      units = [];
    for (const g of eligible(m.technicalGrades)) {
      const identity = [
        g.className,
        String(g.studentCode ?? ""),
        g.studentName,
        g.lessonName,
        g.term,
        g.method === "legacy-unit"
          ? "روش قدیمی واحد کار؛ غیررسمی"
          : "پودمانی سالانه",
      ];
      totals.push([...identity, safe(g), result(g), g.provisionalAverage]);
      for (const p of g.modules || [])
        modules.push([
          ...identity,
          p.name,
          safe(p),
          result(p),
          p.reason,
          p.continuous,
          p.competency,
        ]);
      for (const u of g.units || []) {
        const unitIdentity = [...identity];
        unitIdentity[4] = u.term || g.term;
        units.push([
          ...unitIdentity,
          u.moduleName,
          u.unitName,
          u.mostamar,
          u.payani,
          null,
        ]);
      }
      for (const u of g.legacyUnits || [])
        units.push([
          ...identity,
          u.moduleName,
          u.unitName,
          u.mostamar,
          u.payani,
          u.final,
        ]);
    }
    const headers = ["کلاس", "کد دانش‌آموزی", "هنرجو", "درس", "نوبت", "روش"];
    sheet(
      "نتیجه فنی",
      [...headers, "نمره درس", "وضعیت", "میانگین موقت روش قدیمی"],
      totals,
    );
    sheet(
      "پودمان‌ها",
      [
        ...headers,
        "پودمان",
        "نمره",
        "وضعیت",
        "توضیح",
        "مستمر پودمان",
        "شایستگی",
      ],
      modules,
    );
    if (units.length)
      sheet(
        "واحدهای کار",
        [...headers, "پودمان", "واحد کار", "مستمر", "پایانی", "نمره ترکیبی"],
        units,
      );
  }
  const reportTitle = {
    daily: "روزانه",
    weekly: "هفتگی",
    monthly: "ماهانه",
    annual: "سال تحصیلی",
  }[m.mode];
  const schoolScope =
    "فیلتر محدوده — مدرسه: " +
    m.school.name +
    "  |  کلاس: " +
    (m.class?.name || "همه کلاس‌ها") +
    (m.student
      ? "  |  هنرجو: " +
        m.student.name +
        " · کد " +
        (m.student.code || "ثبت‌نشده")
      : "");
  const dateScope =
    "فیلتر زمانی — بازه: " +
    date(m.start) +
    " تا " +
    date(m.end) +
    "  |  سال تحصیلی: " +
    m.academicYear +
    "  |  ترم: " +
    (m.academicTerm || "اول و دوم");
  const audience =
    m.audience === "parent" ? "ویژه اولیا؛ یک هنرجو" : "مدیریت مدرسه";
  for (const item of sheets)
    item.banner = [
      "گزارش " + reportTitle + "  |  " + item.name,
      schoolScope + "  |  " + audience,
      dateScope + "  |  دبیر: " + excelTeacherName(m),
    ];
  const priority = [
    "حضور و غیاب",
    "فعالیت‌ها",
    "نتیجه سالانه",
    "امتحانات چهار مرحله",
    "نتیجه فنی",
    "پودمان‌ها",
    "واحدهای کار",
    "آمار هنرجویان",
    "آمار درس‌ها",
    "جلسات",
    "آمار روزها",
    "خلاصه",
  ];
  return sheets
    .filter((s) => s.name === "خلاصه" || s.rows.length > 1)
    .sort((a, b) => priority.indexOf(a.name) - priority.indexOf(b.name));
}

function excelTeacherName(m) {
  const specified = String(m.author || "").trim();
  if (specified) return specified;
  const teachers = [
    ...new Set(
      (m.sessions || [])
        .map((s) => String(s.teacher || "").trim())
        .filter(Boolean),
    ),
  ];
  return teachers.length === 1
    ? teachers[0]
    : teachers.length
      ? "چند دبیر"
      : "نام دبیر ثبت نشده";
}

function excelReportFilename(m) {
  const teacher = Array.from(excelTeacherName(m), (c) =>
    c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? "-" : c,
  )
    .join("")
    .slice(0, 70)
    .replace(/[. ]+$/g, "");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Tehran",
    })
      .formatToParts(new Date(m.generatedAt))
      .map((p) => [p.type, p.value]),
  );
  const stamp =
    parts.year +
    "-" +
    parts.month +
    "-" +
    parts.day +
    "_" +
    parts.hour +
    "-" +
    parts.minute +
    "-" +
    parts.second;
  const type = {
    daily: "روزانه",
    weekly: "هفتگی",
    monthly: "ماهانه",
    annual: "سالانه",
  }[m.mode];
  return teacher + "_" + stamp + "_گزارش-" + type + ".xlsx";
}
