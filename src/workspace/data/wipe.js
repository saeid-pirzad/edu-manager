let wipeFileTarget = null;
function assertBankSettledForSchoolWipe() {
  if (globalThis.EduQuestionBankUI?.hasPendingChanges?.())
    throw Error(
      "برای حفظ ویرایش بانک سؤال، ابتدا تغییرات آن را ذخیره یا لغو کنید و منتظر پایان ذخیره بمانید.",
    );
}
async function wipeAllV24() {
  if (fileMode || !ready || connectionRetired)
    return handleError(Error("ابتدا نسخه آماده برنامه را باز کنید."));
  assertBankSettledForSchoolWipe();
  const target = singleFile;
  const opened = showModal(
    "پاک‌سازی اطلاعات مدرسه",
    '<form class="record-editor wipe-editor" id="wipeEditor" data-workspace-submit="confirm-wipe" data-delete-connected-file="true" aria-describedby="wipeWarning">' +
      '<section class="wipe-warning" id="wipeWarning"><span class="wipe-symbol" aria-hidden="true">' +
      EduIcons.html("trash") +
      "</span><div><h4>حذف اطلاعات مدرسه از این مرورگر</h4><p>بازگردانی فقط با فایل پشتیبان مدرسه ممکن است.</p></div></section>" +
      '<section class="wipe-scope" aria-label="اطلاعاتی که حذف می‌شوند"><h4>اطلاعات مشمول حذف</h4><p>مدرسه‌ها، کلاس‌ها، هنرجویان، درس‌ها، برنامه، جلسات، حضور، نمرات، فعالیت‌ها و پیش‌نویس‌های مدرسه.</p></section>' +
      '<section class="wipe-backup" aria-label="پشتیبان پیش از حذف"><p>' +
      (target
        ? 'فایل متصل «<bdi dir="ltr">' +
          esc(target.handle.name) +
          "</bdi>» نیز از دستگاه حذف می‌شود. "
        : "فایل خودکار متصلی وجود ندارد. ") +
      'بانک سؤال و فایل‌های دیگر باقی می‌مانند. یک پشتیبان جداگانه نگه دارید.</p><button type="button" class="ghost wipe-export" data-workspace-action="export-full" title="دریافت پشتیبان اطلاعات مدرسه">دریافت پشتیبان</button></section>' +
      '<div class="wipe-confirmation"><label for="wipeText">برای تأیید، «حذف» را بنویسید</label><input id="wipeText" autocomplete="off" spellcheck="false" aria-describedby="wipeError" placeholder="حذف"><label class="wipe-backup-check" for="wipeBackup"><input type="checkbox" id="wipeBackup"><span>یک پشتیبان جدا از فایلِ مشمول حذف نگه داشته‌ام.</span></label></div>' +
      '<p id="wipeError" class="entity-create-error" role="alert"></p><div class="record-editor-actions wipe-actions"><button type="button" class="ghost" data-workspace-action="close">انصراف</button><button type="submit" class="danger">حذف اطلاعات مدرسه</button></div></form>',
  );
  if (opened !== false) wipeFileTarget = target;
}
async function confirmWipe() {
  if (resetBusy) return false;
  const form = document.querySelector("#modal:not(.hidden) #wipeEditor");
  if (!form) return false;
  if (fileMode || !ready || connectionRetired) return false;
  const deleteFile = form.dataset?.deleteConnectedFile === "true";
  const target = deleteFile ? wipeFileTarget : null;
  const sourceConnection = connection;
  const sourceInstallation = installationToken;
  try {
    assertBankSettledForSchoolWipe();
  } catch (error) {
    showRecordEditorError(error, "wipeError");
    return false;
  }
  if (
    document.getElementById("wipeText").value !== "حذف" ||
    !document.getElementById("wipeBackup").checked
  ) {
    showRecordEditorError(
      recordFieldError("متن تأیید و گزینه پشتیبان را تکمیل کنید.", "wipeText"),
      "wipeError",
    );
    return false;
  }
  if (
    !confirm(
      deleteFile && target
        ? `آخرین تأیید: اطلاعات مدرسه و فایل متصل «${target.handle.name}» از دستگاه حذف شوند؟ بانک سؤال و فایل‌های دیگر باقی می‌مانند.`
        : "آخرین تأیید: اطلاعات مدرسه از این مرورگر حذف شود؟ بانک سؤال و فایل‌های دیگر باقی می‌مانند.",
    )
  )
    return false;
  resetBusy = true;
  const hadFileTimer = !!singleFileTimer;
  pauseSingleFile();
  const finish = beginRecordEditorSave(form),
    wasBlocked = blocked;
  let committedReset = false,
    fileRemoved = false,
    resetConnection = null;
  const marker = {
    key: RESET_RECORD_KEY,
    workspace: null,
    logical: "installation-reset",
    value: {
      token: uid(),
      phase: "cleanup",
      at: new Date().toISOString(),
    },
  };
  try {
    if (deleteFile && target) {
      assertClassroomFileName(target.handle.name);
      if (target.handle.kind !== "file")
        throw Error("فقط فایل متصل مدرسه قابل حذف است.");
      if (typeof target.handle.remove !== "function")
        throw Error(
          "این مرورگر حذف مستقیم فایل متصل را پشتیبانی نمی‌کند؛ هیچ اطلاعاتی حذف نشد. فایل را از مدیریت فایل دستگاه حذف کنید؛ سپس اتصال را قطع کرده و حذف اطلاعات را دوباره انجام دهید.",
        );
      if (
        (await target.handle.requestPermission({ mode: "readwrite" })) !==
        "granted"
      )
        throw Error("مجوز حذف فایل داده نشد؛ اطلاعات مدرسه حفظ شد.");
    }
    clearTimeout(draftTimer);
    if (flushing) await flushing.catch(() => {});
    if (singleFileWriting) await singleFileWriting.catch(() => {});
    await writer.catch(() => {});
    await draftWriter.catch(() => {});
    const reset = async () => {
      assertBankSettledForSchoolWipe();
      if (deleteFile) {
        if (
          !ready ||
          connectionRetired ||
          connection !== sourceConnection ||
          installationToken !== sourceInstallation
        )
          throw Error("اطلاعات برنامه هنگام تأیید تغییر کرده؛ حذف انجام نشد.");
        if (
          singleFile !== target ||
          document.querySelector("#modal:not(.hidden) #wipeEditor") !== form
        )
          throw Error("فرم یا اتصال فایل تغییر کرده؛ حذف انجام نشد.");
        const stored = await readRecord("drafts", singleFileKey);
        const installation = await readRecord("records", RESET_RECORD_KEY);
        if ((installation?.value?.token || "") !== sourceInstallation)
          throw Error(
            "اطلاعات برنامه در پنجرهٔ دیگری تغییر کرده؛ حذف انجام نشد.",
          );
        if ((stored?.connectionId || null) !== (target?.connectionId || null))
          throw Error("اتصال فایل در پنجرهٔ دیگری تغییر کرده؛ حذف انجام نشد.");
        if (target) {
          assertClassroomFileName(target.handle.name);
          const file = await target.handle.getFile();
          await assertSingleFileDestination(file);
          if (
            file.lastModified !== target.modified ||
            file.size !== target.size
          )
            throw Error("فایل متصل بیرون از برنامه تغییر کرده؛ حذف نشد.");
          if (
            singleFile !== target ||
            document.querySelector("#modal:not(.hidden) #wipeEditor") !== form
          )
            throw Error("عملیات حذف لغو شد.");
          assertBankSettledForSchoolWipe();
          await target.handle.remove();
          fileRemoved = true;
        }
      }
      assertBankSettledForSchoolWipe();
      const nextVersion = connection.version + 1;
      connectionRetired = true;
      ready = false;
      connection.close();
      resetConnection = await resetDatabase(nextVersion, marker);
    };
    if (deleteFile && target) {
      if (!navigator.locks?.request)
        throw Error(
          "حذف امن فایل در این مرورگر در دسترس نیست؛ اطلاعات حفظ شد.",
        );
      await navigator.locks.request("EduManager.singleFile", reset);
    } else await reset();
    committedReset = true;
    broadcast({
      type: "installation-reset",
      token: marker.value.token,
    });
    forgetInstallation();
    await completeResetCleanup(resetConnection, marker);
    installationToken = marker.value.token;
    finish();
    rememberRecordEditor();
    closeModal();
    resetScreen(
      fileRemoved
        ? "اطلاعات مدرسه و فایل متصل آن حذف شدند؛ بانک سؤال و فایل‌های دیگر باقی ماندند. برنامه دوباره باز می‌شود."
        : "اطلاعات مدرسه پاک شد؛ بانک سؤال و فایل‌های دیگر باقی ماندند. برنامه دوباره باز می‌شود.",
    );
    location.reload();
    return true;
  } catch (failure) {
    const error = fileRemoved
      ? Error("فایل متصل حذف شد. " + failure.message, { cause: failure })
      : failure;
    if (fileRemoved) {
      singleFileFailure = true;
    }
    if (committedReset) {
      forgetInstallation();
      resetScreen(
        "اطلاعات مدرسه حذف شد، اما پاک‌سازی حافظهٔ مربوط به مدرسه کامل نشد. با بارگذاری مجدد، پاک‌سازی ادامه پیدا می‌کند؛ بانک سؤال و فایل‌های دیگر تغییر نکرده‌اند. " +
          error.message,
      );
    } else if (error.resetBlocked) {
      resetScreen(
        error.message +
          " حذف معلق پس از بستن آن اتصال نیز خودکار اجرا نخواهد شد.",
      );
    } else {
      try {
        connection = await openDatabase();
        connectionRetired = false;
        const observedReset = await readRecord("records", RESET_RECORD_KEY);
        if (
          connectionRetired ||
          (observedReset?.value?.token || "") !== installationToken
        ) {
          connection.close();
          invalidateInstallation();
          return false;
        }
        ready = true;
        blocked = wasBlocked;
        showRecordEditorError(
          Error("حذف ثبت نشد؛ اطلاعات قبلی محفوظ است. " + error.message),
          "wipeError",
        );
      } catch (reopenError) {
        resetScreen(
          "حذف ثبت نشد؛ برای خواندن دوباره اطلاعات، برنامه را بارگذاری کنید. " +
            reopenError.message,
        );
      }
    }
    return false;
  } finally {
    resetConnection?.close();
    if (!committedReset) {
      resetBusy = false;
      if (
        hadFileTimer &&
        singleFile &&
        !singleFileFailure &&
        ready &&
        !blocked &&
        !connectionRetired
      )
        startSingleFile();
    }
    finish();
  }
}
