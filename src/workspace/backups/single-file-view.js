// Presentation adapter: renders school and bank state without performing file operations.
function singleFileBannerHtml() {
  return EduBackupAutomaticView.summaryHtml({
    name: singleFile?.handle?.name,
    savedAt: singleFile?.savedAt,
    needsReview:
      singleFileFailure ||
      singleFilePermissionNeeded ||
      !!singleFile?.suspension,
  });
}
function paintSingleFileBanner() {
  const html = welcomeFileSummariesHtml();
  for (const id of ["welcomeFileSummary", "singleFileSummary"]) {
    const element = document.getElementById(id);
    const content =
      id === "singleFileSummary"
        ? EduBackupAutomaticView.summaryHtml({
            ...singleFileViewState(),
            detailed: true,
          })
        : html;
    if (element && element.innerHTML !== content) element.innerHTML = content;
  }
  const panel = document
    .getElementById("singleFileSummary")
    ?.closest?.(".backup-automatic");
  if (panel)
    for (const action of ["choose", "save", "stop"]) {
      const button = panel.querySelector(
        '[data-backup-file-action="' + action + '"]',
      );
      if (button)
        button.disabled =
          !window.showSaveFilePicker ||
          !!singleFileChoosing ||
          !!singleFileWriting ||
          (action !== "choose" && !singleFile);
    }
}
function welcomeFileSummariesHtml() {
  const bank = globalThis.EduQuestionBankFileBackup?.service?.state() || {};
  const schoolReview =
    singleFileFailure || singleFilePermissionNeeded || !!singleFile?.suspension;
  return [
    {
      scope: "school",
      label: "اطلاعات مدرسه",
      name: singleFile?.handle?.name,
      savedAt: singleFile?.savedAt,
      review: schoolReview,
      state: schoolReview ? "review" : singleFile ? "connected" : "inactive",
    },
    {
      scope: "bank",
      label: "بانک سؤال و آزمون‌ها",
      name: bank.name,
      savedAt: bank.savedAt,
      review: ["permission", "paused", "error"].includes(bank.state),
      state: ["permission", "paused", "error"].includes(bank.state)
        ? "review"
        : bank.connected
          ? "connected"
          : "inactive",
    },
  ]
    .map(
      (file) =>
        '<div class="welcome-storage-item" data-scope="' +
        file.scope +
        '" data-state="' +
        file.state +
        '"><div class="welcome-storage-heading"><strong>' +
        file.label +
        '</strong><span class="welcome-storage-state">' +
        (file.review
          ? "نیاز به بررسی"
          : file.state === "connected"
            ? "فایل متصل"
            : "بدون اتصال") +
        "</span></div>" +
        EduBackupAutomaticView.summaryHtml({
          name: file.name,
          savedAt: file.savedAt,
          needsReview: false,
        }) +
        "</div>",
    )
    .join("");
}
function singleFileNoticeHtml(
  message = singleFileMessage,
  permissionAction = true,
) {
  const canRequest =
    permissionAction &&
    singleFilePermissionNeeded &&
    window.showSaveFilePicker &&
    typeof singleFile?.handle?.requestPermission === "function";
  return EduBackupAutomaticView.noticeHtml({
    purpose: "اطلاعات مدرسه",
    name: singleFile?.handle?.name,
    message,
    permission: canRequest
      ? {
          attributes: { "data-workspace-action": "single-file-save" },
          ariaLabel:
            "اجازه مجدد برای فایل اطلاعات مدرسه: " + singleFile.handle.name,
        }
      : null,
  });
}
// Only presentation is shared; each file keeps its own permissions and safeguards.
function paintQuestionBankFileNotice() {
  const welcome = document.getElementById("welcomeFileSummary");
  if (welcome) {
    const html = welcomeFileSummariesHtml();
    if (welcome.innerHTML !== html) welcome.innerHTML = html;
  }
  const panel = document.querySelector?.("#app .workspace-bar");
  if (!panel) return;
  const service = globalThis.EduQuestionBankFileBackup?.service,
    state = service?.state(),
    visible =
      state?.state === "error" ||
      (state?.connected && ["permission", "paused"].includes(state.state)),
    permission = visible && state.state === "permission" && service.supported();
  let notice = document.getElementById("questionBankFileBadge");
  if (visible && !notice) {
    notice = document.createElement("div");
    notice.id = "questionBankFileBadge";
    notice.className = "single-file-notice question-bank-file-notice";
  }
  if (notice) {
    notice.hidden = !visible;
    if (visible) {
      notice.dataset.state = state.state;
      const html =
        '<span class="single-file-message" role="status"><strong class="backup-file-purpose">بانک سؤال و آزمون‌ها</strong><bdi class="backup-notice-filename" dir="ltr">' +
        esc(state.name || "فایل خودکار بانک سؤال انتخاب نشده") +
        '</bdi><span class="backup-file-detail">' +
        esc(state.message) +
        (permission
          ? '</span></span><button type="button" class="single-file-permission-action" data-workspace-action="question-bank-file-permission" aria-label="اجازه مجدد برای فایل بانک سؤال و آزمون‌ها: ' +
            esc(state.name) +
            '">اجازه مجدد</button>'
          : " برای بررسی فایل، از منوی «پشتیبان و بازیابی»، تب «بانک سؤال و آزمون‌ها» را باز کنید.</span></span>");
      if (notice.innerHTML !== html) notice.innerHTML = html;
      // School notices already occupy their own full-width row immediately above.
      if (notice.parentElement !== panel) panel.append(notice);
    }
  }
}
function singleFileStatus(message, { permission = false, saved = false } = {}) {
  singleFileMessage = message;
  singleFilePermissionNeeded = permission;
  singleFileNoticeSaved = saved;
  paintSingleFileBanner();
  const element = document.getElementById("singleFileStatus");
  if (element) {
    element.innerHTML = singleFileNoticeHtml(singleFileMessage, false);
    element.hidden = saved;
    const panel = element.closest?.("details.backup-automatic");
    if (permission && panel) panel.open = true;
  }
  const badge = document.getElementById("singleFileBadge");
  if (badge) {
    badge.innerHTML = singleFileNoticeHtml();
    badge.hidden = !singleFileFailure;
    const panel = document.querySelector("#app .workspace-bar");
    const destination = panel;
    if (destination && badge.parentElement !== destination)
      destination.append(badge);
  }
}
function singleFileViewState() {
  return {
    supported: !!window.showSaveFilePicker,
    purpose: "اطلاعات مدرسه",
    name: singleFile?.handle?.name,
    savedAt: singleFile?.savedAt,
    needsReview:
      singleFileFailure ||
      singleFilePermissionNeeded ||
      !!singleFile?.suspension,
    state: singleFilePermissionNeeded
      ? "permission"
      : singleFile?.suspension
        ? "paused"
        : singleFileFailure
          ? "error"
          : !singleFile
            ? "inactive"
            : singleFileNoticeSaved
              ? "active"
              : singleFileWriting
                ? "busy"
                : "paused",
  };
}
function singleFilePanel() {
  const supported = !!window.showSaveFilePicker;
  const canRequest =
    singleFilePermissionNeeded &&
    supported &&
    typeof singleFile?.handle?.requestPermission === "function";
  return EduBackupAutomaticView.html({
    ...singleFileViewState(),
    supported,
    open: true,
    purpose: "اطلاعات مدرسه",
    name: singleFile?.handle?.name,
    savedAt: singleFile?.savedAt,
    needsReview:
      singleFileFailure ||
      singleFilePermissionNeeded ||
      !!singleFile?.suspension,
    message: singleFileMessage,
    noticeHidden: singleFileNoticeSaved,
    fallback: singleFileFailure,
    disabled: { save: !singleFile, stop: !singleFile },
    ids: {
      summary: "singleFileSummary",
      status: "singleFileStatus",
      fallback: "singleFileFallback",
    },
    permission: canRequest
      ? {
          attributes: { "data-workspace-action": "single-file-save" },
          ariaLabel:
            "اجازه مجدد برای فایل اطلاعات مدرسه: " + singleFile.handle.name,
        }
      : null,
    actions: {
      choose: { "data-workspace-action": "single-file-choose" },
      save: { "data-workspace-action": "single-file-save" },
      stop: { "data-workspace-action": "single-file-stop" },
    },
  });
}
function showSingleFileFallback(visible) {
  singleFileFailure = visible;
  const element = document.getElementById("singleFileFallback");
  if (element) {
    element.hidden = !visible;
    const panel = element.closest?.("details.backup-automatic");
    if (visible && panel) panel.open = true;
  }
}
