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

EduLegacyEvents.register("reports-periodic-document:deputy", function () {
  return EduPeriodicReports.output("deputy");
});

EduLegacyEvents.register("reports-periodic-document:xlsx", function () {
  return EduPeriodicReports.output("xlsx");
});

EduLegacyEvents.register("reports-periodic-document:xlsx-share", function () {
  return EduPeriodicReports.output("xlsx-share");
});

EduLegacyEvents.register("reports-periodic-document:share-file", function () {
  return EduPeriodicReports.sharePreparedExcel(this);
});

EduLegacyEvents.register(
  "reports-periodic-document:download-file",
  function () {
    return EduPeriodicReports.downloadPreparedExcel();
  },
);
