// Event handlers extracted from src/legacy/ui/lesson.js.
EduLegacyEvents.register("ui-lesson:0", function (event) {
  return goSchools();
});

EduLegacyEvents.register("ui-lesson:1", function (event) {
  return goSchool(this.getAttribute("data-legacy-click-arg0"));
});

EduLegacyEvents.register("ui-lesson:2", function (event) {
  return backToClass();
});

EduLegacyEvents.register("ui-lesson:4", function (event) {
  return setTab("sessions");
});

EduLegacyEvents.register("ui-lesson:5", function (event) {
  return setTab("grades");
});

EduLegacyEvents.register("ui-lesson:6", function (event) {
  return addManualSession(event, this.getAttribute("data-legacy-submit-arg0"));
});

EduLegacyEvents.register("ui-lesson:7", function (event) {
  return deleteAllSessions(
    this.getAttribute("data-legacy-click-arg0"),
    this.getAttribute("data-legacy-click-arg1"),
  );
});

EduLegacyEvents.register("ui-lesson:8", function (event) {
  return openExistingSession(this.getAttribute("data-legacy-click-arg0"));
});

EduLegacyEvents.register("ui-lesson:9", function (event) {
  return deleteSession(this.getAttribute("data-legacy-click-arg4"));
});
