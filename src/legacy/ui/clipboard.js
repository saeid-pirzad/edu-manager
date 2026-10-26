function copyToClipboard(text, btn) {
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
function showSuccessCopy(btn) {
  if (!btn) return;
  const old = btn.textContent;
  btn.textContent = "✅ کپی شد!";
  setTimeout(() => (btn.textContent = old), 2000);
}
function showTextModal(text) {
  let h = `<p class="muted" style="margin-top:0">مرورگر شما اجازه کپی خودکار را نداد. لطفاً متن زیر را انتخاب کرده و دستی کپی کنید:</p>
    <textarea class="report-text-area" readonly data-legacy-click="ui-clipboard:0">${text}</textarea>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button data-legacy-click="ui-clipboard:1">بستن</button></div>`;
  showModal("متن گزارش", h);
}

// ==================== صفحه گزارش ====================
