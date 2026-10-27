function setStatus(message, type = "saved") {
  status = { message, type };
  paintStatus();
}

function paintStatus() {
  const el = document.getElementById("saveStatus");
  if (el) {
    el.textContent = busy ? "در حال ذخیره…" : status.message;
    el.dataset.state = busy ? "pending" : status.type;
    el.hidden = !busy && (status.type === "saved" || !status.message);
  }
  syncControlLocks();
}
