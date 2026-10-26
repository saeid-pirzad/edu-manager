function goSchools() {
  state = {
    view: "schools",
    schoolId: null,
    classId: null,
    lessonId: null,
    tab: "lessons",
    masterFilter: null,
    reportTab: "comprehensive",
  };
  render();
}
function goSchool(id) {
  state.view = "school";
  state.schoolId = id;
  state.classId = null;
  state.lessonId = null;
  render();
}
function goClass(id) {
  state.view = "class";
  state.classId = id;
  state.lessonId = null;
  state.tab = "lessons";
  render();
}
function goLesson(id) {
  state.view = "lesson";
  state.lessonId = id;
  state.tab = "sessions";
  render();
}
function backToClass() {
  state.view = "class";
  state.lessonId = null;
  state.tab = "lessons";
  render();
}
function goMaster(filterClassId) {
  state.view = "master";
  state.masterFilter = filterClassId || null;
  render();
}
function goReports() {
  state.view = "reports";
  state.reportTab = ["daily", "weekly", "monthly", "annual"].includes(
    state.reportTab,
  )
    ? state.reportTab
    : "daily";
  render();
}
function setTab(t) {
  state.tab = t;
  render();
}
function setReportTab(t) {
  state.reportTab = t;
  render();
}
