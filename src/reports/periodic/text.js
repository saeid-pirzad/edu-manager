const num = (value) =>
  value === null || value === undefined
    ? "—"
    : Number(value).toLocaleString("fa-IR", {
        maximumFractionDigits: 2,
      });
function table(headers, rows, kind = "") {
  return (
    '<div class="table-scroll"><table' +
    (kind ? ' class="' + esc(kind) + '"' : "") +
    "><thead><tr>" +
    headers.map((x) => "<th>" + esc(x) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows
      .map(
        (row) =>
          "<tr>" +
          row.map((cell) => "<td>" + esc(cell) + "</td>").join("") +
          "</tr>",
      )
      .join("") +
    "</tbody></table></div>"
  );
}
function reportParticipants(model, session) {
  return model.audience === "management" && model.detailLevel === "summary"
    ? session.participants.filter((participant) => participant.scores.length)
    : session.participants;
}
const displayedDays = (m) =>
  ["monthly", "annual"].includes(m.mode) && m.detailLevel === "summary"
    ? m.days.filter((day) => day.sessions > 0)
    : m.days;
function textReport(m) {
  const lines = [
    "گزارش " +
      modeLabel(m.mode) +
      " — " +
      (m.audience === "parent" ? "ویژه اولیا" : "ویژه مدیریت مدرسه"),
    "مدرسه: " + m.school.name,
    "بازه: " + faDate(m.start) + " تا " + faDate(m.end),
    "سال تحصیلی: " + m.academicYear,
  ];
  if (m.audience === "management" && m.detailLevel === "summary")
    lines.push(
      "نمایش خلاصه مدیریتی: آمار همه هنرجویان و تمام ثبت‌های فعالیت؛ ریز حضور هر جلسه در نمایش کامل و فایل JSON موجود است.",
    );
  if (m.class) lines.push("کلاس: " + m.class.name);
  if (m.student)
    lines.push(
      "هنرجو: " + m.student.name + " | کد: " + (m.student.code || "ثبت نشده"),
    );
  lines.push(
    "زمان تهیه: " + new Date(m.generatedAt).toLocaleString("fa-IR"),
    "",
    "خلاصه",
    "جلسات ثبت‌شده: " + num(m.summary.sessions),
    "حاضر: " +
      num(m.summary.present) +
      " | غایب: " +
      num(m.summary.absent) +
      " | مرخصی: " +
      num(m.summary.leave) +
      " | تأخیر: " +
      num(m.summary.late) +
      " | تعیین‌نشده: " +
      num(m.summary.unknown) +
      " (نفرـجلسه)",
    "نرخ حضور از موارد تعیین‌شده، به‌جز مرخصی: " +
      (m.summary.attendanceRate === null
        ? "قابل محاسبه نیست"
        : num(m.summary.attendanceRate) + "٪"),
    "تعداد ثبت‌های نمره، تکلیف و فعالیت: " + num(m.summary.recordedMarks),
    "",
  );
  if (!m.sessions.length)
    lines.push("در این بازه و محدوده، جلسه مرتبطی ثبت نشده است.");
  for (const d of displayedDays(m))
    lines.push(
      faDate(d.date) +
        ": " +
        num(d.sessions) +
        " جلسه؛ حاضر " +
        num(d.present) +
        "، غایب " +
        num(d.absent) +
        " | مرخصی: " +
        num(d.leave) +
        "، تأخیر " +
        num(d.late) +
        "، تعیین‌نشده " +
        num(d.unknown),
    );
  if (m.audience === "management") {
    lines.push("", "جمع‌بندی درس‌ها");
    for (const l of m.lessons)
      lines.push(
        l.className +
          " / " +
          l.lessonName +
          ": " +
          num(l.sessions) +
          " جلسه؛ حاضر " +
          num(l.present) +
          "، غایب " +
          num(l.absent) +
          " | مرخصی: " +
          num(l.leave) +
          "، تأخیر " +
          num(l.late) +
          "، تعیین‌نشده " +
          num(l.unknown),
      );
    lines.push("", "وضعیت هنرجویان");
    for (const st of m.students)
      lines.push(
        st.name +
          " / " +
          st.className +
          ": حاضر " +
          num(st.present) +
          "، غایب " +
          num(st.absent) +
          " | مرخصی: " +
          num(st.leave) +
          "، تأخیر " +
          num(st.late) +
          "، تعیین‌نشده " +
          num(st.unknown),
      );
  }
  lines.push("", "جزئیات جلسات");
  for (const s of m.sessions) {
    lines.push(
      "",
      faDate(s.date) +
        " | زنگ " +
        num(s.period + 1) +
        " | " +
        s.className +
        " | " +
        s.lessonName +
        (s.moduleName ? " | پودمان: " + s.moduleName : "") +
        (s.unitName ? " | واحد: " + s.unitName : "") +
        (s.teacher ? " | دبیر: " + s.teacher : ""),
    );
    for (const p of reportParticipants(m, s))
      lines.push(
        p.name +
          ": " +
          p.attendance.label +
          (p.attendance.minutes === null
            ? ""
            : " (" + num(p.attendance.minutes) + " دقیقه)") +
          (p.scores.length
            ? " | " +
              p.scores
                .map(
                  (sc) =>
                    sc.label +
                    ": " +
                    (sc.value ?? "—") +
                    (sc.note ? " — " + sc.note : ""),
                )
                .join(" | ")
            : " | نمره یا فعالیتی ثبت نشده"),
      );
  }
  if (m.currentGrades.length) {
    lines.push(
      "",
      "آخرین وضعیت تجمعی درس‌ها تا زمان تهیه گزارش؛ محدود به بازه بالا نیست",
    );
    for (const g of m.currentGrades)
      lines.push(
        g.lessonName +
          ": " +
          (g.method === "dual"
            ? "عملی " + num(g.practical) + " | نظری " + num(g.theory) + " | "
            : "") +
          "نهایی " +
          g.final +
          " | " +
          g.status +
          " | " +
          g.policy,
      );
  }
  if (m.currentGrades.some((g) => g.modules?.length)) {
    lines.push("", "جزئیات تجمعی پودمان‌ها تا زمان تهیه گزارش");
    for (const g of m.currentGrades)
      for (const p of g.modules || [])
        lines.push(
          g.lessonName +
            " / " +
            p.name +
            ": مستمر " +
            num(p.continuous) +
            " | شایستگی " +
            num(p.competency) +
            " | نمره پودمان " +
            num(p.final) +
            " | " +
            (p.reason || (p.passed ? "احراز شده" : "نیازمند بررسی")),
        );
  }
  if (m.note) lines.push("", "توضیحات تنظیم‌کننده", m.note);
  if (m.warnings.length) lines.push("", "موارد نیازمند بررسی", ...m.warnings);
  lines.push(
    "",
    "توضیح روش گزارش",
    ...m.definitions,
    "",
    "تنظیم‌کننده: " + (m.author || "........................"),
    "امضا: ........................",
  );
  if (m.technicalGrades?.length) {
    lines.push("", "نمرات فنی — به تفکیک نوبت و پودمان");
    for (const grade of m.technicalGrades) {
      lines.push(
        grade.studentName +
          " | " +
          grade.className +
          " | " +
          grade.lessonName +
          " | نوبت " +
          grade.term,
      );
      lines.push(
        (grade.method === "legacy-unit"
          ? "نتیجه روش قدیمی (پودمان رسمی نیست): "
          : "نتیجه درس: ") +
          root.EduV24.finalText(grade) +
          (grade.complete ? "" : " — ناقص"),
      );
      for (const unit of grade.legacyUnits || [])
        lines.push(
          unit.moduleName +
            " / " +
            unit.unitName +
            ": مستمر " +
            (unit.mostamar ?? "—") +
            "، پایانی " +
            (unit.payani ?? "—") +
            "، ترکیبی " +
            root.EduV24.finalText(unit),
        );
      for (const module of grade.modules)
        lines.push(
          module.name +
            ": " +
            root.EduV24.finalText(module) +
            (module.complete
              ? module.passed
                ? " — قبول"
                : " — نیازمند جبران"
              : " — ناقص"),
        );
    }
  }
  if (m.annualGrades) {
    lines.push("", "نمرات سالانه کاردانش — میانگین برابر چهار مرحله");
    for (const grade of m.annualGrades) {
      lines.push(
        grade.className + " | " + grade.studentName + " | " + grade.lessonName,
      );
      for (const item of grade.components)
        lines.push(
          (item.stage === "midterm" ? "میان‌ترم " : "پایان‌ترم ") +
            item.term +
            (grade.general
              ? ": نمره " + (item.theory ?? "ثبت نشده")
              : ": عملی " +
                (item.practical ?? "ثبت نشده") +
                "، تئوری " +
                (item.theory ?? "ثبت نشده")) +
            "، ترکیبی " +
            root.EduV24.finalText(item),
        );
      lines.push(
        "نهایی سالانه: " +
          root.EduV24.finalText(grade) +
          (grade.complete
            ? grade.general
              ? " — تکمیل"
              : grade.passed
                ? " — قبول"
                : " — نیازمند جبران"
            : " — ناقص؛ هر چهار نمره لازم است"),
      );
    }
  }
  return lines.join("\n");
}

// Uses the prepared report scope; never reads unrelated live classes or students.
function deputyReport(m) {
  const lines = [
    "گزارش کلی برای معاون",
    "مدرسه: " + m.school.name,
    "بازه: " + faDate(m.start) + " تا " + faDate(m.end),
    "سال تحصیلی: " + m.academicYear,
  ];
  if (m.class) lines.push("کلاس: " + m.class.name);
  if (m.student) lines.push("هنرجو: " + m.student.name);
  lines.push(
    "",
    "خلاصه (نفرـجلسه): حاضر " +
      num(m.summary.present) +
      " | غایب " +
      num(m.summary.absent) +
      " | تأخیر " +
      num(m.summary.late) +
      " | مرخصی " +
      num(m.summary.leave) +
      " | تعیین‌نشده " +
      num(m.summary.unknown),
  );
  const sessions = [...m.sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.period - b.period,
  );
  for (const session of sessions) {
    lines.push(
      "",
      "──────────",
      "تاریخ: " + faDate(session.date) + " | زنگ " + num(session.period + 1),
      "کلاس: " +
        session.className +
        " | درس: " +
        session.lessonName +
        " | دبیر: " +
        (session.teacher || "ثبت نشده"),
    );
    if (session.moduleName || session.unitName)
      lines.push(
        [session.moduleName, session.unitName].filter(Boolean).join(" / "),
      );
    for (const [status, label] of [
      ["present", "حاضر"],
      ["absent", "غایب"],
      ["late", "تأخیر"],
      ["leave", "مرخصی"],
      ["unknown", "تعیین‌نشده"],
    ]) {
      const students = session.participants.filter(
        (p) => p.attendance.status === status,
      );
      lines.push(
        label +
          " (" +
          num(students.length) +
          "): " +
          (students
            .map(
              (p) =>
                p.name +
                (p.attendance.minutes !== null
                  ? " (" + num(p.attendance.minutes) + " دقیقه)"
                  : ""),
            )
            .join("، ") || "—"),
      );
    }
    if (session.marks.length) {
      lines.push("ثبت‌های نمره و فعالیت این جلسه:");
      for (const mark of session.marks)
        lines.push(
          mark.name +
            " · " +
            mark.label +
            (mark.value !== null ? ": " + num(mark.value) : "") +
            (mark.note ? " · " + mark.note : ""),
        );
    }
  }
  if (!sessions.length) lines.push("در این بازه جلسه‌ای ثبت نشده است.");
  lines.push(
    "",
    "مرخصی جدا از غیبت است؛ نمرات بالا ثبت‌های جلسه‌اند و نمره نهایی درس نیستند.",
  );
  if (m.note) lines.push("توضیحات: " + m.note);
  if (m.author) lines.push("تنظیم‌کننده: " + m.author);
  return lines.join("\n");
}
