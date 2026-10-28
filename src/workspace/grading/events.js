function filterAssessmentRows(root) {
  const normalize = (value) =>
    String(value)
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/‌/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const query = normalize(root.querySelector("[data-assessment-search]").value);
  const incompleteOnly = !!root.querySelector("[data-assessment-incomplete]")
    ?.checked;
  let visible = 0;
  const activePanel =
    root.querySelector("[data-module-panel]:not([hidden])") || root;
  for (const row of activePanel.querySelectorAll("[data-assessment-name]")) {
    row.hidden =
      !normalize(row.dataset.assessmentName).includes(query) ||
      (incompleteOnly && row.dataset.assessmentComplete === "true");
    if (!row.hidden) visible++;
  }
  const message = root.querySelector(".gradebook-no-results");
  message.hidden = (!query && !incompleteOnly) || visible > 0;
  message.textContent =
    incompleteOnly && !query
      ? "همه نمره‌های این مرحله تکمیل شده‌اند."
      : "دانش‌آموزی با این مشخصات پیدا نشد.";
}
function installGradeEvents() {
  const isEditableGrade = (input) =>
    input?.matches?.('input[data-grade="1"]') &&
    !input.matches(":disabled") &&
    !input.closest("[inert]");
  document.addEventListener("input", (event) => {
    if (event.target.dataset?.assessmentSearch !== undefined) {
      const root = event.target.closest(".gradebook");
      if (!root || event.target.closest("[inert]")) return;
      filterAssessmentRows(root);
      return;
    }
    if (isEditableGrade(event.target)) gradeInput(event.target);
  });
  document.addEventListener("change", (event) => {
    if (event.target.dataset?.assessmentIncomplete === undefined) return;
    const root = event.target.closest(".gradebook");
    if (root && !event.target.closest("[inert]")) filterAssessmentRows(root);
  });
  document.addEventListener("keydown", (event) => {
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey)
      return;
    if (event.key !== "Enter") return;
    const input = event.target;
    if (!isEditableGrade(input)) return;
    if (input.getAttribute?.("aria-invalid") === "true") {
      event.preventDefault();
      return;
    }
    const root = input.closest(".gradebook");
    if (!root) return;
    const fields = [...root.querySelectorAll("input[data-grade]")].filter(
      (field) =>
        !field.disabled &&
        !field.readOnly &&
        !field.closest("[hidden]") &&
        field.getClientRects().length,
    );
    const index = fields.indexOf(input);
    if (index < 0) return;
    const next = fields[index + (event.shiftKey ? -1 : 1)];
    event.preventDefault();
    if (next) {
      next.focus({ preventScroll: true });
      next.select();
      next.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
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
