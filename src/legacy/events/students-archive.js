// Event handlers extracted from src/legacy/students/archive.js.
EduLegacyEvents.register("students-archive:0", function (event) {
  return showArchivedKarnameh(this.dataset.id);
});

EduLegacyEvents.register("students-archive:1", function (event) {
  return restoreStudent(this.dataset.id);
});
