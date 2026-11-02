// The interface works in one academic year. Older backup content stays stored;
// choosing a view must never merge, delete, or relabel historical records.
const ACADEMIC_YEAR_PREFERENCE_KEY = "Edu24.academicYear";
function preferredAcademicYear() {
  try {
    const value = localStorage.getItem(ACADEMIC_YEAR_PREFERENCE_KEY);
    return value ? EduAcademicYear.normalize(value) : null;
  } catch {
    return null;
  }
}
function rememberAcademicYear(year) {
  const value = EduAcademicYear.normalize(year);
  try {
    localStorage.setItem(ACADEMIC_YEAR_PREFERENCE_KEY, value);
  } catch {
    // The selected workspace is still usable when browser preferences fail.
  }
  return value;
}
function selectAcademicWorkspace(rows, { year, preferredId } = {}) {
  if (!Array.isArray(rows) || !rows.length)
    throw Error("اطلاعات سال تحصیلی برای بازکردن موجود نیست.");
  const catalog = rows.map((row) => ({
      row,
      year: EduAcademicYear.normalize(row.year),
      kind: row.termKind || academicTermKind(row.term),
    })),
    preferred = catalog.find(({ row }) => row.id === preferredId),
    anchor = year == null ? null : EduAcademicYear.normalize(year),
    activeYear = catalog.some((entry) => entry.year === anchor)
      ? anchor
      : preferred?.year ||
        catalog
          .map((entry) => entry.year)
          .sort()
          .at(-1),
    family = catalog.filter((entry) => entry.year === activeYear);
  // An explicitly selected legacy record is a recovery view, not a newly
  // inferred term. Its identity and data remain exactly as saved.
  if (preferred?.year === activeYear) return preferred.row;
  const first = family.filter((entry) => entry.kind === "first"),
    second = family.filter((entry) => entry.kind === "second");
  if (first.length > 1 || second.length > 1) {
    const error = Error(
      "فایل قدیمی چند نسخه از یک نوبت دارد؛ انتخاب خودکار انجام نشد. شناسهٔ اطلاعات فعال باید مشخص باشد؛ هیچ داده‌ای حذف یا ادغام نشده است.",
    );
    error.code = "ACADEMIC_TERM_AMBIGUOUS";
    throw error;
  }
  const selected = second[0] || first[0];
  if (!selected) {
    const error = Error(
      "اطلاعات قدیمی نوبت اول یا دوم مشخصی ندارد؛ برای بازیابی، اطلاعات فعال فایل باید صریح باشد. هیچ سابقه‌ای حذف نشده است.",
    );
    error.code = "ACADEMIC_TERM_SELECTION_REQUIRED";
    throw error;
  }
  return selected.row;
}
function academicWorkspaceRecoveryWarning(row, rows = []) {
  const kind = row.termKind || academicTermKind(row.term);
  if (!["first", "second"].includes(kind))
    return "نمای بازیابی اطلاعات قدیمی باز است؛ عنوان قبلی به نوبت اول یا دوم تبدیل نشده و همهٔ سوابق در پشتیبان کامل محفوظ‌اند.";
  if (
    rows.filter(
      (item) =>
        item.year === row.year &&
        (item.termKind || academicTermKind(item.term)) === kind,
    ).length > 1
  )
    return "فایل قدیمی چند نسخه از این نوبت دارد؛ فقط اطلاعات فعالِ صریح باز شده است و هیچ نسخه‌ای خودکار ادغام یا حذف نشده است.";
  return "";
}
function academicBootstrapPreferences(
  rows,
  { year, preferredId, resetMarker, initialWorkspaceId } = {},
) {
  const representedYear = (value) => {
    try {
      const normalized = EduAcademicYear.normalize(value);
      return rows.some(
        (row) => EduAcademicYear.normalize(row.year) === normalized,
      )
        ? normalized
        : null;
    } catch {
      return null;
    }
  };
  const restored = rows.find(
      (row) => row.id === resetMarker?.value?.activeWorkspace,
    ),
    restoredYear = representedYear(resetMarker?.value?.academicYear),
    validRestored =
      restored &&
      restoredYear &&
      EduAcademicYear.normalize(restored.year) === restoredYear
        ? restored
        : null,
    anchor = representedYear(year) || (validRestored ? restoredYear : null),
    inYear = (row) =>
      row && (!anchor || EduAcademicYear.normalize(row.year) === anchor),
    preferred = rows.find((row) => row.id === preferredId),
    initial = rows.find((row) => row.id === initialWorkspaceId),
    selected =
      (inYear(preferred) && preferred) ||
      (inYear(initial) && initial) ||
      (inYear(validRestored) && validRestored) ||
      null;
  return { year: anchor, preferredId: selected?.id };
}
