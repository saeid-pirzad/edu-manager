(function () {
  "use strict";
  const label = document.getElementById("deputyOfflineStatus"),
    install = document.getElementById("deputyInstall");
  let invitation = null,
    registration = null,
    generation = 0,
    offlineReady = false;
  const bar = document.getElementById("deputyOfflineBar"),
    dialog = document.getElementById("deputyInstallDialog"),
    helpButton = document.getElementById("deputyHelp");
  const installed = () =>
    matchMedia("(display-mode: standalone)").matches || !!navigator.standalone;
  if (install)
    install.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></svg><span>نصب برنامه</span>';
  install?.setAttribute("aria-label", "نصب کارتابل معاون روی دستگاه");
  if (helpButton)
    helpButton.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg><span>نصب و راهنما</span>';
  helpButton?.addEventListener("click", () => {
    document.getElementById("deputyInstallBody").innerHTML =
      window.EduOfflineHelp.html(installed());
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.focus({ preventScroll: true });
    }
    document.getElementById("deputyInstallBody").scrollTop = 0;
  });
  const closeHelp = () => dialog?.close();
  document
    .getElementById("deputyHelpClose")
    ?.addEventListener("click", closeHelp);
  document
    .getElementById("deputyHelpDone")
    ?.addEventListener("click", closeHelp);
  dialog?.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeHelp();
  });
  const message = (value) => {
    if (label) {
      label.textContent = value;
      label.title = value;
    }
    const readiness = document.getElementById("deputyInstallReadiness");
    if (readiness) readiness.textContent = value;
  };

  const updateButton = document.getElementById("deputyUpdate");
  let pendingUpdate = false,
    preparingUpdate = false,
    updateTimer = null,
    locked = [];
  if (updateButton)
    updateButton.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></svg><span>نسخه جدید آماده است</span>';
  function paintUpdate() {
    if (updateButton) updateButton.hidden = !registration?.waiting;
  }
  function unlock() {
    for (const { node, inert, disabled } of locked) {
      node.inert = inert;
      if (disabled !== undefined) node.disabled = disabled;
    }
    locked = [];
  }
  updateButton?.addEventListener("click", async () => {
    if (pendingUpdate || preparingUpdate) return;
    preparingUpdate = true;
    try {
      if (!registration?.waiting) {
        await registration?.update();
        paintUpdate();
        if (!registration?.waiting) return;
      }
      updateButton.disabled = true;
      message("در حال ذخیره ویرایش‌ها پیش از به‌روزرسانی…");
      if (typeof window.EduDeputyUI?.prepareForUpdate !== "function")
        throw Error("کارتابل هنوز برای به‌روزرسانی آماده نیست.");
      await window.EduDeputyUI.prepareForUpdate();
      if (
        !confirm(
          "ویرایش‌های این پنجره ذخیره شدند. نسخه جدید در همین پنجره باز شود؟",
        )
      ) {
        message(
          offlineReady
            ? "آماده اجرای آفلاین"
            : "در حال آماده‌سازی اجرای آفلاین…",
        );
        return;
      }
      await window.EduDeputyUI.prepareForUpdate();
      locked = [
        "deputyApp",
        "deputyAboutDialog",
        "deputyInstallDialog",
        "deputyInstall",
        "deputyHelp",
      ]
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((node) => ({
          node,
          inert: node.inert,
          disabled: "disabled" in node ? node.disabled : undefined,
        }));
      for (const { node, disabled } of locked) {
        node.inert = true;
        if (disabled !== undefined) node.disabled = true;
      }
      pendingUpdate = true;
      message("در حال اعمال نسخه جدید…");
      updateTimer = setTimeout(() => {
        pendingUpdate = false;
        updateButton.disabled = false;
        unlock();
        message(
          "اعمال نسخه کامل نشد؛ برنامه را با اینترنت دوباره باز کنید و تلاش کنید.",
        );
      }, 15000);
      registration.waiting.postMessage({ type: "APPLY_UPDATE" });
    } catch (error) {
      pendingUpdate = false;
      clearTimeout(updateTimer);
      unlock();
      message(error.message || "ابتدا ویرایش‌های ذخیره‌نشده را بررسی کنید.");
    } finally {
      preparingUpdate = false;
      if (!pendingUpdate) updateButton.disabled = false;
    }
  });

  async function status() {
    paintUpdate();
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
      offlineReady = event.data?.ready === true;
      if (bar) {
        bar.dataset.ready = String(offlineReady);
        bar.dataset.offlineReady = String(offlineReady);
      }
      message(
        offlineReady
          ? navigator.onLine
            ? "آماده اجرای آفلاین"
            : "آفلاین — اطلاعات روی دستگاه ذخیره می‌شود"
          : "دریافت فایل‌های آفلاین هنوز کامل نشده است.",
      );
    };
    worker.postMessage({ type: "OFFLINE_STATUS" }, [channel.port2]);
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    invitation = installed() ? null : event;
    if (install) install.hidden = !invitation;
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
    invitation = null;
    if (install) install.hidden = true;
  });
  window.addEventListener("online", () => {
    if (offlineReady) void status();
  });
  window.addEventListener("offline", () => {
    if (offlineReady) message("آفلاین — اطلاعات روی دستگاه ذخیره می‌شود");
  });
  window.addEventListener("load", async () => {
    if (location.protocol === "file:") {
      message("فایل مستقل آفلاین؛ نصب استاندارد PWA از لینک امن انجام می‌شود.");
      return;
    }
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      message("نصب آفلاین به مرورگر جدید و لینک HTTPS نیاز دارد.");
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (pendingUpdate) {
        clearTimeout(updateTimer);
        location.reload();
      } else void status();
    });
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type !== "UPDATE_BLOCKED") return;
      clearTimeout(updateTimer);
      pendingUpdate = false;
      updateButton.disabled = false;
      unlock();
      message("به‌روزرسانی متوقف شد: برنامه در پنجره دیگری باز است.");
    });
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
          paintUpdate();
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
