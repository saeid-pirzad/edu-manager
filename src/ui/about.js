"use strict";

function openAboutDialog() {
  closeDataMenu();
  const opened = showModal(
    "درباره کلاس‌یار و ارتباط با ما",
    window.EduAbout.html(),
  );
  if (opened !== false) document.getElementById("modalBody").scrollTop = 0;
}

document.addEventListener("click", (event) => {
  const control = event.target.closest?.("button[data-about-action]");
  if (
    control?.dataset.aboutAction === "open" &&
    !control.disabled &&
    !control.closest("[inert]") &&
    control.closest("#app .schools-welcome")
  ) {
    openAboutDialog();
    return;
  }
  if (!control || control.disabled || !control.closest("#modalBody .about-app"))
    return;
  if (control.dataset.aboutAction === "close") closeModal();
  else if (control.dataset.aboutAction === "offline") window.EduPWA?.help();
});
