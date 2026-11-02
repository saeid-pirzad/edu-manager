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
  let input, signature, preparedNoteScope, preparedNoteVersion;
  const buttons = [
    ...document.querySelectorAll(
      ".periodic-build,[data-deputy-copy],.periodic-export-actions button",
    ),
  ];
  buttons.forEach((b) => (b.disabled = true));
  try {
    input = inputSnapshot();
    if (noteReadErrors.has(noteWorkspaceId()) && !notes.has(noteKey(filters)))
      throw Error(
        "توضیحات ذخیره‌شده این گزارش قابل خواندن نیست؛ پیش از تهیه گزارش آن را بررسی کنید.",
      );
    const inputSettings = (value) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(value).filter(([key]) => key !== "note"),
        ),
      );
    signature = inputSettings(input);
    preparedNoteScope = noteScopeSignature();
    preparedNoteVersion = noteEditGeneration;
    const refreshPreparedInput = () => {
      const current = inputSnapshot(),
        scope = noteScopeSignature();
      if (
        signature !== inputSettings(current) ||
        preparedNoteVersion !== noteEditGeneration ||
        (scope === preparedNoteScope && current.note !== input.note)
      )
        throw Error("تنظیمات گزارش تغییر کرده است؛ دوباره گزارش را تهیه کنید.");
      if (noteReadErrors.has(noteWorkspaceId()) && !notes.has(noteKey(filters)))
        throw Error(
          "توضیحات ذخیره‌شده این گزارش قابل خواندن نیست؛ پیش از تهیه گزارش آن را بررسی کنید.",
        );
      input.note = current.note;
      preparedNoteScope = scope;
    };
    const alert = document.getElementById("periodicError");
    if (alert) alert.textContent = "";
    const annual = input.mode === "annual",
      annualOptions = {
        annual: true,
        yearWide: true,
        periodIds: {
          first: input.annualFirstId,
          second: input.annualSecondId,
        },
      };
    const snapshot = await root.EduV24.prepareReportSnapshot(
      annual ? annualOptions : { annual: false },
    );
    refreshPreparedInput();
    const model = build(snapshot.data, input);
    let gradeSnapshot = snapshot;
    if (!annual && model.audience === "parent") {
      // Parent reports retain their explicitly annual grade section, but that
      // must not expand the date-filtered attendance/activity source. Keep both
      // durable snapshots guarded against writes while preparing any output.
      gradeSnapshot = await root.EduV24.prepareReportSnapshot(annualOptions);
      if (
        gradeSnapshot.context.id !== snapshot.context.id ||
        gradeSnapshot.context.revision !== snapshot.context.revision
      )
        throw Error(
          "اطلاعات هنگام تهیه گزارش تغییر کرد؛ دوباره گزارش را تهیه کنید.",
        );
      refreshPreparedInput();
    }
    if (annual || model.audience === "parent") {
      model.technicalGrades = root.EduV24.annualTechnicalRows(
        gradeSnapshot.parts,
        input.schoolId,
        input.classId,
        input.audience === "parent" ? input.studentId : "",
      );
      model.annualGrades = root.EduV24.annualGradeRows(
        gradeSnapshot.parts,
        input.schoolId,
        input.classId,
        input.audience === "parent" ? input.studentId : "",
      );
      model.gradePeriods = gradeSnapshot.parts.map((part) => ({
        id: part.period.id,
        term: part.period.term,
        label: part.period.displayTerm || part.period.term,
        revision: part.period.revision,
      }));
      if (!annual)
        model.definitions.push(
          "جلسات و فعالیت‌های این بازه فقط مربوط به ترم انتخاب‌شده‌اند؛ نمرات چهار مرحله و پودمان‌ها، وضعیت فعلی کل سال تحصیلی در زمان تهیه گزارش‌اند.",
        );
      model.definitions.push(
        "نمره هر مرحله طبق تنظیمات همان نوبت محاسبه می‌شود؛ نهایی سالانه میانگین برابر هر چهار مرحله است. نمره ناقص، صفر محسوب نمی‌شود.",
      );
      if (annual)
        model.definitions.push(
          "گزارش سالانه از مهر تا شهریور و شامل ترم اول و دوم همین سال تحصیلی است؛ نمرات پودمانی برای کل سال مشترک‌اند.",
        );
      model.definitions.push(
        "کلاس و هنرجو با شناسه مشترک بین نوبت‌ها مرتبط می‌شوند؛ شباهت نام، دلیل ادغام افراد نیست.",
      );
    }
    model.periods = annual
      ? model.gradePeriods
      : [
          {
            id: snapshot.context.id,
            term: model.academicTerm,
            label: model.academicTerm,
            revision: snapshot.context.revision,
          },
        ];
    await root.EduV24.assertReportSnapshot(snapshot.context);
    if (gradeSnapshot !== snapshot)
      await root.EduV24.assertReportSnapshot(gradeSnapshot.context);
    refreshPreparedInput();
    model.note = input.note;
    last = {
      signature: reportSignature(),
      context: gradeSnapshot.context,
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
      .querySelectorAll(
        ".periodic-build,[data-deputy-copy],.periodic-export-actions button",
      )
      .forEach((b) => (b.disabled = false));
  }
}
