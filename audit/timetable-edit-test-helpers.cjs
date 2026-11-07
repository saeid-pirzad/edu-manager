"use strict";

// Keep this function self-contained: native browser audits serialize it into an
// isolated page. It must use the same visible button as a user, never an edit
// access flag or a production write API.
function unlockExistingTimetableForAudit() {
  const fail = (message) => {
      throw Error("Timetable edit audit: " + message);
    },
    visible = (element) => {
      if (
        !element?.isConnected ||
        element.closest("[hidden],[inert]") ||
        !element.getClientRects().length
      )
        return false;
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse"
      );
    },
    modal = document.getElementById("modal"),
    root = document.querySelector("#modalBody .week-config-editor");
  if (!modal || modal.classList.contains("hidden") || !visible(root))
    fail("the existing timetable dialog is not visible");
  if (root.dataset.configMode !== "view")
    fail("the existing timetable must initially be read-only");
  const selects = [...root.querySelectorAll("select")];
  if (!selects.length || !selects.every((select) => select.disabled))
    fail("all existing timetable fields must initially be locked");
  const button = root.querySelector(
    '[data-legacy-click="week-config-enable-edit"]',
  );
  if (
    button?.tagName !== "BUTTON" ||
    button.disabled ||
    button.matches(":disabled") ||
    !root.contains(button) ||
    !visible(button)
  )
    fail("the native edit button is unavailable");
  button.click();
  if (
    document.getElementById("modal") !== modal ||
    modal.classList.contains("hidden") ||
    document.querySelector("#modalBody .week-config-editor") !== root ||
    !visible(root)
  )
    fail("the timetable dialog changed while enabling editing");
  if (root.dataset.configMode !== "edit")
    fail("the native edit button did not enable editing");
  const unlocked = [...root.querySelectorAll("select")];
  if (
    unlocked.length !== selects.length ||
    !unlocked.every(
      (select, index) =>
        select === selects[index] && select.isConnected && !select.disabled,
    )
  )
    fail("the original timetable fields did not unlock");
  return true;
}

module.exports = { unlockExistingTimetableForAudit };
