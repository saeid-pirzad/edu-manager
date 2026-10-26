// Event handlers extracted from src/ui/calendar.js.
EduLegacyEvents.register("ui-calendar:0", function (event) {
  event.stopPropagation();
  window.calChangeMonth(-1);
});

EduLegacyEvents.register("ui-calendar:1", function (event) {
  event.stopPropagation();
  window.calChangeMonth(1);
});

EduLegacyEvents.register("ui-calendar:2", function (event) {
  event.stopPropagation();
  window.calSelectDay(
    JSON.parse(this.getAttribute("data-legacy-click-arg5")),
    this,
  );
});

EduLegacyEvents.register("ui-calendar:3", function (event) {
  event.stopPropagation();
  closeShamsiCalendar(true);
});
