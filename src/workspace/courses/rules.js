function fileModeBanner(app) {
  const warning = document.createElement("div");
  warning.id = "fileMigrationBanner";
  warning.className = "card";
  const title = document.createElement("h3");
  title.textContent = "حالت انتقال سوابق؛ فقط خواندنی";
  const text = document.createElement("p");
  text.textContent =
    "برای استفاده روزمره، نسخه نصب‌شده برنامه یا نشانی HTTPS آن را باز کنید. ابتدا فایل پشتیبان سوابق قبلی را دریافت و سپس در همان نسخه بازیابی کنید.";
  const button = document.createElement("button");
  button.textContent = "دریافت فایل انتقال سوابق";
  button.onclick = () => exportBackup();
  warning.append(title, text, button);
  app.prepend(warning);
}
function parseDraft(item) {
  const l = getLessonObj(findClass(item.classId), item.lid);
  if (!l) return { ok: false, message: "درس پیش‌نویس موجود نیست." };
  if (item.kind === "pod" || item.kind === "unit") {
    const pod = l.poudmans.find((p) => p.id === item.pid);
    if (
      l.gradingPolicy?.method !== "modular" ||
      !["m", "c"].includes(item.field) ||
      !pod ||
      (item.kind === "unit"
        ? !EduPolicy.unitBased(l.gradingPolicy) ||
          !pod.units.some((u) => u.id === item.uid)
        : EduPolicy.unitBased(l.gradingPolicy))
    )
      return {
        ok: false,
        message: "پودمان، واحد کار یا نوع نمره نامعتبر است.",
      };
    return EduPolicy.parse(item.value, l.gradingPolicy, item.field, item.kind);
  }
  return parseGrade(item.value);
}

function validateCourse(l, ids, year) {
  if (l.gradingPolicy) {
    EduPolicy.validate(l.gradingPolicy);
    if (l.gradingPolicy.year !== year)
      throw Error(
        "سال قواعد درس با سال تحصیلی برنامه یکسان نیست؛ تنظیمات درس را بررسی کنید.",
      );
    const p = l.gradingPolicy;
    if ((l.gradeMode === "kardanesh") !== (p.method === "dual"))
      throw Error("روش درس با قواعد آن یکسان نیست.");
    if (
      p.method === "modular" &&
      (!l.poudmans.length ||
        l.poudmans.length > 20 ||
        l.poudmans.some((x) => !x.units.length || x.units.length > 10))
    )
      throw Error("ساختار پودمان و واحد معتبر نیست.");
  }
  const unitBased = EduPolicy.unitBased(l.gradingPolicy);
  const validateScores = (scores, unit = false) => {
    if (scores === undefined) return;
    if (!scores || typeof scores !== "object" || Array.isArray(scores))
      throw Error("نمرات پودمان یا واحد کار نامعتبر است.");
    if (unit !== unitBased && Object.keys(scores).length)
      throw Error("نمره با مبنای نمره‌دهی درس یکسان نیست.");
    for (const [sid, g] of Object.entries(scores)) {
      if (!ids.has(sid) || !g || typeof g !== "object" || Array.isArray(g))
        throw Error("دانش‌آموز یا نمره پودمان نامعتبر است.");
      if (unit && Object.keys(g).some((key) => !["m", "c"].includes(key)))
        throw Error("اجزای نمرهٔ واحد کار نامعتبر است.");
      if (g.gate !== undefined && typeof g.gate !== "boolean")
        throw Error("وضعیت معیارهای الزامی نامعتبر است.");
      for (const field of ["m", "c"])
        if (g[field] != null) {
          if (
            typeof g[field] !== "number" ||
            !Number.isFinite(g[field]) ||
            l.gradingPolicy?.method !== "modular"
          )
            throw Error("نمره پودمان فاقد قواعد معتبر است.");
          if (
            !EduPolicy.parse(
              String(g[field]),
              l.gradingPolicy,
              field,
              unit ? "unit" : "pod",
            ).ok
          )
            throw Error("بازه یا گام نمره پودمان نامعتبر است.");
        }
    }
  };
  for (const pod of l.poudmans || []) {
    validateScores(pod.podScores);
    for (const unit of pod.units || [])
      validateScores(unit.competencyScores, true);
  }
}
