let excelShareSession = null;

function excelShareMessage(session, text, state = "ready") {
  if (
    excelShareSession !== session ||
    !session.panel.isConnected ||
    session.invalid
  )
    return;
  const status = session.panel.querySelector("[data-report-share-status]");
  status.textContent = text;
  status.dataset.state = state;
}

function invalidateExcelShare(message, session = excelShareSession) {
  if (!session || excelShareSession !== session) return;
  excelShareMessage(session, message, "error");
  session.invalid = true;
  session.file = null;
  session.blob = null;
  for (const selector of [
    "[data-report-share-send]",
    "[data-report-share-download]",
  ])
    session.panel.querySelector(selector).disabled = true;
}

function checkExcelShare(session) {
  if (
    !session ||
    excelShareSession !== session ||
    !session.panel.isConnected ||
    document.getElementById("modal").classList.contains("hidden")
  )
    throw Error("پنجره ارسال بسته شده است؛ فایل اکسل را دوباره آماده کنید.");
  const current = context();
  if (
    session.invalid ||
    !isPreparedCurrent(session.prepared) ||
    !current.ready ||
    !current.authenticated ||
    current.blocked ||
    current.retired ||
    current.resetting ||
    current.saving ||
    current.pendingDrafts ||
    current.id !== session.prepared.context.id ||
    current.revision !== session.prepared.context.revision
  )
    throw Error(
      "اطلاعات یا محدوده گزارش تغییر کرده است؛ پنجره را ببندید و اکسل را دوباره آماده کنید.",
    );
}

