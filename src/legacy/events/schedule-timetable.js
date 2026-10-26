// Event handlers extracted from src/legacy/schedule/timetable.js.
EduLegacyEvents.register("week-settings-toggle", function () {
  state.masterSettingsOpen = this.open;
});
EduLegacyEvents.register("week-configure", function () {
  const day = Number(this.dataset.day),
    period = Number(this.dataset.period);
  return this.dataset.configure === "yes"
    ? openMasterConfig(day, period)
    : clickMasterCell(day, period);
});
EduLegacyEvents.register("schedule-timetable:0", function (event) {
  return clickMasterCell(
    JSON.parse(this.getAttribute("data-legacy-click-arg5")),
    JSON.parse(this.getAttribute("data-legacy-click-arg6")),
  );
});

EduLegacyEvents.register("schedule-timetable:1", function (event) {
  return clickMasterCell(
    JSON.parse(this.getAttribute("data-legacy-click-arg0")),
    JSON.parse(this.getAttribute("data-legacy-click-arg1")),
  );
});

EduLegacyEvents.register("schedule-timetable:2", function (event) {
  document.querySelector(".week-settings").open = true;
  document.querySelector(".week-settings").scrollIntoView({ block: "start" });
});

EduLegacyEvents.register("schedule-timetable:3", function (event) {
  state.masterFilter = this.value || null;
  render();
});

EduLegacyEvents.register("schedule-timetable:4", function (event) {
  return selectScheduleDay(
    JSON.parse(this.getAttribute("data-legacy-click-arg1")),
  );
});

EduLegacyEvents.register("schedule-timetable:5", function (event) {
  return toggleActiveDay(
    JSON.parse(this.getAttribute("data-legacy-change-arg1")),
  );
});

EduLegacyEvents.register("schedule-timetable:6", function (event) {
  return changePeriods(-1);
});

EduLegacyEvents.register("schedule-timetable:7", function (event) {
  return changePeriods(1);
});

EduLegacyEvents.register("schedule-timetable:8", function (event) {
  return (document.getElementById("shamsiWeekStart").textContent = toShamsi(
    this.value,
  ));
});

EduLegacyEvents.register("schedule-timetable:9", function (event) {
  return saveWeekStartDate();
});

EduLegacyEvents.register("schedule-timetable:10", function (event) {
  return closeModal();
});

EduLegacyEvents.register("schedule-timetable:11", function (event) {
  return updateLessonOptions(this.getAttribute("data-legacy-change-arg1"));
});

EduLegacyEvents.register("schedule-timetable:12", function (event) {
  return closeModal();
});

EduLegacyEvents.register("schedule-timetable:13", function (event) {
  return updateSessionLessonOptions();
});

EduLegacyEvents.register("schedule-timetable:14", function (event) {
  return (document.getElementById("shamsiSessNew").textContent = toShamsi(
    this.value,
  ));
});

EduLegacyEvents.register("schedule-timetable:15", function (event) {
  return startSessionFromMaster(
    JSON.parse(this.getAttribute("data-legacy-click-arg6")),
    JSON.parse(this.getAttribute("data-legacy-click-arg7")),
  );
});

EduLegacyEvents.register("schedule-timetable:16", function (event) {
  return openExistingSession(this.getAttribute("data-legacy-click-arg0"));
});
// Event handlers extracted from src/legacy/schedule/timetable.js.
EduLegacyEvents.register("schedule-timetable:17", function (event) {
  return openMasterConfig(
    JSON.parse(this.getAttribute("data-legacy-click-arg7")),
    JSON.parse(this.getAttribute("data-legacy-click-arg8")),
  );
});

EduLegacyEvents.register("schedule-timetable:18", function (event) {
  return saveMasterConfig(
    JSON.parse(this.getAttribute("data-legacy-click-arg5")),
    JSON.parse(this.getAttribute("data-legacy-click-arg6")),
  );
});
// Event handlers extracted from src/legacy/schedule/timetable.js.
EduLegacyEvents.register("schedule-timetable:19", function (event) {
  return clearMasterConfig(
    JSON.parse(this.getAttribute("data-legacy-click-arg7")),
    JSON.parse(this.getAttribute("data-legacy-click-arg8")),
  );
});
