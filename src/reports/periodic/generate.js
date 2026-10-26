function set(key, value) {
  if (
    ![
      "audience",
      "date",
      "schoolId",
      "classId",
      "studentId",
      "detailLevel",
      "annualFirstId",
      "annualSecondId",
    ].includes(key)
  )
    return;
  if (key === "detailLevel" && !["summary", "full"].includes(value)) return;
  if (key === "date") {
    try {
      isoDate(value);
    } catch (e) {
      error(e);
      return;
    }
  }
  filters[key] = value;
  if (key === "schoolId") {
    filters.classId = "";
    filters.studentId = "";
  }
  if (key === "classId" || key === "audience") filters.studentId = "";
  last = null;
  root.render();
}
function error(e) {
  const el = document.getElementById("periodicError");
  if (el) el.textContent = e.message || String(e);
}
function invalidate(
  message = "اطلاعات گزارش تغییر کرده است؛ دوباره گزارش را تهیه کنید.",
) {
  last = null;
  const out = document.getElementById("periodicReportOutput");
  if (out)
    out.innerHTML =
      '<div class="card empty" role="status">' + esc(message) + "</div>";
  error(Error(message));
}
function isPreparedCurrent(prepared) {
  return (
    !!prepared && last === prepared && prepared.signature === reportSignature()
  );
}
async function generate() {
  if (busy) return null;
  busy = true;
  let input, signature;
  const buttons = [
    ...document.querySelectorAll(
      ".periodic-build,.periodic-export-actions button",
    ),
  ];
  buttons.forEach((b) => (b.disabled = true));
  try {
    input = inputSnapshot();
    if (noteReadErrors.has(context().id) && !notes.has(noteKey(filters)))
      throw Error(
        "توضیحات ذخیره‌شده این گزارش قابل خواندن نیست؛ پیش از تهیه گزارش آن را بررسی کنید.",
      );
    signature = JSON.stringify(input);
    const alert = document.getElementById("periodicError");
    if (alert) alert.textContent = "";
    const snapshot = await root.EduV24.prepareReportSnapshot({
      annual: input.mode === "annual",
      periodIds: {
        first: input.annualFirstId,
        second: input.annualSecondId,
      },
    });
    if (signature !== JSON.stringify(inputSnapshot()))
      throw Error("تنظیمات گزارش تغییر کرده است؛ دوباره گزارش را تهیه کنید.");
    const model = build(snapshot.data, input);
    if (model.audience === "parent" && input.mode !== "annual") {
      const c = snapshot.data.schools
        .find((s) => s.id === input.schoolId)
        .classes.find((c) => c.id === input.classId);
      for (const l of c.lessons || []) {
        try {
          const r = calcStudentLesson(c, l, input.studentId, snapshot.data);
          model.currentGrades.push({
            lessonName: l.name,
            method:
              l.gradingPolicy?.method ||
              (l.gradeMode === "kardanesh" ? "dual" : "modular"),
            practical: r.practical ?? null,
            theory: r.theory ?? null,
            final:
              typeof r.final === "number" && Number.isFinite(r.final)
                ? root.EduV24.finalText(r)
                : "—",
            status:
              r.reason ||
              (r.final === null || r.final === undefined
                ? "ناقص"
                : gradeStatus(r)),
            modules: (r.modules || []).map((m) => {
              const g = ownScoreRecord(
                l.poudmans.find((p) => p.id === m.id)?.podScores,
                input.studentId,
              );
              return {
                name: m.name,
                continuous: g.m ?? null,
                competency: g.c ?? null,
                final: m.final,
                passed: m.passed,
                complete: m.complete,
                reason: m.reason || "",
              };
            }),
            policy: l.gradingPolicy
              ? l.gradingPolicy.confirmed
                ? "تأییدشده توسط کاربر"
                : "پیش‌نویس تأییدنشده"
              : "قواعد ثبت‌شده درس",
          });
        } catch {
          model.currentGrades.push({
            lessonName: l.name,
            final: "—",
            status: "نیازمند بررسی",
            policy: "محاسبه در دسترس نیست",
          });
        }
      }
    }
    if (input.mode === "annual") {
      model.technicalGrades = root.EduV24.annualTechnicalRows(
        snapshot.parts,
        input.schoolId,
        input.classId,
        input.audience === "parent" ? input.studentId : "",
      );
      model.annualGrades = root.EduV24.annualGradeRows(
        snapshot.parts,
        input.schoolId,
        input.classId,
        input.audience === "parent" ? input.studentId : "",
      );
      model.periods = snapshot.parts.map((part) => ({
        id: part.period.id,
        term: part.period.term,
        label: part.period.displayTerm || part.period.term,
        revision: part.period.revision,
      }));
      model.definitions.push(
        "کاردانش: هر مرحله عملی ۷۰٪ و تئوری ۳۰٪؛ نهایی سالانه میانگین برابر هر چهار مرحله است. نمره ناقص، صفر محسوب نمی‌شود.",
      );
      for (const part of snapshot.parts)
        model.definitions.push(
          "منبع نوبت " + part.period.term + ": " + part.period.displayTerm,
        );
      model.definitions.push(
        "گزارش سالانه از مهر تا شهریور و شامل نوبت‌های اول و دوم همین سال تحصیلی است؛ تابستان مستقل است.",
      );
      model.definitions.push(
        "کلاس و هنرجو با شناسه مشترک بین نوبت‌ها مرتبط می‌شوند؛ شباهت نام، دلیل ادغام افراد نیست.",
      );
    }
    await root.EduV24.assertReportSnapshot(snapshot.context);
    if (signature !== JSON.stringify(inputSnapshot()))
      throw Error("تنظیمات گزارش تغییر کرده است؛ دوباره گزارش را تهیه کنید.");
    last = {
      signature: reportSignature(),
      context: snapshot.context,
      model,
    };
    const out = document.getElementById("periodicReportOutput");
    if (out) out.innerHTML = documentHtml(model);
    return model;
  } catch (e) {
    invalidate(e.message || String(e));
    return null;
  } finally {
    busy = false;
    document
      .querySelectorAll(".periodic-build,.periodic-export-actions button")
      .forEach((b) => (b.disabled = false));
  }
}
