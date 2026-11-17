async function wipeAllV24() {
  if (fileMode || !ready || connectionRetired)
    return handleError(Error("ابتدا نسخه آماده برنامه را باز کنید."));
  showModal(
    "پاک‌سازی اطلاعات مدرسه",
    '<form class="record-editor wipe-editor" id="wipeEditor" data-workspace-submit="confirm-wipe" aria-describedby="wipeWarning">' +
      '<section class="wipe-warning" id="wipeWarning"><span class="wipe-symbol" aria-hidden="true">' +
      EduIcons.html("trash") +
      "</span><div><h4>حذف اطلاعات مدرسه از این مرورگر</h4><p>بازگردانی فقط با فایل پشتیبان مدرسه ممکن است.</p></div></section>" +
      '<section class="wipe-scope" aria-label="اطلاعاتی که حذف می‌شوند"><h4>اطلاعات مشمول حذف</h4><p>مدرسه‌ها، کلاس‌ها، هنرجویان، درس‌ها، برنامه، جلسات، حضور، نمرات، فعالیت‌ها و پیش‌نویس‌های مدرسه.</p></section>' +
      '<section class="wipe-backup" aria-label="پشتیبان پیش از حذف"><p>بانک سؤال و آزمون‌ها، فایل‌های روی دستگاه و نصب برنامه باقی می‌مانند.</p><button type="button" class="ghost wipe-export" data-workspace-action="export-full" title="دریافت پشتیبان اطلاعات مدرسه">دریافت پشتیبان</button></section>' +
      '<div class="wipe-confirmation"><label for="wipeText">برای تأیید، «حذف» را بنویسید</label><input id="wipeText" autocomplete="off" spellcheck="false" aria-describedby="wipeError" placeholder="حذف"><label class="wipe-backup-check" for="wipeBackup"><input type="checkbox" id="wipeBackup"><span>پشتیبان مستقل را نگه داشته‌ام.</span></label></div>' +
      '<p id="wipeError" class="entity-create-error" role="alert"></p><div class="record-editor-actions wipe-actions"><button type="button" class="ghost" data-workspace-action="close">انصراف</button><button type="submit" class="danger">حذف اطلاعات مدرسه</button></div></form>',
  );
}
async function confirmWipe() {
  if (resetBusy) return false;
  const form = document.querySelector("#modal:not(.hidden) #wipeEditor");
  if (!form) return false;
  if (fileMode || !ready || connectionRetired) return false;
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
      "آخرین تأیید: فقط اطلاعات مدرسه از این مرورگر حذف شود؟ بانک سؤال و فایل‌های دستگاه باقی می‌مانند.",
    )
  )
    return false;
  resetBusy = true;
  const hadFileTimer = !!singleFileTimer;
  pauseSingleFile();
  const finish = beginRecordEditorSave(form),
    wasBlocked = blocked;
  let committedReset = false,
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
    clearTimeout(draftTimer);
    if (flushing) await flushing.catch(() => {});
    if (singleFileWriting) await singleFileWriting.catch(() => {});
    await writer.catch(() => {});
    await draftWriter.catch(() => {});
    const nextVersion = connection.version + 1;
    connectionRetired = true;
    ready = false;
    connection.close();
    resetConnection = await resetDatabase(nextVersion, marker);
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
      "اطلاعات مدرسه پاک شد؛ بانک سؤال و فایل‌های دستگاه باقی ماندند. برنامه دوباره باز می‌شود.",
    );
    location.reload();
    return true;
  } catch (error) {
    if (committedReset) {
      forgetInstallation();
      resetScreen(
        "اطلاعات مدرسه حذف شد، اما پاک‌سازی حافظهٔ مربوط به مدرسه کامل نشد. با بارگذاری مجدد، پاک‌سازی ادامه پیدا می‌کند؛ بانک سؤال و فایل‌های دستگاه تغییر نکرده‌اند. " +
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
