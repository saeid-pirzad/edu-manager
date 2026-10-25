"use strict";

// Delegation survives header replacement; tokens are not executable code.
(() => {
  const app = document.getElementById("app");
  const actions = new Map([
    ["schools", () => goSchools()],
    ["reports", () => goReports()],
    ["master", () => goMaster()],
    ["settings", () => openSettingsModal()],
    ["toggle-data", event => toggleDataMenu(event)],
    ["export", () => { closeDataMenu(); exportBackup(); }],
    ["import", () => { closeDataMenu(); document.getElementById("importFile").click(); }],
    ["wipe", () => { closeDataMenu(); wipeAllData(); }],
  ]);
  app.addEventListener("click", event => {
    const button = event.target.closest?.("button[data-header-action]");
    if (!button || !app.contains(button) || !button.closest(".topbar") ||
        button.disabled || button.closest("[inert]")) return;
    const action = actions.get(button.dataset.headerAction);
    if (action) action(event);
  });
})();
