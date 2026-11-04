// Pure class/student grade export. The report domain owns every calculation.
function karnamehExcelSheets({
  parts = [],
  schoolId,
  classroom,
  studentId = "",
  year,
  generatedAt,
} = {}) {
  if (!year || !schoolId || !classroom?.id)
    throw Error("برای دریافت اکسل، سال تحصیلی، مدرسه و کلاس را انتخاب کنید.");
  const scoped = parts.filter(
    (part) =>
      part.period?.year === year && ["اول", "دوم"].includes(part.period.term),
  );
  if (new Set(scoped.map((part) => part.period.term)).size !== scoped.length)
    throw Error("اطلاعات نوبت‌های سال تکراری است؛ کارنامه را دوباره باز کنید.");
  const locate = (part) =>
      part.data.schools.find((school) => school.id === schoolId),
    school = scoped
      .map(locate)
      .find((item) => item?.classes.some((c) => c.id === classroom.id));
  if (!school) throw Error("کلاس در مدرسه و سال تحصیلی انتخاب‌شده موجود نیست.");
  const prepared = new Date(generatedAt);
  if (!Number.isFinite(prepared.getTime()))
    throw Error("زمان تهیهٔ اکسل معتبر نیست.");
  const students = karnamehReportStudents(classroom).filter(
    (student) => !studentId || student.id === studentId,
  );
  if (studentId && !students.length)
    throw Error("هنرجو در کلاس انتخاب‌شده موجود نیست.");
  assertAnnualLessonCompatibility(scoped, schoolId, classroom.id);
  const lessons = karnamehLessons(scoped, schoolId, classroom),
    teachers = [
      ...new Set(
        lessons
          .map((lesson) => String(lesson.teacher || "").trim())
          .filter(Boolean),
      ),
    ],
    active = new Set(classroom.students.map((student) => student.id)),
    member = (student) => (active.has(student.id) ? "فعال" : "بایگانی"),
    finite = (value) =>
      typeof value === "number" && Number.isFinite(value) ? value : null,
    result = (value) => {
      if (value?.complete !== true || finite(value.final) === null) return null;
      // Normal grades stay numeric. Preserve the shared report's explicit text
      // only when two-decimal Excel formatting would disguise a failed threshold.
      const display = finalText(value);
      return display === value.final.toFixed(2) ? value.final : display;
    },
    status = (value) =>
      value?.complete !== true
        ? "ناقص"
        : value.passed === false
          ? "نیازمند جبران"
          : value.passed === true
            ? "قبول"
            : "تکمیل",
    identity = (student, lesson) => [
      String(student.code ?? ""),
      student.name,
      member(student),
      lesson.name,
      String(lesson.teacher || ""),
    ],
    preparedAt = new Intl.DateTimeFormat("fa-IR", {
      calendar: "persian",
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tehran",
    }).format(prepared),
    scope = studentId
      ? "هنرجو: " + students[0].name + " · کد " + String(students[0].code ?? "")
      : "تمام هنرجویان کلاس؛ فعال و بایگانی",
    banner = [
      "کارنامهٔ نمرات · " + classroom.name,
      "مدرسه: " + school.name + " | سال تحصیلی: " + year,
      "محدوده: " + scope,
      "تهیه‌شده در " +
        preparedAt +
        " | دبیر: " +
        (teachers.join("، ") || "ثبت‌نشده"),
    ],
    sheets = [],
    sheet = (name, headers, rows, widths) => {
      sheets.push({
        name,
        rows: [headers, ...rows],
        widths,
        banner: [...banner],
      });
    };
  sheet(
    "مشخصات و راهنما",
    ["عنوان", "مقدار"],
    [
      [
        "نوع گزارش",
        "کارنامهٔ نمرات سال تحصیلی؛ چهار مرحلهٔ امتحان و نمرات پودمان",
      ],
      ["مدرسه", school.name],
      ["کلاس", classroom.name],
      ["سال تحصیلی", String(year)],
      ["محدوده", scope],
      ["تعداد هنرجویان انتخاب‌شده", students.length],
      [
        "نوبت اول",
        scoped.some((part) => part.period.term === "اول")
          ? "موجود"
          : "موجود نیست؛ نمرات این نوبت خالی‌اند",
      ],
      [
        "نوبت دوم",
        scoped.some((part) => part.period.term === "دوم")
          ? "موجود"
          : "موجود نیست؛ نمرات این نوبت خالی‌اند",
      ],
      ["دبیر", teachers.join("، ") || "ثبت‌نشده"],
      ["زمان تهیه (شمسی)", preparedAt],
      [
        "ترتیب هنرجویان",
        "ترتیب ثبت در کلاس؛ پس از هنرجویان فعال، سوابق بایگانی با وضعیت مشخص آمده‌اند.",
      ],
      [
        "نمرات کاردانش",
        "هر مرحله مستقل از عملی و نظری با ضرایب همان درس محاسبه می‌شود؛ نمرهٔ سالانه در این خروجی وجود ندارد.",
      ],
      [
        "نمرات عمومی",
        "چهار نمرهٔ مستقیم؛ نمرهٔ عملی یا میانگین ساختگی اضافه نشده است.",
      ],
      [
        "نمرات پودمانی",
        "نمرهٔ رسمی هر پودمان از مستمر و شایستگی همان پودمان محاسبه می‌شود؛ نوبت‌ها نمرهٔ مستقل برای یک پودمان رسمی ندارند.",
      ],
      [
        "جزئیات واحد کار",
        "واحدهای پودمانی فقط ورودی‌های گروهی ثبت‌شدهٔ هر نوبت را نشان می‌دهند و نمرهٔ ترکیبی ندارند؛ سوابق واحدی قدیمی از همان محاسبهٔ کارنامه، شامل اولویت ثبت گروهی بر جلسه، خوانده می‌شوند.",
      ],
      [
        "راهنما",
        "سلول خالی یعنی ثبت‌نشده، ناقص یا نامرتبط؛ صفر نمرهٔ واقعی است. این فایل گزارش است و برای بازیابی سیستم نیست.",
      ],
    ],
    [34, 100],
  );
  sheets[0].filter = false;
  const headers = ["کد هنرجو", "هنرجو", "وضعیت عضویت", "درس", "دبیر"],
    widths = [17, 27, 17, 35, 24],
    stages = [
      { term: "اول", stage: "midterm", label: "میان‌ترم اول" },
      { term: "اول", stage: "final", label: "پایان‌ترم اول" },
      { term: "دوم", stage: "midterm", label: "میان‌ترم دوم" },
      { term: "دوم", stage: "final", label: "پایان‌ترم دوم" },
    ],
    academic = new Map(
      annualGradeRows(scoped, schoolId, classroom.id, studentId).map((row) => [
        JSON.stringify([row.studentId, row.lessonId]),
        row,
      ]),
    ),
    vocational = [],
    general = [],
    modular = [],
    units = [],
    legacy = [];
  const legacyIds = new Set(
      lessons
        .filter(
          (lesson) =>
            lesson.gradeMode !== "kardanesh" &&
            lesson.gradingPolicy?.method !== "modular",
        )
        .map((lesson) => lesson.id),
    ),
    legacyRows = legacyIds.size
      ? annualTechnicalRows(scoped, schoolId, classroom.id, studentId).filter(
          (row) => legacyIds.has(row.lessonId),
        )
      : [];
  for (const student of students) {
    for (const lesson of lessons) {
      const prefix = identity(student, lesson);
      if (lesson.gradeMode === "kardanesh") {
        const row = academic.get(JSON.stringify([student.id, lesson.id])),
          isGeneral = lesson.gradingPolicy?.subjectType === "general",
          components = stages.flatMap((stage) => {
            const value = row?.components.find(
              (item) => item.term === stage.term && item.stage === stage.stage,
            );
            return isGeneral
              ? [finite(value?.theory)]
              : [
                  finite(value?.practical),
                  finite(value?.theory),
                  result(value),
                ];
          });
        if (isGeneral) general.push([...prefix, ...components]);
        else {
          const weights = assessmentWeights(lesson);
          vocational.push([
            ...prefix,
            weights.practical,
            weights.theory,
            ...components,
          ]);
        }
      } else if (lesson.gradingPolicy?.method === "modular") {
        const merged = annualModularLesson(
            scoped,
            schoolId,
            classroom.id,
            lesson,
            student.id,
          ),
          grade = EduReportGrades.modular(merged, student.id);
        for (const pod of lesson.poudmans) {
          const raw = ownScoreRecord(
              merged.poudmans.find((item) => item.id === pod.id)?.podScores,
              student.id,
            ),
            value = grade.modules.find((item) => item.id === pod.id);
          modular.push([
            ...prefix,
            pod.name,
            finite(raw.m),
            finite(raw.c),
            result(value),
            status(value),
          ]);
        }
        for (const term of ["اول", "دوم"]) {
          const part = scoped.find((item) => item.period.term === term),
            course =
              part &&
              locate(part)
                ?.classes.find((item) => item.id === classroom.id)
                ?.lessons.find((item) => item.id === lesson.id);
          for (const pod of course?.poudmans || [])
            for (const unit of pod.units || []) {
              const raw = ownScoreRecord(unit.unitScores, student.id),
                m = finite(raw.m),
                p = finite(raw.p);
              if (m !== null || p !== null)
                units.push([...prefix, term, pod.name, unit.name, m, p]);
            }
        }
      } else {
        for (const term of ["اول", "دوم"]) {
          const row = legacyRows.find(
            (item) =>
              item.studentId === student.id &&
              item.lessonId === lesson.id &&
              item.term === term,
          );
          if (row)
            for (const unit of row.legacyUnits?.length
              ? row.legacyUnits
              : [null])
              legacy.push([
                ...prefix,
                term,
                unit?.moduleName || "",
                unit?.unitName || "",
                finite(unit?.mostamar),
                finite(unit?.payani),
                finite(unit?.final),
                result(row),
                status(row),
              ]);
        }
      }
    }
  }
  if (vocational.length)
    sheet(
      "کاردانش",
      [
        ...headers,
        "سهم عملی (%)",
        "سهم نظری (%)",
        ...stages.flatMap((stage) => [
          stage.label + " · عملی",
          stage.label + " · نظری",
          stage.label + " · نتیجه",
        ]),
      ],
      vocational,
      [...widths, 17, 17, ...Array(12).fill(22)],
    );
  if (general.length)
    sheet(
      "عمومی",
      [...headers, ...stages.map((stage) => stage.label + " · نمره")],
      general,
      [...widths, ...Array(4).fill(24)],
    );
  if (modular.length)
    sheet(
      "پودمانی",
      [
        ...headers,
        "پودمان",
        "مستمر پودمان",
        "شایستگی",
        "نتیجه پودمان",
        "وضعیت پودمان",
      ],
      modular,
      [...widths, 32, 19, 16, 19, 23],
    );
  if (units.length)
    sheet(
      "جزئیات واحد کار",
      [...headers, "نوبت", "پودمان", "واحد کار", "مستمر واحد", "پایانی واحد"],
      units,
      [...widths, 14, 28, 30, 19, 19],
    );
  if (legacy.length)
    sheet(
      "سوابق واحدی",
      [
        ...headers,
        "نوبت",
        "پودمان",
        "واحد کار",
        "مستمر",
        "پایانی",
        "نتیجه واحد",
        "نتیجه درس در نوبت",
        "وضعیت درس در نوبت",
      ],
      legacy,
      [...widths, 14, 28, 30, 18, 18, 20, 23, 23],
    );
  return [...sheets.slice(1), sheets[0]];
}
