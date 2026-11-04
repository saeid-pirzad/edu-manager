// Feedback stays with the editor that started the write, including after a re-render.
let pendingModalSaveScope = null;
function modalSaveFeedbackTarget() {
  const body = document.querySelector?.("#modal:not(.hidden) #modalBody");
  if (!body) return null;
  const session = body.querySelector(".session-workspace");
  const input = body.querySelector("[data-grade]");
  if (!session && !input) return null;
  const scope = [
    typeof installationToken === "undefined" ? "" : installationToken,
    typeof workspace === "undefined" ? "" : workspace?.id,
  ];
  if (session)
    scope.push(
      "session",
      session.dataset.sessionId ||
        (typeof currentSessionId === "undefined" ? "" : currentSessionId),
    );
  else
    scope.push(
      "grades",
      input.dataset.assessmentContext || "",
      input.dataset.class,
      input.dataset.lesson,
    );
  return {
    scope: JSON.stringify(scope),
    host: session || input.closest(".gradebook") || body,
  };
}
function captureSaveFeedback() {
  return modalSaveFeedbackTarget()?.scope || null;
}
function paintModalSaveFeedback() {
  const target = modalSaveFeedbackTarget();
  if (!target) return;
  let notice = target.host.querySelector("[data-modal-save-feedback]");
  const pending = busy > 0 && pendingModalSaveScope === target.scope;
  const matching = status.feedbackScope === target.scope;
  if (!notice && !pending && !matching) return;
  if (!notice) {
    notice = document.createElement("p");
    notice.dataset.modalSaveFeedback = "";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    const heading = target.host.querySelector(
      ".session-context,.gradebook-heading",
    );
    if (heading) heading.after(notice);
    else target.host.prepend(notice);
  }
  notice.classList.add("modal-save-feedback", "no-print");
  notice.setAttribute("aria-atomic", "true");
  notice.textContent = pending
    ? "در حال ذخیره…"
    : matching
      ? status.message
      : "";
  notice.dataset.state = pending ? "pending" : matching ? status.type : "idle";
  notice.hidden = !notice.textContent;
}
function setStatus(message, type = "saved", feedbackScope = null) {
  status = { message, type, feedbackScope };
  paintStatus();
}

function paintStatus(feedbackScope) {
  if (arguments.length) pendingModalSaveScope = feedbackScope;
  const el = document.getElementById("saveStatus");
  if (el) {
    el.textContent = busy ? "در حال ذخیره…" : status.message;
    el.dataset.state = busy ? "pending" : status.type;
    el.hidden = !busy && (status.type === "saved" || !status.message);
  }
  paintModalSaveFeedback();
  if (!busy) pendingModalSaveScope = null;
  syncControlLocks();
}
