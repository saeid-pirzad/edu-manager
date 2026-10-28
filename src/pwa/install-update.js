(function () {
  "use strict";
  let registration,
    installEvent,
    pendingUpdate = false,
    offlineReady = false;
  let updateMessage = "",
    updateTimer;
  function text(message) {
    const el = document.getElementById("mobileStatus");
    if (el) el.textContent = message;
  }
  function paint() {
    if (!document.getElementById("mobileInstall")) return;
    if (location.protocol === "file:") {
      text("فایل مستقل آفلاین؛ نصب PWA از لینک امن انجام می‌شود.");
      return;
    }
    const status = offlineReady
      ? navigator.onLine
        ? "آماده اجرای آفلاین"
        : "آفلاین — اطلاعات روی دستگاه ذخیره می‌شود"
      : "در حال آماده‌سازی اجرای آفلاین…";
    text(updateMessage || status);
    document.getElementById("mobileBar").dataset.offlineReady =
      String(offlineReady);
    document.getElementById("mobileBar").dataset.updateError =
      String(!!updateMessage);
    document.getElementById("mobileInstall").hidden =
      !installEvent ||
      matchMedia("(display-mode: standalone)").matches ||
      !!navigator.standalone;
    document.getElementById("mobileUpdate").hidden = !registration?.waiting;
  }

  const installNoticeKey = "edu-manager:pwa-notice:v1";
  const isInstalled = () =>
    matchMedia("(display-mode: standalone)").matches || !!navigator.standalone;
  function rememberInstallNotice() {
    try {
      localStorage.setItem(installNoticeKey, "seen");
    } catch {}
  }
  function closeInstallNotice() {
    const d = document.getElementById("pwaWelcome");
    if (d) {
      d.close?.();
      d.remove();
    }
  }
  function paintInstallNotice() {
    const button = document.getElementById("pwaWelcomeInstall");
    if (button)
      button.textContent = installEvent
        ? "نصب برنامه روی دستگاه"
        : "راهنمای نصب روی دستگاه";
    const status = document.getElementById("pwaWelcomeStatus");
    if (status)
      status.textContent = offlineReady
        ? "✓ فایل‌های برنامه برای اجرای آفلاین ذخیره شدند."
        : "در حال دریافت فایل‌های اجرای آفلاین؛ فعلاً اینترنت را متصل نگه دارید.";
  }
  async function requestInstall() {
    if (!installEvent) {
      closeInstallNotice();
      help();
      return;
    }
    const event = installEvent;
    installEvent = null;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        rememberInstallNotice();
        closeInstallNotice();
      }
    } catch {
      closeInstallNotice();
      help();
    }
    paint();
    paintInstallNotice();
  }
  function firstVisitInstall() {
    if (location.protocol === "file:" || !isSecureContext || isInstalled())
      return;
    try {
      if (localStorage.getItem(installNoticeKey) === "seen") return;
    } catch {}
    const d = document.createElement("dialog");
    d.id = "pwaWelcome";
    d.setAttribute("aria-labelledby", "pwaWelcomeTitle");
    d.style.cssText =
      "box-sizing:border-box;direction:rtl;font-family:IRANSans,Tahoma,sans-serif;width:min(440px,calc(100% - 24px));max-height:calc(100dvh - 32px);overflow:auto;border:0;border-radius:20px;padding:24px;color:#1e293b;background:#fff;box-shadow:0 16px 64px #0004;line-height:1.9";
    d.innerHTML =
      '<h2 id="pwaWelcomeTitle" style="font-size:1.2rem;margin:0 0 12px">برنامه را روی دستگاهت نصب کن</h2><p>برای دسترسی از صفحه اصلی و استفاده بدون اینترنت، کلاس‌یار را نصب کن.</p><p id="pwaWelcomeStatus" role="status" aria-live="polite"></p><p style="font-size:.9rem">در آیفون و آیپد: منوی اشتراک‌گذاری (Share) ← افزودن به صفحه اصلی (Add to Home Screen). در اندروید و رایانه از دکمه نصب یا منوی مرورگر استفاده کن.</p><div style="display:flex;flex-wrap:wrap;gap:8px"><button id="pwaWelcomeInstall" type="button" style="flex:1;min-height:44px">نصب برنامه روی دستگاه</button><button id="pwaWelcomeLater" type="button" class="ghost" style="min-height:44px">فعلاً ادامه می‌دهم</button></div>';
    document.body.append(d);
    d.querySelector("#pwaWelcomeInstall").onclick = requestInstall;
    d.querySelector("#pwaWelcomeLater").onclick = () => {
      rememberInstallNotice();
      closeInstallNotice();
    };
    d.addEventListener("cancel", () => {
      rememberInstallNotice();
    });
    if (d.showModal) d.showModal();
    else d.setAttribute("open", "");
    paintInstallNotice();
  }

  function shell() {
    const bar = document.createElement("aside");
    bar.className = "mobile-bar no-print";
    bar.id = "mobileBar";
    bar.setAttribute("aria-label", "وضعیت، نصب و به‌روزرسانی برنامه");
    const icon = (path) => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
    bar.innerHTML =
      '<strong>کلاس‌یار</strong><span id="mobileStatus" role="status" aria-live="polite"></span><div class="app-service-actions"><button type="button" id="mobileInstall" hidden>' + icon('M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5') + '<span>نصب برنامه</span></button><button type="button" id="mobileUpdate" hidden>' + icon('M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1') + '<span>نسخه جدید آماده است</span></button><button type="button" id="mobileHelp" class="ghost">' + icon('M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0') + '<span>نصب و راهنما</span></button></div>';
    document.body.prepend(bar);
    document.getElementById("mobileInstall").onclick = requestInstall;
    document.getElementById("mobileUpdate").onclick = update;
    document.getElementById("mobileHelp").onclick = help;
  }
  function help() {
    const installed =
      matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const html =
      '<div class="offline-help"><section class="offline-help-section"><h4>نصب روی دستگاه</h4><p>' +
      (installed
        ? "برنامه از آیکن نصب‌شده اجرا شده است."
        : "در اندروید و رایانه از گزینه «نصب برنامه» مرورگر استفاده کنید. در آیفون و آیپد از اشتراک‌گذاری و «افزودن به صفحه اصلی» استفاده کنید.") +
      '</p></section><section class="offline-help-section"><h4>استفاده بدون اینترنت</h4><p>دریافت اولیه و به‌روزرسانی به اینترنت نیاز دارد. بعد از نمایش <strong class="offline-ready-label">آماده اجرای آفلاین</strong>، برنامه بدون اینترنت باز می‌شود. یک بار از آیکن نصب‌شده باز کنید و آماده‌بودن را بررسی کنید.</p></section><section class="offline-help-section offline-help-storage"><h4>نگهداری و انتقال اطلاعات</h4><p>اطلاعات هر دستگاه و مرورگر جداست. برای انتقال اطلاعات، از داده‌ها «پشتیبان» بگیرید و فایل را در دستگاه دیگر بازیابی کنید. پاک‌کردن داده‌های مرورگر یا حذف برنامه ممکن است اطلاعات این دستگاه را پاک کند؛ فایل مستقل را نگه دارید.</p><p class="offline-help-note">این برنامه همگام‌سازی خودکار بین دستگاه‌ها ندارد.</p></section></div>';
    if (window.showModal) showModal("نصب و استفاده آفلاین", html);
    else
      alert(
        "پس از نمایش آماده اجرای آفلاین، برنامه را از منوی مرورگر روی صفحه اصلی نصب کنید.",
      );
  }
  let offlineStatusRequest = 0;
  async function status() {
    const request = ++offlineStatusRequest;
    const worker = navigator.serviceWorker.controller || registration?.active;
    if (!worker) return;
    if (worker.state !== "activated") {
      worker.addEventListener(
        "statechange",
        () => {
          if (worker.state === "activated") status();
        },
        { once: true },
      );
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => {
      if (
        request !== offlineStatusRequest ||
        (navigator.serviceWorker.controller &&
          worker !== navigator.serviceWorker.controller)
      ) {
        channel.port1.close();
        return;
      }
      offlineReady = e.data?.ready === true;
      paint();
      paintInstallNotice();
      channel.port1.close();
    };
    worker.postMessage({ type: "OFFLINE_STATUS" }, [channel.port2]);
  }

  async function update() {
    if (pendingUpdate) return;
    const button = document.getElementById("mobileUpdate");
    try {
      if (!registration?.waiting) {
        await registration?.update();
        if (!registration?.waiting) {
          updateMessage =
            "هنوز نسخه جدید برای اعمال آماده نیست؛ چند لحظه دیگر تلاش کنید.";
          paint();
          return;
        }
      }
      button.disabled = true;
      updateMessage = "در حال ذخیره ویرایش‌ها پیش از به‌روزرسانی…";
      paint();
      await window.EduV24?.flushDrafts({ strict: true });
      if (
        !confirm(
          "ویرایش‌های این پنجره ذخیره شدند. نسخه جدید در همین پنجره باز شود؟",
        )
      ) {
        updateMessage = "";
        button.disabled = false;
        paint();
        return;
      }
      pendingUpdate = true;
      updateMessage = "در حال اعمال نسخه جدید…";
      paint();
      updateTimer = setTimeout(() => {
        pendingUpdate = false;
        button.disabled = false;
        updateMessage =
          "اعمال نسخه کامل نشد؛ برنامه را با اینترنت دوباره باز کنید و تلاش کنید.";
        paint();
      }, 15000);
      registration.waiting.postMessage({ type: "APPLY_UPDATE" });
    } catch (e) {
      clearTimeout(updateTimer);
      pendingUpdate = false;
      button.disabled = false;
      updateMessage = e.message || "ابتدا ویرایش‌های ذخیره‌نشده را بررسی کنید.";
      paint();
    }
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e;
    paint();
    paintInstallNotice();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    rememberInstallNotice();
    closeInstallNotice();
    paint();
  });
  window.addEventListener("online", paint);
  window.addEventListener("offline", paint);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine)
      registration?.update().catch(() => {});
  });
  window.addEventListener("load", async () => {
    shell();
    firstVisitInstall();
    if (location.protocol === "file:") {
      text("فایل مستقل آفلاین؛ نصب استاندارد PWA از لینک امن انجام می‌شود.");
      return;
    }
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      text("نصب آفلاین به مرورگر جدید و لینک HTTPS نیاز دارد.");
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (pendingUpdate) {
        clearTimeout(updateTimer);
        location.reload();
      } else status();
    });
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "UPDATE_BLOCKED") {
        clearTimeout(updateTimer);
        pendingUpdate = false;
        document.getElementById("mobileUpdate").disabled = false;
        updateMessage = "به‌روزرسانی متوقف شد: برنامه در پنجره دیگری باز است.";
        paint();
        if (window.showModal)
          showModal(
            "برای به‌روزرسانی، پنجره‌های دیگر را ببندید",
            "<p>این برنامه هم‌زمان در بیش از یک تب یا پنجره باز است. پنجره نصب‌شده روی گوشی هم محسوب می‌شود.</p><p>ویرایش‌ها را ذخیره کنید؛ همه پنجره‌های دیگر این برنامه را ببندید، فقط همین پنجره را نگه دارید و دوباره «نسخه جدید آماده است» را بزنید.</p><p>حذف برنامه یا پاک‌کردن اطلاعات مرورگر لازم نیست.</p>",
          );
      }
    });
    try {
      registration = await navigator.serviceWorker.register(
        "./service-worker.js",
        { updateViaCache: "none" },
      );
      function watchInstalling() {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") {
            paint();
            status();
          }
          if (worker.state === "redundant" && !offlineReady)
            text(
              "دانلود آفلاین کامل نشد؛ اینترنت را بررسی و دوباره تلاش کنید.",
            );
        });
      }
      registration.addEventListener("updatefound", watchInstalling);
      watchInstalling();
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("Offline setup timed out")), 30000),
        ),
      ]);
      await status();
      paint();
    } catch (e) {
      text(
        "آماده‌سازی آفلاین کامل نشد؛ اینترنت را بررسی و برنامه را دوباره باز کنید.",
      );
    }
  });
  window.EduPWA = {
    getStatus: () => ({
      offlineReady,
      waiting: !!registration?.waiting,
      installed:
        matchMedia("(display-mode: standalone)").matches ||
        !!navigator.standalone,
    }),
    help,
  };
})();
