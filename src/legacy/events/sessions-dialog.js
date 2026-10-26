// Event handlers extracted from src/legacy/sessions/dialog.js.
EduLegacyEvents.register("sessions-dialog:0", function (event) {
  return (document.getElementById("shamsiSessDate").textContent = toShamsi(
    this.value,
  ));
});

EduLegacyEvents.register("sessions-dialog:1", function (event) {
  return changeSessionDate(this.getAttribute("data-legacy-click-arg3"));
});

EduLegacyEvents.register("sessions-dialog:2", function (event) {
  return updateSessionUnits();
});

EduLegacyEvents.register("sessions-dialog:3", function (event) {
  return saveSessionUnit();
});

EduLegacyEvents.register("sessions-dialog:4", function (event) {
  return showSessionPanel("attendance");
});

EduLegacyEvents.register("sessions-dialog:5", function (event) {
  return showSessionPanel("activity");
});

EduLegacyEvents.register("sessions-dialog:6", function (event) {
  return setAllAttendance("present");
});

EduLegacyEvents.register("sessions-dialog:7", function (event) {
  return setAllAttendance("absent");
});

EduLegacyEvents.register("sessions-dialog:8", function (event) {
  return toggleAtt(this, "present");
});

EduLegacyEvents.register("sessions-dialog:9", function (event) {
  return toggleAtt(this, "late");
});

EduLegacyEvents.register("sessions-dialog:10", function (event) {
  return toggleAtt(this, "absent");
});

EduLegacyEvents.register("sessions-dialog:11", function (event) {
  return addSessionScore(event, this.getAttribute("data-legacy-submit-arg0"));
});

EduLegacyEvents.register("sessions-dialog:12", function (event) {
  return removeSessionScore(
    this.getAttribute("data-legacy-click-arg5"),
    JSON.parse(this.getAttribute("data-legacy-click-arg6")),
  );
});

EduLegacyEvents.register("sessions-dialog:13", function (event) {
  return copyToClipboard(
    generateSessionReportText(
      getSessionById(this.getAttribute("data-legacy-click-arg0")),
      getClassObj(
        this.getAttribute("data-legacy-click-arg1"),
        this.getAttribute("data-legacy-click-arg2"),
      ),
      getLessonObj(
        getClassObj(
          this.getAttribute("data-legacy-click-arg3"),
          this.getAttribute("data-legacy-click-arg4"),
        ),
        this.getAttribute("data-legacy-click-arg5"),
      ),
    ),
    this,
  );
});

EduLegacyEvents.register("sessions-dialog:14", function (event) {
  return closeModal();
});
