// Event handlers extracted from src/legacy/reports/comprehensive.js.
EduLegacyEvents.register("reports-comprehensive:0", function (event) {
  return setReportTab(this.getAttribute("data-legacy-click-arg2"));
});

EduLegacyEvents.register("reports-comprehensive:1", function (event) {
  return setReportTab("karnameh");
});

EduLegacyEvents.register("reports-comprehensive:2", function (event) {
  return setReportTab("comprehensive");
});

EduLegacyEvents.register("reports-comprehensive:3", function (event) {
  return setReportTab("lessonReport");
});

EduLegacyEvents.register("reports-comprehensive:4", function (event) {
  return updateGlobalFilter("date", this.value);
});

EduLegacyEvents.register("reports-comprehensive:5", function (event) {
  return updateGlobalFilter("schoolId", this.value);
});

EduLegacyEvents.register("reports-comprehensive:6", function (event) {
  return updateGlobalFilter("classId", this.value);
});

EduLegacyEvents.register("reports-comprehensive:7", function (event) {
  return updateGlobalFilter("lessonId", this.value);
});

EduLegacyEvents.register("reports-comprehensive:8", function (event) {
  return updateGlobalFilter("studentId", this.value);
});

EduLegacyEvents.register("reports-comprehensive:9", function (event) {
  return updateGlobalFilter("period", this.value);
});

EduLegacyEvents.register("reports-comprehensive:10", function (event) {
  return updateGlobalFilter("reportMode", this.value);
});

EduLegacyEvents.register("reports-comprehensive:11", function (event) {
  return updateGlobalFilter("reportMode", this.value);
});

EduLegacyEvents.register("reports-comprehensive:12", function (event) {
  return updateGlobalFilter("showAttendance", this.checked);
});

EduLegacyEvents.register("reports-comprehensive:13", function (event) {
  return updateGlobalFilter("showScores", this.checked);
});

EduLegacyEvents.register("reports-comprehensive:14", function (event) {
  return updateGlobalFilter("showPosNeg", this.checked);
});

EduLegacyEvents.register("reports-comprehensive:15", function (event) {
  return updateGlobalFilter("showHomework", this.checked);
});

EduLegacyEvents.register("reports-comprehensive:16", function (event) {
  return updateGlobalFilter("showPresentNames", this.checked);
});

EduLegacyEvents.register("reports-comprehensive:17", function (event) {
  return updateGlobalFilter("showAbsentNames", this.checked);
});

EduLegacyEvents.register("reports-comprehensive:18", function (event) {
  return updateGlobalFilter("showLateNames", this.checked);
});

EduLegacyEvents.register("reports-comprehensive:19", function (event) {
  return resetGlobalFilters();
});

EduLegacyEvents.register("reports-comprehensive:20", function (event) {
  return copyGlobalReportText(this);
});

EduLegacyEvents.register("reports-comprehensive:21", function (event) {
  return EduV24.printReport(this);
});
