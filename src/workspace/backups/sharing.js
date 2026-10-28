let backupShareSession = null;

function backupShareMessage(session, text, state = "ready") {
  if (backupShareSession !== session || !session.panel.isConnected) return;
  const message = session.panel.querySelector("[data-backup-share-status]");
  message.textContent = text;
  message.dataset.state = state;
  if (state === "error")
    session.panel.querySelector(
      '[data-workspace-action="prepare-share-backup"]',
    ).hidden = false;
}

function checkBackupShare(session) {
  if (
    backupShareSession !== session ||
    !session.panel.isConnected ||
    document.getElementById("modal").classList.contains("hidden")
  )
    throw Error("پنجره ارسال بسته شده است؛ پشتیبان را دوباره آماده کنید.");
  session.ensureCurrent();
  if (connection !== session.connection)
    throw Error("اتصال بانک تغییر کرده است؛ پشتیبان را دوباره آماده کنید.");
  if (session.context) assertWorkspaceContext(session.context);
}

async function openBackupShare() {
  const ensureCurrent = preserveAsyncTarget();
  const opened = showModal(
    "ارسال پشتیبان کامل",
    '<section class="backup-share" id="backupSharePanel"><header class="backup-share-heading"><span aria-hidden="true">' +
      EduIcons.html("shield") +
      "</span><div><h4>همه دوره‌ها، در یک فایل</h4><p>ابتدا فایل آماده می‌شود؛ سپس روش ارسال و گیرنده را خودتان انتخاب می‌کنید.</p></div></header>" +
      '<div class="backup-share-file" data-backup-share-file hidden></div><p class="backup-share-status" data-backup-share-status role="status" aria-live="polite">در حال آماده‌سازی و بررسی پشتیبان کامل…</p>' +
      '<p class="backup-share-note">این فایل اطلاعات همه دوره‌ها را دارد؛ آن را فقط برای گیرنده مورداعتماد بفرستید.</p>' +
      '<div class="backup-share-actions"><button type="button" data-workspace-action="share-backup-file" disabled hidden>انتخاب برنامه و ارسال فایل</button><button type="button" class="ghost" data-workspace-action="download-share-backup" disabled hidden>دریافت فایل برای ارسال دستی</button><button type="button" class="ghost" data-workspace-action="prepare-share-backup" hidden>آماده‌سازی دوباره</button><button type="button" class="ghost" data-workspace-action="close">بستن</button></div></section>',
  );
  if (opened === false) return false;
  const session = {
    panel: document.getElementById("backupSharePanel"),
    connection,
    ensureCurrent,
    context: null,
    file: null,
    blob: null,
    sharing: false,
  };
  backupShareSession = session;
  const modal = document.getElementById("modal"),
    observer = new MutationObserver(() => {
      if (!session.panel.isConnected || modal.classList.contains("hidden")) {
        session.file = null;
        session.blob = null;
        if (backupShareSession === session) backupShareSession = null;
        observer.disconnect();
      }
    });
  observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
  observer.observe(document.getElementById("modalBody"), { childList: true });
  try {
    const content = await snapshotInstallation();
    checkBackupShare(session);
    validateFullBackup(content);
    const capturedPeriod = content.stores.catalog.find(
      (row) => row.id === workspace.id,
    );
    if (!capturedPeriod || capturedPeriod.revision !== workspace.revision)
      throw Error(
        "داده‌ها هنگام تهیه فایل تغییر کردند؛ پشتیبان را دوباره آماده کنید.",
      );
    const json = JSON.stringify(content, null, 2);
    session.name =
      "KelasYar-Backup-" + content.exportedAt.replace(/[:.]/g, "-") + ".json";
    session.blob = new Blob([json], { type: "application/json" });
    if (typeof File === "function")
      session.file = new File([session.blob], session.name, {
        type: "application/json",
      });
    session.context = captureWorkspaceContext();
    checkBackupShare(session);
    const fileInfo = session.panel.querySelector("[data-backup-share-file]");
    fileInfo.hidden = false;
    fileInfo.innerHTML =
      '<strong dir="ltr">' +
      esc(session.name) +
      "</strong><span>" +
      content.stores.catalog.length.toLocaleString("fa-IR") +
      " دوره · " +
      Math.max(1, Math.ceil(session.blob.size / 1024)).toLocaleString("fa-IR") +
      " کیلوبایت</span><span>زمان تهیه: " +
      esc(new Date(content.exportedAt).toLocaleString("fa-IR")) +
      "</span>";
    const draftCount = (content.gradeDrafts || []).reduce(
      (count, row) => count + row.entries.length,
      0,
    );
    if (draftCount)
      fileInfo.innerHTML +=
        "<span>" +
        draftCount.toLocaleString("fa-IR") +
        " ورودی ناتمام نیز برای بررسی پس از بازیابی در فایل حفظ شده است.</span>";
    let supported = false;
    try {
      supported = !!(
        globalThis.isSecureContext &&
        session.file &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [session.file] })
      );
    } catch {
      /* Unsupported or policy-blocked file sharing uses manual download. */
    }
    const share = session.panel.querySelector(
        '[data-workspace-action="share-backup-file"]',
      ),
      download = session.panel.querySelector(
        '[data-workspace-action="download-share-backup"]',
      );
    share.hidden = !supported;
    share.disabled = false;
    download.hidden = false;
    download.disabled = false;
    backupShareMessage(
      session,
      supported
        ? "فایل آماده است. دکمه ارسال را بزنید و ایمیل یا پیام‌رسانی مثل بله را از فهرست دستگاه انتخاب کنید. نمایش برنامه‌ها به دستگاه شما بستگی دارد."
        : "ارسال مستقیم این نوع فایل در این مرورگر در دسترس نیست. فایل را دریافت کنید و در ایمیل یا پیام‌رسان، به‌صورت فایل پیوست بفرستید.",
    );
    return true;
  } catch (error) {
    backupShareMessage(
      session,
      "آماده‌سازی انجام نشد: " + error.message,
      "error",
    );
    if (backupShareSession === session && session.panel.isConnected)
      session.panel.querySelector(
        '[data-workspace-action="prepare-share-backup"]',
      ).hidden = false;
    return false;
  }
}

