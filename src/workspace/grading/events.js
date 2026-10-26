function installGradeEvents() {
  const isEditableGrade = (input) =>
    input?.matches?.('input[data-grade="1"]') &&
    !input.matches(":disabled") &&
    !input.closest("[inert]");
  document.addEventListener("input", (event) => {
    if (isEditableGrade(event.target)) gradeInput(event.target);
  });
  // focusout bubbles, unlike the former inline blur handler.
  document.addEventListener("focusout", (event) => {
    if (isEditableGrade(event.target)) void flushDrafts().catch(() => {});
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("button[data-clear-grade]");
    if (!button || button.matches(":disabled") || button.closest("[inert]"))
      return;
    const input = button.previousElementSibling;
    if (isEditableGrade(input)) clearGrade(input);
  });
}
