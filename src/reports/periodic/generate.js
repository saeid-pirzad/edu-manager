function set(key, value) {
  if (
    ![
      "audience",
      "date",
      "startDate",
      "endDate",
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
  if (["date", "startDate", "endDate"].includes(key)) {
    try {
      isoDate(value);
    } catch (e) {
      error(e);
      return;
    }
  }
  if (key === "endDate" && filters.startDate && value < filters.startDate) {
    error(Error("تاریخ پایان نباید قبل از تاریخ شروع باشد."));
    return;
  }
  filters[key] = value;
  if (key === "date" && filters.mode === "weekly") {
    const dates = range("weekly", value);
    filters.startDate = dates.start;
    filters.endDate = dates.end;
  }
  if (key === "startDate") {
    filters.date = value;
    if (!filters.endDate || filters.endDate < value)
      filters.endDate = addDays(value, 6);
  }
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
  invalidateExcelShare(message);
  last = null;
  const out = document.getElementById("periodicReportOutput");
  if (out)
    out.innerHTML =
      '<div class="card empty" role="status">' + esc(message) + "</div>";
  syncReportActions();
  error(Error(message));
}
function isPreparedCurrent(prepared) {
  return (
    !!prepared && last === prepared && prepared.signature === reportSignature()
  );
}
function syncReportActions() {
  document
    .querySelectorAll(".periodic-build,.periodic-export-actions button")
    .forEach((button) => (button.disabled = busy));
  const copyDisabled = busy || !isPreparedCurrent(last);
  document
    .querySelectorAll("[data-deputy-copy]")
    .forEach((button) => (button.disabled = copyDisabled));
}
async function generate() {
  if (busy) return null;
  busy = true;
  let input, signature, preparedNoteScope, preparedNoteVersion;
  syncReportActions();
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
        "نمره هر مرحله طبق تنظیمات همان نوبت محاسبه می‌شود؛ نهایی سالانه میانگین برابر هر چهار مرحله است و قبولی سالانه فقط با حدنصاب همین میانگین تعیین می‌شود، مستقل از وضعیت قبولی مرحله‌ها. نمره ناقص، صفر محسوب نمی‌شود.",
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
    const gradeHtml =
      annual || model.audience === "parent"
        ? root.EduV24.periodicKarnamehHtml(gradeSnapshot.parts, {
            schoolId: input.schoolId,
            classId: input.classId,
            student: model.audience === "parent" ? model.student : null,
          })
        : "";
    last = {
      signature: reportSignature(),
      context: gradeSnapshot.context,
      model,
      gradeHtml,
    };
    const out = document.getElementById("periodicReportOutput");
    if (out) {
      out.innerHTML = documentHtml(model, gradeHtml);
      initializeReportKarnameh(last);
    }
    return model;
  } catch (e) {
    invalidate(e.message || String(e));
    return null;
  } finally {
    busy = false;
    syncReportActions();
  }
}
function initializeReportKarnameh(prepared) {
  if (!prepared?.gradeHtml) return;
  root.EduV24.initPeriodicKarnameh(
    document.getElementById("periodicReportOutput"),
    prepared.context,
    () => isPreparedCurrent(prepared),
  );
}