async function sharePreparedBackup(button) {
  const session = backupShareSession;
  if (!session || session.sharing) return false;
  try {
    checkBackupShare(session);
    if (!session.file) throw Error("ابتدا پشتیبان را دوباره آماده کنید.");
    session.sharing = true;
    setControlLock(button, "backup-sharing", true);
    // No await before share: the second, explicit click preserves user activation.
    await navigator.share({
      files: [session.file],
      title: "پشتیبان کامل کلاس‌یار",
    });
    backupShareMessage(
      session,
      "فایل به پنجره اشتراک‌گذاری سپرده شد؛ ارسال نهایی و فایل پیوست را در برنامه مقصد بررسی کنید.",
    );
    return true;
  } catch (error) {
    backupShareMessage(
      session,
      error.name === "AbortError"
        ? "اشتراک‌گذاری لغو شد؛ فایل آماده است و می‌توانید دوباره تلاش کنید."
        : "ارسال انجام نشد: " +
            error.message +
            " می‌توانید فایل را دریافت و دستی پیوست کنید.",
      error.name === "AbortError" ? "ready" : "error",
    );
    return false;
  } finally {
    session.sharing = false;
    if (button?.isConnected) setControlLock(button, "backup-sharing", false);
  }
}

function downloadPreparedBackup() {
  const session = backupShareSession;
  if (!session || session.sharing) return false;
  try {
    checkBackupShare(session);
    if (!session.blob) throw Error("ابتدا پشتیبان را دوباره آماده کنید.");
    downloadLocalFile(session.blob, session.name);
    backupShareMessage(
      session,
      "دانلود فایل درخواست شد؛ آن را در ایمیل یا بله، به‌صورت فایل پیوست کنید. ذخیره و ارسال نهایی را بررسی کنید.",
    );
    return true;
  } catch (error) {
    backupShareMessage(session, error.message, "error");
    return false;
  }
}
