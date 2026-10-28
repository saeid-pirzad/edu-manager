async function wipeAllV24() {
  if (fileMode || !ready || connectionRetired)
    return handleError(Error("ابتدا نسخه آماده برنامه را باز کنید."));
  showModal(
    "حذف کامل اطلاعات همه دوره‌ها",
    '<form class="record-editor wipe-editor" id="wipeEditor" data-workspace-submit="confirm-wipe" aria-describedby="wipeWarning">' +
      '<section class="wipe-warning" id="wipeWarning"><span class="wipe-symbol" aria-hidden="true">' +
      EduIcons.html("trash") +
      "</span><div><h4>همه دوره‌ها از این مرورگر پاک می‌شوند</h4><p>این عملیات تمام اطلاعات ذخیره‌شده داخل برنامه را حذف می‌کند.</p></div></section>" +
      '<section class="wipe-scope" aria-label="اطلاعاتی که حذف می‌شوند"><h4>چه چیزهایی حذف می‌شوند؟</h4><ul><li>همه دوره‌ها، مدرسه‌ها، کلاس‌ها و دانش‌آموزان</li><li>نمرات، جلسات و سوابق حضور و غیاب</li><li>پیش‌نویس‌ها، توضیحات گزارش و تاریخچه تغییرات</li><li>کارنامه‌های ثابت و پشتیبان‌های داخلی</li></ul></section>' +
      '<section class="wipe-backup"><h4>اول یک نسخه مستقل نگه دارید</h4><p>برنامه نصب‌شده و فایل‌های پشتیبان بیرون برنامه باقی می‌مانند. برای نگهداری اطلاعات همه دوره‌ها، پشتیبان کامل را دریافت کنید.</p><button type="button" class="ghost wipe-export" data-workspace-action="export-full">دریافت پشتیبان کامل همه دوره‌ها</button></section>' +
      '<div class="wipe-confirmation"><label for="wipeText">برای تأیید، «حذف» را بنویسید</label><input id="wipeText" autocomplete="off" spellcheck="false" aria-describedby="wipeError" placeholder="حذف"><label class="wipe-backup-check" for="wipeBackup"><input type="checkbox" id="wipeBackup"><span>پشتیبان مستقل موردنیاز را نگه داشته‌ام.</span></label></div>' +
      '<p id="wipeError" class="entity-create-error" role="alert"></p><div class="record-editor-actions wipe-actions"><button type="button" class="ghost" data-workspace-action="close">انصراف</button><button type="submit" class="danger">حذف کامل اطلاعات</button></div></form>',
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
  if (!confirm("آخرین تأیید: همه اطلاعات این برنامه از این مرورگر حذف شوند؟"))
    return false;
  resetBusy = true;
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
    clearInterval(automaticBackupTimer);
    automaticBackupTimer = null;
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
    resetScreen("اطلاعات پاک شد؛ برنامه با اطلاعات خالی دوباره باز می‌شود.");
    location.reload();
    return true;
  } catch (error) {
    if (committedReset) {
      forgetInstallation();
      resetScreen(
        "اطلاعات بانک حذف شد، اما پاک‌سازی حافظه مرورگر کامل نشد. با بارگذاری مجدد، پاک‌سازی ادامه پیدا می‌کند و داده قدیمی وارد نخواهد شد. " +
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
        startAutomaticBackups();
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
    if (!committedReset) resetBusy = false;
    finish();
  }
}
