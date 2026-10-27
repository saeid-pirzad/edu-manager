function installCourseTableEvents() {
  const body = document.getElementById("modalBody");
  const change = (event) => {
    const control = event.target;
    if (control.dataset?.modulePicker !== undefined && !control.matches(":disabled") && !control.closest("[inert]")) {
      selectGradeModule(control);
      return;
    }
    if (
      !control.matches?.("select[data-course-gate]") ||
      !(body.contains(control) || app?.contains(control)) ||
      control.matches(":disabled") ||
      control.closest("[inert]")
    )
      return;
    const { lessonId, podId, studentId } = control.dataset;
    if (!lessonId || !podId || !studentId) return;
    void gate(lessonId, podId, studentId, control.value).catch(error);
  };
  body.addEventListener("change", change);
  const app = document.getElementById("app");
  if (app && app !== body) app.addEventListener("change", change);
}
