let settingsEditing = null,
  settingsSaving = false;
async function openSettingsV24() {
  const origin = workspace?.id;
  try {
    if (
      ready &&
      !fileMode &&
      !blocked &&
      !resetBusy &&
      !connectionRetired &&
      !workspace?.closed
    ) {
      await flushDrafts({ strict: true });
      await writer.catch(() => {});
    }
    if (origin !== workspace?.id)
      throw Error("دوره تغییر کرده است؛ تنظیمات را دوباره باز کنید.");
    const context = captureWorkspaceContext();
    const opened = showModal(
      "تنظیمات",
      '<form id="settingsEditor" class="record-editor" novalidate>' +
        '<div class="record-editor-context"><h4>رمز ورود این دوره</h4><p>' +
        esc((workspace?.year || "") + " / " + (workspace?.term || "")) +
        "</p></div>" +
        '<label class="course-field" for="newPass">رمز جدید<input type="password" id="newPass" autocomplete="new-password" aria-describedby="settingsHint settingsError" placeholder="خالی: حفظ رمز فعلی"></label>' +
        '<label><input type="checkbox" id="removePassword"> حذف رمز ورود</label>' +
        '<p id="settingsHint" class="muted">رمز خالی، رمز فعلی را حفظ می‌کند. برای حذف، گزینه حذف را انتخاب و کادر رمز جدید را خالی کنید. اطلاعات مدرسه و فایل پشتیبان رمزگذاری نشده‌اند.</p>' +
        '<p id="settingsError" role="alert" class="entity-create-error"></p>' +
        '<div class="record-editor-actions"><button type="submit">ذخیره تنظیمات</button><button type="button" class="ghost" data-settings-cancel>انصراف</button></div></form>',
    );
    if (opened !== false) {
      settingsEditing = {
        ...context,
        form: document.getElementById("settingsEditor"),
      };
      settingsEditing.form.addEventListener("submit", (event) => {
        event.preventDefault();
        void saveSettingsV24();
      });
      settingsEditing.form
        .querySelector("[data-settings-cancel]")
        .addEventListener("click", () => closeModal());
      rememberRecordEditor();
    }
  } catch (error) {
    handleError(error);
  }
}
async function saveSettingsV24() {
  if (settingsSaving) return false;
  const form = document.querySelector("#modal:not(.hidden) #settingsEditor");
  if (!form) return false;
  const context = settingsEditing,
    passwordInput = form.querySelector("#newPass");
  const password = passwordInput.value,
    remove = form.querySelector("#removePassword").checked;
  settingsSaving = true;
  const finish = beginRecordEditorSave(form);
  try {
    const check = () => {
      assertWorkspaceContext(context, { write: true });
      if (
        context !== settingsEditing ||
        context.form !== form ||
        !form.isConnected
      )
        throw Error("فرم تنظیمات عوض شده است؛ آن را دوباره باز کنید.");
    };
    check();
    if (remove && password)
      throw recordFieldError(
        "برای حذف رمز، کادر رمز جدید را خالی کنید یا گزینه حذف را بردارید.",
        "newPass",
      );
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    check();
    const nextPassword = remove
      ? ""
      : password
        ? await hashPassword(password)
        : db.settings.password;
    check();
    if (nextPassword !== db.settings.password) {
      db.settings.password = nextPassword;
      await saveDBV24({
        action: remove ? "حذف رمز ورود دوره" : "تغییر رمز ورود دوره",
      });
    }
    isAuthenticated = true;
    passwordInput.value = "";
    form.querySelector("#removePassword").checked = false;
    finish();
    rememberRecordEditor();
    settingsEditing = null;
    closeModal();
    setStatus("تنظیمات این دوره ذخیره شد.", "saved");
    return true;
  } catch (error) {
    if (!showRecordEditorError(error, "settingsError")) handleError(error);
    return false;
  } finally {
    settingsSaving = false;
    finish();
  }
}
