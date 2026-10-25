"use strict";
module.exports = async function headerEvents() {
  const results = [];
  const check = (id, name, pass) => results.push({ id, name, pass: !!pass, observed: {} });
  const button = action => document.querySelector('#app button[data-header-action="' + action + '"]');
  document.getElementById("pwaWelcomeLater")?.click();
  closeModal();
  goSchools();
  button("reports").querySelector("span").click();
  check("H01", "nested header content delegates navigation after rendering", state.view === "reports");
  button("master").click();
  check("H02", "delegated header survives full header replacement", state.view === "master");
  button("toggle-data").click();
  check("H03", "data menu stays open despite document outside-click listener",
    document.getElementById("dataMenu").classList.contains("open") &&
    document.getElementById("dataMenuButton").getAttribute("aria-expanded") === "true");
  button("toggle-data").click();
  check("H04", "second delegated toggle closes data menu",
    !document.getElementById("dataMenu").classList.contains("open"));
  const settings = button("settings");
  const navigation = settings.closest(".navigation-menu");
  if (navigation) navigation.open = true;
  settings.focus();
  settings.click();
  for (let attempt = 0; attempt < 100 && !document.getElementById("settingsEditor"); attempt++)
    await new Promise(resolve => setTimeout(resolve, 10));
  check("H05", "delegated settings button opens the editor", !!document.getElementById("settingsEditor"));
  closeModal();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  check("H06", "closing settings restores focus to a visible header action or mobile menu toggle",
    document.activeElement === button("settings") ||
    document.activeElement === document.getElementById("headerNavigationToggle"));
  results.at(-1).observed = { activeId: document.activeElement?.id };
  await openSettingsModal();
  const passwordBefore = db.settings.password;
  const settingsForm = document.getElementById("settingsEditor");
  const submit = new Event("submit", { bubbles: true, cancelable: true });
  settingsForm.dispatchEvent(submit);
  for (let attempt = 0; attempt < 100 && !document.getElementById("modal").classList.contains("hidden"); attempt++)
    await new Promise(resolve => setTimeout(resolve, 10));
  check("H07", "settings submit listener prevents navigation and completes a no-op save",
    submit.defaultPrevented && document.getElementById("modal").classList.contains("hidden") &&
    db.settings.password === passwordBefore);
  await openSettingsModal();
  document.querySelector("#settingsEditor [data-settings-cancel]").click();
  check("H08", "reopened settings cancellation closes without changing the password",
    document.getElementById("modal").classList.contains("hidden") && db.settings.password === passwordBefore);
  goSchools();
  return results;
};
