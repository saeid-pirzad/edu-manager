// Event handlers extracted from src/legacy/sessions/dialog.js.
EduLegacyEvents.register("sessions-dialog:attendance-search", function () {
  return filterSessionAttendance(this);
});
EduLegacyEvents.register("sessions-dialog:0", function (event) {
  document.getElementById("shamsiSessDate").textContent = toShamsi(this.value);
  refreshSessionDateSchedule();
});

EduLegacyEvents.register("sessions-dialog:1", function (event) {
  return runSessionFormAction(this, () =>
    changeSessionDate(this.getAttribute("data-legacy-click-arg3")),
  );
});

EduLegacyEvents.register("sessions-dialog:2", function (event) {
  return runSessionEditorAction(this, () => updateSessionUnits());
});

EduLegacyEvents.register("sessions-dialog:3", function (event) {
  return runSessionEditorAction(this, () => saveSessionUnit());
});

EduLegacyEvents.register("sessions-dialog:4", function (event) {
  return showSessionPanel("attendance");
});

EduLegacyEvents.register("sessions-dialog:5", function (event) {
  return showSessionPanel("activity");
});

EduLegacyEvents.register("sessions-dialog:6", function (event) {
  return runSessionEditorAction(this, () =>
    setAllAttendance("present", { onlyUnset: true }),
  );
});

EduLegacyEvents.register("sessions-dialog:7", function (event) {
  return runSessionEditorAction(this, () => setAllAttendance("absent"));
});

EduLegacyEvents.register("sessions-dialog:8", function (event) {
  return runSessionEditorAction(this, () => toggleAtt(this, "present"));
});

EduLegacyEvents.register("sessions-dialog:9", function (event) {
  return runSessionEditorAction(this, () => toggleAtt(this, "late"));
});

EduLegacyEvents.register("sessions-dialog:10", function (event) {
  return runSessionEditorAction(this, () => toggleAtt(this, "absent"));
});

EduLegacyEvents.register("sessions-dialog:11", function (event) {
  return runSessionEditorAction(this, () =>
    addSessionScore(event, this.getAttribute("data-legacy-submit-arg0")),
  );
});

EduLegacyEvents.register("sessions-dialog:12", function (event) {
  return runSessionEditorAction(this, () =>
    removeSessionScore(
      this.getAttribute("data-legacy-click-arg5"),
      JSON.parse(this.getAttribute("data-legacy-click-arg6")),
    ),
  );
});

EduLegacyEvents.register("sessions-dialog:13", function (event) {
  return EduV24.copyReport(
    (source) =>
      EduPeriodicReports.sessionDeputyReport(
        source,
        this.getAttribute("data-legacy-click-arg0"),
      ),
    this,
    (text) => EduPeriodicReports.deputyReportHTML(text),
  );
});

EduLegacyEvents.register("sessions-dialog:14", function (event) {
  return closeModal();
});

EduLegacyEvents.register("sessions-dialog:leave", function () {
  return runSessionEditorAction(this, () => toggleAtt(this, "leave"));
});

EduLegacyEvents.register("sessions-dialog:all-present", function () {
  return runSessionEditorAction(this, () => setAllAttendance("present"));
});
EduLegacyEvents.register("sessions-dialog:entry-change", function () {
  return refreshSessionActivityInput(this.form);
});
