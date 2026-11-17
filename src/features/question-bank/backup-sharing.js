(function (root) {
  "use strict";
  const D = root.EduQuestionBank,
    R = root.EduQuestionBankRepository;
  function mount(parent, { isCurrent = () => true, onClose = () => {} } = {}) {
    const el = (tag, value, className) => {
      const node = document.createElement(tag);
      if (value !== undefined) node.textContent = value;
      if (className) node.className = className;
      return node;
    };
    const panel = el("section", undefined, "qb-backup-share backup-share");
    panel.setAttribute("aria-label", "ارسال پشتیبان بانک سؤال");
    const heading = el("h4", "ارسال پشتیبان بانک سؤال");
    const info = el("div", undefined, "backup-share-file");
    info.hidden = true;
    const status = el("p", undefined, "backup-share-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const actions = el("div", undefined, "backup-share-actions");
    panel.append(heading, info, status, actions);
    parent.append(panel);
    let alive = true,
      generation = 0,
      blob = null,
      file = null,
      sharing = false;
    const current = () => alive && panel.isConnected && isCurrent();
    function message(text, state = "ready") {
      if (!current()) return;
      status.textContent = text;
      status.dataset.state = state;
    }
    function button(label, name, action) {
      const control = el("button", label, "ghost ui-button ui-button-flat");
      control.type = "button";
      control.setAttribute("data-qb-share-" + name, "");
      control.onclick = () => {
        if (!current() || control.disabled) return;
        try {
          Promise.resolve(action()).catch((error) =>
            message(error.message || String(error), "error"),
          );
        } catch (error) {
          message(error.message || String(error), "error");
        }
      };
      actions.append(control);
      return control;
    }
    const send = button("انتخاب برنامه و ارسال فایل", "send", async () => {
      if (!file || sharing) return;
      sharing = true;
      send.disabled = download.disabled = prepare.disabled = true;
      try {
        // This explicit second click invokes the share sheet before any await.
        await root.navigator.share({
          files: [file],
          title: "پشتیبان بانک سؤال و آزمون‌های کلاس‌یار",
        });
        message(
          "فایل به پنجرهٔ اشتراک‌گذاری سپرده شد؛ ارسال نهایی را در برنامهٔ مقصد بررسی کنید.",
        );
      } catch (error) {
        message(
          error.name === "AbortError"
            ? "ارسال لغو شد؛ فایل آماده است و می‌توانید دوباره تلاش کنید."
            : "ارسال انجام نشد؛ فایل را دریافت و در پیام‌رسان پیوست کنید.",
          error.name === "AbortError" ? "ready" : "error",
        );
      } finally {
        sharing = false;
        if (current()) {
          send.disabled = !file;
          download.disabled = !blob;
          prepare.disabled = false;
        }
      }
    });
    const download = button("دریافت فایل برای ارسال دستی", "download", () => {
      if (!blob || sharing) return;
      const url = URL.createObjectURL(blob);
      const link = el("a");
      link.href = url;
      link.download = "Classyar-QuestionBank.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message("دانلود درخواست شد؛ فایل JSON را در برنامهٔ مقصد پیوست کنید.");
    });
    const prepare = button("آماده‌سازی دوباره", "prepare", () => prepareFile());
    button("بستن", "close", () => {
      dispose();
      onClose();
    });
    async function prepareFile() {
      if (!current() || sharing) return;
      const token = ++generation;
      blob = file = null;
      info.hidden = true;
      send.hidden = true;
      send.disabled = download.disabled = prepare.disabled = true;
      message("در حال آماده‌سازی و بررسی فایل بانک سؤال…");
      try {
        const bank = D.validate(await R.read());
        if (!current() || token !== generation) return;
        blob = new Blob([D.size(bank)], { type: "application/json" });
        const preparedAt = new Date();
        let supported = false;
        try {
          if (typeof root.File === "function") {
            file = new root.File([blob], "Classyar-QuestionBank.txt", {
              type: "text/plain",
            });
            supported = !!(
              root.isSecureContext &&
              typeof root.navigator?.share === "function" &&
              typeof root.navigator?.canShare === "function" &&
              root.navigator.canShare({ files: [file] })
            );
          }
        } catch {
          supported = false;
        }
        if (!supported) file = null;
        const name = el("bdi", file?.name || "Classyar-QuestionBank.json");
        name.dir = "ltr";
        const time = el(
          "time",
          preparedAt.toLocaleString("fa-IR-u-ca-persian"),
        );
        time.dateTime = preparedAt.toISOString();
        info.replaceChildren(name, el("span", "زمان تهیهٔ فایل: "), time);
        info.hidden = false;
        send.hidden = !supported;
        send.disabled = !supported;
        download.disabled = prepare.disabled = false;
        message(
          supported
            ? "فقط اطلاعات ثبت‌شدهٔ بانک سؤال ارسال می‌شود؛ گیرنده را خودتان انتخاب کنید. فایل TXT هم قابل بازیابی است."
            : "ارسال مستقیم فایل در این مرورگر در دسترس نیست؛ فایل را دریافت و در پیام‌رسان پیوست کنید.",
        );
      } catch (error) {
        if (current() && token === generation) {
          blob = file = null;
          prepare.disabled = false;
          message("آماده‌سازی انجام نشد: " + error.message, "error");
        }
      }
    }
    function invalidate() {
      if (!current()) return;
      generation++;
      blob = file = null;
      send.disabled = download.disabled = true;
      prepare.disabled = sharing;
      info.hidden = true;
      message(
        "اطلاعات بانک سؤال تغییر کرده است؛ فایل را دوباره آماده کنید.",
        "error",
      );
    }
    function dispose() {
      if (!alive) return;
      alive = false;
      generation++;
      blob = file = null;
      root.removeEventListener("edu-question-bank-saved", invalidate);
      panel.remove();
    }
    root.addEventListener("edu-question-bank-saved", invalidate);
    void prepareFile();
    return dispose;
  }
  root.EduQuestionBankBackupShare = { mount };
})(globalThis);
