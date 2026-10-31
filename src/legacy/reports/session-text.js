function generateSessionReportText(session, c, lesson) {
  const present = [],
    absent = [],
    leave = [],
    late = [],
    pos = [],
    neg = [],
    hw = [];
  sessionStudents(c, session).forEach((s) => {
    const st = session.attendance[s.id];
    if (st === "present") present.push(s.name);
    else if (st === "leave") leave.push(s.name);
    else if (st === "absent") absent.push(s.name);
    else if (st && st.startsWith("late")) {
      const mins = st.includes(":") ? st.split(":")[1] : "0";
      late.push(`${s.name} (${mins} دقیقه)`);
    }
  });
  session.scores.forEach((sc) => {
    const s = sessionStudent(c, session, sc.studentId);
    if (!s) return;
    if (sc.type === "positive") pos.push(`${s.name} (${sc.value})`);
    else if (sc.type === "negative") neg.push(`${s.name} (${sc.value})`);
    else if (sc.type === "homework")
      hw.push(`${s.name} (${sc.note || "ثبت شد"})`);
  });
  const poudman = lesson.poudmans.find((p) => p.id === session.poudmanId);
  const unit = poudman
    ? poudman.units.find((u) => u.id === session.unitId)
    : null;
  let text = `📅 تاریخ: ${faDate(session.date)} | زنگ ${session.period + 1}\n`;
  text += `📚 کلاس: ${c.name} | درس: ${lesson.name} | دبیر: ${lesson.teacher || "---"}\n`;
  if (poudman)
    text += `📍 پودمان: ${poudman.name} | ${unit ? unit.name : ""}\n`;
  text += `\nمرخصی (${leave.length} نفر): ${leave.length ? leave.join("، ") : "---"}\n👥 وضعیت حضور:\n✅ حاضر (${present.length} نفر): ${present.length ? present.join("، ") : "---"}\n❌ غایب (${absent.length} نفر): ${absent.length ? absent.join("، ") : "---"}\n⏰ تأخیر (${late.length} نفر): ${late.length ? late.join("، ") : "---"}\n`;
  if (pos.length || neg.length || hw.length) {
    text += `\n📝 موارد ثبت شده:\n`;
    if (pos.length) text += `➕ مثبت (${pos.length}): ${pos.join("، ")}\n`;
    if (neg.length) text += `➖ منفی (${neg.length}): ${neg.join("، ")}\n`;
    if (hw.length) text += `📋 تکلیف (${hw.length}): ${hw.join("، ")}\n`;
  }
  const marks = session.scores.filter((score) =>
    ["classGrade", "activity", "mostamar", "payani"].includes(score.type),
  );
  if (marks.length)
    text +=
      "\nنمرات و امتیازهای ثبت‌شده:\n" +
      marks
        .map((score) => {
          const student = sessionStudent(c, session, score.studentId);
          return (
            (student?.name || "هنرجوی نامشخص") +
            " · " +
            TYPE_LABELS[score.type] +
            ": " +
            score.value +
            (score.note ? " · " + score.note : "")
          );
        })
        .join("\n") +
      "\n";
  return text;
}
