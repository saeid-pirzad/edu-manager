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
  });
  filterWorkspace = context().id;
  last = null;
}
function initialize(mode) {
  filters.mode = mode;
  const workspaceId = context().id;
  if (filterWorkspace && filterWorkspace !== workspaceId) {
    Object.assign(filters, {
      schoolId: "",
      classId: "",
      studentId: "",
      audience: "management",
      date: localToday(),
      annualFirstId: "",
      annualSecondId: "",
    });
    annualPeriodList = [];
    last = null;
  }
  filterWorkspace = workspaceId;
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
  return annualPeriodList.filter(
    (row) => !row.termKind || row.termKind === kind,
  );
}
function loadAnnualPeriodChoices() {
  const expected = context().id;
  if (annualLoadingFor === expected) return;
  annualLoadingFor = expected;
  root.EduV24.listAnnualReportPeriods()
    .then((rows) => {
      if (context().id !== expected || filters.mode !== "annual") return;
      annualPeriodList = rows;
      for (const [field, id] of [
        ["annualFirstId", "annualFirstPeriod"],
        ["annualSecondId", "annualSecondPeriod"],
      ]) {
        const select = document.getElementById(id);
        if (!select) continue;
        select.innerHTML =
          '<option value="">انتخاب خودکار در صورت نبود ابهام</option>' +
          annualPeriodOptions(field)
            .map(
              (row) =>
                '<option value="' +
                esc(row.id) +
                '"' +
                (filters[field] === row.id ? " selected" : "") +
                ">" +
                esc(row.term) +
                (row.closed ? " · بسته" : "") +
                "</option>",
            )
            .join("");
        select.disabled = false;
      }
    })
    .catch(error)
    .finally(() => {
      if (annualLoadingFor === expected) annualLoadingFor = "";
    });
}
