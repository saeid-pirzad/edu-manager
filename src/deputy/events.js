// Private deputy bundle fragment; assembled inside the deputy scope.

async function click(event) {
  const target = event.target.closest("[data-deputy-action],[data-deputy-tab]");
  if (!target || !host.contains(target) || state.busy || target.disabled)
    return;
  if (target.dataset.deputyTab) {
    if (
      !["receive", "files", "reports", "followups"].includes(
        target.dataset.deputyTab,
      )
    )
      return;
    state.tab = target.dataset.deputyTab;
    render(target.id || "");
    return;
  }
  const name = target.dataset.deputyAction;
  if (["auto-choose", "auto-save", "auto-stop"].includes(name)) {
    if (!automaticBackup) return;
    await automaticBackup[
      { "auto-choose": "choose", "auto-save": "save", "auto-stop": "stop" }[
        name
      ]
    ]();
  } else if (name === "about") {
    const dialog = document.getElementById("deputyAboutDialog");
    if (dialog && !dialog.open) {
      document.getElementById("deputyAboutBody").innerHTML =
        root.EduAbout.html();
      dialog.showModal();
      document.getElementById("deputyAboutBody").scrollTop = 0;
    }
  } else if (name === "open-backups") {
    state.backupOpen = true;
    render();
  } else if (name === "close-backups") {
    closeBackups();
  } else if (name === "calendar-clear") {
    if (!["from", "to"].includes(target.dataset.field)) return;
    root.closeShamsiCalendar(false);
    setReportDate(target.dataset.field, "");
    state.error = Boolean(reportDateError());
    state.status = reportDateError() || "محدودیت این تاریخ پاک شد.";
    refreshDateReport(target.dataset.field);
  } else if (name === "choose-import")
    document.getElementById("deputyImportFile").click();
  else if (name === "choose-restore")
    document.getElementById("deputyRestoreFile").click();
  else if (name === "cancel-preview") {
    state.preview = null;
    render();
  } else if (name === "cancel-restore") {
    state.restore = null;
    render();
  } else if (name === "open-stream") {
    if (!allowDiscard()) return;
    state.school = state.year = state.sender = "";
    state.streamKey = target.dataset.stream;
    state.classId = "";
    clearNote();
    state.tab = "reports";
    render();
  } else if (name === "refresh")
    await run(async () => {
      await reload();
      state.preview = null;
      state.restore = null;
      state.status = "آخرین اطلاعات کارتابل خوانده شد.";
    }, "در حال تازه‌سازی…");
  else if (name === "confirm-import") {
    const preview = state.preview;
    if (!preview) return;
    await run(async () => {
      try {
        const result = await store.commit(preview);
        if (!hasDraft() && !state.editing) state.streamKey = result.key;
        state.school = state.year = state.sender = "";
        state.preview = null;
        await reload();
        state.status =
          "اطلاعات دبیر با موفقیت دریافت شد؛ یادداشت‌های پیگیری حفظ شدند.";
      } catch (error) {
        state.preview = null;
        await reload();
        throw error;
      }
    }, "در حال ثبت اطلاعات دبیر…");
  } else if (name === "backup")
    await run(async () => {
      download(
        await store.backup(),
        "kelas-yar-deputy-backup-" +
          new Date().toISOString().slice(0, 10) +
          ".json",
      );
      state.status =
        "فایل پشتیبان کارتابل برای دانلود ارسال شد؛ ذخیره‌شدن فایل را در دستگاه بررسی کنید.";
    }, "در حال تهیهٔ پشتیبان کارتابل…");
  else if (name === "safety-backup")
    await run(async () => {
      const content = await store.lastSafetyBackup();
      if (!content)
        throw Error(
          "هنوز نسخهٔ ایمنی پیش از بازیابی وجود ندارد؛ اطلاعاتی تغییر نکرد.",
        );
      download(
        root.EduDeputyStore.validateBackup(content),
        "kelas-yar-deputy-before-restore-" +
          content.exportedAt.slice(0, 10) +
          ".json",
      );
      state.status =
        "نسخهٔ ایمنی آخرین بازیابی برای دانلود ارسال شد؛ فایل را خارج از مرورگر نگه دارید.";
    }, "در حال دریافت نسخهٔ ایمنی…");
  else if (name === "confirm-restore") {
    if (
      !state.restore ||
      !document.getElementById("deputyRestoreConsent")?.checked
    )
      return;
    const preview = state.restore;
    if (!allowDiscard()) return;
    await run(async () => {
      try {
        await store.restore(preview.value, preview.revision);
      } catch (error) {
        state.restore = null;
        throw error;
      }
      state.restore = null;
      state.preview = null;
      clearNote();
      await reload();
      state.status = "پشتیبان کارتابل بازیابی شد.";
    }, "در حال بازیابی کارتابل…");
  } else if (name === "print") {
    if (reportDateError() || state.reportTargetMissing) return;
    if (document.getElementById("deputyPrintable")?.hidden) return;
    const details = [...host.querySelectorAll(".ed-printable details")];
    const opened = details.map((node) => node.open);
    const cleanup = () => {
      details.forEach((node, i) => {
        node.open = opened[i];
      });
      document.body.classList.remove("ed-print-report");
      root.removeEventListener("afterprint", cleanup);
    };
    details.forEach((node) => {
      node.open = true;
    });
    document.body.classList.add("ed-print-report");
    root.addEventListener("afterprint", cleanup, { once: true });
    try {
      root.print();
    } catch (error) {
      cleanup();
      throw error;
    }
  } else if (name === "cancel-note") {
    if (!allowDiscard()) return;
    clearNote();
    render();
  } else if (name === "edit-note") {
    if (!allowDiscard()) return;
    const item = state.followups.find(
      (note) => note.id === target.dataset.note,
    );
    if (!item) return;
    state.editing = item;
    state.noteOrigin = item.streamKey;
    state.noteClass = item.classId;
    state.noteStudent = item.studentId;
    state.noteText = item.note;
    render("deputyNoteText");
  } else if (name === "toggle-note") {
    const item = state.followups.find(
      (note) => note.id === target.dataset.note,
    );
    if (!item) return;
    await run(async () => {
      await store.saveFollowup(
        notePayload(item, {
          status: item.status === "done" ? "open" : "done",
        }),
      );
      await reload();
      state.status = "وضعیت پیگیری ذخیره شد.";
    }, "در حال ذخیرهٔ وضعیت پیگیری…");
  }
}

