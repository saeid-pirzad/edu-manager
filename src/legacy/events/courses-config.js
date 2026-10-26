// Event handlers extracted from src/legacy/courses/config.js.
EduLegacyEvents.register("courses-config:0", function (event) {
  document.getElementById("cfgTechnical").hidden = this.value === "kardanesh";
  document.getElementById("cfgKardanesh").hidden = this.value !== "kardanesh";
});

EduLegacyEvents.register("courses-config:1", function (event) {
  return closeModal();
});

EduLegacyEvents.register("courses-config:2", function (event) {
  return saveLessonConfig(this.getAttribute("data-legacy-click-arg0"));
});
