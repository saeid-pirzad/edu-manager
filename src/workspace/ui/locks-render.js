function syncControlLocks() {
  const readonly =
    fileMode ||
    blocked ||
    connectionRetired ||
    resetBusy ||
    !ready ||
    periodLoading ||
    !!workspace?.closed;
  const modalBody = document.getElementById("modalBody");
  const modalWrite =
    modalBody &&
    !modalBody.querySelector("form") &&
    [...modalBody.querySelectorAll("[data-mutating]")].some(
      (el) => el.tagName !== "FORM",
    );
  const candidates = new Set(
    document.querySelectorAll(
      '[data-control-lock],[data-mutating]:is(input,select,textarea,button),form[data-mutating] :is(input,select,textarea,button),form[aria-busy="true"] :is(input,select,textarea,button)',
    ),
  );
  if (modalWrite)
    modalBody
      .querySelectorAll("input,select,textarea")
      .forEach((control) => candidates.add(control));
  candidates.forEach((control) => {
    const form = control.form;
    const formWrite = form?.dataset.mutating === "1";
    const field = control.matches("input,select,textarea");
    const mutation =
      control.dataset.mutating === "1" ||
      (formWrite && (field || control.type === "submit")) ||
      (modalWrite && field && modalBody.contains(control));
    if (mutation && control.dataset.gregorianTarget === undefined)
      control.dataset.mutating = "1";
    setControlLock(control, "workspace-readonly", mutation && readonly);
    setControlLock(
      control,
      "workspace-saving",
      mutation && busy > 0 && !control.matches("[data-grade]"),
    );
    setControlLock(
      control,
      "form-saving",
      !!form?.matches('[aria-busy="true"]'),
    );
  });
  for (const form of document.querySelectorAll('form[data-mutating="1"]')) {
    const existing = form.querySelector(".course-readonly-note");
    let note = form.querySelector(".control-lock-note");
    if (readonly && !existing && !note) {
      note = document.createElement("p");
      note.className = "control-lock-note";
      note.setAttribute("role", "status");
      (form.querySelector(".record-editor-context") || form).prepend(note);
    }
    if (note) {
      note.hidden = !readonly || !!existing;
      note.textContent = workspace?.closed
        ? "دوره بسته است؛ این فرم فقط خواندنی است. گزارش و پشتیبان همچنان در دسترس‌اند."
        : "ویرایش فعلاً متوقف است؛ پیام وضعیت ذخیره‌سازی را بررسی کنید.";
    }
  }
  let modalNote = modalBody?.querySelector(".standalone-lock-note");
  if (readonly && modalWrite && !modalNote) {
    modalNote = document.createElement("p");
    modalNote.className = "control-lock-note standalone-lock-note";
    modalNote.setAttribute("role", "status");
    modalBody.prepend(modalNote);
  }
  if (modalNote) {
    modalNote.hidden = !readonly || !modalWrite;
    modalNote.textContent = workspace?.closed
      ? "دوره بسته است؛ این تنظیمات فقط نمایش داده می‌شوند."
      : "ویرایش فعلاً متوقف است؛ پیام وضعیت ذخیره‌سازی را بررسی کنید.";
  }
  syncShamsiDisabledInputs();
}
const mutatingNames = [
  "confirmDeletion",
  "saveMembership",
  "saveEntityEditor",
  "savePeriodLabel",
  "saveSettings",
  "save",
  "copy",
  "gate",
  "addSchool",
  "deleteSchool",
  "addClass",
  "deleteClass",
  "addStudent",
  "deleteStudent",
  "addLesson",
  "deleteLesson",
  "saveEditStudent",
  "doTransfer",
  "saveLessonConfig",
  "saveMasterConfig",
  "clearMasterConfig",
  "toggleActiveDay",
  "changePeriods",
  "saveWeekStartDate",
  "setAllAttendance",
  "toggleAtt",
  "changeSessionDate",
  "updateSessionUnits",
  "saveSessionUnit",
  "addSessionScore",
  "removeSessionScore",
  "deleteSession",
  "deleteAllSessions",
  "addManualSession",
  "startSessionFromMaster",
  "restoreStudent",
  "commitCSV",
  "saveStudent",
  "confirmImport",
  "undoLast",
  "toggleUnitApply",
  "toggleAllApplyForLesson",
  "toggleUnitApplyDirect",
  "toggleAllApplyForLessonInLesson",
];
const mutationCall = new RegExp(
  "\\b(?:" + mutatingNames.join("|") + ")\\s*\\(",
);
function lockControls() {
  for (const element of document.querySelectorAll(
    "button,input,select,textarea,form",
  )) {
    if (element.matches("[data-grade],.grade-clear,[data-mutating]"))
      element.dataset.mutating = "1";
    else {
      const handlers = ["onclick", "onchange", "oninput", "onsubmit"]
        .map((key) => element.getAttribute(key) || "")
        .join(" ");
      if (
        mutationCall.test(handlers) ||
        EduLegacyEvents.mutates(element, mutationCall)
      )
        element.dataset.mutating = "1";
    }
  }
  syncControlLocks();
}

