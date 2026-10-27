async function openNames(lid) {
  const opened = await open(lid);
  if (opened === false) return;
  const section = document.getElementById("courseNames");
  if (!section || section.hidden) return;
  section.open = true;
  setTimeout(() => {
    if (!section.isConnected || !document.getElementById("courseEditor"))
      return;
    section
      .querySelector("input:not(:disabled)")
      ?.focus({ preventScroll: true });
    section.scrollIntoView({ block: "start" });
  }, 0);
}
function toggleBranch() {
  const branch = document.getElementById("course_branch");
  const method = document.getElementById("course_method");
  if (editing?.locked || method.disabled) return;
  method.value = branch.value === "kardanesh" ? "dual" : "modular";
  toggleMethod();
}
function toggleMethod() {
  const method = document.getElementById("course_method");
  const general = val("subjectType") === "general";
  if (general) method.value = "dual";
  method.closest("label").hidden = general;
  syncTheoryWeight();
  document.getElementById("course_branch").value =
    method.value === "dual" ? "kardanesh" : "fani";
  setControlDisabled(
    document.getElementById("course_branch"),
    !!editing?.locked || method.matches(":disabled"),
  );
  document.getElementById("courseDual").hidden =
    general || val("method") !== "dual";
  document.getElementById("courseModular").hidden = val("method") !== "modular";
  document.getElementById("courseAdvanced").hidden =
    val("method") !== "modular" || !!editing?.seed.poudmans.length;
  const names = document.getElementById("courseNames");
  if (names) names.hidden = val("method") !== "modular";
}
function syncTheoryWeight() {
  const value = api.asciiDigits(val("practicalWeight"));
  const numeric = Number(value);
  const valid =
    /^\d+(?:\.\d{1,6})?$/.test(value) && numeric >= 0 && numeric <= 100;
  document.getElementById("course_theoryWeight").value = valid
    ? String(Number((100 - numeric).toFixed(6)))
    : "";
}
function error(e) {
  if (!showRecordEditorError(e, "courseError")) api.error(e);
}
