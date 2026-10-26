// Event handlers extracted from src/legacy/ui/dashboard.js.
EduLegacyEvents.register("dashboard-open", function () {
  return this.dataset.kind === "school"
    ? goSchool(this.dataset.key)
    : goClass(this.dataset.key);
});
EduLegacyEvents.register("dashboard-delete", function () {
  return this.dataset.kind === "school"
    ? deleteSchool(this.dataset.key)
    : deleteClass(this.dataset.key);
});
EduLegacyEvents.register("dashboard-task", function () {
  return this.dataset.task === "session"
    ? dashboardOpenSession(this.dataset.key)
    : dashboardReviewGrades(this.dataset.key);
});
EduLegacyEvents.register("dashboard-agenda", function () {
  return this.dataset.session
    ? dashboardOpenSession(this.dataset.session)
    : dashboardStartSession(
        Number(this.dataset.day),
        Number(this.dataset.period),
        this.dataset.date,
      );
});
EduLegacyEvents.register("ui-dashboard:0", function (event) {
  return filterDashboardEntities(this);
});

EduLegacyEvents.register("ui-dashboard:1", function (event) {
  return openReportScope(
    this.getAttribute("data-legacy-click-arg7"),
    this.getAttribute("data-legacy-click-arg8"),
    this.getAttribute("data-legacy-click-arg9"),
  );
});

EduLegacyEvents.register("ui-dashboard:2", function (event) {
  return dashboardDailyReport();
});

EduLegacyEvents.register("ui-dashboard:3", function (event) {
  return goMaster();
});
// Event handlers extracted from src/legacy/ui/dashboard.js.
EduLegacyEvents.register("ui-dashboard:4", function (event) {
  return EduV24.openEntityEditor(
    this.getAttribute("data-legacy-click-arg15"),
    this.getAttribute("data-legacy-click-arg16"),
    this.getAttribute("data-legacy-click-arg17"),
  );
});
