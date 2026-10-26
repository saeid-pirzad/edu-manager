// Event handlers extracted from src/legacy/students/membership.js.
EduLegacyEvents.register("students-membership:0", function (event) {
  return closeModal();
});

EduLegacyEvents.register("students-membership:1", function (event) {
  return closeModal();
});

EduLegacyEvents.register("students-membership:2", function (event) {
  return doTransfer(this.getAttribute("data-legacy-click-arg0"), true);
});

EduLegacyEvents.register("students-membership:3", function (event) {
  return doTransfer(this.getAttribute("data-legacy-click-arg1"), false);
});
