// Event handlers extracted from src/reports/periodic/document.js.
EduLegacyEvents.register("reports-periodic-document:0", function (event) {
  return EduPeriodicReports.output("print");
});

EduLegacyEvents.register("reports-periodic-document:1", function (event) {
  return EduPeriodicReports.output("txt");
});

EduLegacyEvents.register("reports-periodic-document:2", function (event) {
  return EduPeriodicReports.output("json");
});
