async function add(e) {
  e.preventDefault();
  const opened = await open("", {
    id: api.uid(),
    name: e.target.name.value.trim(),
    teacher: e.target.teacher.value.trim(),
    periodsPerWeek: Number(api.asciiDigits(e.target.periods.value)),
    gradeMode:
      e.target.gradeMode.value === "general"
        ? "kardanesh"
        : e.target.gradeMode.value,
    ...(e.target.gradeMode.value === "general"
      ? {
          gradingPolicy: {
            ...P.defaults("dual", api.year()),
            subjectType: "general",
          },
        }
      : {}),
    kardaneshScores: {},
    poudmans: [],
  });
  if (opened !== false) await save();
}
async function copy(lid) {
  writable();
  await api.flushDrafts({ strict: true });
  const c = currentClass(),
    l = c.lessons.find((l) => l.id === lid);
  if (!l) return;
  const next = P.freshCopy(l, api.uid(), api.year(), api.uid);
  next.name = l.name + " (کپی)";
  if (!next.gradingPolicy)
    next.gradingPolicy = P.defaults(
      l.gradeMode === "kardanesh" ? "dual" : "modular",
      api.year(),
    );
  Object.assign(next.gradingPolicy, P.identity(next, api.year()));
  await open("", next);
}
async function gate(lid, pid, sid, value) {
  writable();
  if (!["", "yes", "no"].includes(value))
    throw Error("وضعیت معیار نامعتبر است.");
  const requested = {
    workspace: api.context().id,
    classId: api.state().classId,
  };
  await api.flushDrafts({ strict: true });
  writable();
  if (
    requested.workspace !== api.context().id ||
    requested.classId !== api.state().classId
  )
    throw Error(
      "دوره یا کلاس هنگام ذخیره معیار تغییر کرد؛ دوباره جدول را باز کنید.",
    );
  const c = currentClass(),
    l = c.lessons.find((l) => l.id === lid),
    p = l?.poudmans.find((p) => p.id === pid);
  if (
    !p ||
    !c.students.some((s) => s.id === sid) ||
    !l.gradingPolicy?.requireGate
  )
    throw Error("معیار نامعتبر است.");
  p.podScores = p.podScores || {};
  const g = writableScoreRecord(p.podScores, sid);
  if (value === "") delete g.gate;
  else if (["yes", "no"].includes(value)) g.gate = value === "yes";
  p.podScores[sid] = g;
  const inModal = !!document.querySelector(
    "#modal:not(.hidden) [data-course-gate]",
  );
  await api.saveDB({
    classId: c.id,
    action: "تأیید معیارهای الزامی پودمان",
  });
  api.render();
  if (inModal)
    api.showModal("ثبت نمرات براساس قواعد درس", table(c, l, null, true));
}
