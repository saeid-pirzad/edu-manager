// Event handlers extracted from src/reports/periodic/render.js.
EduLegacyEvents.register("reports-periodic-render:0", function (event) {
  return EduPeriodicReports.set("audience", this.value);
});

EduLegacyEvents.register("reports-periodic-render:1", function (event) {
  return EduPeriodicReports.set("date", this.value);
});

EduLegacyEvents.register("reports-periodic-render:2", function (event) {
  return EduPeriodicReports.set("schoolId", this.value);
});

EduLegacyEvents.register("reports-periodic-render:3", function (event) {
  return EduPeriodicReports.set("classId", this.value);
});

EduLegacyEvents.register("reports-periodic-render:4", function (event) {
  return EduPeriodicReports.set(
    this.getAttribute("data-legacy-change-arg2"),
    this.value,
  );
});

EduLegacyEvents.register("reports-periodic-render:5", function (event) {
  return EduPeriodicReports.set("studentId", this.value);
});

EduLegacyEvents.register("reports-periodic-render:6", function (event) {
  return EduPeriodicReports.set("detailLevel", this.value);
});

EduLegacyEvents.register("reports-periodic-render:7", function (event) {
  return EduPeriodicReports.author(this.value);
});

EduLegacyEvents.register("reports-periodic-render:8", function (event) {
  return EduPeriodicReports.note(this.value);
});

EduLegacyEvents.register("reports-periodic-render:9", function (event) {
  return EduPeriodicReports.generate();
});
