function installCourseTableEvents() {
  const body = document.getElementById("modalBody");
  body.addEventListener("change", (event) => {
    const control = event.target;
    if (
      !control.matches?.("select[data-course-gate]") ||
      !body.contains(control) ||
      control.matches(":disabled") ||
      control.closest("[inert]")
    )
      return;
    const { lessonId, podId, studentId } = control.dataset;
    if (!lessonId || !podId || !studentId) return;
    void gate(lessonId, podId, studentId, control.value).catch(error);
  });
}
