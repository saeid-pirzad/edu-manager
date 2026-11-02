// One popup owns its events in either application, without the teacher registry.
calPopup.addEventListener("click", function (event) {
  const button = event.target.closest("[data-calendar-action]");
  if (!button || !calPopup.contains(button) || button.disabled) return;
  event.stopPropagation();
  const action = button.dataset.calendarAction;
  if (action === "prev") window.calChangeMonth(-1);
  else if (action === "next") window.calChangeMonth(1);
  else if (action === "select")
    window.calSelectDay(Number(button.dataset.calendarDay));
  else if (action === "close") closeShamsiCalendar(true);
});
