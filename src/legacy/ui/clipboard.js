function copyToClipboard(text, btn, html) {
  if (
    html &&
    window.isSecureContext &&
    navigator.clipboard?.write &&
    typeof ClipboardItem === "function"
  ) {
    Promise.resolve()
      .then(() =>
        navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]),
      )
      .then(() => showSuccessCopy(btn))
      .catch(() => copyToClipboard(text, btn));
    return;
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(() => showSuccessCopy(btn))
      .catch(() => fallbackCopyTextToClipboard(text, btn));
  } else {
    fallbackCopyTextToClipboard(text, btn);
  }
}
function fallbackCopyTextToClipboard(text, btn) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.width = "2em";
  textArea.style.height = "2em";
  textArea.style.padding = "0";
  textArea.style.border = "none";
  textArea.style.outline = "none";
  textArea.style.boxShadow = "none";
  textArea.style.background = "transparent";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    if (document.execCommand("copy")) showSuccessCopy(btn);
    else showTextModal(text);
  } catch (err) {
    showTextModal(text);
  }
  document.body.removeChild(textArea);
}
const copyFeedbackStates = new WeakMap();

function showSuccessCopy(btn) {
  if (!btn) return;
  let state = copyFeedbackStates.get(btn);
  if (!state) {
    state = { nodes: [...btn.childNodes], timer: null, generation: 0 };
    const feedback = document.createElement("span"),
      label = document.createElement("span"),
      check = globalThis.EduIcons?.html?.("check") || "";
    feedback.className = "control-copy-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    if (check) {
      const icon = document.createElement("span");
      icon.className = "control-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = check;
      feedback.append(icon);
    }
    label.className = "ui-button-label";
    label.textContent = "کپی شد";
    feedback.append(label);
    copyFeedbackStates.set(btn, state);
    btn.dataset.copyState = "done";
    btn.replaceChildren(feedback);
  }
  clearTimeout(state.timer);
  const generation = ++state.generation;
  state.timer = setTimeout(() => {
    if (
      copyFeedbackStates.get(btn) !== state ||
      state.generation !== generation
    )
      return;
    btn.replaceChildren(...state.nodes);
    delete btn.dataset.copyState;
    copyFeedbackStates.delete(btn);
  }, 2000);
}
function showTextModal(text) {
  let h = `<p class="muted" style="margin-top:0">مرورگر شما اجازه کپی خودکار را نداد. لطفاً متن زیر را انتخاب کرده و دستی کپی کنید:</p>
    <textarea class="report-text-area" readonly data-legacy-click="ui-clipboard:0">${esc(text)}</textarea>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button data-legacy-click="ui-clipboard:1">بستن</button></div>`;
  showModal("متن گزارش", h);
}

// ==================== صفحه گزارش ====================
