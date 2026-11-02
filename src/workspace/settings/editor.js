let settingsEditing = null,
  settingsSaving = false;
async function openSettingsV24() {
  const origin = workspace?.id,
    sourceConnection = connection;
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
    if (origin !== workspace?.id || connection !== sourceConnection)
      throw Error("ترم تغییر کرده است؛ تنظیمات را دوباره باز کنید.");
    const context = captureWorkspaceContext();
    const opened = showModal(
      "تنظیمات ورود",
      '<form id="settingsEditor" class="record-editor settings-editor" novalidate>' +
        '<div class="record-editor-context settings-context"><span class="settings-eyebrow">دسترسی به اطلاعات</span><h4>رمز ورود</h4><p>' +
        esc(
          (workspace?.year || "") +
            " / " +
            ({ first: "ترم اول", second: "ترم دوم" }[
              workspace?.termKind || academicTermKind(workspace?.term || "")
            ] ||
              workspace?.term ||
              ""),
        ) +
        '</p><span class="settings-password-state' +
        (db.settings.password ? " is-enabled" : "") +
        '">' +
        (db.settings.password ? "رمز ورود فعال است" : "ورود بدون رمز") +
        "</span></div>" +
        '<section class="settings-section" aria-labelledby="settingsPasswordTitle"><h5 id="settingsPasswordTitle">' +
        (db.settings.password ? "تغییر رمز" : "افزودن رمز") +
        "</h5><p>این رمز برای ورود به اطلاعات ترم فعلی است؛ رمزهای ثبت‌شدهٔ قبلی بدون تغییر حفظ می‌شوند.</p>" +
        '<label class="course-field" for="newPass">رمز جدید<input type="password" id="newPass" autocomplete="new-password" aria-describedby="settingsHint settingsError" placeholder="رمز جدید را وارد کنید"></label>' +
        '<p id="settingsHint" class="settings-field-hint">اگر این کادر را خالی بگذارید، رمز فعلی تغییر نمی‌کند.</p></section>' +
        '<section class="settings-remove-section" aria-label="حذف رمز"><label class="settings-remove-option"><input type="checkbox" id="removePassword" aria-describedby="settingsRemoveHint"><span>حذف رمز ورود<small id="settingsRemoveHint">برای ورود بدون رمز، این گزینه را انتخاب و کادر رمز جدید را خالی کنید.</small></span></label></section>' +
        '<p class="settings-privacy-note">رمز ورود، اطلاعات مدرسه و فایل‌های پشتیبان را رمزگذاری نمی‌کند.</p>' +
        '<p id="settingsError" role="alert" class="entity-create-error"></p>' +
        '<div class="record-editor-actions"><button type="submit">ذخیره تنظیمات</button><button type="button" class="ghost" data-settings-cancel>انصراف</button></div></form>',
    );
    if (opened !== false) {
      settingsEditing = {
        ...context,
        connection: sourceConnection,
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
    sourceConnection = connection,
    sourceData = db,
    sourcePassword = db.settings.password,
    sourceAuthentication = isAuthenticated,
    passwordInput = form.querySelector("#newPass");
  const password = passwordInput.value,
    remove = form.querySelector("#removePassword").checked;
  let passwordWritePending = false,
    temporaryAuthentication = false,
    assignedPassword;
  settingsSaving = true;
  const finish = beginRecordEditorSave(form);
  try {
    const check = () => {
      assertWorkspaceContext(context, { write: true });
      if (
        context !== settingsEditing ||
        connection !== sourceConnection ||
        (context.connection && context.connection !== sourceConnection) ||
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
      // Adding the first password must not lock out its already-open session
      // while the guarded write is pending. A failed write restores that state.
      if (!sourcePassword) {
        isAuthenticated = true;
        temporaryAuthentication = true;
      }
      assignedPassword = nextPassword;
      db.settings.password = nextPassword;
      passwordWritePending = true;
      await saveDBV24({
        action: remove ? "حذف رمز ورود ترم" : "تغییر رمز ورود ترم",
      });
      passwordWritePending = false;
    }
    if (
      settingsEditing !== context ||
      connection !== sourceConnection ||
      workspace.id !== context.id ||
      !form.isConnected ||
      periodLoading ||
      resetBusy ||
      connectionRetired
    )
      return true;
    isAuthenticated = true;
    passwordInput.value = "";
    form.querySelector("#removePassword").checked = false;
    finish();
    rememberRecordEditor();
    settingsEditing = null;
    closeModal();
    setStatus("تنظیمات ورود ذخیره شد.", "saved");
    return true;
  } catch (error) {
    if (
      passwordWritePending &&
      workspace.id === context?.id &&
      connection === sourceConnection
    ) {
      if (db === sourceData && db.settings.password === assignedPassword)
        db.settings.password = sourcePassword;
      if (temporaryAuthentication) isAuthenticated = sourceAuthentication;
    }
    if (!showRecordEditorError(error, "settingsError")) handleError(error);
    return false;
  } finally {
    settingsSaving = false;
    finish();
  }
}
