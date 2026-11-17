(function (root) {
  "use strict";
  const D = root.EduQuestionBank,
    R = root.EduQuestionBankRepository,
    F = root.EduQuestionBankFileBackup.service;
  const el = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  const number = (value) => new Intl.NumberFormat("fa-IR").format(value);
  function mount(parent, { isCurrent = () => true } = {}) {
    const section = el("section", undefined, "qb-backup");
    const message = el("p", undefined, "qb-backup-message");
    message.hidden = true;
    message.setAttribute("role", "status");
    const contents = el("div", undefined, "qb-backup-content");
    section.append(message, contents);
    parent.append(section);
    let disposed = false,
      busy = false,
      generation = 0,
      disposeShare = () => {},
      confirmation = null,
      cancelConfirmation = () => {};
    const current = () =>
      !disposed && section.isConnected && Boolean(isCurrent());
    const editorPending = () =>
      Boolean(root.EduQuestionBankUI?.hasPendingChanges?.());
    function assertRestoreAllowed() {
      if (!current()) throw Error("بخش پشتیبان بسته شده؛ عملیات انجام نشد.");
      if (editorPending())
        throw Error(
          "در بانک سؤال ویرایش ذخیره‌نشده یا عملیات در حال انجام دارید؛ ابتدا آن را بررسی و ذخیره کنید. عملیات انجام نشد.",
        );
    }
    function show(text, failed = false) {
      if (!current()) return;
      message.hidden = !text;
      message.textContent = text;
      message.dataset.state = failed ? "error" : "success";
      message.setAttribute("role", failed ? "alert" : "status");
    }
    const error = (failure) => show(failure.message || String(failure), true);
    function button(label, tone, icon, action, host) {
      const control = el("button");
      control.type = "button";
      control.className = "ghost ui-button ui-button-flat";
      control.dataset.uiTone = tone;
      if (icon)
        control.insertAdjacentHTML("afterbegin", root.EduIcons.html(icon));
      control.append(el("span", label, "ui-button-label"));
      control.onclick = () => {
        if (!current() || busy || confirmation) return;
        try {
          void Promise.resolve(action()).catch(error);
        } catch (failure) {
          error(failure);
        }
      };
      host.append(control);
      return control;
    }
    function confirm(label, action, { clear = false } = {}) {
      if (!current() || busy || confirmation) return Promise.resolve(false);
      return new Promise((resolve) => {
        const previous = document.activeElement;
        const box = el(
          clear ? "form" : "section",
          undefined,
          "qb-backup-confirm",
        );
        box.setAttribute("role", "region");
        box.setAttribute("aria-label", label);
        box.append(
          el("h4", clear ? "حذف اطلاعات بانک سؤال" : "تأیید عملیات"),
          el("p", label),
        );
        let clearText, clearBackup, clearError;
        if (clear) {
          const fields = el("div", undefined, "qb-backup-clear-fields");
          const textLabel = el("label", "برای تأیید، «حذف» را بنویسید");
          clearText = el("input");
          clearText.type = "text";
          clearText.autocomplete = "off";
          clearText.spellcheck = false;
          clearText.placeholder = "حذف";
          clearText.setAttribute("data-qb-clear-text", "");
          textLabel.append(clearText);
          const backupLabel = el("label", undefined, "qb-backup-clear-check");
          clearBackup = el("input");
          clearBackup.type = "checkbox";
          clearBackup.setAttribute("data-qb-clear-backup", "");
          backupLabel.append(
            clearBackup,
            el("span", "پشتیبان مستقل بانک سؤال را نگه داشته‌ام."),
          );
          clearError = el("p", undefined, "qb-backup-confirm-error");
          clearError.setAttribute("role", "alert");
          clearError.hidden = true;
          fields.append(textLabel, backupLabel, clearError);
          box.append(fields);
        }
        const actions = el("div", undefined, "qb-backup-confirm-actions");
        box.append(actions);
        const close = (accepted = false) => {
          if (confirmation !== box) return;
          confirmation = null;
          cancelConfirmation = () => {};
          box.remove();
          contents.inert = false;
          if (current() && previous?.isConnected)
            previous.focus({ preventScroll: true });
          resolve(accepted && current());
        };
        const cancel = el("button", "انصراف");
        cancel.type = "button";
        cancel.className = "ghost ui-button ui-button-flat";
        cancel.onclick = () => close();
        const accept = el("button", clear ? "حذف اطلاعات بانک سؤال" : "تأیید");
        accept.type = clear ? "submit" : "button";
        accept.className = "ui-button ui-button-flat";
        accept.dataset.uiTone = "danger";
        if (clear)
          box.onsubmit = (event) => {
            event.preventDefault();
            if (clearText.value !== "حذف" || !clearBackup.checked) {
              clearError.hidden = false;
              clearError.textContent =
                "متن «حذف» و تأیید نگهداری پشتیبان را تکمیل کنید.";
              (!clearText.value || clearText.value !== "حذف"
                ? clearText
                : clearBackup
              ).focus();
              return;
            }
            close(true);
          };
        else accept.onclick = () => close(true);
        actions.append(cancel, accept);
        box.addEventListener("keydown", (event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          close();
        });
        confirmation = box;
        cancelConfirmation = close;
        contents.inert = true;
        section.prepend(box);
        cancel.focus({ preventScroll: true });
      }).then(async (accepted) => {
        if (!accepted || !current()) return false;
        return action ? action() : true;
      });
    }
    const manual = el("section", undefined, "backup-manual qb-backup-manual");
    manual.append(
      el("h4", "فایل بانک سؤال و آزمون‌ها"),
      el("p", "درس‌ها، سؤال‌ها و آزمون‌ها؛ مستقل از اطلاعات مدرسه.", "qb-help"),
    );
    const manualActions = el("div", undefined, "backup-action-grid");
    manual.append(manualActions);
    contents.append(manual);
    const download = button(
      "دریافت فایل",
      "download",
      "download",
      async () => {
        assertRestoreAllowed();
        const bank = D.validate(await R.read());
        if (!current()) return;
        const url = URL.createObjectURL(
          new Blob([D.size(bank)], { type: "application/json" }),
        );
        const link = el("a");
        link.href = url;
        link.download = F.suggestedName();
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      manualActions,
    );
    download.classList.remove("ghost");
    download.classList.add("qb-backup-download");
    const share = button(
      "ارسال فایل",
      "share",
      "share",
      () => {
        assertRestoreAllowed();
        disposeShare();
        disposeShare = root.EduQuestionBankBackupShare.mount(contents, {
          isCurrent: current,
          onClose: () => share.focus({ preventScroll: true }),
        });
        const panel = contents.querySelector(".qb-backup-share");
        manual.after(panel);
      },
      manualActions,
    );
    share.classList.add("backup-share-entry", "qb-backup-share-entry");
    const uploadLabel = el("label", "بازیابی بانک از JSON", "course-field");
    const upload = el("input");
    upload.type = "file";
    upload.accept = ".json,.txt,application/json,text/plain";
    uploadLabel.hidden = true;
    uploadLabel.append(upload);
    manual.append(uploadLabel);
    const restore = button(
      "بازیابی فایل",
      "create",
      "folder",
      () => {
        assertRestoreAllowed();
        disposeShare();
        upload.click();
      },
      manualActions,
    );
    restore.classList.add("qb-backup-restore");
    upload.onchange = async () => {
      const token = ++generation;
      try {
        assertRestoreAllowed();
        const file = upload.files[0];
        if (!file) return;
        root.EduQuestionBankFileBackup.assertFileName(file.name, {
          allowText: true,
        });
        if (file.size > D.LIMIT) throw Error("سقف فایل ورودی ۲۰ مگابایت است.");
        const incoming = D.parse(await file.text());
        if (!current() || token !== generation) return;
        const baseline = D.validate(await R.read());
        if (!current() || token !== generation) return;
        assertRestoreAllowed();
        void confirm(
          `فایل «${file.name}»: ${number(incoming.courses.length)} درس، ${number(incoming.questions.length)} سؤال و ${number(incoming.exams.length)} آزمون. تمام بانک سؤال فعلی جایگزین می‌شود؛ اطلاعات مدرسه تغییر نمی‌کند. ادامه؟`,
          async () => {
            assertRestoreAllowed();
            if (token !== generation) return false;
            busy = true;
            contents.inert = true;
            section.setAttribute("aria-busy", "true");
            try {
              const before = D.validate(await R.read());
              assertRestoreAllowed();
              if (before.revision !== baseline.revision)
                throw Error(
                  "بانک پس از پیش‌نمایش تغییر کرده؛ فایل را دوباره بررسی کنید.",
                );
              await F.suspend();
              assertRestoreAllowed();
              if (token !== generation) return false;
              await R.save(incoming, baseline.revision, {
                isCurrent: () =>
                  current() && token === generation && !editorPending(),
              });
              root.dispatchEvent(new Event("edu-question-bank-restored"));
              show(
                "بانک سؤال و آزمون‌ها بازیابی شد؛ اطلاعات مدرسه تغییر نکرد.",
              );
              return true;
            } finally {
              busy = false;
              contents.inert = false;
              section.removeAttribute("aria-busy");
              paint(F.state());
            }
          },
        ).catch(error);
      } catch (failure) {
        error(failure);
      } finally {
        upload.value = "";
      }
    };
    const view = root.EduBackupAutomaticView;
    const viewOptions = (state = F.state()) => {
      const attention = ["permission", "paused", "error"].includes(state.state);
      const message =
        state.state === "inactive" &&
        state.message === "ذخیرهٔ خودکار فایل فعال نیست."
          ? "ذخیره خودکار در فایل هنوز فعال نیست."
          : state.state === "inactive" &&
              state.message === "اتصال قطع شد؛ فایل موجود حذف نشده است."
            ? "اتصال متوقف شد؛ فایل موجود حذف نشده است."
            : state.message;
      return {
        supported: F.supported(),
        purpose: "بانک سؤال و آزمون‌ها",
        name: state.connected ? state.name : "",
        savedAt: state.savedAt,
        needsReview: attention,
        message,
        open: attention,
        noticeHidden: state.state === "active",
        fallback: attention,
        ids: {
          summary: "questionBankFileSummary",
          status: "questionBankFileStatus",
          fallback: "questionBankFileFallback",
        },
        aliases: {
          summary: "qb-file-summary",
          status: "qb-file-status",
          actions: "qb-file-actions",
          choose: "qb-file-choose",
          save: "qb-file-save",
          stop: "qb-file-stop",
        },
        className: "qb-backup-automatic",
        permission:
          state.connected && state.state === "permission" && F.supported()
            ? {
                attributes: { "data-qb-file-permission": "" },
                ariaLabel:
                  "اجازه مجدد برای فایل بانک سؤال و آزمون‌ها: " + state.name,
              }
            : null,
      };
    };
    const template = document.createElement("template");
    template.innerHTML = view.html(viewOptions());
    const automatic = template.content.firstElementChild;
    const summary = automatic.querySelector("#questionBankFileSummary");
    const status = automatic.querySelector("#questionBankFileStatus");
    const fallback = automatic.querySelector("#questionBankFileFallback");
    status.classList.add("qb-file-status");
    const choose = automatic.querySelector(
      '[data-backup-file-action="choose"]',
    );
    const save = automatic.querySelector('[data-backup-file-action="save"]');
    const stop = automatic.querySelector('[data-backup-file-action="stop"]');
    contents.append(automatic);
    function bindAutomatic(control, action) {
      control.onclick = () => {
        if (!current() || busy || confirmation || control.disabled) return;
        try {
          void Promise.resolve(action()).catch(error);
        } catch (failure) {
          error(failure);
        }
      };
    }
    bindAutomatic(choose, () => F.choose());
    bindAutomatic(save, () => {
      if (!F.state().connected) throw Error("ابتدا فایل JSON را انتخاب کنید.");
      return F.saveNow((name, counts) => {
        if (!current()) return false;
        return confirm(
          `فایل «${name}» با ${number(counts.questions)} سؤال و ${number(counts.exams)} آزمون فعلی جایگزین شود؟ نسخهٔ قبلی این فایل از بین می‌رود؛ اگر لازم است ابتدا یک کپی نگه دارید.`,
        ).then((accepted) => Boolean(accepted && current()));
      });
    });
    bindAutomatic(stop, () => F.stop());
    const reset = el("details", undefined, "backup-reset qb-backup-reset");
    reset.append(
      el("summary", "پاک‌سازی اطلاعات"),
      el(
        "p",
        "فقط درس‌ها، سؤال‌ها و آزمون‌های بانک سؤال در این مرورگر حذف می‌شوند؛ اطلاعات مدرسه و فایل‌های دستگاه باقی می‌مانند.",
      ),
    );
    const clear = button(
      "بررسی و تأیید پاک‌سازی",
      "danger",
      "trash",
      async () => {
        assertRestoreAllowed();
        disposeShare();
        const token = ++generation;
        const baseline = D.validate(await R.read());
        if (!current() || token !== generation) return;
        assertRestoreAllowed();
        await confirm(
          "تمام درس‌ها، بخش‌ها، سؤال‌ها و آزمون‌های بانک سؤال از این مرورگر پاک و اتصال فایل خودکار قطع می‌شود. اطلاعات مدرسه و فایل‌های قبلی روی دستگاه تغییر نمی‌کنند. بازگردانی فقط با فایل پشتیبان بانک سؤال ممکن است.",
          async () => {
            assertRestoreAllowed();
            if (token !== generation) return false;
            busy = true;
            contents.inert = true;
            section.setAttribute("aria-busy", "true");
            try {
              await F.clear(baseline.revision, {
                isCurrent: () =>
                  current() && token === generation && !editorPending(),
              });
              root.dispatchEvent(new Event("edu-question-bank-restored"));
              show(
                "اطلاعات بانک سؤال پاک و اتصال خودکار قطع شد؛ اطلاعات مدرسه و فایل‌های دستگاه تغییر نکردند.",
              );
              return true;
            } finally {
              busy = false;
              contents.inert = false;
              section.removeAttribute("aria-busy");
              paint(F.state());
            }
          },
          { clear: true },
        );
      },
      reset,
    );
    clear.classList.add("danger", "qb-backup-clear-entry");
    contents.append(reset);
    let previousState;
    function paint(state) {
      if (disposed) return;
      // Normal use stays compact; a newly reported file issue is never hidden.
      if (
        state.state !== previousState &&
        ["permission", "paused", "error"].includes(state.state)
      )
        automatic.open = true;
      previousState = state.state;
      const options = viewOptions(state);
      summary.innerHTML = view.summaryHtml(options);
      summary.querySelector("bdi")?.classList.add("qb-file-name");
      if (options.supported) {
        status.innerHTML = view.noticeHtml(options);
        status.hidden = options.noticeHidden;
        const permission = status.querySelector("[data-qb-file-permission]");
        if (permission) bindAutomatic(permission, () => F.saveNow());
      }
      status.dataset.state = state.state;
      if (fallback) fallback.hidden = !options.fallback;
      download.disabled =
        share.disabled =
        restore.disabled =
        clear.disabled =
          busy;
      choose.disabled = save.disabled = stop.disabled = busy || !F.supported();
    }
    const unsubscribe = F.subscribe(paint);
    F.init().catch(error);
    return () => {
      if (disposed) return;
      disposed = true;
      generation++;
      disposeShare();
      cancelConfirmation();
      unsubscribe();
      section.remove();
    };
  }
  root.EduQuestionBankBackupUI = { mount };
})(globalThis);
