function installGradeEvents() {
  const isEditableGrade = (input) =>
    input?.matches?.('input[data-grade="1"]') &&
    !input.matches(":disabled") &&
    !input.closest("[inert]");
  document.addEventListener("input", (event) => {
    if (event.target.dataset?.assessmentSearch !== undefined) {
      const root = event.target.closest(".gradebook");
      if (!root || event.target.closest("[inert]")) return;
      const normalize = (value) => String(value).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").trim();
      const query = normalize(event.target.value);
      let visible = 0;
      for (const row of root.querySelectorAll("[data-assessment-name]")) {
        row.hidden = !normalize(row.dataset.assessmentName).includes(query);
        if (!row.hidden) visible++;
      }
      root.querySelector(".gradebook-no-results").hidden = !query || visible > 0;
      return;
    }
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
