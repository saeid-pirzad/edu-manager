async function add(e) {
  e.preventDefault();
  await open("", {
    id: api.uid(),
    name: e.target.name.value.trim(),
    teacher: e.target.teacher.value.trim(),
    periodsPerWeek: Number(e.target.periods.value) || 2,
    gradeMode: e.target.gradeMode.value,
    kardaneshScores: {},
    poudmans: [],
  });
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
  await api.saveDB({
    classId: c.id,
    action: "تأیید معیارهای الزامی پودمان",
  });
  api.render();
  api.showModal("ثبت نمرات براساس قواعد درس", table(c, l, null, true));
}
