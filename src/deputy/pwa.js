(function () {
  "use strict";
  const label = document.getElementById("deputyOfflineStatus"),
    install = document.getElementById("deputyInstall");
  let invitation = null,
    registration = null,
    generation = 0;
  const message = (value) => {
    if (label) label.textContent = value;
  };
  async function status() {
    const worker = navigator.serviceWorker.controller || registration?.active;
    if (!worker) return;
    if (worker.state !== "activated") {
      worker.addEventListener(
        "statechange",
        () => {
          if (worker.state === "activated") void status();
        },
        { once: true },
      );
      return;
    }
    const request = ++generation,
      channel = new MessageChannel(),
      timer = setTimeout(() => {
        channel.port1.close();
        if (generation === request)
          message(
            "آمادگی آفلاین تأیید نشد؛ اتصال و بازشدن دوبارهٔ برنامه را بررسی کنید.",
          );
      }, 10000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      if (request !== generation) return;
      message(
        event.data?.ready === true
          ? "آمادهٔ اجرای آفلاین · اطلاعات فقط روی همین مرورگر ذخیره می‌شود."
          : "دریافت فایل‌های آفلاین هنوز کامل نشده است.",
      );
    };
    worker.postMessage({ type: "OFFLINE_STATUS" }, [channel.port2]);
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    invitation = event;
    if (install) install.hidden = false;
  });
  install?.addEventListener("click", async () => {
    if (!invitation) return;
    const event = invitation;
    invitation = null;
    install.hidden = true;
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      message("نصب انجام نشد؛ نسخهٔ مرورگر همچنان قابل استفاده است.");
    }
  });
  window.addEventListener("appinstalled", () => {
    if (install) install.hidden = true;
  });
  window.addEventListener("load", async () => {
    if (location.protocol === "file:") {
      message(
        "برای ذخیرهٔ مطمئن و نصب، کارتابل را از نشانی HTTPS یا سرور محلی باز کنید.",
      );
      return;
    }
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      message("اجرای آفلاین به محیط امن و مرورگر پشتیبان نیاز دارد.");
      return;
    }
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => void status(),
    );
    try {
      registration = await navigator.serviceWorker.register(
        "./service-worker.js",
        { updateViaCache: "none" },
      );
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(Error("آماده‌سازی آفلاین زمان‌بر شد.")),
            30000,
          ),
        ),
      ]);
      await status();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", () => {
          if (registration.waiting)
            message(
              "نسخهٔ جدید آماده است؛ پس از ذخیره و پشتیبان، پنجره‌های برنامه را ببندید و دوباره باز کنید.",
            );
          else void status();
        });
      });
    } catch {
      message(
        "آماده‌سازی آفلاین انجام نشد؛ اینترنت و مجوز مرورگر را بررسی کنید.",
      );
    }
  });
})();
