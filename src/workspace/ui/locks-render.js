function syncControlLocks() {
  const readonly =
    fileMode ||
    blocked ||
    connectionRetired ||
    resetBusy ||
    !ready ||
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

function renderV24() {
  if (!ready) return;
  old.render();
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
  panel.className = "workspace-bar no-print";
  panel.innerHTML =
    "<strong>" +
    esc(workspace.year + " — " + workspace.term) +
    (workspace.closed ? " · بسته‌شده" : " · در حال کار") +
    '</strong><span id="saveStatus" role="status" aria-live="polite"></span><details class="workspace-tools"><summary>ابزارها و پشتیبان</summary><div class="workspace-tool-actions"><button class="ghost" data-workspace-action="periods">دوره‌ها و بستن کارنامه</button><button class="ghost" data-workspace-action="history">تاریخچه / بازگردانی</button><button class="ghost" data-workspace-action="backups">پشتیبان‌ها</button><button class="ghost" data-workspace-action="discard-drafts">لغو ویرایش ثبت‌نشده</button><button class="ghost" data-workspace-action="review-drafts">بررسی پیش‌نویس تعارض</button><small>پشتیبان فایل: ' +
    esc(lastExternalBackupLabel()) +
    "</small>" +
    '<button class="ghost" data-workspace-action="other-drafts">پیش‌نویس نشست دیگر</button></div></details>';
  app.prepend(panel);
  if (window.showSaveFilePicker) {
    const fileStatus = document.createElement("small");
    fileStatus.id = "singleFileBadge";
    fileStatus.setAttribute("role", "status");
    fileStatus.textContent = singleFileMessage;
    // Routine file details stay in tools; failures remain visible on the page.
    (singleFileFailure
      ? panel
      : panel.querySelector(".workspace-tool-actions")
    ).append(fileStatus);
  }
  if (db.migrationWarnings?.length) {
    const info = document.createElement("div");
    info.className = "card";
    info.textContent =
      "سوابق منتقل‌شده نیازمند بررسی: " + db.migrationWarnings.join(" | ");
    app.append(info);
  }
  if (fileMode) fileModeBanner(app);
  applyDrafts();
  lockControls();
  paintStatus();
}