async function change(event) {
  const input = event.target;
  if (state.busy) return;
  if (["deputyFrom", "deputyTo"].includes(input.id)) {
    const fieldName = input.id === "deputyFrom" ? "from" : "to";
    setReportDate(fieldName, input.value);
    state.error = Boolean(reportDateError());
    state.status = reportDateError() || "بازهٔ شمسی گزارش به‌روز شد.";
    refreshDateReport(fieldName);
    return;
  }
  const property = {
    deputySchool: "school",
    deputyYear: "year",
    deputySender: "sender",
    deputySource: "streamKey",
    deputyTerm: "term",
    deputyClass: "classId",
    deputyStudent: "studentId",
    deputyNoteClass: "noteClass",
    deputyNoteStudent: "noteStudent",
  }[input.id];
  if (property) {
    if (
      ["school", "year", "sender", "streamKey"].includes(property) &&
      !allowDiscard()
    ) {
      input.value = state[property];
      return;
    }
    state[property] = input.value;
    if (
      [
        "classId",
        "studentId",
        "streamKey",
        "school",
        "year",
        "sender",
      ].includes(property)
    )
      state.reportSourceIdentity = null;
    if (property === "classId") state.studentId = "";
    if (["streamKey", "school", "year", "sender"].includes(property)) {
      state.classId = "";
      state.studentId = "";
    }
    if (["noteClass", "noteStudent"].includes(property))
      state.noteOrigin = selected()?.key || "";
    if (["school", "year", "sender", "streamKey"].includes(property))
      clearNote();
    if (property === "noteClass") state.noteStudent = "";
    if (reportDateError()) {
      state.error = true;
      state.status = reportDateError();
    } else {
      state.error = false;
      state.status = "محدودهٔ نمایش به‌روز شد.";
    }
    render(input.id);
  } else if (input.id === "deputyImportFile") {
    const file = input.files[0];
    if (!file) return;
    state.preview = null;
    await run(
      async () => {
        const packet = await readFile(file);
        if (packet?.format !== "EduManager.DeputyExchange")
          throw Error(
            "این فایل برای ارسال به معاون نیست؛ از دبیر فایل «ارسال به معاون» را بخواهید.",
          );
        state.preview = await store.preview(packet);
        state.status =
          "فایل بررسی شد؛ نتیجه را بازبینی و دریافت را تأیید کنید.";
      },
      "در حال بررسی فایل دبیر…",
      "deputyImportPreview",
    );
  } else if (input.id === "deputyRestoreFile") {
    const file = input.files[0];
    if (!file) return;
    state.restore = null;
    await run(
      async () => {
        const value = root.EduDeputyStore.validateBackup(
          await readFile(
            file,
            root.EduDeputyStore.maxBackupBytes || FILE_LIMIT,
          ),
        );
        state.restore = { value, revision: (await store.backup()).revision };
        state.status =
          "پشتیبان خوانده شد؛ پیش از جایگزینی، اطلاعات را بررسی کنید.";
      },
      "در حال بررسی پشتیبان کارتابل…",
      "deputyRestorePreview",
    );
  } else if (input.id === "deputyRestoreConsent") {
    const button = host.querySelector('[data-deputy-action="confirm-restore"]');
    if (button) button.disabled = !input.checked;
  }
}

async function submit(event) {
  if (event.target.id !== "deputyFollowupForm") return;
  event.preventDefault();
  if (state.busy) return;
  const row = selected();
  const note = document.getElementById("deputyNoteText").value.trim();
  state.noteText = note;
  if (
    (state.editing && state.editing.streamKey !== row?.key) ||
    (state.noteOrigin && state.noteOrigin !== row?.key)
  ) {
    state.error = true;
    state.status =
      "منبع پیگیری تغییر کرده است؛ ثبت یادداشت در پروندهٔ دیگر مجاز نیست.";
    render("deputyNoteText");
    return;
  }
  if (!row || !state.noteClass || !state.noteStudent || !note) {
    state.error = true;
    state.status = "کلاس، هنرجو و متن پیگیری را تکمیل کنید.";
    render("deputyNoteText");
    return;
  }
  const payload = state.editing
    ? notePayload(state.editing, { note })
    : {
        streamKey: row.key,
        classId: state.noteClass,
        studentId: state.noteStudent,
        note,
        status: "open",
      };
  await run(async () => {
    await store.saveFollowup(payload);
    clearNote();
    await reload();
    state.status =
      "پیگیری در کارتابل معاون ذخیره شد؛ اطلاعات دبیر تغییری نکرد.";
  }, "در حال ذخیرهٔ پیگیری…");
}
