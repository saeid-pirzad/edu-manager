// Event handlers extracted from src/legacy/grading/bulk-editor.js.
EduLegacyEvents.register("grading-bulk-editor:0", function (event) {
  return toggleUnitApplyDirect(
    this.getAttribute("data-legacy-change-arg3"),
    this.getAttribute("data-legacy-change-arg4"),
    this.getAttribute("data-legacy-change-arg5"),
    "pos",
    this.checked,
  );
});

EduLegacyEvents.register("grading-bulk-editor:1", function (event) {
  return toggleUnitApplyDirect(
    this.getAttribute("data-legacy-change-arg7"),
    this.getAttribute("data-legacy-change-arg8"),
    this.getAttribute("data-legacy-change-arg9"),
    "neg",
    this.checked,
  );
});

EduLegacyEvents.register("grading-bulk-editor:2", function (event) {
  return toggleUnitApplyDirect(
    this.getAttribute("data-legacy-change-arg11"),
    this.getAttribute("data-legacy-change-arg12"),
    this.getAttribute("data-legacy-change-arg13"),
    "hw",
    this.checked,
  );
});

EduLegacyEvents.register("grading-bulk-editor:3", function (event) {
  return toggleUnitApplyDirect(
    this.getAttribute("data-legacy-change-arg15"),
    this.getAttribute("data-legacy-change-arg16"),
    this.getAttribute("data-legacy-change-arg17"),
    "present",
    this.checked,
  );
});

EduLegacyEvents.register("grading-bulk-editor:4", function (event) {
  return toggleUnitApplyDirect(
    this.getAttribute("data-legacy-change-arg19"),
    this.getAttribute("data-legacy-change-arg20"),
    this.getAttribute("data-legacy-change-arg21"),
    "late",
    this.checked,
  );
});

EduLegacyEvents.register("grading-bulk-editor:5", function (event) {
  return saveBulkScore(
    this.getAttribute("data-legacy-change-arg3"),
    this.getAttribute("data-legacy-change-arg4"),
    this.getAttribute("data-legacy-change-arg5"),
    this.getAttribute("data-legacy-change-arg6"),
    "m",
    this.value,
  );
});

EduLegacyEvents.register("grading-bulk-editor:6", function (event) {
  return saveBulkScore(
    this.getAttribute("data-legacy-change-arg8"),
    this.getAttribute("data-legacy-change-arg9"),
    this.getAttribute("data-legacy-change-arg10"),
    this.getAttribute("data-legacy-change-arg11"),
    "p",
    this.value,
  );
});

EduLegacyEvents.register("grading-bulk-editor:7", function (event) {
  return closeModal();
});