function workspaceToolsHtml() {
  const button = (action, icon, title, extra = "", description = "") =>
    '<button type="button" class="ghost workspace-tool-button ' +
    extra +
    '" data-workspace-action="' +
    action +
    '"><span class="workspace-tool-icon" aria-hidden="true">' +
    EduIcons.html(icon) +
    '</span><span class="workspace-tool-copy"><span>' +
    esc(title) +
    "</span>" +
    (description
      ? '<span class="workspace-tool-description">' +
        esc(description) +
        "</span>"
      : "") +
    "</span></button>";
  return (
    '<details class="workspace-tools"><summary id="workspaceToolsToggle"><span class="workspace-tools-symbol" aria-hidden="true">' +
    EduIcons.html("settings") +
    '</span><span>ابزارها و تنظیمات</span><span class="workspace-tools-chevron" aria-hidden="true"></span></summary><div class="workspace-tool-actions"><div class="workspace-tool-group">' +
    button(
      "periods",
      "calendar",
      "دوره‌های تحصیلی",
      "",
      "انتخاب و مدیریت سال و نوبت تحصیلی",
    ) +
    button(
      "history",
      "clock",
      "تاریخچه تغییرات",
      "",
      "مرور تغییرات ثبت‌شده در اطلاعات",
    ) +
    '<button type="button" class="ghost workspace-tool-button" data-header-action="settings"><span class="workspace-tool-icon" aria-hidden="true">' +
    EduIcons.html("settings") +
    '</span><span class="workspace-tool-copy"><span>تنظیمات برنامه</span><span class="workspace-tool-description">شخصی‌سازی و تنظیم گزینه‌های برنامه</span></span></button>' +
    '</div><details class="workspace-draft-tools"><summary><span class="workspace-draft-symbol" aria-hidden="true">' +
    EduIcons.html("undo") +
    '</span><span>بازیابی پیش‌نویس‌ها</span><span class="workspace-draft-chevron" aria-hidden="true"></span></summary><div class="workspace-draft-actions">' +
    button("review-drafts", "grades", "بررسی تعارض نمره‌ها") +
    button("other-drafts", "undo", "بازیابی ورودی‌های قبلی") +
    button(
      "discard-drafts",
      "trash",
      "لغو پیش‌نویس نمره‌ها",
      "workspace-tool-caution",
    ) +
    "</div></details></div></details>"
  );
}
function renderV24() {
  if (!ready) return;
  const coursePanel = courseUI.preserveEditor();
  old.render();
  courseUI.restoreEditor(coursePanel);
  const app = document.getElementById("app");
  if (db.settings.password && !isAuthenticated) {
    const banner = document.createElement("div");
    banner.id = "saveStatus";
    banner.setAttribute("role", "status");
    app.prepend(banner);
    paintStatus();
    return;
  }
  const panel = document.createElement("div");
  panel.className = "workspace-bar workspace-bar-compact no-print";
  panel.innerHTML =
    (workspace.closed
      ? '<span class="workspace-closed-note">دوره بسته است؛ فقط مشاهده</span>'
      : "") +
    '<span id="saveStatus" role="status" aria-live="polite"></span>' +
    workspaceToolsHtml();
  app.prepend(panel);
  const tools = panel.querySelector(".workspace-tools");
  const settings = app.querySelector('.topbar [data-header-action="settings"]');
  if (settings) settings.replaceWith(tools);
  const welcome = app.querySelector(".schools-welcome");
  if (welcome) {
    const footer = document.createElement("div");
    footer.className = "schools-welcome-footer";
    footer.innerHTML =
      '<div class="schools-period-context"><span>سال تحصیلی: <bdi>' +
      esc(
        String(workspace.year).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]),
      ) +
      "</bdi></span><span>نوبت: <bdi>" +
      esc(workspace.term) +
      "</bdi></span></div>";
    const about = welcome.querySelector(".schools-about");
    if (about) footer.append(about);
    welcome.append(footer);
  }
  if (window.showSaveFilePicker) {
    const fileStatus = document.createElement("small");
    fileStatus.id = "singleFileBadge";
    fileStatus.setAttribute("role", "status");
    fileStatus.hidden = !singleFileFailure;
    fileStatus.textContent = singleFileMessage;
    // Connection details live in backups; only failures need a page notice.
    panel.append(fileStatus);
  }
  if (db.migrationWarnings?.length) {
    const info = document.createElement("div");
    info.className = "card";
    info.textContent =
      "سوابق منتقل‌شده نیازمند بررسی: " + db.migrationWarnings.join(" | ");
    app.append(info);
  }
  if (fileMode) fileModeBanner(app);
  courseUI.activateCreate();
  applyDrafts();
  lockControls();
  paintStatus();
}
