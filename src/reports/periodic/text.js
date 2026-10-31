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
      num((m.summary.present || 0) + (m.summary.late || 0)) +
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
  if (m.audience === "management") {
    lines.push("", "وضعیت هنرجویان");
    for (const st of m.students)
      lines.push(
        st.name +
          " / " +
          st.className +
          ": حاضر " +
          num((st.present || 0) + (st.late || 0)) +
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
        (s.academicTerm ? " | نوبت " + s.academicTerm : "") +
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
    lines.push("", "نمرات چهار مرحله سال — میانگین برابر چهار مرحله");
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
  const sessions = [...m.sessions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.period - b.period ||
      String(a.className || "").localeCompare(String(b.className || ""), "fa"),
  );
  const statuses = [
    ["present", "حاضر"],
    ["absent", "غایب"],
    ["late", "تأخیر"],
    ["leave", "مرخصی"],
    ["unknown", "تعیین‌نشده"],
  ];
  const colors = {
    present: "🟢",
    absent: "🔴",
    late: "🟠",
    leave: "🟣",
    unknown: "⚪",
  };
  const groups = sessions.map((session) => {
    const people = Object.fromEntries(statuses.map(([key]) => [key, []]));
    for (const person of session.participants) {
      const status = Object.hasOwn(people, person.attendance.status)
        ? person.attendance.status
        : "unknown";
      people[status].push(person);
    }
    return { session, people };
  });
  const lines = [
    "📋 گزارش کلی برای معاون",
    "مدرسه: " + m.school.name,
    "بازه: " + faDate(m.start) + " تا " + faDate(m.end),
    "سال تحصیلی: " + (m.academicYear || "—"),
  ];
  if (m.student) lines.push("هنرجو: " + m.student.name);
  for (const [index, { session, people }] of groups.entries()) {
    lines.push(
      "",
      ...(index > 0 ? ["──────────"] : []),
      "تاریخ: " + faDate(session.date) + " | زنگ " + num(session.period + 1),
      ...(session.academicTerm ? ["نوبت: " + session.academicTerm] : []),
      "کلاس: " + session.className + " | درس: " + session.lessonName,
      "دبیر: " + (session.teacher || "—"),
      "",
      colors.present +
        " حاضر: " +
        num(people.present.length + people.late.length) +
        " نفر",
    );
    for (const [status, label] of statuses.slice(1)) {
      const names = people[status].map(
        (person) =>
          person.name +
          (status === "late" && person.attendance.minutes != null
            ? " (" + num(person.attendance.minutes) + " دقیقه)"
            : ""),
      );
      lines.push(
        colors[status] +
          " " +
          label +
          " (" +
          num(names.length) +
          "): " +
          (names.join("، ") || "—"),
      );
    }
    if (!session.participants.length)
      lines.push("⚠️ فهرست حضور این جلسه خالی است؛ بررسی شود.");
  }
  if (!sessions.length) lines.push("", "در این بازه جلسه‌ای ثبت نشده است.");
  lines.push(
    "",
    "تأخیر جزو حاضرین است؛ مرخصی جدا از غیبت است؛ تعیین‌نشده به معنی غیبت نیست.",
  );
  if (m.note) lines.push("", "توضیحات: " + m.note);
  if (m.author) lines.push("تنظیم‌کننده: " + m.author);
  return lines.join("\n");
}

function deputyReportHTML(text) {
  const lines = text
    .split("\n")
    .map((line) =>
      esc(line).replace(
        /^((?:🟢|🔴|🟠|🟣|⚪) )(حاضر|غایب|تأخیر|مرخصی|تعیین‌نشده)(?=[: (])/,
        "$1<strong>$2</strong>",
      ),
    );
  return '<div dir="rtl">' + lines.join("<br>") + "</div>";
}
