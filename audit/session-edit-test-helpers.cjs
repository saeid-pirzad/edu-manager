"use strict";

// Serialized into isolated browser contexts. Call only where a scenario intends
// to modify an existing record; never wrap every session opening with this.
async function unlockRecordedSessionForAudit(id) {
  const root = document.querySelector("#modalBody .session-workspace");
  if (
    !root ||
    root.dataset.sessionId !== id ||
    root.getClientRects().length === 0 ||
    root.dataset.sessionMode !== "view"
  )
    throw Error(
      "Expected a visible, view-only recorded session before editing",
    );
  const button = root.querySelector(
    '[data-workspace-action="session-toggle-edit"]',
  );
  if (!button || button.disabled || button.dataset.key !== id)
    throw Error("The actual recorded-session edit control is unavailable");
  button.click();
  // The real edit toggle is synchronous and performs no data write. Genuine
  // peer windows intentionally do not expose the development-only test API.
  await Promise.resolve();
  if (
    document.querySelector("#modalBody .session-workspace") !== root ||
    root.dataset.sessionMode !== "edit" ||
    button.getAttribute("aria-pressed") !== "true"
  )
    throw Error("The actual session edit action did not unlock this dialog");
}

async function installSessionEditTestHelper(evaluate) {
  await evaluate(
    "globalThis.__unlockRecordedSessionForAudit = " +
      unlockRecordedSessionForAudit.toString(),
  );
}

module.exports = {
  unlockRecordedSessionForAudit,
  installSessionEditTestHelper,
};