function canShareExcel(file) {
  try {
    return !!(
      globalThis.isSecureContext &&
      file &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

function openExcelShare(prepared, blob, name) {
  if (!isPreparedCurrent(prepared))
    throw Error("گزارش تغییر کرده است؛ فایل اکسل را دوباره آماده کنید.");
  const model = prepared.model;
  const file =
    typeof File === "function"
      ? new File([blob], name, { type: blob.type })
      : null;
  const supported = canShareExcel(file);
  const shareIcon =
    '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>';
  const opened = root.showModal(
    "اشتراک‌گذاری اکسل",
    '<section class="report-excel-share" id="reportExcelSharePanel"><div class="report-share-heading"><span aria-hidden="true">' +
      shareIcon +
      "</span><div><h4>گزارش آمادهٔ ارسال است</h4><p>" +
      esc(model.school.name + (model.class ? " · " + model.class.name : "")) +
      '</p></div></div><div class="report-share-file" data-report-share-file><strong><bdi>' +
      esc(name) +
      "</bdi></strong><span>XLSX · " +
      esc(Math.max(1, Math.ceil(blob.size / 1024)).toLocaleString("fa-IR")) +
      " کیلوبایت</span><span>" +
      esc(
        model.audience === "parent"
          ? "ویژه اولیای " + model.student.name
          : "گزارش مدیریت مدرسه",
      ) +
      " · " +
      esc(
        faDate(model.start) +
          (model.start === model.end ? "" : " تا " + faDate(model.end)),
      ) +
      '</span></div><p data-report-share-status role="status" aria-live="polite"></p><div class="report-share-actions"><button type="button" data-report-share-send data-legacy-click="reports-periodic-document:share-file"' +
      (supported ? "" : " hidden") +
      ">" +
      shareIcon +
      '<span>انتخاب پیام‌رسان و ارسال</span></button><button type="button" class="ghost" data-report-share-download data-legacy-click="reports-periodic-document:download-file"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12M7 10l5 5 5-5M4 16v5h16v-5"/></svg><span>دریافت اکسل برای پیوست</span></button><button type="button" class="ghost" data-workspace-action="close">بستن</button></div></section>',
  );
  if (opened === false) return false;
  const session = {
    prepared,
    panel: document.getElementById("reportExcelSharePanel"),
    file,
    blob,
    name,
    sharing: false,
    invalid: false,
  };
  excelShareSession = session;
  const modal = document.getElementById("modal");
  const observer = new MutationObserver(() => {
    if (!session.panel.isConnected || modal.classList.contains("hidden")) {
      session.file = null;
      session.blob = null;
      if (excelShareSession === session) excelShareSession = null;
      observer.disconnect();
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
  observer.observe(document.getElementById("modalBody"), { childList: true });
  excelShareMessage(
    session,
    supported
      ? "دکمه ارسال را بزنید و شاد یا پیام‌رسان دلخواه را از فهرست دستگاه انتخاب کنید. اگر برنامه مقصد نمایش داده نشد، اکسل را دریافت و به‌صورت فایل پیوست کنید."
      : "ارسال مستقیم اکسل در این مرورگر در دسترس نیست. فایل را دریافت کنید؛ سپس در شاد یا پیام‌رسان، از بخش پیوست ← فایل، همین اکسل را انتخاب کنید.",
  );
  return true;
}

async function sharePreparedExcel(button) {
  const session = excelShareSession;
  if (!session || session.sharing) return false;
  try {
    checkExcelShare(session);
  } catch (error) {
    invalidateExcelShare(error.message, session);
    return false;
  }
  if (!canShareExcel(session.file)) {
    session.panel.querySelector("[data-report-share-send]").hidden = true;
    excelShareMessage(
      session,
      "مرورگر از ارسال مستقیم این فایل پشتیبانی نمی‌کند؛ اکسل را دریافت و در پیام‌رسان پیوست کنید.",
    );
    return false;
  }
  session.sharing = true;
  button.disabled = true;
  session.panel.querySelector("[data-report-share-download]").disabled = true;
  try {
    // A second explicit click preserves activation: no await before native share.
    await navigator.share({
      files: [session.file],
      title: "گزارش اکسل کلاس‌یار",
    });
    excelShareMessage(
      session,
      "فایل به پنجره اشتراک‌گذاری سپرده شد؛ ارسال نهایی و پیوست را در پیام‌رسان بررسی کنید.",
    );
    return true;
  } catch (error) {
    excelShareMessage(
      session,
      error.name === "AbortError"
        ? "اشتراک‌گذاری لغو شد؛ فایل آماده است و می‌توانید دوباره تلاش کنید."
        : "ارسال مستقیم انجام نشد. اکسل را دریافت و در شاد یا پیام‌رسان، به‌صورت فایل پیوست کنید.",
      error.name === "AbortError" ? "ready" : "error",
    );
    return false;
  } finally {
    session.sharing = false;
    if (button.isConnected) button.disabled = session.invalid;
    if (session.panel.isConnected)
      session.panel.querySelector("[data-report-share-download]").disabled =
        session.invalid;
  }
}

async function downloadPreparedExcel() {
  const session = excelShareSession;
  if (!session || session.sharing) return false;
  try {
    checkExcelShare(session);
    session.sharing = true;
    session.panel.querySelector("[data-report-share-send]").disabled = true;
    session.panel.querySelector("[data-report-share-download]").disabled = true;
    await root.EduV24.assertReportSnapshot(session.prepared.context);
    checkExcelShare(session);
    if (!session.blob)
      throw Error("فایل آماده نیست؛ اکسل را دوباره آماده کنید.");
    downloadLocalFile(session.blob, session.name);
    excelShareMessage(
      session,
      "دریافت اکسل درخواست شد. در پیام‌رسان، پیوست ← فایل را بزنید و همین فایل XLSX را انتخاب کنید.",
    );
    return true;
  } catch (error) {
    invalidateExcelShare(error.message, session);
    return false;
  } finally {
    session.sharing = false;
    if (session.panel.isConnected) {
      session.panel.querySelector("[data-report-share-send]").disabled =
        session.invalid;
      session.panel.querySelector("[data-report-share-download]").disabled =
        session.invalid;
    }
  }
}
