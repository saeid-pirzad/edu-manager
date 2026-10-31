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
  const singleDay = m.start === m.end;
  const lines = [
    "📋 گزارش پیگیری معاون",
    "🏫 " + m.school.name,
    "📅 " +
      (singleDay ? faDate(m.start) : faDate(m.start) + " تا " + faDate(m.end)),
  ];
  if (m.student) lines.push("هنرجو: " + m.student.name);
  const groups = new Map();
  for (const session of [...m.sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.period - b.period,
  )) {
    const key = session.classId || session.className;
    if (!groups.has(key))
      groups.set(key, { name: session.className, sessions: [] });
    groups.get(key).sessions.push(session);
  }
  lines.push(num(m.sessions.length) + " جلسه · " + num(groups.size) + " کلاس");
  const commonTeacher = m.sessions[0]?.teacher;
  const sharedTeacher =
    commonTeacher &&
    m.sessions.every((session) => session.teacher === commonTeacher);
  if (sharedTeacher) lines.push("دبیر: " + commonTeacher);
  const pendingSessions = m.sessions.filter((session) =>
    session.participants.some((p) => p.attendance.status === "unknown"),
  ).length;
  if (pendingSessions)
    lines.push("⏳ حضور ناتمام: " + num(pendingSessions) + " جلسه");
  if (m.sessions.length) lines.push("آمار حضور برحسب نفرـجلسه");
  let classNumber = 0;
  for (const group of groups.values()) {
    lines.push("", "━━━━━━━━━━━━", num(++classNumber) + ". 🎓 " + group.name);
    const counts = { present: 0, absent: 0, late: 0, leave: 0, unknown: 0 };
    const markCounts = new Map(),
      teachers = new Set();
    for (const session of group.sessions) {
      if (session.teacher) teachers.add(session.teacher);
      for (const participant of session.participants)
        counts[participant.attendance.status]++;
      for (const mark of session.marks) {
        const label = mark.label || "فعالیت";
        markCounts.set(label, (markCounts.get(label) || 0) + 1);
      }
    }
    if (teachers.size && !sharedTeacher)
      lines.push("دبیر: " + [...teachers].join("، "));
    lines.push(
      num(group.sessions.length) +
        " جلسه | " +
        [
          ["present", "حاضر"],
          ["absent", "غایب"],
          ["late", "تأخیر"],
          ["leave", "مرخصی"],
        ]
          .filter(([key]) => counts[key] > 0)
          .map(([key, label]) => label + " " + num(counts[key]))
          .join(" · ") +
        (counts.present + counts.absent + counts.late + counts.leave === 0
          ? counts.unknown
            ? "حضور تکمیل نشده"
            : "بدون رکورد حضور"
          : ""),
    );
    let needsFollowup = false;
    let displayedDate = "";
    for (const session of group.sessions) {
      const details = [];
      for (const [status, label] of [
        ["absent", "🔴 غایب"],
        ["late", "🟠 تأخیر"],
        ["leave", "🟣 مرخصی"],
      ]) {
        const students = session.participants.filter(
          (p) => p.attendance.status === status,
        );
        if (students.length)
          details.push(
            label +
              " (" +
              num(students.length) +
              "): " +
              students
                .map(
                  (p) =>
                    p.name +
                    (status === "late" && p.attendance.minutes !== null
                      ? " (" + num(p.attendance.minutes) + " دقیقه)"
                      : ""),
                )
                .join("، "),
          );
      }
      const unknown = session.participants.filter(
        (p) => p.attendance.status === "unknown",
      ).length;
      if (unknown) details.push("⚪ حضور تکمیل‌نشده: " + num(unknown) + " نفر");
      if (details.length) {
        needsFollowup = true;
        if (!singleDay && displayedDate !== session.date) {
          lines.push("", "📅 تاریخ: " + faDate(session.date));
          displayedDate = session.date;
        }
        lines.push(
          "",
          "زنگ " + num(session.period + 1) + " | " + session.lessonName,
          ...details,
        );
      }
    }
    if (!needsFollowup)
      lines.push(
        counts.present > 0 &&
          group.sessions.every((session) => session.participants.length > 0)
          ? "✅ حضور کامل؛ بدون غیبت، تأخیر یا مرخصی."
          : "⚪ فهرست حضور بعضی جلسه‌ها خالی است؛ بررسی شود.",
      );
    if (markCounts.size)
      lines.push(
        "",
        "📝 ثبت‌های کلاسی: " +
          [...markCounts]
            .map(([label, count]) => num(count) + " " + label)
            .join(" · "),
      );
  }
  if (!m.sessions.length) lines.push("", "در این بازه جلسه‌ای ثبت نشده است.");
  if (m.summary.unknown > 0)
    lines.push("", "⚠️ حضور تکمیل‌نشده به معنی غیبت نیست.");
  if (m.summary.leave > 0) lines.push("مرخصی جدا از غیبت محاسبه شده است.");
  if (m.note) lines.push("", "💬 توضیحات: " + m.note);
  if (m.author) lines.push("", "تنظیم‌کننده: " + m.author);
  return lines.join("\n");
}
