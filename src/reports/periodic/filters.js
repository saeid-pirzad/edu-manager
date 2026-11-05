let filterWorkspace = "";
function selectScope(schoolId = "", classId = "") {
  let school = schoolId ? db.schools.find((s) => s.id === schoolId) : null;
  if (schoolId && !school)
    throw Error("مدرسه این گزارش دیگر وجود ندارد؛ فهرست را تازه کنید.");
  if (classId) {
    school =
      school || db.schools.find((s) => s.classes.some((c) => c.id === classId));
    if (!school?.classes.some((c) => c.id === classId))
      throw Error("کلاس انتخاب‌شده متعلق به این مدرسه نیست.");
  }
  school =
    school ||
    db.schools.find((s) => s.id === filters.schoolId) ||
    db.schools[0];
  Object.assign(filters, {
    schoolId: school?.id || "",
    classId,
    studentId: "",
    audience: "management",
    date: localToday(),
    startDate: "",
    endDate: "",
  });
  filterWorkspace = noteYearScopeId();
  last = null;
}
function initialize(mode) {
  filters.mode = mode;
  const workspaceId = noteYearScopeId();
  if (filterWorkspace && filterWorkspace !== workspaceId) {
    Object.assign(filters, {
      schoolId: "",
      classId: "",
      studentId: "",
      audience: "management",
      date: localToday(),
      startDate: "",
      endDate: "",
      annualFirstId: "",
      annualSecondId: "",
    });
    annualPeriodList = [];
    last = null;
  }
  filterWorkspace = workspaceId;
  if (mode === "weekly" && (!filters.startDate || !filters.endDate)) {
    const dates = range("weekly", filters.date);
    filters.startDate = dates.start;
    filters.endDate = dates.end;
  }
  if (!db.schools.some((s) => s.id === filters.schoolId)) {
    filters.schoolId = db.schools.some((s) => s.id === globalFilter.schoolId)
      ? globalFilter.schoolId
      : db.schools[0]?.id || "";
    filters.classId = "";
    filters.studentId = "";
  }
  const school = db.schools.find((s) => s.id === filters.schoolId);
  if (
    filters.classId &&
    !school?.classes.some((c) => c.id === filters.classId)
  ) {
    filters.classId = "";
    filters.studentId = "";
  }
}
let annualPeriodList = [],
  annualLoadingFor = "";
function annualPeriodOptions(field) {
  const kind = field === "annualFirstId" ? "first" : "second";
  return annualPeriodList.filter((row) => row.termKind === kind);
}
function loadAnnualPeriodChoices() {
  const expected = noteYearScopeId();
  if (annualLoadingFor === expected) return;
  annualLoadingFor = expected;
  root.EduV24.listAnnualReportPeriods()
    .then((rows) => {
      if (noteYearScopeId() !== expected || filters.mode !== "annual") return;
      annualPeriodList = rows;
      const status = document.getElementById("annualSourceStatus");
      if (!status) return;
      const first = annualPeriodOptions("annualFirstId"),
        second = annualPeriodOptions("annualSecondId");
      status.textContent =
        first.length > 1 || second.length > 1
          ? "اطلاعات قدیمی این سال چند نسخه از یک نوبت دارد؛ نیازمند بررسی است."
          : !first.length
            ? "این سال هنوز نوبت اول ندارد."
            : !second.length
              ? "ترم دوم هنوز نمره ندارد؛ گزارش سال تحصیلی با داده‌های موجود تهیه می‌شود."
              : "گزارش سالانه از نوبت اول و دوم همین سال تهیه می‌شود.";
    })
    .catch(error)
    .finally(() => {
      if (annualLoadingFor === expected) annualLoadingFor = "";
    });
}
