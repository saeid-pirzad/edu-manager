async function save() {
  if (saving) return;
  saving = true;
  const finishSave = beginRecordEditorSave(
    document.querySelector("#modal .record-editor"),
  );
  try {
    writable();
    if (!document.querySelector("#modal:not(.hidden) #course_name"))
      throw Error("فرم درس باز نیست.");
    if (
      !editing ||
      editing.context.id !== api.context().id ||
      editing.context.revision !== api.context().revision
    )
      throw Error(
        "اطلاعات از زمان باز شدن فرم تغییر کرده است؛ فرم را دوباره باز کنید.",
      );
    await api.flushDrafts({ strict: true });
    writable();
    if (
      !editing ||
      editing.context.id !== api.context().id ||
      editing.context.revision !== api.context().revision
    )
      throw Error("دوره یا اطلاعات تغییر کرده است؛ فرم را دوباره باز کنید.");
    const c = api.findClass(editing.classId),
      original = c?.lessons.find((l) => l.id === editing.id),
      next = structuredClone(original || editing.seed);
    if (!c || (editing.id && !original))
      throw Error("درس مقصد دیگر وجود ندارد.");
    const name = val("name").trim(),
      periods = number("periods");
    if (!normalizedName(name) || name.length > 500)
      throw recordFieldError(
        "نام درس را با حداکثر ۵۰۰ نویسه وارد کنید.",
        "course_name",
      );
    if (!Number.isInteger(periods) || periods < 1 || periods > 10)
      throw recordFieldError(
        "زنگ در هفته باید عدد صحیح بین ۱ تا ۱۰ باشد.",
        "course_periods",
      );
    const info = {};
    for (const k of ["year", "grade", "field", "code", "branch", "authority"])
      info[k] = val(k).trim();
    if (
      !["10", "11", "12"].includes(info.grade) ||
      !["fani", "kardanesh"].includes(info.branch) ||
      Object.values(info).some((x) => x.length > 500) ||
      val("teacher").trim().length > 500
    )
      throw Error("شناسنامه درس معتبر نیست؛ طول مشخصات حداکثر ۵۰۰ نویسه باشد.");
    if (
      (!original || normalizedName(original.name) !== normalizedName(name)) &&
      c.lessons.some(
        (l) =>
          l.id !== original?.id &&
          normalizedName(l.name) === normalizedName(name),
      )
    )
      throw recordFieldError(
        "درسی با همین نام در این کلاس وجود دارد.",
        "course_name",
      );
    if (info.year !== api.year())
      throw Error("سال درس با دوره فعال یکسان نیست.");
    const locked =
      !!original &&
      (P.hasGrades(original) ||
        api
          .getDB()
          .sessions.some(
            (s) =>
              s.lessonId === original.id &&
              s.scores.some((g) => ["mostamar", "payani"].includes(g.type)),
          ));
    if (locked !== editing.locked)
      throw Error("سوابق این درس تغییر کرده است؛ فرم را دوباره باز کنید.");
    if (!locked) {
      const p = P.defaults(val("method"), api.year());
      Object.assign(p, info);
      for (const k of ["circularNumber", "circularDate", "reference"])
        p[k] = val(k).trim();
      const numericFields =
        p.method === "dual"
          ? ["practicalWeight", "theoryMin", "practicalMin", "passMin"]
          : [
              "mostamarMax",
              "continuousStep",
              "competencyFactor",
              "competencyMin",
              "moduleMin",
              "unitCount",
            ];
      for (const k of numericFields) p[k] = number(k);
      p.confirmed = checked("confirmed");
      p.requireGate = p.method === "modular" && checked("requireGate");
      const baseline = original?.gradingPolicy;
      p.revision = baseline?.revision || 1;
      if (
        baseline &&
        JSON.stringify({ ...p, revision: 1 }) !==
          JSON.stringify({ ...baseline, revision: 1 })
      )
        p.revision++;
      P.validate(p);
      const count = p.method === "modular" ? number("podCount") : 1;
      if (!Number.isInteger(count) || count < 1 || count > 20)
        throw Error("تعداد پودمان بین ۱ تا ۲۰ باشد.");
      const methodChanged =
        original &&
        (original.gradeMode === "kardanesh") !== (p.method === "dual");
      if (
        (checked("rebuild") || methodChanged) &&
        api.getDB().sessions.some((s) => s.lessonId === next.id)
      )
        throw Error(
          "درس دارای جلسه است؛ برای تغییر ساختار یک کپی جدید بسازید.",
        );
      if (
        p.method === "modular" &&
        (!next.poudmans.length || checked("rebuild"))
      )
        next.poudmans = makePods(count, p.unitCount);
      else
        for (const pod of next.poudmans) {
          const requested = val("unitCount_" + pod.id);
          if (requested !== undefined) {
            const count = number("unitCount_" + pod.id);
            if (!Number.isInteger(count) || count < 1 || count > 10)
              throw Error("تعداد واحدهای هر پودمان ۱ تا ۱۰ باشد.");
            if (count !== pod.units.length) {
              if (api.getDB().sessions.some((s) => s.lessonId === next.id))
                throw Error(
                  "برای تغییر تعداد واحدهای درس دارای جلسه، کپی جدید بسازید.",
                );
              pod.units = Array.from(
                { length: count },
                (_, i) =>
                  pod.units[i] || {
                    id: api.uid(),
                    name: "واحد یادگیری " + (i + 1),
                    unitScores: {},
                    applyOptions: {},
                  },
              );
            }
          }
        }
      next.gradeMode = p.method === "dual" ? "kardanesh" : "standard";
      next.gradingPolicy = p;
    } else {
      const branch =
        (original.gradingPolicy?.method ||
          (original.gradeMode === "kardanesh" ? "dual" : "modular")) === "dual"
          ? "kardanesh"
          : "fani";
      if (info.branch !== branch)
        throw Error("شاخه و روش درس دارای نمره قابل تغییر نیست.");
    }
    if (next.gradeMode !== "kardanesh") applyStructureNames(next);
    next.courseInfo = info;
    next.name = name;
    next.teacher = val("teacher").trim();
    next.periodsPerWeek = periods;
    next.weightMostamar = next.weightMostamar ?? 40;
    next.weightPayani = next.weightPayani ?? 60;
    next.kardaneshScores = next.kardaneshScores || {};
    if (original) c.lessons[c.lessons.indexOf(original)] = next;
    else c.lessons.push(next);
    await api.saveDB({
      classId: c.id,
      action: original
        ? "اصلاح شناسنامه درس و ابلاغیه"
        : "تعریف درس براساس ابلاغیه",
    });
    editing = null;
    finishSave();
    rememberRecordEditor();
    api.closeModal();
    api.render();
  } finally {
    saving = false;
    finishSave();
  }
}
