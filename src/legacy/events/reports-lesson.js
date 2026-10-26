// Event handlers extracted from src/legacy/reports/lesson.js.
EduLegacyEvents.register("reports-lesson:0", function (event) {
  return updateLessonReportFilter("schoolId", this.value);
});

EduLegacyEvents.register("reports-lesson:1", function (event) {
  return updateLessonReportFilter("classId", this.value);
});

EduLegacyEvents.register("reports-lesson:2", function (event) {
  return updateLessonReportFilter("lessonId", this.value);
});

EduLegacyEvents.register("reports-lesson:3", function (event) {
  return copyLessonReportForVicePrincipal(
    this.getAttribute("data-legacy-click-arg2"),
  );
});

EduLegacyEvents.register("reports-lesson:4", function (event) {
  return EduV24.printReport(this);
});
