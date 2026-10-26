// Event handlers extracted from src/legacy/ui/clipboard.js.
EduLegacyEvents.register("ui-clipboard:0", function (event) {
  return this.select();
});

EduLegacyEvents.register("ui-clipboard:1", function (event) {
  return closeModal();
});
