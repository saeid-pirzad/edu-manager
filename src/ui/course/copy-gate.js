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
function preserveCourseAction(message) {
  // Saving drafts may advance the revision and redraw the same page. Preserve
  // its actual data/installation and selection instead of a DOM or revision lease.
  const requested = { ...api.context() },
    selection = { ...api.state() },
    identity = api.actionContext(),
    year = api.year();
  return () => {
    writable();
    const context = api.context(),
      current = api.actionContext(),
      state = api.state();
    if (
      requested.id !== context.id ||
      requested.closed !== context.closed ||
      year !== api.year() ||
      Object.keys(identity).some((key) => identity[key] !== current[key]) ||
      ["view", "tab", "schoolId", "classId", "lessonId"].some(
        (key) => selection[key] !== state[key],
      )
    )
      throw Error(message);
  };
}
async function copy(lid) {
  writable();
  const assertCurrent = preserveCourseAction(
    "ترم یا کلاس هنگام آماده‌سازی کپی تغییر کرد؛ دوباره درس را انتخاب کنید.",
  );
  await api.flushDrafts({ strict: true });
  assertCurrent();
  const c = currentClass(),
    l = c?.lessons.find((l) => l.id === lid);
  if (!l) return;
  const next = P.freshCopy(l, api.uid(), api.year(), api.uid);
  next.name = l.name + " (کپی)";
  if (!next.gradingPolicy)
    next.gradingPolicy = P.defaults(
      l.gradeMode === "kardanesh" ? "dual" : "modular",
      api.year(),
    );
  Object.assign(next.gradingPolicy, P.identity(next, api.year()));
  await open("", next, { assertCurrent });
}
async function gate(lid, pid, sid, value) {
  writable();
  if (!["", "yes", "no"].includes(value))
    throw Error("وضعیت معیار نامعتبر است.");
  const assertCurrent = preserveCourseAction(
    "ترم یا کلاس هنگام ذخیره معیار تغییر کرد؛ دوباره جدول را باز کنید.",
  );
  await api.flushDrafts({ strict: true });
  assertCurrent();
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
  assertCurrent();
  api.render();
  if (inModal)
    api.showModal("ثبت نمرات براساس قواعد درس", table(c, l, null, true));
}
