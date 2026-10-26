// Event handlers extracted from src/legacy/ui/school-class.js.
EduLegacyEvents.register("ui-school-class:0", function (event) {
  return goMaster();
});

EduLegacyEvents.register("ui-school-class:1", function (event) {
  return addSchool(event);
});

EduLegacyEvents.register("ui-school-class:2", function (event) {
  return goSchools();
});

EduLegacyEvents.register("ui-school-class:3", function (event) {
  return openReportScope(this.getAttribute("data-legacy-click-arg2"));
});

EduLegacyEvents.register("ui-school-class:4", function (event) {
  return EduV24.openEntityEditor(
    "school",
    this.getAttribute("data-legacy-click-arg0"),
  );
});

EduLegacyEvents.register("ui-school-class:5", function (event) {
  return addClass(event);
});

EduLegacyEvents.register("ui-school-class:6", function (event) {
  return goSchools();
});

EduLegacyEvents.register("ui-school-class:7", function (event) {
  return goSchool(this.getAttribute("data-legacy-click-arg0"));
});

EduLegacyEvents.register("ui-school-class:8", function (event) {
  return openReportScope(
    this.getAttribute("data-legacy-click-arg0"),
    this.getAttribute("data-legacy-click-arg1"),
    "karnameh",
  );
});

EduLegacyEvents.register("ui-school-class:9", function (event) {
  return EduV24.openEntityEditor(
    "class",
    this.getAttribute("data-legacy-click-arg0"),
    this.getAttribute("data-legacy-click-arg1"),
  );
});

EduLegacyEvents.register("ui-school-class:10", function (event) {
  return setTab("lessons");
});

EduLegacyEvents.register("ui-school-class:11", function (event) {
  return setTab("students");
});

EduLegacyEvents.register("ui-school-class:12", function (event) {
  return goMaster(this.getAttribute("data-legacy-click-arg0"));
});

EduLegacyEvents.register("ui-school-class:13", function (event) {
  return addLesson(event);
});

EduLegacyEvents.register("ui-school-class:14", function (event) {
  return goLesson(this.getAttribute("data-legacy-click-arg8"));
});

EduLegacyEvents.register("ui-school-class:15", function (event) {
  return EduV24.course
    .openNames(this.getAttribute("data-legacy-click-arg0"))
    .catch(EduV24.course.error);
});

EduLegacyEvents.register("ui-school-class:16", function (event) {
  return addStudent(event);
});

EduLegacyEvents.register("ui-school-class:17", function (event) {
  return downloadExcelTemplate();
});

EduLegacyEvents.register("ui-school-class:18", function (event) {
  return document.getElementById("excelFile").click();
});

EduLegacyEvents.register("ui-school-class:19", function (event) {
  return filterStudentRoster(this);
});

EduLegacyEvents.register("ui-school-class:20", function (event) {
  return filterStudentRoster(this);
});

EduLegacyEvents.register("ui-school-class:21", function (event) {
  return openEditStudentModal(this.getAttribute("data-legacy-click-arg8"));
});
// Event handlers extracted from src/legacy/ui/school-class.js.
EduLegacyEvents.register("ui-school-class:22", function (event) {
  return goMaster(this.getAttribute("data-legacy-click-arg2"));
});

EduLegacyEvents.register("ui-school-class:23", function (event) {
  return openBulkScoreModal(this.getAttribute("data-legacy-click-arg9"));
});

EduLegacyEvents.register("ui-school-class:24", function (event) {
  return showModal(
    "کارنامه هنرجو",
    buildDetailedKarnamehHtml(
      getClassObj(state.schoolId, state.classId),
      this.getAttribute("data-legacy-click-arg9"),
    ),
  );
});
// Event handlers extracted from src/legacy/ui/school-class.js.
EduLegacyEvents.register("ui-school-class:25", function (event) {
  return openLessonConfig(this.getAttribute("data-legacy-click-arg10"));
});

EduLegacyEvents.register("ui-school-class:26", function (event) {
  return openTransferModal(this.getAttribute("data-legacy-click-arg13"));
});
// Event handlers extracted from src/legacy/ui/school-class.js.
EduLegacyEvents.register("ui-school-class:27", function (event) {
  return EduV24.course
    .copy(this.getAttribute("data-legacy-click-arg14"))
    .catch(EduV24.course.error);
});

EduLegacyEvents.register("ui-school-class:28", function (event) {
  return deleteStudent(this.getAttribute("data-legacy-click-arg14"));
});
// Event handlers extracted from src/legacy/ui/school-class.js.
EduLegacyEvents.register("ui-school-class:29", function (event) {
  return deleteLesson(this.getAttribute("data-legacy-click-arg15"));
});
