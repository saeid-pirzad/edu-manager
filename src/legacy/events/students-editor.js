// Event handlers extracted from src/legacy/students/editor.js.
EduLegacyEvents.register("students-editor:0", function (event) {
  return closeModal();
});

EduLegacyEvents.register("students-editor:1", function (event) {
  return saveEditStudent(this.getAttribute("data-legacy-click-arg1"));
});
